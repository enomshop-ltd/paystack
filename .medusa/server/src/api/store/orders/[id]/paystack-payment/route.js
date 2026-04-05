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
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "currency_code",
                "email",
                "total",
                "payment_collections.*",
                "payment_collections.payments.*",
            ],
            filters: { id: order_id },
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
            return res.status(400).json({
                message: "An email address is required to process Paystack payments.",
            });
        }
        if (!paymentCollection) {
            logger.warn(`[Paystack API] No payment collection found for order ${order_id}`);
            return res
                .status(400)
                .json({ message: "No payment collection found for this order" });
        }
        const payments = paymentCollection.payments || [];
        const capturedAmount = payments.reduce((acc, p) => {
            return acc + (p.captured_at ? Number(p.amount) : 0);
        }, 0);
        const remainingBalance = Number(order.total) - capturedAmount;
        const requestedAmount = Number(amount);
        if (requestedAmount > remainingBalance) {
            logger.warn(`[Paystack API] Amount ${requestedAmount} exceeds balance ${remainingBalance} for ${order_id}`);
            return res.status(400).json({
                message: `Cannot pay more than the remaining balance. Remaining: ${remainingBalance}, Requested: ${requestedAmount}`,
            });
        }
        const paymentModule = req.scope.resolve(utils_1.Modules.PAYMENT);
        // Create the payment session first so we have its ID
        const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
            provider_id: "pp_paystack",
            amount: requestedAmount,
            currency_code: order.currency_code,
            data: {
                email: customerEmail,
                order_id: order.id,
                // CRITICAL: session_id must be in the data so Paystack's initiatePayment
                // passes it into the Paystack transaction metadata. This allows the
                // charge.success webhook to resolve the correct payment session.
                session_id: undefined, // will be filled below via update
                is_partial: true,
                callback_url,
                ...metadata,
            },
        });
        // Now update the session data to include its own ID so the webhook can route back
        const updatedSession = await paymentModule.updatePaymentSession({
            id: paymentSession.id,
            amount: requestedAmount,
            currency_code: order.currency_code,
            data: {
                ...(paymentSession.data ?? {}),
                email: customerEmail,
                order_id: order.id,
                session_id: paymentSession.id,
                is_partial: true,
                callback_url,
                ...metadata,
            },
        });
        logger.info(`[Paystack API] Created partial payment session ${paymentSession.id} for order ${order_id}`);
        res.status(200).json({
            message: "Payment session created successfully",
            payment_session: updatedSession,
        });
    }
    catch (error) {
        logger.error(`[Paystack API] Error creating payment session for order ${order_id}`, error);
        res.status(500).json({ message: error.message });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL29yZGVycy9baWRdL3BheXN0YWNrLXBheW1lbnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFHQSxvQkErSEM7QUFqSUQscURBQW9EO0FBRTdDLEtBQUssVUFBVSxJQUFJLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUV6QyxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7SUFDcEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUtyRCxDQUFDO0lBRUYsTUFBTSxDQUFDLElBQUksQ0FDVCx1RUFBdUUsUUFBUSxhQUFhLE1BQU0sRUFBRSxDQUNyRyxDQUFDO0lBRUYsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDekMsTUFBTSxFQUFFLE9BQU87WUFDZixNQUFNLEVBQUU7Z0JBQ04sSUFBSTtnQkFDSixlQUFlO2dCQUNmLE9BQU87Z0JBQ1AsT0FBTztnQkFDUCx1QkFBdUI7Z0JBQ3ZCLGdDQUFnQzthQUNqQztZQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUU7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXhCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1B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