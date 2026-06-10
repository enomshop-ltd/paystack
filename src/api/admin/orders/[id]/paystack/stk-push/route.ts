import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import Paystack from "../../../../../providers/paystack/services/paystack-client";
import { getPaystackAmount } from "../../../../../providers/paystack/utils/currency";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params; // Order ID
  const { amount, phone, provider_id = "paystack" } = req.body as { amount: number; phone: string; provider_id?: string };

  const query = req.scope.resolve("query");

  // Fetch the order to get email and currency
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "currency_code", "email", "total", "payment_collections.*"],
    filters: { id },
  });

  const order = orders?.[0];
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id ${id} not found`);
  }

  // To send the STK push, we need the Paystack Secret Key. 
  // We can extract it from the loaded config for the payment module.
  const configModule = req.scope.resolve("configModule") as any;
  const paymentModuleConfig = configModule.modules?.[Modules.PAYMENT] || configModule.projectConfig?.modules?.[Modules.PAYMENT];
  
  let secretKey: string | undefined;

  // Attempt to find the secret key from the provider options
  if (paymentModuleConfig?.options?.providers) {
    const providerConfig = paymentModuleConfig.options.providers.find(
      (p: any) => p.id === provider_id || p.resolve === "paystack" || p.resolve === "medusa-payment-paystack"
    );
    secretKey = providerConfig?.options?.secret_key;
  }

  // Fallback to process.env if not found in config tree (common for simple setups)
  if (!secretKey) {
    secretKey = process.env.PAYSTACK_SECRET_KEY;
  }

  if (!secretKey) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Paystack secret_key not configured or found.");
  }

  const paystack = new Paystack(secretKey);

  const paystackAmount = getPaystackAmount(Number(amount), order.currency_code);

  try {
    const response = await paystack.charge.mobile_money({
      amount: paystackAmount,
      email: order.email,
      currency: order.currency_code.toUpperCase(),
      mobile_money: {
        phone,
        provider: "m-pesa", // Defaults to m-pesa for STK push
      },
      metadata: {
        order_id: order.id,
      }
    });

    if (!response.status) {
      return res.status(400).json({ success: false, message: response.message });
    }

    return res.status(200).json({
      success: true,
      message: response.message,
      data: response.data, // Contains reference and display_text
    });
  } catch (error: any) {
    req.scope.resolve("logger").error(`STK Push Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};
