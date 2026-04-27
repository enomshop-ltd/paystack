import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PaystackProviderService } from "../../../../../types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { provider_id } = req.params
  const queryParams = req.query

  try {
    let provider: PaystackProviderService | undefined;
    
    const possibleKeys = [
      `payment_provider_${provider_id}`,
      `pp_${provider_id}`,
      provider_id
    ];
    
    for (const key of possibleKeys) {
      try {
        provider = req.scope.resolve(key) as PaystackProviderService;
        if (provider) break;
      } catch (e) {
        // ignore resolution errors and try next
      }
    }

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