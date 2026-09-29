import test from "node:test";
import assert from "node:assert/strict";
import { reduceVoiceNoiseSamples } from "./audio-noise.ts";

test("voice noise reducer preserves length and reduces a steady low-level tone", () => {
  const sampleRate = 48000;
  const samples = new Float32Array(sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const noise = 0.01 * Math.sin(2 * Math.PI * 120 * i / sampleRate);
    const speech = i > sampleRate / 2 ? 0.3 * Math.sin(2 * Math.PI * 220 * i / sampleRate) : 0;
    samples[i] = noise + speech;
  }
  const cleaned = reduceVoiceNoiseSamples(samples, sampleRate, 0.78);
  assert.equal(cleaned.length, samples.length);
  const rms = (xs: Float32Array, from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += xs[i] * xs[i];
    return Math.sqrt(sum / Math.max(1, to - from));
  };
  assert.ok(rms(cleaned, 0, sampleRate / 2) < rms(samples, 0, sampleRate / 2));
  assert.ok(rms(cleaned, sampleRate / 2, samples.length) > 0.1);
});

test("voice noise reducer validates parameters", () => {
  assert.throws(() => reduceVoiceNoiseSamples(new Float32Array(2), 0, 0.5), /positive/);
  assert.throws(() => reduceVoiceNoiseSamples(new Float32Array(2), 48000, 2), /between 0 and 1/);
});
