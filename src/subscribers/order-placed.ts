import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { createOrderFulfillmentWorkflow, capturePaymentWorkflow } from "@medusajs/core-flows";

export default async function PaystackOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;
  const query = container.resolve("query");
  const logger = container.resolve("logger");
  
  logger.info(`[Paystack] Order placed handler triggered for order: ${orderId}`);

  try {
    logger.info(`[Paystack] Fetching order details for order: ${orderId}`);
    const { data: orders } = await query.graph({
      entity: "order",
      fields:[
        "id",
        "email",
        "currency_code",
        "total",
        "items.*",
        "payment_collections.payments.*"
      ],
      filters: { id: orderId }
    });

    const order = orders[0];
    if (!order) {
      logger.warn(`[Paystack] Order not found for id: ${orderId}`);
      return;
    }
    if (!order.payment_collections?.[0]) {
      logger.warn(`[Paystack] No payment collections found for order: ${orderId}`);
      return;
    }
    
    let isPaystackPayment = false;
    let capturedAmount = 0;

    logger.info(`[Paystack] Checking payments for order: ${orderId}`);
    for (const payment of order.payment_collections[0].payments ||[]) {
      if (payment.provider_id === "pp_paystack") {
        isPaystackPayment = true;
        logger.info(`[Paystack] Found Paystack payment: ${payment.id} with amount: ${payment.amount}`);

        if (!payment.captured_at) {
          logger.info(`[Paystack] Payment ${payment.id} not yet captured. Initiating capture workflow.`);
          try {
            await capturePaymentWorkflow(container).run({
              input: {
                payment_id: payment.id,
              }
            });
            logger.info(`[Paystack] Successfully auto-captured payment ${payment.id} for Order ${orderId}`);
            capturedAmount += Number(payment.amount);
          } catch (err: any) {
            logger.error(`[Paystack] Failed to auto-capture payment ${payment.id}:`, err);
            return;
          }
        } else {
          logger.info(`[Paystack] Payment ${payment.id} is already captured.`);
          capturedAmount += Number(payment.amount);
        }
        
        logger.info(`[Paystack] Total captured so far: ${capturedAmount}`);
      }
    }

    if (!isPaystackPayment) {
      logger.info(`[Paystack] Order ${orderId} does not use Paystack. Skipping Paystack specific logic.`);
      return;
    }

    if (capturedAmount !== Number(order.total)) {
      logger.warn(`[Paystack] Amount mismatch for Order ${orderId}. Total: ${order.total}, Captured: ${capturedAmount}. Skipping auto-fulfillment.`);
      return;
    } else {
      logger.info(`[Paystack] Amount verified for Order ${orderId}. Total matches captured amount: ${capturedAmount}`);
    }

    logger.info(`[Paystack] Initiating auto-fulfillment for Order ${orderId}`);
    try {
      await createOrderFulfillmentWorkflow(container).run({
        input: {
          order_id: order.id,
          items: order.items.map((i: any) => ({
            id: i.id,
            quantity: i.quantity,
          })),
        },
        throwOnError: false,
      });
      logger.info(`[Paystack] Successfully auto-fulfilled Order ${orderId}`);
    } catch (err: any) {
      logger.error(`[Paystack] Failed to auto-fulfill Order ${orderId}`, err);
    }

    logger.info(`[Paystack] Checking for notification module to send confirmation email for Order ${orderId}`);
    const notificationModule = container.resolve(Modules.NOTIFICATION);
    if (notificationModule) {
      try {
        logger.info(`[Paystack] Sending payment confirmation email to ${order.email}`);
        await notificationModule.createNotifications([{
          to: order.email,
          channel: "email",
          template: "paystack-payment-success",
          data: {
            order_id: order.id,
            amount: capturedAmount,
            currency: order.currency_code,
          }
        }]);
        logger.info(`[Paystack] Payment confirmation email successfully sent to ${order.email}`);
      } catch (err: any) {
        logger.error(`[Paystack] Failed to send email for Order ${orderId}`, err);
      }
    } else {
      logger.warn(`[Paystack] Notification module not found. Skipping email for Order ${orderId}`);
    }
  } catch (error: any) {
    logger.error(`[Paystack] Unexpected error in order placed handler for Order ${orderId}`, error);
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};