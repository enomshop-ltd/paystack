import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import axiosRetry from "axios-retry";
import { Logger } from "@medusajs/framework/types";

export const PAYSTACK_API_PATH = "https://api.paystack.co";

type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

interface Request {
  path: string;
  method: HTTPMethod;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export interface PaystackTransactionAuthorisation {
  reference: string;
  authorization_url: string;
  access_code: string;
}

export interface PaystackWrapperOptions {
  disable_retries?: boolean;
  logger?: Logger;
  debug?: boolean;
}

export default class Paystack {
  apiKey: string;
  logger?: Logger;
  debug: boolean;

  protected readonly axiosInstance: AxiosInstance;

  constructor(apiKey: string, options?: PaystackWrapperOptions) {
    this.apiKey = apiKey;
    this.logger = options?.logger;
    this.debug = options?.debug ?? false;
    
    if (this.debug && this.logger) {
      this.logger.info(`[Paystack SDK] Initializing Paystack SDK wrapper. Retries disabled: ${options?.disable_retries}`);
    }

    this.axiosInstance = axios.create({
      baseURL: PAYSTACK_API_PATH,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (options?.disable_retries !== true) {
      axiosRetry(this.axiosInstance, {
        retries: 3,
        // Enables retries on network errors, idempotent http methods, and 5xx errors
        retryCondition: axiosRetry.isNetworkOrIdempotentRequestError,
        // Exponential backoff with jitter
        retryDelay: axiosRetry.exponentialDelay,
      });
    }
  }

  protected async requestPaystackAPI<T>(request: Request): Promise<T> {
    const options = {
      method: request.method,
      url: request.path,
      params: request.query,
      data: request.body,
    } satisfies AxiosRequestConfig;

    if (this.debug && this.logger) {
      this.logger.info(`[Paystack SDK] Making API request: ${request.method} ${request.path}`);
      if (request.query) this.logger.info(`[Paystack SDK] Query: ${JSON.stringify(request.query)}`);
      if (request.body) this.logger.info(`[Paystack SDK] Body: ${JSON.stringify(request.body)}`);
    }

    try {
      const res = await this.axiosInstance(options);
      
      if (this.debug && this.logger) {
        this.logger.info(`[Paystack SDK] API request successful: ${request.method} ${request.path}`);
      }
      
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as any;
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

  transaction = {
    get: ({ id }: { id: number }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          status: string;
          reference: string;
        }>
      >({
        path: "/transaction/" + id,
        method: "GET",
      }),
    list: (query?: { perPage?: number; page?: number; status?: string }) =>
      this.requestPaystackAPI<
        PaystackResponse<Array<{
          id: number;
          status: string;
          reference: string;
          amount: number;
          currency: string;
          created_at: string;
          customer: {
            first_name: string | null;
            last_name: string | null;
            email: string;
          };
          metadata: any;
        }>>
      >({
        path: "/transaction",
        method: "GET",
        query: query as Record<string, string>,
      }),
    balance: () =>
      this.requestPaystackAPI<
        PaystackResponse<Array<{ currency: string; balance: number }>>
      >({
        path: "/balance",
        method: "GET",
      }),
    verify: (reference: string) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          status: string;
          reference: string;
          amount: number;
          currency: string;
          created_at: string;
          customer: {
            first_name: string | null;
            last_name: string | null;
            email: string;
          };
          metadata: any;
        }>
      >({
        path: "/transaction/verify/" + reference,
        method: "GET",
      }),
    totals: () =>
      this.requestPaystackAPI<
        PaystackResponse<{
          total_transactions: number;
          total_volume: number;
          total_volume_by_currency: Array<{ currency: string; amount: number }>;
          pending_volume_by_currency: Array<{ currency: string; amount: number }>;
        }>
      >({
        path: "/transaction/totals",
        method: "GET",
      }),
    initialize: ({
      amount,
      email,
      currency,
      reference,
      callback_url,
      metadata,
    }: {
      amount: number;
      email: string;
      currency?: string;
      reference?: string;
      callback_url?: string;
      metadata?: Record<string, unknown>;
    }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          authorization_url: string;
          access_code: string;
          reference: string;
        }>
      >({
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

  refund = {
    create: ({
      transaction,
      amount,
    }: {
      transaction: number;
      amount: number;
    }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          status: string;
          reference: string;
          amount: number;
        }>
      >({
        path: "/refund",
        method: "POST",
        body: {
          transaction,
          amount,
        },
      }),
  };

  customer = {
    create: (data: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          email: string;
          customer_code: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          metadata: any;
        }>
      >({
        path: "/customer",
        method: "POST",
        body: data as Record<string, unknown>, // Cast to match your Request interface expectations
      }),

    update: (
      customerCode: string,
      data: {
        first_name?: string;
        last_name?: string;
        phone?: string;
      }
    ) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          email: string;
          customer_code: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          metadata: any;
        }>
      >({
        path: `/customer/${customerCode}`,
        method: "PUT",
        body: data as Record<string, unknown>,
      }),
  };
}
