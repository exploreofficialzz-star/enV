/**
 * Server-side customer-country routing for payment providers.
 *
 * Vercel supplies x-vercel-ip-country from the request edge. Cloudflare's
 * cf-ipcountry is accepted for deployments routed through that proxy. Never
 * infer Nigeria (or any other country) when the edge cannot identify a visitor.
 */
export type CountryPaymentProfile = {
  countryCode: string;
  currency: string;
  paymentOptions: readonly string[];
};

const COUNTRY_PROFILES: Record<string, CountryPaymentProfile> = {
  NG: { countryCode: "NG", currency: "NGN", paymentOptions: ["card", "ussd", "banktransfer", "account", "internetbanking", "nqr", "enaira", "opay"] },
  GH: { countryCode: "GH", currency: "GHS", paymentOptions: ["card", "mobilemoneyghana"] },
  KE: { countryCode: "KE", currency: "KES", paymentOptions: ["card", "mpesa"] },
  ZA: { countryCode: "ZA", currency: "ZAR", paymentOptions: ["card", "account", "1voucher"] },
  MW: { countryCode: "MW", currency: "MWK", paymentOptions: ["card", "mobilemoneymalawi"] },
  UG: { countryCode: "UG", currency: "UGX", paymentOptions: ["card", "mobilemoneyuganda"] },
  RW: { countryCode: "RW", currency: "RWF", paymentOptions: ["card", "mobilemoneyrwanda"] },
  TZ: { countryCode: "TZ", currency: "TZS", paymentOptions: ["card", "mobilemoneytanzania"] },
  CI: { countryCode: "CI", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  SN: { countryCode: "SN", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  CM: { countryCode: "CM", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  EG: { countryCode: "EG", currency: "EGP", paymentOptions: ["card", "fawrypay"] },
  GB: { countryCode: "GB", currency: "GBP", paymentOptions: ["card", "account"] },
  US: { countryCode: "US", currency: "USD", paymentOptions: ["card", "account"] },
};

const EURO_ACCOUNT_COUNTRIES = new Set([
  "AT", "BE", "DK", "DE", "EE", "ES", "FI", "FR", "IE", "IT", "LV", "LT",
  "NL", "NO", "PL", "PT", "SE",
]);

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const country = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "ZZ" ? country : null;
}

/** Read only edge-provided country headers; request-body country values are never trusted. */
export function getCustomerCountry(request: Request): string | null {
  return normalizeCountryCode(
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry"),
  );
}

export function getCountryPaymentProfile(countryCode: string | null | undefined): CountryPaymentProfile | null {
  const country = normalizeCountryCode(countryCode);
  if (!country) return null;
  const direct = COUNTRY_PROFILES[country];
  if (direct) return direct;
  if (EURO_ACCOUNT_COUNTRIES.has(country)) {
    return { countryCode: country, currency: "EUR", paymentOptions: ["card", "account"] };
  }
  return null;
}

export function getCurrencyMinorUnitExponent(currency: string): number | null {
  const zeroDecimal = new Set(["UGX", "RWF", "XAF", "XOF"]);
  const twoDecimal = new Set([
    "NGN", "GHS", "KES", "ZAR", "MWK", "TZS", "EGP", "GBP", "USD", "EUR",
  ]);
  const code = currency.toUpperCase();
  if (zeroDecimal.has(code)) return 0;
  if (twoDecimal.has(code)) return 2;
  return null;
}

export function formatMinorUnits(amountMinor: number, currency: string): string {
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Unsupported payment currency or amount.");
  }
  if (exponent === 0) return String(amountMinor);
  const factor = 10 ** exponent;
  const whole = Math.floor(amountMinor / factor);
  const fraction = String(amountMinor % factor).padStart(exponent, "0");
  return String(whole) + "." + fraction;
}

/** Convert a provider's major-unit amount into exact integer minor units without float rounding. */
export function parseMajorUnitsToMinor(amount: unknown, currency: string): number | null {
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null || (typeof amount !== "string" && typeof amount !== "number")) return null;
  const raw = String(amount).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) return null;
  const normalizedFraction = fraction.slice(0, exponent).padEnd(exponent, "0");
  try {
    const value = BigInt(match[1]!) * (10n ** BigInt(exponent)) +
      BigInt(normalizedFraction || "0");
    return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  } catch {
    return null;
  }
}
