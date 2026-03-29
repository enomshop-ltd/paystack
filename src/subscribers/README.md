Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML``   # @enomshop/paystack  A robust, production-ready Paystack payment integration designed exclusively for **MedusaJS v2**.   This plugin does more than just process standard payments. It introduces advanced e-commerce features like partial payments/installments, real-time push-model webhooks, automatic order fulfillment, a custom Admin dashboard, and a failsafe cron job for missed webhooks.  ---  ## ✨ Features  - **Full Medusa v2 Native:** Built from the ground up using the new isolated modules architecture, Query engine, Core Flows, and Admin SDK.  - **Push Model Webhooks:** Leverages Medusa's built-in webhook system with strict HMAC SHA512 signature validation to securely verify events directly from Paystack.  - **Automatic Fulfillment & Notifications:** Automatically captures payments, verifies totals, triggers order fulfillment, and sends a `paystack-payment-success` email notification upon successful payment.  - **Partial Payments / Installments:** Includes a custom storefront API route allowing customers (and Guest Customers) to pay off an order in multiple installments.  - **Failsafe Cron Job:** A scheduled job runs every 15 minutes to verify and capture pending payments in case Paystack webhooks are missed or delayed due to network issues.  - **Strict Currency Validation:** Fails fast if a customer attempts to checkout using a currency not supported by Paystack (`NGN`, `GHS`, `ZAR`, `USD`, `KES`, `EGP`, `RWF`).  - **Feature-Rich Admin Dashboard:**    - **Live Account Balance:** Displays your live Paystack account balances and all-time totals directly from the Paystack API.    - **Revenue Graph:** A beautiful bar chart visualizing your captured revenue over time.    - **Payment History Widget:** View your entire Paystack payment history directly in Medusa.    - **Manual Payment Widget:** Record out-of-band/manual payments directly on the order details page.  ---  ## 🚀 1. Installation  Install the package via your preferred package manager:  ```bash  npm install @enomshop/paystack  # or  yarn add @enomshop/paystack   ``

⚙️ 2. Backend Configuration
---------------------------

### Step 1: Environment Variables

Add your Paystack Secret Key to your backend .env file:

codeEnv

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   `

### Step 2: Register the Plugin

Update your medusa-config.ts to register the Paystack payment provider within the Payment Module:

codeTypeScript

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   import { Modules } from "@medusajs/framework/utils"  module.exports = defineConfig({    modules: {[Modules.PAYMENT]: {        resolve: "@medusajs/payment",        options: {          providers:[            {              resolve: "@enomshop/paystack",              options: {                secret_key: process.env.PAYSTACK_SECRET_KEY,                debug: process.env.NODE_ENV !== "production",                // disable_retries: false // Optional: Disable axios retries              },            },          ],        },      },      // Ensure you have a Notification module installed (e.g., SendGrid/Resend)       // to utilize the automated email receipts!    },    plugins:[      {        resolve: "@enomshop/paystack",        options: {}      }    ]  })   `

🔗 3. Webhook Configuration (Paystack Dashboard)
------------------------------------------------

For the real-time push model to work correctly, you must point Paystack to your Medusa backend.

1.  Log in to your [Paystack Dashboard](https://www.google.com/url?sa=E&q=https://dashboard.paystack.com/).
    
2.  Navigate to **Settings > API Keys & Webhooks**.
    
3.  codeTexthttps:///hooks/payment/paystack
    
4.  Ensure the events charge.success and refund.processed are checked.
    

_Note: The plugin automatically listens to this endpoint, validates the HMAC signature, and securely triggers the order.placed subscriber to handle capture and auto-fulfillment._

💻 4. Storefront Integration (Next.js / Fresh.js)
-------------------------------------------------

You can use this plugin in two primary ways on your storefront: Standard Checkout and Partial/Installment Payments.

### Scenario A: Standard Checkout Flow

During a standard checkout, you initialize the payment session using the Medusa JS Client.

codeJavaScript

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   // Next.js or Fresh.js Example  import { medusaClient } from "@lib/config"; // Your configured Medusa JS Client  const handleStandardCheckout = async (cartId, email) => {    // 1. Initialize payment sessions for the cart    await medusaClient.carts.createPaymentSessions(cartId);    // 2. Select Paystack as the payment session    const { cart } = await medusaClient.carts.setPaymentSession(cartId, {      provider_id: "paystack", // Ensure this matches your provider ID    });    // 3. Get the Paystack authorization URL from the session data    const paystackSession = cart.payment_collection.payment_sessions.find(      (s) => s.provider_id.includes("paystack")    );    const authUrl = paystackSession.data.paystackTxAuthorizationUrl;    // 4. Redirect the user to Paystack's hosted checkout to complete payment    window.location.href = authUrl;  };   `

### Scenario B: Partial Payments / Installments

If an order already exists and you want to allow the customer to pay a portion of the remaining balance, use the custom API route exposed by this plugin.

codeJavaScript

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML``   // Next.js or Fresh.js Example (e.g., inside an Order Details component)  import { useState } from "react";  export default function PartialPaymentButton({ orderId, remainingBalance, customerEmail }) {    const [amountToPay, setAmountToPay] = useState(0);    const [loading, setLoading] = useState(false);    const handlePartialPayment = async () => {      if (amountToPay <= 0 || amountToPay > remainingBalance) {        alert("Invalid amount. Cannot exceed remaining balance.");        return;      }      setLoading(true);      try {        // Call the custom Medusa backend API route provided by the plugin        const response = await fetch(`${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/store/orders/${orderId}/paystack-payment`, {          method: "POST",          headers: {            "Content-Type": "application/json",          },          body: JSON.stringify({            amount: amountToPay,            email: customerEmail,            callback_url: `${window.location.origin}/order/${orderId}/success`, // Redirect back here after payment            metadata: {              note: "Partial installment payment",            }          }),        });        if (!response.ok) {          const error = await response.json();          throw new Error(error.message);        }        const { payment_session } = await response.json();        // Redirect the user to Paystack        window.location.href = payment_session.data.paystackTxAuthorizationUrl;      } catch (err) {        console.error(err);        alert("Failed to initiate payment: " + err.message);      } finally {        setLoading(false);      }    };    return (   ``

          `### Remaining Balance: {remainingBalance}                  type="number"           value={amountToPay}           onChange={(e) => setAmountToPay(Number(e.target.value))}           max={remainingBalance}        />          {loading ? "Processing..." : "Pay Installment"}    );  }`

🛡️ 5. Automated Background Tasks
---------------------------------

This plugin handles advanced edge cases automatically so you don't have to:

1.  **Auto-Fulfillment:** When a payment clears via Webhook, the order.placed subscriber runs the Medusa v2 createOrderFulfillmentWorkflow, attempting to automatically fulfill the purchased items immediately.
    
2.  **Automated Receipts:** Upon successful capture, it commands your Notification Module to send an email template named paystack-payment-success. Make sure this template exists in your Notification provider (e.g., SendGrid/Resend).
    
3.  **Failsafe Cron Job:** Webhooks fail. Servers go down. To prevent lost payments, a cron job automatically runs every 15 minutes, scanning for Medusa payments older than 15 minutes that haven't been captured. It verifies them directly against the Paystack API and captures/resolves the Medusa order state seamlessly.
    
4.  **Overpayment Prevention:** The partial payment API strictly calculates the total captured amount of all previous payments. If a customer tries to pay more than the remaining balance, the API safely rejects the request, protecting you from complicated refund scenarios.