"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYSTACK_API_PATH = void 0;
const axios_1 = __importDefault(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
exports.PAYSTACK_API_PATH = "https://api.paystack.co";
class Paystack {
    constructor(apiKey, options) {
        this.transaction = {
            get: ({ id }) => this.requestPaystackAPI({
                path: "/transaction/" + id,
                method: "GET",
            }),
            list: (query) => this.requestPaystackAPI({
                path: "/transaction",
                method: "GET",
                query: query,
            }),
            balance: () => this.requestPaystackAPI({
                path: "/balance",
                method: "GET",
            }),
            verify: (reference) => this.requestPaystackAPI({
                path: "/transaction/verify/" + reference,
                method: "GET",
            }),
            totals: () => this.requestPaystackAPI({
                path: "/transaction/totals",
                method: "GET",
            }),
            initialize: ({ amount, email, currency, reference, callback_url, metadata, }) => this.requestPaystackAPI({
                path: "/transaction/initialize",
                method: "POST",
                body: {
                    amount,
                    email,
                    currency,
                    reference,
                    callback_url,
                    metadata: metadata ? JSON.stringify(metadata) : undefined,
                },
            }),
        };
        this.refund = {
            create: ({ transaction, amount, }) => this.requestPaystackAPI({
                path: "/refund",
                method: "POST",
                body: {
                    transaction,
                    amount,
                },
            }),
        };
        this.customer = {
            create: (data) => this.requestPaystackAPI({
                path: "/customer",
                method: "POST",
                body: data, // Cast to match your Request interface expectations
            }),
            update: (customerCode, data) => this.requestPaystackAPI({
                path: `/customer/${customerCode}`,
                method: "PUT",
                body: data,
            }),
        };
        this.apiKey = apiKey;
        this.logger = options?.logger;
        this.debug = options?.debug ?? false;
        if (this.debug && this.logger) {
            this.logger.info(`[Paystack SDK] Initializing Paystack SDK wrapper. Retries disabled: ${options?.disable_retries}`);
        }
        this.axiosInstance = axios_1.default.create({
            baseURL: exports.PAYSTACK_API_PATH,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        });
        if (options?.disable_retries !== true) {
            (0, axios_retry_1.default)(this.axiosInstance, {
                retries: 3,
                // Enables retries on network errors, idempotent http methods, and 5xx errors
                retryCondition: axios_retry_1.default.isNetworkOrIdempotentRequestError,
                // Exponential backoff with jitter
                retryDelay: axios_retry_1.default.exponentialDelay,
            });
        }
    }
    async requestPaystackAPI(request) {
        const options = {
            method: request.method,
            url: request.path,
            params: request.query,
            data: request.body,
        };
        if (this.debug && this.logger) {
            this.logger.info(`[Paystack SDK] Making API request: ${request.method} ${request.path}`);
            if (request.query)
                this.logger.info(`[Paystack SDK] Query: ${JSON.stringify(request.query)}`);
            if (request.body)
                this.logger.info(`[Paystack SDK] Body: ${JSON.stringify(request.body)}`);
        }
        try {
            const res = await this.axiosInstance(options);
            if (this.debug && this.logger) {
                this.logger.info(`[Paystack SDK] API request successful: ${request.method} ${request.path}`);
            }
            return res.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const axiosError = error;
                const errorMessage = `Error from Paystack API with status code ${axiosError.response?.status}: ${axiosError.response?.data?.message}`;
                if (this.logger) {
                    this.logger.error(`[Paystack SDK] ${errorMessage}`, axiosError.response?.data);
                }
                throw new Error(errorMessage);
            }
            if (this.logger) {
                this.logger.error(`[Paystack SDK] Unexpected error during API request: ${request.method} ${request.path}`, error);
            }
            throw error;
        }
    }
}
exports.default = Paystack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvbGliL3BheXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGtEQUFpRTtBQUNqRSw4REFBcUM7QUFHeEIsUUFBQSxpQkFBaUIsR0FBRyx5QkFBeUIsQ0FBQztBQXFDM0QsTUFBcUIsUUFBUTtJQU8zQixZQUFZLE1BQWMsRUFBRSxPQUFnQztRQW1FNUQsZ0JBQVcsR0FBRztZQUNaLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFrQixFQUFFLEVBQUUsQ0FDOUIsSUFBSSxDQUFDLGtCQUFrQixDQU1yQjtnQkFDQSxJQUFJLEVBQUUsZUFBZSxHQUFHLEVBQUU7Z0JBQzFCLE1BQU0sRUFBRSxLQUFLO2FBQ2QsQ0FBQztZQUNKLElBQUksRUFBRSxDQUFDLEtBQTRELEVBQUUsRUFBRSxDQUNyRSxJQUFJLENBQUMsa0JBQWtCLENBZXJCO2dCQUNBLElBQUksRUFBRSxjQUFjO2dCQUNwQixNQUFNLEVBQUUsS0FBSztnQkFDYixLQUFLLEVBQUUsS0FBK0I7YUFDdkMsQ0FBQztZQUNKLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FDWixJQUFJLENBQUMsa0JBQWtCLENBRXJCO2dCQUNBLElBQUksRUFBRSxVQUFVO2dCQUNoQixNQUFNLEVBQUUsS0FBSzthQUNkLENBQUM7WUFDSixNQUFNLEVBQUUsQ0FBQyxTQUFpQixFQUFFLEVBQUUsQ0FDNUIsSUFBSSxDQUFDLGtCQUFrQixDQWVyQjtnQkFDQSxJQUFJLEVBQUUsc0JBQXNCLEdBQUcsU0FBUztnQkFDeEMsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1lBQ0osTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUNYLElBQUksQ0FBQyxrQkFBa0IsQ0FPckI7Z0JBQ0EsSUFBSSxFQUFFLHFCQUFxQjtnQkFDM0IsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1lBQ0osVUFBVSxFQUFFLENBQUMsRUFDWCxNQUFN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