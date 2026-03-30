"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
async function POST(req, res) {
    const logger = req.scope.resolve("logger");
    const query = req.scope.resolve("query");
    const { id: order_id } = req.params;
    const { amount, email, metadata, callback_url } = req.body;
    logger.info(`[Paystack API] Received request to create partial payment for order ${order_id}. Amount: ${amount}`);
    try {
        // 1. Fetch order details strictly through the Query engine
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "currency_code",
                "email",
                "total",
                "payment_collections.*",
                "payment_collections.payments.*"
            ],
            filters: { id: order_id }
        });
        const order = orders[0];
        if (!order) {
            logger.warn(`[Paystack API] Order not found: ${order_id}`);
            return res.status(404).json({ message: "Order not found" });
        }
        const paymentCollection = order.payment_collections?.[0];
        const customerEmail = email || order.email;
        if (!customerEmail) {
            logger.warn(`[Paystack API] No email found on order ${order_id}`);
            return res.status(400).json({ message: "An email address is required to process Paystack payments." });
        }
        if (!paymentCollection) {
            logger.warn(`[Paystack API] No payment collection found for order ${order_id}`);
            return res.status(400).json({ message: "No payment collection found for this order" });
        }
        // 2. Strict type calculation for the remaining balance
        const payments = paymentCollection.payments || [];
        const capturedAmount = payments.reduce((acc, p) => {
            return acc + (p.captured_at ? Number(p.amount) : 0);
        }, 0);
        const remainingBalance = Number(order.total) - capturedAmount;
        const requestedAmount = Number(amount);
        if (requestedAmount > remainingBalance) {
            logger.warn(`[Paystack API] Amount ${requestedAmount} exceeds balance ${remainingBalance} for ${order_id}`);
            return res.status(400).json({
                message: `Cannot pay more than the remaining balance. Remaining: ${remainingBalance}, Requested: ${requestedAmount}`
            });
        }
        // 3. Create the payment session
        // Note: Because Medusa's standard workflows (like createPaymentSessionsWorkflow) are highly coupled 
        // to the Cart context, appending a session to an existing Order's payment collection is cleanly 
        // and properly handled by directly invoking the Payment Module.
        const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
        const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
            provider_id: "paystack", // Corrected to match your processor's static identifier
            amount: requestedAmount,
            currency_code: order.currency_code,
            data: {
                email: customerEmail,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL29yZGVycy9baWRdL3BheXN0YWNrLXBheW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFJQSxvQkErRkM7QUFqR0QscURBQW9EO0FBRTdDLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6QyxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUtyRCxDQUFDO0lBRUYsTUFBTSxDQUFDLElBQUksQ0FBQyx1RUFBdUUsUUFBUSxhQUFhLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFFbEgsSUFBSSxDQUFDO1FBQ0gsMkRBQTJEO1FBQzNELE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3pDLE1BQU0sRUFBRSxPQUFPO1lBQ2YsTUFBTSxFQUFFO2dCQUNOLElBQUk7Z0JBQ0osZUFBZTtnQkFDZixPQUFPO2dCQUNQLE9BQU87Z0JBQ1AsdUJBQXVCO2dCQUN2QixnQ0FBZ0M7YUFDakM7WUFDRCxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFO1NBQzFCLENBQUMsQ0FBQztRQUVILE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV4QixJQUFJLENBQUMsS0FBSyxFQUFF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