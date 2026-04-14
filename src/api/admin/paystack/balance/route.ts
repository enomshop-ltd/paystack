import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import PaystackProviderService from "../../../../modules/paystack/service"

/**
 * Get Paystack account balance
 * GET /admin/paystack/balance
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    // Resolve payment module
    const paymentModule = req.scope.resolve(Modules.PAYMENT)

    // Get the Paystack provider (assuming provider ID is pp_paystack_paystack)
    const provider = await paymentModule.retrieveProvider("pp_paystack_paystack") as PaystackProviderService

    if (!provider) {
      return res.status(404).json({ error: "Paystack provider not found" })
    }

    // Get balance from Paystack
    const balances = await provider.getBalance()

    return res.json({
      balances,
      total_received: balances.reduce((sum, b) => sum + b.balance, 0),
    })
  } catch (error: any) {
    logger.error("Failed to fetch Paystack balance:", error)
    return res.status(500).json({
      error: error.message || "Failed to fetch balance",
    })
  }
}
