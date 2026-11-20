import { createHash, randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import {
  BillingError,
  releaseReservation,
  reserveCredits,
  settleReservationAtReservedAmount,
} from "../../../../src/lib/billing/ledger.server";
import { getToolBillingProfile } from "../../../../src/lib/billing/tool-profiles.server";
import { getApprovedToolAccessPrice } from "../../../../src/lib/billing/tool-access-pricing.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../src/lib/billing/http.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

function errorResponse(error: unknown) {
  if (error instanceof BillingError) {
    const status = error.code === "INSUFFICIENT_CREDITS" ? 402
      : error.code === "ACCOUNT_RECOVERY_REQUIRED" ? 409
      : error.code === "RESERVATION_NOT_FOUND" ? 404
      : error.code === "RESERVATION_NOT_ACTIVE" ? 409
      : error.code === "WORKFLOW_BUDGET_EXCEEDED" ? 409
      : 400;
    return jsonResponse({
      ok: false,
      error: error.code,
      message: error.message,
      noTokensCharged: error.code === "INSUFFICIENT_CREDITS" || error.code === "RESERVATION_NOT_FOUND",
    }, status);
  }
  const requestId = randomUUID();
  console.error(`[billing-tool-access] requestId=${requestId} causeType=${error instanceof Error ? error.name : "UnknownError"}`);
  return jsonResponse({
    ok: false,
    error: "TOOL_ACCESS_UNAVAILABLE",
    message: "We couldn't verify paid access for this tool. No new token charge was made.",
    requestId,
  }, 503);
}

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 4_096);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "Send a small JSON object." }, 400);

  const action = body.action;
  const toolId = body.toolId;
  if (!["reserve", "settle", "release"].includes(String(action))) {
    return jsonResponse({ ok: false, error: "INVALID_ACTION", message: "Choose a valid tool access action." }, 400);
  }
  if (typeof toolId !== "string" || !TOOL_ID_PATTERN.test(toolId)) {
    return jsonResponse({ ok: false, error: "INVALID_TOOL", message: "The tool id is invalid." }, 400);
  }

  const principal = await requireBillingUser(request);
  if (!principal.userId) return principal.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const operationId = `tool-access:${toolId}`;

  try {
    if (action === "reserve") {
      const sessionId = body.sessionId;
      if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
        return jsonResponse({ ok: false, error: "INVALID_SESSION", message: "A valid tool access session id is required." }, 400);
      }
      const profile = getToolBillingProfile(toolId);
      if (!profile) return jsonResponse({ ok: false, error: "UNKNOWN_TOOL", message: "This tool has no billing profile." }, 404);
      const approval = getApprovedToolAccessPrice(toolId);
      if (!approval || !approval.adFreeAccessEnabled) {
        return jsonResponse({
          ok: false,
          error: "TOOL_PRICE_NOT_APPROVED",
          message: "The token price for this tool is still being reviewed. No tokens were reserved or charged.",
          noTokensCharged: true,
        }, 409);
      }
      const toolDigest = createHash("sha256").update(toolId).digest("hex").slice(0, 24);
      const reservation = await reserveCredits({
        userId: principal.userId,
        subunits: approval.subunitsPerSession,
        operationId,
        idempotencyKey: `tool:${toolDigest}:${sessionId}`,
        pricingVersion: approval.pricingVersion,
        metadata: {
          source: "tool-access-gate",
          toolId,
          unitLabel: approval.unitLabel,
          profileBillingKey: profile.billingKey,
        },
      });
      return jsonResponse({
        ok: true,
        data: {
          toolId,
          reservationId: reservation.id,
          reservedSubunits: reservation.reservedSubunits,
          reservedTokens: reservation.reservedSubunits / 1_000,
          unitLabel: approval.unitLabel,
          pricingVersion: approval.pricingVersion,
          idempotentReplay: reservation.idempotentReplay,
        },
      });
    }

    const reservationId = body.reservationId;
    if (typeof reservationId !== "string" || !UUID_PATTERN.test(reservationId)) {
      return jsonResponse({ ok: false, error: "INVALID_RESERVATION", message: "A valid token reservation is required." }, 400);
    }

    if (action === "settle") {
      const settled = await settleReservationAtReservedAmount({
        userId: principal.userId,
        reservationId,
        expectedOperationId: operationId,
      });
      return jsonResponse({ ok: true, data: { ...settled, toolId } });
    }

    const released = await releaseReservation({
      userId: principal.userId,
      reservationId,
      expectedOperationId: operationId,
      reason: "Tool access session ended without a successful tool result.",
    });
    return jsonResponse({ ok: true, data: { ...released, toolId } });
  } catch (error) {
    return errorResponse(error);
  }
});
