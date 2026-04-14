import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Paystack webhook endpoint
 * Configure this URL in your Paystack dashboard:
 * https://your-domain.com/webhooks/paystack
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    // Get the webhook payload
    const payload = req.body

    logger.info("Received Paystack webhook", { event: payload.event })

    // The payment provider will handle webhook verification and processing
    // through the automatic /hooks/payment/paystack_paystack endpoint

    return res.status(200).json({ received: true })
  } catch (error: any) {
    logger.error("Paystack webhook error:", error)
    return res.status(400).json({ error: error.message })
  }
}
