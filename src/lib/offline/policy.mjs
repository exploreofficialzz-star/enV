export const OFFLINE_CAPABILITY_POLICY_VERSION = "2026-11-04.v2";
const auditedLocalEngineTypes = new Set([
  "calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode", "generator", "image", "pdf",
]);
const auditedLocalToolIds = new Set(["a-book", "zip-any-file", "qr-payload-inspector"]);
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
  if (auditedLocalToolIds.has(tool.id) || auditedLocalEngineTypes.has(engineType)) {
    return { toolId: tool.id, execution: "device-local", tokenPolicy: "offline-allowance-required", mayRunWithoutNetwork: true,
      reason: "This tool has an audited local execution path; token-consuming actions still require a verified offline allowance, and network sync remains unavailable offline.",
      policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
  }
  return { toolId: tool.id, execution: "not-verified", tokenPolicy: "server-verified-only", mayRunWithoutNetwork: false,
    reason: "Offline behavior has not been audited for this engine. enV will not promise offline operation.",
    policyVersion: OFFLINE_CAPABILITY_POLICY_VERSION };
}
export function canSpendTokensOffline() { return false; }
