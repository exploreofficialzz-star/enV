/**
 * Server-side customer-country routing for payment providers.
 *
 * Vercel's x-vercel-ip-country is the default trusted edge signal. Cloudflare's
 * cf-ipcountry is accepted only when the deployment explicitly states that
 * traffic is forced through Cloudflare and the origin is locked down.
 * Client request bodies and arbitrary headers never choose a payment currency.
 */
export type CountryPaymentProfile = {
  countryCode: string;
  currency: string;
  paymentOptions: readonly string[];
};

const COUNTRY_PROFILES: Record<string, CountryPaymentProfile> = {
  NG: { countryCode: "NG", currency: "NGN", paymentOptions: ["card", "ussd", "banktransfer", "account", "internetbanking", "nqr", "enaira", "opay"] },
  GH: { countryCode: "GH", currency: "GHS", paymentOptions: ["card", "ghanamobilemoney"] },
  KE: { countryCode: "KE", currency: "KES", paymentOptions: ["card", "mpesa"] },
  ZA: { countryCode: "ZA", currency: "ZAR", paymentOptions: ["card", "account", "1voucher"] },
  MW: { countryCode: "MW", currency: "MWK", paymentOptions: ["card", "mobilemoneymalawi"] },
  UG: { countryCode: "UG", currency: "UGX", paymentOptions: ["card", "mobilemoneyuganda"] },
  RW: { countryCode: "RW", currency: "RWF", paymentOptions: ["card", "mobilemoneyrwanda"] },
  TG: { countryCode: "TG", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  TZ: { countryCode: "TZ", currency: "TZS", paymentOptions: ["card", "mobilemoneytanzania"] },
  BJ: { countryCode: "BJ", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  BF: { countryCode: "BF", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  CI: { countryCode: "CI", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  GW: { countryCode: "GW", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  ML: { countryCode: "ML", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  NE: { countryCode: "NE", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  SN: { countryCode: "SN", currency: "XOF", paymentOptions: ["card", "mobilemoneyxof"] },
  CM: { countryCode: "CM", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  TD: { countryCode: "TD", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  CF: { countryCode: "CF", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  CG: { countryCode: "CG", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  GQ: { countryCode: "GQ", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  GA: { countryCode: "GA", currency: "XAF", paymentOptions: ["card", "mobilemoneyxaf"] },
  ZM: { countryCode: "ZM", currency: "ZMW", paymentOptions: ["card", "mobilemoneyzambia"] },
  EG: { countryCode: "EG", currency: "EGP", paymentOptions: ["card", "fawrypay"] },
  GB: { countryCode: "GB", currency: "GBP", paymentOptions: ["card", "account"] },
  US: { countryCode: "US", currency: "USD", paymentOptions: ["card", "account"] },
};

/** Euro-area membership as of 2026-11-11, including Bulgaria's 2026 adoption. */
const EURO_ACCOUNT_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const country = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "ZZ" ? country : null;
}

/**
 * Read edge-provided country only. The Cloudflare header is trusted solely
 * when an operator has configured Cloudflare as the proxy and locked down the
 * Vercel origin so visitors cannot bypass that proxy.
 */
export function getCustomerCountry(request: Request): string | null {
  const vercelCountry = normalizeCountryCode(request.headers.get("x-vercel-ip-country"));
  if (vercelCountry) return vercelCountry;

  const cloudflareIsTrusted =
    process.env.COUNTRY_GEO_PROVIDER === "cloudflare" &&
    process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED === "true";
  return cloudflareIsTrusted
    ? normalizeCountryCode(request.headers.get("cf-ipcountry"))
    : null;
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
    "NGN", "GHS", "KES", "ZAR", "MWK", "TZS", "ZMW", "EGP", "GBP", "USD", "EUR",
  ]);
  const code = currency.toUpperCase();
  if (zeroDecimal.has(code)) return 0;
  if (twoDecimal.has(code)) return 2;
  return null;
}

/**
 * Flutterwave Standard documents amount as int32 in major currency units.
 * Convert only when the complete token pack is an exact whole major unit;
 * never send a fractional/rounded value or overflow the provider's field.
 */
export function toFlutterwaveMajorAmount(amountMinor: number, currency: string): number | null {
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  const factor = 10 ** exponent;
  if (amountMinor % factor !== 0) return null;
  const amount = amountMinor / factor;
  return Number.isInteger(amount) && amount > 0 && amount <= 2_147_483_647 ? amount : null;
}

/** Convert a provider major-unit amount into exact integer minor units without floating-point rounding. */
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
