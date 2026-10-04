import test from "node:test";
import assert from "node:assert/strict";
import { describeImageOperation } from "./operation-registry.ts";
import { assertSafeDimensions } from "./limits.ts";
import { aspectRatio } from "./decode-engine.ts";
import { getPlatformPreset, getPresetForImageOp } from "./platform-presets.ts";

test("aspect ratio reduces by gcd", () => {
  assert.equal(aspectRatio(1920, 1080), "16:9");
  assert.equal(aspectRatio(1000, 1000), "1:1");
});

test("image output guard rejects excessive pixels", () => {
  assert.throws(() => assertSafeDimensions(20_000, 20_000), /too large/);
  assert.equal(assertSafeDimensions(1000, 1000), 1_000_000);
});

test("operation families keep metadata cleaning executable", () => {
  assert.equal(describeImageOperation("exif-strip").family, "edit");
  assert.equal(describeImageOperation("image-image-metadata-inspector").family, "analysis");
  assert.equal(describeImageOperation("image-compressor").family, "optimization");
});

test("platform registry is data-driven", () => {
  assert.equal(getPlatformPreset("youtube", "banner")?.dimensions?.width, 2560);
  assert.equal(getPresetForImageOp("discord-banner-resizer")?.contentType, "banner");
  assert.equal(getPresetForImageOp("pinterest-banner-resizer")?.dimensions?.width, 1920, "Pinterest has a documented 16:9 profile cover");
  assert.equal(getPresetForImageOp("not-a-platform-tool"), undefined);
});
