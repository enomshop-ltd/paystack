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
        const order = await orderModule.retrieveOrder(order_id, {
            relations: ["payment_collections"],
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL29yZGVycy9baWRdL21hbnVhbC1wYXltZW50L3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBR0Esb0JBb0RDO0FBdERELHFEQUFvRDtBQUU3QyxLQUFLLFVBQVUsSUFBSSxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDaEUsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO0lBQ3BDLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUl2QyxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6RCxJQUFJLENBQUM7UUFDSCxNQUFNLEtBQUssR0FBRyxNQUFNLFdBQVcsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFO1lBQ3RELFNBQVMsRUFBRSxDQUFDLHFCQUFxQixDQUFDO1NBQ25DLENBQUMsQ0FBQztRQUVILE1BQU0saUJBQWlCLEdBQUksS0FBYSxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDdkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSw0Q0FBNEMsRUFBRSxDQUFDLENBQUM7UUFDekYsQ0FBQztRQUVELDREQUE0RDtRQUM1RCxNQUFNLGNBQWMsR0FBRyxNQUFNLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUU7WUFDcEYsV0FBVyxFQUFFLG1CQUFtQixFQUFFLGlEQUFpRDtZQUNuRixNQUFNLEVBQUUsTUFBTTtZQUNkLGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtZQUNsQyxJQUFJLEVBQUU7Z0JBQ0osTUFBTSxFQUFFLElBQUk7Z0JBQ1osU0FBUztnQkFDVCxJQUFJO2FBQ0w7U0FDRixDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLGFBQWEsQ0FBQyx1QkFBdUIsQ0FDbkUsY0FBYyxDQUFDLEVBQUUsRUFDakIsRUFBRSxDQUNILENBQUM7UUFFRiw0Q0FBNEM7UUFDNUMsTUFBTSxlQUFlLEdBQUcsTUFBTSxhQUFhLENBQUMsY0FBYyxDQUFDO1lBQ3pELFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFO1lBQ2hDLE1BQU0sRUFBRSxNQUFNO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsT0FBTyxFQUFFLHNDQUFzQztZQUMvQyxPQUFPLEVBQUUsZUFBZTtTQUN6QixDQUFDLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0FBQ0gsQ0FBQyJ9