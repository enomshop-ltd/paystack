import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import Paystack from "../lib/paystack";
import { captureOrderPaymentWorkflow } from "@medusajs/core-flows";

// Helper to prevent hitting Paystack rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function syncPaystackPayments(container: MedusaContainer) {
  const logger = container.resolve("logger");
  // 1. Resolve the query tool
  const query = container.resolve("query");

  logger.info("Starting Paystack payment sync...");

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const { data: payments } = await query.graph({
      entity: "payment",
      fields: [
        "id", 
        "amount", 
        "currency_code", 
        "data", 
        "created_at"
      ],
      filters: {
        // 1. Only Paystack payments
        payment_session: {
          provider_id: "pp_paystack",
        },
        // 2. Must be uncaptured (null)
        captured_at: null,
        // 3. Must not be canceled (null)
        canceled_at: null,
        // 4. Must be older than 15 minutes ($lt = Less Than)
        created_at: {
          $lt: fifteenMinutesAgo,
        },
      },
    });
    
    const pendingPayments = payments.filter(
      (p) => 
        !p.captured_at && 
        !p.canceled_at && 
        p.created_at && new Date(p.created_at as any) < fifteenMinutesAgo
    );

    if (pendingPayments.length === 0) {
      logger.info("No stale pending Paystack payments found.");
      return;
    }

    logger.info(`Found ${pendingPayments.length} stale payments to verify.`);

    // Initialize Paystack client
    const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY as string);

    for (const payment of pendingPayments) {
      try {
        // Note: query.graph returns 'data' as part of the payment object
        const txRef = (payment.data as any)?.paystackTxRef as string;
        if (!txRef) continue;

        // 3. Verify transaction status with Paystack
        const { data, status } = await paystack.transaction.verify(txRef);

        if (status && data.status === "success") {
          logger.info(`Capturing payment ${payment.id} from Paystack sync`);
          
          // 4. Capture the payment in Medusa
          await captureOrderPaymentWorkflow(container).run({
            input: {
              payment_id: payment.id,
            }
          });
        } else if (status && (data.status === "failed" || data.status === "abandoned")) {
          logger.info(`Canceling failed/abandoned payment ${payment.id} from Paystack sync`);
        }

        // 5. Sleep for 200ms to respect Paystack API rate limits
        await sleep(200);

      } catch (error) {
        logger.error(`Error syncing Paystack payment ${payment.id}:`, error);
      }
    }
  } catch (error) {
    logger.error("Error running Paystack payment sync job:", error);
  }
}

export const config = {
  name: "sync-paystack-payments",
  schedule: "*/5 * * * *", 
};