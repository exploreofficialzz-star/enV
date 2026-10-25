/** Server-only index of provisional billing profiles generated from the master catalogue. */
import profileIndex from "../../data/billing-profile-index.json";
import runtimeExtensionIndex from "../../data/billing-profile-runtime-extensions.json";

export interface ToolBillingProfile {
  toolId: string;
  billingKey: string;
  pricingMode: "per-unit-hypothesis" | "measured-provider-cost";
  provisionalSubunitsPerUnit: number | null;
  unitLabel: string;
  optionalAiAssistProfile: string | null;
  premiumRequired: boolean;
}

type ProfileIndex = {
  pricingVersion: string;
  toolCount: number;
  profiles: ToolBillingProfile[];
};

const data = profileIndex as ProfileIndex;
const runtimeExtensions = runtimeExtensionIndex as ProfileIndex;
const combinedProfiles = [...data.profiles, ...runtimeExtensions.profiles];
const profilesByToolId = new Map(combinedProfiles.map((profile) => [profile.toolId, profile]));

export function getToolBillingProfile(toolId: string): ToolBillingProfile | undefined {
  if (typeof toolId !== "string" || toolId.length < 1 || toolId.length > 160) return undefined;
  return profilesByToolId.get(toolId);
}

export function getBillingProfileIndexSummary() {
  return { pricingVersion: data.pricingVersion, toolCount: data.toolCount + runtimeExtensions.toolCount };
}
