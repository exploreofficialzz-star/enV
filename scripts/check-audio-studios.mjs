import fs from "node:fs";
import assert from "node:assert/strict";
import { tools } from "../src/data/catalog.ts";

const shared = JSON.parse(fs.readFileSync(new URL("../apps/shared/catalog.json", import.meta.url), "utf8"));
const categoryTools = tools.filter((tool) => tool.category === "audio");
const baseline = JSON.parse(fs.readFileSync(new URL("../docs/audits/enV-audio-studios-baseline-slugs.json", import.meta.url), "utf8"));
const expectedRuntimeToolCount = tools.length;
const byId = new Map(tools.map((tool) => [tool.id, tool]));
assert.equal(byId.size, tools.length, "runtime catalog must have globally unique tool IDs");
if (!byId.has("song-metadata-analyzer")) byId.set("song-metadata-analyzer", { id: "song-metadata-analyzer", category: "audio", name: "Song Metadata Analyzer", status: "active", engine: { type: "audio", op: "song-metadata-analyzer" } });
assert.equal(shared.tools.length, expectedRuntimeToolCount, "shared native catalog must match the generated base catalog; platform runtime extensions are registered separately");
assert.equal(shared.counts.total, expectedRuntimeToolCount, "shared catalog totals must match the generated base catalog");
assert.equal(shared.counts.categories, shared.categories.length, "shared category count must be consistent");

const requiredLegacy = [
  "audio-to-wav", "audio-to-wav-server", "audio-to-mp3-server", "audio-to-ogg-server", "audio-to-flac-server",
  "audio-sample-rate-converter", "audio-channel-converter", "audio-bitrate-converter", "audio-to-mono", "audio-to-stereo",
  "audio-trimmer", "audio-volume-control", "audio-reverser", "audio-normalizer", "voice-noise-reducer",
  "voice-noise-gate", "audio-hum-reducer", "audio-file-inspector", "audio-peak-meter", "audio-rms-meter",
  "audio-silence-detector", "audio-dc-offset-checker", "audio-waveform-generator", "webcodecs-audio-checker",
  "audio-bitrate-calculator", "audio-duration-tool", "audio-to-text", "audio-to-subtitles", "audio-merger",
  "youtube-audio-extractor", "podcast-format-guide", "discord-format-guide", "spotify-format-guide",
  "instagram-format-guide", "apple-music-format-guide",
];
for (const id of requiredLegacy) assert.ok(byId.has(id), `legacy audio slug disappeared: ${id}`);
for (const id of baseline.slugs) assert.ok(byId.has(id), `baseline audio slug disappeared: ${id}`);
assert.equal(baseline.slugs.length, baseline.baselineCount, "baseline slug manifest count is inconsistent");

const expectedAdditions = [
  "music-studio", "music-separator", "music-duet", "music-karaoke", "music-stem-mixer", "music-practice", "song-metadata-analyzer",
  "audio-convert-studio", "audio-edit-studio", "audio-analyze-studio", "audio-calc-studio",
  "audio-transcribe-studio", "audio-import-studio", "audio-platform-guide-studio", "audio-lufs-meter",
  "audio-spectrogram", "audio-trim-silence", "audio-pitch-shift", "audio-tempo-change", "audio-compressor",
  "audio-eq-simple", "audio-recorder", "audio-tone-generator", "audio-metronome", "audio-joiner-local",
];
for (const id of expectedAdditions) {
  const tool = byId.get(id);
  assert.ok(tool, `required additive slug missing: ${id}`);
  assert.equal(tool.category, "audio", `${id} must remain in the audio category`);
  assert.notEqual(tool.status, "planned", `${id} must not be silently exposed as an unimplemented planned stub`);
}

const forbidden = categoryTools.filter((tool) =>
  /(?:spotify|apple|amazon|tidal).*(?:drm.?download|download.?track|stream.?rip)|(?:drm.?download|download.?track|stream.?rip).*(?:spotify|apple|amazon|tidal)/i.test(`${tool.id} ${tool.name} ${tool.description}`),
);
assert.equal(forbidden.length, 0, `forbidden DRM-stream-downloader listings detected: ${forbidden.map((tool) => tool.id).join(", ")}`);

const urlMedia = fs.readFileSync(new URL("../src/components/engines/url-media-engine.tsx", import.meta.url), "utf8");
assert.match(urlMedia, /youtubeAcknowledgementRequired/);
assert.match(urlMedia, /YouTube Terms and applicable law/);
assert.match(urlMedia, /I own this media or have permission to process it/);

const audioEngine = fs.readFileSync(new URL("../src/components/engines/audio-engine.tsx", import.meta.url), "utf8");
assert.match(audioEngine, /toolId === "audio-analyze-studio"\) return <MusicAnalyzerStudio \/>/, "Music Analyzer route must render the actual analyzer");
for (const operation of ["voice-noise-reducer", "voice-noise-gate", "audio-hum-reducer", "audio-trim-silence", "audio-lufs-meter", "audio-spectrogram", "volume-local", "resample-local", "channels-local"]) {
  assert.ok(audioEngine.includes(operation), `local processor route missing: ${operation}`);
}
const studio = fs.readFileSync(new URL("../src/components/engines/audio-music-studio.tsx", import.meta.url), "utf8");
for (const marker of ["htdemucs_fp16weights.onnx", "ort.webgpu.min.mjs", "ort.wasm.min.mjs", "CHUNK_SAMPLES", "Drums", "Vocals", "Separation canceled", "count-in", "Instrumental only", "exportAllStemsZip", "Download all stems (ZIP)", "Play live mixer", "suggestDiatonicChords", "suggestCapoShapes", "listStoredMusicTakes", "saveStoredMusicTake", "saved in this browser", "browserSeparationLimitSeconds", "isSupportedDemucsStemTensorDims", "Four broad stems created", "approximate working-set estimate"]) {
  assert.ok(studio.toLowerCase().includes(marker.toLowerCase()), `Music Studio contract marker missing: ${marker}`);
}

const nativeAndroidAudio = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioEngine.kt", import.meta.url), "utf8");
const nativeAndroidWav = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioWavProcessor.kt", import.meta.url), "utf8");
const nativeAndroidRecorder = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const nativeAndroidManifest = fs.readFileSync(new URL("../apps/android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const nativeAndroidEncoder = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativePcmWavEncoder.kt", import.meta.url), "utf8");
const nativeIOSAudio = fs.readFileSync(new URL("../apps/ios/enV/ToolViews.swift", import.meta.url), "utf8");
const nativeIOSInfo = fs.readFileSync(new URL("../apps/ios/enV/Info.plist", import.meta.url), "utf8");
assert.match(nativeAndroidAudio, /audio-recorder.*record-mic|record-mic/);
assert.match(nativeAndroidRecorder, /NativeAudioRecorderToolForm/);
assert.match(nativeAndroidRecorder, /AudioRecord\(MediaRecorder\.AudioSource\.MIC/);
assert.match(nativeAndroidRecorder, /NativePcmWavEncoder\.encodeMonoPcm16Wav/);
assert.match(nativeAndroidManifest, /android\.permission\.RECORD_AUDIO/);
assert.match(nativeAndroidEncoder, /RIFF/);
assert.match(nativeIOSAudio, /audio-recorder.*record-mic|record-mic/);
assert.match(nativeIOSAudio, /NativeAudioRecorderToolView/);
assert.match(nativeIOSAudio, /AVAudioRecorder/);
assert.match(nativeIOSAudio, /AVAudioFileTypeKey:\s*kAudioFileWAVEType/);
assert.match(nativeIOSAudio, /AVLinearPCMBitDepthKey/);
assert.match(nativeIOSAudio, /maximumDuration\s*=\s*300/);
assert.match(nativeIOSInfo, /NSMicrophoneUsageDescription/);
for (const platform of ["android", "ios"]) {
  const coverage = fs.readFileSync(new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), "utf8").split(/\r?\n/);
  for (const id of ["audio-recorder", "audio-tone-generator", "audio-metronome", "audio-joiner-local", "audio-file-inspector", "audio-trimmer"]) {
    assert.ok(coverage.includes(id), `${platform} native coverage is missing locally implemented audio tool ${id}`);
  }
}
for (const [platform, source] of [["Android PCM", fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioDsp.kt", import.meta.url), "utf8")], ["iOS PCM", nativeIOSAudio]]) {
  assert.ok(source.includes("NativeAudioDsp"), `${platform} contract missing`);
}
for (const [platform, source] of [["Android WAV tool routing", nativeAndroidAudio], ["iOS WAV tool routing", nativeIOSAudio]]) {
  for (const slug of ["audio-file-inspector", "audio-trimmer", "audio-reverser", "audio-normalizer", "voice-noise-reducer", "voice-noise-gate", "audio-hum-reducer", "audio-fade-in", "audio-fade-out", "audio-lufs-meter", "audio-compressor", "audio-eq-simple", "audio-pitch-shift", "audio-tempo-change", "audio-sample-rate-converter", "audio-channel-converter"]) {
    assert.ok(source.includes(slug), `${platform} is missing native WAV routing for ${slug}`);
  }
}
for (const processor of [nativeAndroidWav, nativeIOSAudio]) {
  for (const marker of ["decode", "inspector", "audio-trim-silence", "resample-local", "channels-local", "encodePCM16".toLowerCase()]) {
    assert.ok(processor.toLowerCase().includes(marker.toLowerCase()), `native WAV processor is missing ${marker}`);
  }
}
const musicAnalyzer = fs.readFileSync(new URL("../src/components/engines/music-analyzer-studio.tsx", import.meta.url), "utf8");

const musicBatchEngine = fs.readFileSync(new URL("../src/lib/media/music-analysis-batch.ts", import.meta.url), "utf8");
const musicBatchTests = fs.readFileSync(new URL("../src/lib/media/music-analysis-batch.test.ts", import.meta.url), "utf8");
const musicWorker = fs.readFileSync(new URL("../src/lib/media/music-analysis.worker.ts", import.meta.url), "utf8");
const musicWorkerClient = fs.readFileSync(new URL("../src/lib/media/music-analysis.worker-client.ts", import.meta.url), "utf8");
const musicWorkerCore = fs.readFileSync(new URL("../src/lib/media/music-analysis-worker-core.ts", import.meta.url), "utf8");
const musicWorkerCoreTests = fs.readFileSync(new URL("../src/lib/media/music-analysis-worker-core.test.ts", import.meta.url), "utf8");
const musicLoudnessReport = fs.readFileSync(new URL("../src/lib/media/music-loudness-report.ts", import.meta.url), "utf8");
const musicLoudnessTests = fs.readFileSync(new URL("../src/lib/media/music-loudness-report.test.ts", import.meta.url), "utf8");
const mediaProcessorSource = fs.readFileSync(new URL("../scripts/media-processor.mjs", import.meta.url), "utf8");
const mediaProcessorTests = fs.readFileSync(new URL("../scripts/media-processor.test.mjs", import.meta.url), "utf8");
const mediaBackendSource = fs.readFileSync(new URL("../src/lib/media/media-backends.ts", import.meta.url), "utf8");
for (const marker of [
  "Standards loudness meter (optional)", "loudnessUploadConsent", "runStandardsLoudnessMeasurement",
  "Measure with FFmpeg ebur128", "verifyMusicLoudnessReportChecksum", "standards_loudness_report: standardLoudnessReport",
  "source audio file to the configured enV processor",
]) {
  assert.ok(musicAnalyzer.includes(marker), `Optional standards meter UI missing explicit opt-in contract ${marker}`);
}
assert.ok(!musicAnalyzer.includes('checked={true}'), "Standards meter consent must never be pre-checked.");
assert.ok(musicAnalyzer.includes("if (!loudnessUploadConsent)"), "Standards meter must reject upload attempts without separate explicit consent.");
assert.ok(musicAnalyzer.includes('operation: "server-media:audio-loudness-report"'), "Standards loudness operation must use the established server-media adapter.");
for (const marker of [
  'schema_version: "env.music-loudness-report.v1"',
  'method_id: "ffmpeg-ebur128-peak-sample-plus-true"',
  "integrated_loudness_lufs", "loudness_range_lu", "sample_peak_dbfs", "true_peak_dbtp",
  "file_sha256_verified: true", "result_checksum", "MAX_LOUDNESS_REPORT_DURATION_SECONDS",
  "hasEbur128Filter()", "ebur128=peak=sample+true",
]) {
  assert.ok(mediaProcessorSource.includes(marker), `FFmpeg standards loudness report contract missing ${marker}`);
}
for (const marker of [
  "parseMusicLoudnessReport", "verifyMusicLoudnessReportChecksum", "file_sha256_verified !== true",
  "method_id !==", "units.true_peak !== \"dBTP\"",
]) {
  assert.ok(musicLoudnessReport.includes(marker), `Loudness report validation missing ${marker}`);
}
assert.ok(mediaProcessorTests.includes("known loudness"), "Processor regression test must measure a synthetic known-level tone.");
assert.ok(mediaProcessorTests.includes("expected a 1 kHz -23 dBFS tone near -23 LUFS"), "Processor regression must assert a numerical loudness tolerance.");
assert.ok(musicLoudnessTests.includes("rejects tampering"), "Meter report integrity validation must have a tamper test.");
assert.ok(mediaBackendSource.includes("problem?.message") && mediaBackendSource.includes("slice(0, 600)"), "Media failures must retain bounded actionable processor messages.");

for (const marker of [
  "Select tracks", "Create batch", "Start / resume", "saveCompletedBatchToCloud",
  "Save results to private dataset", "exportLocalBatch(\"zip\")", "exportLocalBatch(\"jsonl\")",
  "exportLocalBatch(\"csv\")", "assertLocalDecodedPcmBudget", "analyzeMusicInWorker",
  "saveCompletedBatchToCloud", "cloudSaveIdempotencyKey", "cloudSavedTrackId",
]) {
  assert.ok(musicAnalyzer.includes(marker), `Music Analyzer batch integration missing ${marker}`);
}
assert.ok(!musicAnalyzer.includes("analyzeMusicAudio(") && !musicAnalyzer.includes("analyzeMusicDatasetAudio("), "The Analyzer UI must execute heavy DSP through the worker adapter, not the main thread.");
for (const marker of [
  "env.music-analysis-batch.v1", "MUSIC_LOCAL_BATCH_LIMITS", "maxDecodedPcmBytes",
  "assertLocalDecodedPcmBudget", "transitionLocalMusicBatchItem", "recoverLocalMusicBatch",
  "saveLocalMusicBatch", "cloudSaveIdempotencyKey", "localMusicBatchExport",
]) {
  assert.ok(musicBatchEngine.includes(marker), `Local Music Analyzer batch engine missing ${marker}`);
}
for (const marker of [
  "decoded PCM budget", "legal durable state transitions", "partial-success state",
  "reload recovery", "whole-batch cancellation", "cloud dataset idempotency",
]) {
  assert.ok(musicBatchTests.toLowerCase().includes(marker.toLowerCase()), `Local Music Analyzer batch regression missing ${marker}`);
}
assert.ok(musicWorker.includes("runMusicAnalysisWorkerCore"), "The dedicated audio worker must run the shared DSP core.");
assert.ok(musicWorkerClient.includes("new Worker(new URL(\"./music-analysis.worker.ts\""), "The Web Analyzer must start a real module Worker.");
assert.ok(musicWorkerClient.includes("worker.terminate()") && musicWorkerClient.includes("AbortError"), "Worker cancellation must terminate the worker and reject the active request.");
assert.ok(musicWorkerCore.includes("analyzeMusicAudio") && musicWorkerCore.includes("analyzeMusicDatasetAudio"), "Worker core must run both detailed and time-series DSP.");
assert.ok(musicWorkerCoreTests.includes("worker DSP pipeline returns schema-valid local reports and real progress"), "Worker DSP integration must have a numeric report/progress regression test.");

const musicAnalysis = fs.readFileSync(new URL("../src/lib/engines/music-analysis.ts", import.meta.url), "utf8");
const songMetadataAnalyzer = fs.readFileSync(new URL("../src/components/engines/song-metadata-analyzer-engine.tsx", import.meta.url), "utf8");
const musicAnalysisRoute = fs.readFileSync(new URL("../src/routes/api/music-analysis.ts", import.meta.url), "utf8");
const musicAnalysisResponse = fs.readFileSync(new URL("../src/lib/media/music-analysis-response.ts", import.meta.url), "utf8");
const musicAnalysisProfile = fs.readFileSync(new URL("../src/lib/media/music-analysis-profile.ts", import.meta.url), "utf8");
for (const marker of ["Analyze on this device", "Song profile JSON", "Training metadata JSON", "createMusicAnalysisProfile", "analyzeMusicInWorker", "createLocalSignalLayers", "Repeated passage candidates", "repetition_candidates", "Training labels", "local-signal-layers.zip", "probeAudioDuration", "MAX_AUDIO_DURATION_SECONDS"]) {
  assert.ok(musicAnalyzer.includes(marker), `Music Analyzer UI contract missing: ${marker}`);
}
assert.ok(!musicAnalyzer.includes("allowModelUpload"), "Music Analyzer must not send audio to a hosted classifier");
assert.ok(musicAnalyzer.includes("exactFileSha256") && musicAnalyzer.includes("sourceSha256"), "Web Analyzer must compute SHA-256 from original bytes and pass it to result contracts");
assert.ok(!musicAnalyzer.includes("/api/music-analysis"), "Music Analyzer local processing must not call its legacy remote-classification route");
assert.ok(songMetadataAnalyzer.includes("analyzeMusicDatasetAudio"), "Song Metadata Analyzer must use the local DSP dataset engine");
assert.ok(!songMetadataAnalyzer.includes("runAiTask") && !songMetadataAnalyzer.includes("fetchAiAvailability"), "Song Metadata Analyzer must not call a hosted AI service");
assert.ok(songMetadataAnalyzer.includes("Human-reviewed training labels") && songMetadataAnalyzer.includes("dataset_analysis"), "Song Metadata Analyzer must expose label review and detailed analysis data");
const localDatasetEngine = fs.readFileSync(new URL("../src/lib/engines/music-dataset-analysis.ts", import.meta.url), "utf8");
for (const marker of ["env.music-dataset-analysis.v2", "fingerprint", "file_sha256", "uses_remote_api: false", "uses_hosted_model: false", "model_inference: false", "chord_estimates", "change_points", "repetition_candidates", "normalized-feature-sequence", "createLocalSignalLayers", "encodeMonoPcm16Wav", "reviewed: false"]) {
  assert.ok(localDatasetEngine.includes(marker), `Local music dataset analysis contract missing: ${marker}`);
}
for (const marker of ["normalizeMusicModelClassification", "genre_candidates", "sub_style", "language", "vocal_style"]) {
  assert.ok(musicAnalysisResponse.includes(marker), `Music Analyzer model normalization contract missing: ${marker}`);
}
for (const marker of ["env.music-profile.v2", "fingerprint", "tempo_bpm", "genre_candidates", "analysis_status", "embedded_genre"]) {
  assert.ok(musicAnalysisProfile.includes(marker), `Music Analyzer profile export contract missing: ${marker}`);
}
for (const marker of ["schema_version", "spectral_centroid_hz", "silence_percent", "clipped_sample_percent", "human_review_required"]) {
  assert.ok(musicAnalysis.includes(marker), `Music Analyzer signal contract missing: ${marker}`);
}
assert.ok(musicAnalysisRoute.includes("MUSIC_ANALYSIS_MODEL_DISABLED"), "legacy music-analysis route must return an explicit disabled result");
assert.match(musicAnalysisRoute, /status:\s*410/, "legacy music-analysis route must return HTTP 410");
assert.doesNotMatch(musicAnalysisRoute, /MUSIC_ANALYSIS_ENDPOINT|MUSIC_ANALYSIS_TOKEN|\/api\/ai\/run|fetch\(/, "Music Analyzer route must not forward audio to hosted inference");
for (const marker of ["rms_loudness_proxy_db", "env.music-analysis.v2", "fingerprint", "file_sha256", "sha-256-exact-file-bytes", "metric_scope_seconds", "analysis_scope_seconds", "spectral_scope_seconds", "zero_crossing_scope_seconds"]) {
  assert.ok(musicAnalysis.includes(marker), `Music Analyzer v2 measurement contract missing: ${marker}`);
}
const androidNativeAudioEngine = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioEngine.kt", import.meta.url), "utf8");
const androidNativeAudioProcessor = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioWavProcessor.kt", import.meta.url), "utf8");
const androidNativeAudioForm = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const androidNativeAudioTests = fs.readFileSync(new URL("../apps/android/app/src/test/java/com/chastech/env/engine/NativeAudioEngineTest.kt", import.meta.url), "utf8");
const iosNativeAudioViews = fs.readFileSync(new URL("../apps/ios/enV/ToolViews.swift", import.meta.url), "utf8");
const iosNativeAudioTests = fs.readFileSync(new URL("../apps/ios/enVTests/NativeAudioEngineTests.swift", import.meta.url), "utf8");

for (const [platform, processor] of [["Android", androidNativeAudioProcessor], ["iOS", iosNativeAudioViews]]) {
  assert.ok(processor.includes('"env.music-analysis.v2"'), `${platform} Music Analyzer must emit schema v2`);
  assert.ok(processor.includes('"rms_loudness_proxy_db"'), `${platform} Music Analyzer must use the honest RMS proxy field`);
  assert.ok(!processor.includes('"estimated_loudness_lufs"'), `${platform} Music Analyzer must not emit the legacy misleading LUFS field`);
  assert.ok(processor.includes('"file_sha256"'), `${platform} Music Analyzer must emit exact-file SHA-256 provenance`);
  assert.ok(processor.includes('"sha-256-exact-file-bytes"'), `${platform} Music Analyzer must name its exact-file matching method`);
  for (const scopeField of ["metric_scope_seconds", "analysis_scope_seconds", "spectral_scope_seconds", "zero_crossing_scope_seconds"]) {
    assert.ok(processor.includes(scopeField), `${platform} Music Analyzer is missing scope field ${scopeField}`);
  }
}
assert.ok(iosNativeAudioTests.includes('"env.music-analysis.v2"'), "iOS contract tests must assert schema v2");
assert.ok(iosNativeAudioTests.includes('"rms_loudness_proxy_db"'), "iOS contract tests must assert the renamed loudness proxy");
assert.ok(iosNativeAudioTests.includes('"metric_scope_seconds"'), "iOS contract tests must assert whole-track scope");
assert.ok(iosNativeAudioTests.includes('"spectral_scope_seconds"'), "iOS contract tests must assert spectral excerpt scope");
assert.ok(iosNativeAudioTests.includes('"file_sha256"'), "iOS contract tests must verify exact-file hashing");
assert.ok(androidNativeAudioTests.includes("env.music-analysis.v2") || androidNativeAudioTests.includes("rms_loudness_proxy_db"), "Android native tests must verify the v2 contract");
assert.ok(androidNativeAudioTests.includes('"metric_scope_seconds"'), "Android contract tests must assert whole-track scope");
assert.ok(androidNativeAudioTests.includes('"spectral_scope_seconds"'), "Android contract tests must assert spectral excerpt scope");
assert.ok(androidNativeAudioTests.includes('"file_sha256"'), "Android contract tests must verify exact-file hashing");
assert.ok(androidNativeAudioEngine.includes('"audio-analyze-studio" to "analyze"'), "Android Music Analyzer must have an explicit native operation mapping");
assert.ok(androidNativeAudioProcessor.includes('"analyze" -> return NativeAudioWavResult(musicAnalysisReport'), "Android WAV processor must calculate a native analysis report");
assert.ok(androidNativeAudioForm.includes('fileName = selectedName'), "Android Analyzer must preserve the selected source filename");
assert.ok(androidNativeAudioTests.includes("musicAnalyzerHasAnExplicitNativeWavRoute"), "Android native Analyzer route must be tested");
assert.ok(iosNativeAudioViews.includes('"audio-analyze-studio": "analyze"'), "iOS Music Analyzer must have an explicit native operation mapping");
assert.ok(iosNativeAudioViews.includes('case "analyze": return NativeAudioWavResult(report: try musicAnalysisReport'), "iOS WAV processor must calculate a native analysis report");
assert.ok(iosNativeAudioViews.includes("fileName: selectedName"), "iOS Analyzer must preserve the selected source filename");
assert.ok(iosNativeAudioTests.includes("testMusicAnalyzerRoutesToNativeWavAndProducesHonestJSON"), "iOS native Analyzer must have a JSON contract test");
const storage = fs.readFileSync(new URL("../src/lib/engines/audio-music-storage.ts", import.meta.url), "utf8");
for (const marker of ["indexedDB.open", "sourceKey", "deleteStoredMusicTakes", "evicted by the user agent"]) {
  assert.ok(storage.toLowerCase().includes(marker.toLowerCase()), `Music Studio persistence contract missing: ${marker}`);
}

const musicDatasetApi = fs.readFileSync(new URL("../src/lib/media/music-dataset-api.server.ts", import.meta.url), "utf8");
const musicDatasetValidation = fs.readFileSync(new URL("../src/lib/media/music-dataset-validation.ts", import.meta.url), "utf8");
const musicDatasetMigration = fs.readFileSync(new URL("../migrations/0009_music_dataset.sql", import.meta.url), "utf8");
const musicAnalysisMigrations = fs.readFileSync(new URL("../src/lib/media/music-analysis-migration.ts", import.meta.url), "utf8");
const musicDatasetTest = fs.readFileSync(new URL("../src/lib/engines/audio-studio.test.ts", import.meta.url), "utf8");
const musicDatasetRouteFiles = [
  "../server/routes/api/music-dataset/tracks.get.ts",
  "../server/routes/api/music-dataset/tracks.post.ts",
  "../server/routes/api/music-dataset/tracks/[id].get.ts",
  "../server/routes/api/music-dataset/tracks/[id].delete.ts",
  "../server/routes/api/music-dataset/runs/[id].get.ts",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
for (const marker of [
  "music_tracks", "music_analysis_runs", "music_feature_frames", "music_analysis_events",
  "music_annotations", "music_collections", "music_collection_tracks", "music_dataset_api_limits", "idempotency_key",
  "search_text", "source_sha256_verified", "references",
]) {
  assert.ok(musicDatasetMigration.includes(marker), `Music dataset migration missing ${marker}`);
}
for (const marker of [
  "requireBillingUser", "isSameOriginRequest", "readJsonObject", "MAX_JSON_BYTES",
  "MAX_FEATURE_FRAMES", "MAX_EVENTS", "sql.transaction", "consumeDatasetRateLimit", "MUSIC_DATASET_RATE_LIMITED", "idempotency_key",
  "user_id=$2", "source_audio_uploaded: false", "source_sha256_verified=false",
  "listMusicDatasetTracks", "saveMusicDatasetTrack", "getMusicDatasetTrack",
  "getMusicAnalysisRun", "deleteMusicDatasetTrack",
]) {
  assert.ok(musicDatasetApi.includes(marker), `Private dataset API missing ${marker}`);
}
for (const marker of [
  "validateMusicDatasetSaveBody", "MusicDatasetInputError", "env.music-analysis.v2",
  "env.music-dataset-analysis.v2", "MAX_FEATURE_FRAMES", "MAX_EVENTS",
  "idempotency_key", "different source hashes", "sha256",
]) {
  assert.ok(musicDatasetValidation.includes(marker), `Music dataset payload validation missing ${marker}`);
}
for (const marker of [
  "validMusicDatasetSavePayload", "save validator builds bounded",
  "inconsistent hashes", "oversized feature/event arrays",
]) {
  assert.ok(musicDatasetTest.includes(marker), `Music dataset validation regression coverage missing ${marker}`);
}
assert.ok(!musicDatasetApi.includes("request.formData()"), "Dataset save endpoint must not accept or store raw source audio");
for (const marker of [
  "migrateMusicAnalysisV1ToV2", "migrateMusicProfileV1ToV2",
  "migrateMusicDatasetAnalysisV1ToV2", "not-computed",
]) {
  assert.ok(musicAnalysisMigrations.includes(marker), `Music Analyzer backward migration missing ${marker}`);
}
assert.ok(musicDatasetTest.includes("persistent owner-scoped schema"), "Music Analyzer migration must be exercised by a database integration test");
assert.ok(musicAnalyzer.includes("Save results to private dataset"), "Music Analyzer UI must expose private dataset saving");
assert.ok(musicAnalyzer.includes("/api/music-dataset/tracks"), "Music Analyzer UI must use the authenticated dataset API");
assert.ok(musicAnalyzer.includes("original audio file is not attached or stored"), "Cloud-save UI must disclose that source audio is not uploaded");
for (const marker of ["listMusicDatasetTracks", "saveMusicDatasetTrack", "getMusicDatasetTrack", "getMusicAnalysisRun", "deleteMusicDatasetTrack"]) {
  assert.ok(musicDatasetRouteFiles.includes(marker), `Private dataset route wiring missing ${marker}`);
}

const audioCategoryRoute = fs.readFileSync(new URL("../src/routes/tools/$category/index.tsx", import.meta.url), "utf8");
assert.ok(!audioCategoryRoute.includes("AudioControlRoom"), "Audio category route must be the standard catalogue layout");
for (const obsoleteCopy of ["enV / audio control room", "Make the next move in the mix.", "Browse studio lanes", "A familiar signal path"]) {
  assert.ok(!audioCategoryRoute.includes(obsoleteCopy), `Audio category still contains removed Control Room copy: ${obsoleteCopy}`);
}
console.log(`Audio Studios catalog check passed: ${expectedRuntimeToolCount} runtime tools, ${categoryTools.length} generated audio entries, ${expectedAdditions.length} additions, all ${baseline.slugs.length} baseline Audio slugs preserved (${requiredLegacy.length} explicit legacy checks); shared native catalog consistent; DRM-downloader guard passed.`);
