# Paystack Payment Provider for Medusa v2

A comprehensive Paystack payment integration for Medusa v2.13.5 with admin dashboard management, partial payments, webhook support, and automatic payment verification.

## Features

✅ **Full Medusa v2 Architecture Support**
- Isolated modules with custom data models
- File-based routing for admin and API endpoints
- Admin SDK integration

✅ **Admin Dashboard (Payments > Paystack)**
- Live account balance display across all currencies
- Beautiful revenue graph (last 30 days)
- Endless scroll transaction history
- Search by Order ID or Transaction Reference
- Order widget for recording manual payments

✅ **Webhook Support**
- Secure HMAC SHA512 signature verification
- Automatic order completion on successful payment
- Handles `charge.success`, `charge.failed`, and `refund.processed` events

✅ **Failsafe Cron Job**
- Runs every 15 minutes to verify pending payments
- Catches missed webhooks
- Rate-limiting and race-condition prevention

✅ **Multi-Currency Support**
- Supports KES, NGN, GHS, ZAR, USD, XOF, EGP, ZMW, UGX, RWF, TZS
- Automatic currency validation

✅ **Partial Payments / Installments**
- Custom storefront API for multiple payments on a single order
- Works for both registered users and guest customers
- Uses saved authorization codes when available
- Admin widget for recording manual payments
- Overpayment prevention
- Auto-capture when fully paid

✅ **Standard Checkout Flow**
- Seamless integration with Medusa checkout
- Paystack popup integration
- Correct amount handling (KES 4000 = KES 4000, not KES 40)

✅ **Security**
- Webhook signature verification
- Environment variable-based configuration
- Secure credential handling

✅ **Comprehensive Logging**
- Prefixed with `[Paystack]` for easy filtering
- INFO, WARN, ERROR, and DEBUG levels
- Full payment lifecycle tracking

## Installation & Integration

### Backend Installation

The Paystack provider is already integrated into your Medusa backend. Here's what's included:

**1. Payment Provider Module** (`src/modules/paystack/`)
- Full payment lifecycle management
- Multi-currency support
- Webhook verification
- Partial payment support

**2. Admin Routes** (`src/api/admin/paystack/`)
- `/admin/paystack/balance` - Account balance
- `/admin/paystack/transactions` - Transaction history
- `/admin/paystack/record-manual-payment` - Record manual payments

**3. Store Routes** (`src/api/store/paystack/`)
- `/store/paystack/partial-payment` - Partial payment endpoint

**4. Webhooks** (`src/api/webhooks/paystack/`)
- Automatic webhook handling at `/hooks/payment/paystack_paystack`

**5. Scheduled Jobs** (`src/jobs/`)
- Payment verification job (runs every 15 minutes)

**6. Admin Dashboard**
- Admin page at "Payments > Paystack" (`src/admin/routes/paystack/`)
- Order widget for partial payments (`src/admin/widgets/order-partial-payment.tsx`)

### Configuration Steps

1. **Get your Paystack API keys** from https://dashboard.paystack.com/#/settings/developer
   - Secret Key (starts with `sk_`)
   - Public Key (starts with `pk_`)

2. **Environment variables are already configured:**
   - `PAYSTACK_SECRET_KEY` - Your Paystack secret key
   - `PAYSTACK_PUBLIC_KEY` - Your Paystack public key

3. **Configure your Paystack webhook URL** in the Paystack dashboard:
   - URL: `https://your-backend-domain.com/hooks/payment/paystack_paystack`
   - Events: Select all payment events (`charge.*` and `refund.*`)
   - The webhook signature will be verified automatically using your secret key

4. **Enable the provider in your regions**:
   - Go to Settings > Regions in your Medusa admin
   - Edit a region (e.g., "Kenya")
   - Under "Payment Providers", enable "Paystack"
   - The provider ID is `pp_paystack_paystack`

### Admin Dashboard Access

After installation, access the Paystack management dashboard:

1. Log in to your Medusa admin
2. Navigate to **Payments > Paystack** in the sidebar
3. View:
   - Live account balance across all currencies
   - Revenue chart (last 30 days)
   - Transaction history with search
   - Endless scroll pagination

### Recording Manual Payments

On any order details page, you'll see a "Partial Payments" widget:

1. Click "Record Manual Payment"
2. Enter amount, reference code (e.g., MPESA-ABC123), and notes
3. Click "Record Payment"
4. The system prevents overpayments automatically
5. When fully paid, the order is auto-captured

## How to Use

### Standard Checkout

1. Customer proceeds to checkout
2. On the payment step, selects "Paystack"
3. Clicks "Continue to Payment"
4. Paystack popup opens
5. Customer completes payment
6. Order is automatically created

### Manual Payments (Pay on Delivery, Cash, Bank Transfer, etc.)

Admins can record manual payments made outside of Paystack directly from the order details page:

1. Navigate to an order in the admin dashboard
2. Scroll to the "Partial Payments" widget
3. Click "Record Manual Payment"
4. Enter the amount, payment reference (e.g., MPESA-ABC123, CASH-456), and optional notes
5. Click "Record Payment"

**Overpayment Prevention**: The system prevents recording payments that exceed the remaining balance.

**Auto-Capture**: When the total payments equal or exceed the order total, all payments are automatically captured and the order is marked as paid.

### Partial Payments / Installments (Storefront Integration)

Customers can pay for an order in multiple installments. Here's how to integrate this feature into your storefront:

#### API Endpoint

```typescript
POST /store/paystack/partial-payment
```

**Request Body:**
```typescript
{
  "order_id": string,        // The order ID
  "amount": number,          // Amount in major units (e.g., 2000 for KES 2000)
  "email"?: string          // Required for guest customers
}
```

**Response:**
```typescript
{
  "success": true,
  "authorization_url": string,  // Paystack checkout URL
  "reference": string,          // Payment reference
  "amount": number,             // Amount paid
  "remaining": number,          // Remaining balance
  "fully_paid": boolean         // Whether order is now fully paid
}
```

#### Storefront Example - Order Details Page

Add this component to your order details page to allow customers to make partial payments:

```tsx
import { useState } from "react"
import { sdk } from "../lib/config"

export function PartialPaymentButton({ order }: { order: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [amount, setAmount] = useState("")

  // Calculate remaining balance
  const totalPaid = order.payment_collections?.[0]?.payments?.reduce(
    (sum: number, payment: any) => sum + (payment.amount || 0),
    0
  ) || 0
  const remaining = order.total - totalPaid

  const handlePartialPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount")
      return
    }

    const paymentAmount = parseFloat(amount)

    if (paymentAmount > remaining) {
      alert(`Amount exceeds remaining balance of ${remaining}`)
      return
    }

    setIsLoading(true)

    try {
      const response = await sdk.client.fetch("/store/paystack/partial-payment", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          amount: paymentAmount,
          email: order.email,
        }),
      })

      if (response.success && response.authorization_url) {
        // Redirect to Paystack checkout
        window.location.href = response.authorization_url
      }
    } catch (error) {
      console.error("Partial payment error:", error)
      alert("Failed to process partial payment")
    } finally {
      setIsLoading(false)
    }
  }

  if (remaining <= 0) {
    return <p>Order is fully paid</p>
  }

  return (
    <div className="partial-payment">
      <h3>Pay in Installments</h3>
      <p>Remaining Balance: {remaining} {order.currency_code.toUpperCase()}</p>
      
      <input
        type="number"
        placeholder="Enter amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        max={remaining}
        min="1"
        step="1"
      />
      
      <button onClick={handlePartialPayment} disabled={isLoading}>
        {isLoading ? "Processing..." : "Pay Now"}
      </button>
    </div>
  )
}
```

#### Integration with Manual Payments

The partial payment feature works seamlessly with manual payments:

1. A customer starts an order and pays 50% online via Paystack
2. Admin records the remaining 50% as a manual payment (e.g., paid via M-PESA)
3. The system auto-captures all payments and marks the order as complete

Or vice versa:
1. Customer pays 50% via mobile money (admin records it manually)
2. Customer pays remaining 50% via the storefront partial payment API
3. Order automatically completes when fully paid

### Admin Dashboard

Access the Paystack management page:
1. Go to Payments > Paystack in the admin sidebar
2. View your live account balance
3. See revenue trends in the last 30 days
4. Search and browse all transactions
5. Scroll to load more transactions automatically

## API Endpoints

### Admin Endpoints

- `GET /admin/paystack/balance` - Get account balance
- `GET /admin/paystack/transactions?page=1&per_page=50&search=order_123` - List transactions
- `POST /admin/paystack/record-manual-payment` - Record manual payment

### Store Endpoints

- `POST /store/paystack/partial-payment` - Process partial payment / installment

### Webhook Endpoints

- `POST /hooks/payment/paystack_paystack` - Automatic webhook (configured by Medusa)
- `POST /webhooks/paystack` - Additional webhook endpoint

## Payment Provider ID

When using the Paystack provider programmatically or in your code, the provider ID is:

```
pp_paystack_paystack
```

This ID is used when:
- Filtering payment sessions
- Checking which provider a payment used
- Enabling the provider in regions via API

Example:
```typescript
// Check if a payment used Paystack
const isPaystackPayment = payment.provider_id === "pp_paystack_paystack"

// Filter only Paystack payments
const paystackPayments = payments.filter(p => 
  p.provider_id.startsWith("pp_paystack")
)
```

## Scheduled Jobs

### Payment Verification Job

Runs every 15 minutes to verify pending Paystack payments. Acts as a failsafe for missed webhooks.

Location: `src/jobs/verify-paystack-payments.ts`

## Currency Handling

**IMPORTANT**: The provider correctly handles currency amounts:

- Medusa stores amounts in major units (e.g., 10 = $10.00)
- Paystack requires amounts in kobo/cents (e.g., 1000 = $10.00)
- The provider automatically converts between them

**No more issues with KES 4000 becoming KES 40!**

### Critical: Storefront Amount Conversion

When implementing the Paystack popup in your storefront, you MUST multiply the amount by 100 before passing it to Paystack. This is because:

1. **Medusa stores amounts in whole units**: 50 NGN is stored as `50` in the database
2. **Paystack expects amounts in kobo (minor units)**: 50 NGN must be sent as `5000` kobo

**The Conversion Formula:**
```typescript
const amountInKobo = Math.round(sessionData.amount * 100)
```

**Why Math.round()?**
- Prevents floating-point precision errors (e.g., 49.99 * 100 = 4998.999999999999)
- Ensures you always send a whole number to Paystack

**Example Implementation:**

```typescript
// In your storefront checkout component (e.g., paystack-container.tsx)
const handlePayWithPaystack = () => {
  // sessionData.amount comes from the backend payment session
  // Example: sessionData.amount = 50 (which is 50 NGN)
  
  const amountInKobo = Math.round(sessionData.amount * 100)
  // Result: 5000 (which is 50 NGN in kobo)
  
  const paystackOptions = {
    key: publicKey,
    email: cart.email,
    amount: amountInKobo, // 5000, not 50
    currency: sessionData.currency,
    ref: sessionData.reference,
    onSuccess: handlePaymentSuccess,
    onClose: handlePaymentClose,
  }
  
  // Open Paystack popup
  const popup = new PaystackPop()
  popup.resumeTransaction(paystackOptions.ref)
}
```

**SECURITY: Always Use Backend-Controlled Amounts**

The `sessionData.amount` value should ALWAYS come from the backend payment session, never from user input or client-side calculations:

```typescript
// CORRECT - Amount from backend
const cart = await sdk.store.cart.retrieve(cartId, {
  fields: "+payment_collection.payment_sessions.*"
})
const sessionData = cart.payment_collection.payment_sessions.find(
  ps => ps.provider_id === "pp_paystack_paystack"
)
const amountInKobo = Math.round(sessionData.amount * 100)

// WRONG - Never calculate amount on client side
const amountInKobo = Math.round(calculateCartTotal() * 100) // DON'T DO THIS
```

**Flow Diagram:**

```
Backend (Medusa)          Storefront               Paystack API
================          ==========               ============
Cart Total: 50 NGN   -->  Receives: 50        -->  Receives: 5000 kobo
(stored as 50)            Converts: 50 * 100       (requires kobo)
                          Sends: 5000
```

**Common Mistakes to Avoid:**

1. Forgetting to multiply by 100 (sends 50 instead of 5000)
2. Multiplying backend amounts by 100 (backend already handles this)
3. Using client-side cart totals instead of backend payment session amounts
4. Not using Math.round() (causes decimal errors)

## Supported Currencies

- NGN (Nigerian Naira)
- GHS (Ghanaian Cedi)
- ZAR (South African Rand)
- KES (Kenyan Shilling) ⭐ Primary
- USD (US Dollar)
- XOF (West African CFA franc)
- EGP (Egyptian Pound)
- ZMW (Zambian Kwacha)
- UGX (Ugandan Shilling)
- RWF (Rwandan Franc)
- TZS (Tanzanian Shilling)

## Debugging & Logs

The Paystack plugin includes comprehensive logging for troubleshooting. All logs are prefixed with `[Paystack]` for easy filtering.

### Log Locations

**Backend logs:**
```bash
cd apps/backend
tail -f logs/medusa.log | grep "\[Paystack\]"
```

### Log Levels

The plugin logs at different levels:

**INFO** - Key operations:
```
[Paystack] Initiating payment
[Paystack] Payment authorized successfully
[Paystack] Payment captured successfully
[Paystack] Charge success webhook
[Paystack] Recording manual payment for order
[Paystack] Order is now fully paid, capturing all payments
```

**WARN** - Issues that don't break flow:
```
[Paystack] Unsupported currency attempted
[Paystack] Payment not successful
[Paystack] Charge failed webhook
```

**ERROR** - Failures:
```
[Paystack] Payment initialization failed
[Paystack] Payment verification failed
[Paystack] Payment capture failed
[Paystack] Failed to auto-capture payments
```

**DEBUG** - Detailed info for development:
```
[Paystack] Amount conversion
[Paystack] Verification response
[Paystack] Unsupported webhook event
```

### Common Log Patterns

**Successful payment flow:**
```
[Paystack] Initiating payment (amount: 4000, currency: KES)
[Paystack] Amount conversion (original: 4000, kobo: 400000)
[Paystack] Payment initiated successfully (reference: medusa_...)
[Paystack] Processing webhook event (event: charge.success)
[Paystack] Charge success webhook (reference: medusa_..., amount: 4000)
[Paystack] Authorizing payment
[Paystack] Payment authorized successfully
[Paystack] Capturing payment
[Paystack] Payment captured successfully
```

**Partial payment becoming full:**
```
[Paystack] Partial payment of 2000 processed for order_123. Remaining: 0
[Paystack] Order order_123 is now fully paid, capturing all payments
[Paystack] Captured payment pay_01... for order order_123
[Paystack] Captured new partial payment pay_02... for order order_123
```

**Manual payment recorded:**
```
[Paystack] Recording manual payment for order order_123 (amount: 1500, reference: MPESA-XYZ)
[Paystack] Order order_123 - Total: 4000, Paid: 2500, Remaining: 1500
[Paystack] Manual payment recorded for order order_123
[Paystack] Order order_123 - New Total Paid: 4000, New Remaining: 0, Fully Paid: true
[Paystack] Order order_123 is now fully paid, capturing payment
```

## Development

### Testing Webhooks Locally

Use a tool like ngrok to expose your local server:

```bash
ngrok http 9000
```

Then configure the ngrok URL in your Paystack dashboard:
```
https://your-ngrok-url.ngrok.io/hooks/payment/paystack_paystack
```

## File Structure

```
apps/backend/
├── src/
│   ├── modules/paystack/
│   │   ├── service.ts          # Payment provider implementation
│   │   └── index.ts            # Module export
│   ├── api/
│   │   ├── admin/paystack/
│   │   │   ├── balance/route.ts                # Balance endpoint
│   │   │   ├── transactions/route.ts           # Transactions endpoint
│   │   │   ├── record-manual-payment/route.ts  # Manual payment recording
│   │   │   └── middlewares.ts                  # Auth middleware
│   │   ├── store/paystack/
│   │   │   └── partial-payment/route.ts  # Partial payment API
│   │   └── webhooks/paystack/route.ts    # Webhook handler
│   ├── jobs/
│   │   └── verify-paystack-payments.ts   # Cron job
│   └── admin/
│       ├── lib/client.ts                     # SDK client
│       ├── routes/paystack/page.tsx          # Admin dashboard page
│       └── widgets/order-partial-payment.tsx # Order widget

apps/storefront/
├── src/
│   ├── components/
│   │   ├── paystack-container.tsx           # Paystack checkout component
│   │   └── checkout-payment-step.tsx        # Updated payment step
│   └── lib/utils/checkout.ts                # Updated with isPaystack()
```

## Troubleshooting

### Payment not completing

1. Check webhook configuration in Paystack dashboard
2. Verify webhook URL is accessible (test with curl or Postman)
3. Check backend logs for webhook errors: `grep "webhook" logs/medusa.log`
4. The cron job will auto-verify within 15 minutes as a failsafe

**Debug steps:**
```bash
# Check if webhook is being received
grep "\[Paystack\] Processing webhook event" logs/medusa.log

# Check for webhook signature failures
grep "webhook signature" logs/medusa.log

# Check for payment capture errors
grep "Failed to auto-capture" logs/medusa.log
```

### Amount showing incorrectly

The provider handles conversion automatically (KES 4000 = 400000 kobo). If amounts are wrong:

1. Check your region's currency configuration in admin
2. Verify product prices are in the correct currency
3. Check logs for amount conversion: `grep "Amount conversion" logs/medusa.log`
4. Ensure the cart total matches expected amount

**Debug steps:**
```bash
# Check amount conversions
grep "\[Paystack\] Amount conversion" logs/medusa.log
```

### Overpayment errors

If customers or admins are being blocked from making payments:

1. Check the current order total and paid amount in admin
2. Verify the payment amount doesn't exceed remaining balance
3. Check logs: `grep "exceeds remaining balance" logs/medusa.log`

### Admin page not showing

1. Ensure you've provided `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`
2. Restart the backend after adding environment variables
3. Clear browser cache and refresh
4. Check browser console for errors
5. Verify the admin route is registered: check `src/admin/routes/paystack/page.tsx` exists

### Partial payments not auto-capturing

If payments aren't being auto-captured when the order is fully paid:

1. Check logs: `grep "is now fully paid" logs/medusa.log`
2. Look for capture errors: `grep "Failed to auto-capture" logs/medusa.log`
3. Verify all payment collections are properly linked to the order
4. Check that payment amounts add up correctly

### Manual payment widget not showing

1. Verify the widget file exists: `src/admin/widgets/order-partial-payment.tsx`
2. Ensure the admin build completed successfully
3. Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)
4. Check for JavaScript errors in browser console

### Webhook signature verification failing

1. Ensure `PAYSTACK_SECRET_KEY` is correct and matches your Paystack account
2. Check that the webhook is being sent from Paystack's servers (verify IP)
3. Look for signature verification logs: `grep "webhook signature" logs/medusa.log`
4. Test webhook locally with ngrok and Paystack's webhook testing tool

## Support

For issues related to:
- **Paystack API**: https://paystack.com/docs
- **Medusa Framework**: https://docs.medusajs.com
- **This Integration**: Check the code comments for implementation details

## License

MIT License - feel free to use and modify as needed.

---

Built with ❤️ for Medusa v2.13.5
