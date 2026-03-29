"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
async function POST(req, res) {
    const { id: order_id } = req.params;
    const { amount, email, metadata, callback_url } = req.body;
    const orderModule = req.scope.resolve(utils_1.Modules.ORDER);
    const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
    try {
        // 1. Retrieve the order and its payment collections
        const order = await orderModule.retrieveOrder(order_id, {
            relations: ["payment_collections", "payment_collections.payments"],
        });
        // 2. Fallback to the order's email (Perfect for Guest Customers)
        const customerEmail = email || order.email;
        if (!customerEmail) {
            return res.status(400).json({ message: "An email address is required to process Paystack payments." });
        }
        const paymentCollection = order.payment_collections?.[0];
        if (!paymentCollection) {
            return res.status(400).json({ message: "No payment collection found for this order" });
        }
        // 3. Prevent Overpayment Calculation
        const payments = paymentCollection.payments || [];
        const capturedAmount = payments.reduce((acc, p) => acc + (p.captured_at ? Number(p.amount) : 0), 0);
        const remainingBalance = Number(order.total) - capturedAmount;
        if (amount > remainingBalance) {
            return res.status(400).json({
                message: `Cannot pay more than the remaining balance. Remaining: ${remainingBalance}, Requested: ${amount}`
            });
        }
        // 4. Create a new payment session for the partial amount
        const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
            provider_id: "pp_paystack",
            amount: amount,
            currency_code: order.currency_code,
            data: {
                email: customerEmail, // Uses the guest's original order email
                order_id: order.id,
                is_partial: true,
                callback_url,
                ...metadata,
            },
        });
        res.status(200).json({
            message: "Payment session created successfully",
            payment_session: paymentSession
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL29yZGVycy9baWRdL3BheXN0YWNrLXBheW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFHQSxvQkE4REM7QUFoRUQscURBQW9EO0FBRTdDLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUtyRCxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6RCxJQUFJLENBQUM7UUFDSCxvREFBb0Q7UUFDcEQsTUFBTSxLQUFLLEdBQUcsTUFBTSxXQUFXLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRTtZQUN0RCxTQUFTLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSw4QkFBOEIsQ0FBQztTQUNuRSxDQUFDLENBQUM7UUFFSCxpRUFBaUU7UUFDakUsTUFBTSxhQUFhLEdBQUcsS0FBSyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFM0MsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsNERBQTRELEVBQUUsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFFRCxNQUFNLGlCQUFpQixHQUFJLEtBQWEsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsNENBQTRDLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFFRCxxQ0FBcUM7UUFDckMsTUFBTSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNsRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEcsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLGNBQWMsQ0FBQztRQUU5RCxJQUFJLE1BQU0sR0FBRyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSwwREFBMEQsZ0JBQWdCLGdCQUFnQixNQUFNLEVBQUU7YUFDNUcsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELHlEQUF5RDtRQUN6RCxNQUFNLGNBQWMsR0FBRyxNQUFNLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUU7WUFDcEYsV0FBVyxFQUFFLGFBQWE7WUFDMUIsTUFBTSxFQUFFLE1BQU07WUFDZCxhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7WUFDbEMsSUFBSSxFQUFFO2dCQUNKLEtBQUssRUFBRSxhQUFhLEVBQUUsd0NBQXdDO2dCQUM5RCxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUU7Z0JBQ2xCLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixZQUFZO2dCQUNaLEdBQUcsUUFBUTthQUNaO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsT0FBTyxFQUFFLHNDQUFzQztZQUMvQyxlQUFlLEVBQUUsY0FBYztTQUNoQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0FBQ0gsQ0FBQyJ9