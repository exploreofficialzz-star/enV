import test from "node:test";
import assert from "node:assert/strict";
import { isMediaProvider, normalizeMediaError } from "./shared-media.ts";

test("media provider registry accepts named and generic providers", () => {
  for (const value of ["generic", "youtube", "tiktok", "instagram", "facebook", "x"]) {
    assert.equal(isMediaProvider(value), true);
  }
  assert.equal(isMediaProvider("unknown"), false);
});

test("media errors retain safe typed fields", () => {
  assert.deepEqual(normalizeMediaError({ code: "RANGE_UNSUPPORTED", message: "No range", retryable: true }), {
    code: "RANGE_UNSUPPORTED", message: "No range", retryable: true, recovery: undefined,
  });
});
