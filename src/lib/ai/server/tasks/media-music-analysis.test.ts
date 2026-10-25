import assert from "node:assert/strict";
import test from "node:test";
import { musicAnalysisTask } from "./media.ts";

const audioBase64 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 1)]).toString("base64");

test("music analysis task requires a bounded, recognizable audio input", () => {
  const invalid = musicAnalysisTask.plan({
    audioBase64: "not-audio-data-".repeat(12),
    mimeType: "audio/mpeg",
    sampledSeconds: 60,
  }, { boundary: "bUNITTESTBOUNDARY" });
  assert.equal(invalid.ok, false);
});

test("music analysis task sends the excerpt as audio and records a deterministic schema contract", () => {
  const plan = musicAnalysisTask.plan({
    audioBase64,
    mimeType: "audio/mpeg",
    filename: "sample-afrobeats.mp3",
    sampledSeconds: 60,
  }, { boundary: "bUNITTESTBOUNDARY" });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(musicAnalysisTask.capability, "AUDIO_ANALYSIS");
  assert.equal(musicAnalysisTask.privacy, "sensitive");
  assert.equal(musicAnalysisTask.cacheTtlSeconds, null);
  assert.ok(plan.prepared.user.some((part) => part.type === "audio" && part.mimeType === "audio/mpeg"));
  assert.ok(plan.prepared.system.includes("untrusted user data"));
  assert.ok(plan.prepared.system.includes("only a JSON object"));
  assert.ok(plan.prepared.inputBytes && plan.prepared.inputBytes > 0);
});
