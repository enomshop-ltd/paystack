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
    logger.info(`[Paystack] Order placed handler triggered for order: ${orderId}`);
    try {
        logger.info(`[Paystack] Fetching order details for order: ${orderId}`);
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
        for (const payment of order.payment_collections[0].payments || []) {
            if (payment.provider_id === "paystack" || payment.provider_id === "pp_paystack") {
                isPaystackPayment = true;
                capturedAmount = Number(payment.amount);
                logger.info(`[Paystack] Found Paystack payment: ${payment.id} with amount: ${capturedAmount}`);
                if (!payment.captured_at) {
                    logger.info(`[Paystack] Payment ${payment.id} not yet captured. Initiating capture workflow.`);
                    try {
                        await (0, core_flows_1.capturePaymentWorkflow)(container).run({
                            input: {
                                payment_id: payment.id,
                            }
                        });
                        logger.info(`[Paystack] Successfully auto-captured payment ${payment.id} for Order ${orderId}`);
                    }
                    catch (err) {
                        logger.error(`[Paystack] Failed to auto-capture payment ${payment.id}:`, err);
                        return;
                    }
                }
                else {
                    logger.info(`[Paystack] Payment ${payment.id} is already captured.`);
                }
            }
        }
        if (!isPaystackPayment) {
            logger.info(`[Paystack] Order ${orderId} does not use Paystack. Skipping Paystack specific logic.`);
            return;
        }
        if (capturedAmount !== Number(order.total)) {
            logger.warn(`[Paystack] Amount mismatch for Order ${orderId}. Total: ${order.total}, Captured: ${capturedAmount}`);
        }
        else {
            logger.info(`[Paystack] Amount verified for Order ${orderId}. Total matches captured amount: ${capturedAmount}`);
        }
        logger.info(`[Paystack] Initiating auto-fulfillment for Order ${orderId}`);
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
            logger.info(`[Paystack] Successfully auto-fulfilled Order ${orderId}`);
        }
        catch (err) {
            logger.error(`[Paystack] Failed to auto-fulfill Order ${orderId}`, err);
        }
        logger.info(`[Paystack] Checking for notification module to send confirmation email for Order ${orderId}`);
        const notificationModule = container.resolve(utils_1.Modules.NOTIFICATION);
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
            }
            catch (err) {
                logger.error(`[Paystack] Failed to send email for Order ${orderId}`, err);
            }
        }
        else {
            logger.warn(`[Paystack] Notification module not found. Skipping email for Order ${orderId}`);
        }
    }
    catch (error) {
        logger.error(`[Paystack] Unexpected error in order placed handler for Order ${orderId}`, error);
    }
}
exports.config = {
    event: "order.placed",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItcGxhY2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL29yZGVyLXBsYWNlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSw2Q0FxSEM7QUF4SEQscURBQW9EO0FBQ3BELHFEQUE4RjtBQUUvRSxLQUFLLFVBQVUsMEJBQTBCLENBQUMsRUFDdkQsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQ2YsU0FBUyxHQUNzQjtJQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3hCLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUUzQyxNQUFNLENBQUMsSUFBSSxDQUFDLHdEQUF3RCxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBRS9FLElBQUksQ0FBQztRQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0RBQWdELE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDekMsTUFBTSxFQUFFLE9BQU87WUFDZixNQUFNLEVBQUM7Z0JBQ0wsSUFBSTtnQkFDSixPQUFPO2dCQUNQLGVBQWU7Z0JBQ2YsT0FBTztnQkFDUCxTQUFTO2dCQUNULGdDQUFnQzthQUNqQztZQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUU7U0FDekIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsc0NBQXNDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDN0QsT0FBTztRQUNU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