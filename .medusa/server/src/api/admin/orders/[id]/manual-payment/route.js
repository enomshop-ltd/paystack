"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
async function POST(req, res) {
    const { id: order_id } = req.params;
    const { amount, reference, note } = req.body;
    const orderModule = req.scope.resolve(utils_1.Modules.ORDER);
    const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
    try {
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "currency_code", "email", "total", "payment_collections.*", "payment_collections.payments.*"],
            filters: { id: order_id }
        });
        const order = orders[0];
        const paymentCollection = order.payment_collections?.[0];
        if (!paymentCollection) {
            return res.status(400).json({ message: "No payment collection found for this order" });
        }
        // 1. Create a manual payment session for the partial amount
        const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
            provider_id: "pp_system_default", // Medusa's default manual payment provider in v2
            amount: amount,
            currency_code: order.currency_code,
            data: {
                manual: true,
                reference,
                note,
            },
        });
        // 2. Authorize the payment session
        const authorizedPayment = await paymentModule.authorizePaymentSession(paymentSession.id, {});
        // 3. Capture the payment to mark it as paid
        const capturedPayment = await paymentModule.capturePayment({
            payment_id: authorizedPayment.id,
            amount: amount,
        });
        res.status(200).json({
            message: "Manual payment recorded successfully",
            payment: capturedPayment
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL29yZGVycy9baWRdL21hbnVhbC1wYXltZW50L3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBR0Esb0JBdURDO0FBekRELHFEQUFvRDtBQUU3QyxLQUFLLFVBQVUsSUFBSSxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDaEUsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO0lBQ3BDLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUl2QyxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6RCxJQUFJLENBQUM7UUFDSCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN6QyxNQUFNLEVBQUUsT0FBTztZQUNmLE1BQU0sRUFBQyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxnQ0FBZ0MsQ0FBQztZQUMzRyxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFO1NBQzFCLENBQUMsQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsNENBQTRDLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFFRCw0REFBNEQ7UUFDNUQsTUFBTSxjQUFjLEdBQUcsTUFBTSxhQUFhLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFO1lBQ3BGLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxpREFBaUQ7WUFDbkYsTUFBTSxFQUFFLE1BQU07WUFDZCxhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7WUFDbEMsSUFBSSxFQUFFO2dCQUNKLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVM7Z0JBQ1QsSUFBSTthQUNMO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUNBQW1DO1FBQ25DLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxhQUFhLENBQUMsdUJBQXVCLENBQ25FLGNBQWMsQ0FBQyxFQUFFLEVBQ2pCLEVBQUUsQ0FDSCxDQUFDO1FBRUYsNENBQTRDO1FBQzVDLE1BQU0sZUFBZSxHQUFHLE1BQU0sYUFBYSxDQUFDLGNBQWMsQ0FBQztZQUN6RCxVQUFVLEVBQUUsaUJBQWlCLENBQUMsRUFBRTtZQUNoQyxNQUFNLEVBQUUsTUFBTTtTQUNmLENBQUMsQ0FBQztRQUVILEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLE9BQU8sRUFBRSxzQ0FBc0M7WUFDL0MsT0FBTyxFQUFFLGVBQWU7U0FDekIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQztBQUNILENBQUMifQ==