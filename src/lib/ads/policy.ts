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
  category: string;
  status: string;
  clientSide: boolean;
  requiresBackend: boolean;
  requiresAuth: boolean;
  disclaimer?: string;
  engine: { type: string; id?: string; op?: string };
};

const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const RESTRICTED_DISCLAIMERS = new Set(["health", "finance", "earnings"]);
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
export function isHybridAdSupportedToolId(toolId: string, env: AdEnvironment, tool: AdEligibleTool): boolean {
  const config = resolveAdConfig(env);
  return config !== null &&
    tool.id === toolId &&
    config.allowedToolIds.has(toolId) &&
    OFFLINE_PROFILE_IDS.has(toolId) &&
    canShowAdForTool(tool, config);
}

/** Same-origin reachability check: browser online hints alone are not authoritative. */
export async function isApplicationOnline(): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch !== "function" || !navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(window.location.origin + "/", { method: "HEAD", cache: "no-store", credentials: "same-origin", signal: controller.signal });
    return response.ok && new URL(response.url).origin === window.location.origin;
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
  if (!config || !config.allowedToolIds.has(tool.id) || !OFFLINE_PROFILE_IDS.has(tool.id)) return false;
  if (tool.status !== "active" || tool.clientSide !== true || tool.requiresBackend || tool.requiresAuth) return false;
  if (tool.category === "fitness" || tool.category === "personal" || tool.id.startsWith("finance-")) return false;
  if (tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer)) return false;
  return classifyOfflineToolRecord(tool).execution === "device-local";
}
