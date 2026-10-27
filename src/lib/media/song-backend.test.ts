import assert from "node:assert/strict";
import { test } from "node:test";
import { prefersSongBackend, runBackendSong, songBackendArtifact, songBackendAvailable } from "./song-backend.ts";

test("routing prefers the backend on phones and limited-memory devices", () => {
  assert.equal(prefersSongBackend({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS)" }), true);
  assert.equal(prefersSongBackend({ deviceMemory: 4 }), true);
  assert.equal(prefersSongBackend({ userAgent: "Desktop", deviceMemory: 16 }), false);
});

test("backend uploads explicitly, validates provenance and returns a usable artifact URL", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  const id = "1".repeat(32);
  const response = { schema_version: "env.local-song.v1", filename: "song.wav", source_sha256: "a".repeat(64), metadata: {},
    signal: { duration_seconds: 2, tempo_bpm: null, key: null, sections: [] }, candidates: {}, learned_tags: {}, windows: [],
    lyrics: { status: "not_requested", language: null, language_score: null, segments: [] }, llm: null,
    model: { encoder: null, learning: { reviewed_tracks: 0, model_version: null, evaluation: null }, score_meaning: "review" },
    processing: { location: "remote_backend", hosted_inference: true, audio_retention_seconds: 3600, tagging_coverage: "not_run" },
    artifacts: [{ name: "stems/test/vocals.wav", kind: "stem", bytes: 100 }], warnings: [], reviewed: false };
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/v1/health")) return Response.json({ schema_version: "env.local-song.v1", location: "remote_backend", ffmpeg: true, tagger_installed: true, tagger_loaded: false, transcription_configured: true, stems_configured: true, learning: response.model.learning });
    if (url.endsWith("/v1/jobs")) { assert.ok(init?.body instanceof FormData); return Response.json({ id }, { status: 202 }); }
    return Response.json({ id, state: "completed", stage: "Ready", progress: 100, error: null, result: response });
  };
  try {
    assert.equal(await songBackendAvailable(), true);
    const progress: string[] = [];
    const result = await runBackendSong(new File(["audio"], "song.wav"), { tagging: true, transcription: true, stems: false, pieces: false, llm: false }, new AbortController().signal, (stage) => progress.push(stage));
    assert.equal(result.id, id);
    assert.equal(result.result.processing.hosted_inference, true);
    assert.match(songBackendArtifact(id, "stems/test/vocals.wav"), /\/v1\/jobs\/1{32}\/artifacts\/stems\/test\/vocals.wav$/);
    assert.throws(() => songBackendArtifact(id, "../secret"));
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET"]);
    assert.ok(progress.some((stage) => stage.includes("backend")));
  } finally { globalThis.fetch = original; }
});
