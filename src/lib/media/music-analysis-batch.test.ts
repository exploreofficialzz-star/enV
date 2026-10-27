import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalMusicBatch,
  countLocalMusicBatchItems,
  finalizeLocalMusicBatch,
  localMusicBatchExport,
  MUSIC_LOCAL_BATCH_LIMITS,
  recoverLocalMusicBatch,
  transitionLocalMusicBatchItem,
  updateLocalMusicBatchItem,
  type LocalMusicFileDescriptor,
} from "./music-analysis-batch.ts";

function file(name: string, sizeBytes = 1024, lastModified = 1): LocalMusicFileDescriptor {
  return { name, sizeBytes, lastModified, mimeType: "audio/wav", relativePath: name };
}

test("local batch preflight enforces file count and combined-byte limits before processing", () => {
  assert.throws(() => createLocalMusicBatch([]), /at least one audio file/);
  assert.throws(() => createLocalMusicBatch(Array.from({ length: 21 }, (_, i) => file(`track-${i}.wav`))), /at most 20 files/);
  assert.throws(() => createLocalMusicBatch([file("a.wav", MUSIC_LOCAL_BATCH_LIMITS.maxTotalBytes), file("b.wav", 1)]), /200 MiB total batch limit/);
});

test("local batch preflight marks unsupported, empty, oversized and repeated selections independently", () => {
  const batch = createLocalMusicBatch([
    file("valid.wav"),
    file("empty.wav", 0),
    file("oversized.wav", MUSIC_LOCAL_BATCH_LIMITS.maxFileBytes + 1),
    file("picture.png"),
    file("valid.wav"),
  ], { id: "batch-test", now: "2026-10-27T00:00:00.000Z" });

  assert.equal(batch.items[0]?.status, "queued");
  assert.equal(batch.items[1]?.status, "failed");
  assert.match(batch.items[1]?.error ?? "", /empty/);
  assert.equal(batch.items[2]?.status, "failed");
  assert.match(batch.items[2]?.error ?? "", /25 MiB/);
  assert.equal(batch.items[3]?.status, "failed");
  assert.match(batch.items[3]?.error ?? "", /Unsupported file type/);
  assert.equal(batch.items[4]?.status, "failed");
  assert.match(batch.items[4]?.error ?? "", /more than once/);
  assert.equal(batch.totalBytes, 1024 + (MUSIC_LOCAL_BATCH_LIMITS.maxFileBytes + 1) + 1024 + 1024);
});

test("local batch items follow only legal durable state transitions", () => {
  let batch = createLocalMusicBatch([file("track.wav")], { id: "transitions", now: "2026-10-27T00:00:00.000Z" });
  const id = batch.items[0]!.id;
  batch = transitionLocalMusicBatchItem(batch, id, "validating", { stage: "validation", progress: 0.05 }, "2026-10-27T00:00:01.000Z");
  batch = transitionLocalMusicBatchItem(batch, id, "decoding", { stage: "decode", progress: 0.2 }, "2026-10-27T00:00:02.000Z");
  batch = transitionLocalMusicBatchItem(batch, id, "analyzing", { stage: "dsp", progress: 0.35 }, "2026-10-27T00:00:03.000Z");
  batch = transitionLocalMusicBatchItem(batch, id, "completed", {}, "2026-10-27T00:00:04.000Z");
  assert.equal(batch.items[0]?.status, "completed");
  assert.equal(batch.items[0]?.progress, 1);
  assert.equal(batch.items[0]?.stage, "complete");
  assert.equal(batch.status, "running", "finalization is a separate explicit step");
  assert.equal(finalizeLocalMusicBatch(batch, "2026-10-27T00:00:05.000Z").status, "completed");
  assert.throws(() => transitionLocalMusicBatchItem(batch, id, "queued"), /Illegal local batch item transition/);
});

test("item progress cannot move backwards and retry clears stale outputs/errors", () => {
  let batch = createLocalMusicBatch([file("track.wav")], { id: "retry", now: "2026-10-27T00:00:00.000Z" });
  const id = batch.items[0]!.id;
  batch = transitionLocalMusicBatchItem(batch, id, "validating", { progress: 0.2 });
  batch = updateLocalMusicBatchItem(batch, id, { progress: 0.1, error: "temporary note" });
  assert.equal(batch.items[0]?.progress, 0.2);
  batch = transitionLocalMusicBatchItem(batch, id, "failed", { error: "decoder unavailable", stage: "decode" });
  batch = transitionLocalMusicBatchItem(batch, id, "queued");
  assert.equal(batch.items[0]?.status, "queued");
  assert.equal(batch.items[0]?.progress, 0);
  assert.equal(batch.items[0]?.error, null);
  assert.equal(batch.items[0]?.result, null);
  assert.equal(batch.items[0]?.sourceSha256, null);
});

test("batch counts and partial-success state are derived from item records", () => {
  let batch = createLocalMusicBatch([file("ok.wav"), file("bad.mp3", 0), file("retry.wav")], { id: "counts" });
  const [ok, bad, retry] = batch.items;
  batch = transitionLocalMusicBatchItem(batch, ok!.id, "validating");
  batch = transitionLocalMusicBatchItem(batch, ok!.id, "decoding");
  batch = transitionLocalMusicBatchItem(batch, ok!.id, "analyzing");
  batch = transitionLocalMusicBatchItem(batch, ok!.id, "completed");
  batch = transitionLocalMusicBatchItem(batch, retry!.id, "validating");
  batch = transitionLocalMusicBatchItem(batch, retry!.id, "failed", { error: "corrupt media" });
  const counts = countLocalMusicBatchItems(batch);
  assert.deepEqual(counts, { total: 3, queued: 0, running: 0, waitingForFile: 0, completed: 1, failed: 2, canceled: 0 });
  assert.equal(finalizeLocalMusicBatch(batch).status, "completed_with_errors");
  assert.equal(bad?.status, "failed");
});

test("reload recovery never claims interrupted work completed and preserves successful results", () => {
  let batch = createLocalMusicBatch([file("completed.wav"), file("interrupted.wav")], { id: "recovery" });
  const completedId = batch.items[0]!.id;
  const interruptedId = batch.items[1]!.id;
  batch = transitionLocalMusicBatchItem(batch, completedId, "validating");
  batch = transitionLocalMusicBatchItem(batch, completedId, "decoding");
  batch = transitionLocalMusicBatchItem(batch, completedId, "analyzing");
  batch = transitionLocalMusicBatchItem(batch, completedId, "completed");
  batch = transitionLocalMusicBatchItem(batch, interruptedId, "validating");
  batch = transitionLocalMusicBatchItem(batch, interruptedId, "decoding");
  const recovered = recoverLocalMusicBatch(batch, "2026-10-27T01:00:00.000Z");
  assert.equal(recovered.status, "paused");
  assert.equal(recovered.items[0]?.status, "completed");
  assert.equal(recovered.items[0]?.progress, 1);
  assert.equal(recovered.items[1]?.status, "waiting_for_file");
  assert.equal(recovered.items[1]?.progress, 0);
  assert.match(recovered.items[1]?.error ?? "", /select the original file again/);
});

test("batch manifest records partial failures and never fabricates result files", () => {
  let batch = createLocalMusicBatch([file("done.wav"), file("bad.wav", 0)], { id: "export" });
  const doneId = batch.items[0]!.id;
  batch = transitionLocalMusicBatchItem(batch, doneId, "validating");
  batch = transitionLocalMusicBatchItem(batch, doneId, "decoding");
  batch = transitionLocalMusicBatchItem(batch, doneId, "analyzing");
  batch = transitionLocalMusicBatchItem(batch, doneId, "completed", {
    sourceSha256: "ab".repeat(32),
    result: null,
  });
  batch = finalizeLocalMusicBatch(batch, "2026-10-27T00:01:00.000Z");
  const manifest = localMusicBatchExport(batch, "2026-10-27T00:02:00.000Z");
  assert.equal(manifest.schema_version, "env.music-analysis-batch.v1");
  assert.equal(manifest.execution_mode, "browser_local");
  assert.equal(manifest.status, "completed_with_errors");
  assert.equal(manifest.counts.completed, 1);
  assert.equal(manifest.counts.failed, 1);
  assert.equal(manifest.items[0]?.result_path, null, "a result file is named only when the item has persisted output");
  assert.equal(manifest.items[1]?.result_path, null);
  assert.match(manifest.note, /No source audio was uploaded/);
});
