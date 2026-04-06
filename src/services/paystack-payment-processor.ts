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
    cradle: { logger: Logger; } & Record<string, unknown>,
    options: PaystackPaymentProcessorConfig
  ) {
    super(cradle, options);
    if (!options.secret_key) {
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

    if (this.debug) {
      this.logger.info(
        "PS_P_Debug: PaystackPaymentProcessor initialized with options: " +
          JSON.stringify({ disable_retries: options.disable_retries, debug: options.debug })
      );
    }
  }

  async initiatePayment(
    initiatePaymentData: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: initiatePayment called with input: ${JSON.stringify(initiatePaymentData, null, 2)}`
      );
    }

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

    if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
      const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`;
      if (this.debug) this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errorMsg);
    }

    if (!email) {
      const errorMsg =
        "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront";
      if (this.debug) this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
      throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, errorMsg);
    }

    // FIX: Medusa already passes amounts in the lowest denomination (kobo/cents).
    // Do NOT multiply by 100 — that would result in 100x overcharges.
    const paystackAmount = Math.round(Number(amount));

    let baseReference = customMetadata?.reference;
    let displayIdStr = "";

    if (!baseReference) {
      if (order_id) {
        baseReference = (order_id as string).replace(/^order_/, "");
      } else if (cart_id) {
        baseReference = `TX${Date.now().toString().slice(-8)}`;
      }
    }

    const reference =
      customMetadata?.reference ||
      `${displayIdStr}${baseReference}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: initiatePayment initializing. Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Ref: ${reference}`
      );
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
        this.logger.info(
          `PS_P_Debug: initiatePayment Paystack response status: ${status}, message: ${message}`
        );
      }

      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to initiate Paystack payment",
          message
        );
      }

      return {
        id: psData.reference,
        data: {
          paystackTxRef: psData.reference,
          paystackTxAccessCode: psData.access_code,
          paystackTxAuthorizationUrl: psData.authorization_url,
        } satisfies PaystackPaymentProviderSessionData,
      };
    } catch (error: any) {
      if (this.debug) {
        this.logger.error("PS_P_Debug: initiatePayment caught error", error);
      }
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
    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: createAccountHolder called with input: ${JSON.stringify(input, null, 2)}`
      );
    }
    const { customer } = (input.context ?? {}) as any;
    if (!customer?.email) {
      const mockId = `ps_mock_${Date.now()}`;
      if (this.debug)
        this.logger.info(
          `PS_P_Debug: createAccountHolder no email, returning mock ID: ${mockId}`
        );
      return { id: mockId };
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
  ): Promise<{ id: string }> {
    const { account_holder, customer } = (input.context ?? {}) as any;
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
      if (status === false && this.debug) {
        this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
      }
      return { id: customerCode };
    } catch (error: any) {
      return { id: customerCode };
    }
  }

  async deleteAccountHolder(_input: DeleteAccountHolderInput): Promise<void> {
    return;
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    if (this.debug) {
      this.logger.info("PS_P_Debug: updatePayment delegating to initiatePayment");
    }
    const session = await this.initiatePayment(input);
    return {
      data: session.data,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    try {
      const { paystackTxRef } = input.data as PaystackPaymentProviderSessionData;
      if (!paystackTxRef) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxRef in payment data."
        );
      }

      const { status: psStatus, data } =
        await this.paystack.transaction.verify(paystackTxRef);

      if (psStatus === false) {
        return {
          status: PaymentSessionStatus.ERROR,
          data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
        };
      }

      switch (data.status) {
        case "success":
          return {
            status: PaymentSessionStatus.CAPTURED,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
        case "failed":
          return {
            status: PaymentSessionStatus.ERROR,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
        default:
          return {
            status: PaymentSessionStatus.PENDING,
            data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
          };
      }
    } catch (error) {
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
    try {
      const { paystackTxId } =
        input.data as AuthorizedPaystackPaymentProviderSessionData;
      if (!paystackTxId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data. This payment has not been authorized."
        );
      }
      const { data, status, message } = await this.paystack.transaction.get({
        id: paystackTxId,
      });
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to retrieve payment",
          message
        );
      }
      return { data: { ...input.data, paystackTxData: data } };
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to retrieve payment",
        (error as any)?.toString() ?? "Unknown error"
      );
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    try {
      const { paystackTxId } =
        input.data as AuthorizedPaystackPaymentProviderSessionData;
      if (!paystackTxId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data."
        );
      }

      // FIX: Medusa passes the refund amount already in the lowest denomination.
      // Do NOT multiply by 100.
      const refundAmount = Math.round(Number(input.amount));

      const { data, status, message } = await this.paystack.refund.create({
        transaction: paystackTxId,
        amount: refundAmount,
      });
      if (status === false) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to refund payment",
          message
        );
      }
      return { data: { ...input.data, paystackTxData: data } };
    } catch (error) {
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
    const { paystackTxId } =
      input.data as AuthorizedPaystackPaymentProviderSessionData;
    if (!paystackTxId) {
      return { status: PaymentSessionStatus.PENDING };
    }
    try {
      const { data, status } = await this.paystack.transaction.get({
        id: paystackTxId,
      });
      if (status === false) {
        return { status: PaymentSessionStatus.ERROR };
      }
      switch (data?.status) {
        case "success":
          return { status: PaymentSessionStatus.CAPTURED };
        case "failed":
          return { status: PaymentSessionStatus.ERROR };
        default:
          return { status: PaymentSessionStatus.PENDING };
      }
    } catch (error) {
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
    const hash = crypto
      .createHmac("sha512", this.configuration.secret_key)
      .update(rawData)
      .digest("hex");

    if (hash !== headers["x-paystack-signature"]) {
      if (this.debug) this.logger.warn("PS_P_Debug: getWebhookActionAndData signature mismatch");
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    if (event !== "charge.success") {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const reference = data.reference;
    if (!reference) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    // Primary: session_id injected into Paystack metadata at transaction init time
    let session_id: string | undefined = data.metadata?.session_id;

    if (!session_id) {
      if (this.debug) {
        this.logger.error(
          `PS_P_Debug: getWebhookActionAndData could not resolve session_id for ref: ${reference}`
        );
      }
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    // FIX: Medusa requires `amount` to be a BigNumber instance, not a plain number.
    // Also do NOT divide by 100 — Paystack sends amounts in the lowest denomination,
    // which matches what Medusa expects to store.
    const amount = new BigNumber(data.amount);

    if (this.debug) {
      this.logger.info(
        `PS_P_Debug: getWebhookActionAndData SUCCESSFUL for session_id: ${session_id}, amount: ${data.amount}`
      );
    }

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
