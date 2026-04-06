"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const paystack_1 = __importDefault(require("../lib/paystack"));
const utils_1 = require("@medusajs/framework/utils");
const currencyCode_1 = require("../utils/currencyCode");
const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];
class PaystackPaymentProcessor extends utils_1.AbstractPaymentProvider {
    constructor(cradle, options) {
        super(cradle, options);
        if (!options.secret_key) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_ARGUMENT, "The Paystack provider requires the secret_key option");
        }
        this.configuration = options;
        this.paystack = new paystack_1.default(this.configuration.secret_key, {
            disable_retries: options.disable_retries,
            logger: cradle.logger,
            debug: Boolean(options.debug),
        });
        this.debug = Boolean(options.debug);
        this.logger = cradle.logger;
        if (this.debug) {
            this.logger.info("PS_P_Debug: PaystackPaymentProcessor initialized with options: " +
                JSON.stringify({ disable_retries: options.disable_retries, debug: options.debug }));
        }
    }
    async initiatePayment(initiatePaymentData) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: initiatePayment called with input: ${JSON.stringify(initiatePaymentData, null, 2)}`);
        }
        const { data, amount, currency_code } = initiatePaymentData;
        const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {});
        const validatedCurrencyCode = (0, currencyCode_1.formatCurrencyCode)(currency_code);
        if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
            const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`;
            if (this.debug)
                this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, errorMsg);
        }
        if (!email) {
            const errorMsg = "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront";
            if (this.debug)
                this.logger.error(`PS_P_Debug: initiatePayment error: ${errorMsg}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_ARGUMENT, errorMsg);
        }
        // FIX: Medusa already passes amounts in the lowest denomination (kobo/cents).
        // Do NOT multiply by 100 — that would result in 100x overcharges.
        const paystackAmount = Math.round(Number(amount));
        let baseReference = customMetadata?.reference;
        let displayIdStr = "";
        if (!baseReference) {
            if (order_id) {
                baseReference = order_id.replace(/^order_/, "");
            }
            else if (cart_id) {
                baseReference = `TX${Date.now().toString().slice(-8)}`;
            }
        }
        const reference = customMetadata?.reference ||
            `${displayIdStr}${baseReference}-${Math.floor(1000 + Math.random() * 9000)}`;
        if (this.debug) {
            this.logger.info(`PS_P_Debug: initiatePayment initializing. Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Ref: ${reference}`);
        }
        try {
            const { data: psData, status, message, } = await this.paystack.transaction.initialize({
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
                this.logger.info(`PS_P_Debug: initiatePayment Paystack response status: ${status}, message: ${message}`);
            }
            if (status === false) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", message);
            }
            return {
                id: psData.reference,
                data: {
                    paystackTxRef: psData.reference,
                    paystackTxAccessCode: psData.access_code,
                    paystackTxAuthorizationUrl: psData.authorization_url,
                },
            };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: initiatePayment caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", error?.toString() ?? "Unknown error");
        }
    }
    async createAccountHolder(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: createAccountHolder called with input: ${JSON.stringify(input, null, 2)}`);
        }
        const { customer } = (input.context ?? {});
        if (!customer?.email) {
            const mockId = `ps_mock_${Date.now()}`;
            if (this.debug)
                this.logger.info(`PS_P_Debug: createAccountHolder no email, returning mock ID: ${mockId}`);
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
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, message || "Paystack API Error");
            }
            return { id: data.customer_code };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: createAccountHolder caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to create Paystack customer", error?.toString() ?? "Unknown error");
        }
    }
    async updateAccountHolder(input) {
        const { account_holder, customer } = (input.context ?? {});
        const customerCode = account_holder?.data?.id;
        if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
            return { id: customerCode || `ps_mock_${Date.now()}` };
        }
        try {
            const { status, message } = await this.paystack.customer.update(customerCode, {
                first_name: customer.first_name ?? undefined,
                last_name: customer.last_name ?? undefined,
                phone: customer.phone ?? undefined,
            });
            if (status === false && this.debug) {
                this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
            }
            return { id: customerCode };
        }
        catch (error) {
            return { id: customerCode };
        }
    }
    async deleteAccountHolder(_input) {
        return;
    }
    async updatePayment(input) {
        if (this.debug) {
            this.logger.info("PS_P_Debug: updatePayment delegating to initiatePayment");
        }
        const session = await this.initiatePayment(input);
        return {
            data: session.data,
        };
    }
    async authorizePayment(input) {
        try {
            const { paystackTxRef } = input.data;
            if (!paystackTxRef) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxRef in payment data.");
            }
            const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);
            if (psStatus === false) {
                return {
                    status: utils_1.PaymentSessionStatus.ERROR,
                    data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                };
            }
            switch (data.status) {
                case "success":
                    return {
                        status: utils_1.PaymentSessionStatus.CAPTURED,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
                case "failed":
                    return {
                        status: utils_1.PaymentSessionStatus.ERROR,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
                default:
                    return {
                        status: utils_1.PaymentSessionStatus.PENDING,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
            }
        }
        catch (error) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to authorize payment", error?.toString() ?? "Unknown error");
        }
    }
    async retrievePayment(input) {
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxId in payment data. This payment has not been authorized.");
            }
            const { data, status, message } = await this.paystack.transaction.get({
                id: paystackTxId,
            });
            if (status === false) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", message);
            }
            return { data: { ...input.data, paystackTxData: data } };
        }
        catch (error) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", error?.toString() ?? "Unknown error");
        }
    }
    async refundPayment(input) {
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxId in payment data.");
            }
            // FIX: Medusa passes the refund amount already in the lowest denomination.
            // Do NOT multiply by 100.
            const refundAmount = Math.round(Number(input.amount));
            const { data, status, message } = await this.paystack.refund.create({
                transaction: paystackTxId,
                amount: refundAmount,
            });
            if (status === false) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", message);
            }
            return { data: { ...input.data, paystackTxData: data } };
        }
        catch (error) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", error?.toString() ?? "Unknown error");
        }
    }
    async getPaymentStatus(input) {
        const { paystackTxId } = input.data;
        if (!paystackTxId) {
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
        try {
            const { data, status } = await this.paystack.transaction.get({
                id: paystackTxId,
            });
            if (status === false) {
                return { status: utils_1.PaymentSessionStatus.ERROR };
            }
            switch (data?.status) {
                case "success":
                    return { status: utils_1.PaymentSessionStatus.CAPTURED };
                case "failed":
                    return { status: utils_1.PaymentSessionStatus.ERROR };
                default:
                    return { status: utils_1.PaymentSessionStatus.PENDING };
            }
        }
        catch (error) {
            return { status: utils_1.PaymentSessionStatus.ERROR };
        }
    }
    async getWebhookActionAndData({ data: { event, data }, rawData, headers, }) {
        const hash = crypto_1.default
            .createHmac("sha512", this.configuration.secret_key)
            .update(rawData)
            .digest("hex");
        if (hash !== headers["x-paystack-signature"]) {
            if (this.debug)
                this.logger.warn("PS_P_Debug: getWebhookActionAndData signature mismatch");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        if (event !== "charge.success") {
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const reference = data.reference;
        if (!reference) {
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        // Primary: session_id injected into Paystack metadata at transaction init time
        let session_id = data.metadata?.session_id;
        if (!session_id) {
            if (this.debug) {
                this.logger.error(`PS_P_Debug: getWebhookActionAndData could not resolve session_id for ref: ${reference}`);
            }
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        // FIX: Medusa requires `amount` to be a BigNumber instance, not a plain number.
        // Also do NOT divide by 100 — Paystack sends amounts in the lowest denomination,
        // which matches what Medusa expects to store.
        const amount = new utils_1.BigNumber(data.amount);
        if (this.debug) {
            this.logger.info(`PS_P_Debug: getWebhookActionAndData SUCCESSFUL for session_id: ${session_id}, amount: ${data.amount}`);
        }
        return {
            action: utils_1.PaymentActions.SUCCESSFUL,
            data: {
                session_id,
                amount,
            },
        };
    }
    async capturePayment(input) {
        return { data: input.data };
    }
    async cancelPayment(input) {
        return { data: input.data };
    }
    async deletePayment(input) {
        return { data: input.data };
    }
}
PaystackPaymentProcessor.identifier = "paystack";
exports.default = PaystackPaymentProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFNbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLG9CQUFvQixHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFL0UsTUFBTSx3QkFBeUIsU0FBUSwrQkFBdUQ7SUFPNUYsWUFDRSxNQUFxRCxFQUNyRCxPQUF1QztRQUV2QyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDeEIsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUNsQyxzREFBc0QsQ0FDdkQsQ0FBQztRQUNKLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksa0JBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRTtZQUMxRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWU7WUFDeEMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3JCLEtBQUssRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztTQUM5QixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBRTVCLElBQUks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