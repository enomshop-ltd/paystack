import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, MedusaError } from "@medusajs/framework/utils"
import { createPaymentSessionsWorkflow } from "@medusajs/medusa/core-flows"
import PaystackProviderService from "../../../../modules/paystack/service"

/**
 * Custom API route for partial payments / installments
 * Allows customers to pay off an order in multiple payments
 * 
 * POST /store/paystack/partial-payment
 * Body: {
 *   order_id: string
 *   amount: number
 *   email?: string (required for guest customers)
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { order_id, amount, email } = req.body as {
      order_id: string
      amount: number
      email?: string
    }

    if (!order_id || !amount) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "order_id and amount are required"
      )
    }

    // Get the order with payment details
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "currency_code",
        "total",
        "payment_status",
        "payment_collections.*",
        "payment_collections.payment_sessions.*",
        "payment_collections.payment_sessions.data",
      ],
      filters: {
        id: order_id,
      },
    })

    if (!orders || orders.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Order ${order_id} not found`
      )
    }

    const order = orders[0]

    // Calculate total paid so far
    const paymentCollection = order.payment_collections?.[0]
    
    if (!paymentCollection) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No payment collection found for this order"
      )
    }

    // In v2, we need to check payment_sessions, not payments directly
    const completedSessions = paymentCollection.payment_sessions?.filter((s: any) => s.status === "captured" || s.status === "authorized") || []
    const totalPaid = completedSessions.reduce((sum: number, session: any) => {
      return sum + (session.amount || 0)
    }, 0)

    const remaining = order.total - totalPaid

    if (remaining <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order is already fully paid"
      )
    }

    if (amount > remaining) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Payment amount (${amount}) exceeds remaining balance (${remaining})`
      )
    }

    // Get customer email (from order or request body for guest customers)
    const customerEmail = order.email || email

    if (!customerEmail) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Email is required for guest customers"
      )
    }

    // Get the original Paystack payment session to retrieve authorization
    const paystackSession = paymentCollection.payment_sessions?.find((s: any) =>
      s.provider_id?.startsWith("pp_paystack")
    )

    if (!paystackSession) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Original Paystack payment not found for this order"
      )
    }

    const providerId = paystackSession.provider_id

    // Get the payment data which should contain authorization code
    const sessionData = paystackSession.data as any
    const authorizationCode = sessionData.authorization_code

    if (!authorizationCode) {
      // If no authorization, create a new payment session for this installment
      // Using the v2 workflow to create payment session
      const { result: newSession } = await createPaymentSessionsWorkflow(req.scope).run({
        input: {
          payment_collection_id: paymentCollection.id,
          provider_id: providerId,
          context: {
            email: customerEmail,
            currency_code: order.currency_code,
            amount,
            extra: {
              order_id: order.id,
              is_partial_payment: true,
              total_paid: totalPaid,
              remaining,
            },
          },
        },
      })

      // Resolve the Paystack provider service to get the authorization URL
      const paystackService = req.scope.resolve(providerId) as PaystackProviderService
      const paymentData = newSession[0]?.data as any

      return res.json({
        success: true,
        authorization_url: paymentData?.authorization_url || "",
        reference: paymentData?.reference || "",
        amount,
        remaining: remaining - amount,
      })
    }

    // Charge using saved authorization
    const reference = `${order_id}_installment_${Date.now()}`
    const paystackService = req.scope.resolve(providerId) as PaystackProviderService
    
    const chargeResult = await paystackService.chargeAuthorization(
      authorizationCode,
      customerEmail,
      amount,
      order.currency_code,
      reference,
      {
        order_id: order.id,
        is_partial_payment: true,
        total_paid: totalPaid,
        remaining,
      }
    )

    if (chargeResult.data.status === "success") {
      // Create a new payment session for this installment using the v2 workflow
      const { result: newSession } = await createPaymentSessionsWorkflow(req.scope).run({
        input: {
          payment_collection_id: paymentCollection.id,
          provider_id: providerId,
          context: {
            email: customerEmail,
            currency_code: order.currency_code,
            amount,
            extra: {
              reference,
              is_partial_payment: true,
              authorization_code: authorizationCode,
              charge_result: chargeResult.data,
            },
          },
        },
      })

      const newRemaining = remaining - amount
      const isFullyPaid = newRemaining <= 0

      logger.info(`[Paystack] Partial payment of ${amount} processed for order ${order_id}. Remaining: ${newRemaining}`)

      return res.json({
        success: true,
        reference: chargeResult.data.reference,
        amount,
        remaining: newRemaining,
        fully_paid: isFullyPaid,
      })
    } else {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Payment failed: ${chargeResult.data.status}`
      )
    }
  } catch (error: any) {
    logger.error("Partial payment error:", error)

    if (error instanceof MedusaError) {
      return res.status(error.type === MedusaError.Types.NOT_FOUND ? 404 : 400).json({
        error: error.message,
      })
    }

    return res.status(500).json({
      error: error.message || "Failed to process partial payment",
    })
  }
}
