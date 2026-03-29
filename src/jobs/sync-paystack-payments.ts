import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import Paystack from "../lib/paystack";
import { capturePaymentWorkflow } from "@medusajs/core-flows";

// Helper to prevent hitting Paystack rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function syncPaystackPayments(container: MedusaContainer) {
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const logger = container.resolve("logger");

  logger.info("Starting Paystack payment sync...");

  try {
  // @ts-ignore
  const payments = await paymentModuleService.listPayments({
    id: "pp_paystack",
  });

    // 2. Filter for pending payments that are OLDER than 15 minutes
    // This prevents race conditions with incoming webhooks
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    
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
        const txRef = payment.data?.paystackTxRef as string;
        if (!txRef) continue;

        // 3. Verify transaction status with Paystack
        const { data, status } = await paystack.transaction.verify(txRef);

        if (status && data.status === "success") {
          logger.info(`Capturing payment ${payment.id} from Paystack sync`);
          
          // 4. Capture the payment in Medusa
          await capturePaymentWorkflow(container).run({
            input: {
              payment_id: payment.id,
              amount: Number(payment.amount),
            }
          });
        } else if (status && (data.status === "failed" || data.status === "abandoned")) {
          logger.info(`Canceling failed/abandoned payment ${payment.id} from Paystack sync`);
          // Optional: You can cancel the payment in Medusa to clean up the database
          // await paymentModuleService.cancelPayment(payment.id);
        }

        // 5. Sleep for 200ms to respect Paystack API rate limits (approx 5 req/sec)
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
  schedule: "*/15 * * * *", // Runs every 15 minutes
};
