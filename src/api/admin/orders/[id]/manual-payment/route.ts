import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { createPaymentCollectionWorkflow } from "@medusajs/core-flows";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params; // Order ID
  const { amount, note } = req.body as { amount: number; note?: string };

  const query = req.scope.resolve("query");
  const paymentModuleService = req.scope.resolve("payment");
  const logger = req.scope.resolve("logger");

  try {
    // 1. Fetch the order
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "currency_code", "region_id", "total", "payment_collections.*"],
      filters: { id },
    });

    const order = orders?.[0];
    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id ${id} not found`);
    }

    // 2. To record a manual payment, we create a Payment on the order's Payment Collection
    // Or we create a new payment collection if none exists.
    let paymentCollectionId = order.payment_collections?.[0]?.id;

    if (!paymentCollectionId) {
      // In v2, we should use the core flow or module to create a payment collection
      const paymentCollection = await paymentModuleService.createPaymentCollections({
        currency_code: order.currency_code,
        region_id: order.region_id,
        amount: order.total,
      });
      paymentCollectionId = paymentCollection.id;
    }

    // 3. Create a payment session with the "system" or "manual" provider
    const paymentSession = await paymentModuleService.createPaymentSession(paymentCollectionId, {
      provider_id: "system",
      amount,
      currency_code: order.currency_code,
      data: { note, manual: true },
    });

    // 4. Authorize the session
    const authorizedSession = await paymentModuleService.authorizePaymentSession(
      paymentSession.id,
      {}
    );

    // 5. Capture the payment
    const capturedPayment = await paymentModuleService.capturePayment({
      payment_id: authorizedSession.payment!.id,
      amount,
    });

    logger.info(`Manually recorded payment of ${amount} for order ${id}. Note: ${note}`);

    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      payment: capturedPayment,
    });
  } catch (error: any) {
    logger.error(`Manual Payment Recording Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};
