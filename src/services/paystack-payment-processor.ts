import crypto from "crypto";
import Paystack from "../lib/paystack";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
  CreateAccountHolderInput,
  UpdateAccountHolderInput,
  DeleteAccountHolderInput,
  type CancelPaymentInput,
  type CancelPaymentOutput,
  Logger,
} from "@medusajs/framework/types";
import {
  MedusaError,
  PaymentSessionStatus,
  AbstractPaymentProvider,
  PaymentActions,
  BigNumber,
} from "@medusajs/framework/utils";
import { formatCurrencyCode } from "../utils/currencyCode";

export type PaystackPaymentProviderSessionData = {
  paystackTxRef: string;
  paystackTxAccessCode: string;
  paystackTxAuthorizationUrl: string;
};

export type AuthorizedPaystackPaymentProviderSessionData =
  PaystackPaymentProviderSessionData & {
    paystackTxId: number;
    paystackTxData: Record<string, unknown>;
  };

export interface PaystackPaymentProcessorConfig
  extends Record<string, unknown> {
  secret_key: string;
  disable_retries?: boolean;
  debug?: boolean;
}

const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];

class PaystackPaymentProcessor extends AbstractPaymentProvider<PaystackPaymentProcessorConfig> {
  static identifier = "paystack";
  protected readonly configuration: PaystackPaymentProcessorConfig;
  protected readonly paystack: Paystack;
  protected readonly debug: boolean;
  protected readonly logger: Logger;

  constructor(
    cradle: { logger: Logger } & Record<string, unknown>,
    options: PaystackPaymentProcessorConfig
  ) {
    super(cradle, options);
    
    cradle.logger.info("[Paystack] Initializing PaystackPaymentProcessor constructor...");

    if (!options.secret_key) {
      cradle.logger.error("[Paystack] Initialization failed: secret_key is missing.");
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "The Paystack provider requires the secret_key option"
      );
    }
    
    this.configuration = options;
    this.paystack = new Paystack(this.configuration.secret_key, {
      disable_retries: options.disable_retries,
      logger: cradle.logger,
      debug: Boolean(options.debug),
    });
    this.debug = Boolean(options.debug);
    this.logger = cradle.logger;

    this.logger.info(
      `[Paystack] Initialization complete. Config options passed: disable_retries=${options.disable_retries}, debug=${options.debug}`
    );
  }

  async initiatePayment(
    initiatePaymentData: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    this.logger.info("[Paystack - initiatePayment] Method called.");
    this.logger.info(`[Paystack - initiatePayment] Raw input data: ${JSON.stringify(initiatePaymentData, null, 2)}`);

    const { data, amount, currency_code } = initiatePaymentData;
    const {
      email,
      session_id,
      order_id,
      cart_id,
      callback_url,
      ...customMetadata
    } = (data ?? {}) as any;

    const validatedCurrencyCode = formatCurrencyCode(currency_code);
    this.logger.info(`[Paystack - initiatePayment] Validating currency: Input=${currency_code}, Validated=${validatedCurrencyCode}`);

    if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
      const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`;
      this.logger.error(`[Paystack - initiatePayment] Error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
    }

    if (!email) {
      const errorMsg =
        "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront";
      this.logger.error(`[Paystack - initiatePayment] Error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, errorMsg);
    }

    // --- AMOUNT LOGGING AND FIX ---
    this.logger.info(`[Paystack - initiatePayment] AMOUNT PROCESSING:`);
    this.logger.info(`   -> Raw Medusa Amount: ${amount}`);
    this.logger.info(`   -> Number representation: ${Number(amount)}`);
    
    // FIX applied here: actually multiplying by 100 to get to the lowest denomination
    const paystackAmount = Math.round(Number(amount) * 100); 
    
    this.logger.info(`   -> FINAL AMOUNT PASSED TO PAYSTACK (Cents/Kobo): ${paystackAmount}`);
    // ------------------------------

    let baseReference = customMetadata?.reference;
    let displayIdStr = "";

    if (!baseReference) {
      if (order_id) {
        baseReference = (order_id as string).replace(/^order_/, "");
        this.logger.info(`[Paystack - initiatePayment] Using order_id for base reference: ${baseReference}`);
      } else if (cart_id) {
        baseReference = `TX${Date.now().toString().slice(-8)}`;
        this.logger.info(`[Paystack - initiatePayment] Using cart_id fallback for base reference: ${baseReference}`);
      }
    }

    const reference =
      customMetadata?.reference ||
      `${displayIdStr}${baseReference}-${Math.floor(1000 + Math.random() * 9000)}`;

    this.logger.info(
      `[Paystack - initiatePayment] About to initialize transaction with Paystack API. Reference: ${reference}, Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Email: ${email}`
    );

    try {
      const payload = {
        amount: paystackAmount,
        email,
        currency: validatedCurrencyCode,
        reference,
        callback_url,
        metadata: {
          session_id,
          order_id,
          cart_id,
          ...customMetadata,
        },
      };

      this.logger.info(`[Paystack - initiatePayment] Sending payload to Paystack: ${JSON.stringify(payload)}`);

      const {
        data: psData,
        status,
        message,
      } = await this.paystack.transaction.initialize(payload);

      this.logger.info(
        `[Paystack - initiatePayment] Received response from Paystack API. Status: ${status}, Message: ${message}`
      );
      this.logger.info(`[Paystack - initiatePayment] Paystack response data: ${JSON.stringify(psData)}`);

      if (status === false) {
        this.logger.error(`[Paystack - initiatePayment] Failed API call. Message: ${message}`);
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to initiate Paystack payment",
          message
        );
      }

      this.logger.info("[Paystack - initiatePayment] Successfully initiated payment session.");
      return {
        id: psData.reference,
        data: {
          paystackTxRef: psData.reference,
          paystackTxAccessCode: psData.access_code,
          paystackTxAuthorizationUrl: psData.authorization_url,
        } satisfies PaystackPaymentProviderSessionData,
      };
    } catch (error: any) {
      this.logger.error("[Paystack - initiatePayment] Caught exception during API call", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to initiate Paystack payment",
        (error as any)?.toString() ?? "Unknown error"
      );
    }
  }

  async createAccountHolder(
    input: CreateAccountHolderInput
  ): Promise<{ id: string }> {
    this.logger.info(`[Paystack - createAccountHolder] Method called. Input: ${JSON.stringify(input)}`);
    const { customer } = (input.context ?? {}) as any;
    
    if (!customer?.email) {
      const mockId = `ps_mock_${Date.now()}`;
      this.logger.warn(`[Paystack - createAccountHolder] No customer email provided. Generating mock ID: ${mockId}`);
      return { id: mockId };
    }

    try {
      this.logger.info(`[Paystack - createAccountHolder] Creating customer in Paystack for email: ${customer.email}`);
      const { data, status, message } = await this.paystack.customer.create({
        email: customer.email,
        first_name: customer.first_name ?? undefined,
        last_name: customer.last_name ?? undefined,
        phone: customer.phone ?? undefined,
      });

      if (status === false) {
        this.logger.error(`[Paystack - createAccountHolder] API returned false status. Message: ${message}`);
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          message || "Paystack API Error"
        );
      }

      this.logger.info(`[Paystack - createAccountHolder] Successfully created customer. Paystack customer code: ${data.customer_code}`);
      return { id: data.customer_code };
    } catch (error: any) {
      this.logger.error("[Paystack - createAccountHolder] Caught exception", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to create Paystack customer",
        error?.toString() ?? "Unknown error"
      );
    }
  }

  async updateAccountHolder(
    input: UpdateAccountHolderInput
  ): Promise<{ id: string }> {
    this.logger.info(`[Paystack - updateAccountHolder] Method called. Input: ${JSON.stringify(input)}`);
    const { account_holder, customer } = (input.context ?? {}) as any;
    const customerCode = account_holder?.data?.id as string | undefined;

    if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
      this.logger.warn(`[Paystack - updateAccountHolder] Invalid customer code or missing customer context. customerCode: ${customerCode}`);
      return { id: customerCode || `ps_mock_${Date.now()}` };
    }

    try {
      this.logger.info(`[Paystack - updateAccountHolder] Updating Paystack customer: ${customerCode}`);
      const { status, message } = await this.paystack.customer.update(
        customerCode,
        {
          first_name: customer.first_name ?? undefined,
          last_name: customer.last_name ?? undefined,
          phone: customer.phone ?? undefined,
        }
      );

      if (status === false) {
        this.logger.error(`[Paystack - updateAccountHolder] Paystack API Error: ${message}`);
      } else {
        this.logger.info(`[Paystack - updateAccountHolder] Successfully updated customer: ${customerCode}`);
      }
      return { id: customerCode };
    } catch (error: any) {
      this.logger.error("[Paystack - updateAccountHolder] Caught exception", error);
      return { id: customerCode };
    }
  }

  async deleteAccountHolder(_input: DeleteAccountHolderInput): Promise<void> {
    this.logger.info(`[Paystack - deleteAccountHolder] Method called. No action taken as Paystack doesn't support hard customer deletes.`);
    return;
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    this.logger.info(`[Paystack - updatePayment] Method called. Delegating to initiatePayment...`);
    const session = await this.initiatePayment(input);
    return {
      data: session.data,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    this.logger.info(`[Paystack - authorizePayment] Method called. Input: ${JSON.stringify(input)}`);
    try {
      const { paystackTxRef } = input.data as PaystackPaymentProviderSessionData;
      
      if (!paystackTxRef) {
        this.logger.error("[Paystack - authorizePayment] Missing paystackTxRef in payment data.");
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxRef in payment data."
        );
      }

      this.logger.info(`[Paystack - authorizePayment] Verifying transaction with Paystack reference: ${paystackTxRef}`);
      const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);

      this.logger.info(`[Paystack - authorizePayment] Verification result - Status: ${psStatus}, Paystack Data: ${JSON.stringify(data)}`);

      if (psStatus === false) {
        this.logger.warn(`[Paystack - authorizePayment] Verification failed structurally for ref: ${paystackTxRef}`);
        return {
          status: PaymentSessionStatus.ERROR,
          data: { ...input.data, paystackTxId: data?.id, paystackTxData: data },
        };
      }

      this.logger.info(`[Paystack - authorizePayment] Transaction business status: ${data.status}`);

      switch (data.status) {
        case "success":
          this.logger.info("[Paystack - authorizePayment] Status mapped to CAPTURED");
          return {
            status: PaymentSessionStatus.CAPTURED,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
        case "failed":
          this.logger.info("[Paystack - authorizePayment] Status mapped to ERROR");
          return {
            status: PaymentSessionStatus.ERROR,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
        default:
          this.logger.info("[Paystack - authorizePayment] Status mapped to PENDING");
          return {
            status: PaymentSessionStatus.PENDING,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
      }
    } catch (error: any) {
      this.logger.error("[Paystack - authorizePayment] Caught exception", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to authorize payment",
        (error as any)?.toString() ?? "Unknown error"
      );
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    this.logger.info(`[Paystack - retrievePayment] Method called.`);
    try {
      const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
      
      if (!paystackTxId) {
        this.logger.error("[Paystack - retrievePayment] Missing paystackTxId.");
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data. This payment has not been authorized."
        );
      }

      this.logger.info(`[Paystack - retrievePayment] Fetching transaction from Paystack API. ID: ${paystackTxId}`);
      const { data, status, message } = await this.paystack.transaction.get({
        id: paystackTxId,
      });

      if (status === false) {
        this.logger.error(`[Paystack - retrievePayment] Failed to retrieve. Message: ${message}`);
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to retrieve payment",
          message
        );
      }

      this.logger.info("[Paystack - retrievePayment] Successfully retrieved payment data.");
      return { data: { ...input.data, paystackTxData: data } };
    } catch (error: any) {
      this.logger.error("[Paystack - retrievePayment] Caught exception", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to retrieve payment",
        (error as any)?.toString() ?? "Unknown error"
      );
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    this.logger.info(`[Paystack - refundPayment] Method called.`);
    try {
      const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
      
      if (!paystackTxId) {
        this.logger.error("[Paystack - refundPayment] Missing paystackTxId in payment data.");
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data."
        );
      }

      // --- AMOUNT LOGGING AND FIX ---
      this.logger.info(`[Paystack - refundPayment] AMOUNT PROCESSING:`);
      this.logger.info(`   -> Raw Medusa Request Amount: ${input.amount}`);
      this.logger.info(`   -> Number representation: ${Number(input.amount)}`);
      
      // FIX applied here: multiply by 100 as Paystack expects lowest denomination (cents)
      const refundAmount = Math.round(Number(input.amount) * 100);

      this.logger.info(`   -> FINAL REFUND AMOUNT PASSED TO PAYSTACK (Cents/Kobo): ${refundAmount}`);
      // ------------------------------

      this.logger.info(`[Paystack - refundPayment] Processing refund in Paystack API. TxID: ${paystackTxId}, Amount: ${refundAmount}`);
      const { data, status, message } = await this.paystack.refund.create({
        transaction: paystackTxId,
        amount: refundAmount,
      });

      if (status === false) {
        this.logger.error(`[Paystack - refundPayment] Refund API failed. Message: ${message}`);
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to refund payment",
          message
        );
      }

      this.logger.info(`[Paystack - refundPayment] Refund successful. Paystack Data: ${JSON.stringify(data)}`);
      return { data: { ...input.data, paystackTxData: data } };
    } catch (error: any) {
      this.logger.error("[Paystack - refundPayment] Caught exception", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to refund payment",
        (error as any)?.toString() ?? "Unknown error"
      );
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    this.logger.info(`[Paystack - getPaymentStatus] Method called.`);
    const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
    
    if (!paystackTxId) {
      this.logger.info("[Paystack - getPaymentStatus] No paystackTxId found. Returning PENDING status.");
      return { status: PaymentSessionStatus.PENDING };
    }

    try {
      this.logger.info(`[Paystack - getPaymentStatus] Fetching transaction ${paystackTxId} to determine status.`);
      const { data, status } = await this.paystack.transaction.get({
        id: paystackTxId,
      });

      if (status === false) {
        this.logger.warn(`[Paystack - getPaymentStatus] Paystack API returned false status. Assuming ERROR.`);
        return { status: PaymentSessionStatus.ERROR };
      }

      this.logger.info(`[Paystack - getPaymentStatus] Paystack status returned as: ${data?.status}`);

      switch (data?.status) {
        case "success":
          return { status: PaymentSessionStatus.CAPTURED };
        case "failed":
          return { status: PaymentSessionStatus.ERROR };
        default:
          return { status: PaymentSessionStatus.PENDING };
      }
    } catch (error: any) {
      this.logger.error("[Paystack - getPaymentStatus] Caught exception. Returning ERROR status.", error);
      return { status: PaymentSessionStatus.ERROR };
    }
  }

  async getWebhookActionAndData({
    data: { event, data },
    rawData,
    headers,
  }: {
    data: {
      event: string;
      data: {
        amount: number;
        reference: string;
        metadata?: Record<string, any>;
      };
    };
    rawData: string | Buffer;
    headers: Record<string, string>;
  }): Promise<WebhookActionResult> {
    this.logger.info(`[Paystack - getWebhookActionAndData] Webhook received. Event type: ${event}`);
    
    const hash = crypto
      .createHmac("sha512", this.configuration.secret_key)
      .update(rawData)
      .digest("hex");

    if (hash !== headers["x-paystack-signature"]) {
      this.logger.warn("[Paystack - Webhook] SECURITY WARNING: Signature mismatch. Rejecting webhook.");
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    this.logger.info("[Paystack - Webhook] Signature verified successfully.");

    if (event !== "charge.success") {
      this.logger.info(`[Paystack - Webhook] Ignoring unhandled event type: ${event}`);
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const reference = data.reference;
    if (!reference) {
      this.logger.warn("[Paystack - Webhook] Received charge.success but missing transaction reference.");
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    let session_id: string | undefined = data.metadata?.session_id;

    if (!session_id) {
      this.logger.error(`[Paystack - Webhook] Could not resolve session_id from metadata for ref: ${reference}. Metadata was: ${JSON.stringify(data.metadata)}`);
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    this.logger.info(`[Paystack - Webhook] AMOUNT PROCESSING:`);
    this.logger.info(`   -> Raw Webhook Amount from Paystack (in Cents/Kobo): ${data.amount}`);
    
    const amount = new BigNumber(Number(data.amount));
    
    this.logger.info(`   -> Parsed BigNumber Amount for Medusa: ${amount.toString()}`);

    this.logger.info(
      `[Paystack - Webhook] Webhook action resolved successfully. Returning SUCCESSFUL for session_id: ${session_id}`
    );

    return {
      action: PaymentActions.SUCCESSFUL,
      data: {
        session_id,
        amount,
      },
    };
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    this.logger.info(`[Paystack - capturePayment] Method called. Skipping capture as Paystack auto-captures on success.`);
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    this.logger.info(`[Paystack - cancelPayment] Method called. Returning existing data.`);
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    this.logger.info(`[Paystack - deletePayment] Method called. Returning existing data.`);
    return { data: input.data };
  }
}

export default PaystackPaymentProcessor;