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
            logger: cradle.logger,
            debug: Boolean(options.debug),
        });
        this.debug = Boolean(options.debug);
        this.logger = cradle.logger;
        if (this.debug) {
            this.logger.info("PS_P_Debug: PaystackPaymentProcessor initialized with options: " + JSON.stringify({ disable_retries: options.disable_retries, debug: options.debug }));
        }
    }
    async initiatePayment(initiatePaymentData) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: initiatePayment called with input: ${JSON.stringify(initiatePaymentData, null, 2)}`);
        }
        const { data, amount, currency_code } = initiatePaymentData;
        const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {});
        const validatedCurrencyCode = (0, currencyCode_1.formatCurrencyCode)(currency_code);
        const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "USD", "KES", "EGP", "RWF"];
        if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
            const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported currencies are: ${SUPPORTED_CURRENCIES.join(", ")}`;
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
        const paystackAmount = Math.round(Number(amount) * 100);
        const reference = customMetadata?.reference || `TX${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
        if (this.debug) {
            this.logger.info(`PS_P_Debug: initiatePayment initializing transaction with Paystack. Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Reference: ${reference}, Email: ${email}`);
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
                this.logger.info(`PS_P_Debug: initiatePayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(psData, null, 2)}`);
            }
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
                this.logger.error("PS_P_Debug: initiatePayment caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", error?.toString() ?? "Unknown error");
        }
    }
    async createAccountHolder(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: createAccountHolder called with input: ${JSON.stringify(input, null, 2)}`);
        }
        const { customer } = input.context || {};
        if (!customer?.email) {
            const mockId = `ps_mock_${Date.now()}`;
            if (this.debug)
                this.logger.info(`PS_P_Debug: createAccountHolder no email provided, returning mock ID: ${mockId}`);
            return { id: mockId };
        }
        try {
            if (this.debug)
                this.logger.info(`PS_P_Debug: createAccountHolder creating customer with Paystack for email: ${customer.email}`);
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
        if (this.debug) {
            this.logger.info(`PS_P_Debug: updateAccountHolder called with input: ${JSON.stringify(input, null, 2)}`);
        }
        const { account_holder, customer } = input.context || {};
        const customerCode = account_holder?.data?.id;
        if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
            const returnId = customerCode || `ps_mock_${Date.now()}`;
            if (this.debug)
                this.logger.info(`PS_P_Debug: updateAccountHolder invalid customer code or no customer data, returning ID: ${returnId}`);
            return { id: returnId };
        }
        try {
            if (this.debug)
                this.logger.info(`PS_P_Debug: updateAccountHolder updating customer ${customerCode} with Paystack`);
            const { status, message } = await this.paystack.customer.update(customerCode, {
                first_name: customer.first_name ?? undefined,
                last_name: customer.last_name ?? undefined,
                phone: customer.phone ?? undefined,
            });
            if (this.debug) {
                this.logger.info(`PS_P_Debug: updateAccountHolder Paystack response status: ${status}, message: ${message}`);
            }
            if (status === false) {
                if (this.debug) {
                    this.logger.error(`PS_P_Debug: updateAccountHolder API Error: ${message}`);
                }
            }
            return { id: customerCode };
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: updateAccountHolder caught error", error);
            }
            return { id: customerCode };
        }
    }
    async deleteAccountHolder(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: deleteAccountHolder called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
        }
        return;
    }
    async updatePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: updatePayment called with input: ${JSON.stringify(input, null, 2)}`);
        }
        if (this.debug)
            this.logger.info("PS_P_Debug: updatePayment delegating to initiatePayment");
        const session = await this.initiatePayment(input);
        if (this.debug)
            this.logger.info(`PS_P_Debug: updatePayment returning session status: ${session.status}`);
        return {
            data: session.data,
            status: session.status,
        };
    }
    async authorizePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: authorizePayment called with input: ${JSON.stringify(input, null, 2)}`);
        }
        try {
            const { paystackTxRef } = input.data;
            if (!paystackTxRef) {
                const errorMsg = "Missing paystackTxRef in payment data.";
                if (this.debug)
                    this.logger.error(`PS_P_Debug: authorizePayment error: ${errorMsg}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, errorMsg);
            }
            if (this.debug)
                this.logger.info(`PS_P_Debug: authorizePayment verifying transaction ${paystackTxRef} with Paystack`);
            const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);
            if (this.debug) {
                this.logger.info(`PS_P_Debug: authorizePayment Paystack verification response status: ${psStatus}, data: ${JSON.stringify(data, null, 2)}`);
            }
            if (psStatus === false) {
                if (this.debug)
                    this.logger.warn("PS_P_Debug: authorizePayment Paystack verification returned false status");
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
                    if (this.debug)
                        this.logger.info("PS_P_Debug: authorizePayment transaction successful, returning CAPTURED status");
                    return {
                        status: utils_1.PaymentSessionStatus.CAPTURED,
                        data: {
                            ...input.data,
                            paystackTxId: data.id,
                            paystackTxData: data,
                        },
                    };
                case "failed":
                    if (this.debug)
                        this.logger.info("PS_P_Debug: authorizePayment transaction failed, returning ERROR status");
                    return {
                        status: utils_1.PaymentSessionStatus.ERROR,
                        data: {
                            ...input.data,
                            paystackTxId: data.id,
                            paystackTxData: data,
                        },
                    };
                default:
                    if (this.debug)
                        this.logger.info(`PS_P_Debug: authorizePayment transaction status is ${data.status}, returning PENDING status`);
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
                this.logger.error("PS_P_Debug: authorizePayment caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to authorize payment", error?.toString() ?? "Unknown error");
        }
    }
    async retrievePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: retrievePayment called with input: ${JSON.stringify(input, null, 2)}`);
        }
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                const errorMsg = "Missing paystackTxId in payment data. This payment has not been authorized.";
                if (this.debug)
                    this.logger.error(`PS_P_Debug: retrievePayment error: ${errorMsg}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, errorMsg);
            }
            if (this.debug)
                this.logger.info(`PS_P_Debug: retrievePayment fetching transaction ${paystackTxId} from Paystack`);
            const { data, status, message } = await this.paystack.transaction.get({ id: paystackTxId });
            if (this.debug) {
                this.logger.info(`PS_P_Debug: retrievePayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(data, null, 2)}`);
            }
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
                this.logger.error("PS_P_Debug: retrievePayment caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", error?.toString() ?? "Unknown error");
        }
    }
    async refundPayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: refundPayment called with input: ${JSON.stringify(input, null, 2)}`);
        }
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                const errorMsg = "Missing paystackTxId in payment data.";
                if (this.debug)
                    this.logger.error(`PS_P_Debug: refundPayment error: ${errorMsg}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, errorMsg);
            }
            const refundAmount = Math.round(Number(input.amount) * 100);
            if (this.debug)
                this.logger.info(`PS_P_Debug: refundPayment initiating refund with Paystack for transaction ${paystackTxId}, amount: ${refundAmount}`);
            const { data, status, message } = await this.paystack.refund.create({
                transaction: paystackTxId,
                amount: refundAmount,
            });
            if (this.debug) {
                this.logger.info(`PS_P_Debug: refundPayment Paystack response status: ${status}, message: ${message}, data: ${JSON.stringify(data, null, 2)}`);
            }
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
                this.logger.error("PS_P_Debug: refundPayment caught error", error);
            }
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", error?.toString() ?? "Unknown error");
        }
    }
    async getPaymentStatus(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: getPaymentStatus called with input: ${JSON.stringify(input, null, 2)}`);
        }
        const { paystackTxId } = input.data;
        if (!paystackTxId) {
            if (this.debug)
                this.logger.info("PS_P_Debug: getPaymentStatus no paystackTxId found, returning PENDING");
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
        try {
            if (this.debug)
                this.logger.info(`PS_P_Debug: getPaymentStatus fetching transaction ${paystackTxId} from Paystack`);
            const { data, status } = await this.paystack.transaction.get({ id: paystackTxId });
            if (this.debug) {
                this.logger.info(`PS_P_Debug: getPaymentStatus Paystack response status: ${status}, data: ${JSON.stringify(data, null, 2)}`);
            }
            if (status === false) {
                if (this.debug)
                    this.logger.warn("PS_P_Debug: getPaymentStatus Paystack returned false status, returning ERROR");
                return { status: utils_1.PaymentSessionStatus.ERROR };
            }
            switch (data?.status) {
                case "success":
                    if (this.debug)
                        this.logger.info("PS_P_Debug: getPaymentStatus transaction successful, returning CAPTURED");
                    return { status: utils_1.PaymentSessionStatus.CAPTURED };
                case "failed":
                    if (this.debug)
                        this.logger.info("PS_P_Debug: getPaymentStatus transaction failed, returning ERROR");
                    return { status: utils_1.PaymentSessionStatus.ERROR };
                default:
                    if (this.debug)
                        this.logger.info(`PS_P_Debug: getPaymentStatus transaction status is ${data?.status}, returning PENDING`);
                    return { status: utils_1.PaymentSessionStatus.PENDING };
            }
        }
        catch (error) {
            if (this.debug) {
                this.logger.error("PS_P_Debug: getPaymentStatus caught error", error);
            }
            return { status: utils_1.PaymentSessionStatus.ERROR };
        }
    }
    async getWebhookActionAndData({ data: { event, data }, rawData, headers, }) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: getWebhookActionAndData called for event: ${event}, reference: ${data?.reference}`);
        }
        const webhookSecretKey = this.configuration.secret_key;
        const hash = crypto_1.default
            .createHmac("sha512", webhookSecretKey)
            .update(rawData)
            .digest("hex");
        if (hash !== headers["x-paystack-signature"]) {
            if (this.debug)
                this.logger.warn("PS_P_Debug: getWebhookActionAndData signature mismatch");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        if (event !== "charge.success") {
            if (this.debug)
                this.logger.info(`PS_P_Debug: getWebhookActionAndData ignoring event type: ${event}`);
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const reference = data.reference;
        if (!reference) {
            if (this.debug)
                this.logger.error("PS_P_Debug: getWebhookActionAndData no reference found in webhook data");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const session_id = data.metadata?.session_id;
        if (!session_id) {
            if (this.debug)
                this.logger.error("PS_P_Debug: getWebhookActionAndData no session_id found in webhook metadata");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const convertedAmount = Number(data.amount) / 100;
        if (this.debug) {
            this.logger.info(`PS_P_Debug: getWebhookActionAndData returning SUCCESSFUL for session_id: ${session_id}`);
            this.logger.info(`PS_P_Debug: Webhook amount conversion - Paystack raw amount: ${data.amount}, Converted standard amount: ${convertedAmount}`);
        }
        return {
            action: utils_1.PaymentActions.SUCCESSFUL,
            data: {
                session_id: session_id,
                amount: convertedAmount,
            },
        };
    }
    async capturePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: capturePayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
        }
        return { data: input.data };
    }
    async cancelPayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: cancelPayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
        }
        return { data: input.data };
    }
    async deletePayment(input) {
        if (this.debug) {
            this.logger.info(`PS_P_Debug: deletePayment called with input: ${JSON.stringify(input, null, 2)} (No-op)`);
        }
        return { data: input.data };
    }
}
PaystackPaymentProcessor.identifier = "paystack";
exports.default = PaystackPaymentProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFLbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLHdCQUF5QixTQUFRLCtCQUF1RDtJQU81RixZQUNFLE1BQW9ELEVBQ3BELE9BQXVDO1FBRXZDLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQ2xDLHNEQUFzRCxDQUN2RCxDQUFDO1FBQ0osQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDO1FBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFO1lBQzFELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZTtZQUN4QyxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDckIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1NBQzlCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDNUIsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpRUFBaUUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsZUFBZSxF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