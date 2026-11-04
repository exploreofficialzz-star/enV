import { getSearchableTools } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";
import {
  canSpendTokensOffline as offlineTokenSpendLocked,
  classifyOfflineToolRecord,
  OFFLINE_CAPABILITY_POLICY_VERSION,
} from "./policy.mjs";
import type { OfflineToolCapability } from "./policy.mjs";

export { OFFLINE_CAPABILITY_POLICY_VERSION };
export type { OfflineToolCapability };

// The execution policy also needs category to classify audited local custom engines.
export function classifyOfflineTool(tool: Pick<ToolMeta,
  "id" | "category" | "clientSide" | "requiresBackend" | "requiresAuth" | "status" | "engine"
>): OfflineToolCapability {
  return classifyOfflineToolRecord(tool);
}

export function getOfflineToolCapability(toolId: string): OfflineToolCapability | null {
  const tool = getSearchableTools().find(item => item.id === toolId);
  return tool ? classifyOfflineTool(tool) : null;
}

export function listOfflineToolCapabilities(): OfflineToolCapability[] {
  return getSearchableTools().map(classifyOfflineTool);
}

export function isOfflineLocalTool(toolId: string): boolean {
  return getOfflineToolCapability(toolId)?.execution === "device-local";
}

/** A short card/detail description for operations verified to run without a network. */
export function offlineAwareToolDescription(tool: Pick<ToolMeta, "id" | "description">): string {
  const description = tool.description.trim();
  if (!isOfflineLocalTool(tool.id) || /^works offline\b/i.test(description)) return description;
  return description ? `Works offline. ${description}` : "Works offline.";
}

export function canSpendTokensOffline(): false {
  return offlineTokenSpendLocked();
}
