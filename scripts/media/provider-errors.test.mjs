import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderFailure } from "./provider-errors.mjs";

test("YouTube bot-check text is not misreported as mandatory login", () => {
  const failure = classifyProviderFailure(
    "youtube",
    "ERROR: [youtube] Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.",
  );
  assert.match(failure.message, /^SOURCE_CHALLENGE:/);
  assert.doesNotMatch(failure.message, /^AUTH_REQUIRED:/);
  assert.match(failure.message, /does not by itself mean that your personal account must sign in/i);
});

test("genuinely age-gated content remains an authentication requirement", () => {
  const failure = classifyProviderFailure("youtube", "Sign in to confirm your age");
  assert.match(failure.message, /^AUTH_REQUIRED:/);
});

test("CAPTCHA, bot-check, and blocked-IP diagnostics have one retryable classification", () => {
  for (const detail of [
    "captcha required",
    "IP address is blocked",
    "Sign in to confirm you are not a bot",
  ]) {
    const failure = classifyProviderFailure("youtube", detail);
    assert.match(failure.message, /^SOURCE_CHALLENGE:/, detail);
  }
});

test("rate limiting stays distinct from authentication failures", () => {
  const failure = classifyProviderFailure("SoundCloud", "HTTP Error 429: Too Many Requests");
  assert.match(failure.message, /^RATE_LIMITED:/);
});

test("Audiomack legacy JSON errors identify a provider resolver problem", () => {
  const failure = classifyProviderFailure("audiomack", '[audiomack] song: Failed to parse JSON (caused by JSONDecodeError("Expecting value"))');
  assert.match(failure.message, /^SOURCE_UNAVAILABLE:/);
  assert.match(failure.message, /Audiomack returned an empty or invalid JSON response from its track resolver/i);
  assert.doesNotMatch(failure.message, /^AUTH_REQUIRED:/);
});

test("Audiomack server errors are surfaced as source resolver failures", () => {
  const failure = classifyProviderFailure("Audiomack", "Unable to get track metadata: HTTP Error 500: Internal Server Error");
  assert.match(failure.message, /^SOURCE_UNAVAILABLE:/);
  assert.match(failure.message, /not proof that the URL is invalid or that an account is required/i);
});


test("Audiomack album invalid-track errors are a resolver failure, not an invalid user URL", () => {
  const failure = classifyProviderFailure("audiomack", "ERROR: [audiomack:album] Invalid url for track 0 of album url https://audiomack.com/evadolee/album/promise-land");
  assert.match(failure.message, /^SOURCE_UNAVAILABLE:/);
  assert.match(failure.message, /legacy music endpoint rejected/i);
  assert.doesNotMatch(failure.message, /evadolee/);
});

test("no downloadable format is not confused with an unsupported URL", () => {
  assert.match(classifyProviderFailure("Bandcamp", "Requested format is not available").message, /^NO_DOWNLOADABLE_FORMAT:/);
  assert.match(classifyProviderFailure("Unknown", "Unsupported URL").message, /^UNSUPPORTED_SOURCE:/);
});

test("provider diagnostics are URL-redacted, bounded, and newline-safe", () => {
  const failure = classifyProviderFailure("Example", "extract failed https://private.example/path?token=secret\\nnext " + "x".repeat(1200));
  assert.doesNotMatch(failure.message, /https:\/\/private\.example|token=secret|\\n/);
  assert.ok(failure.message.length < 1000);
});

test("Audiomack missing audio URL is not misreported as generic server failure", () => {
  for (const detail of ["Unable to extract audio url", "Unable to extract Song slug"]) {
    const error = classifyProviderFailure("audiomack", detail);
    assert.match(error.message, /^NO_DOWNLOADABLE_FORMAT:/);
    assert.match(error.message, /Audiomack's audio resolver did not return a downloadable file/);
  }
});
