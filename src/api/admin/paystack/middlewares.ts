import { authenticate } from "@medusajs/framework"
import { MiddlewareRoute } from "@medusajs/framework/http"

export const adminPaystackMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET", "POST"],
    matcher: "/admin/paystack/*",
    middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
  },
]
