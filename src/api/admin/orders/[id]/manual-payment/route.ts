import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/core-flows";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: order_id } = req.params;
  const { amount, reference, note } = req.body as {
    amount: number;
    reference?: string;
    note?: string;
  };

  const paymentModule = req.scope.resolve(Modules.PAYMENT);

  try {
    const query = req.scope.resolve("query");
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "currency_code", "payment_collections.*"],
      filters: { id: order_id }
    });

    const order = orders[0];
    const paymentCollection = order.payment_collections?.[0];

    if (!paymentCollection) {
      return res.status(400).json({ message: "No payment collection found for this order" });
    }

    // 1. Create a payment session for the manual payment
    const paymentSession = await paymentModule.createPaymentSession(paymentCollection.id, {
      provider_id: "pp_system_default",
      amount: amount,
      currency_code: order.currency_code,
      data: { manual: true, reference, note },
    });

    // 2. Authorize the session to create the actual Payment record in the DB
    const authorizedPayment = await paymentModule.authorizePaymentSession(
      paymentSession.id,
      {}
    );

    await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id: authorizedPayment.id,
      }
    });

    res.status(200).json({
      message: "Manual payment recorded and captured successfully",
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}