import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import Paystack from "../../../../../providers/paystack/services/paystack-client";
import { getPaystackAmount } from "../../../../../providers/paystack/utils/currency";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params; // Order ID
  const { amount, provider_id = "paystack" } = req.body as { amount: number; provider_id?: string };

  const query = req.scope.resolve("query");
  const logger = req.scope.resolve("logger");

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "currency_code", "email", "total"],
      filters: { id },
    });

    const order = orders?.[0];
    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id ${id} not found`);
    }

    // Resolve Secret Key
    const configModule = req.scope.resolve("configModule") as any;
    const paymentModuleConfig = configModule.modules?.[Modules.PAYMENT] || configModule.projectConfig?.modules?.[Modules.PAYMENT];
    
    let secretKey: string | undefined;

    if (paymentModuleConfig?.options?.providers) {
      const providerConfig = paymentModuleConfig.options.providers.find(
        (p: any) => p.id === provider_id || p.resolve === "paystack" || p.resolve === "medusa-payment-paystack"
      );
      secretKey = providerConfig?.options?.secret_key;
    }

    if (!secretKey) {
      secretKey = process.env.PAYSTACK_SECRET_KEY;
    }

    if (!secretKey) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Paystack secret_key not configured.");
    }

    const paystack = new Paystack(secretKey);
    const paystackAmount = getPaystackAmount(Number(amount), order.currency_code);

    // Initialize Paystack transaction for the partial amount
    const response = await paystack.transaction.initialize({
      amount: paystackAmount,
      email: order.email,
      currency: order.currency_code.toUpperCase(),
      metadata: {
        order_id: order.id,
        is_partial_payment: true,
      },
    });

    if (!response.status) {
      return res.status(400).json({ success: false, message: response.message });
    }

    // Wait, the webhook needs to know how to record this payment against the order.
    // By passing `order_id` in metadata, the Paystack Webhook handler can process it.
    // But since our webhook uses standard Medusa flows via `session_id`, 
    // it's safer to create a payment session natively here and pass its ID.
    
    const paymentModuleService = req.scope.resolve("payment");
    const { data: collections } = await query.graph({
        entity: "payment_collection",
        fields: ["id"],
        filters: { order_id: order.id }
    });
    const collectionId = collections?.[0]?.id;

    let sessionId: string | undefined;

    if (collectionId) {
        const paymentSession = await paymentModuleService.createPaymentSession(collectionId, {
            provider_id,
            amount,
            currency_code: order.currency_code,
            data: {
                paystackTxRef: response.data.reference,
                paystackTxAccessCode: response.data.access_code,
            }
        });
        sessionId = paymentSession.id;
    }

    return res.status(200).json({
      success: true,
      data: {
        access_code: response.data.access_code,
        authorization_url: response.data.authorization_url,
        reference: response.data.reference,
        session_id: sessionId,
      },
    });
  } catch (error: any) {
    logger.error(`Partial Payment Init Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};
