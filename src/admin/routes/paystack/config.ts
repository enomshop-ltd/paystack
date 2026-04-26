import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CreditCard } from "@medusajs/icons"

export default defineRouteConfig({
  label: "Paystack",
  icon: CreditCard,
  nested: [
    {
      label: "Payment Providers",
      icon: CreditCard,
    }
  ]
})