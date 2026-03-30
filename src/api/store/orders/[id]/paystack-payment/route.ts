// src/api/store/orders/[id]/paystack-payment/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger");
  const query = req.scope.resolve("query");

  const { id: order_id } = req.params;
  const { amount, email, metadata, callback_url } = req.body as {
    amount: number;
    email?: string;
    metadata?: Record<string, unknown>;
    callback_url?: string;
  };

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
    const capturedAmount = payments.reduce((acc: number, p: any) => {
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
    const paymentModule = req.scope.resolve(Modules.PAYMENT);

    const { data: paymentProviders } = await query.graph({ entity: "payment_provider", fields: ["id", "is_installed"], });
    console.log(paymentProviders);
    const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
      provider_id: "pp_paystack", // Corrected to match your processor's static identifier
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

  } catch (error: any) {
    logger.error(`[Paystack API] Error creating payment session for order ${order_id}`, error);
    res.status(500).json({ message: error.message });
  }
}