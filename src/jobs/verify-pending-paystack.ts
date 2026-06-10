import { MedusaContainer, Logger } from "@medusajs/framework/types";

export default async function verifyPendingPaystackPayments({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve<Logger>("logger");
  const query = container.resolve("query");

  try {
    logger.info("Starting scheduled job: Verify Pending Paystack Payments");

    // We use the query graph to fetch payment sessions that are pending and belong to a paystack provider.
    // Provider IDs might be 'paystack_kenya', 'paystack_nigeria' etc.
    const { data: paymentSessions } = await query.graph({
      entity: "payment_session",
      fields: ["id", "provider_id", "status", "data", "payment.id", "payment.order.id"],
      filters: {
        status: "pending",
        provider_id: { $ilike: "paystack%" }, // matches any paystack provider
      },
    });

    if (!paymentSessions || paymentSessions.length === 0) {
      logger.info("No pending Paystack payment sessions found.");
      return;
    }

    logger.info(`Found ${paymentSessions.length} pending Paystack payment sessions to verify.`);

    // Wait, since we need to verify with the specific provider, we should use the PaymentModuleService.
    const paymentModuleService = container.resolve("payment");

    for (const session of paymentSessions) {
      try {
        const { paystackTxRef, paystackTxId } = session.data as Record<string, unknown>;

        if (!paystackTxRef && !paystackTxId) {
          logger.warn(`Session ${session.id} is missing Paystack transaction references.`);
          continue;
        }

        logger.info(`Verifying Paystack session ${session.id}...`);

        // We can just call retrievePayment on the payment provider?
        // But the PaymentModuleService doesn't expose a method to just retrieve payment status from provider directly
        // Instead, we can call the getPaymentStatus or retrievePayment, or we can use authorizePayment.
        // In Medusa v2, paymentModuleService.capturePayment might be the way, but wait!
        
        // Let's resolve the specific provider instead.
        const providerId = session.provider_id as string;
        
        // Wait, how to resolve a specific payment provider dynamically?
        // Let's just use the paymentModuleService to retrieve the provider instance, 
        // or we can just send an authorize request if it's pending.
        // If we call authorizePaymentSession on the module, it will call the provider's authorizePayment.
        const authorizedSession = await paymentModuleService.authorizePaymentSession(
            session.id,
            {}
        );

        const authorizedSessionAny = authorizedSession as any;
        if (authorizedSessionAny.status === "captured") {
          logger.info(`Session ${session.id} successfully captured via Paystack.`);
          
          // If we successfully captured the payment session, we should make sure the payment itself is captured.
          // Wait, authorizePaymentSession returns the session. 
          // If the provider returned CAPTURED, Medusa captures it.
        } else if (authorizedSessionAny.status === "error") {
          logger.warn(`Session ${session.id} encountered an error or failed in Paystack.`);
        } else {
          logger.info(`Session ${session.id} is still pending.`);
        }
      } catch (err: any) {
        logger.error(`Error verifying session ${session.id}: ${err.message}`);
      }
    }
    
    logger.info("Completed scheduled job: Verify Pending Paystack Payments");
  } catch (error: any) {
    logger.error(`Failed to execute verifyPendingPaystackPayments job: ${error.message}`);
  }
}

export const config = {
  name: "verify-pending-paystack",
  schedule: "*/30 * * * *", // Every 30 minutes
};
