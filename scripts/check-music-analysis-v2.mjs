import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const api = read("src/lib/media/music-dataset-api.server.ts");
const validation = read("src/lib/media/music-dataset-validation.ts");
const migration = read("migrations/0009_music_dataset.sql");
const analysisMigrations = read("src/lib/media/music-analysis-migration.ts");
const batch = read("src/lib/media/music-analysis-batch.ts");
const worker = read("src/lib/media/music-analysis.worker.ts");
const workerClient = read("src/lib/media/music-analysis.worker-client.ts");
const workerCore = read("src/lib/media/music-analysis-worker-core.ts");
const loudness = read("src/lib/media/music-loudness-report.ts");
const processor = read("scripts/media-processor.mjs");
const routes = [
  "server/routes/api/music-dataset/tracks.get.ts",
  "server/routes/api/music-dataset/tracks.post.ts",
  "server/routes/api/music-dataset/tracks/[id].get.ts",
  "server/routes/api/music-dataset/tracks/[id].delete.ts",
  "server/routes/api/music-dataset/runs/[id].get.ts",
].map(read).join("\n");

for (const marker of ["requireBillingUser", "isSameOriginRequest", "readJsonObject", "MAX_JSON_BYTES",
  "MAX_FEATURE_FRAMES", "sql.transaction", "consumeDatasetRateLimit",
  "MUSIC_DATASET_RATE_LIMITED", "idempotency_key", "user_id=$2", "source_audio_uploaded: false",
  "source_sha256_verified=false", "source_audio_uploaded: false"]) {
  assert.ok(api.includes(marker), `Private dataset API contract missing: ${marker}`);
}
assert.ok(!api.includes("request.formData()"), "Private dataset save must not accept original audio uploads.");
assert.ok(!api.includes("source_sha256_verified=true"), "Client-supplied hashes must never be represented as server-verified.");
for (const marker of ["validateMusicDatasetSaveBody", "MusicDatasetInputError", "env.music-analysis.v2",
  "env.music-dataset-analysis.v2", "MAX_FEATURE_FRAMES", "MAX_EVENTS", "idempotency_key", "sha256"]) {
  assert.ok(validation.includes(marker), `Dataset payload validation missing: ${marker}`);
}
for (const marker of ["music_tracks", "music_analysis_runs", "music_feature_frames", "music_analysis_events",
  "music_annotations", "music_collections", "music_collection_tracks", "music_dataset_api_limits",
  "idempotency_key", "source_sha256_verified"]) {
  assert.ok(migration.includes(marker), `Private dataset migration missing: ${marker}`);
}
for (const marker of ["migrateMusicAnalysisV1ToV2", "migrateMusicProfileV1ToV2",
  "migrateMusicDatasetAnalysisV1ToV2", "not-computed"]) {
  assert.ok(analysisMigrations.includes(marker), `V1-to-V2 migration missing: ${marker}`);
}
for (const marker of ["env.music-analysis-batch.v1", "MUSIC_LOCAL_BATCH_LIMITS", "transitionLocalMusicBatchItem",
  "recoverLocalMusicBatch", "saveLocalMusicBatch", "localMusicBatchExport"]) {
  assert.ok(batch.includes(marker), `Local batch engine missing: ${marker}`);
}
for (const marker of ["analyzeMusicInWorker", "Worker", "AbortSignal"]) {
  assert.ok(workerClient.includes(marker), `Worker client cancellation/dispatch contract missing: ${marker}`);
}
assert.ok(worker.includes("runMusicAnalysisWorkerCore") && worker.includes("workerScope.onmessage"), "DSP must run in the isolated analysis worker.");
assert.ok(workerCore.includes("runMusicAnalysisWorkerCore") && workerCore.includes("analyzeMusicDatasetAudio"), "Worker core must run both analysis reports.");
for (const marker of ["env.music-loudness-report.v1", "integrated_loudness_lufs", "true_peak_dbtp",
  "file_sha256_verified", "result_checksum"]) {
  assert.ok(loudness.includes(marker), `Standards loudness report contract missing: ${marker}`);
}
for (const marker of ["ebur128=peak=sample+true", "explicitAudioUploadConsent", "MAX_LOUDNESS_REPORT_DURATION_SECONDS"]) {
  assert.ok(processor.includes(marker), `FFmpeg ebur128 processor contract missing: ${marker}`);
}
for (const marker of ["listMusicDatasetTracks", "saveMusicDatasetTrack", "getMusicDatasetTrack",
  "getMusicAnalysisRun", "deleteMusicDatasetTrack"]) {
  assert.ok(routes.includes(marker), `Private dataset route missing: ${marker}`);
}
console.log("Music Analyzer V2 contract checks passed: bounded local worker/batches, authenticated owner-scoped dataset API, no source-audio upload, V1 migration and standards loudness report.");
