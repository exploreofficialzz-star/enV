/**
 * USD reference pricing and server-side FX snapshots for wallet funding.
 *
 * enV's one base price is fixed: 100 enV tokens = USD $1.00.
 * Provider currencies are derived from this base using an upstream FX snapshot.
 * The rate provider refreshes once per day; every purchase intent stores the exact
 * rate, upstream update time and quote time used to initialize hosted checkout.
 */
import { getCurrencyMinorUnitExponent } from "./country-routing";

const RATE_ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const RATE_SOURCE = "ExchangeRate-API Open Access";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1_000;
const MAX_UPSTREAM_AGE_MS = 36 * 60 * 60 * 1_000;

type UpstreamRates = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
  rates?: Record<string, number>;
};

type CachedRates = {
  rates: Record<string, number>;
  updatedAt: string;
  nextUpdateAt: string;
  fetchedAt: string;
  fetchedAtMs: number;
};

export type CurrencyPackQuote = {
  tokens: number;
  currency: string;
  amountMinor: number;
  usdAmountCents: number;
  fxRate: number;
  fxSource: string;
  fxUpdatedAt: string;
  fxNextUpdateAt: string;
  fxFetchedAt: string;
  quotedAt: string;
};

let cachedRates: CachedRates | null = null;
let pendingRefresh: Promise<CachedRates> | null = null;

function validIsoCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("A valid ISO 4217 currency is required.");
  return currency;
}

async function fetchRates(): Promise<CachedRates> {
  const response = await fetch(RATE_ENDPOINT, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("The exchange-rate service is temporarily unavailable.");
  const payload = await response.json() as UpstreamRates;
  if (payload.result !== "success" || payload.base_code !== "USD" ||
      !payload.rates || typeof payload.rates !== "object") {
    throw new Error("The exchange-rate service returned an invalid response.");
  }

  const now = Date.now();
  const updatedAtSeconds = Number(payload.time_last_update_unix);
  const nextUpdateSeconds = Number(payload.time_next_update_unix);
  if (!Number.isSafeInteger(updatedAtSeconds) || !Number.isSafeInteger(nextUpdateSeconds)) {
    throw new Error("The exchange-rate response is missing its update timestamps.");
  }
  const updatedAtMs = updatedAtSeconds * 1_000;
  if (updatedAtMs > now + 120_000 || now - updatedAtMs > MAX_UPSTREAM_AGE_MS) {
    throw new Error("The available exchange-rate snapshot is too old for a new payment quote.");
  }

  const rates: Record<string, number> = {};
  for (const [code, rawRate] of Object.entries(payload.rates)) {
    if (/^[A-Z]{3}$/.test(code) && typeof rawRate === "number" &&
        Number.isFinite(rawRate) && rawRate > 0 && rawRate < 1_000_000_000) {
      rates[code] = rawRate;
    }
  }
  rates.USD = 1;
  return {
    rates,
    updatedAt: new Date(updatedAtMs).toISOString(),
    nextUpdateAt: new Date(nextUpdateSeconds * 1_000).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    fetchedAtMs: now,
  };
}

async function readRates(): Promise<CachedRates> {
  if (cachedRates && Date.now() - cachedRates.fetchedAtMs < CACHE_MAX_AGE_MS) return cachedRates;
  if (!pendingRefresh) {
    pendingRefresh = fetchRates()
      .then((rates) => {
        cachedRates = rates;
        return rates;
      })
      .catch((error: unknown) => {
        // A recent, provider-dated snapshot remains usable during a brief upstream
        // outage; never fall back after the 36-hour maximum age.
        if (cachedRates && Date.now() - Date.parse(cachedRates.updatedAt) <= MAX_UPSTREAM_AGE_MS) {
          return cachedRates;
        }
        throw error;
      })
      .finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

/** Convert an integer USD-cent quote to a currency's integer minor unit using half-up rounding. */
export function usdCentsToMinorAmount(usdCents: number, currencyValue: string, rate: number): number {
  const currency = validIsoCurrency(currencyValue);
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null) throw new RangeError("The currency's minor-unit precision is not supported.");
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0) throw new RangeError("The USD amount must be a positive integer number of cents.");
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("The FX rate must be a positive finite number.");

  // Convert the decimal representation of the provider rate to a rational pair,
  // then do the multiplication and rounding with BigInt to avoid float drift.
  const raw = String(rate).toLowerCase();
  const [coefficient = "", exponentText = "0"] = raw.split("e");
  const exponentPart = Number(exponentText);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(coefficient);
  if (!match || !Number.isSafeInteger(exponentPart)) throw new RangeError("The FX rate format is invalid.");
  const fraction = match[2] ?? "";
  let numerator = BigInt(match[1] + fraction);
  let denominator = 10n ** BigInt(fraction.length);
  if (exponentPart > 0) numerator *= 10n ** BigInt(exponentPart);
  if (exponentPart < 0) denominator *= 10n ** BigInt(-exponentPart);

  const currencyFactor = 10n ** BigInt(exponent);
  const amountNumerator = BigInt(usdCents) * numerator * currencyFactor;
  const amountDenominator = 100n * denominator;
  const rounded = (amountNumerator + amountDenominator / 2n) / amountDenominator;
  if (rounded <= 0n || rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("The converted currency amount is outside the supported range.");
  }
  return Number(rounded);
}

export function usdCentsForTokenPack(tokens: number): number {
  // The reference value is $0.01 for each token: 100 tokens = $1.00.
  if (!Number.isSafeInteger(tokens) || tokens <= 0) throw new RangeError("The token pack is invalid.");
  return tokens;
}

export async function quoteTokenPacks(
  currencyValue: string,
  packSizes: readonly number[],
): Promise<CurrencyPackQuote[]> {
  const currency = validIsoCurrency(currencyValue);
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null) throw new RangeError("The currency's minor-unit precision is not supported.");
  if (packSizes.length === 0) throw new RangeError("At least one token pack is required.");

  const snapshot = await readRates();
  const fxRate = snapshot.rates[currency];
  if (typeof fxRate !== "number" || !Number.isFinite(fxRate) || fxRate <= 0) {
    throw new Error("No current USD exchange rate is available for " + currency + ".");
  }
  const quotedAt = new Date().toISOString();
  return packSizes.map((tokens) => {
    const usdAmountCents = usdCentsForTokenPack(tokens);
    return {
      tokens,
      currency,
      amountMinor: usdCentsToMinorAmount(usdAmountCents, currency, fxRate),
      usdAmountCents,
      fxRate,
      fxSource: RATE_SOURCE,
      fxUpdatedAt: snapshot.updatedAt,
      fxNextUpdateAt: snapshot.nextUpdateAt,
      fxFetchedAt: snapshot.fetchedAt,
      quotedAt,
    };
  });
}

/** Formatting helper shared by wallet and pricing surfaces. */
export function formatUsdReferenceForTokenPack(tokens: number): string {
  const cents = usdCentsForTokenPack(tokens);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
