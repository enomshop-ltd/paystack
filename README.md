# Paystack Payment Provider for Medusa v2

A fully-featured Paystack payment provider plugin for Medusa v2.13.5+ with multi-account support, admin dashboard integration, and comprehensive webhook handling.

## Features

- **Medusa v2 Architecture**: Built specifically for Medusa v2.13.5+ using the new module system
- **Multi-Account Support**: Configure and manage multiple Paystack accounts (different countries/businesses) in a single Medusa instance
- **Admin Dashboard**: Built-in admin UI for viewing:
  - Account balance
  - Transaction history
  - Manual payment recording
  - Multi-account selector
- **Webhook Support**: Automatic payment verification via Paystack webhooks
- **Failsafe Cron Job**: Scheduled job to verify pending payments (runs every 30 minutes)
- **Multi-Currency Support**: Supports KES, NGN, GHS, ZAR, USD, XOF, EGP, ZMW, UGX, RWF, TZS
- **Partial Payments/Installments**: Support for split payments
- **Standard Checkout Flow**: Seamless integration with Medusa's checkout process
- **Security**: Built-in webhook signature verification
- **Comprehensive Logging**: Detailed logs for debugging and monitoring

## Installation

```bash
npm install medusa-payment-paystack
# or
yarn add medusa-payment-paystack
# or
pnpm add medusa-payment-paystack
```

## Configuration

### Single Account Setup

Add to your `medusa-config.ts`:

```typescript
import { Modules } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ... other config
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-paystack",
            id: "paystack",
            options: {
              secret_key: process.env.PAYSTACK_SECRET_KEY,
              public_key: process.env.PAYSTACK_PUBLIC_KEY,
              webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET,
            },
          },
        ],
      },
    },
  ],
})
```

### Multi-Account Setup

Configure multiple Paystack accounts for different regions or businesses:

```typescript
import { Modules } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ... other config
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          // Kenya Account
          {
            resolve: "medusa-payment-paystack",
            id: "paystack_kenya",
            options: {
              identifier: "kenya", // Creates provider ID: pp_paystack_kenya
              secret_key: process.env.PAYSTACK_SECRET_KEY_KENYA,
              public_key: process.env.PAYSTACK_PUBLIC_KEY_KENYA,
              webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET_KENYA,
            },
          },
          // Nigeria Account
          {
            resolve: "medusa-payment-paystack",
            id: "paystack_nigeria",
            options: {
              identifier: "nigeria", // Creates provider ID: pp_paystack_nigeria
              secret_key: process.env.PAYSTACK_SECRET_KEY_NIGERIA,
              public_key: process.env.PAYSTACK_PUBLIC_KEY_NIGERIA,
              webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET_NIGERIA,
            },
          },
          // Ghana Account
          {
            resolve: "medusa-payment-paystack",
            id: "paystack_ghana",
            options: {
              identifier: "ghana", // Creates provider ID: pp_paystack_ghana
              secret_key: process.env.PAYSTACK_SECRET_KEY_GHANA,
              public_key: process.env.PAYSTACK_PUBLIC_KEY_GHANA,
              webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET_GHANA,
            },
          },
        ],
      },
    },
  ],
})
```

### Environment Variables

Create a `.env` file in your Medusa backend root:

**Single Account:**
```env
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**Multi-Account:**
```env
# Kenya
PAYSTACK_SECRET_KEY_KENYA=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY_KENYA=pk_test_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET_KENYA=whsec_xxxxxxxxxxxxx

# Nigeria
PAYSTACK_SECRET_KEY_NIGERIA=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY_NIGERIA=pk_test_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET_NIGERIA=whsec_xxxxxxxxxxxxx

# Ghana
PAYSTACK_SECRET_KEY_GHANA=sk_test_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY_GHANA=pk_test_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET_GHANA=whsec_xxxxxxxxxxxxx
```

### Webhook Configuration

Configure webhooks in your Paystack Dashboard for each account:

**Single Account:**
- Webhook URL: `https://your-backend-url.com/hooks/payment/paystack_paystack`

**Multi-Account:**
- Kenya: `https://your-backend-url.com/hooks/payment/paystack_kenya`
- Nigeria: `https://your-backend-url.com/hooks/payment/paystack_nigeria`
- Ghana: `https://your-backend-url.com/hooks/payment/paystack_ghana`

Select the following events:
- `charge.success`
- `charge.failed`

### Enable in Regions

After installation, enable the payment provider in your regions:

1. Go to Settings → Regions in your Medusa Admin
2. Edit each region
3. Add the payment provider:
   - **Single Account**: `pp_paystack_paystack`
   - **Multi-Account**: `pp_paystack_kenya`, `pp_paystack_nigeria`, or `pp_paystack_ghana`

## Usage

### Admin Dashboard

**Single Account:**

Access Paystack features in your Medusa Admin:

1. **View Balance**: Navigate to Payments → Paystack → Balance
   - Endpoint: `GET /admin/paystack/balance`
   
2. **View Transactions**: Navigate to Payments → Paystack → Transactions
   - Endpoint: `GET /admin/paystack/transactions?page=1&perPage=20`
   
3. **Record Manual Payment**: Use the admin UI or API
   - Endpoint: `POST /admin/paystack/record-manual-payment`

**Multi-Account:**

Access account-specific features using dynamic routes:

1. **View Balance**: 
   - Kenya: `GET /admin/paystack/pp_paystack_kenya/balance`
   - Nigeria: `GET /admin/paystack/pp_paystack_nigeria/balance`
   - Ghana: `GET /admin/paystack/pp_paystack_ghana/balance`
   
2. **View Transactions**: 
   - Kenya: `GET /admin/paystack/pp_paystack_kenya/transactions?page=1&perPage=20`
   - Nigeria: `GET /admin/paystack/pp_paystack_nigeria/transactions?page=1&perPage=20`
   - Ghana: `GET /admin/paystack/pp_paystack_ghana/transactions?page=1&perPage=20`

**Admin UI with Account Selector:**

```tsx
// Example: Account selector in admin dashboard
const [selectedAccount, setSelectedAccount] = useState('pp_paystack_kenya');

<Select value={selectedAccount} onChange={setSelectedAccount}>
  <option value="pp_paystack_kenya">Kenya (KES)</option>
  <option value="pp_paystack_nigeria">Nigeria (NGN)</option>
  <option value="pp_paystack_ghana">Ghana (GHS)</option>
</Select>

// Fetch data for selected account
const { data } = useQuery(['balance', selectedAccount], () => 
  fetch(`/admin/paystack/${selectedAccount}/balance`)
);
```

### Assigning Payment Providers to Regions

**Strategy 1: By Region (Geographic)**

```typescript
// Kenya region → Kenya Paystack account (KES)
Region: Kenya
Currency: KES
Payment Provider: pp_paystack_kenya

// Nigeria region → Nigeria Paystack account (NGN)
Region: Nigeria
Currency: NGN
Payment Provider: pp_paystack_nigeria

// Ghana region → Ghana Paystack account (GHS)
Region: Ghana
Currency: GHS
Payment Provider: pp_paystack_ghana
```

**Strategy 2: By Sales Channel**

```typescript
// B2C Sales Channel → Main account
Sales Channel: B2C
Payment Provider: pp_paystack_main

// B2B Sales Channel → Business account
Sales Channel: B2B
Payment Provider: pp_paystack_business

// Wholesale Sales Channel → Wholesale account
Sales Channel: Wholesale
Payment Provider: pp_paystack_wholesale
```

**Strategy 3: By Product Type**

```typescript
// Digital Products → Digital-optimized account
Product Collection: Digital Downloads
Payment Provider: pp_paystack_digital

// Physical Products → Standard account
Product Collection: Physical Goods
Payment Provider: pp_paystack_physical
```

### Storefront Integration

The plugin works with Medusa's standard checkout flow. Here's an example using the Medusa JS SDK:

```typescript
import Medusa from "@medusajs/js-sdk"

const medusa = new Medusa({ 
  baseUrl: "http://localhost:9000",
  publishableKey: "pk_..."
})

// 1. Add items to cart
const cart = await medusa.store.cart.create({
  region_id: "reg_123",
  country_code: "ke" // Kenya
})

await medusa.store.cart.lineItem.create(cart.id, {
  variant_id: "variant_123",
  quantity: 1
})

// 2. Add shipping and billing info
await medusa.store.cart.update(cart.id, {
  email: "customer@example.com",
  shipping_address: { /* ... */ },
  billing_address: { /* ... */ }
})

// 3. Select payment provider (will auto-select pp_paystack_kenya for Kenya region)
const paymentCollection = await medusa.store.payment.collection.retrieve(
  cart.payment_collection.id
)

await medusa.store.payment.collection.initiatePaymentSession(
  cart.payment_collection.id,
  {
    provider_id: "pp_paystack_kenya", // Multi-account
    // OR
    provider_id: "pp_paystack_paystack", // Single account
    data: {
      // Optional: specify payment channels
      channels: ["card", "mobile_money"] // For Ghana mobile money, etc.
    }
  }
)

// 4. Complete checkout
const order = await medusa.store.cart.complete(cart.id)

// The response includes the Paystack authorization URL
if (order.payment_collection?.payment_sessions?.[0]?.data?.authorization_url) {
  window.location.href = order.payment_collection.payment_sessions[0].data.authorization_url
}
```

### Partial Payments (Installments)

```typescript
// Storefront: Create partial payment
const response = await fetch('/store/paystack/partial-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cart_id: "cart_123",
    amount: 50000, // 500.00 in currency major units (e.g., 500 KES)
    installment_number: 1,
    total_installments: 3
  })
})

const { authorization_url } = await response.json()
window.location.href = authorization_url
```

## API Reference

### Admin Endpoints

**Single Account:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/paystack/balance` | GET | Get account balance |
| `/admin/paystack/transactions` | GET | List transactions (paginated) |
| `/admin/paystack/record-manual-payment` | POST | Record manual/offline payment |

**Multi-Account (Dynamic):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/paystack/[provider_id]/balance` | GET | Get balance for specific account |
| `/admin/paystack/[provider_id]/transactions` | GET | List transactions for specific account |
| `/admin/paystack/record-manual-payment` | POST | Record manual payment (requires provider_id in body) |

**Example Multi-Account Requests:**

```bash
# Get Kenya account balance
GET /admin/paystack/pp_paystack_kenya/balance

# Get Nigeria transactions
GET /admin/paystack/pp_paystack_nigeria/transactions?page=1&perPage=20

# Record manual payment for Ghana account
POST /admin/paystack/record-manual-payment
{
  "provider_id": "pp_paystack_ghana",
  "amount": 10000,
  "reference": "MANUAL_001",
  "customer_email": "customer@example.com"
}
```

### Store Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/store/paystack/partial-payment` | POST | Create partial payment/installment |

### Webhook Endpoint

**Single Account:**
- `/hooks/payment/paystack_paystack`

**Multi-Account:**
- `/hooks/payment/paystack_kenya`
- `/hooks/payment/paystack_nigeria`
- `/hooks/payment/paystack_ghana`
- `/hooks/payment/paystack_[identifier]` (dynamic based on configuration)

## Payment Provider ID

The payment provider is registered with the following ID pattern:

**Single Account:**
- Provider ID: `pp_paystack_paystack` (default when no identifier is specified)

**Multi-Account:**
- Pattern: `pp_paystack_[identifier]`
- Examples:
  - `pp_paystack_kenya` (when `identifier: "kenya"`)
  - `pp_paystack_nigeria` (when `identifier: "nigeria"`)
  - `pp_paystack_ghana` (when `identifier: "ghana"`)
  - `pp_paystack_business` (when `identifier: "business"`)

### Provider ID Reference Table

| Configuration `identifier` | Resulting Provider ID | Use Case |
|---------------------------|----------------------|----------|
| (none/default) | `pp_paystack_paystack` | Single account setup |
| `"kenya"` | `pp_paystack_kenya` | Kenya operations (KES) |
| `"nigeria"` | `pp_paystack_nigeria` | Nigeria operations (NGN) |
| `"ghana"` | `pp_paystack_ghana` | Ghana operations (GHS) |
| `"main"` | `pp_paystack_main` | Main business account |
| `"business"` | `pp_paystack_business` | B2B operations |
| `"wholesale"` | `pp_paystack_wholesale` | Wholesale operations |

Use this ID when:
- Enabling the provider in region settings
- Initiating payment sessions from the storefront
- Accessing admin dashboard endpoints (multi-account)

## Multi-Account Use Cases

### 1. Multi-Country Operations

Perfect for businesses operating in multiple African countries:

```typescript
// Medusa Regions Configuration
Regions:
  - Kenya Region (KES) → pp_paystack_kenya
  - Nigeria Region (NGN) → pp_paystack_nigeria
  - Ghana Region (GHS) → pp_paystack_ghana
  - South Africa Region (ZAR) → pp_paystack_south_africa

Benefits:
- Separate financial reporting per country
- Compliance with local regulations
- Settlement in local currency
- Country-specific payment methods (e.g., Ghana Mobile Money)
```

### 2. Multi-Brand Management

Manage multiple brands under one Medusa instance:

```typescript
// Sales Channel Configuration
Sales Channels:
  - Brand A (premium) → pp_paystack_brand_a
  - Brand B (budget) → pp_paystack_brand_b
  - Brand C (wholesale) → pp_paystack_brand_c

Benefits:
- Separate accounting per brand
- Independent settlement schedules
- Brand-specific analytics
```

### 3. Business Model Segmentation

Different payment flows for different business models:

```typescript
// Configuration
B2C Customers → pp_paystack_retail (standard rates)
B2B Customers → pp_paystack_corporate (corporate rates)
Marketplace Vendors → pp_paystack_marketplace (split payments)

Benefits:
- Tailored payment processing
- Different fee structures
- Separate financial tracking
```

## Scheduled Jobs

The plugin includes a scheduled job for payment verification:

**File**: `src/jobs/verify-paystack-payments.ts`

**Schedule**: Runs every 30 minutes

**Purpose**: Verifies pending payments that may have missed webhook notifications

The job automatically works with all configured Paystack accounts, verifying payments for each provider independently.

## Currency Handling

The plugin automatically handles currency conversion between Medusa's major units and Paystack's minor units (kobo/cents):

**Supported Currencies**: KES, NGN, GHS, ZAR, USD, XOF, EGP, ZMW, UGX, RWF, TZS

**Example**:
- Medusa stores: `{ amount: 1000, currency_code: "kes" }` = 1,000 KES
- Sent to Paystack: `100000` (in cents/kobo)
- Display to user: `KES 1,000.00`

**No manual conversion needed** - the plugin handles this automatically.

## Debugging

The plugin logs comprehensive information to help with debugging:

```typescript
// Example log output
[Paystack-kenya] Initializing payment for cart_123
[Paystack-kenya] Amount: 50000 (500.00 KES)
[Paystack-kenya] Reference: pay_abc123
[Paystack-kenya] Customer: customer@example.com
[Paystack-kenya] Authorization URL: https://checkout.paystack.com/xyz
[Paystack-kenya] Webhook received: charge.success
[Paystack-kenya] Payment verified: Reference pay_abc123
```

Check your Medusa backend logs for detailed payment flow information. Each account is prefixed with `[Paystack-{identifier}]` for easy filtering.

## Development

### Local Webhook Testing

Use ngrok to test webhooks locally:

```bash
# Start ngrok
ngrok http 9000

# Update webhook URL in Paystack Dashboard
# Single account:
https://your-ngrok-url.ngrok.io/hooks/payment/paystack_paystack

# Multi-account:
https://your-ngrok-url.ngrok.io/hooks/payment/paystack_kenya
https://your-ngrok-url.ngrok.io/hooks/payment/paystack_nigeria
```

## File Structure

```
medusa-payment-paystack/
├── src/
│   ├── modules/
│   │   └── paystack/
│   │       ├── service.ts                    # Main payment provider service
│   │       └── index.ts
│   ├── api/
│   │   ├── admin/
│   │   │   └── paystack/
│   │   │       ├── balance/
│   │   │       │   └── route.ts             # Single-account balance (deprecated)
│   │   │       ├── transactions/
│   │   │       │   └── route.ts             # Single-account transactions (deprecated)
│   │   │       ├── [provider_id]/
│   │   │       │   ├── balance/
│   │   │       │   │   └── route.ts         # Multi-account balance (dynamic)
│   │   │       │   └── transactions/
│   │   │       │       └── route.ts         # Multi-account transactions (dynamic)
│   │   │       └── record-manual-payment/
│   │   │           └── route.ts             # Manual payment recording
│   │   └── store/
│   │       └── paystack/
│   │           └── partial-payment/
│   │               └── route.ts             # Partial payment endpoint
│   ├── jobs/
│   │   └── verify-paystack-payments.ts       # Scheduled verification job
│   ├── types/
│   │   └── index.ts                          # PaystackOptions with identifier
│   └── index.ts
├── package.json
└── README.md
```

## Troubleshooting

### Common Issues

**1. "Provider not found" error**

**Single Account:**
- Verify the provider ID is exactly `pp_paystack_paystack`
- Check that the provider is enabled in your region settings
- Ensure `medusa-payment-paystack` is properly installed

**Multi-Account:**
- Verify the provider ID matches `pp_paystack_[identifier]` pattern
- Check the `identifier` in your `medusa-config.ts` matches the expected value
- Ensure each account is enabled in the correct regions

**2. Webhook not triggering**

- Verify webhook URL is accessible from the internet
- Check webhook secret matches in both `.env` and Paystack Dashboard
- Ensure correct webhook URL format:
  - Single: `/hooks/payment/paystack_paystack`
  - Multi: `/hooks/payment/paystack_[identifier]`
- Verify events `charge.success` and `charge.failed` are selected in Paystack Dashboard

**3. Payment amount incorrect**

- The plugin automatically converts between major and minor currency units
- Medusa stores amounts in major units (e.g., 1000 = 1,000 KES)
- Paystack expects minor units (e.g., 100000 = 1,000 KES in kobo)
- Verify you're passing amounts in Medusa's format (major units)

**4. Admin dashboard not showing Paystack data**

**Single Account:**
- Check that `/admin/paystack/balance` endpoint is accessible
- Verify API keys are correct in `.env`

**Multi-Account:**
- Check that `/admin/paystack/[provider_id]/balance` endpoint is accessible
- Verify you're using the correct provider ID in the URL
- Ensure API keys for each account are correct in `.env`

**5. Scheduled job not running**

- Verify the job file exists at `src/jobs/verify-paystack-payments.ts`
- Check Medusa backend logs for job execution
- The job runs every 30 minutes by default
- Jobs work automatically for all configured accounts

**6. Wrong currency symbol displaying**

- Ensure the region's currency code matches the Paystack account's supported currency
- Kenya account (pp_paystack_kenya) should use KES currency in region settings
- Nigeria account (pp_paystack_nigeria) should use NGN currency in region settings
- Ghana account (pp_paystack_ghana) should use GHS currency in region settings

### Multi-Account Issues

**1. "Provider Not Found Error" in Multi-Account Setup**

```bash
# Verify providers are loaded
curl http://localhost:9000/admin/payment-providers

# Should return:
[
  { "id": "pp_paystack_kenya", ... },
  { "id": "pp_paystack_nigeria", ... },
  { "id": "pp_paystack_ghana", ... }
]
```

**2. Balance/Transactions Not Loading for Specific Account**

```bash
# Test direct API call
curl -X GET http://localhost:9000/admin/paystack/pp_paystack_kenya/balance \
  -H "Authorization: Bearer {admin_token}"

# Check backend logs for:
[Paystack-kenya] Fetching balance...
[Paystack-kenya] Error: Invalid API key
```

**3. Wrong Account Processing Payment**

- Verify region configuration:
  ```bash
  # Check region payment providers
  curl http://localhost:9000/admin/regions/reg_kenya
  
  # Should show:
  {
    "region": {
      "id": "reg_kenya",
      "payment_providers": [
        { "id": "pp_paystack_kenya" }
      ]
    }
  }
  ```

### Debug Commands

```bash
# Check installed providers
npx medusa payment-providers list

# Verify provider registration (multi-account)
# Should show: pp_paystack_kenya, pp_paystack_nigeria, pp_paystack_ghana

# Test webhook locally
curl -X POST http://localhost:9000/hooks/payment/paystack_kenya \
  -H "Content-Type: application/json" \
  -H "X-Paystack-Signature: {webhook_signature}" \
  -d '{"event":"charge.success","data":{...}}'

# Check backend logs
tail -f /path/to/medusa/backend.log | grep Paystack
```

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/medusa-payment-paystack/issues)
- Medusa Discord: Join the #plugins channel
- Paystack Support: support@paystack.com

## License

MIT License - see LICENSE file for details

---

**Version**: 2.0.0  
**Medusa Version**: v2.13.5+  
**Last Updated**: 2024