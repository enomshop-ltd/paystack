import { MedusaContainer } from "@medusajs/framework/types";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import Paystack from "../lib/paystack";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function syncPaystackPayments(container: MedusaContainer) {
  const logger = container.resolve("logger");
  const query = container.resolve("query");
  const paymentModule = container.resolve(Modules.PAYMENT);

  logger.info("Starting Paystack payment sync...");

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY as string);

    // --- Part 1: Sync pending payment sessions (authorized but not yet captured as Payment) ---
    // These are sessions created for partial payments that Paystack confirmed but the
    // webhook never fired (e.g., no session_id in metadata at the time).
    try {
      const { data: sessions } = await query.graph({
        entity: "payment_session",
        fields: ["id", "data", "status", "created_at"],
        filters: {
          provider_id: "pp_paystack",
          status: "pending",
        },
      });

      const staleSessions = (sessions || []).filter(
        (s: any) =>
          s.created_at && new Date(s.created_at as any) < fifteenMinutesAgo
      );

      if (staleSessions.length > 0) {
        logger.info(
          `Paystack sync: Found ${staleSessions.length} stale pending payment sessions to verify.`
        );
      }

      for (const session of staleSessions) {
        try {
          const txRef = (session.data as any)?.paystackTxRef as string;
          if (!txRef) continue;

          const { data, status } = await paystack.transaction.verify(txRef);
          await sleep(200);

          if (status && data.status === "success") {
            logger.info(
              `Paystack sync: Authorizing stale session ${session.id} (ref: ${txRef})`
            );
            try {
              await paymentModule.authorizePaymentSession(session.id, {});
              logger.info(
                `Paystack sync: Session ${session.id} authorized successfully`
              );
            } catch (authError: any) {
              logger.error(
                `Paystack sync: Failed to authorize session ${session.id}: ${authError?.message}`
              );
            }
          }
        } catch (error: any) {
          logger.error(
            `Paystack sync: Error processing session ${session.id}: ${error?.message}`
          );
        }
      }
    } catch (sessionError: any) {
      logger.error(
        `Paystack sync: Error querying pending sessions: ${sessionError?.message}`
      );
    }

    // --- Part 2: Sync authorized payments not yet captured ---
    // These are payments that were authorized (Payment record exists) but
    // capturePayment was never called.
    try {
      const { data: payments } = await query.graph({
        entity: "payment",
        fields: ["id", "amount", "currency_code", "data", "created_at", "captured_at", "canceled_at"],
        filters: {
          captured_at: null,
          canceled_at: null,
          created_at: {
            $lt: fifteenMinutesAgo,
          },
        },
      });

      const pendingPayments = (payments || []).filter(
        (p: any) =>
          !p.captured_at &&
          !p.canceled_at &&
          (p.data as any)?.paystackTxRef
      );

      if (pendingPayments.length > 0) {
        logger.info(
          `Paystack sync: Found ${pendingPayments.length} pending payments to verify.`
        );
      }

      for (const payment of pendingPayments) {
        try {
          const txRef = (payment.data as any)?.paystackTxRef as string;
          if (!txRef) continue;

          const { data, status } = await paystack.transaction.verify(txRef);
          await sleep(200);

          if (status && data.status === "success") {
            logger.info(
              `Paystack sync: Capturing payment ${payment.id} (ref: ${txRef})`
            );
            await capturePaymentWorkflow(container).run({
              input: { payment_id: payment.id },
            });
            logger.info(
              `Paystack sync: Payment ${payment.id} captured successfully`
            );
          } else if (
            status &&
            (data.status === "failed" || data.status === "abandoned")
          ) {
            logger.info(
              `Paystack sync: Skipping failed/abandoned payment ${payment.id}`
            );
          }
        } catch (error: any) {
          logger.error(
            `Paystack sync: Error syncing payment ${payment.id}: ${error?.message}`
          );
        }
      }
    } catch (paymentError: any) {
      logger.error(
        `Paystack sync: Error querying pending payments: ${paymentError?.message}`
      );
    }

    logger.info("Paystack payment sync complete.");
  } catch (error: any) {
    logger.error("Error running Paystack payment sync job:", error);
  }
}

export const config = {
  name: "sync-paystack-payments",
  schedule: "*/15 * * * *",
};
