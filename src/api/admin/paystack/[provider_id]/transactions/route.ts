import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PaystackProviderService } from "../../../../../types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { provider_id } = req.params
  const queryParams = req.query

  try {
    const provider = req.scope.resolve(`pp_paystack_${provider_id}`) as PaystackProviderService

    if (!provider) {
      return res.status(404).json({
        message: `Paystack provider '${provider_id}' not found`,
      })
    }

    const transactions = await provider.getTransactions(queryParams)

    res.json(transactions)
  } catch (error) {
    res.status(500).json({
      message: error.message || "Failed to fetch transactions",
    })
  }
}