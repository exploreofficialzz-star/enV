export const OFFLINE_CAPABILITY_POLICY_VERSION = "2026-10-30.v1";
const auditedLocalEngineTypes = new Set([
  "calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode", "generator",
]);
const explicitlyOnlineEngineTypes = new Set([
  "ai", "network", "url-media", "url-media-info", "document-backend", "seo",
]);

export function classifyOfflineToolRecord(tool) {
  const engineType = tool.engine?.type ?? "unknown";
  if (tool.status === "planned") {
    return { toolId: tool.id, execution: "unavailable", tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
      reason: "This tool is not active yet.", policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
  }
  if (tool.requiresBackend || tool.requiresAuth || !tool.clientSide || explicitlyOnlineEngineTypes.has(engineType)) {
    return { toolId: tool.id, execution: "online-required", tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
      reason: tool.requiresAuth ? "This tool requires an authenticated service."
        : tool.requiresBackend || !tool.clientSide ? "This tool depends on an enV server service."
        : "This engine depends on a network service.", policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
  }
  if (auditedLocalEngineTypes.has(engineType)) {
    return { toolId: tool.id, execution: "device-local", tokenPolicy: "no-offline-spend", mayRunWithoutNetwork: true,
      reason: "This deterministic engine is approved for local execution; network sync and server-side account actions remain unavailable offline.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
  }
  return { toolId: tool.id, execution: "not-verified", tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
    reason: "Offline behavior has not been audited for this engine. enV will not promise offline operation.",
    policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
}
export function canSpendTokensOffline() { return false; }
