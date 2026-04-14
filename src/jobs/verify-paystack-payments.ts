import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Scheduled job that runs every 15 minutes to verify pending Paystack payments
 * This acts as a failsafe in case webhooks are missed or delayed
 */
export default async function verifyPaystackPayments(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    logger.info("Starting Paystack payment verification job")

    // Query for payment collections with pending Paystack payments
    const { data: paymentCollections } = await query.graph({
      entity: "payment_collection",
      fields: [
        "id",
        "payment_sessions.*",
        "payment_sessions.provider_id",
        "payment_sessions.status",
        "payment_sessions.data",
      ],
      filters: {
        payment_sessions: {
          provider_id: {
            $like: "pp_paystack%",
          },
          status: "pending",
        },
      },
    })

    if (!paymentCollections || paymentCollections.length === 0) {
      logger.info("No pending Paystack payments found")
      return
    }

    logger.info(`Found ${paymentCollections.length} payment collections with pending Paystack payments`)

    // Resolve payment module
    const paymentModule = container.resolve(Modules.PAYMENT)

    let verifiedCount = 0
    let failedCount = 0

    // Process each payment collection
    for (const collection of paymentCollections) {
      for (const session of collection.payment_sessions || []) {
        if (!session) continue
        if (!session.provider_id?.startsWith("pp_paystack")) continue
        if (session.status !== "pending") continue

        try {
          // Get payment provider service
          const paystackService = container.resolve(session.provider_id) as any

          if (!paystackService || typeof paystackService.retrievePayment !== "function") {
            logger.info(`Provider not found for session ${session.id}`)
            continue
          }

          // Retrieve updated payment status from Paystack
          const paymentData = await paystackService.retrievePayment(session.data)

          // Check if payment is now successful
          if (paymentData.status === "success" || paymentData.status === "authorized") {
            // Authorize the payment using v2 input/output types
            const authResult = await paystackService.authorizePayment({
              data: session.data,
              context: {},
            })

            // Update payment session using the correct v2 method signature
            // updatePaymentSession requires currency_code and amount
            await paymentModule.updatePaymentSession({
              id: session.id,
              data: authResult.data,
              status: authResult.status,
              currency_code: (session as any).currency_code || "USD",
              amount: (session as any).amount || 0,
            })

            logger.info(`Successfully verified and authorized payment session ${session.id}`)
            verifiedCount++

            // If cart exists and is not completed, complete it
            // This is handled automatically by Medusa when payment is authorized
          }
        } catch (error: any) {
          logger.error(error)
          failedCount++
        }

        // Add a small delay to avoid rate limiting (Paystack has rate limits)
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    logger.info(`Paystack payment verification completed: ${verifiedCount} verified, ${failedCount} failed`)
  } catch (error: any) {
    logger.error(error)
    throw error
  }
}

export const config = {
  name: "verify-paystack-payments",
  schedule: "*/15 * * * *", // Run every 15 minutes
}
