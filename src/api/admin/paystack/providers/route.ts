import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const paymentModule = req.scope.resolve(Modules.PAYMENT)
  
  // We specify that we want to list payment providers
  // The Paystack provider's ID conventionally starts with or contains 'paystack'
  const providers = await paymentModule.listPaymentProviders()

  const paystackProviders = providers.filter((p: any) => 
    p.id.includes("paystack")
  )

  res.json(paystackProviders.map((p: any) => ({
    id: p.id,
    identifier: p.id,
    display_name: `Paystack (${p.id})`
  })))
}
