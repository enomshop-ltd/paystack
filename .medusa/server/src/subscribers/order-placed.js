"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = orderPlacedHandler;
const utils_1 = require("@medusajs/framework/utils");
async function orderPlacedHandler({ event: { data }, container, }) {
    const orderId = data.id;
    const paymentModuleService = container.resolve(utils_1.Modules.PAYMENT);
    const orderModuleService = container.resolve(utils_1.Modules.ORDER);
    // Retrieve the order and its payment collections
    const order = await orderModuleService.retrieveOrder(orderId, {
        relations: ["payment_collections", "payment_collections.payments"],
    });
    const pc = order.payment_collections?.[0];
    if (!pc)
        return;
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
                }
                catch (err) {
                    container.resolve("logger").error(`Failed to auto-capture Paystack payment ${payment.id}:`, err);
                }
            }
        }
    }
}
exports.config = {
    event: "order.placed",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItcGxhY2VkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL29yZGVyLXBsYWNlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxxQ0FnQ0M7QUFsQ0QscURBQW9EO0FBRXJDLEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxFQUMvQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFDZixTQUFTLEdBQ3NCO0lBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDeEIsTUFBTSxvQkFBb0IsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoRSxNQUFNLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRTVELGlEQUFpRDtJQUNqRCxNQUFNLEtBQUssR0FBRyxNQUFNLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUU7UUFDNUQsU0FBUyxFQUFFLENBQUMscUJBQXFCLEVBQUUsOEJBQThCLENBQUM7S0FDbkUsQ0FBQyxDQUFDO0lBRUgsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUMsSUFBSSxDQUFDLEVBQUU7UUFBRSxPQUFPO0lBRWhCLDBFQUEwRTtJQUMxRSxLQUFLLE1BQU0sT0FBTyxJQUFJLEVBQUUsQ0FBQyxRQUFRLElBQUksRUFBRSxFQUFFLENBQUM7UUFDeEMsSUFBSSxPQUFPLENBQUMsV0FBVyxLQUFLLFVBQVUsSUFBSSxPQUFPLENBQUMsV0FBVyxLQUFLLGFBQWEsRUFBRSxDQUFDO1lBQ2hGLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQztvQkFDSCxNQUFNLG9CQUFvQixDQUFDLGNBQWMsQ0FBQzt3QkFDeEMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxFQUFFO3dCQUN0QixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU07cUJBQ3ZCLENBQUMsQ0FBQztvQkFDSCxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyx5REFBeUQsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDdkcsQ0FBQztnQkFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO29CQUNiLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ25HLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDO0FBRVksUUFBQSxNQUFNLEdBQXFCO0lBQ3RDLEtBQUssRUFBRSxjQUFjO0NBQ3RCLENBQUMifQ==