import { classifyOfflineToolRecord } from "../offline/policy.mjs";
import offlineEligibleTools from "../../data/offline-eligible-tools.json" with { type: "json" };

/** Public ad settings are deliberately independent from wallet and token-billing policy. */
export type AdEnvironment = {
  enabled?: string;
  privacyConfigured?: string;
  clientId?: string;
  toolSlotId?: string;
  toolIds?: string;
};

export type AdRuntimeConfig = {
  clientId: string;
  toolSlotId: string;
  allowedToolIds: ReadonlySet<string>;
};

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
const ADSTERRA_EXCLUDED_CATEGORIES = new Set(["ai", "developer", "accessibility", "lab", "labs"]);
const ADSTERRA_EXCLUDED_CONCEPTS = /\b(?:studio|studios|lab|labs|laboratory|laboratories|sandbox|ai|artificial intelligence)\b/i;
const OFFLINE_PROFILE_IDS = new Set(
  offlineEligibleTools.profiles
    .filter((profile) => profile.billingKey.startsWith("local.") && ["web", "android", "ios"].every((platform) => profile.platforms.includes(platform)))
    .map((profile) => profile.toolId),
);

function parseAllowedToolIds(value?: string): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => TOOL_ID_PATTERN.test(entry)),
  );
}

/**
 * Ads stay off unless the operator enables the feature, supplies a real AdSense
 * client/slot, confirms AdSense privacy messaging is configured, and selects IDs.
 * Empty or malformed configuration never creates ad requests.
 */
export function resolveAdConfig(env: AdEnvironment): AdRuntimeConfig | null {
  if (env.enabled !== "true" || env.privacyConfigured !== "true") return null;
  const clientId = env.clientId?.trim() ?? "";
  const toolSlotId = env.toolSlotId?.trim() ?? "";
  if (!/^ca-pub-\d{16}$/.test(clientId) || !/^\d{4,20}$/.test(toolSlotId)) return null;
  const allowedToolIds = parseAllowedToolIds(env.toolIds);
  if (allowedToolIds.size === 0) return null;
  return { clientId, toolSlotId, allowedToolIds };
}

/**
 * Only intentionally selected, active, public, device-local Web tools may show ads.
 * Backend/auth tools and sensitive finance/health/earnings experiences stay excluded.
 */
function isEligibleHybridToolRecord(toolId: string, tool: AdEligibleTool): boolean {
  return tool.id === toolId &&
    OFFLINE_PROFILE_IDS.has(toolId) &&
    tool.status === "active" &&
    tool.clientSide === true &&
    !tool.requiresBackend &&
    !tool.requiresAuth &&
    !RESTRICTED_CATEGORIES.has(tool.category.toLowerCase()) &&
    !tool.id.startsWith("finance-") &&
    !(tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer)) &&
    classifyOfflineToolRecord(tool).execution === "device-local";
}

/**
 * Adsterra qualification is deliberately separate from the hybrid offline-wallet
 * allowlist. It covers suitable active local tools across categories, but never
 * enrolls them in offline billing. Studio, AI and Lab/Sandbox experiences are
 * excluded using canonical category plus tool identity/metadata.
 */
export function isAdsterraQualifiedTool(tool: AdEligibleTool): boolean {
  const category = tool.category.toLowerCase();
  const descriptiveIdentity = [
    tool.id,
    tool.name ?? "",
    tool.subcategory ?? "",
    tool.engine.id ?? "",
    ...(tool.tags ?? []),
    ...(tool.keywords ?? []),
  ].join(" ").replace(/[-_]+/g, " ");
  return tool.status === "active" &&
    tool.clientSide === true &&
    !tool.requiresBackend &&
    !tool.requiresAuth &&
    !ADSTERRA_EXCLUDED_CATEGORIES.has(category) &&
    !RESTRICTED_CATEGORIES.has(category) &&
    !tool.id.startsWith("finance-") &&
    !(tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer.toLowerCase())) &&
    tool.engine.type.toLowerCase() !== "ai" &&
    !ADSTERRA_EXCLUDED_CONCEPTS.test(descriptiveIdentity) &&
    classifyOfflineToolRecord(tool).execution === "device-local";
}

/** A selected hybrid tool must remain metered offline even while ad serving is disabled. */
export function isHybridAccessToolId(toolId: string, env: AdEnvironment, tool: AdEligibleTool): boolean {
  return parseAllowedToolIds(env.toolIds).has(toolId) && isEligibleHybridToolRecord(toolId, tool);
}

/** Ad rendering is a separate, stricter decision from the guest/offline access boundary. */
export function isHybridAdSupportedToolId(toolId: string, env: AdEnvironment, tool: AdEligibleTool): boolean {
  const config = resolveAdConfig(env);
  return config !== null && config.allowedToolIds.has(toolId) && isHybridAccessToolId(toolId, env, tool);
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
    // Some edge/cache configurations do not answer HEAD consistently. Verify
    // the same origin with a tiny static asset before concluding the app is offline.
    const fallback = await fetch(window.location.origin + "/ads.txt", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return fallback.ok && new URL(fallback.url).origin === window.location.origin;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function canShowAdForTool(
  tool: AdEligibleTool,
  config: AdRuntimeConfig | null,
): boolean {
  return config !== null &&
    config.allowedToolIds.has(tool.id) &&
    isEligibleHybridToolRecord(tool.id, tool);
}
