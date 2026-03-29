"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = PaystackOrderPlacedHandler;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/core-flows");
async function PaystackOrderPlacedHandler({ event: { data }, container, }) {
    const orderId = data.id;
    const query = container.resolve("query");
    const logger = container.resolve("logger");
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
    if (!order || !order.payment_collections?.[0])
        return;
    let isPaystackPayment = false;
    let capturedAmount = 0;
    for (const payment of order.payment_collections[0].payments || []) {
        if (payment.provider_id === "paystack" || payment.provider_id === "pp_paystack") {
            isPaystackPayment = true;
            capturedAmount = Number(payment.amount);
            if (!payment.captured_at) {
                try {
                    // 2. Pass the PAYMENT ID, not the Order ID.
                    // This creates the Order Transaction in the isolated Order Module automatically.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItcGxhY2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL29yZGVyLXBsYWNlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSw2Q0FpR0M7QUFwR0QscURBQW9EO0FBQ3BELHFEQUE4RjtBQUUvRSxLQUFLLFVBQVUsMEJBQTBCLENBQUMsRUFDdkQsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQ2YsU0FBUyxHQUNzQjtJQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBRXhCLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUUzQyxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUN6QyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBQztZQUNMLElBQUk7WUFDSixPQUFPO1lBQ1AsZUFBZTtZQUNmLE9BQU87WUFDUCxTQUFTO1lBQ1QsZ0NBQWdDO1NBQ2pDO1FBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRTtLQUN6QixDQUFDLENBQUM7SUFFSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEIsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUFFLE9BQU87SUFFdEQsSUFBSSxpQkFBaUIsR0FBRyxLQUFLLENBQUM7SUFDOUIsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO0lBRXZCLEtBQUssTUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBRyxFQUFFLEVBQUUs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