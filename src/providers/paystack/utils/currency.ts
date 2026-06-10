const ZERO_DECIMAL_CURRENCIES = [
  "xof",
  "ugx",
  "rwf",
  "jpy",
  "gnf",
  "vnd",
  "vuv",
  "xaf",
  "krw",
  "bif",
  "djf",
  "pyg",
];

/**
 * Paystack expects the amount in the smallest currency denomination (subunit).
 * For most currencies, this means multiplying by 100 (e.g., KES, NGN, USD).
 * For zero-decimal currencies, the amount should remain as is.
 */
export function getPaystackAmount(amount: number, currencyCode: string): number {
  const code = currencyCode.toLowerCase();
  
  if (ZERO_DECIMAL_CURRENCIES.includes(code)) {
    return Math.round(Number(amount));
  }
  
  // For currencies like KES, NGN, ZAR, USD, etc.
  return Math.round(Number(amount) * 100);
}

/**
 * Convert Paystack subunit amount back to Medusa's standard decimal format.
 */
export function getMedusaAmount(paystackAmount: number, currencyCode: string): number {
  const code = currencyCode.toLowerCase();
  
  if (ZERO_DECIMAL_CURRENCIES.includes(code)) {
    return Number(paystackAmount);
  }
  
  return Number(paystackAmount) / 100;
}
