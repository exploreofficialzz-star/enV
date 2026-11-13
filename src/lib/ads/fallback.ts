import type { ToolBillingProfile } from "../billing/tool-profiles.server";

export type AdFallbackTool = {
  id: string;
  status: string;
  clientSide: boolean;
  requiresBackend: boolean;
  requiresAuth: boolean;
};

export type AdFallbackEnvironment = {
  fallbackEnabled?: string;
  launchEnabled?: string;
  enforcementEnabled?: string;
  refundDisputeApproved?: string;
};

export function isAdFallbackBillingEnabled(env: AdFallbackEnvironment): boolean {
  return env.fallbackEnabled === "true" &&
    env.launchEnabled === "true" &&
    env.enforcementEnabled === "true" &&
    env.refundDisputeApproved === "true";
}

/**
 * A fallback charge is available only when the canonical server profile carries
 * a fixed local per-unit rate. Client values never participate in this decision.
 */
export function resolveAdFallbackUnitSubunits(
  tool: AdFallbackTool | null | undefined,
  profile: ToolBillingProfile | null | undefined,
): number | null {
  if (!tool || !profile ||
      tool.id !== profile.toolId ||
      tool.status !== "active" ||
      tool.clientSide !== true ||
      tool.requiresBackend ||
      tool.requiresAuth ||
      !profile.billingKey.startsWith("local.") ||
      profile.pricingMode !== "per-unit-hypothesis" ||
      profile.premiumRequired) return null;

  const rate = profile.provisionalSubunitsPerUnit;
  return Number.isSafeInteger(rate) && rate > 0 && rate <= 1_000_000 ? rate : null;
}
