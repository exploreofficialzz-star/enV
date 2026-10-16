import assert from "node:assert/strict";
import test from "node:test";
import { amplitudeDbfs, approximateLufs, browserSeparationLimitSeconds, estimateBpm, estimateBitrateKbpsFromSize, estimateBrowserSeparationWorkingSetBytes, estimateCompressedAudioBytes, estimateKey, estimatePcmAudioBytes, humReduceSamples, isSupportedDemucsStemTensorDims, noiseGateSamples, rms, suggestCapoShapes, suggestDiatonicChords, trimSilenceBounds } from "./audio-studio.ts";

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
