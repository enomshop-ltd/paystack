import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { render } from "@react-email/render"
import PaymentFailed from "../email-templates/payment-failed"

export default async function paymentFailedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ payment_id: string; error: string }>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const query = container.resolve("query")
  const logger = container.resolve("logger")

  try {
    // Fetch payment details with related order and customer
    const { data: payments } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "amount",
        "currency_code",
        "provider_id",
        "payment_collection.order.id",
        "payment_collection.order.display_id",
        "payment_collection.order.email",
        "payment_collection.order.customer.phone",
        "payment_collection.order.shipping_address.first_name",
        "payment_collection.order.shipping_address.last_name",
        "payment_collection.order.shipping_address.phone",
      ],
      filters: {
        id: data.payment_id,
      },
    })

    const payment = payments[0]

    if (!payment) {
      logger.warn(`Payment ${data.payment_id} not found for failure event`)
      return
    }

    const order = payment.payment_collection?.order

    if (!order || !order.email) {
      logger.warn(`Order or email not found for failed payment ${data.payment_id}`)
      return
    }

    const customerName = order.shipping_address 
      ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
      : "Customer"

    const customerPhone = order.shipping_address?.phone || order.customer?.phone

    const orderNumber = order.display_id?.toString() || order.id
    const amountFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: payment.currency_code,
    }).format(payment.amount)

    // Render the email template
    const html = await render(
      PaymentFailed({
        customerName,
        orderNumber,
        amount: payment.amount,
        currencyCode: payment.currency_code,
        errorMessage: data.error || "Payment processing failed.",
      })
    )

    // Prepare notifications array for all available channels
    const notifications: any[] = []

    // EMAIL notification to customer
    notifications.push({
      to: order.email,
      channel: "email",
      template: "payment-failed-email",
      data: {
        subject: `Action Required: Payment Failed - Order #${orderNumber}`,
        html,
      },
    })

    // SMS notification to customer (if phone number exists)
    if (customerPhone) {
      notifications.push({
        to: customerPhone,
        channel: "sms",
        template: "payment-failed-sms",
        data: {
          message: `Your payment of ${amountFormatted} for order #${orderNumber} failed. Reason: ${data.error}. Please try again.`,
          customerName,
          orderNumber,
          amount: amountFormatted,
        },
      })
    }

    // WhatsApp notification to customer (if phone number exists)
    if (customerPhone) {
      notifications.push({
        to: customerPhone,
        channel: "whatsapp",
        template: "payment-failed-whatsapp",
        data: {
          message: `Hi ${customerName}, your payment of ${amountFormatted} for order #${orderNumber} failed (${data.error}). Please update your payment method.`,
          customerName,
          orderNumber,
          amount: amountFormatted,
        },
      })
    }

    // Feed notification for admin dashboard
    notifications.push({
      to: "",
      channel: "feed",
      template: "admin-payment-failed",
      data: {
        title: "Payment Failed",
        description: `Payment of ${amountFormatted} failed for order #${orderNumber}. Reason: ${data.error}`,
      },
    })

    // Send all notifications
    await notificationModuleService.createNotifications(notifications)

    logger.info(`Payment failure notifications sent to customer ${order.email} and admin for order ${order.id}`)
  } catch (error: any) {
    logger.error(`Error sending payment failure notifications: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "payment.failed",
}
