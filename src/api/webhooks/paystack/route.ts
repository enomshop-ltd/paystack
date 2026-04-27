import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Paystack webhook endpoint
 * Configure this URL in your Paystack dashboard:
 * https://your-domain.com/webhooks/paystack
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  const query = req.scope.resolve("query")

  try {
    // Get the webhook payload
    const payload = req.body as Record<string, any>
    const event = payload?.event
    const paystackData = payload?.data

    logger.info(`Received Paystack webhook: ${event || 'unknown event'}`)

    // Emit custom event for failed payments so we can send notifications
    if (event === "charge.failed" && paystackData?.reference) {
      // Try to find the payment by reference
      try {
        // Query payments in a paginated way to prevent memory exhaustion
        const { data: payments } = await query.graph({
          entity: "payment",
          fields: ["id", "amount", "currency_code", "data"],
          pagination: {
            take: 200,
            order: {
              created_at: "DESC"
            }
          }
        })

        // Find payment by reference in the data field
        const payment = payments?.find((p: any) => 
          p.data?.reference === paystackData.reference
        )

        if (payment) {
          // Emit custom event that our subscriber will listen to
          await eventBus.emit({
            name: "payment.failed",
            data: {
              payment_id: payment.id,
              error: paystackData.gateway_response || "Payment failed",
            },
          })

          logger.info(`Emitted payment.failed event for payment ${payment.id}`)
        }
      } catch (queryError: any) {
        logger.warn(`Could not find payment for reference ${paystackData.reference}: ${queryError.message}`)
      }
    }

    // The payment provider will handle webhook verification and processing
    // through the automatic /hooks/payment/paystack_paystack endpoint

    return res.status(200).json({ received: true })
  } catch (error: any) {
    logger.error(error)
    return res.status(400).json({ error: error.message })
  }
}
