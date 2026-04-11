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
        // Medusa v2 now passes the actual decimal values (e.g., passing 4000 for 4000.00 KES instead of 400000), so we should NOT multiply by 100 here. 
        // Paystack expects amounts in the lowest denomination, which is cents, so we multiply by 100.
        const paystackAmount = Math.round(Number(amount) * 100);
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
            // Medusa v2 now passes the actual decimal values (e.g., passing 4000 for 4000.00 KES instead of 400000), so we should NOT multiply by 100 here. 
            // Paystack expects amounts in the lowest denomination, which is cents, so we multiply by 100.
            const refundAmount = Math.round(Number(input.amount) * 100);
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
        const amount = new utils_1.BigNumber(Number(data.amount) / 100);
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