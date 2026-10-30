import test from "node:test";
import assert from "node:assert/strict";
import { illustrativeLayerForDepth, observerTravelMetres, OBSERVER_BOUNDS_METRES } from "./observer.ts";

test("observer wheel and pinch movement are continuous, finite and bounded", () => {
  assert.equal(observerTravelMetres(0, "wheel"), 0);
  assert.equal(observerTravelMetres(100, "wheel"), -1.2);
  assert.equal(observerTravelMetres(-100, "wheel"), 1.2);
  assert.equal(observerTravelMetres(50, "pinch"), 1.1);
  assert.equal(observerTravelMetres(10000, "pinch"), 5);
  assert.equal(observerTravelMetres(-10000, "pinch"), -5);
  assert.throws(() => observerTravelMetres(Infinity, "wheel"), /Invalid/);
});
test("depth labels remain explicitly illustrative and never imply mapped geology", () => {
  assert.match(illustrativeLayerForDepth(0), /Surface/);
  for (const depth of [0.01, 0.6, 2.2, 5.2, 12]) {
    assert.match(illustrativeLayerForDepth(depth), /Illustrative/);
  }
  assert.throws(() => illustrativeLayerForDepth(Number.NaN), /Invalid/);
  assert.equal(OBSERVER_BOUNDS_METRES.minHeight, -12);
});
