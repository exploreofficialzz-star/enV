import { defineHandler } from "nitro/h3";
import { randomUUID } from "node:crypto";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../src/lib/billing/http.server";
import { initializePaystackCheckout } from "../../../../src/lib/billing/paystack.server";
import { initializeCryptomusCheckout } from "../../../../src/lib/billing/cryptomus.server";

const SAFE_CHECKOUT_FAILURES: Record<string, { status: number; message: string }> = {
  PAYMENTS_NOT_CONFIGURED: { status: 503, message: "Token purchases are not enabled for this deployment yet." },
  INVALID_PURCHASE: { status: 400, message: "Choose a valid token pack and try again." },
  INVALID_PRICE_CONFIGURATION: { status: 503, message: "Token pricing is temporarily unavailable. No payment was taken." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "This checkout key was already used for another purchase. Start a new checkout." },
  CHECKOUT_ALREADY_USED: { status: 409, message: "This checkout attempt has already been used. Start a new checkout." },
  ACCOUNT_EMAIL_REQUIRED: { status: 400, message: "Add a valid email address to your enV account before funding the wallet." },
  PAYSTACK_INITIALIZATION_FAILED: { status: 502, message: "Checkout could not be initialized. No wallet tokens were added and no confirmed payment was recorded." },
  CRYPTOMUS_NOT_CONFIGURED: { status: 503, message: "Crypto checkout is not available yet. No payment was taken." },
  CRYPTOMUS_INITIALIZATION_FAILED: { status: 502, message: "Crypto checkout could not be initialized. No wallet tokens were added." },
  CRYPTOMUS_PROVIDER_ERROR: { status: 502, message: "The crypto provider could not initialize checkout. Please retry shortly." },
};

/** Checkout is opened server-side and remains closed until launch, enforcement, auth, and pricing are configured. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  const provider = body?.provider === undefined ? "paystack" : body.provider;
  if (!body || typeof body.tokenPack !== "number" || !Number.isInteger(body.tokenPack) ||
      typeof body.idempotencyKey !== "string" || (provider !== "paystack" && provider !== "cryptomus")) {
    return jsonResponse({ ok: false, error: "INVALID_PURCHASE", message: "Choose a supported payment method and token pack, then retry checkout." }, 400);
  }
  try {
    const input = { userId: auth.userId, tokenPack: body.tokenPack, idempotencyKey: body.idempotencyKey };
    const checkout = provider === "cryptomus"
      ? await initializeCryptomusCheckout(input)
      : await initializePaystackCheckout(input);
    return jsonResponse({ ok: true, data: { ...checkout, provider } }, 201);
  } catch (error) {
    const candidate = error as { code?: unknown };
    const candidateCode = typeof candidate.code === "string" ? candidate.code : "";
    const knownFailure = SAFE_CHECKOUT_FAILURES[candidateCode];
    const requestId = randomUUID();
    if (!knownFailure) {
      console.error(`[billing-purchase] PAYMENTS_UNAVAILABLE requestId=${requestId} causeType=${error instanceof Error ? error.name : "UnknownError"}`);
    }
    return jsonResponse({
      ok: false,
      error: knownFailure ? candidateCode : "PAYMENTS_UNAVAILABLE",
      message: knownFailure?.message ?? "Checkout is temporarily unavailable. No payment was recorded. Please try again shortly.",
      requestId,
    }, knownFailure?.status ?? 503);
  }
});
