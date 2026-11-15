import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import {
  readWallet, creditVerifiedPurchase, reconcileVerifiedRefund, reconcileVerifiedDispute,
} from "./ledger.server";
import { readBoundedBytes } from "./bounded-json.server";
import {
  getCountryPaymentProfile, getCurrencyMinorUnitExponent, parseMajorUnitsToMinor,
} from "./country-routing";
import { quoteTokenPacks, type CurrencyPackQuote } from "./fx.server";

const TOKEN_PACKS = [100, 250, 500, 1_000] as const;
const TOKEN_ENDPOINT = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const SANDBOX_API = "https://developersandbox-api.flutterwave.com";
const LIVE_API = "https://f4bexperience.flutterwave.com";

type JsonRecord = Record<string, unknown>;
type FlutterwaveV4Method = "card" | "mobile_money" | "opay" | "ussd" | "bank_account";
type FlutterwaveFundingMethod = FlutterwaveV4Method | "bank_transfer";
type FlutterwaveV4PaymentDetails = {
  type: FlutterwaveV4Method;
  card?: {
    encrypted_card_number: string;
    encrypted_expiry_month: string;
    encrypted_expiry_year: string;
    encrypted_cvv: string;
    nonce: string;
  };
  mobile_money?: { country_code: string; network: string; phone_number: string };
  ussd?: { account_bank: string };
  bank_account?: Record<string, never>;
};
type FlutterwaveV4NextAction = {
  type?: string;
  redirect_url?: { url?: string };
  payment_instruction?: { note?: string; account_number?: string; bank_name?: string; [key: string]: unknown };
  requires_pin?: unknown;
  requires_otp?: unknown;
  [key: string]: unknown;
};

let cachedAccessToken: string | null = null;
let accessTokenExpiresAt = 0;
let pendingTokenRequest: Promise<string> | null = null;

function apiBaseUrl(): string {
  return process.env.FLW_ENVIRONMENT?.trim().toLowerCase() === "sandbox" ||
    (process.env.FLW_ENVIRONMENT === undefined && process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1")
    ? SANDBOX_API
    : LIVE_API;
}

function publicOrigin(): string | null {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    if (parsed.protocol !== "https:" && production) return null;
    return parsed.origin;
  } catch { return null; }
}

function enabledCurrencies(): Set<string> {
  return new Set((process.env.FLUTTERWAVE_ENABLED_CURRENCIES ?? "")
    .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));
}

function launchChecksPassed(): boolean {
  return process.env.BILLING_LAUNCH_ENABLED === "true" &&
    process.env.BILLING_ENFORCEMENT_ENABLED === "true" &&
    process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true" &&
    process.env.FLUTTERWAVE_REFUND_DISPUTE_HANDLING_APPROVED === "true" &&
    Boolean(publicOrigin());
}

function flutterwaveCredentials() {
  return {
    clientId: process.env.FLW_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.FLW_CLIENT_SECRET?.trim() ?? "",
    secretHash: process.env.FLW_SECRET_HASH?.trim() ?? "",
    encryptionKey: process.env.FLW_ENCRYPTION_KEY?.trim() ?? "",
  };
}

const MOBILE_MONEY_COUNTRIES = new Set([
  "CG", "CM", "CI", "EG", "ET", "GA", "GH", "KE", "MW", "RW", "SN", "TZ", "TD", "UG", "ZM",
]);
type FlutterwaveMobileNetwork = { network: string; name: string };
const mobileNetworkCache = new Map<string, { expiresAt: number; networks: FlutterwaveMobileNetwork[] }>();
const MOBILE_NETWORK_CACHE_MS = 15 * 60 * 1_000;

async function getFlutterwaveMobileNetworks(countryCode: string): Promise<FlutterwaveMobileNetwork[]> {
  if (!MOBILE_MONEY_COUNTRIES.has(countryCode)) return [];
  const cached = mobileNetworkCache.get(countryCode);
  if (cached && cached.expiresAt > Date.now()) return cached.networks;

  const response = await flutterwaveRequest("/mobile-networks?country=" + encodeURIComponent(countryCode));
  const records = Array.isArray(response.items)
    ? response.items.map(asRecord)
    : typeof response.network === "string" ? [response] : [];
  const networks = records.flatMap((record) => {
    const network = typeof record.network === "string" ? record.network.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : network;
    return network && /^[A-Za-z0-9 _-]{1,48}$/.test(network) && name && name.length <= 80
      ? [{ network, name }]
      : [];
  });
  mobileNetworkCache.set(countryCode, { expiresAt: Date.now() + MOBILE_NETWORK_CACHE_MS, networks });
  return networks;
}

function virtualAccountCurrencies(): Set<string> {
  const configured = process.env.FLUTTERWAVE_VIRTUAL_ACCOUNT_CURRENCIES;
  // NGN virtual accounts are enabled by default for Nigerian Flutterwave
  // merchants. Other currencies require an explicit merchant-account setting.
  const values = configured === undefined ? ["NGN"] : configured.split(",");
  return new Set(values.map((value) => value.trim().toUpperCase())
    .filter((value) => ["NGN", "GHS"].includes(value)));
}

function methodsForCountry(countryCode: string, currency: string): FlutterwaveFundingMethod[] {
  const methods: FlutterwaveFundingMethod[] = ["card"];
  if (MOBILE_MONEY_COUNTRIES.has(countryCode)) methods.push("mobile_money");
  if (virtualAccountCurrencies().has(currency)) methods.push("bank_transfer");
  return methods;
}

function resolveConfiguration(countryCode: string | null | undefined) {
  const profile = getCountryPaymentProfile(countryCode);
  if (!profile) return null;
  const currency = profile.currency.toUpperCase();
  const credentials = flutterwaveCredentials();
  const currencyEnabled = enabledCurrencies().has(currency);
  const approved = process.env.FLUTTERWAVE_PROVIDER_APPROVED === "true";
  const exponent = getCurrencyMinorUnitExponent(currency);
  const paymentMethods = methodsForCountry(profile.countryCode, currency)
    .filter((method) => method !== "card" || Boolean(credentials.encryptionKey));
  const ready = launchChecksPassed() && approved && currencyEnabled &&
    Boolean(credentials.clientId) && Boolean(credentials.clientSecret) &&
    Boolean(credentials.secretHash) && exponent !== null && paymentMethods.length > 0;
  return { profile, currency, credentials, currencyEnabled, approved, paymentMethods, ready };
}

function fail(message: string, code: string, status: number): never {
  throw Object.assign(new Error(message), { code, status });
}

function toMajorAmount(amountMinor: number, currency: string): number | null {
  const exponent = getCurrencyMinorUnitExponent(currency);
  if (exponent === null || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  const factor = 10 ** exponent;
  const major = amountMinor / factor;
  if (!Number.isFinite(major) || major <= 0) return null;
  // String conversion preserves the provider's minor-unit precision and avoids
  // sending an amount with more decimal places than its ISO currency permits.
  const decimal = exponent === 0 ? String(amountMinor) : (amountMinor / factor).toFixed(exponent);
  const parsed = Number(decimal);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getAccessToken(): Promise<string> {
  const credentials = flutterwaveCredentials();
  if (!credentials.clientId || !credentials.clientSecret) {
    fail("Flutterwave v4 OAuth credentials are not configured.", "FLUTTERWAVE_NOT_CONFIGURED", 503);
  }
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) return cachedAccessToken;
  if (!pendingTokenRequest) {
    pendingTokenRequest = (async () => {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: "client_credentials",
        }).toString(),
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await response.json().catch(() => null) as {
        access_token?: unknown; expires_in?: unknown;
      } | null;
      if (!response.ok || typeof payload?.access_token !== "string" ||
          typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) ||
          payload.expires_in < 60) {
        fail("Flutterwave v4 authentication failed. Check the configured live or sandbox client credentials.", "FLUTTERWAVE_AUTH_FAILED", 503);
      }
      cachedAccessToken = payload.access_token;
      accessTokenExpiresAt = Date.now() + payload.expires_in * 1_000;
      return cachedAccessToken;
    })().finally(() => { pendingTokenRequest = null; });
  }
  return pendingTokenRequest;
}

async function flutterwaveRequest(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<JsonRecord> {
  const token = await getAccessToken();
  const traceId = randomUUID().replaceAll("-", "");
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer " + token);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  headers.set("x-trace-id", traceId);
  if (idempotencyKey) headers.set("x-idempotency-key", idempotencyKey);
  const response = await fetch(apiBaseUrl() + path, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as {
    data?: unknown; status?: unknown; message?: unknown; error?: unknown;
  } | null;
  if (response.status === 401) {
    cachedAccessToken = null;
    accessTokenExpiresAt = 0;
  }
  if (!response.ok || !payload || payload.data === undefined || payload.data === null) {
    const upstream = typeof payload?.message === "string" ? payload.message.slice(0, 180) : "";
    const error = new Error("Flutterwave v4 request failed" + (upstream ? ": " + upstream : "."));
    Object.assign(error, {
      code: response.status === 401 ? "FLUTTERWAVE_AUTH_FAILED" : "FLUTTERWAVE_API_ERROR",
      status: response.status >= 500 ? 503 : 502,
    });
    throw error;
  }
  const data = payload.data;
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0] && typeof data[0] === "object") return data[0] as JsonRecord;
    return { items: data };
  }
  if (typeof data !== "object") return { value: data };
  return data as JsonRecord;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeProviderRedirect(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4_096) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const flutterwaveHost = host === "flutterwave.com" || host.endsWith(".flutterwave.com") ||
      host === "flutterwave.cloud" || host.endsWith(".flutterwave.cloud");
    return url.protocol === "https:" && flutterwaveHost ? url.href : null;
  } catch { return null; }
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 &&
    /^[A-Za-z0-9:_-]+$/.test(value);
}

export async function getFlutterwaveFundingOption(countryCode: string | null | undefined) {
  const configuration = resolveConfiguration(countryCode);
  if (!configuration) return null;
  const { profile, currency, ready, currencyEnabled, approved, credentials } = configuration;
  let paymentMethods = [...configuration.paymentMethods];
  let mobileNetworks: FlutterwaveMobileNetwork[] = [];
  if (ready && paymentMethods.includes("mobile_money")) {
    try {
      mobileNetworks = await getFlutterwaveMobileNetworks(profile.countryCode);
    } catch {
      mobileNetworks = [];
    }
    if (mobileNetworks.length === 0) {
      paymentMethods = paymentMethods.filter((method) => method !== "mobile_money");
    }
  }
  let quotes: CurrencyPackQuote[];
  try {
    quotes = await quoteTokenPacks(currency, TOKEN_PACKS);
  } catch {
    return {
      id: "flutterwave" as const,
      label: "Flutterwave · " + currency,
      enabled: false,
      currency,
      pricePerTokenMinor: null,
      packs: [],
      paymentOptions: [...profile.paymentOptions],
      paymentMethods,
      mobileNetworks,
      localPayments: paymentMethods.some((method) => method !== "card"),
      message: "A current USD exchange-rate quote is unavailable for " + currency + ". No local amount was estimated.",
    };
  }
  const packs = quotes.map((quote) => ({
    ...quote,
    enabled: ready && toMajorAmount(quote.amountMinor, currency) !== null,
    message: toMajorAmount(quote.amountMinor, currency) === null
      ? "This pack is outside Flutterwave's supported transaction amount range."
      : undefined,
  }));
  const anyPackAvailable = packs.some((pack) => pack.enabled);
  const reason = !approved
    ? "Flutterwave is awaiting merchant approval."
    : !currencyEnabled
      ? "This currency has not been enabled for the enV Flutterwave merchant account."
      : !credentials.clientId || !credentials.clientSecret
        ? "Flutterwave v4 OAuth client credentials are not configured on this deployment."
        : !credentials.secretHash
          ? "Flutterwave webhook signature verification is not configured."
          : !launchChecksPassed()
              ? "Checkout is disabled until billing, refund and dispute recovery checks are approved."
              : !anyPackAvailable
                ? "The available token pack amounts cannot be represented for this currency."
                : "Flutterwave is unavailable for this currency.";
  return {
    id: "flutterwave" as const,
    label: "Flutterwave · " + currency,
    enabled: ready,
    currency,
    pricePerTokenMinor: null,
    fxRate: quotes[0]?.fxRate ?? null,
    fxSource: quotes[0]?.fxSource ?? null,
    fxUpdatedAt: quotes[0]?.fxUpdatedAt ?? null,
    fxNextUpdateAt: quotes[0]?.fxNextUpdateAt ?? null,
    fxFetchedAt: quotes[0]?.fxFetchedAt ?? null,
    packs,
    paymentOptions: [...profile.paymentOptions],
    paymentMethods,
    mobileNetworks,
    localPayments: paymentMethods.some((method) => method !== "card"),
    message: ready && !anyPackAvailable
      ? "Enter a custom amount that can be charged in " + currency + "."
      : ready
        ? "Choose a Flutterwave v4 payment method. enV verifies the charge before crediting your wallet."
        : reason,
  };
}

/** Exposed only to an authenticated customer so the browser can encrypt card fields before transmission. */
export function getFlutterwaveCardEncryptionKey(): string {
  const key = flutterwaveCredentials().encryptionKey;
  if (!key) fail("Flutterwave card encryption is not configured.", "FLUTTERWAVE_NOT_CONFIGURED", 503);
  return key;
}

function countryCallingCode(countryCode: string): string | null {
  const codes: Record<string, string> = {
    NG: "234", GH: "233", KE: "254", ZA: "27", MW: "265", UG: "256", RW: "250",
    TG: "228", TZ: "255", BJ: "229", BF: "226", CI: "225", GW: "245", ML: "223",
    NE: "227", SN: "221", CM: "237", TD: "235", CF: "236", CG: "242", GQ: "240",
    GA: "241", ZM: "260", EG: "20", GB: "44", US: "1", CA: "1", CO: "57",
    IN: "91", SL: "232",
    AT: "43", BE: "32", BG: "359", CY: "357", DE: "49", EE: "372",
    ES: "34", FI: "358", FR: "33", GR: "30", HR: "385", IE: "353",
    IT: "39", LT: "370", LU: "352", LV: "371", MT: "356", NL: "31",
    PT: "351", SI: "386", SK: "421",
  };
  return codes[countryCode] ?? null;
}

function validatePaymentDetails(
  countryCode: string,
  paymentMethods: readonly FlutterwaveFundingMethod[],
  mobileNetworks: readonly FlutterwaveMobileNetwork[],
  details: unknown,
): FlutterwaveV4PaymentDetails {
  const input = asRecord(details);
  const method = input.type;
  if (typeof method !== "string" || method === "bank_transfer" ||
      !paymentMethods.includes(method as FlutterwaveFundingMethod)) {
    fail("This Flutterwave payment method is not enabled for your country.", "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY", 422);
  }
  if (method === "card") {
    const card = asRecord(input.card);
    const encryptedFields = [
      card.encrypted_card_number, card.encrypted_expiry_month, card.encrypted_expiry_year, card.encrypted_cvv,
    ];
    if (!encryptedFields.every((field) => typeof field === "string" && field.length >= 8 && field.length <= 512) ||
        typeof card.nonce !== "string" || !/^[A-Za-z0-9]{12}$/.test(card.nonce)) {
      fail("The encrypted card details are incomplete. Re-enter the card details and try again.", "INVALID_PAYMENT_DETAILS", 400);
    }
    return {
      type: "card",
      card: {
        encrypted_card_number: card.encrypted_card_number as string,
        encrypted_expiry_month: card.encrypted_expiry_month as string,
        encrypted_expiry_year: card.encrypted_expiry_year as string,
        encrypted_cvv: card.encrypted_cvv as string,
        nonce: card.nonce,
      },
    };
  }
  if (method === "mobile_money") {
    const mobileMoney = asRecord(input.mobile_money);
    const network = typeof mobileMoney.network === "string" ? mobileMoney.network.trim().toUpperCase() : "";
    const allowedNetworks = mobileNetworks.map((entry) => entry.network.toUpperCase());
    const rawPhoneNumber = typeof mobileMoney.phone_number === "string"
      ? mobileMoney.phone_number.replace(/\D/g, "") : "";
    const phoneNumber = rawPhoneNumber.startsWith("0") ? rawPhoneNumber.slice(1) : rawPhoneNumber;
    const dialCode = countryCallingCode(countryCode);
    if (!dialCode || !allowedNetworks.includes(network) ||
        !/^\d{7,10}$/.test(phoneNumber)) {
      fail("Choose a supported mobile-money network and enter its 7–10 digit phone number.", "INVALID_PAYMENT_DETAILS", 400);
    }
    return {
      type: "mobile_money",
      mobile_money: { country_code: dialCode, network, phone_number: phoneNumber },
    };
  }
  if (method === "bank_account") {
    if (countryCode !== "NG") {
      fail("Pay with Bank is available for NGN collections only.", "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY", 422);
    }
    return { type: "bank_account", bank_account: {} };
  }
  if (method === "ussd") {
    const bankCode = typeof asRecord(input.ussd).account_bank === "string"
      ? String(asRecord(input.ussd).account_bank) : "";
    const validBanks = new Set([
      "044", "050", "070", "011", "214", "058", "030", "082", "303", "105",
      "221", "232", "032", "033", "215", "090110", "035", "057",
    ]);
    if (countryCode !== "NG" || !validBanks.has(bankCode)) {
      fail("Choose a bank that supports Flutterwave USSD payments.", "INVALID_PAYMENT_DETAILS", 400);
    }
    return { type: "ussd", ussd: { account_bank: bankCode } };
  }
  return { type: "opay" };
}

function customerNameParts(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  const validNamePart = (part: string) => part.length >= 2 && part.length <= 50 &&
    /^[A-Za-z ,.'-]+$/.test(part) && /[A-Za-z]/.test(part);
  if (value.length > 160 || !validNamePart(first) || !validNamePart(last)) {
    fail("Enter a valid first and last name to continue with Flutterwave.", "ACCOUNT_NAME_REQUIRED", 400);
  }
  return { first, last };
}

export async function initializeFlutterwaveCheckout(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
  countryCode: string | null;
  pricingQuote: CurrencyPackQuote;
  paymentDetails: unknown;
  customerName: string;
  customerAddress: {
    city: string;
    state: string;
    line1: string;
    line2?: string;
    postalCode: string;
  };
}) {
  if (!Number.isSafeInteger(input.tokenPack) || input.tokenPack < 100 ||
      input.tokenPack > 9_000_000_000 || !validIdempotencyKey(input.idempotencyKey)) {
    fail("Choose a supported token amount and retry checkout.", "INVALID_PURCHASE", 400);
  }
  const configuration = resolveConfiguration(input.countryCode);
  if (!configuration?.ready) {
    fail("Flutterwave v4 is not configured for the detected country and currency.", "FLUTTERWAVE_NOT_CONFIGURED", 503);
  }
  const { currency, profile, paymentMethods, credentials } = configuration;
  const requestedMethod = asRecord(input.paymentDetails).type;
  const mobileNetworks = requestedMethod === "mobile_money"
    ? await getFlutterwaveMobileNetworks(profile.countryCode).catch(() => [])
    : [];
  const method = validatePaymentDetails(profile.countryCode, paymentMethods, mobileNetworks, input.paymentDetails);
  const amountMinor = input.pricingQuote.amountMinor;
  const amountMajor = toMajorAmount(amountMinor, currency);
  const creditsSubunits = input.tokenPack * 1_000;
  if (input.pricingQuote.tokens !== input.tokenPack || input.pricingQuote.currency !== currency ||
      input.pricingQuote.usdAmountCents !== input.tokenPack || !Number.isFinite(input.pricingQuote.fxRate) ||
      !input.pricingQuote.fxUpdatedAt || !input.pricingQuote.quotedAt ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMajor === null ||
      !Number.isSafeInteger(creditsSubunits)) {
    fail("The server-side price quote is invalid for this Flutterwave v4 checkout.", "INVALID_PRICE_CONFIGURATION", 503);
  }
  const sql = await getSql();
  await readWallet(input.userId);
  const existing = await sql.query<{
    id: string; product_id: string; amount_minor: number | string; currency: string;
    status: string; provider_transaction_id: string | null; provider_metadata: JsonRecord | string | null;
  }>(
    "select id, product_id, amount_minor, currency, status, provider_transaction_id, provider_metadata " +
    "from billing_purchase_intents where user_id = $1 and provider = 'flutterwave' and idempotency_key = $2 limit 1",
    [input.userId, input.idempotencyKey],
  );
  if (existing[0]) {
    const prior = existing[0];
    if (prior.product_id !== "tokens-" + input.tokenPack ||
        Number(prior.amount_minor) !== amountMinor || prior.currency.toUpperCase() !== currency) {
      fail("This checkout key was already used for a different purchase. Start a new checkout.", "IDEMPOTENCY_CONFLICT", 409);
    }
    if (prior.status === "pending" && prior.provider_transaction_id) {
      const metadata = typeof prior.provider_metadata === "string"
        ? JSON.parse(prior.provider_metadata) as JsonRecord : prior.provider_metadata ?? {};
      return {
        reference: prior.id,
        chargeId: prior.provider_transaction_id,
        tokens: input.tokenPack,
        status: "pending",
        authorizationUrl: typeof metadata.authorizationUrl === "string" ? metadata.authorizationUrl : null,
        nextAction: typeof metadata.nextAction === "string" ? metadata.nextAction : null,
        paymentInstruction: typeof metadata.paymentInstruction === "string" ? metadata.paymentInstruction : null,
      };
    }
    fail("This checkout attempt has already been used. Start a new attempt.", "CHECKOUT_ALREADY_USED", 409);
  }

  const users = await sql.query<{ email: string; name: string | null }>(
    'select email, name from "user" where id = $1 limit 1', [input.userId],
  );
  const email = users[0]?.email?.trim() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Add a valid email address to your enV account before funding the wallet.", "ACCOUNT_EMAIL_REQUIRED", 400);
  }
  const name = customerNameParts(input.customerName || users[0]?.name || "");
  const rawPhone = method.type === "mobile_money" ? method.mobile_money!.phone_number
    : typeof asRecord(input.paymentDetails).phoneNumber === "string"
      ? String(asRecord(input.paymentDetails).phoneNumber).replace(/\D/g, "") : "";
  const phone = rawPhone.startsWith("0") ? rawPhone.slice(1) : rawPhone;
  const dialCode = countryCallingCode(profile.countryCode);
  if (!dialCode || !/^\d{7,10}$/.test(phone)) {
    fail("Enter a valid 7–10 digit phone number to continue with Flutterwave.", "ACCOUNT_PHONE_REQUIRED", 400);
  }
  const address = {
    city: input.customerAddress.city.trim(),
    country: profile.countryCode,
    line1: input.customerAddress.line1.trim(),
    ...(input.customerAddress.line2?.trim() ? { line2: input.customerAddress.line2.trim() } : {}),
    postal_code: input.customerAddress.postalCode.trim(),
    state: input.customerAddress.state.trim(),
  };
  if (!address.city || address.city.length > 100 || !address.line1 || address.line1.length > 160 ||
      !address.postal_code || address.postal_code.length > 24 || !address.state || address.state.length > 100 ||
      (address.line2 && address.line2.length > 160)) {
    fail("Enter a complete billing address to continue with Flutterwave.", "INVALID_CUSTOMER_ADDRESS", 400);
  }
  const origin = publicOrigin();
  if (!origin) fail("The secure public callback origin is not configured.", "FLUTTERWAVE_NOT_CONFIGURED", 503);

  const intentId = randomUUID();
  const v4IdempotencyKey = createHash("sha256").update(String(input.idempotencyKey)).digest("hex");
  const baseMetadata = {
    reference: intentId,
    tokenPack: input.tokenPack,
    countryCode: profile.countryCode,
    currency,
    baseCurrency: "USD",
    usdAmountCents: input.pricingQuote.usdAmountCents,
    fxRate: input.pricingQuote.fxRate,
    fxSource: input.pricingQuote.fxSource,
    fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
    fxNextUpdateAt: input.pricingQuote.fxNextUpdateAt,
    fxFetchedAt: input.pricingQuote.fxFetchedAt,
    quotedAt: input.pricingQuote.quotedAt,
    paymentMethod: method.type,
  };
  await sql.query(
    "insert into billing_purchase_intents " +
    "(id, user_id, provider, platform, product_id, amount_minor, currency, credits_subunits, status, idempotency_key, provider_metadata) " +
    "values ($1, $2, 'flutterwave', 'web', $3, $4, $5, $6, 'created', $7, $8::jsonb)",
    [intentId, input.userId, "tokens-" + input.tokenPack, amountMinor, currency, creditsSubunits,
      input.idempotencyKey, JSON.stringify(baseMetadata)],
  );

  try {
    const data = await flutterwaveRequest("/orchestration/direct-charges", {
      method: "POST",
      body: JSON.stringify({
        reference: intentId,
        amount: amountMajor,
        currency,
        redirect_url: origin + "/api/billing/flutterwave/verify?reference=" + encodeURIComponent(intentId),
        customer: {
          address,
          email,
          name,
          phone: { country_code: dialCode, number: phone },
        },
        payment_method: method,
        meta: { purchaseIntentId: intentId, tokenPack: input.tokenPack, countryCode: profile.countryCode },
      }),
    }, v4IdempotencyKey);
    const chargeId = typeof data.id === "string" ? data.id : "";
    const returnedReference = typeof data.reference === "string" ? data.reference : "";
    const providerStatus = typeof data.status === "string" ? data.status.toLowerCase() : "";
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(chargeId) || returnedReference !== intentId) {
      throw new Error("Flutterwave v4 returned an incomplete or mismatched charge response.");
    }
    const nextAction = asRecord(data.next_action) as FlutterwaveV4NextAction;
    const nextAuthorizationType = String(asRecord(nextAction.authorization).type ?? "").toLowerCase();
    const normalizedNextAction = nextAuthorizationType === "pin" || nextAction.type === "requires_pin"
      ? "requires_pin"
      : nextAuthorizationType === "otp" || nextAction.type === "requires_otp"
        ? "requires_otp"
        : nextAuthorizationType === "avs" || nextAction.type === "requires_additional_fields"
          ? "requires_additional_fields"
          : typeof nextAction.type === "string" ? nextAction.type : null;
    const authorizationUrl = safeProviderRedirect(asRecord(nextAction.redirect_url).url);
    const paymentInstruction = typeof asRecord(nextAction.payment_instruction).note === "string"
      ? String(asRecord(nextAction.payment_instruction).note).slice(0, 500) : null;
    if (providerStatus === "failed" || providerStatus === "voided") {
      await sql.query(
        "update billing_purchase_intents set status = 'failed', provider_transaction_id = $2, updated_at = now() where id = $1",
        [intentId, chargeId],
      );
      fail("Flutterwave could not authorize this payment method. No wallet tokens were added.", "FLUTTERWAVE_INITIALIZATION_FAILED", 502);
    }
    const metadata = {
      ...baseMetadata,
      chargeId,
      providerStatus,
      authorizationUrl,
      nextAction: normalizedNextAction,
      paymentInstruction,
    };
    await sql.query(
      "update billing_purchase_intents set status = 'pending', provider_transaction_id = $2, checkout_url = $3, " +
      "provider_metadata = $4::jsonb, updated_at = now() where id = $1 and status in ('created', 'pending')",
      [intentId, chargeId, authorizationUrl, JSON.stringify(metadata)],
    );
    if (providerStatus === "succeeded") {
      await verifyAndCreditFlutterwaveReference(intentId, chargeId);
    }
    return {
      authorizationUrl,
      reference: intentId,
      chargeId,
      tokens: input.tokenPack,
      status: providerStatus === "succeeded" ? "succeeded" : "pending",
      nextAction: normalizedNextAction,
      paymentInstruction,
    };
  } catch (error) {
    const candidate = error as { code?: unknown };
    if (typeof candidate.code === "string" &&
        ["FLUTTERWAVE_AUTH_FAILED", "FLUTTERWAVE_API_ERROR", "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY",
          "ACCOUNT_PHONE_REQUIRED", "ACCOUNT_NAME_REQUIRED", "INVALID_PAYMENT_DETAILS",
          "INVALID_CUSTOMER_ADDRESS"].includes(candidate.code)) {
      await sql.query(
        "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
        [intentId],
      ).catch(() => undefined);
      throw error;
    }
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
      [intentId],
    ).catch(() => undefined);
    const wrapped = new Error("Flutterwave v4 could not initialize this charge. No wallet tokens were added.");
    Object.assign(wrapped, { code: "FLUTTERWAVE_INITIALIZATION_FAILED", status: 502 });
    throw wrapped;
  }
}


export async function initializeFlutterwaveBankTransfer(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
  countryCode: string | null;
  pricingQuote: CurrencyPackQuote;
  customerName: string;
  customerPhone: string;
  customerAddress: {
    city: string;
    state: string;
    line1: string;
    line2?: string;
    postalCode: string;
  };
}) {
  if (!Number.isSafeInteger(input.tokenPack) || input.tokenPack < 100 ||
      input.tokenPack > 9_000_000_000 || !validIdempotencyKey(input.idempotencyKey)) {
    fail("Choose a supported token amount and retry checkout.", "INVALID_PURCHASE", 400);
  }
  const configuration = resolveConfiguration(input.countryCode);
  if (!configuration?.ready || !configuration.paymentMethods.includes("bank_transfer")) {
    fail("Flutterwave bank transfer is not enabled for the detected country and currency.", "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY", 422);
  }
  const { currency, profile } = configuration;
  if (currency !== "NGN" && currency !== "GHS") {
    fail("Flutterwave virtual-account transfers are not available for this currency.", "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY", 422);
  }
  const amountMinor = input.pricingQuote.amountMinor;
  const amountMajor = toMajorAmount(amountMinor, currency);
  const creditsSubunits = input.tokenPack * 1_000;
  if (input.pricingQuote.tokens !== input.tokenPack || input.pricingQuote.currency !== currency ||
      input.pricingQuote.usdAmountCents !== input.tokenPack || !Number.isFinite(input.pricingQuote.fxRate) ||
      !input.pricingQuote.fxUpdatedAt || !input.pricingQuote.quotedAt ||
      !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMajor === null ||
      !Number.isSafeInteger(creditsSubunits)) {
    fail("The server-side price quote is invalid for this Flutterwave transfer.", "INVALID_PRICE_CONFIGURATION", 503);
  }

  const sql = await getSql();
  await readWallet(input.userId);
  const existing = await sql.query<{
    id: string; product_id: string; amount_minor: number | string; currency: string;
    status: string; provider_metadata: JsonRecord | string | null;
  }>(
    "select id, product_id, amount_minor, currency, status, provider_metadata " +
    "from billing_purchase_intents where user_id = $1 and provider = 'flutterwave' and idempotency_key = $2 limit 1",
    [input.userId, input.idempotencyKey],
  );
  if (existing[0]) {
    const prior = existing[0];
    if (prior.product_id !== "tokens-" + input.tokenPack ||
        Number(prior.amount_minor) !== amountMinor || prior.currency.toUpperCase() !== currency) {
      fail("This checkout key was already used for a different purchase. Start a new checkout.", "IDEMPOTENCY_CONFLICT", 409);
    }
    if (prior.status === "pending") {
      const metadata = providerMetadata(prior.provider_metadata);
      const transfer = asRecord(metadata.bankTransfer);
      if (typeof transfer.accountNumber === "string" && typeof transfer.bankName === "string") {
        return {
          reference: prior.id,
          tokens: input.tokenPack,
          status: "pending",
          bankTransfer: transfer,
        };
      }
    }
    fail("This checkout attempt has already been used. Start a new attempt.", "CHECKOUT_ALREADY_USED", 409);
  }

  const users = await sql.query<{ email: string; name: string | null }>(
    'select email, name from "user" where id = $1 limit 1', [input.userId],
  );
  const email = users[0]?.email?.trim() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Add a valid email address to your enV account before funding the wallet.", "ACCOUNT_EMAIL_REQUIRED", 400);
  }
  const name = customerNameParts(input.customerName || users[0]?.name || "");
  const rawPhone = input.customerPhone.replace(/\D/g, "");
  const phone = rawPhone.startsWith("0") ? rawPhone.slice(1) : rawPhone;
  const dialCode = countryCallingCode(profile.countryCode);
  if (!dialCode || !/^\d{7,10}$/.test(phone)) {
    fail("Enter a valid 7–10 digit phone number to continue with Flutterwave.", "ACCOUNT_PHONE_REQUIRED", 400);
  }
  const address = {
    city: input.customerAddress.city.trim(),
    country: profile.countryCode,
    line1: input.customerAddress.line1.trim(),
    ...(input.customerAddress.line2?.trim() ? { line2: input.customerAddress.line2.trim() } : {}),
    postal_code: input.customerAddress.postalCode.trim(),
    state: input.customerAddress.state.trim(),
  };
  if (!address.city || address.city.length > 100 || !address.line1 || address.line1.length > 160 ||
      !address.postal_code || address.postal_code.length > 24 || !address.state || address.state.length > 100 ||
      (address.line2 && address.line2.length > 160)) {
    fail("Enter a complete billing address to continue with Flutterwave.", "INVALID_CUSTOMER_ADDRESS", 400);
  }

  const intentId = randomUUID();
  const creditsMetadata = {
    reference: intentId,
    tokenPack: input.tokenPack,
    countryCode: profile.countryCode,
    currency,
    baseCurrency: "USD",
    usdAmountCents: input.pricingQuote.usdAmountCents,
    fxRate: input.pricingQuote.fxRate,
    fxSource: input.pricingQuote.fxSource,
    fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
    fxNextUpdateAt: input.pricingQuote.fxNextUpdateAt,
    fxFetchedAt: input.pricingQuote.fxFetchedAt,
    quotedAt: input.pricingQuote.quotedAt,
    paymentMethod: "bank_transfer",
  };
  await sql.query(
    "insert into billing_purchase_intents " +
    "(id, user_id, provider, platform, product_id, amount_minor, currency, credits_subunits, status, idempotency_key, provider_metadata) " +
    "values ($1, $2, 'flutterwave', 'web', $3, $4, $5, $6, 'created', $7, $8::jsonb)",
    [intentId, input.userId, "tokens-" + input.tokenPack, amountMinor, currency, creditsSubunits,
      input.idempotencyKey, JSON.stringify(creditsMetadata)],
  );

  try {
    const customer = await flutterwaveRequest("/customers", {
      method: "POST",
      body: JSON.stringify({
        address,
        email,
        name,
        phone: { country_code: dialCode, number: phone },
        meta: { enVPurchaseReference: intentId },
      }),
    }, createHash("sha256").update(String(input.idempotencyKey) + ":customer").digest("hex"));
    const customerId = typeof customer.id === "string" ? customer.id : "";
    if (!/^cus_[A-Za-z0-9_-]{4,120}$/.test(customerId)) {
      throw new Error("Flutterwave did not return a valid customer ID for the virtual account.");
    }

    const virtualAccount = await flutterwaveRequest("/virtual-accounts", {
      method: "POST",
      body: JSON.stringify({
        reference: intentId,
        customer_id: customerId,
        amount: amountMajor,
        expiry: 3_600,
        currency,
        account_type: "dynamic",
        narration: "enV wallet funding",
        ...(currency === "NGN" ? { bank_code: "090567" } : { bank_code: "GH200100" }),
      }),
    }, createHash("sha256").update(String(input.idempotencyKey) + ":virtual-account").digest("hex"));
    const accountNumber = typeof virtualAccount.account_number === "string"
      ? virtualAccount.account_number : "";
    const bankName = typeof virtualAccount.account_bank_name === "string"
      ? virtualAccount.account_bank_name
      : typeof virtualAccount.bank_name === "string" ? virtualAccount.bank_name : "";
    const returnedReference = typeof virtualAccount.reference === "string"
      ? virtualAccount.reference : "";
    const expiresAt = typeof virtualAccount.account_expiration_datetime === "string"
      ? virtualAccount.account_expiration_datetime
      : typeof virtualAccount.expiry_date === "string" ? virtualAccount.expiry_date : "";
    const note = typeof virtualAccount.note === "string" ? virtualAccount.note.slice(0, 500) : "";
    if (!/^\d{8,20}$/.test(accountNumber) || !bankName || returnedReference !== intentId || !expiresAt) {
      throw new Error("Flutterwave returned incomplete virtual-account details.");
    }
    const bankTransfer = {
      accountNumber,
      bankName,
      currency,
      amount: amountMajor,
      reference: intentId,
      expiresAt,
      note,
    };
    await sql.query(
      "update billing_purchase_intents set status = 'pending', provider_metadata = $2::jsonb, updated_at = now() " +
      "where id = $1 and status = 'created'",
      [intentId, JSON.stringify({
        ...creditsMetadata,
        customerId,
        virtualAccountId: typeof virtualAccount.id === "string" ? virtualAccount.id : null,
        bankTransfer,
      })],
    );
    return {
      reference: intentId,
      tokens: input.tokenPack,
      status: "pending",
      bankTransfer,
    };
  } catch (error) {
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
      [intentId],
    ).catch(() => undefined);
    const candidate = error as { code?: unknown };
    if (typeof candidate.code === "string" &&
        ["FLUTTERWAVE_AUTH_FAILED", "FLUTTERWAVE_API_ERROR"].includes(candidate.code)) throw error;
    const wrapped = new Error("Flutterwave could not create the bank-transfer account. No wallet tokens were added.");
    Object.assign(wrapped, { code: "FLUTTERWAVE_INITIALIZATION_FAILED", status: 502 });
    throw wrapped;
  }
}

async function getPurchaseIntent(reference: string) {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string; provider: string; amount_minor: number | string; currency: string;
    status: string; provider_transaction_id: string | null; provider_metadata: JsonRecord | string | null;
  }>(
    "select id, provider, amount_minor, currency, status, provider_transaction_id, provider_metadata " +
    "from billing_purchase_intents where id = $1 limit 1", [reference],
  );
  return rows[0] ?? null;
}

function providerMetadata(value: JsonRecord | string | null | undefined): JsonRecord {
  if (typeof value === "string") {
    try { return JSON.parse(value) as JsonRecord; } catch { return {}; }
  }
  return value ?? {};
}

export async function verifyAndCreditFlutterwaveReference(
  reference: string,
  expectedTransactionId?: string,
  providerEventId?: string,
) {
  if (!/^[a-f0-9-]{36}$/i.test(reference) ||
      (expectedTransactionId !== undefined && !/^[A-Za-z0-9_-]{1,160}$/.test(expectedTransactionId))) {
    fail("The Flutterwave payment reference is invalid.", "INVALID_PAYMENT_REFERENCE", 400);
  }
  const intent = await getPurchaseIntent(reference);
  if (!intent || intent.provider !== "flutterwave") {
    fail("The Flutterwave payment reference was not found.", "PAYMENT_NOT_FOUND", 404);
  }
  let chargeId = intent.provider_transaction_id;
  if (!chargeId) {
    // Virtual-account transfers can complete asynchronously, so the charge ID
    // is learned from the charge list/webhook rather than the account creation response.
    const listed = await flutterwaveRequest("/charges?reference=" + encodeURIComponent(reference) + "&size=10");
    const rows = Array.isArray(listed.items) ? listed.items.map(asRecord)
      : Array.isArray(listed.data) ? listed.data.map(asRecord)
      : Object.keys(listed).length ? [listed] : [];
    const matched = rows.find((row) => row.reference === reference || row.tx_ref === reference);
    const discoveredId = asProviderId(matched?.id);
    if (!discoveredId) {
      fail("Flutterwave has not reported a completed charge for this reference yet.", "PAYMENT_NOT_CONFIRMED", 409);
    }
    const sql = await getSql();
    const updated = await sql.query<{ provider_transaction_id: string }>(
      "update billing_purchase_intents set provider_transaction_id = $2, updated_at = now() " +
      "where id = $1 and provider = 'flutterwave' and (provider_transaction_id is null or provider_transaction_id = $2) " +
      "returning provider_transaction_id",
      [reference, discoveredId],
    );
    if (!updated[0]) fail("The Flutterwave charge ID conflicts with the saved purchase.", "PURCHASE_MISMATCH", 409);
    chargeId = updated[0].provider_transaction_id;
  }
  if (expectedTransactionId && expectedTransactionId !== chargeId) {
    fail("The Flutterwave charge does not match this purchase reference.", "PAYMENT_NOT_CONFIRMED", 409);
  }
  const charge = await flutterwaveRequest("/charges/" + encodeURIComponent(chargeId));
  const returnedId = asProviderId(charge.id) ?? "";
  const returnedReference = typeof charge.reference === "string"
    ? charge.reference : typeof charge.tx_ref === "string" ? charge.tx_ref : "";
  const status = typeof charge.status === "string" ? charge.status.toLowerCase() : "";
  const paidAmountMinor = parseMajorUnitsToMinor(charge.amount as string | number | undefined, intent.currency);
  if (returnedId !== chargeId || returnedReference !== reference ||
      (charge.currency && String(charge.currency).toUpperCase() !== intent.currency.toUpperCase()) ||
      !paidAmountMinor || paidAmountMinor !== Number(intent.amount_minor)) {
    fail("The verified Flutterwave charge does not match the enV purchase amount and currency.", "PURCHASE_MISMATCH", 409);
  }
  if (status === "failed" || status === "voided") {
    const sql = await getSql();
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status in ('created', 'pending', 'verified')",
      [reference],
    );
    fail("The Flutterwave payment was not completed. No wallet tokens were added.", "PAYMENT_NOT_CONFIRMED", 409);
  }
  if (status !== "succeeded") {
    fail("Payment is not confirmed yet. Your wallet was not credited.", "PAYMENT_NOT_CONFIRMED", 409);
  }
  const eventId = providerEventId && /^[A-Za-z0-9_-]{1,200}$/.test(providerEventId)
    ? providerEventId : "charge-completed-" + chargeId;
  const canonical = JSON.stringify({
    provider: "flutterwave", reference, chargeId, amountMinor: paidAmountMinor,
    currency: intent.currency.toUpperCase(), status,
  });
  return creditVerifiedPurchase({
    purchaseIntentId: intent.id,
    provider: "flutterwave",
    providerEventId: eventId,
    providerTransactionId: chargeId,
    paidAmountMinor,
    paidCurrency: intent.currency,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: {
      chargeId,
      paymentMethod: asRecord(charge.payment_method_details).type ?? null,
      processorResponse: asRecord(charge.processor_response),
    },
  });
}

export async function authorizeFlutterwaveCharge(input: {
  userId: string;
  reference: string;
  authorizationType: "otp" | "pin" | "avs";
  otp?: string;
  encryptedPin?: string;
  nonce?: string;
  customerAddress?: {
    city: string;
    state: string;
    line1: string;
    line2?: string;
    postalCode: string;
  };
}) {
  if (!/^[a-f0-9-]{36}$/i.test(input.reference)) {
    fail("The Flutterwave purchase reference is invalid.", "INVALID_PAYMENT_REFERENCE", 400);
  }
  const intent = await getPurchaseIntent(input.reference);
  if (!intent || intent.provider !== "flutterwave") {
    fail("This Flutterwave payment could not be found.", "PAYMENT_NOT_FOUND", 404);
  }
  const sql = await getSql();
  const owners = await sql.query<{ user_id: string }>(
    "select user_id from billing_purchase_intents where id = $1 limit 1", [input.reference],
  );
  if (owners[0]?.user_id !== input.userId) {
    fail("This Flutterwave payment does not belong to the signed-in account.", "PAYMENT_NOT_FOUND", 404);
  }
  const chargeId = intent.provider_transaction_id;
  if (!chargeId) fail("The Flutterwave charge is not ready for authorization.", "PAYMENT_NOT_CONFIRMED", 409);

  let authorization: JsonRecord;
  if (input.authorizationType === "otp") {
    if (!input.otp || !/^\d{4,8}$/.test(input.otp)) {
      fail("Enter the 4–8 digit one-time code from your bank.", "INVALID_AUTHORIZATION", 400);
    }
    authorization = { type: "otp", otp: { code: input.otp } };
  } else if (input.authorizationType === "pin") {
    if (!input.encryptedPin || input.encryptedPin.length > 512 ||
        !input.nonce || !/^[A-Za-z0-9]{12}$/.test(input.nonce)) {
      fail("The encrypted card PIN is invalid. Try again.", "INVALID_AUTHORIZATION", 400);
    }
    authorization = { type: "pin", pin: { nonce: input.nonce, encrypted_pin: input.encryptedPin } };
  } else {
    const metadata = providerMetadata(intent.provider_metadata);
    const countryCode = typeof metadata.countryCode === "string" ? metadata.countryCode : "";
    const addressInput = input.customerAddress;
    if (!countryCode || !addressInput) {
      fail("A complete billing address is required by your bank to continue.", "INVALID_CUSTOMER_ADDRESS", 400);
    }
    const address = {
      city: addressInput.city.trim(),
      country: countryCode,
      line1: addressInput.line1.trim(),
      ...(addressInput.line2?.trim() ? { line2: addressInput.line2.trim() } : {}),
      postal_code: addressInput.postalCode.trim(),
      state: addressInput.state.trim(),
    };
    if (!address.city || !address.line1 || !address.postal_code || !address.state ||
        address.city.length > 100 || address.line1.length > 160 ||
        address.postal_code.length > 24 || address.state.length > 100 ||
        (address.line2 && address.line2.length > 160)) {
      fail("Enter a complete billing address to continue.", "INVALID_CUSTOMER_ADDRESS", 400);
    }
    authorization = { type: "avs", avs: { address } };
  }

  const updated = await flutterwaveRequest("/charges/" + encodeURIComponent(chargeId), {
    method: "PUT",
    body: JSON.stringify({ authorization }),
  }, createHash("sha256").update(input.reference + ":" + input.authorizationType + ":" + randomUUID()).digest("hex"));
  const nextAction = asRecord(updated.next_action) as FlutterwaveV4NextAction;
  const nextAuthorizationType = String(asRecord(nextAction.authorization).type ?? "").toLowerCase();
  const normalizedNextAction = nextAuthorizationType === "pin" || nextAction.type === "requires_pin"
    ? "requires_pin"
    : nextAuthorizationType === "otp" || nextAction.type === "requires_otp"
      ? "requires_otp"
      : nextAuthorizationType === "avs" || nextAction.type === "requires_additional_fields"
        ? "requires_additional_fields"
        : typeof nextAction.type === "string" ? nextAction.type : null;
  const redirect = safeProviderRedirect(asRecord(nextAction.redirect_url).url);
  const instruction = typeof asRecord(nextAction.payment_instruction).note === "string"
    ? String(asRecord(nextAction.payment_instruction).note).slice(0, 500) : null;
  if (String(updated.status).toLowerCase() === "succeeded") {
    await verifyAndCreditFlutterwaveReference(input.reference, chargeId);
  }
  return {
    status: typeof updated.status === "string" ? updated.status : "pending",
    authorizationUrl: redirect,
    nextAction: normalizedNextAction,
    paymentInstruction: instruction,
  };
}
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function updateFlutterwaveIntentStatus(reference: string, status: "failed" | "cancelled") {
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    fail("The Flutterwave payment reference is invalid.", "INVALID_PAYMENT_REFERENCE", 400);
  }
  const sql = await getSql();
  await sql.query(
    "update billing_purchase_intents set status = $2, updated_at = now() " +
    "where id = $1 and provider = 'flutterwave' and status in ('created', 'pending', 'verified')",
    [reference, status],
  );
}

function asProviderId(value: unknown): string | null {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function flutterwaveRefundStatus(value: unknown): "pending" | "processing" | "needs_attention" | "failed" | "completed" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "succeeded" || status === "successful" || status === "completed") return "completed";
  if (status === "processing" || status === "new") return "processing";
  if (status.startsWith("pending")) return "pending";
  return "needs_attention";
}

function flutterwaveDisputeStatus(value: unknown): "open" | "accepted" | "declined" | "review_required" | "won" | "lost" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "initiated" || status === "pending" || status === "open" || status === "new") return "open";
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (status === "won" || status === "reversed") return "won";
  if (status === "lost") return "lost";
  return "review_required";
}

async function verifiedResource(resource: "refunds" | "chargebacks", id: string): Promise<JsonRecord> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) fail("The Flutterwave reconciliation ID is invalid.", "INVALID_WEBHOOK", 400);
  return flutterwaveRequest("/" + resource + "/" + encodeURIComponent(id));
}

async function handleFlutterwaveRefundWebhook(data: JsonRecord) {
  const refundId = asProviderId(data.id);
  const chargeId = asProviderId(data.charge_id);
  if (!refundId || !chargeId) fail("The Flutterwave refund event is missing its refund or charge ID.", "INVALID_REFUND_WEBHOOK", 400);
  const refund = await verifiedResource("refunds", refundId);
  const verifiedChargeId = asProviderId(refund.charge_id);
  if (verifiedChargeId !== chargeId) fail("The Flutterwave refund does not match its original charge.", "REFUND_PROVIDER_MISMATCH", 409);
  const intents = await (await getSql()).query<{
    id: string; provider_transaction_id: string; amount_minor: number | string; currency: string;
  }>(
    "select id, provider_transaction_id, amount_minor, currency from billing_purchase_intents " +
    "where provider = 'flutterwave' and provider_transaction_id = $1 limit 1", [chargeId],
  );
  const intent = intents[0];
  if (!intent) fail("The Flutterwave refund does not match a recorded enV purchase.", "PURCHASE_MISMATCH", 409);
  const amountMinor = parseMajorUnitsToMinor(
    (refund.amount_refunded ?? refund.amount) as string | number | undefined, intent.currency,
  );
  if (!amountMinor || amountMinor > Number(intent.amount_minor) ||
      (refund.currency !== undefined && String(refund.currency).toUpperCase() !== intent.currency.toUpperCase())) {
    fail("The verified Flutterwave refund amount or currency is invalid.", "REFUND_PROVIDER_MISMATCH", 409);
  }
  const status = flutterwaveRefundStatus(refund.status);
  const canonical = JSON.stringify({
    provider: "flutterwave", refundId, chargeId, amountMinor,
    currency: intent.currency.toUpperCase(), status: refund.status,
  });
  return reconcileVerifiedRefund({
    provider: "flutterwave",
    providerRefundId: refundId,
    purchaseIntentId: intent.id,
    amountMinor,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: { providerStatus: refund.status, chargeId },
  });
}

async function handleFlutterwaveChargebackWebhook(data: JsonRecord) {
  const disputeId = asProviderId(data.id);
  const chargeId = asProviderId(data.charge_id);
  if (!disputeId || !chargeId) fail("The Flutterwave dispute event is missing its dispute or charge ID.", "INVALID_CHARGEBACK_WEBHOOK", 400);
  const dispute = await verifiedResource("chargebacks", disputeId);
  if (asProviderId(dispute.charge_id) !== chargeId) {
    fail("The Flutterwave dispute does not match its original charge.", "CHARGEBACK_PROVIDER_MISMATCH", 409);
  }
  const intents = await (await getSql()).query<{
    id: string; provider_transaction_id: string; amount_minor: number | string; currency: string;
  }>(
    "select id, provider_transaction_id, amount_minor, currency from billing_purchase_intents " +
    "where provider = 'flutterwave' and provider_transaction_id = $1 limit 1", [chargeId],
  );
  const intent = intents[0];
  if (!intent) fail("The Flutterwave dispute does not match a verified enV purchase.", "PURCHASE_MISMATCH", 409);
  const amountMinor = parseMajorUnitsToMinor(dispute.amount as string | number | undefined, intent.currency);
  if (!amountMinor || amountMinor > Number(intent.amount_minor)) {
    fail("The verified Flutterwave dispute amount is invalid.", "CHARGEBACK_PROVIDER_MISMATCH", 409);
  }
  const status = flutterwaveDisputeStatus(dispute.status);
  const canonical = JSON.stringify({
    provider: "flutterwave", disputeId, chargeId, amountMinor,
    currency: intent.currency.toUpperCase(), status: dispute.status,
  });
  return reconcileVerifiedDispute({
    provider: "flutterwave",
    providerDisputeId: disputeId,
    purchaseIntentId: intent.id,
    amountMinor,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: { providerStatus: dispute.status, chargeId },
  });
}

export async function handleFlutterwaveWebhook(request: Request) {
  const expectedHash = flutterwaveCredentials().secretHash;
  if (!expectedHash) fail("The Flutterwave webhook secret hash is not configured.", "FLUTTERWAVE_NOT_CONFIGURED", 503);
  const rawBytes = await readBoundedBytes(request, 256_000);
  if (!rawBytes) fail("Webhook payload is too large or unreadable.", "WEBHOOK_TOO_LARGE", 413);
  const suppliedSignature = request.headers.get("flutterwave-signature") ?? "";
  const expectedSignature = createHmac("sha256", expectedHash).update(rawBytes).digest("base64");
  if (!suppliedSignature || !safeEqual(suppliedSignature, expectedSignature)) {
    fail("The Flutterwave webhook signature is invalid.", "INVALID_WEBHOOK_SIGNATURE", 401);
  }
  let body: JsonRecord;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    body = parsed as JsonRecord;
  } catch {
    fail("The Flutterwave webhook payload is invalid.", "INVALID_WEBHOOK", 400);
  }
  const data = asRecord(body.data);
  const eventName = typeof body.type === "string" ? body.type.toLowerCase()
    : typeof body.event === "string" ? body.event.toLowerCase() : "";
  const eventId = asProviderId(body.id);
  if (eventName === "charge.completed") {
    const reference = typeof data.reference === "string" ? data.reference
      : typeof data.tx_ref === "string" ? data.tx_ref : "";
    const chargeId = asProviderId(data.id);
    if (!reference || !/^[a-f0-9-]{36}$/i.test(reference)) {
      fail("The Flutterwave charge event is missing its enV purchase reference.", "INVALID_WEBHOOK", 400);
    }
    const status = String(data.status).toLowerCase();
    if (status === "failed" || status === "voided") {
      await updateFlutterwaveIntentStatus(reference, "failed");
      return { status: "failed" as const };
    }
    if (status !== "succeeded" && status !== "successful") return { status: "pending" as const };
    return verifyAndCreditFlutterwaveReference(reference, chargeId ?? undefined, eventId ?? undefined);
  }
  if (eventName === "refund.completed") return handleFlutterwaveRefundWebhook(data);
  if (eventName.startsWith("chargeback.")) return handleFlutterwaveChargebackWebhook(data);
  return { ignored: true };
}
