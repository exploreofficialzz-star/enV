import approvedPrices from "../../data/billing-tool-access-approvals.json" with { type: "json" };
import offlineEligibleTools from "../../data/offline-eligible-tools.json" with { type: "json" };

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
type OfflineEligibleRegistry = { profiles: { toolId: string; billingKey: string; subunitsPerUnit: number; platforms: string[] }[] };
const offlineProfiles = new Map((offlineEligibleTools as OfflineEligibleRegistry).profiles.map((profile) => [profile.toolId, profile]));
const validToolId = /^[a-z0-9][a-z0-9-]{0,119}$/;
const approvedByToolId = new Map<string, ApprovedToolAccessPrice>();

for (const profile of registry.profiles) {
  const offlineProfile = profile ? offlineProfiles.get(profile.toolId) : undefined;
  if (!profile || !validToolId.test(profile.toolId) ||
      !Number.isSafeInteger(profile.subunitsPerSession) || profile.subunitsPerSession < 1 ||
      profile.subunitsPerSession > 9_000_000_000_000 ||
      typeof profile.unitLabel !== "string" || profile.unitLabel !== "calculation" ||
      typeof profile.pricingVersion !== "string" || profile.pricingVersion !== registry.pricingVersion ||
      profile.adFreeAccessEnabled !== true ||
      !offlineProfile ||
      offlineProfile.billingKey !== "local.calculator" ||
      offlineProfile.subunitsPerUnit !== profile.subunitsPerSession ||
      !["web", "android", "ios"].every((platform) => offlineProfile.platforms.includes(platform)) ||
      approvedByToolId.has(profile.toolId)) {
    throw new Error("The reviewed per-tool access price registry contains an invalid or duplicate approval.");
  }
  approvedByToolId.set(profile.toolId, profile);
}

/**
 * This static registry approves only the existing cross-platform local-calculator
 * cohort, at its canonical 100-milli-token per-calculation rate. Each price is
 * cross-checked against the current offline-eligibility registry; provisional
 * cloud, AI, media and generic tool profiles can never activate paid access.
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


/** New token reservations fail closed unless all billing release controls are explicitly approved. */
export type ToolAccessBillingEnvironment = {
  BILLING_LAUNCH_ENABLED?: string;
  BILLING_ENFORCEMENT_ENABLED?: string;
  BILLING_REFUND_DISPUTE_HANDLING_APPROVED?: string;
};

export function isToolAccessBillingEnabled(
  env: ToolAccessBillingEnvironment = process.env,
): boolean {
  return env.BILLING_LAUNCH_ENABLED === "true" &&
    env.BILLING_ENFORCEMENT_ENABLED === "true" &&
    env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true";
}
