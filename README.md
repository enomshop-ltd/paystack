# Medusa v2 Paystack Payment Plugin

A robust, production-ready Paystack payment integration for **MedusaJS v2**. This plugin not only handles standard checkouts but also introduces advanced features like partial payments, an admin payment history widget, and a failsafe cron job for missed webhooks.

## ✨ Features

- **Full Medusa v2 Compliance:** Uses the new isolated modules, file-based routing, and Admin SDK.
- **Standard Checkout:** Seamlessly process payments during the standard Medusa checkout flow.
- **Partial Payments / Installments:** Includes a custom storefront API route to allow customers to pay off an order in multiple installments. Works perfectly for both registered users and **Guest Customers** (automatically falls back to the original order email).
- **Admin Dashboard (Payments > Paystack):** 
  - **Live Account Balance:** Displays your live Paystack account balance and all-time total received directly from the Paystack API.
  - **Revenue Graph:** A beautiful bar chart visualizing your captured revenue over time.
  - **Endless Scroll History:** View your entire Paystack payment history directly in Medusa. Simply scroll to the bottom of the table to automatically load the next batch of payments.
  - **Search:** Instantly search for a specific transaction using a Medusa Order ID (e.g., `1234`) or a Paystack Transaction Reference.
- **Failsafe Cron Job:** A scheduled job runs every 15 minutes to verify and capture pending payments in case Paystack webhooks are missed or delayed. Includes rate-limiting and race-condition prevention.
- **Currency Validation:** Fails fast if a customer attempts to checkout using a currency not supported by Paystack.
- **Secure Webhooks:** Verifies Paystack webhook signatures using HMAC SHA512.

---

## 🚀 1. Backend Installation & Integration

# @enomshop/paystack

A full-featured **Medusa v2** payment plugin for [Paystack](https://paystack.com/). This plugin provides a seamless integration for accepting payments in Africa (Kenya, Nigeria, Ghana, South Africa, etc.) and globally.

---

## Features

* **Medusa v2 Ready:** Optimized for the Medusa v2 architecture and module system.
* **Integrated Admin UI:** Adds a custom Paystack management link to your Medusa Admin sidebar.
* **Webhook Support:** Robust handling of Paystack events to keep order statuses in sync.
* **Multi-Currency:** Native support for `KES`, `NGN`, `GHS`, `ZAR`, `USD`, and more.
* **Partial Payments:** Includes logic for handling flexible payment sessions.

---

## Installation

Install the package using yarn:

```bash
yarn add @enomshop/paystack

### Step 2: Environment Variables
Add your Paystack Secret Key to your backend `.env` file:
```env
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Register the Payment Provider
Update your `medusa-config.ts` to register the Paystack payment provider in the Payment Module:

```typescript
import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  modules: {
    [Modules.PAYMENT]: {
      resolve: "@medusajs/payment",
      options: {
        providers:[
          {
            resolve: "@enomshop/paystack/providers/paystack",
            options: {
              secret_key: process.env.PAYSTACK_SECRET_KEY,
              debug: process.env.NODE_ENV !== "production",
            },
          },
        ],
      },
    },
    [Modules.CACHE]: {
      resolve: "@medusajs/cache-redis",
      options: {
        redisUrl: process.env.CACHE_REDIS_URL || "redis://localhost:6379",
      },
    },
    [Modules.EVENT_BUS]: {
      resolve: "@medusajs/event-bus-redis",
      options: { 
        redisUrl: process.env.EVENTS_REDIS_URL || "redis://localhost:6379",
        jobOptions: {
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 3600, count: 1000 },
        },
      },
    },
    [Modules.WORKFLOW_ENGINE]: {
      resolve: "@medusajs/workflow-engine-redis",
      options: {
        redis: {
          redisUrl: process.env.WE_REDIS_URL || "redis://localhost:6379",
        },
      },
    },
    [Modules.LOCKING]: {
      resolve: "@medusajs/locking",
      options: {
        providers:[
          {
            resolve: "@medusajs/locking-redis",
            id: "redis",
            is_default: true,
            options: {
              redisUrl: process.env.LOCKING_REDIS_URL || "redis://localhost:6379",
            },
          },
        ],
      },
    },
    "documents": {
      resolve: "@enomshop/documents/modules/documents",
    },
  },
  plugins:[
    {
      resolve: "@enomshop/documents",
      options: {}
    },
    {
      resolve: "@enomshop/bulk-edit",
      options: {}
    },
    {
      resolve: "@enomshop/paystack",
      options: {}
    }
  ],
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  projectConfig: {
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    workerMode: process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server",
    databaseUrl: process.env.DATABASE_URL || "postgres://postgres@localhost/medusa-store",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "63595ddd-829e-44ac-a1b0-b7ddd546c0",
      cookieSecret: process.env.COOKIE_SECRET || "df878bfa-c052-4424-a7fd-d4kddkdbf5b",
    }
  }
})
```

### Step 4: Configure Webhooks in Paystack
Log in to your Paystack Dashboard, go to **Settings > API Keys & Webhooks**, and set your webhook URL to:
```text
https://<YOUR_MEDUSA_BACKEND_URL>/hooks/payment/paystack
```
*Note: Medusa v2 automatically routes webhooks to the provider based on the ID (`paystack`).*

---

## 💻 2. Storefront Implementation (Next.js / Fresh.js)

You can use this plugin in two ways on your storefront: for standard checkout, and for partial payments on an existing order.

### Scenario A: Standard Checkout Flow
During a standard checkout, you initialize the payment session using the Medusa JS Client.

```javascript
// Example in Next.js or Fresh.js
import { medusaClient } from "@lib/config"; // Your Medusa JS Client instance

const handleStandardCheckout = async (cartId, email) => {
  // 1. Initialize payment sessions for the cart
  await medusaClient.carts.createPaymentSessions(cartId);

  // 2. Select Paystack as the payment session
  const { cart } = await medusaClient.carts.setPaymentSession(cartId, {
    provider_id: "pp_paystack",
  });

  // 3. Get the Paystack authorization URL from the session data
  const paystackSession = cart.payment_collection.payment_sessions.find(
    (s) => s.provider_id === "pp_paystack"
  );
  
  const authUrl = paystackSession.data.paystackTxAuthorizationUrl;

  // 4. Redirect the user to Paystack to complete payment
  window.location.href = authUrl;
};
```

### Scenario B: Partial Payments / Installments
If an order already exists and the customer wants to pay a portion of the remaining balance, use the custom API route we created.

```javascript
// Example in Next.js or Fresh.js (e.g., on an Order Details page)
import { useState } from "react";

export default function PartialPaymentButton({ orderId, remainingBalance, customerEmail }) {
  const [amountToPay, setAmountToPay] = useState(0);
  const [loading, setLoading] = useState(false);

  const handlePartialPayment = async () => {
    if (amountToPay <= 0 || amountToPay > remainingBalance) {
      alert("Invalid amount");
      return;
    }

    setLoading(true);
    try {
      // Call the custom Medusa backend API route
      const response = await fetch(`${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/store/orders/${orderId}/paystack-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountToPay,
          email: customerEmail,
          callback_url: `${window.location.origin}/order/${orderId}/success`, // Redirect back here after payment
          metadata: {
            note: "Partial installment payment",
          }
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const { payment_session } = await response.json();

      // Redirect the user to Paystack
      window.location.href = payment_session.data.paystackTxAuthorizationUrl;
    } catch (err) {
      console.error(err);
      alert("Failed to initiate payment: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>Remaining Balance: {remainingBalance}</h3>
      <input 
        type="number" 
        value={amountToPay} 
        onChange={(e) => setAmountToPay(Number(e.target.value))} 
        max={remainingBalance}
      />
      <button onClick={handlePartialPayment} disabled={loading}>
        {loading ? "Processing..." : "Pay Installment"}
      </button>
    </div>
  );
}
```

---

## 🛡️ 3. Production Readiness Features Explained

1. **Amount Handling:** Medusa stores amounts in the lowest denomination (e.g., cents/kobo). The plugin safely passes this exact value to Paystack (`Math.round(Number(amount))`) without dangerous multipliers, preventing accidental overcharging.
2. **Cron Job Failsafe (`src/jobs/sync-paystack-payments.ts`):** 
   - Runs every 15 minutes.
   - Only checks payments older than 15 minutes to prevent race conditions with incoming webhooks.
   - Includes a `200ms` sleep delay between API calls to prevent hitting Paystack's rate limits (`429 Too Many Requests`) if you have a large backlog of abandoned checkouts.
3. **Currency Validation:** The processor checks if the cart's currency is supported by Paystack (`NGN`, `GHS`, `ZAR`, `USD`, `KES`, `EGP`, `RWF`) *before* making an API call, failing fast and returning a clean error to the storefront.
4. **Overpayment Prevention:** The partial payment API route calculates the total captured amount of all previous payments. If a customer tries to pay more than the remaining balance, the API rejects the request.
