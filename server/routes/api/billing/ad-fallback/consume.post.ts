import { defineHandler } from "nitro/h3";
import { TOKEN_SUBUNITS_PER_TOKEN, PRICING_VERSION } from "../../../../../src/lib/billing/catalog";
import { BillingError, readWallet, reserveCredits, settleReservation, releaseReservation } from "../../../../../src/lib/billing/ledger.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";
import { getAdFallbackQuote } from "../../../../../src/lib/ads/fallback.server";
import { isAdFallbackBillingEnabled } from "../../../../../src/lib/ads/fallback";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);

  const auth = await requireOfflineBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);

  if (!isAdFallbackBillingEnabled({
    fallbackEnabled: process.env.BILLING_AD_FALLBACK_ENABLED,
    launchEnabled: process.env.BILLING_LAUNCH_ENABLED,
    enforcementEnabled: process.env.BILLING_ENFORCEMENT_ENABLED,
    refundDisputeApproved: process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED,
  })) {
    return jsonResponse({ ok: false, error: "AD_FALLBACK_BILLING_DISABLED" }, 503);
  }

  const body = await readJsonObject(request, 2_048);
  if (!body || typeof body.toolId !== "string" || typeof body.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9:_-]{8,120}$/.test(body.idempotencyKey)) {
    return jsonResponse({ ok: false, error: "INVALID_AD_FALLBACK_REQUEST" }, 400);
  }

  const quote = getAdFallbackQuote(body.toolId);
  if (!quote) return jsonResponse({ ok: false, error: "AD_FALLBACK_NOT_AVAILABLE" }, 404);

  let reservationId: string | null = null;
  try {
    const reservation = await reserveCredits({
      userId: auth.userId,
      operationId: `ad-fallback:${quote.toolId}`,
      subunits: quote.unitSubunits,
      idempotencyKey: body.idempotencyKey,
      pricingVersion: PRICING_VERSION,
      metadata: {
        toolId: quote.toolId,
        billingKey: quote.billingKey,
        platform: auth.platform ?? "web",
        source: "ad-fallback",
      },
    });
    reservationId = reservation.id;

    if (reservation.status === "reserved") {
      await settleReservation({
        userId: auth.userId,
        reservationId: reservation.id,
        actualSubunits: quote.unitSubunits,
      });
    } else if (reservation.status !== "settled") {
      return jsonResponse({ ok: false, error: "AD_FALLBACK_CHARGE_NOT_SETTLED" }, 409);
    }

    const wallet = await readWallet(auth.userId);
    return jsonResponse({
      ok: true,
      data: {
        toolId: quote.toolId,
        chargedSubunits: quote.unitSubunits,
        chargedTokens: quote.unitSubunits / TOKEN_SUBUNITS_PER_TOKEN,
        availableSubunits: wallet.availableSubunits,
        availableTokens: wallet.availableSubunits / TOKEN_SUBUNITS_PER_TOKEN,
        reservationId: reservation.id,
      },
    });
  } catch (error) {
    if (reservationId) {
      await releaseReservation({
        userId: auth.userId,
        reservationId,
        reason: "Ad-fallback tool execution was not authorized.",
      }).catch(() => undefined);
    }
    if (error instanceof BillingError) {
      const status = error.code === "INSUFFICIENT_CREDITS" ? 402 :
        error.code === "ACCOUNT_RECOVERY_REQUIRED" ? 409 : 400;
      return jsonResponse({ ok: false, error: error.code, message: error.message }, status);
    }
    return jsonResponse({
      ok: false,
      error: "AD_FALLBACK_CHARGE_FAILED",
      message: "The enV charge could not be confirmed. No tool run was authorized.",
    }, 503);
  }
});
