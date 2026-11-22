export const REWARDED_AD_PROGRESS_KEY = "env.ads.rewarded-progress.v2";
export const REWARDED_AD_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000;
export const REWARDED_ADS_BEFORE_AD_FREE_OFFER = 3;
const MAX_STORED_COMPLETIONS = 100;

export type RewardedAdProgress = {
  completedAt: number[];
  adFreeOfferShownAt: number | null;
};

export type RewardedAdProgressResult = {
  progress: RewardedAdProgress;
  shouldShowAdFreeOffer: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function validProgress(value: unknown): value is RewardedAdProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.completedAt) &&
    record.completedAt.every((timestamp) => Number.isSafeInteger(timestamp) && (timestamp as number) >= 0) &&
    (record.adFreeOfferShownAt === null ||
      (Number.isSafeInteger(record.adFreeOfferShownAt) && (record.adFreeOfferShownAt as number) >= 0));
}

function emptyProgress(): RewardedAdProgress {
  return { completedAt: [], adFreeOfferShownAt: null };
}

export function readRewardedAdProgress(storage: StorageLike, now = Date.now()): RewardedAdProgress {
  try {
    const raw = storage.getItem(REWARDED_AD_PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed: unknown = JSON.parse(raw);
    if (!validProgress(parsed)) return emptyProgress();

    const cutoff = now - REWARDED_AD_PERIOD_MS;
    const completedAt = parsed.completedAt
      .filter((timestamp) => timestamp > cutoff && timestamp <= now)
      .sort((left, right) => left - right)
      .slice(-MAX_STORED_COMPLETIONS);
    const offerTimestamp = parsed.adFreeOfferShownAt;
    const adFreeOfferShownAt = offerTimestamp !== null &&
      offerTimestamp > cutoff &&
      offerTimestamp <= now
      ? offerTimestamp
      : null;
    return { completedAt, adFreeOfferShownAt };
  } catch {
    return emptyProgress();
  }
}

/** Call only after the provider confirms a granted reward and completed video. */
export function recordRewardedAdCompletion(
  storage: StorageLike,
  now = Date.now(),
): RewardedAdProgressResult {
  const current = readRewardedAdProgress(storage, now);
  const completedAt = [...current.completedAt, now].slice(-MAX_STORED_COMPLETIONS);
  const shouldShowAdFreeOffer = completedAt.length >= REWARDED_ADS_BEFORE_AD_FREE_OFFER &&
    current.adFreeOfferShownAt === null;
  const progress: RewardedAdProgress = {
    completedAt,
    adFreeOfferShownAt: shouldShowAdFreeOffer ? now : current.adFreeOfferShownAt,
  };
  storage.setItem(REWARDED_AD_PROGRESS_KEY, JSON.stringify(progress));
  return { progress, shouldShowAdFreeOffer };
}

export function recordBrowserRewardedAdCompletion(now = Date.now()): RewardedAdProgressResult | null {
  if (typeof window === "undefined") return null;
  try {
    return recordRewardedAdCompletion(window.localStorage, now);
  } catch {
    return null;
  }
}
