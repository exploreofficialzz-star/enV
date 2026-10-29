import test from "node:test";
import assert from "node:assert/strict";
import { shortMusicFailureReason, summarizeMusicDownloadFailures } from "./music-failure-summary.ts";

const audiomackError = "Audiomack supplied song metadata but its current audio resolver did not return a usable file URL. The song may be playable on Audiomack without permitting portable file export, or its public resolver may have changed. This is not a broken album link. Use a creator-authorized direct audio file or the provider's permitted download option.";

test("twelve repeated Audiomack failures become one readable reason and twelve track names", () => {
  const titles = ["MARCH AM", "AZAMAN", "HEHEHE", "YAYO", "BENIN BOYS", ...Array.from({length:7}, (_, i) => `Track ${i + 6}`)];
  const summary = summarizeMusicDownloadFailures(titles.map(title => ({ title, message: audiomackError })));
  assert.equal(summary.heading, "12 tracks could not be downloaded.");
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0].count, 12);
  assert.deepEqual(summary.groups[0].titles, titles);
  assert.equal(summary.groups[0].reason, "Audiomack did not provide a downloadable audio file.");
  assert.equal(shortMusicFailureReason("NO_DOWNLOADABLE_FORMAT: Audiomack\'s audio resolver did not return a downloadable file."), summary.groups[0].reason);
});

test("different failures stay distinct and common cause is first", () => {
  const summary = summarizeMusicDownloadFailures([
    { title: "A", message: "RATE_LIMITED: Too many requests" },
    { title: "B", message: "NO_DOWNLOADABLE_FORMAT: no downloadable format" },
    { title: "C", message: "NO_DOWNLOADABLE_FORMAT: no downloadable format" },
  ]);
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.groups[0].count, 2);
  assert.equal(summary.groups[1].count, 1);
});

test("one failure stays singular, unknown diagnostics and URLs are bounded and sanitized", () => {
  const summary = summarizeMusicDownloadFailures([{title:"ONE",message:"Unexpected failure at https://host.test/secret?token=abc " + "z".repeat(300)}]);
  assert.equal(summary.heading,"1 track could not be downloaded.");
  assert.doesNotMatch(summary.groups[0].reason, /token=abc/);
  assert.ok(summary.groups[0].reason.length <= 130);
  assert.equal(shortMusicFailureReason(""), "The track could not be downloaded.");
});
