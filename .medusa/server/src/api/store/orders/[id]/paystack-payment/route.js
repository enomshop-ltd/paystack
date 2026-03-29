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
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "currency_code", "email", "total", "payment_collections.*", "payment_collections.payments.*"],
            filters: { id: order_id }
        });
        const order = orders[0];
        const paymentCollection = order.payment_collections?.[0];
        // 2. Fallback to the order's email (Perfect for Guest Customers)
        const customerEmail = email || order.email;
        if (!customerEmail) {
            return res.status(400).json({ message: "An email address is required to process Paystack payments." });
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL29yZGVycy9baWRdL3BheXN0YWNrLXBheW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFHQSxvQkFrRUM7QUFwRUQscURBQW9EO0FBRTdDLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUtyRCxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6RCxJQUFJLENBQUM7UUFDSCxvREFBb0Q7UUFDcEQsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekMsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDekMsTUFBTSxFQUFFLE9BQU87WUFDZixNQUFNLEVBQUMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsZ0NBQWdDLENBQUM7WUFDM0csT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRTtTQUMxQixDQUFDLENBQUM7UUFDSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV6RCxpRUFBaUU7UUFDakUsTUFBTSxhQUFhLEdBQUcsS0FBSyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFM0MsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsNERBQTRELEVBQUUsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLDRDQUE0QyxFQUFFLENBQUMsQ0FBQztRQUN6RixDQUFDO1FBRUQscUNBQXFDO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDbEQsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BHLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxjQUFjLENBQUM7UUFFOUQsSUFBSSxNQUFNLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztZQUM5QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixPQUFPLEVBQUUsMERBQTBELGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFO2FBQzVHLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCx5REFBeUQ7UUFDekQsTUFBTSxjQUFjLEdBQUcsTUFBTSxhQUFhLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFO1lBQ3BGLFdBQVcsRUFBRSxhQUFhO1lBQzFCLE1BQU0sRUFBRSxNQUFNO1lBQ2QsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhO1lBQ2xDLElBQUksRUFBRTtnQkFDSixLQUFLLEVBQUUsYUFBYSxFQUFFLHdDQUF3QztnQkFDOUQsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFO2dCQUNsQixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsWUFBWTtnQkFDWixHQUFHLFFBQVE7YUFDWjtTQUNGLENBQUMsQ0FBQztRQUVILEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLE9BQU8sRUFBRSxzQ0FBc0M7WUFDL0MsZUFBZSxFQUFFLGNBQWM7U0FDaEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7UUFDcEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQztBQUNILENBQUMifQ==