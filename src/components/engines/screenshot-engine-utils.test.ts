import test from "node:test";
import assert from "node:assert/strict";
import { frameSpec, parseScreenshotToolId, validateImageFile } from "./screenshot-engine-utils.ts";

test("parses every screenshot workflow", () => {
  const ids = ["iphone-screenshot-frame","android-screenshot-mockup","ipad-screenshot-beautifier","tablet-device-presentation","macbook-device-collage","chrome-screenshot-annotation","google-play-screenshot-redaction"];
  assert.deepEqual(ids.map(parseScreenshotToolId).map(x => x.workflow), ["frame","mockup","beautifier","presentation","collage","annotation","redaction"]);
});

test("frame specs are concrete", () => {
  for (const family of ["iphone","ipad","macbook","chrome","apple-watch"] as const) {
    const spec = frameSpec(family); assert(spec.width > 0 && spec.height > 0 && spec.bezel > 0);
  }
});

test("image validation rejects bad input", () => {
  assert.throws(() => validateImageFile(null));
  assert.throws(() => validateImageFile({ type: "text/plain", size: 10 }));
  assert.throws(() => validateImageFile({ type: "image/png", size: 21 * 1024 * 1024 }));
  assert.doesNotThrow(() => validateImageFile({ type: "image/png", size: 100 }));
});
