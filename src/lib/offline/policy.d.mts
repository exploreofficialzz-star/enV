export type OfflineExecutionClass = "device-local" | "online-required" | "not-verified" | "unavailable";
export type OfflineTokenPolicy = "no-offline-spend" | "server-verified-only";
export interface OfflineToolCapability {
  toolId: string;
  execution: OfflineExecutionClass;
  tokenPolicy: OfflineTokenPolicy;
  mayRunWithoutNetwork: boolean;
  reason: string;
  policyVersion: "2026-10-30.v1";
}
export const OFFLINE_CAPABILITY_POLICY_VERSION: "2026-10-30.v1";
export function classifyOfflineToolRecord(tool: {
  id: string; clientSide: boolean; requiresBackend: boolean; requiresAuth: boolean;
  status: string; engine: { type: string };
}): OfflineToolCapability;
export function canSpendTokensOffline(): false;
