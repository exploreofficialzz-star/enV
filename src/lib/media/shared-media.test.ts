import test from "node:test";
import assert from "node:assert/strict";
import { isMediaProvider, mediaErrorMessage, normalizeMediaError } from "./shared-media.ts";

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

test("boolean backend error flags are never shown as user-facing messages", () => {
  assert.equal(mediaErrorMessage({ error: true }, 503), "URL media service returned HTTP 503.");
  assert.equal(mediaErrorMessage({ error: false }, 400), "URL media service returned HTTP 400.");
  assert.equal(mediaErrorMessage({ error: true, message: "Processor is starting." }, 503), "Processor is starting.");
  assert.equal(mediaErrorMessage({ error: "Video is unavailable." }, 404), "Video is unavailable.");
  assert.equal(mediaErrorMessage("Gateway could not reach the processor.", 500), "Gateway could not reach the processor.");
  assert.equal(mediaErrorMessage('{"error":true}', 500), "URL media service returned HTTP 500.");
  assert.equal(mediaErrorMessage("<!doctype html><html><body>error</body></html>", 500), "URL media service returned HTTP 500.");
});
