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
        try {
            const res = await this.axiosInstance(options);
            return res.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Error from Paystack API with status code ${error.response?.status}: ${error.response?.data?.message}`);
            }
            throw error;
        }
    }
}
exports.default = Paystack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvbGliL3BheXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGtEQUFpRTtBQUNqRSw4REFBcUM7QUFFeEIsUUFBQSxpQkFBaUIsR0FBRyx5QkFBeUIsQ0FBQztBQW1DM0QsTUFBcUIsUUFBUTtJQUszQixZQUFZLE1BQWMsRUFBRSxPQUFnQztRQTJDNUQsZ0JBQVcsR0FBRztZQUNaLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFrQixFQUFFLEVBQUUsQ0FDOUIsSUFBSSxDQUFDLGtCQUFrQixDQU1yQjtnQkFDQSxJQUFJLEVBQUUsZUFBZSxHQUFHLEVBQUU7Z0JBQzFCLE1BQU0sRUFBRSxLQUFLO2FBQ2QsQ0FBQztZQUNKLElBQUksRUFBRSxDQUFDLEtBQTRELEVBQUUsRUFBRSxDQUNyRSxJQUFJLENBQUMsa0JBQWtCLENBZXJCO2dCQUNBLElBQUksRUFBRSxjQUFjO2dCQUNwQixNQUFNLEVBQUUsS0FBSztnQkFDYixLQUFLLEVBQUUsS0FBK0I7YUFDdkMsQ0FBQztZQUNKLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FDWixJQUFJLENBQUMsa0JBQWtCLENBRXJCO2dCQUNBLElBQUksRUFBRSxVQUFVO2dCQUNoQixNQUFNLEVBQUUsS0FBSzthQUNkLENBQUM7WUFDSixNQUFNLEVBQUUsQ0FBQyxTQUFpQixFQUFFLEVBQUUsQ0FDNUIsSUFBSSxDQUFDLGtCQUFrQixDQWVyQjtnQkFDQSxJQUFJLEVBQUUsc0JBQXNCLEdBQUcsU0FBUztnQkFDeEMsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1lBQ0osTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUNYLElBQUksQ0FBQyxrQkFBa0IsQ0FPckI7Z0JBQ0EsSUFBSSxFQUFFLHFCQUFxQjtnQkFDM0IsTUFBTSxFQUFFLEtBQUs7YUFDZCxDQUFDO1lBQ0osVUFBVSxFQUFFLENBQUMsRUFDWCxNQUFN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