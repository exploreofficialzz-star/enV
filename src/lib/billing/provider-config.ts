/**
 * Payment-provider configuration rules that must not depend on checkout availability.
 *
 * Disabling new purchases must never prevent the server from verifying an existing
 * transaction: customers may have completed payment immediately before a kill switch
 * was activated. Keep this helper small and free of database/network dependencies.
 */
export function requirePaystackVerificationSecret(
  env: Record<string, string | undefined>,
): string {
  const secret = env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    throw Object.assign(new Error("Paystack transaction verification is not configured."), {
      code: "PAYSTACK_NOT_CONFIGURED",
      status: 503,
    });
  }
  return secret;
}

/** Per-transaction Flutterwave payment_options work only after dashboard payment options are disabled. */
export function isFlutterwavePaymentOptionsConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return env.FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED === "true";
}

/** Parse a positive minor-unit price only when every offered token pack fits safely in integer arithmetic. */
export function readSafePackPrice(
  value: string | undefined,
  packSizes: readonly number[],
): number | null {
  if (!value || !/^\d+$/.test(value.trim()) || packSizes.length === 0) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  for (const packSize of packSizes) {
    if (!Number.isSafeInteger(packSize) || packSize <= 0) return null;
    const total = packSize * parsed;
    if (!Number.isSafeInteger(total) || total <= 0) return null;
  }
  return parsed;
}


const PAYSTACK_MERCHANT_LOCAL_CURRENCIES: Record<string, string> = {
  CI: "XOF",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
};

const PAYSTACK_MERCHANT_ACCEPTED_CURRENCIES: Record<string, readonly string[]> = {
  CI: ["XOF"],
  NG: ["NGN", "USD"],
  GH: ["GHS"],
  KE: ["KES", "USD"],
  ZA: ["ZAR"],
};

/**
 * Resolve the one configured Paystack merchant account against the customer's
 * edge-detected country. Local rails are restricted to the merchant's country;
 * international checkout is card-only and currency-limited by merchant country.
 */
export function resolvePaystackCountryConfiguration(
  customerCountryCode: string | null | undefined,
  env: Record<string, string | undefined>,
  packSizes: readonly number[],
) {
  const country = customerCountryCode?.trim().toUpperCase() ?? "";
  const merchantCountry = env.PAYSTACK_MERCHANT_COUNTRY?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(country) || country === "XX" || country === "ZZ" ||
      !/^[A-Z]{2}$/.test(merchantCountry) || merchantCountry === "XX" || merchantCountry === "ZZ") {
    return null;
  }

  const merchantLocalCurrency = PAYSTACK_MERCHANT_LOCAL_CURRENCIES[merchantCountry];
  const acceptedCurrencies = PAYSTACK_MERCHANT_ACCEPTED_CURRENCIES[merchantCountry];
  if (!merchantLocalCurrency || !acceptedCurrencies) return null;

  const international = country !== merchantCountry;
  if (international && env.PAYSTACK_INTERNATIONAL_ENABLED !== "true") return null;

  const currency = international
    ? env.PAYSTACK_INTERNATIONAL_CURRENCY?.trim().toUpperCase() || merchantLocalCurrency
    : merchantLocalCurrency;
  if (!acceptedCurrencies.includes(currency)) return null;

  // One Paystack integration key authenticates every transaction currency on the merchant account.
  const secret = env.PAYSTACK_SECRET_KEY?.trim() ?? "";
  // Pricing is always derived from the single USD reference price and a fresh
  // server-side FX snapshot; no country-specific per-token price is configured.
  const pricePerTokenMinor = null;
  const currencyApproved = currency === "NGN"
    ? env.PAYSTACK_PROVIDER_APPROVED === "true"
    : env["PAYSTACK_PROVIDER_APPROVED_" + currency] === "true";
  // The global approval is the merchant-level business-model gate for every
  // Paystack country. Currency-specific approval adds a second gate for
  // non-NGN merchant settlement accounts.
  const approved = env.PAYSTACK_PROVIDER_APPROVED === "true" && currencyApproved;

  return {
    country,
    merchantCountry,
    currency,
    international,
    secret,
    pricePerTokenMinor,
    approved,
    // FX availability and pack-size eligibility are checked in the server quote step.
    enabled: approved && Boolean(secret),
  };
}
