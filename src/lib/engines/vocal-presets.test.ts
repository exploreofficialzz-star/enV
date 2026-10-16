import test from "node:test";
import assert from "node:assert/strict";
import { EQ_BAND_FREQUENCIES, EQ_PROFILES, getVocalPreset, VOCAL_PRESETS } from "./vocal-presets.ts";

test("vocal effect presets contain bounded, explicit local DSP settings", () => {
  assert.ok(VOCAL_PRESETS.length >= 15);
  for (const id of ["clean", "warm", "pop", "rap", "dream-hall", "slapback", "lofi", "telephone", "wide-chorus", "studio-room", "ambient", "megaphone", "vocal-double", "podcast", "acoustic", "rnb", "arena", "natural-tune", "hard-tune"]) assert.ok(VOCAL_PRESETS.some((preset) => preset.id === id), `missing preset ${id}`);
  for (const preset of VOCAL_PRESETS) {
    assert.ok(preset.id && preset.label && preset.description);
    assert.ok(preset.highPassHz >= 0 && preset.highPassHz < 2000);
    assert.ok(preset.compressorThresholdDb >= -60 && preset.compressorThresholdDb <= 0);
    assert.ok(preset.compressorRatio >= 1 && preset.compressorRatio <= 20);
  }
});

test("pitch correction is never falsely represented as an available local effect", () => {
  for (const preset of VOCAL_PRESETS.filter((item) => item.requiresPitchProcessor)) {
    assert.equal(preset.available, false);
    assert.match(preset.description, /requires a configured .*pitch-correction engine/i);
  }
});

test("unknown preset safely resolves to Clean Studio", () => {
  assert.equal(getVocalPreset("invented").id, "clean");
});


test("graphic EQ uses ten ordered frequency bands and bounded profile values", () => {
  assert.equal(EQ_BAND_FREQUENCIES.length, 10);
  assert.deepEqual([...EQ_BAND_FREQUENCIES], [...EQ_BAND_FREQUENCIES].sort((a, b) => a - b));
  assert.equal(EQ_BAND_FREQUENCIES[0], 60);
  assert.equal(EQ_BAND_FREQUENCIES.at(-1), 16000);
  assert.deepEqual(Object.keys(EQ_PROFILES).sort(), ["air", "bright", "de-ess", "flat", "intimate", "lead-vocal", "low-cut", "podcast", "radio", "soft", "vocal-clarity", "warm"].sort());
  for (const [id, profile] of Object.entries(EQ_PROFILES)) {
    assert.ok(profile.label && profile.description, `profile ${id} should be named and explained`);
    assert.equal(profile.bandsDb.length, EQ_BAND_FREQUENCIES.length, `profile ${id} should define every band`);
    for (const gain of profile.bandsDb) assert.ok(Number.isFinite(gain) && gain >= -9 && gain <= 9, `profile ${id} has an invalid band gain`);
  }
});
