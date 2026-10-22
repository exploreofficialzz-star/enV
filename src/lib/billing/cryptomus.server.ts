import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import { creditVerifiedPurchase, readWallet } from "./ledger.server";
import { TOKEN_PACKS, getFundingOptions } from "./paystack.server";

type CryptomusCredentials = { merchantId: string; apiKey: string };
type CryptomusInvoice = {
  uuid?: string;
  order_id?: string | null;
  amount?: string | number;
  currency?: string;
  url?: string;
  status?: string;
  payment_status?: string;
  is_final?: boolean;
};
type CryptomusPayload = { state?: number; message?: string; result?: CryptomusInvoice };

function positiveSafeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 160 &&
    /^[A-Za-z0-9:_-]+$/.test(value);
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

function readCredentials(): CryptomusCredentials {
  const merchantId = process.env.CRYPTOMUS_MERCHANT_ID ?? "";
  const apiKey = process.env.CRYPTOMUS_PAYMENT_API_KEY ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(merchantId) || !apiKey) {
    throw Object.assign(new Error("Secure crypto verification is not configured."), {
      code: "CRYPTOMUS_NOT_CONFIGURED", status: 503,
    });
  }
  return { merchantId, apiKey };
}

function requireNewCheckoutConfiguration() {
  const funding = getFundingOptions();
  const provider = funding.providers.find((entry) => entry.id === "cryptomus");
  const pricePerTokenMinor = positiveSafeInteger(process.env.CRYPTOMUS_TOKEN_PRICE_USD_CENTS);
  const origin = publicOrigin();
  if (!provider?.enabled || pricePerTokenMinor === null || !origin) {
    throw Object.assign(new Error(provider?.message ?? "Crypto checkout is not enabled for this deployment."), {
      code: "CRYPTOMUS_NOT_CONFIGURED", status: 503,
    });
  }
  return { ...readCredentials(), pricePerTokenMinor, origin };
}

function usdAmount(minor: number): string {
  return (Math.floor(minor / 100)).toString() + "." + String(minor % 100).padStart(2, "0");
}

function amountToCents(value: string | number | undefined): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

function requestSignature(body: string, apiKey: string): string {
  return createHash("md5")
    .update(Buffer.from(body, "utf8").toString("base64") + apiKey)
    .digest("hex");
}

async function cryptomusPost(path: "/v1/payment" | "/v1/payment/info", body: Record<string, unknown>, credentials: CryptomusCredentials) {
  const bodyText = JSON.stringify(body);
  const response = await fetch("https://api.cryptomus.com" + path, {
    method: "POST",
    headers: {
      merchant: credentials.merchantId,
      sign: requestSignature(bodyText, credentials.apiKey),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: bodyText,
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as CryptomusPayload | null;
  if (!response.ok || payload?.state !== 0 || !payload.result) {
    throw Object.assign(new Error("Cryptomus did not confirm the requested invoice operation."), {
      code: "CRYPTOMUS_PROVIDER_ERROR", status: 502,
    });
  }
  return payload.result;
}

export async function initializeCryptomusCheckout(input: {
  userId: string;
  tokenPack: number;
  idempotencyKey: unknown;
}) {
  const configuration = requireNewCheckoutConfiguration();
  if (!(TOKEN_PACKS as readonly number[]).includes(input.tokenPack) || !validIdempotencyKey(input.idempotencyKey)) {
    throw Object.assign(new Error("Choose a supported token pack and retry the checkout."), {
      code: "INVALID_PURCHASE", status: 400,
    });
  }

  const amountMinor = input.tokenPack * configuration.pricePerTokenMinor;
  const creditsSubunits = input.tokenPack * 1_000;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !Number.isSafeInteger(creditsSubunits)) {
    throw Object.assign(new Error("The configured token price is outside the supported range."), {
      code: "INVALID_PRICE_CONFIGURATION", status: 503,
    });
  }

  const sql = await getSql();
  await readWallet(input.userId);
  const existing = await sql.query<{
    id: string; product_id: string; amount_minor: number | string; currency: string; status: string; checkout_url: string | null;
  }>(
    "select id, product_id, amount_minor, currency, status, checkout_url " +
    "from billing_purchase_intents where user_id = $1 and provider = 'cryptomus' and idempotency_key = $2 limit 1",
    [input.userId, input.idempotencyKey],
  );
  if (existing[0]) {
    const prior = existing[0];
    if (prior.product_id !== "tokens-" + input.tokenPack || Number(prior.amount_minor) !== amountMinor ||
        prior.currency.toUpperCase() !== "USD") {
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

  const intentId = randomUUID();
  await sql.query(
    "insert into billing_purchase_intents " +
    "(id, user_id, provider, platform, product_id, amount_minor, currency, credits_subunits, status, idempotency_key, provider_metadata) " +
    "values ($1, $2, 'cryptomus', 'web', $3, $4, 'USD', $5, 'created', $6, $7::jsonb)",
    [intentId, input.userId, "tokens-" + input.tokenPack, amountMinor, creditsSubunits, input.idempotencyKey,
      JSON.stringify({ orderId: intentId, tokenPack: input.tokenPack })],
  );

  try {
    const invoice = await cryptomusPost("/v1/payment", {
      amount: usdAmount(amountMinor),
      currency: "USD",
      order_id: intentId,
      url_return: configuration.origin + "/wallet?payment=crypto-pending",
      url_success: configuration.origin + "/wallet?payment=crypto-pending",
      url_callback: configuration.origin + "/api/billing/cryptomus/webhook",
      is_payment_multiple: false,
      lifetime: 3600,
      additional_data: "enV token pack " + input.tokenPack,
    }, configuration);

    const invoiceUrl = typeof invoice.url === "string" ? invoice.url : "";
    let parsed: URL | null = null;
    try { if (invoiceUrl) parsed = new URL(invoiceUrl); } catch { parsed = null; }
    if (invoice.order_id !== intentId || amountToCents(invoice.amount) !== amountMinor ||
        invoice.currency?.toUpperCase() !== "USD" || !/^[a-f0-9-]{36}$/i.test(invoice.uuid ?? "") ||
        !parsed || parsed.protocol !== "https:" || parsed.hostname !== "pay.cryptomus.com") {
      throw new Error("The payment provider returned an invalid invoice.");
    }

    await sql.query(
      "update billing_purchase_intents set status = 'pending', checkout_url = $2, " +
      "provider_transaction_id = $3, provider_metadata = $4::jsonb, updated_at = now() " +
      "where id = $1 and status = 'created'",
      [intentId, invoiceUrl, invoice.uuid,
        JSON.stringify({ orderId: intentId, tokenPack: input.tokenPack, invoiceUuid: invoice.uuid })],
    );
    return { authorizationUrl: invoiceUrl, reference: intentId, tokens: input.tokenPack };
  } catch {
    await sql.query(
      "update billing_purchase_intents set status = 'failed', updated_at = now() where id = $1 and status = 'created'",
      [intentId],
    ).catch(() => undefined);
    throw Object.assign(new Error("Crypto checkout could not be initialized. No wallet tokens were added."), {
      code: "CRYPTOMUS_INITIALIZATION_FAILED", status: 502,
    });
  }
}

async function setIntentStatus(reference: string, status: "disputed" | "failed" | "cancelled") {
  const sql = await getSql();
  await sql.query(
    "update billing_purchase_intents set status = $2, updated_at = now() " +
    "where id = $1 and provider = 'cryptomus' and status in ('created', 'pending', 'verified')",
    [reference, status],
  );
}

export async function verifyAndCreditCryptomusReference(reference: string, expectedInvoiceUuid?: string) {
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    throw Object.assign(new Error("The crypto payment reference is invalid."), {
      code: "INVALID_PAYMENT_REFERENCE", status: 400,
    });
  }
  const credentials = readCredentials();
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
  if (!intent || intent.provider !== "cryptomus") {
    throw Object.assign(new Error("The crypto payment reference was not found."), {
      code: "PAYMENT_NOT_FOUND", status: 404,
    });
  }
  if (intent.status === "credited") {
    if (expectedInvoiceUuid && intent.provider_transaction_id !== expectedInvoiceUuid) {
      throw Object.assign(new Error("The crypto invoice does not match this purchase."), {
        code: "PAYMENT_MISMATCH", status: 409,
      });
    }
    return { status: "credited" as const, creditedSubunits: 0 };
  }

  const invoice = await cryptomusPost("/v1/payment/info", { order_id: reference }, credentials);
  const invoiceUuid = invoice.uuid ?? "";
  const amountMinor = amountToCents(invoice.amount);
  if (invoice.order_id !== reference || !/^[a-f0-9-]{36}$/i.test(invoiceUuid) ||
      (expectedInvoiceUuid && invoiceUuid !== expectedInvoiceUuid) ||
      amountMinor !== Number(intent.amount_minor) || invoice.currency?.toUpperCase() !== intent.currency.toUpperCase()) {
    throw Object.assign(new Error("The crypto invoice does not match the recorded purchase."), {
      code: "PAYMENT_MISMATCH", status: 409,
    });
  }

  const paymentStatus = typeof invoice.status === "string" ? invoice.status : invoice.payment_status;
  if (paymentStatus === "paid_over" || paymentStatus === "locked" || paymentStatus === "wrong_amount") {
    await setIntentStatus(reference, "disputed");
    return { status: "requires-review" as const, creditedSubunits: 0 };
  }
  if (paymentStatus === "cancel") {
    await setIntentStatus(reference, "cancelled");
    return { status: "cancelled" as const, creditedSubunits: 0 };
  }
  if (paymentStatus === "fail" || paymentStatus === "system_fail") {
    await setIntentStatus(reference, "failed");
    return { status: "failed" as const, creditedSubunits: 0 };
  }
  if (paymentStatus !== "paid" || invoice.is_final !== true ||
      (invoice.payment_status !== undefined && invoice.payment_status !== "paid")) {
    return { status: "pending" as const, creditedSubunits: 0 };
  }

  const canonical = JSON.stringify({
    provider: "cryptomus",
    reference,
    transactionId: invoiceUuid,
    amount: amountMinor,
    currency: "USD",
    status: "paid",
  });
  return creditVerifiedPurchase({
    purchaseIntentId: intent.id,
    provider: "cryptomus",
    providerEventId: "invoice-paid-" + invoiceUuid,
    providerTransactionId: invoiceUuid,
    paidAmountMinor: amountMinor,
    paidCurrency: "USD",
    payloadDigest: createHash("sha256").update(canonical).digest("hex"),
  });
}

function validCryptomusWebhookSignature(body: Record<string, unknown>, credentials: CryptomusCredentials): boolean {
  const supplied = typeof body.sign === "string" ? body.sign : "";
  if (!/^[a-f0-9]{32}$/i.test(supplied)) return false;
  const unsigned = { ...body };
  delete unsigned.sign;
  // Cryptomus serializes webhook slashes as escaped slashes before signing.
  const serialized = JSON.stringify(unsigned).replace(/\//g, "\\/");
  const expected = createHash("md5")
    .update(Buffer.from(serialized, "utf8").toString("base64") + credentials.apiKey)
    .digest("hex");
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export async function handleCryptomusWebhook(request: Request) {
  const raw = await request.text();
  if (raw.length > 256_000) {
    throw Object.assign(new Error("Webhook payload is too large."), {
      code: "WEBHOOK_TOO_LARGE", status: 413,
    });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    body = parsed as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("The crypto payment event is invalid."), {
      code: "INVALID_WEBHOOK", status: 400,
    });
  }
  const credentials = readCredentials();
  if (!validCryptomusWebhookSignature(body, credentials)) {
    throw Object.assign(new Error("The crypto payment signature is invalid."), {
      code: "INVALID_WEBHOOK_SIGNATURE", status: 401,
    });
  }
  if (body.type !== "payment") return { ignored: true };
  const reference = typeof body.order_id === "string" ? body.order_id : "";
  const invoiceUuid = typeof body.uuid === "string" ? body.uuid : "";
  if (!/^[a-f0-9-]{36}$/i.test(reference) || !/^[a-f0-9-]{36}$/i.test(invoiceUuid)) {
    throw Object.assign(new Error("The crypto payment event has an invalid invoice reference."), {
      code: "INVALID_WEBHOOK", status: 400,
    });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (status === "paid_over" || status === "locked" || status === "wrong_amount") {
    await setIntentStatus(reference, "disputed");
    return { status: "requires-review" as const };
  }
  if (status !== "paid") return { ignored: true };
  return verifyAndCreditCryptomusReference(reference, invoiceUuid);
}
