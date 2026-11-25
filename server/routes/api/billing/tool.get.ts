import { defineHandler } from "nitro/h3";
import { getBillingProfileIndexSummary, getToolBillingProfile } from "../../../../src/lib/billing/tool-profiles.server";
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
  const { adsEligible: _legacyAdsEligible, ...toolBillingProfile } = profile as typeof profile & { adsEligible?: boolean };
  void _legacyAdsEligible;
  return jsonResponse({
    ok: true,
    data: {
      ...toolBillingProfile,
      pricingVersion,
      // Return this tool's actual generated resource dimensions and execution class.
      // Shared billing-key estimates remain provisional and must not become charges.
      billable: profile.priceStatus === "approved" && profile.manualAuditRequired === false,
    },
  });
});
