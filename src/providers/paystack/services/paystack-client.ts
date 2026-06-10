import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

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

export default class Paystack {
  apiKey: string;

  protected readonly axiosInstance: AxiosInstance;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      baseURL: PAYSTACK_API_PATH,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  protected async requestPaystackAPI<T>(request: Request): Promise<T> {
    const options = {
      method: request.method,
      url: request.path,
      params: request.query,
      data: request.body,
    } satisfies AxiosRequestConfig;

    try {
      const res = await this.axiosInstance(options);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Error from Paystack API with status code ${error.response?.status}: ${error.response?.data?.message}`,
        );
      }

      throw error;
    }
  }

  transaction = {
    verify: ({ reference }: { reference: string }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          id: number;
          status: string;
          reference: string;
          amount: number;
          currency: string;
        }>
      >({
        path: "/transaction/verify/" + reference,
        method: "GET",
      }),
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
    initialize: ({
      amount,
      email,
      currency,
      reference,
      metadata,
    }: {
      amount: number;
      email: string;
      currency?: string;
      reference?: string;
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
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        },
      }),
  };

  charge = {
    mobile_money: ({
      amount,
      email,
      currency,
      mobile_money,
      metadata,
    }: {
      amount: number;
      email: string;
      currency?: string;
      mobile_money: { phone: string; provider: string };
      metadata?: Record<string, unknown>;
    }) =>
      this.requestPaystackAPI<
        PaystackResponse<{
          reference: string;
          status: string;
          display_text: string;
        }>
      >({
        path: "/charge",
        method: "POST",
        body: {
          amount,
          email,
          currency,
          mobile_money,
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
}
