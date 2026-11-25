import { defineHandler } from "nitro/h3";
import { randomUUID } from "node:crypto";
import { quoteOperation, referenceUsdMicrosForSubunits, TOKEN_SUBUNITS_PER_TOKEN } from "../../../../src/lib/billing/catalog";
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
    if ((body.toolId as string).length > 160 || !/^[a-zA-Z0-9._-]+$/.test(body.toolId as string)) {
      return jsonResponse({ ok: false, error: "INVALID_TOOL", message: "The tool id is invalid." }, 400);
    }
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
    // Never trust a client-supplied premium boolean. Read a verified account entitlement.
    const hasPremium = userId ? await hasActiveEntitlement(userId, "premium").catch(() => false) : false;

    const quote = toolProfile
      ? (() => {
          if (toolProfile.premiumRequired && !hasPremium) {
            return {
              operationId: toolProfile.toolId,
              operationName: toolProfile.toolName,
              status: "premium-required" as const,
              units,
              unitLabel: toolProfile.unitLabel,
              estimatedSubunits: null,
              estimatedTokens: null,
              estimatedUsdMicros: null,
              premiumRequired: true,
              pricingVersion: toolProfile.toolPriceVersion,
              note: "This tool requires the premium entitlement. No usage price has been reserved or charged.",
            };
          }
          if (Number.isSafeInteger(toolProfile.proposedSubunitsPerUnit) && (toolProfile.proposedSubunitsPerUnit ?? 0) > 0) {
            const estimatedSubunits = (toolProfile.proposedSubunitsPerUnit as number) * units;
            return {
              operationId: toolProfile.toolId,
              operationName: toolProfile.toolName,
              status: "provisional" as const,
              units,
              unitLabel: toolProfile.unitLabel,
              estimatedSubunits,
              estimatedTokens: estimatedSubunits / TOKEN_SUBUNITS_PER_TOKEN,
              estimatedUsdMicros: referenceUsdMicrosForSubunits(estimatedSubunits),
              premiumRequired: toolProfile.premiumRequired,
              pricingVersion: toolProfile.toolPriceVersion,
              note: "This is a draft per-tool workload rate. The final measured workload may change the amount; no tokens were reserved or charged.",
            };
          }
          return {
            operationId: toolProfile.toolId,
            operationName: toolProfile.toolName,
            status: "requires-cost-measurement" as const,
            units,
            unitLabel: toolProfile.unitLabel,
            estimatedSubunits: null,
            estimatedTokens: null,
            estimatedUsdMicros: null,
            premiumRequired: toolProfile.premiumRequired,
            pricingVersion: toolProfile.toolPriceVersion,
            note: "This operation is metered from the selected provider or infrastructure usage. A numeric quote is unavailable until actual cost drivers are measured.",
          };
        })()
      : quoteOperation(operationId, units, { hasPremium });

    return jsonResponse({
      ok: true,
      data: {
        ...quote,
        toolId: toolProfile?.toolId ?? null,
        billingProfile: toolProfile ? {
          toolId: toolProfile.toolId,
          billingKey: toolProfile.billingKey,
          pricingMode: toolProfile.pricingMode,
          executionMode: toolProfile.executionMode,
          unitLabel: toolProfile.unitLabel,
          meteringDimensions: toolProfile.meteringDimensions,
          workloadTier: toolProfile.workloadTier,
          pricingBasis: toolProfile.pricingBasis,
          pricingFormula: toolProfile.pricingFormula,
          pricingFactors: toolProfile.pricingFactors,
          proposedSubunitsPerUnit: toolProfile.proposedSubunitsPerUnit,
          proposedTokensPerUnit: toolProfile.proposedTokensPerUnit,
          proposedUsdMicrosPerUnit: toolProfile.proposedUsdMicrosPerUnit,
          priceStatus: toolProfile.priceStatus,
          premiumRequired: toolProfile.premiumRequired,
          manualAuditRequired: toolProfile.manualAuditRequired,
          toolPriceVersion: toolProfile.toolPriceVersion,
        } : null,
        billingActive: false,
        priceStatus: toolProfile ? toolProfile.priceStatus : "provisional",
        priceApproved: false,
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
    console.error("[billing-quote] " + code + " requestId=" + requestId + " causeType=" + (error instanceof Error ? error.name : "UnknownError"));
    return jsonResponse({ ok: false, error: code, message, requestId }, status);
  }
});
