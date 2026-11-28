import { defineHandler } from "nitro/h3";
import { getBillingProfileIndexSummary, getToolBillingProfile } from "../../../../src/lib/billing/tool-profiles.server";
import { getApprovedToolAccessPrice } from "../../../../src/lib/billing/tool-access-pricing.server";
import { jsonResponse } from "../../../../src/lib/billing/http.server";

export default defineHandler((event) => {
  const requestUrl = new URL(event.req.url, "http://localhost");
  const toolId = requestUrl.searchParams.get("toolId");
  if (!toolId || toolId.length > 160 || !/^[a-zA-Z0-9._-]+$/.test(toolId)) {
    return jsonResponse({ ok: false, error: "INVALID_TOOL_ID", message: "Provide a valid tool ID." }, 400);
  }
  const profile = getToolBillingProfile(toolId);
  if (!profile) return jsonResponse({ ok: false, error: "UNKNOWN_TOOL", message: "No billing profile exists for this tool." }, 404);
  const { pricingVersion } = getBillingProfileIndexSummary();
  // This is the existing alternative ad-free session access price, not the tool's operation tariff.
  const adFreeAccessPrice = getApprovedToolAccessPrice(toolId);
  const { adsEligible: _legacyAdsEligible, ...toolBillingProfile } = profile as typeof profile & { adsEligible?: boolean };
  void _legacyAdsEligible;
  return jsonResponse({
    ok: true,
    data: {
      ...toolBillingProfile,
      pricingVersion,
      proposedPrice: profile.proposedSubunitsPerUnit !== null ? {
        subunitsPerUnit: profile.proposedSubunitsPerUnit,
        tokensPerUnit: profile.proposedTokensPerUnit,
        usdMicrosPerUnit: profile.proposedUsdMicrosPerUnit,
        unitLabel: profile.unitLabel,
        workloadTier: profile.workloadTier,
        formula: profile.pricingFormula,
        factors: profile.pricingFactors,
        pricingVersion: profile.toolPriceVersion,
      } : null,
      // Kept separate so a 267-tool access fee is never mistaken for the operation price.
      adFreeAccessPrice: adFreeAccessPrice ? {
        subunitsPerSession: adFreeAccessPrice.subunitsPerSession,
        unitLabel: adFreeAccessPrice.unitLabel,
        pricingVersion: adFreeAccessPrice.pricingVersion,
      } : null,
      priceApproved: false,
      manualAuditRequired: true,
      billingActive: false,
    },
  });
});
