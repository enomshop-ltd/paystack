import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { createOrderFulfillmentWorkflow, capturePaymentWorkflow } from "@medusajs/core-flows";

export default async function PaystackOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;
  
  const query = container.resolve("query");
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const logger = container.resolve("logger");
  
  // 1. Fetch Order with connected payments and items using Query
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
  if (!order) return;

  const pc = order.payment_collections?.[0];
  if (!pc) return;
  
  // 2. Process the Payments
  let isPaystackPayment = false;
  let capturedAmount = 0;

  for (const payment of pc.payments ||[]) {
    if (payment.provider_id === "paystack" || payment.provider_id === "pp_paystack") {
      isPaystackPayment = true;
      capturedAmount = Number(payment.amount);

      if (!payment.captured_at) {
        try {
          // 2. Replace paymentModuleService.capturePayment with the Workflow
          await capturePaymentWorkflow(container).run({
            input: {
              payment_id: payment.id,
              amount: Number(payment.amount),
            }
          });
          
          logger.info(`[Paystack] Successfully auto-captured payment for Order ${orderId}`);
        } catch (err) {
          logger.error(`[Paystack] Failed to auto-capture payment ${payment.id}:`, err);
          return;
        }
      }
    }
  }

  // Only proceed with fulfillment and email if this was a Paystack order
  if (!isPaystackPayment) return;

  // 3. Verifying Amount
  if (capturedAmount !== Number(order.total)) {
    logger.warn(`[Paystack] Amount mismatch for Order ${orderId}. Total: ${order.total}, Captured: ${capturedAmount}`);
    // You might want to flag the order here for manual review
  }

  // 4. Trigger Automatic Fulfillment
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
    logger.info(`[Paystack] Auto-fulfilled Order ${orderId}`);
  } catch (err) {
    logger.error(`[Paystack] Failed to auto-fulfill Order ${orderId}`, err);
  }

  // 5. Send Payment Confirmation Email
  const notificationModule = container.resolve(Modules.NOTIFICATION);
  if (notificationModule) {
    try {
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
      logger.info(`[Paystack] Payment confirmation email sent to ${order.email}`);
    } catch (err) {
      logger.error(`[Paystack] Failed to send email for Order ${orderId}`, err);
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};