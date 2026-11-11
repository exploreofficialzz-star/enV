import assert from "node:assert/strict";
import test from "node:test";
import { ADSTERRA_BANNER_UNITS, ADSTERRA_NATIVE_BANNER } from "./adsterra.ts";

test("only the selected responsive and medium-rectangle banner placements are active in the first rollout", () => {
  assert.deepEqual(Object.keys(ADSTERRA_BANNER_UNITS).sort(), ["300x250", "320x50", "728x90"]);
  assert.equal(ADSTERRA_BANNER_UNITS["300x250"].placementId, "32202127");
  assert.equal(ADSTERRA_BANNER_UNITS["320x50"].placementId, "32202130");
  assert.equal(ADSTERRA_BANNER_UNITS["728x90"].placementId, "32202131");
});

test("native banner uses the publisher-supplied placement, container and script", () => {
  assert.equal(ADSTERRA_NATIVE_BANNER.placementId, "32202120");
  assert.equal(ADSTERRA_NATIVE_BANNER.containerId, "container-78a40bc1026f57ead96fcab42af6c0b0");
  assert.equal(ADSTERRA_NATIVE_BANNER.src, "https://bauval.org/21/78a40bc1026f57ead96fcab42af6c0b0");
});
