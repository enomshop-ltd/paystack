import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import PaystackProviderService from "../../../../modules/paystack/service"

/**
 * List Paystack transactions with pagination and search
 * GET /admin/paystack/transactions?page=1&per_page=50&search=order_123
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const { page = "1", per_page = "50", search } = req.query as {
      page?: string
      per_page?: string
      search?: string
    }

    // Resolve payment module
    const paymentModule = req.scope.resolve(Modules.PAYMENT)

    // Get the Paystack provider
    const provider = await paymentModule.retrieveProvider("pp_paystack_paystack") as PaystackProviderService

    if (!provider) {
      return res.status(404).json({ error: "Paystack provider not found" })
    }

    // Get transactions from Paystack
    const result = await provider.listTransactions(
      parseInt(page),
      parseInt(per_page),
      search
    )

    return res.json(result)
  } catch (error: any) {
    logger.error("Failed to fetch Paystack transactions:", error)
    return res.status(500).json({
      error: error.message || "Failed to fetch transactions",
    })
  }
}
