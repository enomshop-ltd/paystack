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

class PaystackPaymentProcessor extends AbstractPaymentProvider<PaystackPaymentProcessorConfig> {
  static identifier = "paystack";
  protected readonly configuration: PaystackPaymentProcessorConfig;
  protected readonly paystack: Paystack;
  protected readonly debug: boolean;
  protected readonly logger: Logger;
  protected readonly orderModuleService: any;

  constructor(
    cradle: { logger: Logger; orderModuleService?: any } & Record<string, unknown>,
    options: PaystackPaymentProcessorConfig,
  ) {
    super(cradle, options);
    if (!options.secret_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "The Paystack provider requires the secret_key option",
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
    this.orderModuleService = cradle.orderModuleService;
    if (this.debug) {
      this.logger.info("PS_P_Debug: PaystackPaymentProcessor initialized with options: " + JSON.stringify({ disable_retries: options.disable_retries, debug: options.debug }));
    }
  }

  async initiatePayment(
    initiatePaymentData: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: initiatePayment called with input: ${JSON.stringify(initiatePaymentData, null, 2)}`);
    }
    const { data, amount, currency_code } = initiatePaymentData;
    const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {}) as any;
    const validatedCurrencyCode = formatCurrencyCode(currency_code);
    const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];
    if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
      const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported currencies are: ${SUPPORTED_CURRENCIES.join(", ")}`;
      if (this.debug) this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
    }
    if (!email) {
      const errorMsg = "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront";
      if (this.debug) this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, errorMsg);
    }
    const paystackAmount = Math.round(Number(amount) * 100);
    
    // Standardize reference: Use order_id or cart_id if available, otherwise fallback to random
    let baseReference = customMetadata?.reference;
    let displayIdStr = "";
    
    if (!baseReference) {
      if (order_id) {
        // Try to fetch the order to get the display_id (e.g., #18)
        try {
          if (this.orderModuleService) {
            const order = await this.orderModuleService.retrieveOrder(order_id);
            if (order && order.display_id) {
              displayIdStr = `${order.display_id}-`;
            }
          }
        } catch (e) {
          if (this.debug) this.logger.warn(`PS_P_Debug: Could not fetch order ${order_id} for display_id`);
        }
        // Strip the "order_" prefix
        baseReference = order_id.replace(/^order_/, "");
      } else if (cart_id) {
        // Strip the "cart_" prefix
        baseReference = cart_id.replace(/^cart_/, "");
      } else {
        baseReference = `TX${Date.now().toString().slice(-8)}`;
      }
    }
    
    // Append a short random string to ensure uniqueness even for multiple attempts on the same order/cart
    // Format: {Display ID}-{Stripped Order/Cart ID}-{4-digit Random}
    // Example: 18-01J...-1234
    const reference = customMetadata?.reference || `${displayIdStr}${baseReference}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (this.debug) {
      this.logger.info(`PS_P_Debug: initiatePayment initializing transaction with Paystack. Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Reference: ${reference}, Email: ${email}`);
    }
    try {
      const {
        data: psData,
        status,
        message,
      } = await this.paystack.transaction.initialize({
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
      });
      if (this.debug) {
        this.logger.info(`PS_P_Debug: initiatePayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(psData, null, 2)}`);
      }
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to initiate Paystack payment",
          message,
        );
      }
      return {
        id: psData.reference,
        status: PaymentSessionStatus.PENDING,
        data: {
          paystackTxRef: psData.reference,
          paystackTxAccessCode: psData.access_code,
          paystackTxAuthorizationUrl: psData.authorization_url,
        } satisfies PaystackPaymentProviderSessionData,
      };
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: initiatePayment caught error", error);
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to initiate Paystack payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async createAccountHolder(
    input: CreateAccountHolderInput
  ): Promise<Record<string, unknown>> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: createAccountHolder called with input: ${JSON.stringify(input, null, 2)}`);
    }
    const { customer } = input.context || {};
    if (!customer?.email) {
      const mockId = `ps_mock_${Date.now()}`;
      if (this.debug) this.logger.info(`PS_P_Debug: createAccountHolder no email provided, returning mock ID: ${mockId}`);
      return { id: mockId };
    }
    try {
      if (this.debug) this.logger.info(`PS_P_Debug: createAccountHolder creating customer with Paystack for email: ${customer.email}`);
      const { data, status, message } = await this.paystack.customer.create({
        email: customer.email,
        first_name: customer.first_name ?? undefined,
        last_name: customer.last_name ?? undefined,
        phone: customer.phone ?? undefined,
      });
      if (this.debug) {
        this.logger.info(`PS_P_Debug: createAccountHolder Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(data, null, 2)}`);
      }
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          message || "Paystack API Error"
        );
      }
      return { id: data.customer_code };
    } catch (error: any) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: createAccountHolder caught error", error);
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to create Paystack customer",
        error?.toString() ?? "Unknown error"
      );
    }
  }

  async updateAccountHolder(
    input: UpdateAccountHolderInput
  ): Promise<Record<string, unknown>> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: updateAccountHolder called with input: ${JSON.stringify(input, null, 2)}`);
    }
    const { account_holder, customer } = input.context || {};
    const customerCode = account_holder?.data?.id as string | undefined;
    if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
      const returnId = customerCode || `ps_mock_${Date.now()}`;
      if (this.debug) this.logger.info(`PS_P_Debug: updateAccountHolder invalid customer code or no customer data, returning ID: ${returnId}`);
      return { id: returnId };
    }
    try {
      if (this.debug) this.logger.info(`PS_P_Debug: updateAccountHolder updating customer ${customerCode} with Paystack`);
      const { status, message } = await this.paystack.customer.update(
        customerCode,
        {
          first_name: customer.first_name ?? undefined,
          last_name: customer.last_name ?? undefined,
          phone: customer.phone ?? undefined,
        }
      );
      if (this.debug) {
        this.logger.info(`PS_P_Debug: updateAccountHolder Paystack response status: ${status}, message: ${message}`);
      }
      if (status === false) {
        if (this.debug) {
          this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
        }
      }
      return { id: customerCode };
    } catch (error: any) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: updateAccountHolder caught error", error);
      }
      return { id: customerCode };
    }
  }

  async deleteAccountHolder(
    input: DeleteAccountHolderInput
  ): Promise<void> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: deleteAccountHolder called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
    }
    return;
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: updatePayment called with input: ${JSON.stringify(input, null, 2)}`);
    }
    if (this.debug) this.logger.info("PS_P_Debug: updatePayment delegating to initiatePayment");
    const session = await this.initiatePayment(input);
    if (this.debug) this.logger.info(`PS_P_Debug: updatePayment returning session status: ${session.status}`);
    return {
      data: session.data,
      status: session.status,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: authorizePayment called with input: ${JSON.stringify(input, null, 2)}`);
    }
    try {
      const { paystackTxRef } = input.data as PaystackPaymentProviderSessionData;
      if (!paystackTxRef) {
        const errorMsg = "Missing paystackTxRef in payment data.";
        if (this.debug) this.logger.error(`PS_P_Debug: authorizePayment error: ${errorMsg}`);
        throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
      }
      if (this.debug) this.logger.info(`PS_P_Debug: authorizePayment verifying transaction ${paystackTxRef} with Paystack`);
      const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);
      if (this.debug) {
        this.logger.info(`PS_P_Debug: authorizePayment Paystack verification response status: ${psStatus}, data: ${JSON.stringify(data, null, 2)}`);
      }
      if (psStatus === false) {
        if (this.debug) this.logger.warn("PS_P_Debug: authorizePayment Paystack verification returned false status");
        return {
          status: PaymentSessionStatus.ERROR,
          data: {
            ...input.data,
            paystackTxId: data.id,
            paystackTxData: data,
          },
        };
      }
      switch (data.status) {
        case "success":
          if (this.debug) this.logger.info("PS_P_Debug: authorizePayment transaction successful, returning CAPTURED status");
          return {
            status: PaymentSessionStatus.CAPTURED,
            data: {
              ...input.data,
              paystackTxId: data.id,
              paystackTxData: data,
            },
          };
        case "failed":
          if (this.debug) this.logger.info("PS_P_Debug: authorizePayment transaction failed, returning ERROR status");
          return {
            status: PaymentSessionStatus.ERROR,
            data: {
              ...input.data,
              paystackTxId: data.id,
              paystackTxData: data,
            },
          };
        default:
          if (this.debug) this.logger.info(`PS_P_Debug: authorizePayment transaction status is ${data.status}, returning PENDING status`);
          return {
            status: PaymentSessionStatus.PENDING,
            data: {
              ...input.data,
              paystackTxId: data.id,
              paystackTxData: data,
            },
          };
      }
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: authorizePayment caught error", error);
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to authorize payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput,
  ): Promise<RetrievePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: retrievePayment called with input: ${JSON.stringify(input, null, 2)}`);
    }
    try {
      const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
      if (!paystackTxId) {
        const errorMsg = "Missing paystackTxId in payment data. This payment has not been authorized.";
        if (this.debug) this.logger.error(`PS_P_Debug: retrievePayment error: ${errorMsg}`);
        throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
      }
      if (this.debug) this.logger.info(`PS_P_Debug: retrievePayment fetching transaction ${paystackTxId} from Paystack`);
      const { data, status, message } = await this.paystack.transaction.get({ id: paystackTxId });
      if (this.debug) {
        this.logger.info(`PS_P_Debug: retrievePayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(data, null, 2)}`);
      }
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to retrieve payment",
          message,
        );
      }
      return {
        data: {
          ...input.data,
          paystackTxData: data,
        },
      };
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: retrievePayment caught error", error);
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to retrieve payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: refundPayment called with input: ${JSON.stringify(input, null, 2)}`);
    }
    try {
      const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
      if (!paystackTxId) {
        const errorMsg = "Missing paystackTxId in payment data.";
        if (this.debug) this.logger.error(`PS_P_Debug: refundPayment error: ${errorMsg}`);
        throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
      }
      const refundAmount = Math.round(Number(input.amount) * 100);
      if (this.debug) this.logger.info(`PS_P_Debug: refundPayment initiating refund with Paystack for transaction ${paystackTxId}, amount: ${refundAmount}`);
      const { data, status, message } = await this.paystack.refund.create({
        transaction: paystackTxId,
        amount: refundAmount,
      });
      if (this.debug) {
        this.logger.info(`PS_P_Debug: refundPayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(data, null, 2)}`);
      }
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to refund payment",
          message,
        );
      }
      return {
        data: {
          ...input.data,
          paystackTxData: data,
        },
      };
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: refundPayment caught error", error);
      }
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to refund payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput,
  ): Promise<GetPaymentStatusOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: getPaymentStatus called with input: ${JSON.stringify(input, null, 2)}`);
    }
    const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;
    if (!paystackTxId) {
      if (this.debug) this.logger.info("PS_P_Debug: getPaymentStatus no paystackTxId found, returning PENDING");
      return { status: PaymentSessionStatus.PENDING };
    }
    try {
      if (this.debug) this.logger.info(`PS_P_Debug: getPaymentStatus fetching transaction ${paystackTxId} from Paystack`);
      const { data, status } = await this.paystack.transaction.get({ id: paystackTxId });
      if (this.debug) {
        this.logger.info(`PS_P_Debug: getPaymentStatus Paystack response status: ${status}, data: ${JSON.stringify(data, null, 2)}`);
      }
      if (status === false) {
        if (this.debug) this.logger.warn("PS_P_Debug: getPaymentStatus Paystack returned false status, returning ERROR");
        return { status: PaymentSessionStatus.ERROR };
      }
      switch (data?.status) {
        case "success":
          if (this.debug) this.logger.info("PS_P_Debug: getPaymentStatus transaction successful, returning CAPTURED");
          return { status: PaymentSessionStatus.CAPTURED };
        case "failed":
          if (this.debug) this.logger.info("PS_P_Debug: getPaymentStatus transaction failed, returning ERROR");
          return { status: PaymentSessionStatus.ERROR };
        default:
          if (this.debug) this.logger.info(`PS_P_Debug: getPaymentStatus transaction status is ${data?.status}, returning PENDING`);
          return { status: PaymentSessionStatus.PENDING };
      }
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: getPaymentStatus caught error", error);
      }
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
    headers: Record<string, unknown>;
  }): Promise<WebhookActionResult> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: getWebhookActionAndData called for event: ${event}, reference: ${data?.reference}`);
    }
    const webhookSecretKey = this.configuration.secret_key;
    const hash = crypto
      .createHmac("sha512", webhookSecretKey)
      .update(rawData)
      .digest("hex");
    if (hash !== headers["x-paystack-signature"]) {
      if (this.debug) this.logger.warn("PS_P_Debug: getWebhookActionAndData signature mismatch");
      return { action: PaymentActions.NOT_SUPPORTED };
    }
    if (event !== "charge.success") {
      if (this.debug) this.logger.info(`PS_P_Debug: getWebhookActionAndData ignoring event type: ${event}`);
      return { action: PaymentActions.NOT_SUPPORTED };
    }
    const reference = data.reference;
    if (!reference) {
      if (this.debug) this.logger.error("PS_P_Debug: getWebhookActionAndData no reference found in webhook data");
      return { action: PaymentActions.NOT_SUPPORTED };
    }
    
    const session_id = data.metadata?.session_id;
    if (!session_id) {
      if (this.debug) this.logger.error("PS_P_Debug: getWebhookActionAndData no session_id found in webhook metadata");
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const convertedAmount = Number(data.amount) / 100;
    if (this.debug) {
      this.logger.info(`PS_P_Debug: getWebhookActionAndData returning SUCCESSFUL for session_id: ${session_id}`);
      this.logger.info(`PS_P_Debug: Webhook amount conversion - Paystack raw amount: ${data.amount}, Converted standard amount: ${convertedAmount}`);
    }
    return {
      action: PaymentActions.SUCCESSFUL,
      data: {
        session_id: session_id, 
        amount: convertedAmount,
      },
    };
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: capturePayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
    }
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: cancelPayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
    }
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: deletePayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
    }
    return { data: input.data };
  }
}

export default PaystackPaymentProcessor;