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
    constructor(cradle, // Update cradle injection
    options) {
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
        this.query = cradle.query; // ADD THIS LINE
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
        // Standardize reference: Use order_id or cart_id if available, otherwise fallback to random
        let baseReference = customMetadata?.reference;
        let displayIdStr = "";
        if (!baseReference) {
            if (order_id) {
                // Try to fetch the order to get the display_id (e.g., #18)
                try {
                    if (this.query) {
                        const { data: orders } = await this.query.graph({
                            entity: "order",
                            fields: ["display_id"],
                            filters: { id: order_id }
                        });
                        if (orders && orders.length > 0 && orders[0].display_id) {
                            displayIdStr = `${orders[0].display_id}-`;
                        }
                    }
                }
                catch (e) {
                    if (this.debug)
                        this.logger.warn(`PS_P_Debug: Could not fetch order ${order_id} for display_id`);
                }
                // Strip the "order_" prefix
                baseReference = order_id.replace(/^order_/, "");
            }
            else if (cart_id) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFLbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLHdCQUF5QixTQUFRLCtCQUF1RDtJQVE1RixZQUNFLE1BQWdFLEVBQUUsMEJBQTBCO0lBQzVGLE9BQXVDO1FBRXZDLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixNQUFNLElBQUksbUJBQVcsQ0FDbkIsbUJBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQ2xDLHNEQUFzRCxDQUN2RCxDQUFDO1FBQ0osQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDO1FBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxrQkFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFO1lBQzFELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZTtZQUN4QyxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDckIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1NBQzlCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDNUIsSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsZ0JBQWdCO1FBQzNDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2YsSUFB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