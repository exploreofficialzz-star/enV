export type AdPageUnitFormat = "in-feed" | "in-article" | "multiplex";

export type AdPageUnitEnvironment = {
  enabled?: string;
  privacyConfigured?: string;
  clientId?: string;
  inFeedSlotId?: string;
  inFeedLayoutKey?: string;
  inArticleSlotId?: string;
  multiplexSlotId?: string;
};

export type AdPageUnitConfig = {
  format: AdPageUnitFormat;
  clientId: string;
  slotId: string;
  layoutKey?: string;
};

export type AdPageUnitMap = Partial<Record<AdPageUnitFormat, AdPageUnitConfig>>;

const CLIENT_ID_PATTERN = /^ca-pub-\d{16}$/;
const SLOT_ID_PATTERN = /^\d{4,20}$/;
// Publisher-generated in-feed keys may include letters, digits, +, /, =, _ and -.
const LAYOUT_KEY_PATTERN = /^[A-Za-z0-9+/_=-]{1,80}$/;

/**
 * Resolve editorial page units independently of the tool-ad allowlist. Every
 * unit still requires the explicit global ad switch, CMP-ready switch and a
 * valid publisher/client ID. Invalid or incomplete individual units are omitted.
 */
export function resolveAdPageUnits(env: AdPageUnitEnvironment): AdPageUnitMap | null {
  if (env.enabled !== "true" || env.privacyConfigured !== "true") return null;

  const clientId = env.clientId?.trim() ?? "";
  if (!CLIENT_ID_PATTERN.test(clientId)) return null;

  const units: AdPageUnitMap = {};
  const inFeedSlotId = env.inFeedSlotId?.trim() ?? "";
  const inFeedLayoutKey = env.inFeedLayoutKey?.trim() ?? "";
  if (SLOT_ID_PATTERN.test(inFeedSlotId) && LAYOUT_KEY_PATTERN.test(inFeedLayoutKey)) {
    units["in-feed"] = {
      format: "in-feed",
      clientId,
      slotId: inFeedSlotId,
      layoutKey: inFeedLayoutKey,
    };
  }

  const inArticleSlotId = env.inArticleSlotId?.trim() ?? "";
  if (SLOT_ID_PATTERN.test(inArticleSlotId)) {
    units["in-article"] = { format: "in-article", clientId, slotId: inArticleSlotId };
  }

  const multiplexSlotId = env.multiplexSlotId?.trim() ?? "";
  if (SLOT_ID_PATTERN.test(multiplexSlotId)) {
    units.multiplex = { format: "multiplex", clientId, slotId: multiplexSlotId };
  }

  return Object.keys(units).length > 0 ? units : null;
}
