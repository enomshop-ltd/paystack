import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PaystackProviderService } from "../../../../../types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { provider_id } = req.params

  try {
    const provider = req.scope.resolve(`pp_paystack_${provider_id}`) as PaystackProviderService

    if (!provider) {
      return res.status(404).json({
        message: `Paystack provider '${provider_id}' not found`,
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