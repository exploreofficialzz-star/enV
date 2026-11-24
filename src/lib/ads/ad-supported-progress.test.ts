import assert from "node:assert/strict";
import test from "node:test";
import {
  AD_SUPPORTED_VISIT_PERIOD_MS,
  AD_SUPPORTED_VISIT_PROGRESS_KEY,
  recordAdSupportedVisit,
  readAdSupportedVisitProgress,
} from "./ad-supported-progress.ts";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(AD_SUPPORTED_VISIT_PROGRESS_KEY, initial);
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("the ad-free preference offer appears after three ad-supported visits in the rolling 30-day window", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  assert.equal(recordAdSupportedVisit(storage, now).shouldShowAdFreeOffer, false);
  assert.equal(recordAdSupportedVisit(storage, now + 1).shouldShowAdFreeOffer, false);
  const third = recordAdSupportedVisit(storage, now + 2);
  assert.equal(third.shouldShowAdFreeOffer, true);
  assert.deepEqual(third.progress.visitedAt, [now, now + 1, now + 2]);
  assert.equal(recordAdSupportedVisit(storage, now + 3).shouldShowAdFreeOffer, false);
});

test("visits expire individually after 30 days", () => {
  const storage = memoryStorage();
  const start = 1_800_000_000_000;
  recordAdSupportedVisit(storage, start);
  recordAdSupportedVisit(storage, start + AD_SUPPORTED_VISIT_PERIOD_MS - 1);
  const now = start + AD_SUPPORTED_VISIT_PERIOD_MS + 1_000;
  const next = recordAdSupportedVisit(storage, now);
  assert.equal(next.shouldShowAdFreeOffer, false);
  assert.deepEqual(next.progress.visitedAt, [start + AD_SUPPORTED_VISIT_PERIOD_MS - 1, now]);
});

test("the offer is shown only once in a rolling 30-day window", () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  recordAdSupportedVisit(storage, now);
  recordAdSupportedVisit(storage, now + 1);
  assert.equal(recordAdSupportedVisit(storage, now + 2).shouldShowAdFreeOffer, true);
  assert.equal(recordAdSupportedVisit(storage, now + 3).shouldShowAdFreeOffer, false);
  const nextWindow = now + AD_SUPPORTED_VISIT_PERIOD_MS + 10;
  recordAdSupportedVisit(storage, nextWindow);
  recordAdSupportedVisit(storage, nextWindow + 1);
  assert.equal(recordAdSupportedVisit(storage, nextWindow + 2).shouldShowAdFreeOffer, true);
});

test("malformed progress is ignored rather than blocking access", () => {
  const storage = memoryStorage("{not-json");
  assert.deepEqual(readAdSupportedVisitProgress(storage, 1_800_000_000_000), {
    visitedAt: [],
    adFreeOfferShownAt: null,
  });
});
