"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
async function POST(req, res) {
    const logger = req.scope.resolve("logger");
    const { id: order_id } = req.params;
    const { amount, email, metadata, callback_url } = req.body;
    logger.info(`[Paystack API] Received request to create partial payment for order ${order_id}. Amount: ${amount}, Email: ${email}`);
    const orderModule = req.scope.resolve(utils_1.Modules.ORDER);
    const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
    try {
        // 1. Retrieve the order and its payment collections
        logger.info(`[Paystack API] Fetching order details for ${order_id}`);
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "currency_code", "email", "total", "payment_collections.*", "payment_collections.payments.*"],
            filters: { id: order_id }
        });
        const order = orders[0];
        if (!order) {
            logger.warn(`[Paystack API] Order not found: ${order_id}`);
            return res.status(404).json({ message: "Order not found" });
        }
        const paymentCollection = order.payment_collections?.[0];
        // 2. Fallback to the order's email (Perfect for Guest Customers)
        const customerEmail = email || order.email;
        if (!customerEmail) {
            logger.warn(`[Paystack API] No email provided or found on order ${order_id}`);
            return res.status(400).json({ message: "An email address is required to process Paystack payments." });
        }
        if (!paymentCollection) {
            logger.warn(`[Paystack API] No payment collection found for order ${order_id}`);
            return res.status(400).json({ message: "No payment collection found for this order" });
        }
        // 3. Prevent Overpayment Calculation
        const payments = paymentCollection.payments || [];
        const capturedAmount = payments.reduce((acc, p) => acc + (p.captured_at ? Number(p.amount) : 0), 0);
        const remainingBalance = Number(order.total) - capturedAmount;
        logger.info(`[Paystack API] Order ${order_id} total: ${order.total}, captured: ${capturedAmount}, remaining: ${remainingBalance}`);
        if (amount > remainingBalance) {
            logger.warn(`[Paystack API] Requested amount ${amount} exceeds remaining balance ${remainingBalance} for order ${order_id}`);
            return res.status(400).json({
                message: `Cannot pay more than the remaining balance. Remaining: ${remainingBalance}, Requested: ${amount}`
            });
        }
        // 4. Create a new payment session for the partial amount
        logger.info(`[Paystack API] Creating payment session for order ${order_id} with amount ${amount}`);
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
        logger.info(`[Paystack API] Successfully created payment session for order ${order_id}`);
        res.status(200).json({
            message: "Payment session created successfully",
            payment_session: paymentSession
        });
    }
    catch (error) {
        logger.error(`[Paystack API] Error creating payment session for order ${order_id}`, error);
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL29yZGVycy9baWRdL3BheXN0YWNrLXBheW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFHQSxvQkFvRkM7QUF0RkQscURBQW9EO0FBRTdDLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzQyxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUtyRCxDQUFDO0lBRUYsTUFBTSxDQUFDLElBQUksQ0FBQyx1RUFBdUUsUUFBUSxhQUFhLE1BQU0sWUFBWSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBRW5JLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLGVBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyRCxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFekQsSUFBSSxDQUFDO1FBQ0gsb0RBQW9EO1FBQ3BELE1BQU0sQ0FBQyxJQUFJLENBQUMsNkNBQTZDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDckUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekMsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDekMsTUFBTSxFQUFFLE9BQU87WUFD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