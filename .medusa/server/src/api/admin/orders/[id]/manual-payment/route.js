"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/core-flows");
async function POST(req, res) {
    const { id: order_id } = req.params;
    const { amount, reference, note } = req.body;
    const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
    try {
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "currency_code", "payment_collections.*"],
            filters: { id: order_id }
        });
        const order = orders[0];
        const paymentCollection = order.payment_collections?.[0];
        if (!paymentCollection) {
            return res.status(400).json({ message: "No payment collection found for this order" });
        }
        // 1. Create a payment session for the manual payment
        const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
            provider_id: "pp_system_default",
            amount: amount,
            currency_code: order.currency_code,
            data: { manual: true, reference, note },
        });
        // 2. Authorize the session to create the actual Payment record in the DB
        const authorizedPayment = await paymentModule.authorizePaymentSession(paymentSession.id, {});
        await (0, core_flows_1.capturePaymentWorkflow)(req.scope).run({
            input: {
                payment_id: authorizedPayment.id,
            }
        });
        res.status(200).json({
            message: "Manual payment recorded and captured successfully",
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL29yZGVycy9baWRdL21hbnVhbC1wYXltZW50L3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBSUEsb0JBbURDO0FBdERELHFEQUFvRDtBQUNwRCxxREFBOEQ7QUFFdkQsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztJQUNwQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFJdkMsQ0FBQztJQUVGLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6RCxJQUFJLENBQUM7UUFDSCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN6QyxNQUFNLEVBQUUsT0FBTztZQUNmLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUUsdUJBQXVCLENBQUM7WUFDeEQsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRTtTQUMxQixDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV6RCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLDRDQUE0QyxFQUFFLENBQUMsQ0FBQztRQUN6RixDQUFDO1FBRUQscURBQXFEO1FBQ3JELE1BQU0sY0FBYyxHQUFHLE1BQU0sYUFBYSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRTtZQUNwRixXQUFXLEVBQUUsbUJBQW1CO1lBQ2hDLE1BQU0sRUFBRSxNQUFNO1lBQ2QsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhO1lBQ2xDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtTQUN4QyxDQUFDLENBQUM7UUFFSCx5RUFBeUU7UUFDekUsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLGFBQWEsQ0FBQyx1QkFBdUIsQ0FDbkUsY0FBYyxDQUFDLEVBQUUsRUFDakIsRUFBRSxDQUNILENBQUM7UUFFRixNQUFNLElBQUEsbUNBQXNCLEVBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUMxQyxLQUFLLEVBQUU7Z0JBQ0wsVUFBVSxFQUFFLGlCQUFpQixDQUFDLEVBQUU7YUFDakM7U0FDRixDQUFDLENBQUM7UUFFSCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixPQUFPLEVBQUUsbURBQW1EO1NBQzdELENBQUMsQ0FBQztJQUNMLENBQUM7SUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO1FBQ3BCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ25ELENBQUM7QUFDSCxDQUFDIn0=