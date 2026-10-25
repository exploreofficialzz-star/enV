import test from "node:test";
import assert from "node:assert/strict";
import { shouldTryGenericExtractor, genericExtractorArgs } from "./extraction-strategy.mjs";

test("retries generic HTML5 extraction after outdated Audiomack track metadata JSON failure", () => {
  const error = new Error("SOURCE_UNAVAILABLE: Audiomack returned an empty or invalid JSON response from its track resolver while resolving public metadata.");
  assert.equal(shouldTryGenericExtractor(error), true);
  assert.deepEqual(genericExtractorArgs(["--dump-single-json", "https://audiomack.com/artist/song/track"]),
    ["--ies", "generic,default", "--dump-single-json", "https://audiomack.com/artist/song/track"]);
});

test("generic extraction can retry unsupported public song pages without a provider key", () => {
  assert.equal(shouldTryGenericExtractor(new Error("UNSUPPORTED_SOURCE: Boomplay extractor cannot resolve the URL")), true);
  assert.equal(shouldTryGenericExtractor(new Error("NO_DOWNLOADABLE_FORMAT: no downloadable audio format")), true);
});

test("generic extraction never bypasses account/DRM, bot protection, network limits, or playlist semantics", () => {
  for (const code of ["AUTH_REQUIRED", "SOURCE_CHALLENGE", "DOWNLOAD_NOT_PERMITTED", "PRIVATE_CONTENT", "RATE_LIMITED", "NETWORK_TIMEOUT", "SERVER_CAPACITY"]) {
    assert.equal(shouldTryGenericExtractor(new Error(code + ": blocked")), false, code);
  }
  assert.equal(shouldTryGenericExtractor(new Error("SOURCE_UNAVAILABLE: invalid metadata JSON"), true), true);
  assert.equal(shouldTryGenericExtractor(new Error("PROVIDER_ERROR: bad request"), true), false);
  assert.equal(shouldTryGenericExtractor(new Error("SOURCE_UNAVAILABLE: empty metadata JSON"), true), false);
});
