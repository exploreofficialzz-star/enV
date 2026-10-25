import fs from "node:fs";
import assert from "node:assert/strict";
import { tools } from "../src/data/catalog.ts";

const shared = JSON.parse(fs.readFileSync(new URL("../apps/shared/catalog.json", import.meta.url), "utf8"));
const categoryTools = tools.filter((tool) => tool.category === "audio");
const baseline = JSON.parse(fs.readFileSync(new URL("../docs/audits/enV-audio-studios-baseline-slugs.json", import.meta.url), "utf8"));
const byId = new Map(tools.map((tool) => [tool.id, tool]));
assert.equal(byId.size, tools.length, "runtime catalog must have globally unique tool IDs");
assert.equal(shared.tools.length, tools.length, "shared native catalog must be regenerated from the current runtime catalog");
assert.equal(shared.counts.total, tools.length, "shared catalog totals must match runtime catalog");
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
  "music-studio", "music-separator", "music-duet", "music-karaoke", "music-stem-mixer", "music-practice",
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
const musicAnalysis = fs.readFileSync(new URL("../src/lib/engines/music-analysis.ts", import.meta.url), "utf8");
const musicAnalysisRoute = fs.readFileSync(new URL("../src/routes/api/music-analysis.ts", import.meta.url), "utf8");
const musicAnalysisResponse = fs.readFileSync(new URL("../src/lib/media/music-analysis-response.ts", import.meta.url), "utf8");
for (const marker of ["Analyze on this device", "Export JSON", "allowModelUpload", "/api/music-analysis", "genre_candidates", "not guessed here", "probeAudioDuration", "MAX_AUDIO_DURATION_SECONDS"]) {
  assert.ok(musicAnalyzer.includes(marker), `Music Analyzer UI contract missing: ${marker}`);
}
for (const marker of ["normalizeMusicModelClassification", "genre_candidates", "sub_style", "language", "vocal_style"]) {
  assert.ok(musicAnalysisResponse.includes(marker), `Music Analyzer model normalization contract missing: ${marker}`);
}
for (const marker of ["schema_version", "spectral_centroid_hz", "silence_percent", "clipped_sample_percent", "requires_model"]) {
  assert.ok(musicAnalysis.includes(marker), `Music Analyzer signal contract missing: ${marker}`);
}
for (const marker of ["MUSIC_ANALYSIS_ENDPOINT", "MUSIC_ANALYSIS_TOKEN", "MAX_AUDIO_BYTES", "UPSTREAM_TIMEOUT_MS", "MUSIC_ANALYSIS_BUILTIN_LIMIT", "MUSIC_ANALYSIS_ORIGIN_REQUIRED", "MUSIC_ANALYSIS_NO_LABELS", "readBoundedBody", "MUSIC_ANALYSIS_BODY_TOO_LARGE", "MUSIC_ANALYSIS_RATE_LIMITED", "normalizeMusicModelClassification", "AI_LIMITS.audioBytesMax", "music.analysis.classify", "apiUrl(\"/api/ai/run\")"]) {
  assert.ok(musicAnalysisRoute.includes(marker), `Music Analyzer server contract missing: ${marker}`);
}
const androidNativeAudioEngine = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioEngine.kt", import.meta.url), "utf8");
const androidNativeAudioProcessor = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioWavProcessor.kt", import.meta.url), "utf8");
const androidNativeAudioForm = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const androidNativeAudioTests = fs.readFileSync(new URL("../apps/android/app/src/test/java/com/chastech/env/engine/NativeAudioEngineTest.kt", import.meta.url), "utf8");
const iosNativeAudioViews = fs.readFileSync(new URL("../apps/ios/enV/ToolViews.swift", import.meta.url), "utf8");
const iosNativeAudioTests = fs.readFileSync(new URL("../apps/ios/enVTests/NativeAudioEngineTests.swift", import.meta.url), "utf8");
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
console.log(`Audio Studios catalog check passed: ${tools.length} unique tools, ${categoryTools.length} audio entries, ${expectedAdditions.length} additions, all ${baseline.slugs.length} baseline Audio slugs preserved (${requiredLegacy.length} explicit legacy checks); shared native catalog consistent; DRM-downloader guard passed.`);
