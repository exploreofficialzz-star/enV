import assert from "node:assert/strict";
import test from "node:test";
import {
  REWARDED_AD_PERIOD_MS,
  REWARDED_AD_PROGRESS_KEY,
  recordRewardedAdCompletion,
  readRewardedAdProgress,
} from "./rewarded-progress.ts";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(REWARDED_AD_PROGRESS_KEY, initial);
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("the ad-free offer appears exactly once after three verified completions", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  assert.equal(recordRewardedAdCompletion(storage, now).shouldShowAdFreeOffer, false);
  assert.equal(recordRewardedAdCompletion(storage, now + 1).shouldShowAdFreeOffer, false);
  const third = recordRewardedAdCompletion(storage, now + 2);
  assert.equal(third.shouldShowAdFreeOffer, true);
  assert.equal(third.progress.completed, 3);
  assert.equal(recordRewardedAdCompletion(storage, now + 3).shouldShowAdFreeOffer, false);
});

test("rewarded progress resets after the rolling 30-day period", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  recordRewardedAdCompletion(storage, now);
  const afterPeriod = readRewardedAdProgress(storage, now + REWARDED_AD_PERIOD_MS);
  assert.equal(afterPeriod.completed, 0);
  assert.equal(afterPeriod.periodStartedAt, now + REWARDED_AD_PERIOD_MS);
});

test("malformed stored progress is ignored instead of blocking ad access", () => {
  const storage = memoryStorage("{not-json");
  assert.deepEqual(readRewardedAdProgress(storage, 1_800_000_000_000), {
    periodStartedAt: 1_800_000_000_000,
    completed: 0,
    adFreeOfferShownAt: null,
  });
});
