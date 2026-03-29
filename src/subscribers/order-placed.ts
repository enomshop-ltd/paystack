import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const orderModuleService = container.resolve(Modules.ORDER);

  // Retrieve the order and its payment collections
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: ["payment_collections", "payment_collections.payments"],
  });

  const pc = order.payment_collections?.[0];
  if (!pc) return;

  // Auto-capture the payment if it is Paystack and hasn't been captured yet
  for (const payment of pc.payments || []) {
    if (payment.provider_id === "paystack" || payment.provider_id === "pp_paystack") {
      if (!payment.captured_at) {
        try {
          await paymentModuleService.capturePayment({
            payment_id: payment.id,
            amount: payment.amount,
          });
          container.resolve("logger").info(`Successfully auto-captured Paystack payment for Order ${orderId}`);
        } catch (err) {
          container.resolve("logger").error(`Failed to auto-capture Paystack payment ${payment.id}:`, err);
        }
      }
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};