import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, MedusaError } from "@medusajs/framework/utils"
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
        "payment_collections.payments.*",
        "payment_collections.payments.data",
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
    const totalPaid = paymentCollection?.payments?.reduce((sum: number, payment: any) => {
      return sum + (payment.amount || 0)
    }, 0) || 0

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

    // Get the original Paystack payment to retrieve authorization
    const paystackPayment = paymentCollection?.payments?.find((p: any) =>
      p.provider_id?.startsWith("pp_paystack")
    )

    if (!paystackPayment) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Original Paystack payment not found for this order"
      )
    }

    // Resolve payment module to get the provider
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    const provider = await paymentModule.retrieveProvider(paystackPayment.provider_id) as PaystackProviderService

    // Get the payment data which should contain authorization code
    const paymentData = paystackPayment.data as any
    
    // Check if we have an authorization code from the original payment
    // This would be available if the customer used a card payment
    const authorizationCode = paymentData.authorization_code

    if (!authorizationCode) {
      // If no authorization, create a new payment session for this installment
      const reference = `${order_id}_installment_${Date.now()}`
      
      const response = await (provider as any).client_.post(
        "/transaction/initialize",
        {
          reference,
          amount: Math.round(amount * 100), // Convert to kobo
          currency: order.currency_code.toUpperCase(),
          email: customerEmail,
          metadata: {
            order_id: order.id,
            is_partial_payment: true,
            total_paid: totalPaid,
            remaining: remaining,
          },
        }
      )

      if (!response.data.status) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          response.data.message || "Failed to initialize payment"
        )
      }

      return res.json({
        success: true,
        authorization_url: response.data.data.authorization_url,
        reference: response.data.data.reference,
        amount,
        remaining: remaining - amount,
      })
    }

    // Charge using saved authorization
    const reference = `${order_id}_installment_${Date.now()}`
    
    const chargeResult = await provider.chargeAuthorization(
      authorizationCode,
      customerEmail,
      amount,
      order.currency_code,
      reference,
      {
        order_id: order.id,
        is_partial_payment: true,
        total_paid: totalPaid,
        remaining: remaining,
      }
    )

    if (chargeResult.data.status === "success") {
      // Create a payment record for this installment
      const newPayment = await paymentModule.createPayments({
        provider_id: paystackPayment.provider_id,
        amount,
        currency_code: order.currency_code,
        payment_collection_id: paymentCollection.id,
        data: {
          reference: chargeResult.data.reference,
          is_partial_payment: true,
        },
      })

      const newRemaining = remaining - amount
      const isFullyPaid = newRemaining <= 0

      logger.info(`[Paystack] Partial payment of ${amount} processed for order ${order_id}. Remaining: ${newRemaining}`)

      // Auto-capture when fully paid
      if (isFullyPaid) {
        logger.info(`[Paystack] Order ${order_id} is now fully paid, capturing all payments`)

        try {
          // Capture all payments in the collection
          for (const p of paymentCollection.payments || []) {
            if (p.captured_at === null) {
              await paymentModule.capturePayment({
                payment_id: p.id,
              })
              logger.info(`[Paystack] Captured payment ${p.id} for order ${order_id}`)
            }
          }

          // Capture the new payment
          await paymentModule.capturePayment({
            payment_id: newPayment.id,
          })
          logger.info(`[Paystack] Captured new partial payment ${newPayment.id} for order ${order_id}`)
        } catch (captureError: any) {
          logger.error(`[Paystack] Failed to auto-capture payments for order ${order_id}`, captureError)
          // Don't fail the whole request - payment is still recorded
        }
      }

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
