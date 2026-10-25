import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderFailure } from "./provider-errors.mjs";

test("provider extractor errors are classified into actionable shared messages", () => {
  assert.match(classifyProviderFailure("audiomack", '[audiomack] song: Failed to parse JSON (caused by JSONDecodeError("Expecting value"))').message,
    /^SOURCE_UNAVAILABLE: Audiomack's legacy extractor API is returning an empty or invalid JSON response/);
  assert.match(classifyProviderFailure("SoundCloud", "HTTP Error 429: Too Many Requests").message, /^RATE_LIMITED:/);
  assert.match(classifyProviderFailure("YouTube", "Sign in to confirm you’re not a bot").message, /^AUTH_REQUIRED:/);
  assert.match(classifyProviderFailure("Bandcamp", "Requested format is not available").message, /^NO_DOWNLOADABLE_FORMAT:/);
  assert.match(classifyProviderFailure("Unknown", "Unsupported URL").message, /^UNSUPPORTED_SOURCE:/);
});

test("provider diagnostics are URL-redacted, bounded, and newline-safe", () => {
  const failure = classifyProviderFailure("Example", "extract failed https://private.example/path?token=secret\nnext " + "x".repeat(1200));
  assert.doesNotMatch(failure.message, /https:\/\/private\.example|token=secret|\n/);
  assert.ok(failure.message.length < 1000);
});
