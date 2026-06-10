import crypto from "crypto";

import Paystack from "./services/paystack-client";
import { getPaystackAmount, getMedusaAmount } from "./utils/currency";

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
  type CancelPaymentInput,
  type CancelPaymentOutput,
} from "@medusajs/framework/types";
import {
  MedusaError,
  PaymentSessionStatus,
  AbstractPaymentProvider,
  PaymentActions,
} from "@medusajs/framework/utils";

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

export interface PaystackPaymentProcessorConfig extends Record<string, unknown> {
  secret_key: string;
  public_key?: string;
  debug?: boolean;
}

class PaystackPaymentProvider extends AbstractPaymentProvider<PaystackPaymentProcessorConfig> {
  static identifier = "paystack"; // Base identifier

  protected readonly configuration: PaystackPaymentProcessorConfig;
  protected readonly paystack: Paystack;
  protected readonly debug: boolean;

  constructor(
    container: Record<string, unknown>,
    options: PaystackPaymentProcessorConfig,
  ) {
    super(container, options);

    if (!options.secret_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "The Paystack provider requires the secret_key option",
      );
    }

    this.configuration = options;
    this.paystack = new Paystack(this.configuration.secret_key);
    this.debug = Boolean(options.debug);
  }

  get identifier(): string {
    // If the plugin configuration specifies a custom ID or identifier, we could use it here.
    // However, Medusa v2 typically uses the `id` defined in the medusa-config.js for provider_id.
    // For backwards compatibility and correct provider resolution, returning the static identifier is usually safe,
    // but if the user configures "id" in options, we can return it.
    return (this.configuration.id as string) || PaystackPaymentProvider.identifier;
  }

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    if (this.debug) {
      console.info("PS_P_Debug: InitiatePayment", JSON.stringify(input, null, 2));
    }

    const { data, amount, currency_code } = input;
    const contextAny = input.context as any;
    const email = (data?.email as string) || (contextAny?.email as string) || (contextAny?.customer?.email as string) || (contextAny?.billing_address?.email as string);
    const session_id = data?.session_id as string | undefined;

    if (!email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "Email is required to initiate a Paystack payment.",
      );
    }

    try {
      const paystackAmount = getPaystackAmount(Number(amount), currency_code);

      const response = await this.paystack.transaction.initialize({
        amount: paystackAmount,
        email,
        currency: currency_code.toUpperCase(),
        metadata: {
          session_id,
          ...data,
        },
      });

      if (!response.status) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to initiate Paystack payment",
          response.message,
        );
      }

      return {
        id: response.data.reference,
        status: PaymentSessionStatus.PENDING,
        data: {
          paystackTxRef: response.data.reference,
          paystackTxAccessCode: response.data.access_code,
          paystackTxAuthorizationUrl: response.data.authorization_url,
        } satisfies PaystackPaymentProviderSessionData,
      };
    } catch (error) {
      if (this.debug) console.error("PS_P_Debug: InitiatePayment: Error", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to initiate Paystack payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    if (this.debug) console.info("PS_P_Debug: UpdatePayment", JSON.stringify(input, null, 2));

    // Paystack doesn't support updating transaction amounts. 
    // We abandon the current one and create a new one.
    const session = await this.initiatePayment(input);

    return {
      data: session.data,
      status: session.status,
    };
  }

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    if (this.debug) console.info("PS_P_Debug: AuthorizePayment", JSON.stringify(input, null, 2));

    try {
      const { paystackTxRef } = input.data as PaystackPaymentProviderSessionData;

      if (!paystackTxRef) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxRef in payment data.",
        );
      }

      const response = await this.paystack.transaction.verify({ reference: paystackTxRef });

      if (!response.status) {
        return {
          status: PaymentSessionStatus.ERROR,
          data: { ...input.data, paystackTxId: response.data?.id, paystackTxData: response.data },
        };
      }

      switch (response.data.status) {
        case "success":
          // The user specifically requested "fully paid orders are automatically captured"
          // We return CAPTURED status here so Medusa marks it as captured natively.
          return {
            status: PaymentSessionStatus.CAPTURED,
            data: {
              ...input.data,
              paystackTxId: response.data.id,
              paystackTxData: response.data,
            },
          };
        case "failed":
          return {
            status: PaymentSessionStatus.ERROR,
            data: { ...input.data, paystackTxId: response.data.id, paystackTxData: response.data },
          };
        default:
          return {
            status: PaymentSessionStatus.PENDING,
            data: { ...input.data, paystackTxId: response.data.id, paystackTxData: response.data },
          };
      }
    } catch (error) {
      if (this.debug) console.error("PS_P_Debug: AuthorizePayment: Error", error);
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
    if (this.debug) console.info("PS_P_Debug: RetrievePayment", JSON.stringify(input, null, 2));

    try {
      const { paystackTxId, paystackTxRef } = input.data as AuthorizedPaystackPaymentProviderSessionData;

      if (!paystackTxId && !paystackTxRef) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId or paystackTxRef in payment data.",
        );
      }

      const response = paystackTxId 
        ? await this.paystack.transaction.get({ id: paystackTxId })
        : await this.paystack.transaction.verify({ reference: paystackTxRef });

      if (!response.status) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to retrieve payment",
          response.message,
        );
      }

      return {
        data: {
          ...input.data,
          paystackTxData: response.data,
        },
      };
    } catch (error) {
      if (this.debug) console.error("PS_P_Debug: RetrievePayment: Error", error);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Failed to retrieve payment",
        error?.toString() ?? "Unknown error",
      );
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    if (this.debug) console.info("PS_P_Debug: RefundPayment", JSON.stringify(input, null, 2));

    try {
      const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;

      if (!paystackTxId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Missing paystackTxId in payment data.",
        );
      }

      // Convert Medusa refund amount back to subunit
      // Wait, we don't have currency_code directly in RefundPaymentInput, but maybe in input.data?
      // For safety, we can get currency from paystackTxData.
      const currency = (input.data?.paystackTxData as any)?.currency || "NGN";
      const paystackAmount = getPaystackAmount(Number(input.amount), currency);

      const response = await this.paystack.refund.create({
        transaction: paystackTxId,
        amount: paystackAmount,
      });

      if (!response.status) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to refund payment",
          response.message,
        );
      }

      return {
        data: {
          ...input.data,
          paystackTxData: response.data, // Updated data
        },
      };
    } catch (error) {
      if (this.debug) console.error("PS_P_Debug: RefundPayment: Error", error);
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
    if (this.debug) console.info("PS_P_Debug: GetPaymentStatus", JSON.stringify(input, null, 2));

    const { paystackTxId } = input.data as AuthorizedPaystackPaymentProviderSessionData;

    if (!paystackTxId) {
      return { status: PaymentSessionStatus.PENDING };
    }

    try {
      const response = await this.paystack.transaction.get({ id: paystackTxId });

      if (!response.status) {
        return { status: PaymentSessionStatus.ERROR };
      }

      switch (response.data?.status) {
        case "success":
          return { status: PaymentSessionStatus.CAPTURED }; // Auto-captured in Paystack
        case "failed":
          return { status: PaymentSessionStatus.ERROR };
        default:
          return { status: PaymentSessionStatus.PENDING };
      }
    } catch (error) {
      if (this.debug) console.error("PS_P_Debug: GetPaymentStatus: Error", error);
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
        metadata?: Record<string, unknown>;
      };
    };
    rawData: string | Buffer;
    headers: Record<string, unknown>;
  }): Promise<WebhookActionResult> {
    if (this.debug) console.info("PS_P_Debug: Webhook", JSON.stringify({ event, headers }, null, 2));

    const webhookSecretKey = this.configuration.secret_key;

    // Validate webhook event
    const hash = crypto
      .createHmac("sha512", webhookSecretKey)
      .update(rawData)
      .digest("hex");

    if (hash !== headers["x-paystack-signature"]) {
      if (this.debug) console.error("PS_P_Debug: Webhook signature mismatch");
      return {
        action: PaymentActions.NOT_SUPPORTED,
      };
    }

    if (event !== "charge.success") {
      return {
        action: PaymentActions.NOT_SUPPORTED,
      };
    }

    const sessionId = data.metadata?.session_id as string | undefined;

    return {
      // By returning CAPTURED, Medusa natively considers it fully captured.
      action: PaymentActions.SUCCESSFUL, // Note: Medusa v2 webhook actions include SUCCESSFUL which triggers capture.
      data: {
        session_id: sessionId || "",
        amount: data.amount, // Paystack subunit amount
      },
    };
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentOutput> {
    // Paystack transactions are captured immediately upon success
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }
}

export default PaystackPaymentProvider;
