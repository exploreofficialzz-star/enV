import test from "node:test";
import assert from "node:assert/strict";
import { aria2YtdlpArgs, shouldTryAria2Transfer } from "./transfer-alternatives.mjs";

test("aria2c is a bounded HTTP transfer fallback and not a new extractor", () => {
  const flags = aria2YtdlpArgs(["--format", "bestaudio", "https://example.org/audio"]);
  assert.deepEqual(flags.slice(0, 4), [
    "--downloader", "http,https:aria2c",
    "--downloader-args", "aria2c:--max-connection-per-server=4 --split=4 --min-split-size=2M --max-tries=2 --retry-wait=1",
  ]);
  assert.equal(flags.at(-1), "https://example.org/audio");
});
test("transport errors retry with aria2c; metadata, auth and throttling errors do not", () => {
  for (const code of ["NETWORK_TIMEOUT: source timeout", "SEGMENT_FAILED: broken fragment",
    "PROVIDER_ERROR: network connection reset", "PROVIDER_ERROR: HTTP Error 502"]) {
    assert.equal(shouldTryAria2Transfer(new Error(code)), true, code);
  }
  for (const code of ["AUTH_REQUIRED: Login", "SOURCE_CHALLENGE: bot", "RATE_LIMITED: HTTP 429",
    "DOWNLOAD_NOT_PERMITTED: 403", "SOURCE_UNAVAILABLE: invalid json metadata",
    "PROVIDER_ERROR: bad metadata", "NO_DOWNLOADABLE_FORMAT: DRM"]) {
    assert.equal(shouldTryAria2Transfer(new Error(code)), false, code);
  }
});
