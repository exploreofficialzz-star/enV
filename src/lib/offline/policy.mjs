import { isOfflineLocalToolRecord, offlineRemoteOperationReason } from "./local-operation-policy.mjs";

export const OFFLINE_CAPABILITY_POLICY_VERSION = "2026-11-04.v3";

/**
 * Package eligibility describes where an operation can execute, not whether the
 * operation is free. Local execution is available ahead of monetization; billing
 * enforcement is a separate rollout. Server operations inside hybrid engines are excluded by operation ID.
 */
export function classifyOfflineToolRecord(tool) {
  if (!tool || tool.status === "planned") {
    return {
      toolId: tool?.id ?? "unknown",
      execution: "unavailable",
      tokenPolicy: "server-verified-only",
      mayRunWithoutNetwork: false,
      reason: "This tool is not active yet.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  if (isOfflineLocalToolRecord(tool)) {
    return {
      toolId: tool.id,
      execution: "device-local",
      tokenPolicy: "monetization-pending",
      mayRunWithoutNetwork: true,
      reason: "This operation runs on the device. Per-tool enV Token metering is pending the monetization rollout.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  const remoteReason = offlineRemoteOperationReason(tool);
  if (remoteReason || tool.requiresBackend || tool.requiresAuth || !tool.clientSide) {
    return {
      toolId: tool.id,
      execution: "online-required",
      tokenPolicy: "server-verified-only",
      mayRunWithoutNetwork: false,
      reason: remoteReason || (tool.requiresAuth
        ? "This tool requires an authenticated service."
        : "This tool depends on an enV server service."),
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
    };
  }

  return {
    toolId: tool.id,
    execution: "not-verified",
    tokenPolicy: "server-verified-only",
    mayRunWithoutNetwork: false,
    reason: "The operation does not have a verified local execution route. enV will not promise offline operation.",
    policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION,
  };
}

// Production offline spend remains locked until the integrity/finalization verifier exists.
export function canSpendTokensOffline() { return false; }
