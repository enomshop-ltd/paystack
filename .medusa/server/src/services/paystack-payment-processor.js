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
        this.query = cradle.query;
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
                try {
                    if (this.query) {
                        const { data: orders } = await this.query.graph({
                            entity: "order",
                            fields: ["display_id"],
                            filters: { id: order_id },
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
        // Fallback: for partial payments or legacy sessions where session_id wasn't
        // forwarded into Paystack metadata, look up the payment session by reference
        // stored in its data field (paystackTxRef).
        if (!session_id && this.query) {
            try {
                const { data: sessions } = await this.query.graph({
                    entity: "payment_session",
                    fields: ["id", "data"],
                    filters: {
                        provider_id: "pp_paystack",
                    },
                });
                const matched = sessions?.find((s) => s.data?.paystackTxRef === reference);
                if (matched) {
                    session_id = matched.id;
                    if (this.debug) {
                        this.logger.info(`PS_P_Debug: getWebhookActionAndData resolved session_id ${session_id} via reference lookup for ref: ${reference}`);
                    }
                }
            }
            catch (e) {
                if (this.debug) {
                    this.logger.warn(`PS_P_Debug: getWebhookActionAndData reference lookup failed: ${e}`);
                }
            }
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFNbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLG9CQUFvQixHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFL0UsTUFBTSx3QkFBeUIsU0FBUSwrQkFBdUQ7SUFRNUYsWUFDRSxNQUFnRSxFQUNoRSxPQUF1QztRQUV2QyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDeEIsTUFBTSxJQUFJLG1CQUFXLENBQ25CLG1CQUFXLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUNsQyxzREFBc0QsQ0FDdkQsQ0FBQztRQUNKLENBQUM7UUFDRCxJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksa0JBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRTtZQUMxRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWU7WUFDeEMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3JCLEtBQUssRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztTQUM5QixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQzVCLElBQUks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