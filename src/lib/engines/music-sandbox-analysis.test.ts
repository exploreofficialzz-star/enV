import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSandboxAudio, applySandboxAnalysis, sandboxAnalysisLimit } from "./music-sandbox-analysis.ts";
import { newSandboxFolder, newSandboxTrack } from "./music-sandbox.ts";

const audio = { filename: "track.wav", extension: "wav", size: 1000, format: "WAV", sampleRate: 44100, channels: 2, bitDepth: 16 };
const result = { status: "complete" as const, analyzedSeconds: 45, tempo: 110, key: "A minor", peakDbfs: -2, rmsDbfs: -12, clippedPercent: 0, silencePercent: 2, spectralCentroidHz: 1400 };

test("device budget rejects unknown, short and oversized decoded audio", () => {
  assert.match(sandboxAnalysisLimit(audio, null)!, /readable/);
  assert.match(sandboxAnalysisLimit(audio, 2)!, /3 seconds/);
  assert.equal(sandboxAnalysisLimit(audio, 180), null);
  assert.match(sandboxAnalysisLimit(audio, 800)!, /too large/);
  assert.match(sandboxAnalysisLimit({ ...audio, channels: 12 }, 30)!, /too large/);
});

test("estimates fill empty fields but never replace imported or intentionally edited values", () => {
  const track = newSandboxTrack(newSandboxFolder("Afro fusion"), "song");
  const filled = applySandboxAnalysis(track, result);
  assert.equal(filled.tags.tempo_bpm, 110);
  assert.equal(filled.tags.key, "A minor");
  assert.equal(filled.provenance.tempo_bpm, "estimated");
  assert.equal(track.tags.tempo_bpm, null, "the source object remains untouched");
  const imported = applySandboxAnalysis({ ...track, tags: { ...track.tags, tempo_bpm: 97, key: "C major" }, provenance: { tempo_bpm: "imported", key: "edited" } }, result);
  assert.equal(imported.tags.tempo_bpm, 97);
  assert.equal(imported.tags.key, "C major");
  const intentionallyBlank = applySandboxAnalysis({ ...track, provenance: { tempo_bpm: "edited", key: "edited" } }, result);
  assert.equal(intentionallyBlank.tags.tempo_bpm, null);
  assert.equal(intentionallyBlank.tags.key, "");
  const refreshed = applySandboxAnalysis(filled, { ...result, tempo: null, key: null });
  assert.equal(refreshed.tags.tempo_bpm, null);
  assert.equal(refreshed.tags.key, "");
});

test("unavailable analysis leaves existing metadata intact", async () => {
  const track = newSandboxTrack(newSandboxFolder("Folder"), "song");
  const unavailable = await analyzeSandboxAudio(new Blob(), audio, null, new AbortController().signal);
  const next = applySandboxAnalysis(track, unavailable);
  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(next.tags, track.tags);
});
