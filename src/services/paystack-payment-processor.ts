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

  constructor(
    cradle: { logger: Logger } & Record<string, unknown>,
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
    });
    this.debug = Boolean(options.debug);
    this.logger = cradle.logger;
  }

  async initiatePayment(
    initiatePaymentData: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: InitiatePayment ${JSON.stringify(initiatePaymentData, null, 2)}`
      );
    }
    const { data, amount, currency_code } = initiatePaymentData;
    const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {}) as any;

    const validatedCurrencyCode = formatCurrencyCode(currency_code);
    const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];
    if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported currencies are: ${SUPPORTED_CURRENCIES.join(", ")}`
      );
    }

    if (!email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront",
      );
    }

    // FIX: Multiply amount by 100 for subunits
    const paystackAmount = Math.round(Number(amount) * 100);
    // FIX: Generate a custom reference
    const reference = customMetadata?.reference || `TX${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;

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
        this.logger.error("PS_P_Debug: InitiatePayment: Error", error);
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
      this.logger.info(`PS_P_Debug: createAccountHolder ${JSON.stringify(input, null, 2)}`);
    }
    const { customer } = input.context || {};
    if (!customer?.email) {
      return { id: `ps_mock_${Date.now()}` };
    }
    try {
      const { data, status, message } = await this.paystack.customer.create({
        email: customer.email,
        first_name: customer.first_name ?? undefined,
        last_name: customer.last_name ?? undefined,
        phone: customer.phone ?? undefined,
      });
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          message || "Paystack API Error"
        );
      }
      return { id: data.customer_code };
    } catch (error: any) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: createAccountHolder: Error", error);
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
      this.logger.info(`PS_P_Debug: updateAccountHolder ${JSON.stringify(input, null, 2)}`);
    }
    const { account_holder, customer } = input.context || {};
    const customerCode = account_holder?.data?.id as string | undefined;

    if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
      return { id: customerCode || `ps_mock_${Date.now()}` };
    }

    try {
      const { status, message } = await this.paystack.customer.update(
        customerCode,
        {
          first_name: customer.first_name ?? undefined,
          last_name: customer.last_name ?? undefined,
          phone: customer.phone ?? undefined,
        }
      );

      if (status === false) {
        if (this.debug) {
          this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
        }
      }
      return { id: customerCode };
    } catch (error: any) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: updateAccountHolder: Error", error);
      }
      return { id: customerCode };
    }
  }

  async deleteAccountHolder(
    input: DeleteAccountHolderInput
  ): Promise<void> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: deleteAccountHolder ${JSON.stringify(input, null, 2)}`);
    }
    return;
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    if (this.debug) {
      this.logger.info(`PS_P_Debug: UpdatePayment ${JSON.stringify(input, null, 2)}`);
    }
    const session = await this.initiatePayment(input);
    return {
      data: session.data,
      status: session.status,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: AuthorizePayment ${JSON.stringify(input, null, 2)}`
      );
    }
    try {
      const { paystackTxRef } =
        input.data as PaystackPaymentProviderSessionData;

      if (!paystackTxRef) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxRef in payment data.",
        );
      }

      const { status: psStatus, data } = await this.paystack.transaction.verify(
        paystackTxRef
      );

      if (this.debug) {
        this.logger.info(
          `PS_P_Debug: AuthorizePayment: Verification ${JSON.stringify({ psStatus, data }, null, 2)}`
        );
      }

      if (psStatus === false) {
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
          return {
            status: PaymentSessionStatus.AUTHORIZED,
            data: {
              ...input.data,
              paystackTxId: data.id,
              paystackTxData: data,
            },
          };
        case "failed":
          return {
            status: PaymentSessionStatus.ERROR,
            data: {
              ...input.data,
              paystackTxId: data.id,
              paystackTxData: data,
            },
          };
        default:
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
        this.logger.error("PS_P_Debug: AuthorizePayment: Error", error);
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
      this.logger.info(
        `PS_P_Debug: RetrievePayment ${JSON.stringify(input, null, 2)}`
      );
    }
    try {
      const { paystackTxId } =
        input.data as AuthorizedPaystackPaymentProviderSessionData;

      if (!paystackTxId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data. This payment has not been authorized.",
        );
      }

      const { data, status, message } = await this.paystack.transaction.get({
        id: paystackTxId,
      });

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
        this.logger.error("PS_P_Debug: RetrievePayment: Error", error);
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
      this.logger.info(`PS_P_Debug: RefundPayment ${JSON.stringify(input, null, 2)}`);
    }
    try {
      const { paystackTxId } =
        input.data as AuthorizedPaystackPaymentProviderSessionData;

      if (!paystackTxId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data.",
        );
      }

      const { data, status, message } = await this.paystack.refund.create({
        transaction: paystackTxId,
        amount: Math.round(Number(input.amount) * 100), // FIX: Subunit conversion
      });

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
        this.logger.error("PS_P_Debug: RefundPayment: Error", error);
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
      this.logger.info(
        `PS_P_Debug: GetPaymentStatus ${JSON.stringify(input, null, 2)}`
      );
    }
    const { paystackTxId } =
      input.data as AuthorizedPaystackPaymentProviderSessionData;

    if (!paystackTxId) {
      return { status: PaymentSessionStatus.PENDING };
    }

    try {
      const { data, status } = await this.paystack.transaction.get({
        id: paystackTxId,
      });

      if (this.debug) {
        this.logger.info(
          `PS_P_Debug: GetPaymentStatus: Verification ${JSON.stringify({ status, data }, null, 2)}`
        );
      }

      if (status === false) {
        return { status: PaymentSessionStatus.ERROR };
      }

      switch (data?.status) {
        case "success":
          return { status: PaymentSessionStatus.AUTHORIZED };
        case "failed":
          return { status: PaymentSessionStatus.ERROR };
        default:
          return { status: PaymentSessionStatus.PENDING };
      }
    } catch (error) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: GetPaymentStatus: Error", error);
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
        metadata?: Record<string, any>;
      };
    };
    rawData: string | Buffer;
    headers: Record<string, unknown>;
  }): Promise<WebhookActionResult> {
    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: Handling webhook event ${JSON.stringify({ data, headers }, null, 2)}`
      );
    }
    const webhookSecretKey = this.configuration.secret_key;

    const hash = crypto
      .createHmac("sha512", webhookSecretKey)
      .update(rawData)
      .digest("hex");

    if (hash !== headers["x-paystack-signature"]) {
      return {
        action: PaymentActions.NOT_SUPPORTED,
      };
    }

    if (event !== "charge.success") {
      return {
        action: PaymentActions.NOT_SUPPORTED,
      };
    }

    const sessionId = data.metadata?.session_id;
    const cartId = data.metadata?.cart_id;
    const orderId = data.metadata?.order_id;

    if (!sessionId && !cartId && !orderId) {
        if (this.debug) {
            this.logger.error("PS_P_Debug: No Medusa reference found in webhook metadata");
        }
        return { action: PaymentActions.NOT_SUPPORTED };
    }

    return {
        action: PaymentActions.SUCCESSFUL,
        data: {
            session_id: sessionId,
            cart_id: cartId,
            order_id: orderId,
            amount: Number(data.amount), // See Point 2 below regarding amounts
        },
    };

    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: Webhook event is valid ${JSON.stringify({ sessionId, amount: data.amount }, null, 2)}`
      );
    }

    return {
      action: PaymentActions.SUCCESSFUL, // FIX: Tell Medusa to capture automatically
      data: {
        session_id: sessionId,
        amount: Number(data.amount) / 100, // FIX: Convert from subunit back to main unit
      },
    };
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }
}

export default PaystackPaymentProcessor;