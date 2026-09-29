import test from "node:test";
import assert from "node:assert/strict";
import { decodeData, encodeData, uuidValid, HTTP_STATUS, MIME_TYPES } from "./developer-utils.ts";

test("developer data encoders round-trip unicode", () => {
  const input = "enV 🚀 — fast & reliable";
  assert.equal(decodeData(encodeData(input, "base64"), "base64"), input);
  assert.equal(decodeData(encodeData(input, "uri"), "uri"), input);
  assert.equal(decodeData(encodeData(input, "unicode"), "unicode"), input);
  assert.equal(decodeData(encodeData(input, "html"), "html"), input);
});

test("developer base64 rejects malformed input", () => {
  assert.throws(() => decodeData("not base64!", "base64"), /Invalid Base64/);
});

test("developer UUID validator and common MIME/status maps", () => {
  assert.equal(uuidValid("550e8400-e29b-41d4-a716-446655440000"), "Valid UUID v4");
  assert.equal(uuidValid("550e8400-e29b-61d4-a716-446655440000"), "Invalid UUID");
  assert.equal(HTTP_STATUS["429"], "Too Many Requests");
  assert.equal(HTTP_STATUS["503"], "Service Unavailable");
  assert.equal(MIME_TYPES.mp3, "audio/mpeg");
  assert.equal(MIME_TYPES.avif, "image/avif");
  assert.equal(MIME_TYPES.webm, "video/webm");
});
