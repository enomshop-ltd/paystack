import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PaystackProviderService } from "../../../../../types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { provider_id } = req.params

  try {
    // In Medusa 2, providers are often registered under `payment_provider_${provider_id}`
    // or we can resolve it securely if we know the exact string, but let's try the common patterns
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
        message: `Paystack provider '${provider_id}' not found. Be sure to check what its config id is.`,
      })
    }

    const balance = await provider.getBalance()
    return res.json({
      balance,
      total_received: balance.reduce((sum, b) => sum + b.balance, 0),
    })
    
  } catch (error) {
    res.status(500).json({
      message: error.message || "Failed to fetch balance",
    })
  }
}