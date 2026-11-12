import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import { readWallet, creditVerifiedPurchase } from "./ledger.server";
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

export async function verifyAndCreditFlutterwaveReference(reference: string, transactionId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(reference) || !/^\d{1,24}$/.test(transactionId)) {
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
  if (intent.status === "credited") {
    if (intent.provider_transaction_id !== transactionId) {
      throw Object.assign(new Error("This payment reference was credited by a different transaction."), {
        code: "PAYMENT_MISMATCH", status: 409,
      });
    }
    return { status: "credited" as const, creditedSubunits: 0 };
  }

  const response = await fetch(
    "https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(transactionId) + "/verify",
    {
      headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = await response.json() as {
    status?: string;
    data?: { id?: string | number; tx_ref?: string; status?: string; amount?: number | string; currency?: string };
  };
  const transaction = payload.data;
  const paidAmountMinor = transaction
    ? parseMajorUnitsToMinor(transaction.amount, intent.currency)
    : null;
  if (!response.ok || payload.status !== "success" || !transaction ||
      String(transaction.id) !== transactionId || transaction.tx_ref !== reference ||
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
  return creditVerifiedPurchase({
    purchaseIntentId: intent.id,
    provider: "flutterwave",
    providerEventId: "charge-completed-" + transactionId,
    providerTransactionId: transactionId,
    paidAmountMinor,
    paidCurrency: intent.currency,
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
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

export async function handleFlutterwaveWebhook(request: Request) {
  const expectedHash = process.env.FLW_SECRET_HASH?.trim() ?? "";
  const receivedHash = request.headers.get("verif-hash") ?? "";
  if (!expectedHash || !receivedHash || !safeEqual(receivedHash, expectedHash)) {
    throw Object.assign(new Error("The Flutterwave webhook signature is invalid."), {
      code: "INVALID_WEBHOOK_SIGNATURE", status: 401,
    });
  }
  const rawBytes = await readBoundedBytes(request, 256_000);
  if (!rawBytes) {
    throw Object.assign(new Error("Webhook payload is too large or unreadable."), {
      code: "WEBHOOK_TOO_LARGE", status: 413,
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

  const eventName = typeof body.event === "string" ? body.event.toLowerCase() : "";
  // V3 refund notifications can arrive as a top-level object with AmountRefunded
  // and FlwRef, rather than the normal { event, data } charge envelope.
  const isRefundPayload = body.AmountRefunded !== undefined ||
    body.refund_id !== undefined || body.refundId !== undefined;
  if (isRefundPayload || eventName.includes("refund") ||
      eventName.includes("chargeback") || eventName.includes("dispute")) {
    throw Object.assign(new Error("This Flutterwave refund or dispute event requires wallet reconciliation; no wallet balance was changed."), {
      code: "FLUTTERWAVE_REFUND_DISPUTE_RECONCILIATION_REQUIRED", status: 503,
    });
  }
  if (eventName !== "charge.completed") return { ignored: true };
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  if (!data || typeof data.tx_ref !== "string") {
    throw Object.assign(new Error("The Flutterwave charge event is missing its transaction reference."), {
      code: "INVALID_WEBHOOK", status: 400,
    });
  }
  if (data.status === "failed") {
    await updateFlutterwaveIntentStatus(data.tx_ref, "failed");
    return { status: "failed" as const };
  }
  if (data.status === "cancelled" || data.status === "canceled") {
    await updateFlutterwaveIntentStatus(data.tx_ref, "cancelled");
    return { status: "cancelled" as const };
  }
  if (data.status !== "successful" || data.id === undefined || data.id === null) {
    return { status: "pending" as const };
  }
  return verifyAndCreditFlutterwaveReference(data.tx_ref, String(data.id));
}
