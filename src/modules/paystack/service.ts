import { AbstractPaymentProvider, BigNumber, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import { 
  Logger, 
  ProviderWebhookPayload, 
  WebhookActionResult,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput
} from "@medusajs/framework/types"
import axios, { AxiosInstance } from "axios"
import crypto from "crypto"

type InjectedDependencies = {
  logger: Logger
}

type PaystackOptions = {
  secretKey: string
  publicKey: string
  identifier?: string  // NEW: Optional custom identifier for multi-account support
}

type PaystackPaymentData = {
  reference: string
  access_code?: string
  authorization_url?: string
  amount: number
  currency: string
  status?: string
  paid_at?: string | null
}

interface PaystackInitializeResponse {
  status: boolean
  message: string
  data: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

interface PaystackVerifyResponse {
  status: boolean
  message: string
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    status: "success" | "failed" | "abandoned"
    paid_at: string | null
    authorization: {
      authorization_code: string
      bin: string
      last4: string
      exp_month: string
      exp_year: string
      channel: string
      card_type: string
      bank: string
      country_code: string
      brand: string
    }
    customer: {
      id: number
      email: string
    }
    metadata?: any
  }
}

interface PaystackChargeResponse {
  status: boolean
  message: string
  data: {
    reference: string
    status: "success" | "failed" | "pending"
    amount: number
    currency: string
  }
}

interface PaystackRefundResponse {
  status: boolean
  message: string
  data: {
    transaction: {
      id: number
      reference: string
    }
    refund: {
      amount: number
      currency: string
      status: "pending" | "processing" | "processed" | "failed"
    }
  }
}

interface PaystackBalanceResponse {
  status: boolean
  message: string
  data: {
    currency: string
    balance: number
  }[]
}

interface PaystackTransactionListResponse {
  status: boolean
  message: string
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    status: string
    paid_at: string | null
    created_at: string
    customer: {
      email: string
    }
    metadata?: {
      order_id?: string
    }
  }[]
  meta: {
    total: number
    total_volume: number
    total_value: number
    page: number
    pageCount: number
  }
}

class PaystackProviderService extends AbstractPaymentProvider<PaystackOptions> {
  static identifier = "paystack"
  
  protected logger_: Logger
  protected options_: PaystackOptions
  protected client_: AxiosInstance

  // Supported currencies by Paystack
  static SUPPORTED_CURRENCIES = [
    "NGN", // Nigerian Naira
    "GHS", // Ghanaian Cedi
    "ZAR", // South African Rand
    "KES", // Kenyan Shilling
    "USD", // US Dollar
    "XOF", // West African CFA franc
    "EGP", // Egyptian Pound
    "ZMW", // Zambian Kwacha
    "UGX", // Ugandan Shilling
    "RWF", // Rwandan Franc
    "TZS", // Tanzanian Shilling
  ]

  constructor(
    { logger }: InjectedDependencies,
    options: PaystackOptions
  ) {
    super(arguments[0], arguments[1])

    this.logger_ = logger
    this.options_ = options

    // NEW: Set custom identifier if provided (for multi-account support)
    if (options.identifier) {
      PaystackProviderService.identifier = options.identifier
    }

    // Initialize Paystack API client
    this.client_ = axios.create({
      baseURL: "https://api.paystack.co",
      headers: {
        Authorization: `Bearer ${this.options_.secretKey}`,
        "Content-Type": "application/json",
      },
    })
  }

  /**
   * Verify currency is supported by Paystack
   */
  private isCurrencySupported(currency: string): boolean {
    return PaystackProviderService.SUPPORTED_CURRENCIES.includes(currency.toUpperCase())
  }

  /**
   * Convert amount from major units to kobo (Paystack requires amount in kobo)
   * Example: 10 KES → 1000 kobo
   */
  private toPaystackAmount(amount: number): number {
    return Math.round(amount * 100)
  }

  /**
   * Convert amount from kobo to major units
   * Example: 1000 kobo → 10 KES
   */
  private fromPaystackAmount(amountInKobo: number): number {
    return amountInKobo / 100
  }

  /**
   * Generate unique reference for payment
   */
  private generateReference(): string {
    return `medusa_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    headers: Record<string, any>,
    body: any,
    rawBody: string | Buffer | undefined
  ): boolean {
    try {
      const hash = crypto
        .createHmac("sha512", this.options_.secretKey)
        .update(typeof rawBody === "string" ? rawBody : JSON.stringify(body))
        .digest("hex")

      const signature = headers["x-paystack-signature"]

      return hash === signature
    } catch (error) {
      this.logger_.error(error as Error)
      return false
    }
  }

  /**
   * Initialize payment session
   */
  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    try {
      this.logger_.info(`[Paystack] initiatePayment called with input: ${JSON.stringify(input)}`)
      const { amount, currency_code: currency, context } = input

      this.logger_.debug(`[Paystack] Validating currency: ${currency}`)
      // Validate currency
      if (!this.isCurrencySupported(currency)) {
        this.logger_.error(`[Paystack] Unsupported currency attempted: ${currency}`)
        throw new Error(`Currency ${currency} is not supported by Paystack. Supported: ${PaystackProviderService.SUPPORTED_CURRENCIES.join(", ")}`)
      }

      const numericAmount = new BigNumber(amount).numeric
      const amountInKobo = this.toPaystackAmount(numericAmount)
      this.logger_.debug(`[Paystack] Amount transformed to Kobo. Original: ${numericAmount}, Kobo: ${amountInKobo}`)

      // Generate unique reference
      const reference = this.generateReference()
      this.logger_.debug(`[Paystack] Generated unique reference: ${reference}`)

      // Access context properties safely
      const contextData = context as Record<string, any>
      const customerEmail = contextData?.email || contextData?.customer?.email || "guest@example.com"
      const cartId = contextData?.cart_id
      const customerId = contextData?.customer?.id
      
      this.logger_.debug(`[Paystack] Extracted context data. Email: ${customerEmail}, Cart ID: ${cartId}, Customer ID: ${customerId}`)

      const payload = {
        reference,
        amount: amountInKobo,
        currency: currency.toUpperCase(),
        email: customerEmail,
        metadata: {
          cart_id: cartId,
          customer_id: customerId,
        },
      }
      this.logger_.info(`[Paystack] Sending transaction/initialize request to Paystack... payload: ${JSON.stringify(payload)}`)

      // Initialize transaction with Paystack
      const response = await this.client_.post<PaystackInitializeResponse>(
        "/transaction/initialize",
        payload
      )

      this.logger_.debug(`[Paystack] Received response from transaction/initialize: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to initialize payment, Paystack returned status false: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to initialize payment")
      }

      const paymentData: PaystackPaymentData = {
        reference: response.data.data.reference,
        access_code: response.data.data.access_code,
        authorization_url: response.data.data.authorization_url,
        amount: numericAmount,
        currency: currency.toUpperCase(),
        status: "pending",
      }

      this.logger_.info(`[Paystack] Successfully initialized payment. Reference: ${paymentData.reference}`)

      return {
        id: response.data.data.reference,
        data: paymentData,
      }
    } catch (error: any) {
      this.logger_.error(`[Paystack] initiatePayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Authorize payment (verify payment was successful)
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    try {
      this.logger_.info(`[Paystack] authorizePayment called with input: ${JSON.stringify(input)}`)
      const data = input.data as PaystackPaymentData

      this.logger_.debug(`[Paystack] Requesting verification for reference: ${data.reference}`)
      // Verify transaction with Paystack
      const response = await this.client_.get<PaystackVerifyResponse>(
        `/transaction/verify/${data.reference}`
      )

      this.logger_.debug(`[Paystack] Received verification response: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to verify payment, status false: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to verify payment")
      }

      const transaction = response.data.data

      // Check if payment was successful
      if (transaction.status !== "success") {
        this.logger_.warn(`[Paystack] Payment verification returned non-success status: ${transaction.status} for reference ${data.reference}`)
        throw new Error(`Payment ${transaction.status}`)
      }

      // Update payment data
      const updatedData: PaystackPaymentData = {
        ...data,
        status: "authorized",
        paid_at: transaction.paid_at,
      }

      this.logger_.info(`[Paystack] Successfully authorized payment for reference: ${data.reference}`)
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: updatedData,
      }
    } catch (error: any) {
      this.logger_.error(`[Paystack] authorizePayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Capture payment (for Paystack, authorization = capture)
   */
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    try {
      this.logger_.info(`[Paystack] capturePayment called with input: ${JSON.stringify(input)}`)
      const data = input.data as PaystackPaymentData

      this.logger_.debug(`[Paystack] Requesting capture verification for reference: ${data.reference}`)
      // For Paystack, once authorized, payment is already captured
      // Just verify the status
      const response = await this.client_.get<PaystackVerifyResponse>(
        `/transaction/verify/${data.reference}`
      )

      this.logger_.debug(`[Paystack] Capture verification response: ${JSON.stringify(response.data)}`)

      if (!response.data.status || response.data.data.status !== "success") {
        this.logger_.error(`[Paystack] Capture verification failed: not successfully captured. Reference: ${data.reference}`)
        throw new Error("Payment not successfully captured")
      }

      const updatedData: PaystackPaymentData = {
        ...data,
        status: "captured",
      }

      this.logger_.info(`[Paystack] Payment successfully captured for reference: ${data.reference}`)
      return {
        data: updatedData,
      }
    } catch (error: any) {
      this.logger_.error(`[Paystack] capturePayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    try {
      this.logger_.info(`[Paystack] cancelPayment called with input: ${JSON.stringify(input)}`)
      const data = input.data as PaystackPaymentData

      // Paystack doesn't have an explicit cancel endpoint
      // Just mark as cancelled in our data
      const updatedData: PaystackPaymentData = {
        ...data,
        status: "cancelled",
      }

      this.logger_.info(`[Paystack] Payment successfully marked as cancelled for reference: ${data.reference}`)
      return {
        data: updatedData,
      }
    } catch (error: any) {
      this.logger_.error(`[Paystack] cancelPayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Delete payment session
   */
  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    this.logger_.info(`[Paystack] deletePayment called for data: ${JSON.stringify(input.data)}`)
    return {
      data: input.data,
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    this.logger_.info(`[Paystack] getPaymentStatus called for data: ${JSON.stringify(input.data)}`)
    const data = input.data as PaystackPaymentData

    switch (data?.status) {
      case "authorized":
      case "captured":
      case "success":
        this.logger_.debug(`[Paystack] getPaymentStatus returned AUTHORIZED for data: ${data.reference}`)
        return { status: PaymentSessionStatus.AUTHORIZED }
      case "cancelled":
        this.logger_.debug(`[Paystack] getPaymentStatus returned CANCELED for data: ${data.reference}`)
        return { status: PaymentSessionStatus.CANCELED }
      case "failed":
        this.logger_.debug(`[Paystack] getPaymentStatus returned ERROR for data: ${data.reference}`)
        return { status: PaymentSessionStatus.ERROR }
      case "pending":
      default:
        this.logger_.debug(`[Paystack] getPaymentStatus returned PENDING for data: ${data?.reference}`)
        return { status: PaymentSessionStatus.PENDING }
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    try {
      this.logger_.info(`[Paystack] refundPayment called with input: ${JSON.stringify(input)}`)
      const data = input.data as PaystackPaymentData
      const refundAmount = new BigNumber(input.amount).numeric
      const amountInKobo = this.toPaystackAmount(refundAmount)

      this.logger_.info(`[Paystack] Sending refund request for transaction ${data.reference}, amount: ${amountInKobo} Kobo`)
      const response = await this.client_.post<PaystackRefundResponse>(
        "/refund",
        {
          transaction: data.reference,
          amount: amountInKobo,
        }
      )

      this.logger_.debug(`[Paystack] Received refund response from Paystack: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to process refund, status false: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to process refund")
      }

      this.logger_.info(`[Paystack] Refund successfully processed for transaction ${data.reference}`)
      return {
        data: {
          ...data,
          refund_status: response.data.data.refund.status,
        },
      }
    } catch (error: any) {
      this.logger_.error(`[Paystack] refundPayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Retrieve payment data
   */
  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      this.logger_.info(`[Paystack] retrievePayment called with paymentSessionData: ${JSON.stringify(paymentSessionData)}`)
      const data = paymentSessionData as PaystackPaymentData

      this.logger_.debug(`[Paystack] Retrieving transaction from Paystack /verify for reference: ${data.reference}`)
      const response = await this.client_.get<PaystackVerifyResponse>(
        `/transaction/verify/${data.reference}`
      )

      this.logger_.debug(`[Paystack] Retrieve payment response from Paystack: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to retrieve payment, Paystack returned false: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to retrieve payment")
      }

      const transaction = response.data.data

      const updatedData: PaystackPaymentData = {
        ...data,
        status: transaction.status,
        paid_at: transaction.paid_at,
      }

      this.logger_.info(`[Paystack] Successfully retrieved payment for reference: ${data.reference}`)
      return updatedData as Record<string, unknown>
    } catch (error: any) {
      this.logger_.error(`[Paystack] retrievePayment error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Update payment session (e.g., amount change)
   */
  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    this.logger_.info(`[Paystack] updatePayment called with input: ${JSON.stringify(input)}`)
    this.logger_.debug(`[Paystack] Delegating to initiatePayment since Paystack requires a new payment session for amount updates`)
    // For amount updates, we need to create a new payment session
    // since Paystack doesn't support updating existing transactions
    return this.initiatePayment(input as any)
  }

  /**
   * Handle webhook events from Paystack
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    this.logger_.info(`[Paystack] getWebhookActionAndData called with payload...`)
    const webhookData = payload.data as Record<string, any>
    const event = webhookData.event as string

    this.logger_.debug(`[Paystack] Webhook event received: ${event}`)

    switch (event) {
      case "charge.success":
        this.logger_.info(`[Paystack] Webhook charge.success mapped to PaymentActions.AUTHORIZED for reference ${webhookData.data?.reference}`)
        // Payment was successful
        return {
          action: PaymentActions.AUTHORIZED,
          data: {
            session_id: webhookData.data?.reference as string,
            amount: new BigNumber(this.fromPaystackAmount(webhookData.data?.amount as number)),
          },
        }

      case "charge.failed":
        this.logger_.warn(`[Paystack] Webhook charge.failed mapped to PaymentActions.FAILED for reference ${webhookData.data?.reference}`)
        // Payment failed
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: webhookData.data?.reference as string,
            amount: new BigNumber(this.fromPaystackAmount(webhookData.data?.amount as number)),
          },
        }

      case "refund.processed":
        this.logger_.info(`[Paystack] Webhook refund.processed mapped to PaymentActions.NOT_SUPPORTED for reference ${webhookData.data?.transaction_reference}`)
        // Refund was processed
        return {
          action: PaymentActions.NOT_SUPPORTED,
          data: {
            session_id: webhookData.data?.transaction_reference as string,
            amount: new BigNumber(0),
          },
        }

      default:
        this.logger_.info(`[Paystack] Unhandled webhook event ${event} mapped to PaymentActions.NOT_SUPPORTED`)
        return {
          action: PaymentActions.NOT_SUPPORTED,
        }
    }
  }

  /**
   * Get account balance from Paystack
   */
  async getBalance(): Promise<{ currency: string; balance: number }[]> {
    try {
      this.logger_.info(`[Paystack] getBalance called, fetching balance from Paystack API...`)
      const response = await this.client_.get<PaystackBalanceResponse>("/balance")

      this.logger_.debug(`[Paystack] getBalance response: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to fetch balance: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to fetch balance")
      }

      this.logger_.info(`[Paystack] getBalance successfully fetched balances.`)
      return response.data.data.map(item => ({
        currency: item.currency,
        balance: this.fromPaystackAmount(item.balance),
      }))
    } catch (error: any) {
      this.logger_.error(`[Paystack] getBalance error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * List transactions with pagination
   */
  async listTransactions(
    page: number = 1,
    perPage: number = 50,
    search?: string
  ): Promise<PaystackTransactionListResponse> {
    try {
      this.logger_.info(`[Paystack] listTransactions called with page ${page}, perPage ${perPage}, search ${search}`)
      const params: any = {
        page,
        perPage,
      }

      if (search) {
        params.reference = search
      }

      const response = await this.client_.get<PaystackTransactionListResponse>(
        "/transaction",
        { params }
      )

      this.logger_.debug(`[Paystack] listTransactions response summary - status: ${response.data.status}, records found: ${response.data.meta?.total}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to fetch transactions: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to fetch transactions")
      }

      this.logger_.info(`[Paystack] listTransactions completed successfully.`)
      return response.data
    } catch (error: any) {
      this.logger_.error(`[Paystack] listTransactions error: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Charge a customer using saved authorization
   * Used for partial payments/installments
   */
  async chargeAuthorization(
    authorizationCode: string,
    email: string,
    amount: number,
    currency: string,
    reference: string,
    metadata?: any
  ): Promise<PaystackChargeResponse> {
    try {
      this.logger_.info(`[Paystack] chargeAuthorization called for email ${email}, authCode: ${authorizationCode}, amount: ${amount} ${currency}, reference: ${reference}`)
      const amountInKobo = this.toPaystackAmount(amount)
      this.logger_.debug(`[Paystack] Amount transformed to Kobo for chargeAuthorization: ${amountInKobo}`)

      const payload = {
        authorization_code: authorizationCode,
        email,
        amount: amountInKobo,
        currency: currency.toUpperCase(),
        reference,
        metadata,
      }

      this.logger_.debug(`[Paystack] Sending charge_authorization request to Paystack with payload: ${JSON.stringify(payload)}`)
      const response = await this.client_.post<PaystackChargeResponse>(
        "/transaction/charge_authorization",
        payload
      )

      this.logger_.debug(`[Paystack] Received charge_authorization response: ${JSON.stringify(response.data)}`)

      if (!response.data.status) {
        this.logger_.error(`[Paystack] Failed to charge authorization: ${response.data.message}`)
        throw new Error(response.data.message || "Failed to charge authorization")
      }

      this.logger_.info(`[Paystack] Successfully charged authorization for reference: ${reference}`)
      return response.data
    } catch (error: any) {
      this.logger_.error(`[Paystack] chargeAuthorization error: ${error.message}`, error)
      throw error
    }
  }
}

export default PaystackProviderService