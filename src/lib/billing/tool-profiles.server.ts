/** Server-only index of per-tool billing profiles generated from the master catalogue. */
import profileIndex from "../../data/billing-profiles.json";
import runtimeExtensionIndex from "../../data/billing-profile-runtime-extensions.json";

export type ToolBillingPricingMode = "per-unit-hypothesis" | "measured-provider-cost";
export type ToolBillingPriceStatus = "approved" | "provisional" | "requires-cost-measurement" | string;
export type ToolBillingExecutionMode = "local-device" | "web-local" | "cloud-or-remote" | string;

export interface ToolBillingProfile {
  toolId: string;
  toolName: string;
  category: string;
  toolStatus: string;
  engineType: string;
  clientSide: boolean;
  requiresBackend: boolean;
  executionMode: ToolBillingExecutionMode;
  billingKey: string;
  pricingMode: ToolBillingPricingMode;
  provisionalSubunitsPerUnit: number | null;
  proposedSubunitsPerUnit: number | null;
  proposedTokensPerUnit: number | null;
  proposedUsdMicrosPerUnit: number | null;
  unitLabel: string;
  meteringDimensions: string[];
  workloadTier: string;
  pricingBasis: string;
  pricingFormula: string;
  pricingFactors: string[];
  toolPriceVersion: string;
  optionalAiAssistProfile: string | null;
  premiumRequired: boolean;
  /** Pricing is not chargeable while this flag remains true. */
  manualAuditRequired: boolean;
  priceStatus: ToolBillingPriceStatus;
  classificationReason: string;
  pricingVersion: string;
  toolPriceVersion: string;
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
