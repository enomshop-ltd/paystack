import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: order_id } = req.params;
  const { amount, reference, note } = req.body as { 
    amount: number; 
    reference?: string;
    note?: string;
  };

  const orderModule = req.scope.resolve(Modules.ORDER);
  const paymentModule = req.scope.resolve(Modules.PAYMENT);

  try {
    const order = await orderModule.retrieveOrder(order_id, {
      relations: ["payment_collections"],
    });

    const paymentCollection = (order as any).payment_collections?.[0];
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
    const authorizedPayment = await paymentModule.authorizePaymentSession(
      paymentSession.id,
      {}
    );

    // 3. Capture the payment to mark it as paid
    const capturedPayment = await paymentModule.capturePayment({
      payment_id: authorizedPayment.id,
      amount: amount,
    });

    res.status(200).json({ 
      message: "Manual payment recorded successfully",
      payment: capturedPayment 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}