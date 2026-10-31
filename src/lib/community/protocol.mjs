const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toolIdPattern = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const displayNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{1,31}$/u;
const reasons = new Set(["spam", "harassment", "misinformation", "inappropriate", "other"]);
const reportStatuses = new Set(["open", "reviewed", "dismissed", "actioned"]);
const commentActions = new Set(["keep", "hide", "remove"]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {unknown} value @param {string} label @param {number} min @param {number} max @returns {string} */
function requiredText(value, label, min, max) {
  if (typeof value !== "string") throw new TypeError(label + " must be text.");
  const result = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (result.length < min || result.length > max) throw new TypeError(label + " must be between " + min + " and " + max + " characters.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) throw new TypeError(label + " contains unsupported control characters.");
  return result;
}
/** @param {unknown} value @param {string} label @returns {string} */
function uuid(value, label) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new TypeError(label + " must be a UUID.");
  return value.toLowerCase();
}
/** @param {unknown} value @returns {string} */
function tool(value) {
  if (typeof value !== "string" || !toolIdPattern.test(value)) throw new TypeError("toolId must be a catalogue identifier.");
  return value;
}
/** @param {unknown} value */
export function validateCommunityVisitor(value) { return uuid(value, "visitorId"); }
/** @param {unknown} value */
export function validateCommunityTool(value) { return tool(value); }
/** @param {unknown} value */
export function validateCommunityComment(value) {
  if (!record(value)) throw new TypeError("Provide a valid comment.");
  const toolId = tool(value.toolId);
  const visitorId = uuid(value.visitorId, "visitorId");
  const idempotencyKey = uuid(value.idempotencyKey, "idempotencyKey");
  const body = requiredText(value.body, "body", 1, 2000);
  if (value.identityMode != null && value.identityMode !== "public" && value.identityMode !== "anonymous") throw new TypeError("identityMode must be public or anonymous.");
  const identityMode = value.identityMode === "public" ? "public" : "anonymous";
  let displayName = null;
  if (identityMode === "public") {
    displayName = requiredText(value.displayName, "displayName", 2, 32);
    if (!displayNamePattern.test(displayName)) throw new TypeError("displayName contains unsupported characters.");
  }
  const parentId = value.parentId == null || value.parentId === "" ? null : uuid(value.parentId, "parentId");
  return { toolId, visitorId, idempotencyKey, body, identityMode, displayName, parentId };
}
/** @param {unknown} value */
export function validateCommunityReaction(value) {
  if (!record(value)) throw new TypeError("Provide a valid reaction.");
  if (value.reaction !== "like" && value.reaction !== "dislike") throw new TypeError("reaction must be like or dislike.");
  return { toolId: tool(value.toolId), visitorId: uuid(value.visitorId, "visitorId"), reaction: value.reaction };
}
/** @param {unknown} value */
export function validateCommunityView(value) {
  if (!record(value)) throw new TypeError("Provide a valid view event.");
  return { toolId: tool(value.toolId), visitorId: uuid(value.visitorId, "visitorId") };
}
/** @param {unknown} value */
export function validateCommunityReport(value) {
  if (!record(value)) throw new TypeError("Provide a valid report.");
  if (typeof value.reason !== "string" || !reasons.has(value.reason)) throw new TypeError("Choose a supported report reason.");
  const details = value.details == null || value.details === "" ? null : requiredText(value.details, "details", 1, 500);
  return { commentId: uuid(value.commentId, "commentId"), visitorId: uuid(value.visitorId, "visitorId"), reason: value.reason, details };
}
/** @param {unknown} value */
export function validateCommunityBlock(value) {
  if (!record(value)) throw new TypeError("Provide a valid block request.");
  return { commentId: uuid(value.commentId, "commentId"), visitorId: uuid(value.visitorId, "visitorId") };
}
/** @param {unknown} value */
export function validateCommunityDelete(value) {
  if (!record(value)) throw new TypeError("Provide a valid delete request.");
  return { commentId: uuid(value.commentId, "commentId"), visitorId: uuid(value.visitorId, "visitorId") };
}
/** @param {unknown} value */
export function validateCommunityModeration(value) {
  if (!record(value)) throw new TypeError("Provide a valid moderation request.");
  const reportId = uuid(value.reportId, "reportId");
  if (typeof value.status !== "string" || !reportStatuses.has(value.status)) throw new TypeError("Choose a supported report status.");
  if (typeof value.commentAction !== "string" || !commentActions.has(value.commentAction)) throw new TypeError("Choose a supported comment action.");
  return { reportId, status: value.status, commentAction: value.commentAction };
}
