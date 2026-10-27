import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpleeterSpectrum, synthesizeSpleeterStem } from "./spleeter-audio.ts";

test("Spleeter masks reconstruct both channels, including high frequencies and track boundaries", () => {
  const length = 13_003;
  const left = Float32Array.from({ length }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 440 * i / 44100) + 0.1 * Math.sin(2 * Math.PI * 15000 * i / 44100));
  const right = Float32Array.from({ length }, (_, i) => 0.15 * Math.cos(2 * Math.PI * 220 * i / 44100));
  left[0] = 0.7; right[length - 1] = -0.6;
  const spectrum = createSpleeterSpectrum([left, right]);
  // Different estimates still produce masks whose sum is one, including padded high bins.
  const estimates = [1, 2, 3, 4].map((gain) => Float32Array.from(spectrum.magnitude, (value) => value * gain));
  const stems = estimates.map((_, stem) => synthesizeSpleeterStem(spectrum, estimates, stem));
  for (let channel = 0; channel < 2; channel++) {
    const original = channel === 0 ? left : right;
    let maxError = 0;
    for (let i = 0; i < length; i++) maxError = Math.max(maxError, Math.abs(stems.reduce((sum, stem) => sum + stem[channel][i], 0) - original[i]));
    assert.ok(maxError < 0.00002, `channel ${channel} reconstruction error ${maxError}`);
  }
});
