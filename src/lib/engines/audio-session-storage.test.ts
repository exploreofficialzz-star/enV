import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_SESSION_MAX_BYTES,
  AUDIO_SESSION_TTL_MS,
  loadAudioSessionFile,
  saveAudioSessionFile,
} from "./audio-session-storage.ts";

test("audio handoff uses a bounded seven-day local session", () => {
  assert.equal(AUDIO_SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(AUDIO_SESSION_MAX_BYTES, 250 * 1024 * 1024);
});

test("empty files are rejected before browser storage is accessed", async () => {
  const empty = new File([], "empty.wav", { type: "audio/wav" });
  await assert.rejects(saveAudioSessionFile(empty), /empty/);
});

test("oversized file metadata is rejected before a copy is made", async () => {
  // A metadata-only File shape exercises the guard without allocating 250 MB.
  const oversized = { size: AUDIO_SESSION_MAX_BYTES + 1, name: "large.wav" } as File;
  await assert.rejects(saveAudioSessionFile(oversized), /no larger than 250 MB/);
});

test("empty and untrusted session IDs never open local storage", async () => {
  assert.equal(await loadAudioSessionFile(""), null);
  assert.equal(await loadAudioSessionFile("x".repeat(201)), null);
});
