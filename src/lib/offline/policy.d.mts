export type OfflineExecutionClass = "device-local" | "online-required" | "not-verified" | "unavailable";
export type OfflineTokenPolicy = "monetization-pending" | "server-verified-only";
export interface OfflineToolCapability {
  toolId: string;
  execution: OfflineExecutionClass;
  tokenPolicy: OfflineTokenPolicy;
  mayRunWithoutNetwork: boolean;
  reason: string;
  policyVersion: "2026-11-04.v3";
}
export const OFFLINE_CAPABILITY_POLICY_VERSION: "2026-11-04.v3";
export function classifyOfflineToolRecord(tool: {
  id: string;
  category: string;
  clientSide: boolean;
  requiresBackend: boolean;
  requiresAuth: boolean;
  status: string;
  engine: { type: string; id?: string; op?: string };
}): OfflineToolCapability;
export function canSpendTokensOffline(): false;
