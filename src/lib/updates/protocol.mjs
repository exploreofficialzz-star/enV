const platforms = new Set(["web", "android", "ios"]);
const channels = new Set(["stable", "preview", "beta"]);
const types = new Set(["release", "feature", "maintenance", "security", "notice"]);
const severities = new Set(["info", "success", "warning", "critical"]);
const actions = new Set(["create", "update", "publish", "archive"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(?:v)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?(?:-[0-9A-Za-z.-]+)?$/;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {unknown} value @param {string} label @param {number} min @param {number} max @returns {string} */
function plainText(value, label, min, max) {
  if (typeof value !== "string") throw new TypeError(label + " must be text.");
  const result = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (result.length < min || result.length > max) throw new TypeError(label + " must be between " + min + " and " + max + " characters.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) throw new TypeError(label + " contains unsupported control characters.");
  return result;
}
/** @param {unknown} value @param {string} label @returns {string|null} */
function date(value, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(label + " must be a valid ISO date.");
  return new Date(value).toISOString();
}
/** @param {unknown} value @param {Set<string>} allowed @param {string} label @returns {string[]} */
function stringList(value, allowed, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > allowed.size || value.some(item => typeof item !== "string" || !allowed.has(item)) || new Set(value).size !== value.length) {
    throw new TypeError(label + " must contain unique supported values.");
  }
  return [...value];
}
/** @param {unknown} value */
export function validateUpdateAction(value) {
  if (!record(value)) throw new TypeError("Provide a valid update request.");
  if (typeof value.action !== "string" || !actions.has(value.action)) throw new TypeError("action must be create, update, publish, or archive.");
  const action = value.action;
  if (action === "publish" || action === "archive") {
    if (typeof value.updateId !== "string" || !uuidPattern.test(value.updateId)) throw new TypeError("updateId must be a UUID.");
    return { action, updateId: value.updateId.toLowerCase() };
  }
  let updateId = null;
  if (action === "update") {
    const rawUpdateId = value.updateId;
    if (typeof rawUpdateId !== "string" || !uuidPattern.test(rawUpdateId)) throw new TypeError("updateId must be a UUID.");
    updateId = rawUpdateId.toLowerCase();
  }
  const title = plainText(value.title, "title", 5, 120);
  const summary = plainText(value.summary, "summary", 10, 240);
  const body = plainText(value.body, "body", 1, 6000);
  const slug = value.slug;
  if (typeof slug !== "string" || slug.length > 100 || !slugPattern.test(slug)) throw new TypeError("slug must use lowercase letters, numbers and single hyphens.");
  if (typeof value.type !== "string" || !types.has(value.type)) throw new TypeError("type is not supported.");
  if (value.severity != null && (typeof value.severity !== "string" || !severities.has(value.severity))) throw new TypeError("severity is not supported.");
  const platformScope = stringList(value.platformScope ?? ["web", "android", "ios"], platforms, "platformScope");
  const targetChannels = stringList(value.channels ?? ["stable"], channels, "channels");
  const minimumVersion = value.minimumVersion == null || value.minimumVersion === "" ? null : plainText(value.minimumVersion, "minimumVersion", 1, 40);
  if (minimumVersion && !versionPattern.test(minimumVersion)) throw new TypeError("minimumVersion must be a dotted semantic version.");
  const startsAt = date(value.startsAt, "startsAt");
  const expiresAt = date(value.expiresAt, "expiresAt");
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) throw new TypeError("expiresAt must be later than startsAt.");
  return {
    action, updateId,
    slug, title, summary, body, type: value.type,
    severity: value.severity ?? "info", platformScope, channels: targetChannels,
    minimumVersion, startsAt, expiresAt,
  };
}
/** @param {unknown} value */
export function validateUpdateQuery(value) {
  if (!record(value)) throw new TypeError("Invalid update query.");
  const platform = value.platform ?? "web";
  const channel = value.channel ?? "stable";
  if (typeof platform !== "string" || !platforms.has(platform)) throw new TypeError("platform must be web, android, or ios.");
  if (typeof channel !== "string" || !channels.has(channel)) throw new TypeError("channel must be stable, preview, or beta.");
  const limitValue = Number(value.limit ?? 5);
  const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(30, limitValue)) : 5;
  const version = value.version == null || value.version === "" ? null : plainText(value.version, "version", 1, 40);
  if (version && !versionPattern.test(version)) throw new TypeError("version must be a dotted semantic version.");
  return { platform, channel, limit, version };
}
