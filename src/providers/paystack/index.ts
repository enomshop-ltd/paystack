import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PaystackPaymentProcessor from "../../services/paystack-payment-processor";

export default ModuleProvider(Modules.PAYMENT, {
  services: [PaystackPaymentProcessor],
});