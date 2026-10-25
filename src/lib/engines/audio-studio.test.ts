import assert from "node:assert/strict";
import test from "node:test";
import { amplitudeDbfs, approximateLufs, browserSeparationLimitSeconds, estimateBpm, estimateBitrateKbpsFromSize, estimateBrowserSeparationWorkingSetBytes, estimateCompressedAudioBytes, estimateKey, estimatePcmAudioBytes, humReduceSamples, isSupportedDemucsStemTensorDims, noiseGateSamples, rms, suggestCapoShapes, suggestDiatonicChords, trimSilenceBounds } from "./audio-studio.ts";
import { analyzeMusicAudio, type MusicAnalysisResult } from "./music-analysis.ts";
import { createMusicAnalysisProfile } from "../media/music-analysis-profile.ts";
import { normalizeMusicModelClassification } from "../media/music-analysis-response.ts";

test("audio analysis uses correct amplitude and RMS dBFS math", () => {
  assert.equal(amplitudeDbfs(1), 0);
  assert.ok(Math.abs(amplitudeDbfs(0.5) + 6.0206) < 0.001);
  assert.equal(rms(new Float32Array()), 0);
  assert.ok(Math.abs(approximateLufs(new Float32Array([1, -1, 1, -1])) + 0.691) < 0.001);
});

test("silence trim finds stable audio boundaries and handles silent files", () => {
  const pcm = new Float32Array(1000);
  pcm.fill(0.5, 200, 800);
  const range = trimSilenceBounds(pcm, -50, 1000, 20);
  assert.equal(range.start, 200);
  assert.equal(range.end, 820);
  assert.equal(trimSilenceBounds(new Float32Array(1000), -50, 1000, 20).end, 0);
});

test("noise gate attenuates quiet audio and leaves loud signal stronger", () => {
  const pcm = Float32Array.from({ length: 500 }, (_, i) => i < 250 ? 0.001 : 0.8);
  const output = noiseGateSamples(pcm, 1000, -40, 0.01);
  assert.ok(Math.abs(output[100]) < Math.abs(pcm[100]));
  assert.ok(Math.abs(output[400]) > Math.abs(output[100]) * 10);
});

test("50 Hz hum filter reduces a known mains sine component", () => {
  const sampleRate = 8000;
  const tone = Float32Array.from({ length: 8000 }, (_, i) => Math.sin(2 * Math.PI * 50 * i / sampleRate));
  const filtered = humReduceSamples(tone, sampleRate, 50);
  assert.ok(rms(filtered.slice(2000)) < rms(tone.slice(2000)) * 0.2);
});

test("tempo estimator recognizes a regular four-beat pulse", () => {
  const sampleRate = 8000, duration = 12, pcm = new Float32Array(sampleRate * duration);
  const beat = sampleRate * 0.5;
  for (let at = 0; at < pcm.length; at += beat) {
    for (let i = 0; i < 120; i++) pcm[at + i] = Math.exp(-i / 25) * Math.sin(i * 0.5);
  }
  const bpm = estimateBpm(pcm, sampleRate);
  assert.ok(bpm !== null && bpm >= 115 && bpm <= 125, `expected ~120 BPM, got ${bpm}`);
});

test("key estimator is robust to a short clip and returns a useful label for a tonal signal", () => {
  assert.equal(estimateKey(new Float32Array(10), 44100), null);
  const sampleRate = 8000, pcm = new Float32Array(sampleRate * 4);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    pcm[i] = 0.4 * Math.sin(2 * Math.PI * 261.63 * t) + 0.3 * Math.sin(2 * Math.PI * 329.63 * t) + 0.2 * Math.sin(2 * Math.PI * 392 * t);
  }
  assert.match(estimateKey(pcm, sampleRate) ?? "", /major|minor/);
});


test("bitrate, decimal MB and PCM size calculations match the audio golden values", () => {
  const compressedBytes = estimateCompressedAudioBytes(60, 128);
  assert.equal(compressedBytes, 960000);
  assert.equal((compressedBytes / 1_000_000).toFixed(2), "0.96");
  assert.equal(estimateBitrateKbpsFromSize(60, 0.96), 128);
  assert.equal(estimatePcmAudioBytes(60, 44100, 2, 16), 10_584_000);
});


test("diatonic chord grid returns key-aware major triads and minor qualities", () => {
  const chords = suggestDiatonicChords("C major");
  assert.deepEqual(chords.map((item) => item.chord), ["C", "Dm", "Em", "F", "G", "Am", "B°"]);
  assert.equal(chords[6]?.quality, "diminished");
  assert.deepEqual(suggestDiatonicChords("A minor").map((item) => item.chord), ["Am", "B°", "C", "Dm", "Em", "F", "G"]);
  assert.deepEqual(suggestDiatonicChords("not a key"), []);
});

test("capo helper finds low-fret open shapes and labels no-capo options", () => {
  const cMajor = suggestCapoShapes("C major");
  assert.equal(cMajor[0]?.shape, "C");
  assert.equal(cMajor[0]?.fret, 0);
  assert.ok(cMajor.some((item) => item.shape === "G" && item.fret === 5));
  assert.deepEqual(suggestCapoShapes("A major")[0], { shape: "A", fret: 0, soundingKey: "A" });
  assert.deepEqual(suggestCapoShapes("unknown"), []);
});


test("browser separation limits are conservative on mobile and unknown-memory devices", () => {
  assert.equal(browserSeparationLimitSeconds(undefined, true), 60);
  assert.equal(browserSeparationLimitSeconds(undefined, false), 90);
  assert.equal(browserSeparationLimitSeconds(4, true), 45);
  assert.equal(browserSeparationLimitSeconds(8, false), 120);
  assert.equal(browserSeparationLimitSeconds(32, false), 240);
});

test("separation working-set estimate grows with duration and rejects invalid input", () => {
  const short = estimateBrowserSeparationWorkingSetBytes(60);
  const long = estimateBrowserSeparationWorkingSetBytes(120);
  assert.ok(short > 166_000_000);
  assert.ok(long > short);
  assert.throws(() => estimateBrowserSeparationWorkingSetBytes(-1), /Duration/);
});

test("Demucs tensor layout guard accepts documented channel-first shapes only", () => {
  assert.equal(isSupportedDemucsStemTensorDims([1, 4, 2, 343980], 343980), true);
  assert.equal(isSupportedDemucsStemTensorDims([4, 2, 343980], 343980), true);
  assert.equal(isSupportedDemucsStemTensorDims(undefined, 343980), true);
  assert.equal(isSupportedDemucsStemTensorDims([1, 2, 4, 343980], 343980), false);
  assert.equal(isSupportedDemucsStemTensorDims([1, 4, 2, 123], 343980), false);
});

test("Music Analyzer returns reproducible signal metrics and leaves semantic labels unknown", () => {
  const sampleRate = 8000;
  const pcm = Float32Array.from({ length: sampleRate * 4 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
  const result = analyzeMusicAudio({
    channels: [pcm, pcm], sampleRate, fileName: "test-track.wav", fileSizeBytes: 64000, mimeType: "audio/wav",
    metadata: { title: "Known Title", artist: "Known Artist", genre: "Tagged genre", bpm: "120" },
  });
  assert.equal(result.schema_version, "env.music-analysis.v1");
  assert.equal(result.audio.duration_seconds, 4);
  assert.equal(result.audio.channels, 2);
  assert.ok(result.audio.rms_dbfs !== null && result.audio.rms_dbfs < -5 && result.audio.rms_dbfs > -15);
  assert.equal(result.audio.clipped_sample_percent, 0);
  assert.equal(result.metadata.title, "Known Title");
  assert.equal(result.metadata.embedded_genre, "Tagged genre");
  assert.equal(result.metadata.tagged_bpm, 120);
  assert.ok(result.timbre.spectral_centroid_hz !== null && Math.abs(result.timbre.spectral_centroid_hz - 440) < 80);
  assert.equal(result.classification.genre, null);
  assert.equal(result.classification.sub_style, null);
  assert.deepEqual(result.classification.language, []);
  assert.equal(result.classification.status, "requires_model");
});

test("Music Analyzer handles silence and short signals without fabricating tempo or key", () => {
  const result = analyzeMusicAudio({ channels: [new Float32Array(8000)], sampleRate: 8000, fileName: "silence.wav", fileSizeBytes: 16000 });
  assert.equal(result.audio.duration_seconds, 1);
  assert.equal(result.audio.peak_dbfs, null);
  assert.equal(result.audio.rms_dbfs, null);
  assert.equal(result.audio.silence_percent, 100);
  assert.equal(result.rhythm.tempo_bpm, null);
  assert.equal(result.rhythm.status, "unavailable");
  assert.equal(result.tonality.key, null);
  assert.equal(result.classification.status, "requires_model");
});

test("Music Analyzer rejects invalid sample rate and mismatched channel lengths", () => {
  assert.throws(() => analyzeMusicAudio({ channels: [new Float32Array(8)], sampleRate: 0, fileName: "bad.wav", fileSizeBytes: 8 }), /Sample rate/);
  assert.throws(() => analyzeMusicAudio({ channels: [new Float32Array(8), new Float32Array(7)], sampleRate: 8000, fileName: "bad.wav", fileSizeBytes: 8 }), /same frame count/);
});

test("music model response normalizer preserves semantic tags and clamps scores", () => {
  const result = normalizeMusicModelClassification({
    classification: {
      genre: "Afrobeats", sub_style: "Afro-pop", language: ["Pidgin", "Yoruba"],
      mood: ["upbeat"], instruments: ["drums", "bass"], vocal_style: "melodic",
      genre_candidates: [{ label: "Afrobeats", score: 1.2 }, { label: "Pop", score: -0.2 }],
    },
  });
  assert.equal(result.genre, "Afrobeats");
  assert.equal(result.sub_style, "Afro-pop");
  assert.deepEqual(result.language, ["Pidgin", "Yoruba"]);
  assert.deepEqual(result.mood, ["upbeat"]);
  assert.deepEqual(result.instruments, ["drums", "bass"]);
  assert.equal(result.vocal_style, "melodic");
  assert.deepEqual(result.genre_candidates.map((candidate) => candidate.score), [1, 0]);
  assert.equal(result.status, "model_completed");
});

test("music model response normalizer accepts classifier arrays but never invents absent tags", () => {
  const result = normalizeMusicModelClassification([
    { label: "Electronic", score: 0.75 },
    { label: "Rock", score: 0.3 },
  ]);
  assert.equal(result.genre, "Electronic");
  assert.deepEqual(result.genre_candidates.map((candidate) => candidate.label), ["Electronic", "Rock"]);
  assert.equal(result.sub_style, null);
  assert.deepEqual(result.language, []);
  assert.deepEqual(result.mood, []);
  assert.deepEqual(result.instruments, []);
});

test("music model response normalizer rejects malformed labels and non-finite scores", () => {
  const result = normalizeMusicModelClassification({ predictions: [
    { label: " ", score: 0.5 },
    { label: "Vocal", score: Number.NaN },
    { class: "Percussive", confidence: 2 },
    "not an object",
  ] });
  assert.deepEqual(result.genre_candidates, [
    { label: "Vocal", score: null },
    { label: "Percussive", score: 1 },
  ]);
  assert.equal(result.genre, "Vocal");
});

test("music model response normalizer returns unknown fields as unknown", () => {
  const result = normalizeMusicModelClassification({});
  assert.equal(result.genre, null);
  assert.equal(result.sub_style, null);
  assert.deepEqual(result.language, []);
  assert.deepEqual(result.mood, []);
  assert.deepEqual(result.instruments, []);
  assert.equal(result.vocal_style, null);
  assert.deepEqual(result.genre_candidates, []);
});


test("Music Analyzer song profile exports the requested top-level metadata fields", () => {
  const sampleRate = 8000;
  const pcm = Float32Array.from({ length: sampleRate * 4 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
  const local = analyzeMusicAudio({
    channels: [pcm], sampleRate, fileName: "afro-pop-demo.wav", fileSizeBytes: 64000, mimeType: "audio/wav",
    metadata: { title: "Demo", artist: "Unknown Artist", genre: "Legacy file tag", bpm: "120" },
  });
  const classified: MusicAnalysisResult = {
    ...local,
    classification: {
      ...local.classification,
      genre: "Afrobeats",
      sub_style: "Afro-pop",
      language: ["Nigerian Pidgin", "Yoruba"],
      mood: ["upbeat"],
      instruments: ["drums", "bass"],
      vocal_style: "melodic",
      genre_candidates: [{ label: "Afrobeats", score: 0.86 }, { label: "Pop", score: 0.42 }],
      status: "model_completed",
      note: "Best-effort model predictions.",
    },
  };

  const profile = createMusicAnalysisProfile(classified);
  assert.equal(profile.schema_version, "env.music-profile.v1");
  assert.equal(profile.genre, "Afrobeats");
  assert.equal(profile.sub_style, "Afro-pop");
  assert.deepEqual(profile.language, ["Nigerian Pidgin", "Yoruba"]);
  assert.equal(profile.tempo_bpm, local.rhythm.tempo_bpm);
  assert.equal(profile.title, "Demo");
  assert.equal(profile.metadata.embedded_genre, "Legacy file tag");
  assert.equal(profile.analysis_status.genre, "model_estimate");
  assert.equal(profile.analysis_status.language, "model_estimate");
  assert.equal(profile.analysis_status.tempo_bpm, "signal_estimate");
  assert.equal(profile.analysis_status.classification, "model_completed");
  assert.equal(profile.genre_candidates[0]?.score, 0.86);
});

test("Music Analyzer song profile never promotes embedded genre metadata into AI classification", () => {
  const local = analyzeMusicAudio({
    channels: [new Float32Array(8000)], sampleRate: 8000,
    fileName: "tagged-only.wav", fileSizeBytes: 16000,
    metadata: { genre: "Afrobeats" },
  });

  const profile = createMusicAnalysisProfile(local);
  assert.equal(profile.genre, null);
  assert.equal(profile.metadata.embedded_genre, "Afrobeats");
  assert.equal(profile.analysis_status.genre, "unknown");
  assert.equal(profile.analysis_status.language, "unknown");
  assert.equal(profile.analysis_status.classification, "requires_model");
  assert.equal(profile.analysis_status.tempo_bpm, "unavailable");
});
