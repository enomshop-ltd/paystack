export interface PaystackOptions {
  secretKey: string
  publicKey: string
  identifier?: string // Add this line to support custom identifiers
}

export interface PaystackProviderService {
  getOptions(): PaystackOptions
  getBalance(): Promise<any>
  getTransactions(params?: any): Promise<any>
}