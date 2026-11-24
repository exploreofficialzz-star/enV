import { classifyOfflineToolRecord } from "../offline/policy.mjs";
import offlineEligibleTools from "../../data/offline-eligible-tools.json" with { type: "json" };
import approvedToolAccessPrices from "../../data/billing-tool-access-approvals.json" with { type: "json" };

/** Tool-ID selection for the hybrid online-ad/offline-wallet boundary. */
export type AdEnvironment = { toolIds?: string };

export type AdEligibleTool = {
  id: string;
  name?: string;
  category: string;
  subcategory?: string;
  keywords?: string[];
  tags?: string[];
  status: string;
  clientSide: boolean;
  requiresBackend: boolean;
  requiresAuth: boolean;
  disclaimer?: string;
  engine: { type: string; id?: string; op?: string };
};

const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const RESTRICTED_DISCLAIMERS = new Set(["health", "finance", "earnings"]);
const RESTRICTED_CATEGORIES = new Set(["health", "finance", "earnings", "fitness", "personal"]);
const ADSTERRA_EXCLUDED_CATEGORIES = new Set(["ai", "lab", "labs", "studio", "studios"]);
const ADSTERRA_EXCLUDED_CONCEPTS = /\b(?:studio|studios|lab|labs|laboratory|laboratories|sandbox|ai|artificial intelligence)\b/i;
const OFFLINE_PROFILE_IDS = new Set(
  offlineEligibleTools.profiles
    .filter((profile) => profile.billingKey.startsWith("local.") && ["web", "android", "ios"].every((platform) => profile.platforms.includes(platform)))
    .map((profile) => profile.toolId),
);

type ApprovedAccessPrices = {
  profiles: { toolId: string; subunitsPerSession: number; unitLabel: string; pricingVersion: string; adFreeAccessEnabled: boolean }[];
};
const APPROVED_TOKEN_ACCESS_TOOL_IDS = new Set(
  (approvedToolAccessPrices as ApprovedAccessPrices).profiles
    .filter((profile) => profile.adFreeAccessEnabled === true &&
      Number.isSafeInteger(profile.subunitsPerSession) && profile.subunitsPerSession > 0 &&
      profile.unitLabel === "calculation" && profile.pricingVersion === "env-tool-access-local-calculator-v1")
    .map((profile) => profile.toolId),
);

function parseAllowedToolIds(value?: string): Set<string> {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter((entry) => TOOL_ID_PATTERN.test(entry)));
}

/** Adsterra qualification is Web-only and separate from offline-wallet eligibility. */
export function isAdsterraQualifiedTool(tool: AdEligibleTool): boolean {
  const category = tool.category.toLowerCase();
  const descriptiveIdentity = [
    category, tool.id, tool.name ?? "", tool.subcategory ?? "", tool.engine.id ?? "",
    ...(tool.tags ?? []), ...(tool.keywords ?? []),
  ].join(" ").replace(/[-_]+/g, " ");
  return tool.status === "active" &&
    !ADSTERRA_EXCLUDED_CATEGORIES.has(category) &&
    !RESTRICTED_CATEGORIES.has(category) &&
    !tool.id.startsWith("finance-") &&
    !(tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer.toLowerCase())) &&
    tool.engine.type.toLowerCase() !== "ai" &&
    !ADSTERRA_EXCLUDED_CONCEPTS.test(descriptiveIdentity);
}

function isEligibleHybridToolRecord(toolId: string, tool: AdEligibleTool): boolean {
  return tool.id === toolId &&
    OFFLINE_PROFILE_IDS.has(toolId) &&
    tool.status === "active" &&
    tool.clientSide === true &&
    !tool.requiresBackend &&
    !tool.requiresAuth &&
    !RESTRICTED_CATEGORIES.has(tool.category.toLowerCase()) &&
    !tool.id.startsWith("finance-") &&
    !(tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer.toLowerCase())) &&
    classifyOfflineToolRecord(tool).execution === "device-local";
}

/** The selected Web cohort uses Adsterra online and the existing signed allowance offline. */
export function isHybridAccessToolId(toolId: string, env: AdEnvironment, tool: AdEligibleTool): boolean {
  return parseAllowedToolIds(env.toolIds).has(toolId) && isEligibleHybridToolRecord(toolId, tool);
}

/** Paid access is limited to the exact manually approved token-price registry. */
export function isPaidHybridAccessToolId(toolId: string, env: AdEnvironment, tool: AdEligibleTool): boolean {
  return APPROVED_TOKEN_ACCESS_TOOL_IDS.has(toolId) &&
    parseAllowedToolIds(env.toolIds).has(toolId) &&
    isEligibleHybridToolRecord(toolId, tool);
}

/** Same-origin reachability check: browser online hints alone are not authoritative. */
export async function isApplicationOnline(): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch !== "function" || !navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    try {
      const response = await fetch(window.location.origin + "/", { method: "HEAD", cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (response.ok && new URL(response.url).origin === window.location.origin) return true;
    } catch {
      // Fall through to a small same-origin asset request when HEAD is unsupported.
    }
    const fallback = await fetch(window.location.origin + "/ads.txt", {
      method: "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
    });
    return fallback.ok && new URL(fallback.url).origin === window.location.origin;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
