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
                body: data,
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
            this.logger.info(`[Paystack SDK] Initializing. Retries disabled: ${options?.disable_retries}`);
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
                retryCondition: axios_retry_1.default.isNetworkOrIdempotentRequestError,
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
            this.logger.info(`[Paystack SDK] ${request.method} ${request.path}`);
        }
        try {
            const res = await this.axiosInstance(options);
            return res.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const axiosError = error;
                const errorMessage = `Error from Paystack API ${axiosError.response?.status}: ${axiosError.response?.data?.message}`;
                if (this.logger) {
                    this.logger.error(`[Paystack SDK] ${errorMessage}`, axiosError.response?.data);
                }
                throw new Error(errorMessage);
            }
            if (this.logger) {
                this.logger.error(`[Paystack SDK] Unexpected error: ${request.method} ${request.path}`, error);
            }
            throw error;
        }
    }
}
exports.default = Paystack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5c3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvbGliL3BheXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGtEQUFpRTtBQUNqRSw4REFBcUM7QUFHeEIsUUFBQSxpQkFBaUIsR0FBRyx5QkFBeUIsQ0FBQztBQXFDM0QsTUFBcUIsUUFBUTtJQU8zQixZQUFZLE1BQWMsRUFBRSxPQUFnQztRQWdFNUQsZ0JBQVcsR0FBRztZQUNaLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFrQixFQUFFLEVBQUUsQ0FDOUIsSUFBSSxDQUFDLGtCQUFrQixDQU1yQjtnQkFDQSxJQUFJLEVBQUUsZUFBZSxHQUFHLEVBQUU7Z0JBQzFCLE1BQU0sRUFBRSxLQUFLO2FBQ2QsQ0FBQztZQUNKLElBQUksRUFBRSxDQUFDLEtBQTRELEVBQUUsRUFBRSxDQUNyRSxJQUFJLENBQUMsa0JBQWtCLENBQThDO2dCQUNuRSxJQUFJLEVBQUUsY0FBYztnQkFDcEIsTUFBTSxFQUFFLEtBQUs7Z0JBQ2IsS0FBSyxFQUFFLEtBQWdDO2FBQ3hDLENBQUM7WUFDSixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQ1osSUFBSSxDQUFDLGtCQUFrQixDQUE4QztnQkFDbkUsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLE1BQU0sRUFBRSxLQUFLO2FBQ2QsQ0FBQztZQUNKLE1BQU0sRUFBRSxDQUFDLFNBQWlCLEVBQUUsRUFBRSxDQUM1QixJQUFJLENBQUMsa0JBQWtCLENBZXJCO2dCQUNBLElBQUksRUFBRSxzQkFBc0IsR0FBRyxTQUFTO2dCQUN4QyxNQUFNLEVBQUUsS0FBSzthQUNkLENBQUM7WUFDSixNQUFNLEVBQUUsR0FBRyxFQUFFLENBQ1gsSUFBSSxDQUFDLGtCQUFrQixDQU9yQjtnQkFDQSxJQUFJLEVBQUUscUJBQXFCO2dCQUMzQixNQUFNLEVBQUUsS0FBSzthQUNkLENBQUM7WUFDSixVQUFVLEVBQUUsQ0FBQyxFQUNYLE1B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