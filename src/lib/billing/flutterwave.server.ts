import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import {
  readWallet, creditVerifiedPurchase, reconcileVerifiedRefund, reconcileVerifiedDispute,
} from "./ledger.server";
import { isFlutterwavePaymentOptionsConfigured } from "./provider-config";
import { readBoundedBytes } from "./bounded-json.server";
import {
  getCountryPaymentProfile,
  getCurrencyMinorUnitExponent,
  parseMajorUnitsToMinor,
  toFlutterwaveMajorAmount,
} from "./country-routing";
import { quoteTokenPacks, type CurrencyPackQuote } from "./fx.server";

const TOKEN_PACKS = [100, 250, 500, 1_000] as const;

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

function resolveConfiguration(countryCode: string | null | undefined) {
  const profile = getCountryPaymentProfile(countryCode);
  if (!profile) return null;
  const currency = profile.currency;
  const currencyEnabled = enabledCurrencies().has(currency);
  const secret = process.env.FLW_SECRET_KEY?.trim() ?? "";
  const secretHash = process.env.FLW_SECRET_HASH?.trim() ?? "";
  const approved = process.env.FLUTTERWAVE_PROVIDER_APPROVED === "true";
  const paymentOptionsConfigured = isFlutterwavePaymentOptionsConfigured(process.env);
  const exponent = getCurrencyMinorUnitExponent(currency);
  const ready = launchChecksPassed() && approved && currencyEnabled &&
    Boolean(secret) && Boolean(secretHash) && exponent !== null && paymentOptionsConfigured;
  return { profile, currency, secret, secretHash, ready, currencyEnabled, paymentOptionsConfigured, approved };
}

/** Build Flutterwave packs from enV's USD reference price and the current local FX snapshot. */
export async function getFlutterwaveFundingOption(countryCode: string | null | undefined) {
  const configuration = resolveConfiguration(countryCode);
  if (!configuration) return null;
  const { profile, currency, ready, currencyEnabled, paymentOptionsConfigured, approved } = configuration;
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
      message: "A current USD exchange-rate quote is unavailable for " + currency + ". No local amount was estimated.",
    };
  }
  const packs = quotes.map((quote) => {
    const amountMajor = toFlutterwaveMajorAmount(quote.amountMinor, currency);
    return {
      ...quote,
      enabled: ready && amountMajor !== null,
      message: amountMajor === null
        ? "This pack is outside Flutterwave's supported transaction amount range."
        : undefined,
    };
  });
  const anyPackAvailable = packs.some((pack) => pack.enabled);
  const enabled = ready && anyPackAvailable;
  const reason = !approved
    ? "Flutterwave checkout is awaiting merchant approval."
    : !currencyEnabled
      ? "This currency has not been enabled for the enV Flutterwave merchant account."
      : !paymentOptionsConfigured
        ? "Disable “Enable Dashboard Payment Options” in Flutterwave account settings before enabling country-specific payment methods."
        : !launchChecksPassed()
          ? "Checkout is disabled until billing, refund and dispute recovery checks are approved."
          : !configuration.secret || !configuration.secretHash
            ? "Flutterwave credentials are not fully configured."
            : !anyPackAvailable
              ? "The token pack amounts exceed Flutterwave's supported transaction range."
              : "Flutterwave is unavailable for this currency.";
  return {
    id: "flutterwave" as const,
    label: "Flutterwave · " + currency,
    enabled,
    currency,
    pricePerTokenMinor: null,
    fxRate: quotes[0]?.fxRate ?? null,
    fxSource: quotes[0]?.fxSource ?? null,
    fxUpdatedAt: quotes[0]?.fxUpdatedAt ?? null,
    fxNextUpdateAt: quotes[0]?.fxNextUpdateAt ?? null,
    fxFetchedAt: quotes[0]?.fxFetchedAt ?? null,
    packs,
    paymentOptions: [...profile.paymentOptions],
    message: enabled
      ? "Choose a pack. Flutterwave shows only methods supported by your country and currency; payment is verified before tokens are credited."
      : reason,
  };
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 &&
    /^[A-Za-z0-9:_-]+$/.test(value);
}

export async function initializeFlutterwaveCheckout(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
  countryCode: string | null;
  pricingQuote: CurrencyPackQuote;
}) {
  if (!(TOKEN_PACKS as readonly number[]).includes(input.tokenPack) || !validIdempotencyKey(input.idempotencyKey)) {
    throw Object.assign(new Error("Choose a supported token pack and retry checkout."), {
      code: "INVALID_PURCHASE", status: 400,
    });
  }
  const configuration = resolveConfiguration(input.countryCode);
  if (!configuration?.ready) {
    throw Object.assign(new Error("Flutterwave is not enabled for the detected country and currency."), {
      code: "FLUTTERWAVE_NOT_CONFIGURED", status: 503,
    });
  }

  const { currency, secret, profile } = configuration;
  const amountMinor = input.pricingQuote.amountMinor;
  const amountMajor = toFlutterwaveMajorAmount(amountMinor, currency);
  const creditsSubunits = input.tokenPack * 1_000;
  if (input.pricingQuote.tokens !== input.tokenPack || input.pricingQuote.currency !== currency ||
      input.pricingQuote.usdAmountCents !== input.tokenPack || !Number.isFinite(input.pricingQuote.fxRate) ||
      !input.pricingQuote.fxUpdatedAt || !input.pricingQuote.quotedAt) {
    throw Object.assign(new Error("The server-side token pack FX quote is invalid for this Flutterwave checkout."), {
      code: "INVALID_PRICE_CONFIGURATION", status: 503,
    });
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMajor === null ||
      !Number.isSafeInteger(creditsSubunits)) {
    throw Object.assign(new Error("The configured token price is outside the supported range."), {
      code: "INVALID_PRICE_CONFIGURATION", status: 503,
    });
  }

  const sql = await getSql();
  await readWallet(input.userId);
  const existing = await sql.query<{
    id: string; product_id: string; amount_minor: number | string; currency: string;
    status: string; checkout_url: string | null;
  }>(
    "select id, product_id, amount_minor, currency, status, checkout_url " +
    "from billing_purchase_intents where user_id = $1 and provider = 'flutterwave' and idempotency_key = $2 limit 1",
    [input.userId, input.idempotencyKey],
  );
  if (existing[0]) {
    const prior = existing[0];
    if (prior.product_id !== "tokens-" + input.tokenPack ||
        Number(prior.amount_minor) !== amountMinor || prior.currency.toUpperCase() !== currency) {
      throw Object.assign(new Error("This checkout key was already used for a different purchase."), {
        code: "IDEMPOTENCY_CONFLICT", status: 409,
      });
    }
    if (prior.status === "pending" && prior.checkout_url) {
      return { authorizationUrl: prior.checkout_url, reference: prior.id, tokens: input.tokenPack };
    }
    throw Object.assign(new Error("This checkout attempt has already been used. Start a new attempt."), {
      code: "CHECKOUT_ALREADY_USED", status: 409,
    });
  }

  const users = await sql.query<{ email: string }>('select email from "user" where id = $1 limit 1', [input.userId]);
  const email = users[0]?.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Add a valid email address to your enV account before funding the wallet."), {
      code: "ACCOUNT_EMAIL_REQUIRED", status: 400,
    });
  }

  const origin = publicOrigin();
  if (!origin) {
    throw Object.assign(new Error("The secure public callback origin is not configured."), {
      code: "FLUTTERWAVE_NOT_CONFIGURED", status: 503,
    });
  }

  const intentId = randomUUID();
  await sql.query(
    "insert into billing_purchase_intents " +
    "(id, user_id, provider, platform, product_id, amount_minor, currency, credits_subunits, status, idempotency_key, provider_metadata) " +
    "values ($1, $2, 'flutterwave', 'web', $3, $4, $5, $6, 'created', $7, $8::jsonb)",
    [intentId, input.userId, "tokens-" + input.tokenPack, amountMinor, currency, creditsSubunits,
      input.idempotencyKey, JSON.stringify({
        txRef: intentId,
        tokenPack: input.tokenPack,
        countryCode: profile.countryCode,
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

  try {
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        tx_ref: intentId,
        amount: amountMajor,
        currency,
        redirect_url: origin + "/api/billing/flutterwave/verify",
        payment_options: profile.paymentOptions.join(", "),
        customer: { email },
        customizations: {
          title: "enV wallet",
          description: "Add " + input.tokenPack + " enV tokens",
        },
        meta: {
          purchaseIntentId: intentId,
          tokenPack: input.tokenPack,
          countryCode: profile.countryCode,
          baseCurrency: "USD",
          usdAmountCents: input.pricingQuote.usdAmountCents,
          fxRate: input.pricingQuote.fxRate,
          fxSource: input.pricingQuote.fxSource,
          fxUpdatedAt: input.pricingQuote.fxUpdatedAt,
          quotedAt: input.pricingQuote.quotedAt,
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as {
      status?: string; data?: { link?: string };
    };
    let checkout: URL | null = null;
    try { if (payload.data?.link) checkout = new URL(payload.data.link); } catch { checkout = null; }
    if (!response.ok || payload.status !== "success" || !checkout ||
        checkout.protocol !== "https:" || checkout.hostname !== "checkout.flutterwave.com") {
      throw new Error("Flutterwave did not return a valid hosted checkout URL.");
    }
    await sql.query(
      "update billing_purchase_intents set status = 'pending', checkout_url = $2, " +
      "provider_metadata = $3::jsonb, updated_at = now() where id = $1 and status = 'created'",
      [intentId, checkout.href, JSON.stringify({
        txRef: intentId,
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
      })],
    );
    return { authorizationUrl: checkout.href, reference: intentId, tokens: input.tokenPack };
  } catch {
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
      [intentId],
    ).catch(() => undefined);
    throw Object.assign(new Error("Flutterwave checkout could not be initialized. No wallet tokens were added."), {
      code: "FLUTTERWAVE_INITIALIZATION_FAILED", status: 502,
    });
  }
}

export async function verifyAndCreditFlutterwaveReference(reference: string, expectedTransactionId?: string) {
  if (!/^[a-f0-9-]{36}$/i.test(reference) ||
      (expectedTransactionId !== undefined && !/^[A-Za-z0-9_-]{1,160}$/.test(expectedTransactionId))) {
    throw Object.assign(new Error("The Flutterwave payment reference is invalid."), {
      code: "INVALID_PAYMENT_REFERENCE", status: 400,
    });
  }
  const secret = process.env.FLW_SECRET_KEY?.trim();
  if (!secret) throw Object.assign(new Error("Flutterwave verification is not configured."), {
    code: "FLUTTERWAVE_NOT_CONFIGURED", status: 503,
  });

  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider: string; amount_minor: number | string; currency: string;
    status: string; provider_transaction_id: string | null;
  }>(
    "select id, provider, amount_minor, currency, status, provider_transaction_id " +
    "from billing_purchase_intents where id = $1 limit 1",
    [reference],
  );
  const intent = intents[0];
  if (!intent || intent.provider !== "flutterwave") {
    throw Object.assign(new Error("The Flutterwave payment reference was not found."), {
      code: "PAYMENT_NOT_FOUND", status: 404,
    });
  }
  const query = new URLSearchParams({ tx_ref: reference });
  const response = await fetch(
    "https://api.flutterwave.com/v3/transactions/verify_by_reference?" + query.toString(),
    {
      headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = await response.json() as {
    status?: string;
    data?: { id?: string | number; tx_ref?: string; status?: string; amount?: number | string; currency?: string; flw_ref?: string };
  };
  const transaction = payload.data;
  const transactionId = transaction?.id === undefined || transaction?.id === null
    ? "" : String(transaction.id);
  const paidAmountMinor = transaction
    ? parseMajorUnitsToMinor(transaction.amount, intent.currency)
    : null;
  if (!response.ok || payload.status !== "success" || !transaction ||
      !/^\d{1,24}$/.test(transactionId) ||
      (expectedTransactionId && /^\d{1,24}$/.test(expectedTransactionId) && transactionId !== expectedTransactionId) ||
      transaction.tx_ref !== reference ||
      transaction.status !== "successful" || !paidAmountMinor ||
      paidAmountMinor !== Number(intent.amount_minor) ||
      transaction.currency?.toUpperCase() !== intent.currency.toUpperCase()) {
    throw Object.assign(new Error("Payment is not confirmed yet. Your wallet was not credited."), {
      code: "PAYMENT_NOT_CONFIRMED", status: 409,
    });
  }

  const canonical = JSON.stringify({
    provider: "flutterwave", reference, transactionId,
    amountMinor: paidAmountMinor, currency: intent.currency.toUpperCase(), status: "successful",
  });
  const credited = await creditVerifiedPurchase({
    purchaseIntentId: intent.id,
    provider: "flutterwave",
    providerEventId: "charge-completed-" + transactionId,
    providerTransactionId: transactionId,
    paidAmountMinor,
    paidCurrency: intent.currency,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: typeof transaction.flw_ref === "string" && transaction.flw_ref.length <= 160
      ? { flwRef: transaction.flw_ref }
      : {},
  });
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function updateFlutterwaveIntentStatus(
  reference: string,
  status: "failed" | "cancelled",
) {
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    throw Object.assign(new Error("The Flutterwave payment reference is invalid."), {
      code: "INVALID_PAYMENT_REFERENCE", status: 400,
    });
  }
  const sql = await getSql();
  await sql.query(
    "update billing_purchase_intents set status = $2, updated_at = now() " +
    "where id = $1 and provider = 'flutterwave' and status in ('created', 'pending', 'verified')",
    [reference, status],
  );
}

type FlutterwaveApiRecord = Record<string, unknown>;

async function getFlutterwaveApiRecords(
  resource: "refunds" | "chargebacks",
  parameters: Record<string, string>,
): Promise<FlutterwaveApiRecord[]> {
  const secret = process.env.FLW_SECRET_KEY?.trim() ?? "";
  if (!secret) throw Object.assign(new Error("Flutterwave verification is not configured."), {
    code: "FLUTTERWAVE_NOT_CONFIGURED", status: 503,
  });
  if (resource === "refunds" && !parameters.id) {
    throw Object.assign(new Error("A Flutterwave refund ID is required for verification."), {
      code: "INVALID_REFUND_WEBHOOK", status: 400,
    });
  }
  // Flutterwave v3 exposes refunds and chargebacks through collection endpoints,
  // not /refunds/:id. Filter by the provider-issued record ID and transaction ref.
  const url = new URL("https://api.flutterwave.com/v3/" + resource);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as {
    status?: unknown; data?: unknown;
  } | null;
  if (!response.ok || payload?.status !== "success") {
    throw Object.assign(new Error("Flutterwave could not verify the refund or chargeback record."), {
      code: "FLUTTERWAVE_RECONCILIATION_UNAVAILABLE", status: 503,
    });
  }
  if (Array.isArray(payload.data)) {
    return payload.data.filter((item): item is FlutterwaveApiRecord =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  if (payload.data && typeof payload.data === "object") return [payload.data as FlutterwaveApiRecord];
  return [];
}

function flutterwaveRefundStatus(value: unknown): "pending" | "processing" | "needs_attention" | "failed" | "completed" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "failed" || status.startsWith("failed-")) return "failed";
  if (status === "successful" || status === "succeeded" || status === "completed" ||
      status.startsWith("completed-")) return "completed";
  if (status === "processing" || status === "new") return "processing";
  if (status.startsWith("pending")) return "pending";
  if (status.includes("attention")) return "needs_attention";
  return "needs_attention";
}

function flutterwaveDisputeStatus(value: unknown): "open" | "accepted" | "declined" | "review_required" | "won" | "lost" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "initiated" || status === "pending" || status === "open") return "open";
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (status === "won" || status === "reversed") return "won";
  if (status === "lost") return "lost";
  return "review_required";
}

function asProviderId(value: unknown): string | null {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

async function handleFlutterwaveRefundWebhook(body: Record<string, unknown>) {
  const nested = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};
  const refundId = asProviderId(body.id ?? body.refund_id ?? body.refundId ?? nested.id);
  const transactionId = asProviderId(
    body.TransactionId ?? body.transaction_id ?? nested.TransactionId ?? nested.transaction_id,
  );
  const webhookRefundRef = typeof (body.FlwRef ?? nested.FlwRef ?? body.flw_ref ?? nested.flw_ref) === "string"
    ? String(body.FlwRef ?? nested.FlwRef ?? body.flw_ref ?? nested.flw_ref) : null;
  if (!refundId || !transactionId) {
    throw Object.assign(new Error("The Flutterwave refund event is missing its refund or original transaction ID."), {
      code: "INVALID_REFUND_WEBHOOK", status: 400,
    });
  }
  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider_transaction_id: string; amount_minor: number | string; currency: string;
    credits_subunits: number | string; status: string;
  }>(
    `select id, provider_transaction_id, amount_minor, currency, credits_subunits, status
       from billing_purchase_intents
      where provider = 'flutterwave' and provider_transaction_id = $1 limit 1`,
    [transactionId],
  );
  const intent = intents[0];
  if (!intent || intent.provider_transaction_id !== transactionId) {
    throw Object.assign(new Error("The Flutterwave refund does not match a recorded enV purchase."), {
      code: "PURCHASE_MISMATCH", status: 409,
    });
  }
  const providerStatus = typeof (body.status ?? nested.status) === "string"
    ? String(body.status ?? nested.status).toLowerCase() : "";
  const refundStatusFilter = providerStatus.includes("fail") ? "failed"
    : providerStatus.includes("success") ? "successful" : "completed";
  // In Flutterwave v3 the refunds list "id" filter is the original charge ID,
  // while each returned row's own id identifies the refund record.
  const records = await getFlutterwaveApiRecords("refunds", {
    id: transactionId,
    currency: intent.currency.toUpperCase(),
    status: refundStatusFilter,
  });
  const refund = records.find((record) =>
    String(record.id) === refundId || (webhookRefundRef !== null && record.flw_ref === webhookRefundRef));
  if (!refund || String(refund.transaction_id) !== transactionId ||
      (webhookRefundRef && typeof refund.flw_ref === "string" && refund.flw_ref !== webhookRefundRef)) {
    throw Object.assign(new Error("The Flutterwave refund record does not match the original enV payment."), {
      code: "REFUND_PROVIDER_MISMATCH", status: 409,
    });
  }
  const amountMinor = parseMajorUnitsToMinor(refund.amount_refunded as string | number | undefined, intent.currency);
  if (!amountMinor || amountMinor > Number(intent.amount_minor) ||
      (refund.currency !== undefined && String(refund.currency).toUpperCase() !== intent.currency.toUpperCase())) {
    throw Object.assign(new Error("The verified Flutterwave refund amount or currency is invalid."), {
      code: "REFUND_PROVIDER_MISMATCH", status: 409,
    });
  }
  const status = flutterwaveRefundStatus(refund.status);
  const canonical = JSON.stringify({
    provider: "flutterwave", refundId, transactionId, amountMinor,
    currency: intent.currency.toUpperCase(), status: refund.status, flwRef: refund.flw_ref ?? null,
  });
  const result = await reconcileVerifiedRefund({
    provider: "flutterwave",
    providerRefundId: refundId,
    purchaseIntentId: intent.id,
    amountMinor,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: {
      providerStatus: refund.status,
      flutterwaveRefundReference: refund.flw_ref ?? null,
      originalTransactionId: transactionId,
      webhookReference: webhookRefundRef,
    },
  });
  return { event: "refund", refundId, ...result };
}

async function handleFlutterwaveChargebackWebhook(body: Record<string, unknown>) {
  const nested = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};
  const disputeId = asProviderId(nested.id ?? body.id);
  const webhookFlwRef = typeof nested.flw_ref === "string" ? nested.flw_ref
    : typeof body.flw_ref === "string" ? body.flw_ref : null;
  if (!disputeId || !webhookFlwRef) {
    throw Object.assign(new Error("The Flutterwave chargeback event is missing its dispute ID or payment reference."), {
      code: "INVALID_CHARGEBACK_WEBHOOK", status: 400,
    });
  }
  const providerStatus = typeof nested.status === "string" ? nested.status.toLowerCase() : "";
  const statusFilter = ["lost", "won", "initiated", "accepted", "declined"].includes(providerStatus)
    ? providerStatus : null;
  const records = await getFlutterwaveApiRecords("chargebacks", {
    id: disputeId,
    flw_ref: webhookFlwRef,
    ...(statusFilter ? { status: statusFilter } : {}),
  });
  const dispute = records.find((record) => String(record.id) === disputeId && record.flw_ref === webhookFlwRef);
  if (!dispute) {
    throw Object.assign(new Error("Flutterwave could not verify the chargeback record."), {
      code: "CHARGEBACK_PROVIDER_MISMATCH", status: 409,
    });
  }
  // V3 chargeback records carry flw_ref, not the merchant tx_ref or transaction
  // ID. Match that verified processor reference to the value captured when the
  // original paid transaction was verified.
  const sql = await getSql();
  const intents = await sql.query<{
    id: string; provider_transaction_id: string | null; amount_minor: number | string; currency: string;
  }>(
    `select id, provider_transaction_id, amount_minor, currency
       from billing_purchase_intents
      where provider = 'flutterwave' and provider_metadata->>'flwRef' = $1 limit 1`,
    [webhookFlwRef],
  );
  const intent = intents[0];
  if (!intent || !intent.provider_transaction_id) {
    throw Object.assign(new Error("The Flutterwave chargeback does not match a verified enV payment reference."), {
      code: "CHARGEBACK_PROVIDER_MISMATCH", status: 409,
    });
  }
  const amountMinor = parseMajorUnitsToMinor(dispute.amount as string | number | undefined, intent.currency);
  if (!amountMinor || amountMinor > Number(intent.amount_minor)) {
    throw Object.assign(new Error("The verified Flutterwave chargeback amount is invalid."), {
      code: "CHARGEBACK_PROVIDER_MISMATCH", status: 409,
    });
  }
  const status = flutterwaveDisputeStatus(dispute.status);
  const canonical = JSON.stringify({
    provider: "flutterwave", disputeId, transactionId: intent.provider_transaction_id,
    purchaseIntentId: intent.id, amountMinor, currency: intent.currency.toUpperCase(),
    status: dispute.status, flwRef: webhookFlwRef, stage: dispute.stage ?? null,
  });
  const result = await reconcileVerifiedDispute({
    provider: "flutterwave",
    providerDisputeId: disputeId,
    purchaseIntentId: intent.id,
    amountMinor,
    currency: intent.currency,
    status,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
    providerMetadata: {
      providerStatus: dispute.status,
      stage: dispute.stage ?? null,
      flutterwaveTransactionReference: webhookFlwRef,
      originalTransactionId: intent.provider_transaction_id,
    },
  });
  return { event: "chargeback", disputeId, ...result };
}

export async function handleFlutterwaveWebhook(request: Request) {
  const expectedHash = process.env.FLW_SECRET_HASH?.trim() ?? "";
  if (!expectedHash) {
    throw Object.assign(new Error("The Flutterwave webhook secret hash is not configured."), {
      code: "FLUTTERWAVE_NOT_CONFIGURED", status: 503,
    });
  }
  const rawBytes = await readBoundedBytes(request, 256_000);
  if (!rawBytes) {
    throw Object.assign(new Error("Webhook payload is too large or unreadable."), {
      code: "WEBHOOK_TOO_LARGE", status: 413,
    });
  }
  const suppliedHash = request.headers.get("verif-hash") ?? "";
  const suppliedSignature = request.headers.get("flutterwave-signature") ?? "";
  const legacyValid = suppliedHash ? safeEqual(suppliedHash, expectedHash) : false;
  const modernExpected = createHmac("sha256", expectedHash).update(rawBytes).digest("base64");
  const modernValid = suppliedSignature ? safeEqual(suppliedSignature, modernExpected) : false;
  if (!legacyValid && !modernValid) {
    throw Object.assign(new Error("The Flutterwave webhook signature is invalid."), {
      code: "INVALID_WEBHOOK_SIGNATURE", status: 401,
    });
  }
  let body: Record<string, unknown>;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    body = parsed as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("The Flutterwave webhook payload is invalid."), {
      code: "INVALID_WEBHOOK", status: 400,
    });
  }

  const eventName = typeof body.type === "string" ? body.type.toLowerCase()
    : typeof body.event === "string" ? body.event.toLowerCase() : "";
  const nested = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};
  const isRefundPayload = body.AmountRefunded !== undefined ||
    body.refund_id !== undefined || body.refundId !== undefined ||
    eventName.includes("refund");
  if (isRefundPayload) return handleFlutterwaveRefundWebhook(body);
  if (eventName.includes("chargeback") || eventName.includes("dispute")) {
    return handleFlutterwaveChargebackWebhook(body);
  }
  if (eventName !== "charge.completed") return { ignored: true };
  const transactionReference = typeof nested.tx_ref === "string" ? nested.tx_ref
    : typeof nested.reference === "string" ? nested.reference : "";
  if (!transactionReference) {
    throw Object.assign(new Error("The Flutterwave charge event is missing its transaction reference."), {
      code: "INVALID_WEBHOOK", status: 400,
    });
  }
  if (nested.status === "failed") {
    await updateFlutterwaveIntentStatus(transactionReference, "failed");
    return { status: "failed" as const };
  }
  if (nested.status === "cancelled" || nested.status === "canceled") {
    await updateFlutterwaveIntentStatus(transactionReference, "cancelled");
    return { status: "cancelled" as const };
  }
  if (nested.status !== "successful" && nested.status !== "succeeded") {
    return { status: "pending" as const };
  }
  return verifyAndCreditFlutterwaveReference(
    transactionReference,
    nested.id === undefined || nested.id === null ? undefined : String(nested.id),
  );
}
