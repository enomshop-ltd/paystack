import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { render } from "@react-email/render"
import PaymentSuccess from "../email-templates/payment-success"

export default async function paymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
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
        "payment_collection.order.shipping_address.first_name",
        "payment_collection.order.shipping_address.last_name",
      ],
      filters: {
        id: data.id,
      },
    })

    const payment = payments[0]

    if (!payment) {
      logger.warn(`Payment ${data.id} not found`)
      return
    }

    const order = payment.payment_collection?.order

    if (!order || !order.email) {
      logger.warn(`Order or email not found for payment ${data.id}`)
      return
    }

    const customerName = order.shipping_address 
      ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}`
      : "Customer"

    // Render the email template
    const html = await render(
      PaymentSuccess({
        customerName,
        orderNumber: order.display_id?.toString() || order.id,
        amount: payment.amount,
        currencyCode: payment.currency_code,
        paymentMethod: payment.provider_id === "pp_paystack_urbandevicecare" 
          ? "Paystack" 
          : "Card",
      })
    )

    // Send the notification
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "payment-success",
      data: {
        subject: `Payment Successful - Order #${order.display_id || order.id}`,
        html,
      },
    })

    logger.info(`Payment success email sent to ${order.email} for order ${order.id}`)
  } catch (error) {
    logger.error(`Error sending payment success email: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
