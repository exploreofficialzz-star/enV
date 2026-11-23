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

test("the ad-free offer appears after three verified completions in the trailing 30 days", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  assert.equal(recordRewardedAdCompletion(storage, now).shouldShowAdFreeOffer, false);
  assert.equal(recordRewardedAdCompletion(storage, now + 1).shouldShowAdFreeOffer, false);
  const third = recordRewardedAdCompletion(storage, now + 2);
  assert.equal(third.shouldShowAdFreeOffer, true);
  assert.deepEqual(third.progress.completedAt, [now, now + 1, now + 2]);
  assert.equal(recordRewardedAdCompletion(storage, now + 3).shouldShowAdFreeOffer, false);
});

test("completions expire individually once they leave the trailing 30-day window", () => {
  const storage = memoryStorage();
  const start = 1_800_000_000_000;
  recordRewardedAdCompletion(storage, start);
  recordRewardedAdCompletion(storage, start + REWARDED_AD_PERIOD_MS - 1);

  const now = start + REWARDED_AD_PERIOD_MS + 1_000;
  const third = recordRewardedAdCompletion(storage, now);
  assert.equal(third.shouldShowAdFreeOffer, false);
  assert.deepEqual(third.progress.completedAt, [start + REWARDED_AD_PERIOD_MS - 1, now]);
});

test("the ad-free offer can appear again after its 30-day cooldown when three new completions qualify", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  recordRewardedAdCompletion(storage, now);
  recordRewardedAdCompletion(storage, now + 1);
  assert.equal(recordRewardedAdCompletion(storage, now + 2).shouldShowAdFreeOffer, true);

  const afterCooldown = now + REWARDED_AD_PERIOD_MS + 10;
  assert.equal(recordRewardedAdCompletion(storage, afterCooldown).shouldShowAdFreeOffer, false);
  assert.equal(recordRewardedAdCompletion(storage, afterCooldown + 1).shouldShowAdFreeOffer, false);
  assert.equal(recordRewardedAdCompletion(storage, afterCooldown + 2).shouldShowAdFreeOffer, true);
});

test("malformed stored progress is ignored instead of blocking ad access", () => {
  const storage = memoryStorage("{not-json");
  assert.deepEqual(readRewardedAdProgress(storage, 1_800_000_000_000), {
    completedAt: [],
    adFreeOfferShownAt: null,
  });
});
