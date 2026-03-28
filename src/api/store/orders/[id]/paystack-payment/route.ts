import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: order_id } = req.params;
  const { amount, email, metadata, callback_url } = req.body as { 
    amount: number; 
    email?: string; // Made optional so we can fallback to order email
    metadata?: Record<string, unknown>;
    callback_url?: string;
  };

  const orderModule = req.scope.resolve(Modules.ORDER);
  const paymentModule = req.scope.resolve(Modules.PAYMENT);

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

    const paymentCollection = (order as any).payment_collections?.[0];
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
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}
