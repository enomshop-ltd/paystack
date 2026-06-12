import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PaystackPaymentProvider from "./paystack-provider";

const services: any[] = [PaystackPaymentProvider]; // Base generic provider (pp_paystack)

// Dynamically generate classes for multi-tenant / multi-account support.
// Users can pass a comma-separated list of IDs in their environment variable.
const accountsEnv = process.env.PAYSTACK_ACCOUNTS;
if (accountsEnv) {
  const accounts = accountsEnv.split(",");
  for (const account of accounts) {
    const trimmedId = account.trim();
    if (trimmedId) {
      // Generate a dynamic class that extends the core provider with a unique static identifier
      const DynamicPaystackProvider = class extends PaystackPaymentProvider {
        static identifier = trimmedId;
      };
      
      // Override the class name for cleaner debugging/logging in Medusa
      Object.defineProperty(DynamicPaystackProvider, "name", { 
        value: `PaystackPaymentProvider_${trimmedId}` 
      });

      services.push(DynamicPaystackProvider);
    }
  }
}

export default ModuleProvider(Modules.PAYMENT, {
  services,
});
