export const ANALYTICS_POLICY_VERSION = "2026-10-30.v1";

const platforms = new Set(["web", "android", "ios"]);
const eventNames = new Set([
  "app_opened", "tool_viewed", "tool_started", "tool_completed", "tool_failed",
  "tool_cancelled", "tool_abandoned", "comment_created", "reaction_created",
  "feedback_submitted", "update_viewed", "offline_sync_succeeded", "offline_sync_failed",
]);
const toolEventNames = new Set([
  "tool_viewed", "tool_started", "tool_completed", "tool_failed", "tool_cancelled", "tool_abandoned",
]);
const outcomes = new Set(["success", "failure", "cancelled", "abandoned", "unknown"]);
const networkTypes = new Set(["wifi", "cellular", "ethernet", "unknown"]);
const effectiveTypes = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);
const deviceClasses = new Set(["phone", "tablet", "desktop", "unknown"]);
const propertyKeys = new Set([
  "workflow", "mode", "entry_point", "surface", "category", "step", "stage",
  "feature", "result_kind", "error_family", "action", "variant", "screen",
  "attempt", "filter", "view",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toolIdPattern = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const safeLabelPattern = /^[a-zA-Z0-9][a-zA-Z0-9 .:/_-]{0,63}$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredUuid(value, label) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new TypeError(label + " must be a UUID.");
  return value.toLowerCase();
}
function safeProperties(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value).slice(0, 12)) {
    if (!propertyKeys.has(key)) continue;
    if (typeof entry === "string" && entry.length <= 64 && safeLabelPattern.test(entry)) result[key] = entry;
    else if (typeof entry === "boolean") result[key] = entry;
    else if (typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 1000000) result[key] = entry;
  }
  return result;
}
export function validateConsentPayload(value) {
  if (!isRecord(value)) throw new TypeError("Provide a valid consent object.");
  const subjectId = requiredUuid(value.subjectId, "subjectId");
  if (!platforms.has(value.platform)) throw new TypeError("platform must be web, android, or ios.");
  if (typeof value.granted !== "boolean") throw new TypeError("granted must be true or false.");
  if (value.policyVersion !== ANALYTICS_POLICY_VERSION) throw new TypeError("The analytics policy version is not current. Reload enV and try again.");
  return { subjectId, platform: value.platform, granted: value.granted, policyVersion: ANALYTICS_POLICY_VERSION };
}
function normalizeEvent(value) {
  if (!isRecord(value)) throw new TypeError("Each analytics event must be an object.");
  const eventId = requiredUuid(value.eventId, "eventId");
  if (!eventNames.has(value.name)) throw new TypeError("This analytics event is not supported.");
  const toolId = value.toolId == null ? null : value.toolId;
  if (toolId !== null && (typeof toolId !== "string" || !toolIdPattern.test(toolId))) throw new TypeError("toolId must be a catalogue identifier.");
  if (toolEventNames.has(value.name) && !toolId) throw new TypeError("Tool events require a catalogue toolId.");
  let occurredAt = null;
  if (typeof value.occurredAt === "string") {
    const timestamp = Date.parse(value.occurredAt), now = Date.now();
    if (Number.isFinite(timestamp) && timestamp <= now + 300000 && timestamp >= now - 30 * 86400000) occurredAt = new Date(timestamp).toISOString();
  }
  let durationMs = null;
  if (value.durationMs != null) {
    if (!Number.isSafeInteger(value.durationMs) || value.durationMs < 0 || value.durationMs > 3600000) throw new TypeError("durationMs must be between 0 and 3600000.");
    durationMs = value.durationMs;
  }
  const inferredOutcome = {
    tool_completed: "success",
    tool_failed: "failure",
    tool_cancelled: "cancelled",
    tool_abandoned: "abandoned",
  }[value.name];
  const outcome = inferredOutcome ?? (outcomes.has(value.outcome) ? value.outcome : "unknown");
  const errorCode = value.errorCode == null ? null : value.errorCode;
  if (errorCode !== null && (typeof errorCode !== "string" || !/^[A-Z0-9_]{1,64}$/.test(errorCode))) throw new TypeError("errorCode must be a short machine-readable code.");
  return {
    eventId, name: value.name, toolId, occurredAt, durationMs, outcome, errorCode,
    isOffline: value.isOffline === true,
    networkType: networkTypes.has(value.networkType) ? value.networkType : "unknown",
    networkEffectiveType: effectiveTypes.has(value.networkEffectiveType) ? value.networkEffectiveType : "unknown",
    deviceClass: deviceClasses.has(value.deviceClass) ? value.deviceClass : "unknown",
    appVersion: typeof value.appVersion === "string" && /^[a-zA-Z0-9.+_-]{1,40}$/.test(value.appVersion) ? value.appVersion : null,
    properties: safeProperties(value.properties),
  };
}
export function validateEventsPayload(value) {
  if (!isRecord(value)) throw new TypeError("Provide a valid analytics batch.");
  const subjectId = requiredUuid(value.subjectId, "subjectId");
  if (!platforms.has(value.platform)) throw new TypeError("platform must be web, android, or ios.");
  if (value.policyVersion !== ANALYTICS_POLICY_VERSION) throw new TypeError("The analytics policy version is not current. Reload enV and try again.");
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 25) throw new TypeError("Send between 1 and 25 analytics events per batch.");
  return { subjectId, platform: value.platform, policyVersion: ANALYTICS_POLICY_VERSION, events: value.events.map(normalizeEvent) };
}
export function classifyUserAgent(value) {
  const ua = typeof value === "string" ? value.slice(0, 1000) : "";
  let browserFamily = "unknown";
  if (/Edg\//i.test(ua)) browserFamily = "edge";
  else if (/OPR\//i.test(ua)) browserFamily = "opera";
  else if (/Firefox\//i.test(ua)) browserFamily = "firefox";
  else if (/CriOS|Chrome\//i.test(ua)) browserFamily = "chrome";
  else if (/Safari\//i.test(ua)) browserFamily = "safari";
  else if (ua) browserFamily = "other";
  let osFamily = "unknown";
  if (/Android/i.test(ua)) osFamily = "android";
  else if (/iPhone|iPad|iPod/i.test(ua)) osFamily = "ios";
  else if (/Windows/i.test(ua)) osFamily = "windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) osFamily = "macos";
  else if (/Linux/i.test(ua)) osFamily = "linux";
  else if (ua) osFamily = "other";
  return { browserFamily, osFamily };
}
export function classifyReferrer(value, applicationDomain = "envtools.store") {
  if (typeof value !== "string" || !value.trim()) return "direct";
  let host;
  try { host = new URL(value).hostname.toLowerCase(); } catch { return "unknown"; }
  if (host === applicationDomain || host.endsWith("." + applicationDomain)) return "internal";
  if (/(^|\.)google\./.test(host)) return "google";
  if (host === "bing.com" || host.endsWith(".bing.com")) return "bing";
  if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) return "duckduckgo";
  if (host === "search.yahoo.com" || host.endsWith(".search.yahoo.com")) return "yahoo";
  if (host === "search.brave.com" || host.endsWith(".search.brave.com")) return "brave";
  return "referral";
}
