import { defineHandler } from "nitro/h3";
import { randomUUID } from "node:crypto";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../src/lib/billing/http.server";
import { initializePaystackCheckout } from "../../../../src/lib/billing/paystack.server";
import { initializeCryptomusCheckout } from "../../../../src/lib/billing/cryptomus.server";
import { initializeFlutterwaveCheckout } from "../../../../src/lib/billing/flutterwave.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
import { quoteTokenPacks, type CurrencyPackQuote } from "../../../../src/lib/billing/fx.server";
import { selectFundingProvider, type CustomerPaymentMethod } from "../../../../src/lib/billing/payment-methods";

const SAFE_CHECKOUT_FAILURES: Record<string, { status: number; message: string }> = {
  PAYMENTS_NOT_CONFIGURED: { status: 503, message: "Token purchases are not enabled for this deployment yet." },
  INVALID_PURCHASE: { status: 400, message: "Enter an amount of at least US$1 and choose a payment method." },
  INVALID_PRICE_CONFIGURATION: { status: 503, message: "Token pricing is temporarily unavailable. No payment was taken." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "This checkout key was already used for another purchase. Start a new checkout." },
  CHECKOUT_ALREADY_USED: { status: 409, message: "This checkout attempt has already been used. Start a new checkout." },
  ACCOUNT_EMAIL_REQUIRED: { status: 400, message: "Add a valid email address to your enV account before funding the wallet." },
  PAYSTACK_INITIALIZATION_FAILED: { status: 502, message: "Checkout could not be initialized. No wallet tokens were added and no confirmed payment was recorded." },
  CRYPTOMUS_NOT_CONFIGURED: { status: 503, message: "Crypto checkout is not available yet. No payment was taken." },
  CRYPTOMUS_INITIALIZATION_FAILED: { status: 502, message: "Crypto checkout could not be initialized. No wallet tokens were added." },
  CRYPTOMUS_PROVIDER_ERROR: { status: 502, message: "The crypto provider could not initialize checkout. Please retry shortly." },
  FLUTTERWAVE_NOT_CONFIGURED: { status: 503, message: "Flutterwave is not enabled for your detected country or currency. No payment was taken." },
  FLUTTERWAVE_INITIALIZATION_FAILED: { status: 502, message: "Flutterwave checkout could not be initialized. No wallet tokens were added." },
  PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY: { status: 422, message: "That payment method is not available for your detected country." },
};

/** Checkout is opened server-side and remains closed until launch, enforcement, auth, and pricing are configured. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  const methodValue = body?.paymentMethod;
  const paymentMethod = methodValue === "card" || methodValue === "local" || methodValue === "more"
    ? methodValue as CustomerPaymentMethod
    : undefined;
  // Backwards compatibility: old clients send tokenPack; new clients send USD cents.
  // One cent of USD reference value equals one enV token.
  const amountUsdCents = body?.amountUsdCents ?? body?.tokenPack;
  const legacyProvider = body?.provider;
  if (!body || typeof amountUsdCents !== "number" || !Number.isSafeInteger(amountUsdCents) ||
      amountUsdCents < 100 || amountUsdCents > 9_000_000_000 ||
      typeof body.idempotencyKey !== "string" ||
      (methodValue !== undefined && !paymentMethod) ||
      (!paymentMethod && legacyProvider !== undefined &&
        legacyProvider !== "paystack" && legacyProvider !== "flutterwave" && legacyProvider !== "cryptomus")) {
    return jsonResponse({
      ok: false,
      error: "INVALID_PURCHASE",
      message: "Enter an amount of at least US$1 and choose a payment method.",
    }, 400);
  }

  const tokens = amountUsdCents;
  const countryCode = getCustomerCountry(request);
  const funding = await getFundingOptions(countryCode);
  const providerOption = paymentMethod
    ? selectFundingProvider(funding.providers, paymentMethod)
    : funding.providers.find((item) => item.id === (legacyProvider ?? "paystack")) ?? null;
  const provider = providerOption?.id;
  if (!provider || !providerOption?.enabled) {
    return jsonResponse({
      ok: false,
      error: "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY",
      message: paymentMethod
        ? "This payment method is not available for your country yet. No payment was taken."
        : providerOption?.message ?? funding.message,
    }, 422);
  }

  try {
    const input = { userId: auth.userId, tokenPack: tokens, idempotencyKey: body.idempotencyKey };
    let pricingQuote: CurrencyPackQuote | undefined;
    if (provider !== "cryptomus") {
      const quotes = await quoteTokenPacks(providerOption.currency, [tokens]);
      pricingQuote = quotes[0];
      if (!pricingQuote) throw Object.assign(new Error("A current payment quote is unavailable."), {
        code: "INVALID_PRICE_CONFIGURATION", status: 503,
      });
    }
    const providerMethod = paymentMethod === "card" || paymentMethod === "local" ? paymentMethod : undefined;
    const checkout = provider === "cryptomus"
      ? await initializeCryptomusCheckout(input)
      : provider === "flutterwave"
        ? await initializeFlutterwaveCheckout({ ...input, countryCode, pricingQuote: pricingQuote!, paymentMethod: providerMethod })
        : await initializePaystackCheckout({ ...input, pricingQuote: pricingQuote!, paymentMethod: providerMethod }, countryCode);
    return jsonResponse({ ok: true, data: { ...checkout, provider, paymentMethod: paymentMethod ?? null } }, 201);
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
