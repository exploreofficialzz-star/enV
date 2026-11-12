import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import {
  readWallet, creditVerifiedPurchase, reconcileVerifiedRefund, reconcileVerifiedDispute,
} from "./ledger.server";
import { getPaystackLocalChannels, requirePaystackVerificationSecret, resolvePaystackCountryConfiguration } from "./provider-config";
import { readBoundedBytes } from "./bounded-json.server";
import { getCountryPaymentProfile, normalizeCountryCode } from "./country-routing";
import { getFlutterwaveFundingOption } from "./flutterwave.server";
import { quoteTokenPacks, type CurrencyPackQuote } from "./fx.server";

export const TOKEN_PACKS = [100, 250, 500, 1_000] as const;

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

function resolvePaystackConfiguration(countryCode: string | null | undefined) {
  const selected = resolvePaystackCountryConfiguration(countryCode, process.env);
  if (!selected) return null;

  const launchChecksPassed =
    process.env.BILLING_LAUNCH_ENABLED === "true" &&
    process.env.BILLING_ENFORCEMENT_ENABLED === "true" &&
    process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true" &&
    Boolean(publicOrigin());

  return {
    ...selected,
    enabled: launchChecksPassed && selected.enabled,
    origin: publicOrigin(),
  };
}
export function minimumPaystackAmountMinor(currency: string): number {
  // Paystack's documented transaction minimums, expressed in the ISO currency
  // minor units used by this merchant's accepted settlement currency.
  const minimums: Record<string, number> = {
    NGN: 5_000,
    USD: 200,
    GHS: 10,
    KES: 300,
    ZAR: 100,
  };
  return minimums[currency] ?? 1;
}

/** Build a Paystack option from the detected customer country and actual merchant settlement currency. */
export async function getPaystackFundingOption(countryCode: string | null | undefined) {
  const configuration = resolvePaystackConfiguration(countryCode);
  if (!configuration) return null;
  const { currency, international, enabled } = configuration;
  let quotes: CurrencyPackQuote[];
  try {
    quotes = await quoteTokenPacks(currency, TOKEN_PACKS);
  } catch {
    return {
      id: "paystack" as const,
      label: international ? "Paystack · international cards (" + currency + ")" : "Paystack · " + currency,
      enabled: false,
      currency,
      pricePerTokenMinor: null,
      packs: [],
      localPayments: !international && getPaystackLocalChannels(countryCode).length > 0,
      message: "A current USD exchange-rate quote is unavailable for " + currency + ". No local amount was estimated.",
    };
  }
  const minimum = minimumPaystackAmountMinor(currency);
  const packs = quotes.map((quote) => ({
    ...quote,
    enabled: enabled && quote.amountMinor >= minimum,
    message: quote.amountMinor < minimum
      ? "This pack is below Paystack's minimum transaction amount for " + currency + "."
      : undefined,
  }));
  const anyPackAvailable = packs.some((pack) => pack.enabled);
  // Custom amounts are quoted on demand. A preset pack failing the minimum
  // must not disable a larger custom amount that meets the same provider rules.
  const ready = enabled;
  const message = !configuration.secret
    ? "Paystack credentials for " + currency + " are not configured on this deployment."
    : !enabled
      ? "Paystack checkout is disabled until merchant, billing and refund/dispute recovery checks are approved."
      : !anyPackAvailable
        ? "The available token packs do not meet Paystack's minimum transaction amount in " + currency + "."
        : "Choose a token pack. The final amount uses the current USD-to-" + currency + " reference rate; enV verifies payment before crediting tokens.";
  return {
    id: "paystack" as const,
    label: international ? "Paystack · international cards (" + currency + ")" : "Paystack · " + currency,
    enabled: ready,
    currency,
    pricePerTokenMinor: null,
    fxRate: quotes[0]?.fxRate ?? null,
    fxSource: quotes[0]?.fxSource ?? null,
    fxUpdatedAt: quotes[0]?.fxUpdatedAt ?? null,
    fxNextUpdateAt: quotes[0]?.fxNextUpdateAt ?? null,
    fxFetchedAt: quotes[0]?.fxFetchedAt ?? null,
    localPayments: !international && getPaystackLocalChannels(countryCode).length > 0,
    packs,
    message: !anyPackAvailable && enabled
      ? "Enter a custom amount that meets the payment minimum for " + currency + "."
      : message,
  };
}

export async function getFundingOptions(countryCode: string | null = null) {
  const [paystack, flutterwave] = await Promise.all([
    getPaystackFundingOption(countryCode),
    getFlutterwaveFundingOption(countryCode),
  ]);

  const refundDisputeHandlingApproved =
    process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true";
  const launchChecksPassed =
    process.env.BILLING_LAUNCH_ENABLED === "true" &&
    process.env.BILLING_ENFORCEMENT_ENABLED === "true" &&
    refundDisputeHandlingApproved && Boolean(publicOrigin());

  const cryptomusMerchantId = process.env.CRYPTOMUS_MERCHANT_ID?.trim() ?? "";
  const cryptomusApiKey = process.env.CRYPTOMUS_PAYMENT_API_KEY?.trim() ?? "";
  // Cryptomus charges the same USD reference price: one cent per enV token.
  const cryptoPricePerTokenMinor = 1;
  const cryptomusEnabled = launchChecksPassed &&
    process.env.CRYPTOMUS_PROVIDER_APPROVED === "true" &&
    /^[a-f0-9-]{36}$/i.test(cryptomusMerchantId) &&
    Boolean(cryptomusApiKey) &&
    cryptoPricePerTokenMinor !== null;

  const packsFor = (price: number, currency: string) => TOKEN_PACKS.map((tokens) => ({
    tokens,
    amountMinor: tokens * price,
    currency,
    enabled: cryptomusEnabled,
  }));

  const cryptomusMessage = cryptomusEnabled
    ? "Choose a token pack. enV verifies the final crypto invoice before crediting your wallet."
    : process.env.CRYPTOMUS_PROVIDER_APPROVED !== "true"
      ? "Crypto payments are unavailable until Cryptomus onboarding and compliance approval are complete."
      : !refundDisputeHandlingApproved
        ? "Crypto payments are disabled until refund and dispute reconciliation has been approved."
        : "Secure crypto checkout is not configured for this deployment.";

  const providers = [
    ...(paystack ? [paystack] : []),
    ...(flutterwave ? [flutterwave] : []),
    {
      id: "cryptomus" as const,
      label: "Pay with crypto",
      enabled: cryptomusEnabled,
      currency: "USD",
      pricePerTokenMinor: cryptoPricePerTokenMinor,
      packs: packsFor(cryptoPricePerTokenMinor, "USD"),
      message: cryptomusMessage,
    },
  ];
  const firstEnabled = providers.find((provider) => provider.enabled);
  const country = normalizeCountryCode(countryCode);

  return {
    countryCode: country,
    currency: firstEnabled?.currency ?? getCountryPaymentProfile(country)?.currency ?? null,
    enabled: Boolean(firstEnabled),
    provider: firstEnabled?.id ?? null,
    providers,
    anyEnabled: providers.some((provider) => provider.enabled),
    message: country
      ? "Payment methods are selected for your detected country. Only configured and approved provider currencies are enabled."
      : "Your country could not be detected. Retry from an online connection to show local payment methods.",
  };
}

function requireLiveFunding(countryCode: string | null, pricingQuote: CurrencyPackQuote, tokenPack: number) {
  const configuration = resolvePaystackConfiguration(countryCode);
  if (!configuration || !configuration.enabled || !configuration.secret || !configuration.origin) {
    throw Object.assign(new Error("Paystack is not enabled for the detected country and currency."), {
      code: "PAYMENTS_NOT_CONFIGURED", status: 503,
    });
  }
  if (pricingQuote.tokens !== tokenPack || pricingQuote.currency !== configuration.currency ||
      !Number.isSafeInteger(pricingQuote.amountMinor) || pricingQuote.amountMinor < minimumPaystackAmountMinor(configuration.currency) ||
      pricingQuote.usdAmountCents !== tokenPack || !Number.isFinite(pricingQuote.fxRate) ||
      !pricingQuote.fxUpdatedAt || !pricingQuote.quotedAt) {
    throw Object.assign(new Error("The server-side token pack FX quote is invalid or no longer eligible for this Paystack account."), {
      code: "INVALID_PRICE_CONFIGURATION", status: 503,
    });
  }
  return { ...configuration, pricingQuote };
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 &&
    /^[A-Za-z0-9:_-]+$/.test(value);
}

export async function initializePaystackCheckout(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
  pricingQuote: CurrencyPackQuote;
  paymentMethod?: "card" | "local";
}, countryCode: string | null) {
  if (!Number.isSafeInteger(input.tokenPack) || input.tokenPack < 100 ||
      input.tokenPack > 9_000_000_000 || !validIdempotencyKey(input.idempotencyKey)) {
    throw Object.assign(new Error("Choose a supported token pack and retry the checkout."), { code: "INVALID_PURCHASE", status: 400 });
  }
  const configuration = requireLiveFunding(countryCode, input.pricingQuote, input.tokenPack);
  if (input.paymentMethod === "local" &&
      (configuration.international || getPaystackLocalChannels(countryCode).length === 0)) {
    throw Object.assign(new Error("Local payment methods are not available for this country and merchant account."), {
      code: "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY", status: 422,
    });
  }
  const amountMinor = input.pricingQuote.amountMinor;
  const creditsSubunits = input.tokenPack * 1_000;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !Number.isSafeInteger(creditsSubunits)) {
    throw Object.assign(new Error("The configured token price is outside the supported range."), { code: "INVALID_PRICE_CONFIGURATION", status: 503 });
  }

  const sql = await getSql();
  await readWallet(input.userId);
  const existing = await sql.query<{
    id: string; product_id: string; amount_minor: number | string; currency: string; status: string; checkout_url: string | null;
  }>(
    `select id, product_id, amount_minor, currency, status, checkout_url
       from billing_purchase_intents
      where user_id = $1 and provider = 'paystack' and idempotency_key = $2
      limit 1`,
    [input.userId, input.idempotencyKey],
  );
  if (existing[0]) {
    const prior = existing[0];
    if (prior.product_id !== `tokens-${input.tokenPack}` || Number(prior.amount_minor) !== amountMinor || prior.currency.toUpperCase() !== configuration.currency) {
      throw Object.assign(new Error("This checkout key was already used for a different purchase."), { code: "IDEMPOTENCY_CONFLICT", status: 409 });
    }
    if (prior.status === "pending" && prior.checkout_url) return { authorizationUrl: prior.checkout_url, reference: prior.id, tokens: input.tokenPack };
    throw Object.assign(new Error("This checkout attempt has already been used. Start a new attempt."), { code: "CHECKOUT_ALREADY_USED", status: 409 });
  }

  const users = await sql.query<{ email: string }>('select email from "user" where id = $1 limit 1', [input.userId]);
  const email = users[0]?.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Add a valid email address to your enV account before funding the wallet."), { code: "ACCOUNT_EMAIL_REQUIRED", status: 400 });
  }

  const intentId = randomUUID();
  await sql.query(
    `insert into billing_purchase_intents
      (id, user_id, provider, platform, product_id, amount_minor, currency, credits_subunits,
       status, idempotency_key, provider_metadata)
     values ($1, $2, 'paystack', 'web', $3, $4, $8, $5, 'created', $6, $7::jsonb)`,
    [intentId, input.userId, `tokens-${input.tokenPack}`, amountMinor, creditsSubunits, input.idempotencyKey,
      JSON.stringify({
        reference: intentId,
        tokenPack: input.tokenPack,
        currency: configuration.currency,
        baseCurrency: "USD",
        usdAmountCents: input.pricingQuote.usdAmountCents,
        fxRate: input.pricingQuote.fxRate,
        fxSource: input.pricingQuote.fxSource,
        fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
        fxNextUpdateAt: input.pricingQuote.fxNextUpdateAt,
        fxFetchedAt: input.pricingQuote.fxFetchedAt,
        quotedAt: input.pricingQuote.quotedAt,
      }),
      configuration.currency],
  );

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email, amount: String(amountMinor), currency: configuration.currency, reference: intentId,
        callback_url: `${configuration.origin}/api/billing/paystack/verify`,
        metadata: {
          purchaseIntentId: intentId,
          tokenPack: input.tokenPack,
          paymentMethod: input.paymentMethod ?? null,
          currency: configuration.currency,
          baseCurrency: "USD",
          usdAmountCents: input.pricingQuote.usdAmountCents,
          fxRate: input.pricingQuote.fxRate,
          fxSource: input.pricingQuote.fxSource,
          fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
          quotedAt: input.pricingQuote.quotedAt,
        },
        ...(input.paymentMethod === "card"
          ? { channels: ["card"] }
          : input.paymentMethod === "local"
            ? { channels: getPaystackLocalChannels(countryCode) }
            : configuration.international ? { channels: ["card"] } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as {
      status?: boolean; data?: { authorization_url?: string; access_code?: string; reference?: string };
    };
    const authorizationUrl = payload.data?.authorization_url;
    let parsed: URL | null = null;
    try { if (authorizationUrl) parsed = new URL(authorizationUrl); } catch { parsed = null; }
    if (!response.ok || payload.status !== true || payload.data?.reference !== intentId ||
        !parsed || parsed.protocol !== "https:" || parsed.hostname !== "checkout.paystack.com") {
      throw new Error("The payment provider did not return a valid hosted checkout URL.");
    }
    await sql.query(
      `update billing_purchase_intents set status = 'pending', checkout_url = $2,
        provider_metadata = $3::jsonb, updated_at = now() where id = $1 and status = 'created'`,
      [intentId, authorizationUrl, JSON.stringify({
        reference: intentId,
        tokenPack: input.tokenPack,
        accessCode: payload.data?.access_code ?? null,
        currency: configuration.currency,
        baseCurrency: "USD",
        usdAmountCents: input.pricingQuote.usdAmountCents,
        fxRate: input.pricingQuote.fxRate,
        fxSource: input.pricingQuote.fxSource,
        fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
        fxNextUpdateAt: input.pricingQuote.fxNextUpdateAt,
        fxFetchedAt: input.pricingQuote.fxFetchedAt,
        quotedAt: input.pricingQuote.quotedAt,
      })],
    );
    return { authorizationUrl, reference: intentId, tokens: input.tokenPack };
  } catch {
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
      [intentId],
    ).catch(() => undefined);
    throw Object.assign(new Error("Checkout could not be initialized. No wallet tokens were added and no confirmed payment was recorded."), { code: "PAYSTACK_INITIALIZATION_FAILED", status: 502 });
  }
}

export async function verifyAndCreditPaystackReference(reference: string) {
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    throw Object.assign(new Error("The payment reference is invalid."), { code: "INVALID_PAYMENT_REFERENCE", status: 400 });
  }
  // Settlement remains available when new checkout is paused. The launch and
  // enforcement switches govern initiating a new payment, not fulfilling an existing one.
  const verificationSecret = requirePaystackVerificationSecret(process.env);
  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider: string; amount_minor: number | string; currency: string;
    status: string; provider_transaction_id: string | null;
  }>(
    "select id, provider, amount_minor, currency, status, provider_transaction_id from billing_purchase_intents where id = $1 limit 1",
    [reference],
  );
  const intent = intents[0];
  if (!intent || intent.provider !== "paystack") {
    throw Object.assign(new Error("The payment reference was not found."), { code: "PAYMENT_NOT_FOUND", status: 404 });
  }
  if (intent.status === "credited") return { status: "credited" as const, creditedSubunits: 0 };

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${verificationSecret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json() as {
    status?: boolean;
    data?: { id?: string | number; status?: string; reference?: string; amount?: number; currency?: string };
  };
  const transaction = payload.data;
  if (!response.ok || payload.status !== true || !transaction ||
      transaction.reference !== reference || transaction.status !== "success" ||
      !Number.isSafeInteger(transaction.amount) || transaction.amount !== Number(intent.amount_minor) ||
      transaction.currency?.toUpperCase() !== intent.currency.toUpperCase() ||
      transaction.id === undefined || transaction.id === null) {
    throw Object.assign(new Error("Payment is not confirmed yet. Your wallet was not credited."), { code: "PAYMENT_NOT_CONFIRMED", status: 409 });
  }
  const transactionId = String(transaction.id);
  if (!/^[A-Za-z0-9._:-]{1,240}$/.test(transactionId)) {
    throw Object.assign(new Error("The provider returned an invalid transaction id."), { code: "PAYMENT_MISMATCH", status: 409 });
  }
  const canonical = JSON.stringify({
    provider: "paystack", reference, transactionId,
    amount: transaction.amount, currency: transaction.currency.toUpperCase(), status: "success",
  });
  return creditVerifiedPurchase({
    purchaseIntentId: intent.id, provider: "paystack", providerEventId: `charge-success-${transactionId}`,
    providerTransactionId: transactionId, paidAmountMinor: transaction.amount, paidCurrency: transaction.currency,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
  });
}

type PaystackApiRecord = Record<string, unknown>;

async function fetchPaystackApiRecord(path: string): Promise<PaystackApiRecord> {
  const verificationSecret = requirePaystackVerificationSecret(process.env);
  const response = await fetch("https://api.paystack.co" + path, {
    headers: { Authorization: "Bearer " + verificationSecret, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as {
    status?: unknown; message?: unknown; data?: unknown;
  } | null;
  if (!response.ok || payload?.status !== true) {
    throw Object.assign(new Error("Paystack could not verify the refund or dispute record."), {
      code: "PAYSTACK_RECONCILIATION_UNAVAILABLE", status: 503,
    });
  }
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw Object.assign(new Error("Paystack returned an invalid refund or dispute record."), {
      code: "PAYSTACK_RECONCILIATION_UNAVAILABLE", status: 503,
    });
  }
  return data as PaystackApiRecord;
}

function asPaystackId(value: unknown): string | null {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function paystackRefundStatus(value: unknown): "pending" | "processing" | "needs_attention" | "failed" | "completed" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "processed") return "completed";
  if (status === "failed") return "failed";
  if (status === "needs-attention" || status === "needs_attention") return "needs_attention";
  if (status === "processing") return "processing";
  return "pending";
}

function paystackDisputeStatus(
  value: unknown,
  resolutionValue: unknown,
): "open" | "accepted" | "declined" | "review_required" | "won" | "lost" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  const resolution = typeof resolutionValue === "string" ? resolutionValue.trim().toLowerCase() : "";
  if (status === "resolved") {
    if (resolution === "merchant-accepted") return "lost";
    if (resolution === "declined") return "won";
    return "review_required";
  }
  if (status === "awaiting-merchant-feedback") return "open";
  if (status === "awaiting-bank-feedback" || status === "pending") {
    if (resolution === "merchant-accepted") return "accepted";
    if (resolution === "declined") return "declined";
    return "review_required";
  }
  return "review_required";
}

async function handlePaystackRefundWebhook(eventName: string, data: PaystackApiRecord) {
  const transactionReference = typeof data.transaction_reference === "string"
    ? data.transaction_reference : "";
  if (!/^[a-f0-9-]{36}$/i.test(transactionReference)) {
    throw Object.assign(new Error("The Paystack refund event is missing its enV purchase reference."), {
      code: "INVALID_REFUND_WEBHOOK", status: 400,
    });
  }
  const refundReference = asPaystackId(data.refund_reference ?? data.reference);
  // Paystack intentionally sends a null refund_reference for the first pending event.
  // There is no stable refund identity yet, so acknowledge the pending notification
  // without recording a synthetic ID or touching the wallet.
  if (!refundReference && eventName === "refund.pending") {
    return { status: "pending" as const, waitingForProviderReference: true };
  }
  if (!refundReference) {
    throw Object.assign(new Error("The Paystack refund event does not include its final refund reference."), {
      code: "INVALID_REFUND_WEBHOOK", status: 503,
    });
  }
  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider_transaction_id: string | null; amount_minor: number | string; currency: string; status: string;
  }>(
    `select id, provider_transaction_id, amount_minor, currency, status
       from billing_purchase_intents where id = $1 and provider = 'paystack' limit 1`,
    [transactionReference],
  );
  const intent = intents[0];
  if (!intent || !intent.provider_transaction_id) {
    throw Object.assign(new Error("The Paystack refund does not match a verified enV purchase."), {
      code: "PURCHASE_MISMATCH", status: 409,
    });
  }
  if (!/^\d{1,24}$/.test(refundReference)) {
    throw Object.assign(new Error("The Paystack refund webhook did not include a valid provider refund ID."), {
      code: "INVALID_REFUND_WEBHOOK", status: 503,
    });
  }
  // Paystack's documented list endpoint filters by the original transaction ID.
  // The refund webhook's refund_reference identifies the refund resource ID.
  const search = new URLSearchParams({
    transaction: intent.provider_transaction_id,
    currency: intent.currency.toUpperCase(),
    perPage: "100",
    page: "1",
  });
  const response = await fetch("https://api.paystack.co/refund?" + search.toString(), {
    headers: {
      Authorization: "Bearer " + requirePaystackVerificationSecret(process.env),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as {
    status?: unknown; data?: unknown;
  } | null;
  if (!response.ok || payload?.status !== true || !Array.isArray(payload.data)) {
    throw Object.assign(new Error("Paystack could not verify this refund against the original transaction."), {
      code: "PAYSTACK_RECONCILIATION_UNAVAILABLE", status: 503,
    });
  }
  const refund = payload.data.find((item) => item && typeof item === "object" &&
    !Array.isArray(item) && String((item as Record<string, unknown>).id) === refundReference) as
    PaystackApiRecord | undefined;
  if (!refund || String(refund.transaction) !== intent.provider_transaction_id ||
      String(refund.currency).toUpperCase() !== intent.currency.toUpperCase()) {
    throw Object.assign(new Error("The Paystack refund does not match the stored payment transaction or currency."), {
      code: "REFUND_PROVIDER_MISMATCH", status: 409,
    });
  }
  const amountMinor = typeof refund.amount === "number" ? refund.amount
    : typeof refund.amount === "string" && /^\d+$/.test(refund.amount) ? Number(refund.amount) : NaN;
  const webhookAmount = typeof data.amount === "number" ? data.amount
    : typeof data.amount === "string" && /^\d+$/.test(data.amount) ? Number(data.amount) : NaN;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 ||
      amountMinor > Number(intent.amount_minor) ||
      (Number.isSafeInteger(webhookAmount) && webhookAmount !== amountMinor)) {
    throw Object.assign(new Error("The verified Paystack refund amount is invalid or mismatched."), {
      code: "REFUND_PROVIDER_MISMATCH", status: 409,
    });
  }
  const status = paystackRefundStatus(refund.status);
  const canonical = JSON.stringify({
    provider: "paystack", eventName, refundReference, transactionReference,
    transactionId: intent.provider_transaction_id, amountMinor,
    currency: intent.currency.toUpperCase(), status: refund.status,
  });
  const result = await reconcileVerifiedRefund({
    provider: "paystack",
    providerRefundId: refundReference,
    purchaseIntentId: intent.id,
    amountMinor,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: {
      providerStatus: refund.status,
      transactionId: intent.provider_transaction_id,
      transactionReference,
      processor: refund.processor ?? data.processor ?? null,
      refundedAt: refund.refunded_at ?? null,
    },
  });
  return { event: eventName, refundReference, ...result };
}

async function handlePaystackDisputeWebhook(eventName: string, data: PaystackApiRecord) {
  const disputeId = asPaystackId(data.id);
  if (!disputeId) {
    throw Object.assign(new Error("The Paystack dispute event does not include a valid dispute ID."), {
      code: "INVALID_DISPUTE_WEBHOOK", status: 400,
    });
  }
  const dispute = await fetchPaystackApiRecord("/dispute/" + encodeURIComponent(disputeId));
  const returnedId = asPaystackId(dispute.id);
  const transaction = dispute.transaction && typeof dispute.transaction === "object" &&
    !Array.isArray(dispute.transaction) ? dispute.transaction as PaystackApiRecord : null;
  const transactionId = transaction ? asPaystackId(transaction.id) : null;
  const transactionReference = transaction && typeof transaction.reference === "string"
    ? transaction.reference : "";
  if (returnedId !== disputeId || !transaction || !transactionId ||
      !/^[a-f0-9-]{36}$/i.test(transactionReference)) {
    throw Object.assign(new Error("The Paystack dispute could not be matched to its original transaction."), {
      code: "DISPUTE_PROVIDER_MISMATCH", status: 409,
    });
  }
  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider_transaction_id: string | null; amount_minor: number | string; currency: string;
  }>(
    `select id, provider_transaction_id, amount_minor, currency
       from billing_purchase_intents where id = $1 and provider = 'paystack' limit 1`,
    [transactionReference],
  );
  const intent = intents[0];
  if (!intent || intent.provider_transaction_id !== transactionId ||
      String(transaction.currency).toUpperCase() !== intent.currency.toUpperCase() ||
      Number(transaction.amount) !== Number(intent.amount_minor)) {
    throw Object.assign(new Error("The Paystack dispute does not match the recorded transaction amount or currency."), {
      code: "DISPUTE_PROVIDER_MISMATCH", status: 409,
    });
  }
  const refundAmount = typeof dispute.refund_amount === "number" && Number.isSafeInteger(dispute.refund_amount) &&
    dispute.refund_amount > 0 ? dispute.refund_amount : Number(transaction.amount);
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > Number(intent.amount_minor)) {
    throw Object.assign(new Error("The Paystack dispute refund amount is invalid."), {
      code: "DISPUTE_PROVIDER_MISMATCH", status: 409,
    });
  }
  const status = paystackDisputeStatus(dispute.status, dispute.resolution);
  const canonical = JSON.stringify({
    provider: "paystack", eventName, disputeId, transactionReference, transactionId,
    amountMinor: refundAmount, currency: intent.currency.toUpperCase(),
    status: dispute.status, resolution: dispute.resolution ?? null,
  });
  const result = await reconcileVerifiedDispute({
    provider: "paystack",
    providerDisputeId: disputeId,
    purchaseIntentId: intent.id,
    amountMinor: refundAmount,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: {
      providerStatus: dispute.status,
      providerResolution: dispute.resolution ?? null,
      transactionId,
      transactionReference,
      eventName,
      resolvedAt: dispute.resolvedAt ?? null,
    },
  });
  return { event: eventName, disputeId, ...result };
}

export async function handlePaystackWebhook(request: Request) {
  // Webhooks must remain verifiable during a checkout kill switch so settled
  // payments can be reconciled and no customer payment is silently stranded.
  const verificationSecret = requirePaystackVerificationSecret(process.env);
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const rawBytes = await readBoundedBytes(request, 256_000);
  if (!rawBytes) throw Object.assign(new Error("Webhook payload is too large or unreadable."), { code: "WEBHOOK_TOO_LARGE", status: 413 });
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes); }
  catch { throw Object.assign(new Error("The webhook payload is not valid UTF-8."), { code: "INVALID_WEBHOOK", status: 400 }); }
  const expected = createHmac("sha512", verificationSecret).update(rawBytes).digest("hex");
  if (!/^[a-f0-9]{128}$/i.test(signature) ||
      !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw Object.assign(new Error("The payment-provider signature is invalid."), { code: "INVALID_WEBHOOK_SIGNATURE", status: 401 });
  }
  let body: { event?: unknown; data?: unknown };
  try { body = JSON.parse(raw) as { event?: unknown; data?: unknown }; }
  catch { throw Object.assign(new Error("The webhook payload is invalid."), { code: "INVALID_WEBHOOK", status: 400 }); }
  const eventName = typeof body.event === "string" ? body.event : "";
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as PaystackApiRecord : {};
  if (eventName.startsWith("refund.")) return handlePaystackRefundWebhook(eventName, data);
  if (eventName.startsWith("charge.dispute.")) return handlePaystackDisputeWebhook(eventName, data);
  if (eventName !== "charge.success") return { ignored: true };
  if (typeof data.reference !== "string") {
    throw Object.assign(new Error("The payment event did not include a reference."), { code: "INVALID_WEBHOOK", status: 400 });
  }
  return verifyAndCreditPaystackReference(data.reference);
}
