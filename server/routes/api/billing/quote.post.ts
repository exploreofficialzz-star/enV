import { defineHandler } from "nitro/h3";
import { randomUUID } from "node:crypto";
import { quoteOperation } from "../../../../src/lib/billing/catalog";
import { hasActiveEntitlement } from "../../../../src/lib/billing/ledger.server";
import { getToolBillingProfile } from "../../../../src/lib/billing/tool-profiles.server";
import { getOptionalBillingUserId, isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 4_096);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "Send a small JSON object." }, 400);
  const hasToolId = typeof body.toolId === "string";
  const hasOperationId = typeof body.operationId === "string";
  if (hasToolId === hasOperationId) {
    return jsonResponse({ ok: false, error: "INVALID_OPERATION", message: "Provide exactly one of toolId or operationId." }, 400);
  }
  let operationId: string;
  let toolProfile: ReturnType<typeof getToolBillingProfile>;
  if (hasToolId) {
    if ((body.toolId as string).length > 160) return jsonResponse({ ok: false, error: "INVALID_TOOL", message: "The tool id is invalid." }, 400);
    toolProfile = getToolBillingProfile(body.toolId as string);
    if (!toolProfile) return jsonResponse({ ok: false, error: "UNKNOWN_TOOL", message: "No billing profile exists for this tool." }, 404);
    operationId = toolProfile.billingKey;
  } else {
    if ((body.operationId as string).length > 120) return jsonResponse({ ok: false, error: "INVALID_OPERATION", message: "The operationId is invalid." }, 400);
    operationId = body.operationId as string;
    toolProfile = undefined;
  }
  const units = body.units === undefined ? 1 : body.units;
  if (typeof units !== "number" || !Number.isInteger(units) || units < 1 || units > 1_000_000) {
    return jsonResponse({ ok: false, error: "INVALID_UNITS", message: "Units must be an integer from 1 to 1,000,000." }, 400);
  }
  try {
    const userId = await getOptionalBillingUserId(request);
    // Never trust a client-supplied premium boolean; derive it from a verified account entitlement.
    // If entitlement storage is temporarily unavailable, keep premium access closed but still show
    // non-premium preview prices instead of making the public pricing preview unavailable.
    const hasPremium = userId ? await hasActiveEntitlement(userId, "premium").catch(() => false) : false;
    const quote = quoteOperation(operationId, units, { hasPremium });
    const aiAssistQuote = toolProfile?.optionalAiAssistProfile
      ? quoteOperation(toolProfile.optionalAiAssistProfile, 1, { hasPremium })
      : null;
    return jsonResponse({
      ok: true,
      data: {
        ...quote,
        toolId: toolProfile?.toolId ?? null,
        billingProfile: toolProfile ? { billingKey: toolProfile.billingKey, pricingMode: toolProfile.pricingMode } : null,
        aiAssistQuote,
        billingActive: false,
        priceStatus: "provisional",
      },
    });
  } catch (error) {
    const requestId = randomUUID();
    const isUnknownOperation = error instanceof RangeError && error.message === "Unknown billing operation.";
    const code = isUnknownOperation ? "UNKNOWN_OPERATION" : "QUOTE_UNAVAILABLE";
    const status = isUnknownOperation ? 404 : 503;
    const message = isUnknownOperation
      ? "No usage estimate is available for that operation."
      : "We couldn't prepare this usage estimate right now. No tokens were charged.";
    console.error(`[billing-quote] ${code} requestId=${requestId} causeType=${error instanceof Error ? error.name : "UnknownError"}`);
    return jsonResponse({ ok: false, error: code, message, requestId }, status);
  }
});
