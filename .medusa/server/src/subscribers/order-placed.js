"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = PaystackOrderPlacedHandler;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/core-flows");
async function PaystackOrderPlacedHandler({ event: { data }, container, }) {
    const orderId = data.id;
    const query = container.resolve("query");
    const paymentModuleService = container.resolve(utils_1.Modules.PAYMENT);
    const logger = container.resolve("logger");
    // 1. Fetch Order with connected payments and items using Query
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
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
    if (!order)
        return;
    const pc = order.payment_collections?.[0];
    if (!pc)
        return;
    // 2. Process the Payments
    let isPaystackPayment = false;
    let capturedAmount = 0;
    for (const payment of pc.payments || []) {
        if (payment.provider_id === "paystack" || payment.provider_id === "pp_paystack") {
            isPaystackPayment = true;
            capturedAmount = Number(payment.amount);
            if (!payment.captured_at) {
                try {
                    // 2. Replace paymentModuleService.capturePayment with the Workflow
                    await (0, core_flows_1.capturePaymentWorkflow)(container).run({
                        input: {
                            payment_id: payment.id,
                        }
                    });
                    logger.info(`[Paystack] Successfully auto-captured payment for Order ${orderId}`);
                }
                catch (err) {
                    logger.error(`[Paystack] Failed to auto-capture payment ${payment.id}:`, err);
                    return;
                }
            }
        }
    }
    // Only proceed with fulfillment and email if this was a Paystack order
    if (!isPaystackPayment)
        return;
    // 3. Verifying Amount
    if (capturedAmount !== Number(order.total)) {
        logger.warn(`[Paystack] Amount mismatch for Order ${orderId}. Total: ${order.total}, Captured: ${capturedAmount}`);
        // You might want to flag the order here for manual review
    }
    // 4. Trigger Automatic Fulfillment
    try {
        await (0, core_flows_1.createOrderFulfillmentWorkflow)(container).run({
            input: {
                order_id: order.id,
                items: order.items.map((i) => ({
                    id: i.id,
                    quantity: i.quantity,
                })),
            },
            throwOnError: false,
        });
        logger.info(`[Paystack] Auto-fulfilled Order ${orderId}`);
    }
    catch (err) {
        logger.error(`[Paystack] Failed to auto-fulfill Order ${orderId}`, err);
    }
    // 5. Send Payment Confirmation Email
    const notificationModule = container.resolve(utils_1.Modules.NOTIFICATION);
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
        }
        catch (err) {
            logger.error(`[Paystack] Failed to send email for Order ${orderId}`, err);
        }
    }
}
exports.config = {
    event: "order.placed",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItcGxhY2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL29yZGVyLXBsYWNlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSw2Q0FzR0M7QUF6R0QscURBQW9EO0FBQ3BELHFEQUE4RjtBQUUvRSxLQUFLLFVBQVUsMEJBQTBCLENBQUMsRUFDdkQsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQ2YsU0FBUyxHQUNzQjtJQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBRXhCLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsTUFBTSxvQkFBb0IsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTNDLCtEQUErRDtJQUMvRCxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUN6QyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBQztZQUNMLElBQUk7WUFDSixPQUFPO1lBQ1AsZUFBZTtZQUNmLE9BQU87WUFDUCxTQUFTO1lBQ1QsZ0NBQWdDO1NBQ2pDO1FBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRTtLQUN6QixDQUFDLENBQUM7SUFFSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEIsSUFBSSxDQUFDLEtBQUs7UUFBRSxPQUFPO0lBRW5CLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFDLElBQUksQ0FBQyxFQUFFO1FBQUUsT0FBTztJQUVoQiwwQkFBMEI7SUFDMUIs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