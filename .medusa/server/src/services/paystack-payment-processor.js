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
        cradle.logger.info("[Paystack] Initializing PaystackPaymentProcessor constructor...");
        if (!options.secret_key) {
            cradle.logger.error("[Paystack] Initialization failed: secret_key is missing.");
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
        this.logger.info(`[Paystack] Initialization complete. Config options passed: disable_retries=${options.disable_retries}, debug=${options.debug}`);
    }
    async initiatePayment(initiatePaymentData) {
        this.logger.info("[Paystack - initiatePayment] Method called.");
        this.logger.info(`[Paystack - initiatePayment] Raw input data: ${JSON.stringify(initiatePaymentData, null, 2)}`);
        const { data, amount, currency_code } = initiatePaymentData;
        const { email, session_id, order_id, cart_id, callback_url, ...customMetadata } = (data ?? {});
        const validatedCurrencyCode = (0, currencyCode_1.formatCurrencyCode)(currency_code);
        this.logger.info(`[Paystack - initiatePayment] Validating currency: Input=${currency_code}, Validated=${validatedCurrencyCode}`);
        if (!SUPPORTED_CURRENCIES.includes(validatedCurrencyCode)) {
            const errorMsg = `Currency ${validatedCurrencyCode} is not supported by Paystack. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`;
            this.logger.error(`[Paystack - initiatePayment] Error: ${errorMsg}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, errorMsg);
        }
        if (!email) {
            const errorMsg = "Email is required to initiate a Paystack payment. Ensure you are providing the email in the context object when calling `initiatePaymentSession` in your Medusa storefront";
            this.logger.error(`[Paystack - initiatePayment] Error: ${errorMsg}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_ARGUMENT, errorMsg);
        }
        // --- AMOUNT LOGGING AND FIX ---
        this.logger.info(`[Paystack - initiatePayment] AMOUNT PROCESSING:`);
        this.logger.info(`   -> Raw Medusa Amount: ${amount}`);
        this.logger.info(`   -> Number representation: ${Number(amount)}`);
        // FIX applied here: actually multiplying by 100 to get to the lowest denomination
        const paystackAmount = Math.round(Number(amount) * 100);
        this.logger.info(`   -> FINAL AMOUNT PASSED TO PAYSTACK (Cents/Kobo): ${paystackAmount}`);
        // ------------------------------
        let baseReference = customMetadata?.reference;
        let displayIdStr = "";
        if (!baseReference) {
            if (order_id) {
                baseReference = order_id.replace(/^order_/, "");
                this.logger.info(`[Paystack - initiatePayment] Using order_id for base reference: ${baseReference}`);
            }
            else if (cart_id) {
                baseReference = `TX${Date.now().toString().slice(-8)}`;
                this.logger.info(`[Paystack - initiatePayment] Using cart_id fallback for base reference: ${baseReference}`);
            }
        }
        const reference = customMetadata?.reference ||
            `${displayIdStr}${baseReference}-${Math.floor(1000 + Math.random() * 9000)}`;
        this.logger.info(`[Paystack - initiatePayment] About to initialize transaction with Paystack API. Reference: ${reference}, Amount: ${paystackAmount}, Currency: ${validatedCurrencyCode}, Email: ${email}`);
        try {
            const payload = {
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
            };
            this.logger.info(`[Paystack - initiatePayment] Sending payload to Paystack: ${JSON.stringify(payload)}`);
            const { data: psData, status, message, } = await this.paystack.transaction.initialize(payload);
            this.logger.info(`[Paystack - initiatePayment] Received response from Paystack API. Status: ${status}, Message: ${message}`);
            this.logger.info(`[Paystack - initiatePayment] Paystack response data: ${JSON.stringify(psData)}`);
            if (status === false) {
                this.logger.error(`[Paystack - initiatePayment] Failed API call. Message: ${message}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", message);
            }
            this.logger.info("[Paystack - initiatePayment] Successfully initiated payment session.");
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
            this.logger.error("[Paystack - initiatePayment] Caught exception during API call", error);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to initiate Paystack payment", error?.toString() ?? "Unknown error");
        }
    }
    async createAccountHolder(input) {
        this.logger.info(`[Paystack - createAccountHolder] Method called. Input: ${JSON.stringify(input)}`);
        const { customer } = (input.context ?? {});
        if (!customer?.email) {
            const mockId = `ps_mock_${Date.now()}`;
            this.logger.warn(`[Paystack - createAccountHolder] No customer email provided. Generating mock ID: ${mockId}`);
            return { id: mockId };
        }
        try {
            this.logger.info(`[Paystack - createAccountHolder] Creating customer in Paystack for email: ${customer.email}`);
            const { data, status, message } = await this.paystack.customer.create({
                email: customer.email,
                first_name: customer.first_name ?? undefined,
                last_name: customer.last_name ?? undefined,
                phone: customer.phone ?? undefined,
            });
            if (status === false) {
                this.logger.error(`[Paystack - createAccountHolder] API returned false status. Message: ${message}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, message || "Paystack API Error");
            }
            this.logger.info(`[Paystack - createAccountHolder] Successfully created customer. Paystack customer code: ${data.customer_code}`);
            return { id: data.customer_code };
        }
        catch (error) {
            this.logger.error("[Paystack - createAccountHolder] Caught exception", error);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to create Paystack customer", error?.toString() ?? "Unknown error");
        }
    }
    async updateAccountHolder(input) {
        this.logger.info(`[Paystack - updateAccountHolder] Method called. Input: ${JSON.stringify(input)}`);
        const { account_holder, customer } = (input.context ?? {});
        const customerCode = account_holder?.data?.id;
        if (!customerCode || !customerCode.startsWith("CUS_") || !customer) {
            this.logger.warn(`[Paystack - updateAccountHolder] Invalid customer code or missing customer context. customerCode: ${customerCode}`);
            return { id: customerCode || `ps_mock_${Date.now()}` };
        }
        try {
            this.logger.info(`[Paystack - updateAccountHolder] Updating Paystack customer: ${customerCode}`);
            const { status, message } = await this.paystack.customer.update(customerCode, {
                first_name: customer.first_name ?? undefined,
                last_name: customer.last_name ?? undefined,
                phone: customer.phone ?? undefined,
            });
            if (status === false) {
                this.logger.error(`[Paystack - updateAccountHolder] Paystack API Error: ${message}`);
            }
            else {
                this.logger.info(`[Paystack - updateAccountHolder] Successfully updated customer: ${customerCode}`);
            }
            return { id: customerCode };
        }
        catch (error) {
            this.logger.error("[Paystack - updateAccountHolder] Caught exception", error);
            return { id: customerCode };
        }
    }
    async deleteAccountHolder(_input) {
        this.logger.info(`[Paystack - deleteAccountHolder] Method called. No action taken as Paystack doesn't support hard customer deletes.`);
        return;
    }
    async updatePayment(input) {
        this.logger.info(`[Paystack - updatePayment] Method called. Delegating to initiatePayment...`);
        const session = await this.initiatePayment(input);
        return {
            data: session.data,
        };
    }
    async authorizePayment(input) {
        this.logger.info(`[Paystack - authorizePayment] Method called. Input: ${JSON.stringify(input)}`);
        try {
            const { paystackTxRef } = input.data;
            if (!paystackTxRef) {
                this.logger.error("[Paystack - authorizePayment] Missing paystackTxRef in payment data.");
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxRef in payment data.");
            }
            this.logger.info(`[Paystack - authorizePayment] Verifying transaction with Paystack reference: ${paystackTxRef}`);
            const { status: psStatus, data } = await this.paystack.transaction.verify(paystackTxRef);
            this.logger.info(`[Paystack - authorizePayment] Verification result - Status: ${psStatus}, Paystack Data: ${JSON.stringify(data)}`);
            if (psStatus === false) {
                this.logger.warn(`[Paystack - authorizePayment] Verification failed structurally for ref: ${paystackTxRef}`);
                return {
                    status: utils_1.PaymentSessionStatus.ERROR,
                    data: { ...input.data, paystackTxId: data?.id, paystackTxData: data },
                };
            }
            this.logger.info(`[Paystack - authorizePayment] Transaction business status: ${data.status}`);
            switch (data.status) {
                case "success":
                    this.logger.info("[Paystack - authorizePayment] Status mapped to CAPTURED");
                    return {
                        status: utils_1.PaymentSessionStatus.CAPTURED,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
                case "failed":
                    this.logger.info("[Paystack - authorizePayment] Status mapped to ERROR");
                    return {
                        status: utils_1.PaymentSessionStatus.ERROR,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
                default:
                    this.logger.info("[Paystack - authorizePayment] Status mapped to PENDING");
                    return {
                        status: utils_1.PaymentSessionStatus.PENDING,
                        data: { ...input.data, paystackTxId: data.id, paystackTxData: data },
                    };
            }
        }
        catch (error) {
            this.logger.error("[Paystack - authorizePayment] Caught exception", error);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to authorize payment", error?.toString() ?? "Unknown error");
        }
    }
    async retrievePayment(input) {
        this.logger.info(`[Paystack - retrievePayment] Method called.`);
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                this.logger.error("[Paystack - retrievePayment] Missing paystackTxId.");
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxId in payment data. This payment has not been authorized.");
            }
            this.logger.info(`[Paystack - retrievePayment] Fetching transaction from Paystack API. ID: ${paystackTxId}`);
            const { data, status, message } = await this.paystack.transaction.get({
                id: paystackTxId,
            });
            if (status === false) {
                this.logger.error(`[Paystack - retrievePayment] Failed to retrieve. Message: ${message}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", message);
            }
            this.logger.info("[Paystack - retrievePayment] Successfully retrieved payment data.");
            return { data: { ...input.data, paystackTxData: data } };
        }
        catch (error) {
            this.logger.error("[Paystack - retrievePayment] Caught exception", error);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to retrieve payment", error?.toString() ?? "Unknown error");
        }
    }
    async refundPayment(input) {
        this.logger.info(`[Paystack - refundPayment] Method called.`);
        try {
            const { paystackTxId } = input.data;
            if (!paystackTxId) {
                this.logger.error("[Paystack - refundPayment] Missing paystackTxId in payment data.");
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Missing paystackTxId in payment data.");
            }
            // --- AMOUNT LOGGING AND FIX ---
            this.logger.info(`[Paystack - refundPayment] AMOUNT PROCESSING:`);
            this.logger.info(`   -> Raw Medusa Request Amount: ${input.amount}`);
            this.logger.info(`   -> Number representation: ${Number(input.amount)}`);
            // FIX applied here: multiply by 100 as Paystack expects lowest denomination (cents)
            const refundAmount = Math.round(Number(input.amount) * 100);
            this.logger.info(`   -> FINAL REFUND AMOUNT PASSED TO PAYSTACK (Cents/Kobo): ${refundAmount}`);
            // ------------------------------
            this.logger.info(`[Paystack - refundPayment] Processing refund in Paystack API. TxID: ${paystackTxId}, Amount: ${refundAmount}`);
            const { data, status, message } = await this.paystack.refund.create({
                transaction: paystackTxId,
                amount: refundAmount,
            });
            if (status === false) {
                this.logger.error(`[Paystack - refundPayment] Refund API failed. Message: ${message}`);
                throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", message);
            }
            this.logger.info(`[Paystack - refundPayment] Refund successful. Paystack Data: ${JSON.stringify(data)}`);
            return { data: { ...input.data, paystackTxData: data } };
        }
        catch (error) {
            this.logger.error("[Paystack - refundPayment] Caught exception", error);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to refund payment", error?.toString() ?? "Unknown error");
        }
    }
    async getPaymentStatus(input) {
        this.logger.info(`[Paystack - getPaymentStatus] Method called.`);
        const { paystackTxId } = input.data;
        if (!paystackTxId) {
            this.logger.info("[Paystack - getPaymentStatus] No paystackTxId found. Returning PENDING status.");
            return { status: utils_1.PaymentSessionStatus.PENDING };
        }
        try {
            this.logger.info(`[Paystack - getPaymentStatus] Fetching transaction ${paystackTxId} to determine status.`);
            const { data, status } = await this.paystack.transaction.get({
                id: paystackTxId,
            });
            if (status === false) {
                this.logger.warn(`[Paystack - getPaymentStatus] Paystack API returned false status. Assuming ERROR.`);
                return { status: utils_1.PaymentSessionStatus.ERROR };
            }
            this.logger.info(`[Paystack - getPaymentStatus] Paystack status returned as: ${data?.status}`);
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
            this.logger.error("[Paystack - getPaymentStatus] Caught exception. Returning ERROR status.", error);
            return { status: utils_1.PaymentSessionStatus.ERROR };
        }
    }
    async getWebhookActionAndData({ data: { event, data }, rawData, headers, }) {
        this.logger.info(`[Paystack - getWebhookActionAndData] Webhook received. Event type: ${event}`);
        const hash = crypto_1.default
            .createHmac("sha512", this.configuration.secret_key)
            .update(rawData)
            .digest("hex");
        if (hash !== headers["x-paystack-signature"]) {
            this.logger.warn("[Paystack - Webhook] SECURITY WARNING: Signature mismatch. Rejecting webhook.");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        this.logger.info("[Paystack - Webhook] Signature verified successfully.");
        if (event !== "charge.success") {
            this.logger.info(`[Paystack - Webhook] Ignoring unhandled event type: ${event}`);
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        const reference = data.reference;
        if (!reference) {
            this.logger.warn("[Paystack - Webhook] Received charge.success but missing transaction reference.");
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        let session_id = data.metadata?.session_id;
        if (!session_id) {
            this.logger.error(`[Paystack - Webhook] Could not resolve session_id from metadata for ref: ${reference}. Metadata was: ${JSON.stringify(data.metadata)}`);
            return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
        this.logger.info(`[Paystack - Webhook] AMOUNT PROCESSING:`);
        this.logger.info(`   -> Raw Webhook Amount from Paystack (in Cents/Kobo): ${data.amount}`);
        const amount = new utils_1.BigNumber(Number(data.amount));
        this.logger.info(`   -> Parsed BigNumber Amount for Medusa: ${amount.toString()}`);
        this.logger.info(`[Paystack - Webhook] Webhook action resolved successfully. Returning SUCCESSFUL for session_id: ${session_id}`);
        return {
            action: utils_1.PaymentActions.SUCCESSFUL,
            data: {
                session_id,
                amount,
            },
        };
    }
    async capturePayment(input) {
        this.logger.info(`[Paystack - capturePayment] Method called. Skipping capture as Paystack auto-captures on success.`);
        return { data: input.data };
    }
    async cancelPayment(input) {
        this.logger.info(`[Paystack - cancelPayment] Method called. Returning existing data.`);
        return { data: input.data };
    }
    async deletePayment(input) {
        this.logger.info(`[Paystack - deletePayment] Method called. Returning existing data.`);
        return { data: input.data };
    }
}
PaystackPaymentProcessor.identifier = "paystack";
exports.default = PaystackPaymentProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvcGF5c3RhY2stcGF5bWVudC1wcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsK0RBQXVDO0FBMEJ2QyxxREFNbUM7QUFDbkMsd0RBQTJEO0FBcUIzRCxNQUFNLG9CQUFvQixHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFFL0UsTUFBTSx3QkFBeUIsU0FBUSwrQkFBdUQ7SUFPNUYsWUFDRSxNQUFvRCxFQUNwRCxPQUF1QztRQUV2QyxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRXZCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlFQUFpRSxDQUFDLENBQUM7UUFFdEYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQywwREFBMEQsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sSUFBSSxtQkFBVyxDQUNuQixtQkFBVyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFDbEMsc0RBQXNELENBQ3ZELENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUM7UUFDN0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLGtCQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUU7WUFDMUQsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlO1lBQ3hDLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtZQUNyQixLQUFLLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7U0FDOUIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxD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