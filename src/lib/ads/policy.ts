import { classifyOfflineToolRecord } from "../offline/policy.mjs";

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
export function canShowAdForTool(
  tool: AdEligibleTool,
  config: AdRuntimeConfig | null,
): boolean {
  if (!config || !config.allowedToolIds.has(tool.id)) return false;
  if (tool.status !== "active" || tool.clientSide !== true || tool.requiresBackend || tool.requiresAuth) return false;
  if (tool.category === "fitness" || tool.category === "personal" || tool.id.startsWith("finance-")) return false;
  if (tool.disclaimer && RESTRICTED_DISCLAIMERS.has(tool.disclaimer)) return false;
  return classifyOfflineToolRecord(tool).execution === "device-local";
}
