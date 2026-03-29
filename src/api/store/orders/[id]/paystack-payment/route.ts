import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger");
  const { id: order_id } = req.params;
  const { amount, email, metadata, callback_url } = req.body as { 
    amount: number; 
    email?: string; // Made optional so we can fallback to order email
    metadata?: Record<string, unknown>;
    callback_url?: string;
  };

  logger.info(`[Paystack API] Received request to create partial payment for order ${order_id}. Amount: ${amount}, Email: ${email}`);

  const orderModule = req.scope.resolve(Modules.ORDER);
  const paymentModule = req.scope.resolve(Modules.PAYMENT);

  try {
    // 1. Retrieve the order and its payment collections
    logger.info(`[Paystack API] Fetching order details for ${order_id}`);
    const query = req.scope.resolve("query");
    const { data: orders } = await query.graph({
      entity: "order",
      fields:["id", "currency_code", "email", "total", "payment_collections.*", "payment_collections.payments.*"],
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
    const capturedAmount = payments.reduce((acc: number, p: any) => acc + (p.captured_at ? Number(p.amount) : 0), 0);
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
  } catch (error: any) {
    logger.error(`[Paystack API] Error creating payment session for order ${order_id}`, error);
    res.status(500).json({ message: error.message });
  }
}
