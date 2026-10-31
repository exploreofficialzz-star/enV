const platforms = new Set(["web", "android", "ios"]);
const categories = new Set(["bug", "tool_issue", "idea", "account", "billing", "other"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toolIdPattern = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const versionPattern = /^[a-zA-Z0-9.+_-]{1,40}$/;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** @param {unknown} value @param {string} label @param {number} min @param {number} max @returns {string} */
function text(value, label, min, max) {
  if (typeof value !== "string") throw new TypeError(label + " must be text.");
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (normalized.length < min || normalized.length > max) throw new TypeError(label + " must be between " + min + " and " + max + " characters.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) throw new TypeError(label + " contains unsupported control characters.");
  return normalized;
}
/** @param {unknown} value */
export function validateFeedbackPayload(value) {
  if (!isRecord(value)) throw new TypeError("Provide a valid feedback report.");
  if (typeof value.idempotencyKey !== "string" || !uuidPattern.test(value.idempotencyKey)) throw new TypeError("idempotencyKey must be a UUID.");
  if (typeof value.platform !== "string" || !platforms.has(value.platform)) throw new TypeError("platform must be web, android, or ios.");
  if (typeof value.category !== "string" || !categories.has(value.category)) throw new TypeError("category is not supported.");
  const title = text(value.title, "title", 5, 120);
  const description = text(value.description, "description", 20, 4000);
  const toolId = value.toolId == null || value.toolId === "" ? null : value.toolId;
  if (toolId !== null && (typeof toolId !== "string" || !toolIdPattern.test(toolId))) throw new TypeError("toolId must be a catalogue identifier.");
  const appVersion = value.appVersion == null || value.appVersion === "" ? null : value.appVersion;
  if (appVersion !== null && (typeof appVersion !== "string" || !versionPattern.test(appVersion))) throw new TypeError("appVersion must be a short version identifier.");
  return { idempotencyKey: value.idempotencyKey.toLowerCase(), platform: value.platform, category: value.category, title, description, toolId, appVersion };
}
export const FEEDBACK_LIMITS = Object.freeze({ title: 120, description: 4000, reportsPerHour: 5, adminPageSize: 50 });
