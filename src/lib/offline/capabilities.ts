import { getSearchableTools } from "@/lib/registry";
import type { EngineRef, ToolMeta } from "@/types/tool";

export const OFFLINE_CAPABILITY_POLICY_VERSION = "2026-10-30.v1" as const;

export type OfflineExecutionClass =
  | "device-local"
  | "online-required"
  | "not-verified"
  | "unavailable";

export type OfflineTokenPolicy =
  | "no-offline-spend"
  | "not-billable"
  | "server-verified-only";

export interface OfflineToolCapability {
  toolId: string;
  execution: OfflineExecutionClass;
  tokenPolicy: OfflineTokenPolicy;
  mayRunWithoutNetwork: boolean;
  reason: string;
  policyVersion: typeof OFFLINE_CAPABILITY_POLICY_VERSION;
}

/**
 * Strict allowlist only. Adding an engine here means its implementation has been
 * audited for local-only dependencies, no network fetch, no remote persistence,
 * and safe browser/native file handling. Do not infer capability from clientSide.
 */
const auditedLocalEngineTypes = new Set<EngineRef["type"]>([
  "calculator",
  "converter",
  "datetime",
  "text",
  "codec",
  "color",
  "qr",
  "barcode",
  "generator",
]);

const explicitlyOnlineEngineTypes = new Set<EngineRef["type"]>([
  "ai",
  "network",
  "url-media",
  "url-media-info",
  "document-backend",
  "seo",
]);

export function classifyOfflineTool(tool: Pick<ToolMeta,
  "id" | "clientSide" | "requiresBackend" | "requiresAuth" | "status" | "engine"
>): OfflineToolCapability {
  const engineType = tool.engine.type;

  if (tool.status === "planned") {
    return {
      toolId: tool.id, execution: "unavailable",
      tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
      reason: "This tool is not active yet.", policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  if (tool.requiresBackend || tool.requiresAuth || !tool.clientSide || explicitlyOnlineEngineTypes.has(engineType)) {
    return {
      toolId: tool.id, execution: "online-required",
      tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
      reason: tool.requiresAuth
        ? "This tool requires an authenticated service."
        : tool.requiresBackend || !tool.clientSide
          ? "This tool depends on an enV server service."
          : "This engine depends on a network service.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  if (auditedLocalEngineTypes.has(engineType)) {
    return {
      toolId: tool.id, execution: "device-local",
      tokenPolicy: "no-offline-spend", mayRunWithoutNetwork: true,
      reason: "This deterministic engine is approved for local execution; network sync and server-side account actions remain unavailable offline.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  return {
    toolId: tool.id, execution: "not-verified",
    tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
    reason: "Offline behavior has not been audited for this engine. enV will not promise offline operation.",
    policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
  };
}

export function getOfflineToolCapability(toolId: string): OfflineToolCapability | null {
  const tool = getSearchableTools().find(item => item.id === toolId);
  return tool ? classifyOfflineTool(tool) : null;
}

export function listOfflineToolCapabilities() {
  return getSearchableTools().map(classifyOfflineTool);
}

export function isOfflineLocalTool(toolId: string): boolean {
  return getOfflineToolCapability(toolId)?.execution === "device-local";
}

export function canSpendTokensOffline(): false {
  // Intentionally hard false: signed allowance/integrity/reconciliation work is
  // not yet safe to expose. Do not change without a separate security review.
  return false;
}
