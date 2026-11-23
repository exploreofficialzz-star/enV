export const AD_SUPPORTED_VISIT_PROGRESS_KEY = "env.ads.ad-supported-visits.v1";
export const AD_SUPPORTED_VISIT_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000;
export const AD_SUPPORTED_VISITS_BEFORE_AD_FREE_OFFER = 3;
const MAX_STORED_VISITS = 100;
const TOOL_SESSION_PREFIX = "env.ads.adsterra-session.v1:";
const inMemorySessionVisits = new Set<string>();

export type AdSupportedVisitProgress = {
  visitedAt: number[];
  adFreeOfferShownAt: number | null;
};

export type AdSupportedVisitResult = {
  progress: AdSupportedVisitProgress;
  shouldShowAdFreeOffer: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function validProgress(value: unknown): value is AdSupportedVisitProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.visitedAt) &&
    record.visitedAt.every((timestamp) => Number.isSafeInteger(timestamp) && (timestamp as number) >= 0) &&
    (record.adFreeOfferShownAt === null ||
      (Number.isSafeInteger(record.adFreeOfferShownAt) && (record.adFreeOfferShownAt as number) >= 0));
}

function emptyProgress(): AdSupportedVisitProgress {
  return { visitedAt: [], adFreeOfferShownAt: null };
}

export function readAdSupportedVisitProgress(storage: StorageLike, now = Date.now()): AdSupportedVisitProgress {
  try {
    const raw = storage.getItem(AD_SUPPORTED_VISIT_PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed: unknown = JSON.parse(raw);
    if (!validProgress(parsed)) return emptyProgress();
    const cutoff = now - AD_SUPPORTED_VISIT_PERIOD_MS;
    const visitedAt = parsed.visitedAt
      .filter((timestamp) => timestamp > cutoff && timestamp <= now)
      .sort((left, right) => left - right)
      .slice(-MAX_STORED_VISITS);
    const offerTimestamp = parsed.adFreeOfferShownAt;
    const adFreeOfferShownAt = offerTimestamp !== null && offerTimestamp > cutoff && offerTimestamp <= now
      ? offerTimestamp
      : null;
    return { visitedAt, adFreeOfferShownAt };
  } catch {
    return emptyProgress();
  }
}

/** Record that an Adsterra placement script loaded on an explicitly consented tool visit.
 * This is a local preference cadence only: it is not a publisher-confirmed impression,
 * click, or rewarded-video completion, and must never be used as billing evidence. */
export function recordAdSupportedVisit(storage: StorageLike, now = Date.now()): AdSupportedVisitResult {
  const current = readAdSupportedVisitProgress(storage, now);
  const visitedAt = [...current.visitedAt, now].slice(-MAX_STORED_VISITS);
  const shouldShowAdFreeOffer = visitedAt.length >= AD_SUPPORTED_VISITS_BEFORE_AD_FREE_OFFER &&
    current.adFreeOfferShownAt === null;
  const progress: AdSupportedVisitProgress = {
    visitedAt,
    adFreeOfferShownAt: shouldShowAdFreeOffer ? now : current.adFreeOfferShownAt,
  };
  storage.setItem(AD_SUPPORTED_VISIT_PROGRESS_KEY, JSON.stringify(progress));
  return { progress, shouldShowAdFreeOffer };
}

/** A tool counts once per browser tab session after an Adsterra placement script loads.
 * Session markers are separate from the rolling local visit history. */
export function recordBrowserAdSupportedVisit(toolId: string, now = Date.now()): AdSupportedVisitResult | null {
  if (typeof window === "undefined" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(toolId)) return null;
  const sessionKey = TOOL_SESSION_PREFIX + toolId;
  try {
    if (window.sessionStorage.getItem(sessionKey) === "1" || inMemorySessionVisits.has(sessionKey)) return null;
    window.sessionStorage.setItem(sessionKey, "1");
    inMemorySessionVisits.add(sessionKey);
    return recordAdSupportedVisit(window.localStorage, now);
  } catch {
    // When durable browser storage is unavailable, do not count a visit or block tool access.
    return null;
  }
}
