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

export function classifyOfflineTool(tool: Pick<ToolMeta,
  "id" | "clientSide" | "requiresBackend" | "requiresAuth" | "status" | "engine"
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

export function canSpendTokensOffline(): false {
  return offlineTokenSpendLocked();
}
