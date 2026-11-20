export const REWARDED_AD_PROGRESS_KEY = "env.ads.rewarded-progress.v1";
export const REWARDED_AD_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000;
export const REWARDED_ADS_BEFORE_AD_FREE_OFFER = 3;

export type RewardedAdProgress = {
  periodStartedAt: number;
  completed: number;
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
  return Number.isSafeInteger(record.periodStartedAt) &&
    Number.isSafeInteger(record.completed) &&
    (record.completed as number) >= 0 &&
    (record.adFreeOfferShownAt === null || Number.isSafeInteger(record.adFreeOfferShownAt));
}

export function readRewardedAdProgress(storage: StorageLike, now = Date.now()): RewardedAdProgress {
  const empty: RewardedAdProgress = { periodStartedAt: now, completed: 0, adFreeOfferShownAt: null };
  try {
    const raw = storage.getItem(REWARDED_AD_PROGRESS_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!validProgress(parsed)) return empty;
    const expired = now < parsed.periodStartedAt || now - parsed.periodStartedAt >= REWARDED_AD_PERIOD_MS;
    return expired ? empty : parsed;
  } catch {
    return empty;
  }
}

/** Call only after the provider confirms a granted reward and completed video. */
export function recordRewardedAdCompletion(
  storage: StorageLike,
  now = Date.now(),
): RewardedAdProgressResult {
  const current = readRewardedAdProgress(storage, now);
  const completed = current.completed + 1;
  const shouldShowAdFreeOffer = completed >= REWARDED_ADS_BEFORE_AD_FREE_OFFER &&
    current.adFreeOfferShownAt === null;
  const progress: RewardedAdProgress = {
    ...current,
    completed,
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
