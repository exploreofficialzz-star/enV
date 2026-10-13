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
  assert.equal(uuidValid("550e8400-e29b-61d4-a716-446655440000"), "Valid UUID v6");
  assert.equal(uuidValid("01890f3e-7c00-7000-8000-000000000000"), "Valid UUID v7");
  assert.equal(uuidValid("00000000-0000-0000-0000-000000000000"), "Valid Nil UUID");
  assert.equal(uuidValid("ffffffff-ffff-ffff-ffff-ffffffffffff"), "Valid Max UUID");
  assert.equal(HTTP_STATUS["429"], "Too Many Requests");
  assert.equal(HTTP_STATUS["503"], "Service Unavailable");
  assert.equal(MIME_TYPES.mp3, "audio/mpeg");
  assert.equal(MIME_TYPES.avif, "image/avif");
  assert.equal(MIME_TYPES.webm, "video/webm");
});


test("developer UUID validator accepts RFC variant/version layout and rejects malformed segment lengths", () => {
  assert.equal(uuidValid("550e8400-e29b-41d4-a716-446655440000"), "Valid UUID v4");
  assert.equal(uuidValid("550e8400-e29b-41d4-a716-4466554400000"), "Invalid UUID");
  assert.equal(uuidValid("550e8400-e29b-41d4-1716-446655440000"), "Invalid UUID");
});


test("strict shared decoder preserves URI plus and rejects invalid UTF-8/unpaired Unicode", () => {
  assert.equal(decodeData("a+b%2Bc", "uri"), "a+b+c");
  assert.throws(() => decodeData("/w==", "base64"), /not valid UTF-8/);
  assert.throws(() => decodeData("Zh==", "base64"), /non-canonical/);
  assert.throws(() => decodeData("\\ud800", "unicode"), /unpaired high surrogate/);
  assert.equal(decodeData("&#x1F680; &amp;lt; &quot;x&quot;", "html"), "🚀 &lt; \"x\"");
});
