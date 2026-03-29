"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const paystack_1 = __importDefault(require("../lib/paystack"));
const utils_1 = require("@medusajs/framework/utils");
const currencyCode_1 = require("../utils/currencyCode");
class PaystackPaymentProcessor extends utils_1.AbstractPaymentProvider {
    constructor(cradle, options) {
        super(cradle, options);
        if (!options.secret_key) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_ARGUMENT, "The Paystack provider requires the secret_key option");
        }
        this.configuration = options;
        this.paystack = new paystack_1.default(this.configuration.secret_key, {
            disable_retries: options.disable_retries,
        });
        this.debug = Boolean(options.debug);
        this.logger = cradle.logger;
    }
    async initiatePayment(initiatePaymentData) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: InitiatePayment ${JSON.stringify(initiatePaymentData, null, 2)}`);
        }
        const { data, amount, currency_code } = initiatePaymentData;
        const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {});
        const validatedCurrencyCode = (0, currencyCode_1.formatCurrencyCode)(currency_code);
        const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];
        if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported currencies are: ${SUPPORTED_CURRENCIES.join(", ")}`);
        }
        if (!email) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_ARGUMENT, "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront");
        }
        // FIX: Multiply amount by 100 for subunits
        const paystackAmount = Math.round(Number(amount) * 100);
        // FIX: Generate a custom reference
        const reference = customMetadata?.reference || `TX${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
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
            if (status === false) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", message);
            }
            return {
                id: psData.reference,
                status: utils_1.PaymentSessionStatus.PENDING,
                data: {
                    paystackTxRef: psData.reference,
                    paystackTxAccessCode: psData.access_code,
                    paystackTxAuthorizationUrl: psData.authorization_url,
                },
            };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: InitiatePayment: Error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", error?.toString() ?? "Unknown error");
        }
    }
    async createAccountHolder(input) {
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
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, message || "Paystack API Error");
            }
            return { id: data.customer_code };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: createAccountHolder: Error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to create Paystack customer", error?.toString() ?? "Unknown error");
        }
    }
    async updateAccountHolder(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: updateAccountHolder ${JSON.stringify(input, null, 2)}`);
        }
        const { account_holder, customer } = input.context || {};
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
            if (status === false) {
                if (this.debug) {
                    this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
                }
            }
            return { id: customerCode };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: updateAccountHolder: Error", error);
            }
            return { id: customerCode };
        }
    }
    async deleteAccountHolder(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: deleteAccountHolder ${JSON.stringify(input, null, 2)}`);
        }
        return;
    }
    async updatePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: UpdatePayment ${JSON.stringify(input, null, 2)}`);
        }
        const session = await this.initiatePayment(input);
        return {
            data: session.data,
            status: session.status,
        };
    }
    async authorizePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: AuthorizePayment ${JSON.stringify(input, null, 2)}`);
        }
        try {
            const { paystackTxRef } = input.data;
            if (!paystackTxRef) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxRef in payment data.");
            }
            const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);
            if (this.debug) {
                this.logger.info(`PS_P_Debug: AuthorizePayment: Verification ${JSON.stringify({ psStatus, data }, null, 2)}`);
            }
            if (psStatus === false) {
                return {
                    status: utils_1.PaymentSessionStatus.ERROR,
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
                        status: utils_1.PaymentSessionStatus.AUTHORIZED,
                        data: {
                            ...input.data,
                            paystackTxId: data.id,
                            paystackTxData: data,
                        },
                    };
                case "failed":
                    return {
                        status: utils_1.PaymentSessionStatus.ERROR,
                        data: {
                            ...input.data,
                            paystackTxId: data.id,
                            paystackTxData: data,
                        },
                    };
                default:
                    return {
                        status: utils_1.PaymentSessionStatus.PENDING,
                        data: {
                            ...input.data,
                            paystackTxId: data.id,
                            paystackTxData: data,
                        },
                    };
            }
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: AuthorizePayment: Error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to authorize payment", error?.toString() ?? "Unknown error");
        }
    }
    async retrievePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: RetrievePayment ${JSON.stringify(input, null, 2)}`);
        }
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
            return {
                data: {
                    ...input.data,
                    paystackTxData: data,
                },
            };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: RetrievePayment: Error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", error?.toString() ?? "Unknown error");
        }
    }
    async refundPayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: RefundPayment ${JSON.stringify(input, null, 2)}`);
        }
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxId in payment data.");
            }
            const { data, status, message } = await this.paystack.refund.create({
                transaction: paystackTxId,
                amount: Math.round(Number(input.amount) * 100), // FIX: Subunit conversion
            });
            if (status === false) {
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", message);
            }
            return {
                data: {
                    ...input.data,
                    paystackTxData: data,
                },
            };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: RefundPayment: Error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", error?.toString() ?? "Unknown error");
        }
    }
    async getPaymentStatus(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: GetPaymentStatus ${JSON.stringify(input, null, 2)}`);
        }
        const { paystackTxId } = input.data;
        if (!paystackTxId) {
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
        try {
            const { data, status } = await this.paystack.transaction.get({
                id: paystackTxId,
            });
            if (this.debug) {
                this.logger.info(`PS_P_Debug: GetPaymentStatus: Verification ${JSON.stringify({ status, data }, null, 2)}`);
            }
            if (status === false) {
                return { status: utils_1.PaymentSessionStatus.ERROR };
            }
            switch (data?.status) {
                case "success":
                    return { status: utils_1.PaymentSessionStatus.AUTHORIZED };
                case "failed":
                    return { status: utils_1.PaymentSessionStatus.ERROR };
                default:
                    return { status: utils_1.PaymentSessionStatus.PENDING };
            }
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: GetPaymentStatus: Error", error);
            }
            return { status: utils_1.PaymentSessionStatus.ERROR };
        }
    }
    async getWebhookActionAndData({ data: { event, data }, rawData, headers, }) {
        // ... hash validation remains the same ...
        const webhookSecretKey = this.configuration.secret_key;
        const hash = crypto_1.default
            .createHmac("sha512", webhookSecretKey)
            .update(rawData)
            .digest("hex");
        if (hash !== headers["x-paystack-signature"]) {
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        if (event !== "charge.success") {
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const reference = data.reference;
        if (!reference) {
            if (this.debug)
                this.logger.error("PS_P_Debug: No reference found in webhook data");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        return {
            action: utils_1.PaymentActions.SUCCESSFUL,
            data: {
                session_id: reference,
                amount: Math.round(Number(data.amount)),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFLbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLHdCQUF5QixTQUFRLCtCQUF1RDtJQU81RixZQUNFLE1BQW9ELEVBQ3BELE9BQXVDO1FBRXZDLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQ2xDLHNEQUFzRCxDQUN2RCxDQUFDO1FBQ0osQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDO1FBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFO1lBQzFELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZTtTQUN6QyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUNuQixtQkFBeUM7UUFFekMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDZCwrQkFBK0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FDOUUsQ0FBQztR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