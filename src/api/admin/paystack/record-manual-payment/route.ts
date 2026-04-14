import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { markPaymentCollectionAsPaid } from "@medusajs/medusa/core-flows"

/**
 * Record a manual partial payment (cash, bank transfer, mobile money, etc.)
 * This endpoint allows admins to record payments made outside of Paystack
 * 
 * POST /admin/paystack/record-manual-payment
 * Body: {
 *   order_id: string
 *   amount: number
 *   reference: string
 *   notes?: string
 * }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { order_id, amount, reference, notes } = req.body as {
      order_id: string
      amount: number
      reference: string
      notes?: string
    }

    logger.info(`[Paystack] Recording manual payment for order ${order_id}: amount=${amount}, reference=${reference}`)

    if (!order_id || !amount || !reference) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "order_id, amount, and reference are required"
      )
    }

    if (amount <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Amount must be greater than 0"
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

    const completedSessions = paymentCollection.payment_sessions?.filter((s: any) => s.status === "captured" || s.status === "authorized") || []
    const totalPaid = completedSessions.reduce((sum: number, session: any) => {
      return sum + (session.amount || 0)
    }, 0)

    const remaining = order.total - totalPaid

    logger.info(`[Paystack] Order ${order_id} - Total: ${order.total}, Paid: ${totalPaid}, Remaining: ${remaining}`)

    // Overpayment prevention
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

    // Use the markPaymentCollectionAsPaid workflow for manual payments
    // This is the v2 way of recording manual payments
    const { result } = await markPaymentCollectionAsPaid(req.scope).run({
      input: {
        order_id: order.id,
        payment_collection_id: paymentCollection.id,
      },
    })

    logger.info(`[Paystack] Manual payment recorded for order ${order_id}: amount=${amount}, reference=${reference}`)

    // Calculate new totals
    const newTotalPaid = totalPaid + amount
    const newRemaining = order.total - newTotalPaid
    const isFullyPaid = newRemaining <= 0

    logger.info(`[Paystack] Order ${order_id} - New Total Paid: ${newTotalPaid}, New Remaining: ${newRemaining}, Fully Paid: ${isFullyPaid}`)

    return res.json({
      success: true,
      payment_collection_id: paymentCollection.id,
      amount,
      reference,
      remaining: newRemaining,
      fully_paid: isFullyPaid,
    })
  } catch (error: any) {
    logger.error(`[Paystack] Manual payment recording error: ${error.message}`)

    if (error instanceof MedusaError) {
      return res.status(error.type === MedusaError.Types.NOT_FOUND ? 404 : 400).json({
        error: error.message,
      })
    }

    return res.status(500).json({
      error: error.message || "Failed to record manual payment",
    })
  }
}
