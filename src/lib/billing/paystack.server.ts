import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import { readWallet, creditVerifiedPurchase } from "./ledger.server";
import { requirePaystackVerificationSecret } from "./provider-config";

export const TOKEN_PACKS = [100, 250, 500, 1_000] as const;

function positiveSafeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function publicOrigin(): string | null {
  const raw = process.env.BETTER_AUTH_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return parsed.origin;
  } catch { return null; }
}

export function getFundingOptions() {
  const launchChecksPassed = process.env.BILLING_LAUNCH_ENABLED === "true" &&
    process.env.BILLING_ENFORCEMENT_ENABLED === "true" && Boolean(publicOrigin());
  const pricePerTokenMinor = positiveSafeInteger(process.env.PAYSTACK_TOKEN_PRICE_NGN_KOBO);
  const paystackApproved = process.env.PAYSTACK_PROVIDER_APPROVED === "true";
  const enabled = launchChecksPassed && paystackApproved &&
    Boolean(process.env.PAYSTACK_SECRET_KEY) && pricePerTokenMinor !== null;

  const cryptoPricePerTokenMinor = positiveSafeInteger(process.env.CRYPTOMUS_TOKEN_PRICE_USD_CENTS);
  const cryptomusEnabled = launchChecksPassed &&
    process.env.CRYPTOMUS_PROVIDER_APPROVED === "true" &&
    Boolean(process.env.CRYPTOMUS_MERCHANT_ID) &&
    Boolean(process.env.CRYPTOMUS_PAYMENT_API_KEY) &&
    cryptoPricePerTokenMinor !== null;

  const packsFor = (price: number | null, currency: string) => TOKEN_PACKS.map((tokens) => ({
    tokens,
    amountMinor: price !== null ? tokens * price : null,
    currency,
  }));
  const paystackMessage = enabled
    ? "Choose a token pack. Payment is verified by enV before tokens are added."
    : !paystackApproved
      ? "Card and local payments are unavailable until Paystack has explicitly approved enV's token-wallet business model."
      : "Secure card checkout is not configured for this deployment. No payment was taken.";
  const cryptomusMessage = cryptomusEnabled
    ? "Choose a token pack. enV verifies the final crypto invoice with Cryptomus before crediting your wallet."
    : process.env.CRYPTOMUS_PROVIDER_APPROVED !== "true"
      ? "Crypto payments are unavailable until Cryptomus onboarding and the required compliance review are approved."
      : "Secure crypto checkout is not configured for this deployment. No payment was taken.";

  return {
    enabled,
    provider: "paystack",
    currency: "NGN",
    pricePerTokenMinor: pricePerTokenMinor ?? null,
    packs: packsFor(pricePerTokenMinor, "NGN"),
    providers: [
      {
        id: "paystack",
        label: "Pay with cards",
        enabled,
        currency: "NGN",
        pricePerTokenMinor: pricePerTokenMinor ?? null,
        packs: packsFor(pricePerTokenMinor, "NGN"),
        message: paystackMessage,
      },
      {
        id: "cryptomus",
        label: "Pay with crypto",
        enabled: cryptomusEnabled,
        currency: "USD",
        pricePerTokenMinor: cryptoPricePerTokenMinor ?? null,
        packs: packsFor(cryptoPricePerTokenMinor, "USD"),
        message: cryptomusMessage,
      },
    ],
    anyEnabled: enabled || cryptomusEnabled,
    message: paystackMessage,
  };
}

function requireLiveFunding() {
  const options = getFundingOptions();
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!options.enabled || !secret || !options.pricePerTokenMinor) {
    throw Object.assign(new Error(options.message), { code: "PAYMENTS_NOT_CONFIGURED", status: 503 });
  }
  return { secret, pricePerTokenMinor: options.pricePerTokenMinor, origin: publicOrigin()! };
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 &&
    /^[A-Za-z0-9:_-]+$/.test(value);
}

export async function initializePaystackCheckout(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
}) {
  const configuration = requireLiveFunding();
  if (!(TOKEN_PACKS as readonly number[]).includes(input.tokenPack) || !validIdempotencyKey(input.idempotencyKey)) {
    throw Object.assign(new Error("Choose a supported token pack and retry the checkout."), { code: "INVALID_PURCHASE", status: 400 });
  }
  const amountMinor = input.tokenPack * configuration.pricePerTokenMinor;
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
    if (prior.product_id !== `tokens-${input.tokenPack}` || Number(prior.amount_minor) !== amountMinor || prior.currency !== "NGN") {
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
     values ($1, $2, 'paystack', 'web', $3, $4, 'NGN', $5, 'created', $6, $7::jsonb)`,
    [intentId, input.userId, `tokens-${input.tokenPack}`, amountMinor, creditsSubunits, input.idempotencyKey,
      JSON.stringify({ reference: intentId, tokenPack: input.tokenPack })],
  );

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email, amount: String(amountMinor), currency: "NGN", reference: intentId,
        callback_url: `${configuration.origin}/api/billing/paystack/verify`,
        metadata: { purchaseIntentId: intentId, tokenPack: input.tokenPack },
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
        reference: intentId, tokenPack: input.tokenPack, accessCode: payload.data?.access_code ?? null,
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

export async function handlePaystackWebhook(request: Request) {
  // Webhooks must remain verifiable during a checkout kill switch so settled
  // payments can be reconciled and no customer payment is silently stranded.
  const verificationSecret = requirePaystackVerificationSecret(process.env);
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const raw = await request.text();
  if (raw.length > 256_000) throw Object.assign(new Error("Webhook payload is too large."), { code: "WEBHOOK_TOO_LARGE", status: 413 });
  const webhookSecret = verificationSecret;
  const expected = createHmac("sha512", webhookSecret).update(raw).digest("hex");
  if (!/^[a-f0-9]{128}$/i.test(signature) ||
      !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw Object.assign(new Error("The payment-provider signature is invalid."), { code: "INVALID_WEBHOOK_SIGNATURE", status: 401 });
  }
  let body: { event?: unknown; data?: { reference?: unknown } };
  try { body = JSON.parse(raw) as { event?: unknown; data?: { reference?: unknown } }; }
  catch { throw Object.assign(new Error("The webhook payload is invalid."), { code: "INVALID_WEBHOOK", status: 400 }); }
  if (body.event !== "charge.success") return { ignored: true };
  if (typeof body.data?.reference !== "string") {
    throw Object.assign(new Error("The payment event did not include a reference."), { code: "INVALID_WEBHOOK", status: 400 });
  }
  return verifyAndCreditPaystackReference(body.data.reference);
}
