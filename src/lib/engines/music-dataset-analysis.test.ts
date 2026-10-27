import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMusicDatasetAudio,
  createLocalSignalLayers,
  encodeMonoPcm16Wav,
} from "./music-dataset-analysis.ts";

test("local dataset analysis emits time-aligned DSP features without calling a model", async () => {
  const sampleRate = 16_000;
  const samples = Float32Array.from({ length: sampleRate * 4 }, (_, index) =>
    0.35 * Math.sin((2 * Math.PI * 440 * index) / sampleRate),
  );
  const result = await analyzeMusicDatasetAudio({
    channels: [samples],
    sampleRate,
    fileName: "sine-test.wav",
    sourceSha256: "cd".repeat(32),
  });

  assert.equal(result.schema_version, "env.music-dataset-analysis.v2");
  assert.equal(result.fingerprint.file_sha256, "cd".repeat(32));
  assert.equal(result.fingerprint.exact_match_method, "sha-256-exact-file-bytes");
  assert.equal(result.processing.uses_remote_api, false);
  assert.equal(result.processing.uses_hosted_model, false);
  assert.equal(result.processing.model_inference, false);
  assert.equal(result.source.file_name, "sine-test.wav");
  assert.equal(result.source.channels, 1);
  assert.equal(result.source.duration_seconds, 4);
  assert.ok(result.timeline.length >= 7);
  assert.ok(result.pitch.points.length > 0);
  assert.ok(result.pitch.points.every((point) => point.confidence >= 0.55 && point.confidence <= 1));
  assert.ok(result.pitch.points.some((point) => Math.abs(point.frequency_hz - 440) < 10));
  assert.equal(result.separation.status, "not_performed");
  assert.equal(result.annotations.reviewed, false);
  assert.ok(result.warnings.some((warning) => warning.includes("No remote API")));
});

test("local dataset finds repeated passages as non-semantic feature candidates", async () => {
  const sampleRate = 8_000;
  const seconds = 32;
  const samples = new Float32Array(sampleRate * seconds);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const segment = Math.floor(time / 8);
    const localTime = time % 8;
    const envelope = 0.65 + 0.35 * Math.sin(2 * Math.PI * 1.5 * localTime);
    const frequencyA = segment === 0 || segment === 2 ? 220 : segment === 1 ? 660 : 330;
    const frequencyB = segment === 0 || segment === 2 ? 440 : segment === 1 ? 990 : 550;
    samples[index] = envelope * (0.32 * Math.sin(2 * Math.PI * frequencyA * localTime) + 0.12 * Math.sin(2 * Math.PI * frequencyB * localTime));
  }

  const result = await analyzeMusicDatasetAudio({
    channels: [samples],
    sampleRate,
    fileName: "repeated-sections-fixture.wav",
  });

  assert.equal(result.schema_version, "env.music-dataset-analysis.v2");
  assert.ok(result.structure.repetition_candidates.length > 0, "the repeated feature fixture should yield at least one candidate");
  const expectedPair = result.structure.repetition_candidates.find((candidate) =>
    (Math.abs(candidate.start_seconds) < 0.51 && Math.abs(candidate.match_start_seconds - 16) < 0.51) ||
    (Math.abs(candidate.match_start_seconds) < 0.51 && Math.abs(candidate.start_seconds - 16) < 0.51)
  );
  assert.ok(expectedPair, `expected the 0–8s and 16–24s repeated passages; got ${JSON.stringify(result.structure.repetition_candidates)}`);
  assert.ok(expectedPair.similarity_score >= 0.84 && expectedPair.similarity_score <= 1);
  assert.equal(expectedPair.method, "normalized-feature-sequence");
  assert.match(expectedPair.note, /not proof of identical audio/i);
  assert.ok(result.structure.sections.every((section) => section.semantic_section === null));
  assert.match(result.structure.repetition_note, /not probabilities/i);
});

test("stereo channel layers are explicitly named and include spatial meaning", () => {
  const left = Float32Array.from([1, 0.5, -0.5, 0]);
  const right = Float32Array.from([1, -0.5, 0.5, 0]);
  const layers = createLocalSignalLayers([left, right], 16_000);
  const center = layers.find((layer) => layer.id === "stereo_center");
  const side = layers.find((layer) => layer.id === "stereo_side");

  assert.ok(center);
  assert.ok(side);
  assert.deepEqual(Array.from(center.samples), [1, 0, 0, 0]);
  assert.deepEqual(Array.from(side.samples), [0, 0.5, -0.5, 0]);
  assert.match(center.meaning, /not a clean accompaniment stem|lead vocals/i);
});

test("frequency layers sum back to the mono downmix within floating-point tolerance", () => {
  const sampleRate = 16_000;
  const left = Float32Array.from({ length: 4096 }, (_, index) => 0.3 * Math.sin(index * 0.03) + 0.1 * Math.cos(index * 0.2));
  const right = Float32Array.from({ length: 4096 }, (_, index) => 0.2 * Math.sin(index * 0.04));
  const layers = createLocalSignalLayers([left, right], sampleRate);
  const mono = layers.find((layer) => layer.id === "mono_mix")!;
  const low = layers.find((layer) => layer.id === "low_frequency")!;
  const mid = layers.find((layer) => layer.id === "mid_frequency")!;
  const high = layers.find((layer) => layer.id === "high_frequency")!;
  assert.equal(mono.samples.length, left.length);
  for (let index = 0; index < mono.samples.length; index += 1) {
    assert.ok(Math.abs((low.samples[index]! + mid.samples[index]! + high.samples[index]!) - mono.samples[index]!) < 1e-5);
  }
});

test("PCM WAV export writes valid mono 16-bit PCM headers", () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1]);
  const bytes = encodeMonoPcm16Wav(samples, 16_000);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(12, 4), "fmt ");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(bytes.byteLength, 44 + samples.length * 2);
});

test("local analyzer rejects inconsistent channels and unsafe sample rates", async () => {
  await assert.rejects(analyzeMusicDatasetAudio({ channels: [new Float32Array(8), new Float32Array(9)], sampleRate: 16_000 }), /equal frame counts/);
  await assert.rejects(analyzeMusicDatasetAudio({ channels: [new Float32Array(8_000)], sampleRate: 4_000 }), /between 8 kHz and 192 kHz/);
});

test("local analysis can be cancelled and yields progress", async () => {
  const controller = new AbortController();
  const samples = new Float32Array(16_000 * 4).fill(0.2);
  let progressUpdates = 0;
  const promise = analyzeMusicDatasetAudio({ channels: [samples], sampleRate: 16_000 }, { signal: controller.signal, onProgress: () => { progressUpdates += 1; controller.abort(); } });
  await assert.rejects(promise, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.ok(progressUpdates >= 1);
});
