import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_STUDIO_PRESET_FORMAT,
  MAX_AUDIO_STUDIO_PRESET_BYTES,
  createAudioStudioPresetFile,
  normalizePortableAudioSettings,
  parseAudioStudioPresetFile,
} from "./audio-studio-preset-file.ts";

const validSettings = {
  presetId: "pop", micGain: 100, backingGain: 70, eqBandsDb: Array(10).fill(0), eqProfile: "flat",
  highPassHz: null, lowPassHz: null, compressorThresholdDb: -20, compressorRatio: 3, outputGainDb: 0,
  reverbAmount: 100, delayAmount: 100, effectAmount: 100, ampCharacter: "clean", ampDrive: 25,
  ampBassDb: 0, ampMidDb: 0, ampTrebleDb: 0,
};

test("portable studio presets round-trip as control-only versioned JSON", () => {
  const preset = createAudioStudioPresetFile("Warm vocal", validSettings, "2026-10-16T10:00:00.000Z");
  assert.ok(preset);
  assert.equal(preset.format, AUDIO_STUDIO_PRESET_FORMAT);
  assert.equal(preset.version, 1);
  assert.equal(parseAudioStudioPresetFile(JSON.stringify(preset))?.name, "Warm vocal");
  assert.deepEqual(parseAudioStudioPresetFile(JSON.stringify(preset))?.settings, preset.settings);
  assert.equal(JSON.stringify(preset).includes("recording"), false);
});

test("portable preset normalizer clamps hostile or malformed numeric values", () => {
  const preset = normalizePortableAudioSettings({ ...validSettings, micGain: 1_000_000, eqBandsDb: Array(10).fill(99), compressorRatio: -5, ampCharacter: "evil" });
  assert.ok(preset);
  assert.equal(preset.micGain, 150);
  assert.deepEqual(preset.eqBandsDb, Array(10).fill(9));
  assert.equal(preset.compressorRatio, 1);
  assert.equal(preset.ampCharacter, "clean");
  assert.equal(normalizePortableAudioSettings({ ...validSettings, highPassHz: "max" })?.highPassHz, null);
  assert.equal(normalizePortableAudioSettings({ ...validSettings, lowPassHz: -10 })?.lowPassHz, 1_000);
});

test("portable preset import rejects malformed, unknown-version and oversized files", () => {
  assert.equal(parseAudioStudioPresetFile("not json"), null);
  assert.equal(parseAudioStudioPresetFile(JSON.stringify({ format: AUDIO_STUDIO_PRESET_FORMAT, version: 2, name: "x", settings: validSettings })), null);
  assert.equal(parseAudioStudioPresetFile(JSON.stringify({ format: AUDIO_STUDIO_PRESET_FORMAT, version: 1, name: "x", settings: { ...validSettings, presetId: "not-a-preset" } })), null);
  assert.equal(parseAudioStudioPresetFile("x".repeat(MAX_AUDIO_STUDIO_PRESET_BYTES + 1)), null);
  assert.equal(createAudioStudioPresetFile("  ", validSettings), null);
});
