import { defineHandler } from "nitro/h3";
import { randomUUID } from "node:crypto";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../src/lib/billing/http.server";
import { initializePaystackCheckout, minimumPaystackAmountMinor } from "../../../../src/lib/billing/paystack.server";
import { initializeCryptomusCheckout } from "../../../../src/lib/billing/cryptomus.server";
import { initializeFlutterwaveBankTransfer, initializeFlutterwaveCheckout } from "../../../../src/lib/billing/flutterwave.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";
import { getFundingOptions } from "../../../../src/lib/billing/funding.server";
import { quoteTokenPacks, type CurrencyPackQuote } from "../../../../src/lib/billing/fx.server";
import { getFundingCandidates, type CustomerPaymentMethod } from "../../../../src/lib/billing/payment-methods";

const SAFE_CHECKOUT_FAILURES: Record<string, { status: number; message: string }> = {
  PAYMENTS_NOT_CONFIGURED: { status: 503, message: "Token purchases are not enabled for this deployment yet." },
  INVALID_PURCHASE: { status: 400, message: "Enter an amount of at least US$1 and choose a payment method." },
  INVALID_PRICE_CONFIGURATION: { status: 503, message: "This amount cannot be quoted for the selected payment method right now. No payment was taken." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "This checkout key was already used for another purchase. Start a new checkout." },
  CHECKOUT_ALREADY_USED: { status: 409, message: "This checkout attempt has already been used. Start a new checkout." },
  ACCOUNT_EMAIL_REQUIRED: { status: 400, message: "Add a valid email address to your enV account before funding the wallet." },
  PAYSTACK_INITIALIZATION_FAILED: { status: 502, message: "Checkout could not be initialized. No wallet tokens were added and no confirmed payment was recorded." },
  CRYPTOMUS_NOT_CONFIGURED: { status: 503, message: "Crypto checkout is not available yet. No payment was taken." },
  CRYPTOMUS_INITIALIZATION_FAILED: { status: 502, message: "Crypto checkout could not be initialized. No wallet tokens were added." },
  CRYPTOMUS_PROVIDER_ERROR: { status: 502, message: "The crypto provider could not initialize checkout. Please retry shortly." },
  FLUTTERWAVE_NOT_CONFIGURED: { status: 503, message: "Card and local payments are not enabled for your detected country or currency. No payment was taken." },
  FLUTTERWAVE_INITIALIZATION_FAILED: { status: 502, message: "Payment could not be initialized. No wallet tokens were added." },
  FLUTTERWAVE_AUTH_FAILED: { status: 503, message: "Secure payment authentication is unavailable. Please try again shortly." },
  FLUTTERWAVE_API_ERROR: { status: 502, message: "The payment provider could not process this request. No wallet tokens were added." },
  FLUTTERWAVE_CARD_RESTRICTED: {
    status: 422,
    message: "This card has been temporarily restricted after repeated failed attempts. Do not retry this card now. Use a different card, or contact your card issuer and wait at least 24 hours before trying this card again.",
  },
  FLUTTERWAVE_BANKING_PARTNER_ERROR: {
    status: 422,
    message: "The banking partner could not process this card payment. Contact your card issuer or try a different card. No wallet tokens were added.",
  },
  ACCOUNT_NAME_REQUIRED: { status: 400, message: "Add your first and last name to your account before funding the wallet." },
  INVALID_CUSTOMER_ADDRESS: { status: 400, message: "Enter a complete billing address to continue." },
  INVALID_PAYMENT_DETAILS: { status: 400, message: "Check the payment details and try again." },
  INVALID_AUTHORIZATION: { status: 400, message: "The bank authorization details are invalid." },
  PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY: { status: 422, message: "That payment method is not available for your detected country." },
};

/** Checkout is opened server-side and remains closed until launch, enforcement, auth, and pricing are configured. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 12_000);
  const customerAddress = body?.customerAddress && typeof body.customerAddress === "object" &&
    !Array.isArray(body.customerAddress)
    ? body.customerAddress as Record<string, unknown>
    : {};
  const methodValue = body?.paymentMethod;
  const flutterwaveDirect = methodValue === "flutterwave" || body?.provider === "flutterwave";
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
      (methodValue !== undefined && !paymentMethod && !flutterwaveDirect) ||
      (!paymentMethod && legacyProvider !== undefined &&
        legacyProvider !== "paystack" && legacyProvider !== "flutterwave" && legacyProvider !== "cryptomus") ||
      (flutterwaveDirect && (legacyProvider !== undefined && legacyProvider !== "flutterwave"))) {
    return jsonResponse({
      ok: false,
      error: "INVALID_PURCHASE",
      message: "Enter an amount of at least US$1 and choose a payment method.",
    }, 400);
  }

  const tokens = amountUsdCents;
  const countryCode = getCustomerCountry(request);
  const funding = await getFundingOptions(countryCode);
  const candidates = flutterwaveDirect
    ? funding.providers.filter((item) => item.id === "flutterwave" && item.enabled)
    : paymentMethod
      ? getFundingCandidates(funding.providers.filter((item) => item.id !== "flutterwave"), paymentMethod)
      : funding.providers.filter((item) => item.id === (legacyProvider ?? "paystack") && item.enabled);

  let providerOption: (typeof funding.providers)[number] | undefined;
  let pricingQuote: CurrencyPackQuote | undefined;
  for (const candidate of candidates) {
    if (candidate.id === "cryptomus") {
      providerOption = candidate;
      break;
    }
    try {
      const quote = (await quoteTokenPacks(candidate.currency, [tokens]))[0];
      if (!quote) continue;
      if (candidate.id === "paystack" && quote.amountMinor < minimumPaystackAmountMinor(candidate.currency)) continue;
      if (candidate.id === "flutterwave" && quote.amountMinor <= 0) continue;
      providerOption = candidate;
      pricingQuote = quote;
      break;
    } catch {
      // Try the next already-approved gateway; never fabricate a fallback amount.
    }
  }

  const provider = providerOption?.id;
  if (!providerOption || !providerOption.enabled || !provider) {
    return jsonResponse({
      ok: false,
      error: "PAYMENT_METHOD_NOT_AVAILABLE_FOR_COUNTRY",
      message: paymentMethod
        ? "This payment method or amount is not supported for your country. Try a higher amount or another available method. No payment was taken."
        : providerOption?.message ?? funding.message,
    }, 422);
  }

  try {
    const input = { userId: auth.userId, tokenPack: tokens, idempotencyKey: body.idempotencyKey };
    const providerMethod = paymentMethod === "card" || paymentMethod === "local" ? paymentMethod : undefined;
    const checkout = provider === "cryptomus"
      ? await initializeCryptomusCheckout(input)
      : provider === "flutterwave" && body.flutterwaveDetails &&
        typeof body.flutterwaveDetails === "object" &&
        (body.flutterwaveDetails as Record<string, unknown>).type === "bank_transfer"
        ? await initializeFlutterwaveBankTransfer({
            ...input,
            countryCode,
            pricingQuote: pricingQuote!,
            customerName: typeof body.customerName === "string" ? body.customerName : "",
            customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : "",
            customerAddress: {
              city: typeof customerAddress.city === "string" ? customerAddress.city : "",
              state: typeof customerAddress.state === "string" ? customerAddress.state : "",
              line1: typeof customerAddress.line1 === "string" ? customerAddress.line1 : "",
              line2: typeof customerAddress.line2 === "string" ? customerAddress.line2 : undefined,
              postalCode: typeof customerAddress.postalCode === "string" ? customerAddress.postalCode : "",
            },
          })
        : provider === "flutterwave"
        ? await initializeFlutterwaveCheckout({
            ...input,
            countryCode,
            pricingQuote: pricingQuote!,
            paymentDetails: body.flutterwaveDetails,
            customerName: typeof body.customerName === "string" ? body.customerName : "",
            customerAddress: {
              city: typeof customerAddress.city === "string" ? customerAddress.city : "",
              state: typeof customerAddress.state === "string" ? customerAddress.state : "",
              line1: typeof customerAddress.line1 === "string" ? customerAddress.line1 : "",
              line2: typeof customerAddress.line2 === "string" ? customerAddress.line2 : undefined,
              postalCode: typeof customerAddress.postalCode === "string" ? customerAddress.postalCode : "",
            },
          })
        : await initializePaystackCheckout({ ...input, pricingQuote: pricingQuote!, paymentMethod: providerMethod }, countryCode);
    const checkoutData = {
      ...checkout,
      paymentMethod: flutterwaveDirect ? "flutterwave" : paymentMethod ?? null,
      provider: flutterwaveDirect ? "flutterwave" : undefined,
    };
    return jsonResponse({ ok: true, data: checkoutData }, 201);
  } catch (error) {
    const candidate = error as { code?: unknown; safeMessage?: unknown };
    const candidateCode = typeof candidate.code === "string" ? candidate.code : "";
    const knownFailure = SAFE_CHECKOUT_FAILURES[candidateCode];
    const providerFailureMessage = candidateCode === "FLUTTERWAVE_INITIALIZATION_FAILED" &&
      typeof candidate.safeMessage === "string" && candidate.safeMessage.length <= 220
      ? candidate.safeMessage
      : null;
    const requestId = randomUUID();
    if (!knownFailure) {
      console.error(`[billing-purchase] PAYMENTS_UNAVAILABLE requestId=${requestId} causeType=${error instanceof Error ? error.name : "UnknownError"}`);
    }
    return jsonResponse({
      ok: false,
      error: knownFailure ? candidateCode : "PAYMENTS_UNAVAILABLE",
      message: providerFailureMessage ?? knownFailure?.message ?? "Checkout is temporarily unavailable. No payment was recorded. Please try again shortly.",
      requestId,
    }, knownFailure?.status ?? 503);
  }
});
