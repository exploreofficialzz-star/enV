import approvedPrices from "../../data/billing-tool-access-approvals.json" with { type: "json" };

export type ApprovedToolAccessPrice = {
  toolId: string;
  subunitsPerSession: number;
  unitLabel: string;
  pricingVersion: string;
  adFreeAccessEnabled: boolean;
};

type ApprovalRegistry = {
  pricingVersion: string;
  profiles: ApprovedToolAccessPrice[];
};

const registry = approvedPrices as ApprovalRegistry;
const validToolId = /^[a-z0-9][a-z0-9-]{0,119}$/;
const approvedByToolId = new Map<string, ApprovedToolAccessPrice>();

for (const profile of registry.profiles) {
  if (!profile || !validToolId.test(profile.toolId) ||
      !Number.isSafeInteger(profile.subunitsPerSession) || profile.subunitsPerSession < 1 ||
      profile.subunitsPerSession > 9_000_000_000_000 ||
      typeof profile.unitLabel !== "string" || profile.unitLabel.length < 1 || profile.unitLabel.length > 48 ||
      typeof profile.pricingVersion !== "string" || profile.pricingVersion.length < 1 || profile.pricingVersion.length > 80 ||
      profile.adFreeAccessEnabled !== true ||
      approvedByToolId.has(profile.toolId)) {
    throw new Error("The reviewed per-tool access price registry contains an invalid or duplicate approval.");
  }
  approvedByToolId.set(profile.toolId, profile);
}

/**
 * This manually reviewed registry is the only source that can activate paid,
 * ad-free access. Generated provisional profiles are never treated as approved.
 */
export function getApprovedToolAccessPrice(toolId: string): ApprovedToolAccessPrice | null {
  if (typeof toolId !== "string" || !validToolId.test(toolId)) return null;
  return approvedByToolId.get(toolId) ?? null;
}

export function getToolAccessPricingSummary() {
  return {
    pricingVersion: registry.pricingVersion,
    approvedToolCount: approvedByToolId.size,
  };
}
