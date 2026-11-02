import assert from "node:assert/strict";
import test from "node:test";
import { runMusicAnalysisWorkerCore } from "./music-analysis-worker-core.ts";

test("worker DSP pipeline returns schema-valid local reports and real progress", async () => {
  const sampleRate = 8000;
  const pcm = Float32Array.from({ length: sampleRate * 4 }, (_, i) => (
    0.45 * Math.sin(2 * Math.PI * 440 * i / sampleRate)
    + 0.1 * Math.sin(2 * Math.PI * 880 * i / sampleRate)
  ));
  const progress: number[] = [];
  const result = await runMusicAnalysisWorkerCore({
    channels: [pcm],
    sampleRate,
    fileName: "worker-fixture.wav",
    fileSizeBytes: pcm.byteLength,
    mimeType: "audio/wav",
    sourceSha256: "bc".repeat(32),
  }, (fraction) => progress.push(fraction));

  assert.equal(result.analysis.schema_version, "env.music-analysis.v2");
  assert.equal(result.analysis.audio.duration_seconds, 4);
  assert.equal(result.analysis.fingerprint.file_sha256, "bc".repeat(32));
  assert.equal(result.analysis.classification.genre, null);
  assert.equal(result.analysis.classification.status, "human_review_required");
  assert.equal(result.datasetAnalysis.schema_version, "env.music-dataset-analysis.v2");
  assert.equal(result.datasetAnalysis.processing.uses_remote_api, false);
  assert.equal(result.datasetAnalysis.processing.uses_hosted_model, false);
  assert.equal(result.datasetAnalysis.processing.model_inference, false);
  assert.ok(progress.length > 0, "worker clients should receive DSP stage progress");
  assert.ok(progress.every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1));
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index]! >= progress[index - 1]!, "worker progress should not regress within a track");
  }
});
