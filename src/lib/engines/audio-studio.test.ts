import assert from "node:assert/strict";
import test from "node:test";
import { amplitudeDbfs, approximateLufs, browserSeparationLimitSeconds, estimateBpm, estimateBitrateKbpsFromSize, estimateBrowserSeparationWorkingSetBytes, estimateCompressedAudioBytes, estimateKey, estimatePcmAudioBytes, humReduceSamples, isSupportedDemucsStemTensorDims, noiseGateSamples, rms, suggestCapoShapes, suggestDiatonicChords, trimSilenceBounds } from "./audio-studio.ts";
import { analyzeMusicAudio, type MusicAnalysisResult } from "./music-analysis.ts";
import { createMusicAnalysisProfile } from "../media/music-analysis-profile.ts";
import { normalizeMusicModelClassification } from "../media/music-analysis-response.ts";
import { migrateMusicAnalysisV1ToV2, migrateMusicDatasetAnalysisV1ToV2, migrateMusicProfileV1ToV2 } from "../media/music-analysis-migration.ts";
import { MusicDatasetInputError, validateMusicDatasetSaveBody } from "../media/music-dataset-validation.ts";

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
    sourceSha256: "ab".repeat(32),
  });
  assert.equal(result.schema_version, "env.music-analysis.v2");
  assert.equal(result.fingerprint.file_sha256, "ab".repeat(32));
  assert.equal(result.fingerprint.exact_match_method, "sha-256-exact-file-bytes");
  assert.match(result.fingerprint.note, /byte-identical files only/);
  assert.equal(result.audio.duration_seconds, 4);
  assert.equal(result.audio.metric_scope_seconds, 4, "whole-track audio metrics must report their full-track scope");
  assert.equal(result.rhythm.analysis_scope_seconds, 4);
  assert.equal(result.tonality.analysis_scope_seconds, 4);
  assert.equal(result.timbre.spectral_scope_seconds, 4);
  assert.equal(result.timbre.zero_crossing_scope_seconds, 4);
  assert.equal(result.audio.channels, 2);
  assert.ok(result.audio.rms_dbfs !== null && result.audio.rms_dbfs < -5 && result.audio.rms_dbfs > -15);
  assert.ok(result.audio.rms_loudness_proxy_db !== null);
  assert.ok(Math.abs((result.audio.rms_loudness_proxy_db ?? 0) - (result.audio.rms_dbfs ?? 0) + 0.691) < 0.02, "RMS-derived proxy must match its documented offset");
  assert.equal(result.audio.clipped_sample_percent, 0);
  assert.equal(result.metadata.title, "Known Title");
  assert.equal(result.metadata.embedded_genre, "Tagged genre");
  assert.equal(result.metadata.tagged_bpm, 120);
  assert.ok(result.timbre.spectral_centroid_hz !== null && Math.abs(result.timbre.spectral_centroid_hz - 440) < 80);
  assert.equal(result.classification.genre, null);
  assert.equal(result.classification.sub_style, null);
  assert.deepEqual(result.classification.language, []);
  assert.equal(result.classification.status, "human_review_required");
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
  assert.equal(result.classification.status, "human_review_required");
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
      status: "historical_model_result",
      note: "Best-effort model predictions.",
    },
  };

  const profile = createMusicAnalysisProfile(classified);
  assert.equal(profile.schema_version, "env.music-profile.v2");
  assert.equal(profile.genre, "Afrobeats");
  assert.equal(profile.sub_style, "Afro-pop");
  assert.deepEqual(profile.language, ["Nigerian Pidgin", "Yoruba"]);
  assert.equal(profile.tempo_bpm, local.rhythm.tempo_bpm);
  assert.equal(profile.title, "Demo");
  assert.equal(profile.metadata.embedded_genre, "Legacy file tag");
  assert.equal(profile.analysis_status.genre, "unknown");
  assert.equal(profile.analysis_status.language, "unknown");
  assert.equal(profile.analysis_status.sub_style, "unknown");
  assert.equal(profile.analysis_status.mood, "unknown");
  assert.equal(profile.analysis_status.instruments, "unknown");
  assert.equal(profile.analysis_status.vocal_style, "unknown");
  assert.equal(profile.analysis_status.tempo_bpm, "signal_estimate");
  assert.equal(profile.analysis_status.classification, "historical_model_result");
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
  assert.equal(profile.analysis_status.classification, "human_review_required");
  assert.equal(profile.analysis_status.tempo_bpm, "unavailable");
});


test("Music Analyzer migrates v1 detail exports to v2 without relabeling the RMS proxy as LUFS", () => {
  const migrated = migrateMusicAnalysisV1ToV2({
    schema_version: "env.music-analysis.v1",
    source: { file_name: "long-track.wav" },
    audio: {
      duration_seconds: 183.4,
      estimated_loudness_lufs: -12.75,
      metric_scope_seconds: 30,
      rms_dbfs: -12.059,
    },
    rhythm: { tempo_bpm: 120 },
    tonality: { key: "C major" },
    timbre: { spectral_centroid_hz: 2200 },
    classification: { status: "requires_model", note: "No model ran." },
  });
  const audio = migrated.audio as Record<string, unknown>;
  const rhythm = migrated.rhythm as Record<string, unknown>;
  const tonality = migrated.tonality as Record<string, unknown>;
  const timbre = migrated.timbre as Record<string, unknown>;
  assert.equal(migrated.schema_version, "env.music-analysis.v2");
assert.equal((migrated.classification as Record<string, unknown>).status, "human_review_required");
  assert.equal(audio.rms_loudness_proxy_db, -12.75);
  assert.equal(Object.hasOwn(audio, "estimated_loudness_lufs"), false);
  assert.equal(audio.metric_scope_seconds, 183.4, "the old analyzer measured full-track technical statistics");
  assert.equal(migrated.fingerprint && (migrated.fingerprint as Record<string, unknown>).exact_match_method, "not-computed");
  assert.equal(rhythm.analysis_scope_seconds, 90);
  assert.equal(tonality.analysis_scope_seconds, 30);
  assert.equal(timbre.spectral_scope_seconds, 30);
  assert.equal(timbre.zero_crossing_scope_seconds, 183.4);
  assert.deepEqual(migrateMusicAnalysisV1ToV2(migrated), migrated, "migrating a v2 report is idempotent");
});

test("Music Analyzer profile migration preserves values but removes unverifiable v1 semantic provenance", () => {
  const migrated = migrateMusicProfileV1ToV2({
    schema_version: "env.music-profile.v1",
    genre: "Afrobeats",
    language: ["Nigerian Pidgin", "Yoruba"],
    duration_seconds: 183.4,
    audio_metrics: {
      duration_seconds: 183.4,
      rms_dbfs: -12.059,
      estimated_loudness_lufs: -12.75,
      metric_scope_seconds: 30,
    },
    analysis_status: {
      genre: "model_estimate",
      sub_style: "model_estimate",
      language: "model_estimate",
      mood: "unknown",
      instruments: "model_estimate",
      vocal_style: "unknown",
      tempo_bpm: "signal_estimate",
      key: "signal_estimate",
      file_metadata: "embedded_metadata",
      classification: "model_completed",
    },
  });
  const status = migrated.analysis_status as Record<string, unknown>;
  assert.equal(migrated.schema_version, "env.music-profile.v2");
  assert.equal(migrated.genre, "Afrobeats");
  assert.deepEqual(migrated.language, ["Nigerian Pidgin", "Yoruba"]);
  const audioMetrics = migrated.audio_metrics as Record<string, unknown>;
  assert.equal(audioMetrics.rms_loudness_proxy_db, -12.75);
  assert.equal(Object.hasOwn(audioMetrics, "estimated_loudness_lufs"), false);
  assert.equal(audioMetrics.metric_scope_seconds, 183.4);
  assert.equal((migrated.fingerprint as Record<string, unknown>).exact_match_method, "not-computed");
  assert.equal(status.genre, "unknown");
  assert.equal(status.sub_style, "unknown");
  assert.equal(status.language, "unknown");
  assert.equal(status.instruments, "unknown");
  assert.equal(status.tempo_bpm, "signal_estimate");
  assert.equal(status.file_metadata, "embedded_metadata");
  assert.equal(status.classification, "historical_model_result", "historical classifier completion is preserved without claiming verified source provenance");
  assert.deepEqual(migrateMusicProfileV1ToV2(migrated), migrated, "migrating a v2 profile is idempotent");
});

test("Music dataset migration does not invent historical repeated-passage findings", () => {
  const migrated = migrateMusicDatasetAnalysisV1ToV2({
    schema_version: "env.music-dataset-analysis.v1",
    source: { file_name: "old-track.wav", duration_seconds: 42 },
    structure: {
      change_points: [{ time_seconds: 8, change_score: 0.4, reason: "feature change" }],
      sections: [{ start_seconds: 0, end_seconds: 42, label: "section_1", label_source: "automatic_feature_change", semantic_section: null }],
      note: "Legacy section report",
    },
  });
  const structure = migrated.structure as Record<string, unknown>;
  assert.equal(migrated.schema_version, "env.music-dataset-analysis.v2");
  assert.deepEqual(structure.change_points, [{ time_seconds: 8, change_score: 0.4, reason: "feature change" }]);
  assert.deepEqual(structure.repetition_candidates, []);
  assert.match(String(structure.repetition_note), /Not evaluated in this migrated v1 record/);
  assert.deepEqual(migrateMusicDatasetAnalysisV1ToV2(migrated), migrated, "migrating a v2 dataset report is idempotent");
});

test("Music Analyzer schema migrations reject unsupported versions and invalid duration", () => {
  assert.throws(() => migrateMusicAnalysisV1ToV2({ schema_version: "env.music-analysis.v9" }), /Unsupported music-analysis schema/);
  assert.throws(() => migrateMusicAnalysisV1ToV2({
    schema_version: "env.music-analysis.v1",
    audio: { duration_seconds: Number.NaN },
    rhythm: {}, tonality: {}, timbre: {},
  }), /duration_seconds must be a positive finite number/);
  assert.throws(() => migrateMusicProfileV1ToV2({ schema_version: "v0" }), /Unsupported music-profile schema/);
  assert.throws(() => migrateMusicDatasetAnalysisV1ToV2({ schema_version: "v0" }), /Unsupported music-dataset-analysis schema/);
});


test("Music Analyzer dataset migration creates the persistent owner-scoped schema in isolated PGLite", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const database = new PGlite();
  try {
    await database.waitReady;
    await database.exec('create table "user" (id text primary key)');
    const migration = await readFile(new URL("../../../migrations/0009_music_dataset.sql", import.meta.url), "utf8");
    await database.exec(migration);

    const expected = [
      "music_tracks", "music_analysis_runs", "music_feature_frames",
      "music_analysis_events", "music_annotations", "music_collections",
      "music_collection_tracks", "music_dataset_api_limits",
    ];
    const tableResult = await database.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_name = any($1)",
      [expected],
    );
    assert.deepEqual(tableResult.rows.map((row) => row.table_name).sort(), [...expected].sort());

    const columnResult = await database.query<{ table_name: string; column_name: string }>(
      "select table_name,column_name from information_schema.columns where table_schema='public' and table_name = any($1)",
      [["music_tracks", "music_analysis_runs", "music_feature_frames", "music_analysis_events", "music_annotations"]],
    );
    const columnKeys = new Set(columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const key of [
      "music_tracks.user_id", "music_tracks.source_sha256", "music_tracks.search_text",
      "music_tracks.rights_status", "music_analysis_runs.idempotency_key",
      "music_analysis_runs.result_checksum", "music_feature_frames.frame_index",
      "music_feature_frames.start_seconds", "music_analysis_events.event_type",
      "music_analysis_events.start_seconds", "music_annotations.field_key",
      "music_annotations.source", "music_annotations.review_state",
    ]) {
      assert.ok(columnKeys.has(key), `Persistent dataset schema missing ${key}`);
    }

    const indexes = await database.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname='public' and indexname in ('music_tracks_owner_hash_idx','music_tracks_owner_search_idx','music_analysis_runs_track_history_idx')",
    );
    assert.equal(indexes.rows.length, 3, "Search and owner/history indexes must be applied");

    await database.query('insert into "user" (id) values ($1)', ["test-user"]);
    const consumeLimit = `insert into music_dataset_api_limits (user_id,operation,window_started_at,request_count)
      values ($1,$2,now(),1)
      on conflict (user_id,operation) do update set
        window_started_at = case
          when music_dataset_api_limits.window_started_at <= now() - ($4::int * interval '1 second') then now()
          else music_dataset_api_limits.window_started_at
        end,
        request_count = case
          when music_dataset_api_limits.window_started_at <= now() - ($4::int * interval '1 second') then 1
          else least(music_dataset_api_limits.request_count + 1, $3::int + 1)
        end,
        updated_at = now()
      returning request_count, request_count <= $3::int as allowed`;
    const firstLimit = await database.query<{ request_count: number; allowed: boolean }>(consumeLimit, ["test-user", "read", 2, 3600]);
    const secondLimit = await database.query<{ request_count: number; allowed: boolean }>(consumeLimit, ["test-user", "read", 2, 3600]);
    const thirdLimit = await database.query<{ request_count: number; allowed: boolean }>(consumeLimit, ["test-user", "read", 2, 3600]);
    const fourthLimit = await database.query<{ request_count: number; allowed: boolean }>(consumeLimit, ["test-user", "read", 2, 3600]);
    assert.deepEqual([firstLimit.rows[0]?.allowed, secondLimit.rows[0]?.allowed, thirdLimit.rows[0]?.allowed, fourthLimit.rows[0]?.allowed], [true, true, false, false]);
    assert.equal(fourthLimit.rows[0]?.request_count, 3, "the durable counter saturates at limit + 1 under repeated excess requests");
  } finally {
    await database.close();
  }
});


function validMusicDatasetSavePayload(): Record<string, unknown> {
  const hash = "ab".repeat(32);
  return {
    idempotency_key: "123e4567-e89b-42d3-a456-426614174000",
    file: {
      name: "test-track.wav",
      size_bytes: 176400,
      mime_type: "audio/wav",
      source_sha256: hash,
      source_metadata: { title: "Test Track", artist: "enV test" },
      normalized_metadata: { title: "Test Track", artist: "enV test" },
      rights_status: "user_owned",
    },
    analysis: {
      schema_version: "env.music-analysis.v2",
      fingerprint: { file_sha256: hash, exact_match_method: "sha-256-exact-file-bytes", note: "Exact bytes only." },
      source: { file_name: "test-track.wav", mime_type: "audio/wav", file_size_bytes: 176400 },
      metadata: { title: "Test Track", artist: "enV test", album: null },
      audio: { duration_seconds: 5, sample_rate_hz: 44100, channels: 2, rms_dbfs: -12, metric_scope_seconds: 5, rms_loudness_proxy_db: -12.691 },
      rhythm: { tempo_bpm: 120, analysis_scope_seconds: 5, status: "estimated", method: "fixture" },
      tonality: { key: "A minor", analysis_scope_seconds: 5, status: "estimated", method: "fixture" },
      timbre: { spectral_centroid_hz: 1000, spectral_scope_seconds: 5, zero_crossing_scope_seconds: 5, interpretation: "fixture" },
      classification: { status: "human_review_required", genre: null, sub_style: null, language: [], mood: [], instruments: [], vocal_style: null, genre_candidates: [], note: "Human review required." },
    },
    dataset_analysis: {
      schema_version: "env.music-dataset-analysis.v2",
      fingerprint: { file_sha256: hash, exact_match_method: "sha-256-exact-file-bytes", note: "Exact bytes only." },
      source: { file_name: "test-track.wav", sample_rate_hz: 44100, channels: 2, frame_count: 220500, duration_seconds: 5 },
      processing: { method: "local-digital-signal-processing", uses_remote_api: false, uses_hosted_model: false, model_inference: false, feature_frame_seconds: 0.5, note: "fixture" },
      technical: { duration_seconds: 5, sample_rate_hz: 44100, channels: 2, peak_dbfs: -1, rms_dbfs: -12, clipped_sample_percent: 0, dc_offset_by_channel: [0, 0] },
      timeline: [
        { start_seconds: 0, end_seconds: 0.5, rms_dbfs: -12, peak_dbfs: -1, spectral_centroid_hz: 1000 },
        { start_seconds: 0.5, end_seconds: 1, rms_dbfs: -13, peak_dbfs: -2, spectral_centroid_hz: 1200 },
      ],
      pitch: { source: "full_mix_dominant_pitch_estimate", points: [{ time_seconds: 0.5, frequency_hz: 440, midi_note: 69, note: "A4", confidence: 0.8 }], lowest_detected_note: "A4", highest_detected_note: "A4", pitch_range_semitones: 0, note: "Mixed signal estimate." },
      tonality: { key_estimate: "A minor", key_method: "fixture", pitch_class_profile: [], chord_estimates: [{ start_seconds: 0, end_seconds: 2, chord: "Am", confidence: 0.8, method: "spectral-chroma-triad-template" }] },
      structure: {
        change_points: [{ time_seconds: 2, change_score: 0.4, reason: "fixture" }],
        sections: [{ start_seconds: 0, end_seconds: 5, label: "section_1", label_source: "automatic_feature_change", semantic_section: null }],
        repetition_candidates: [{ start_seconds: 0, end_seconds: 4, match_start_seconds: 1, match_end_seconds: 5, similarity_score: 0.9, method: "normalized-feature-sequence", note: "Candidate only." }],
        repetition_note: "Candidate only.",
      },
      annotations: { genre: ["Afrobeats"], mood: ["celebratory"], notes: "Reviewed against the recording.", reviewed: true, reviewer: "Reviewer A" },
      warnings: ["fixture"],
    },
  };
}

test("Music dataset save validator builds bounded, provenance-aware result rows without source audio", () => {
  const payload = validMusicDatasetSavePayload();
  const result = validateMusicDatasetSaveBody(payload, "user-123");
  assert.equal(result.fileName, "test-track.wav");
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.sourceSha256, "ab".repeat(32));
  assert.equal(result.rightsStatus, "user_owned");
  assert.equal(result.frames.length, 2);
  assert.deepEqual(result.frames.map((frame) => frame.frame_index), [0, 1]);
  assert.deepEqual(result.events.map((event) => event.event_type), [
    "pitch_point", "chord_candidate", "change_point", "section_candidate", "repetition_candidate",
  ]);
  assert.ok(result.annotations.some((annotation) => annotation.field_key === "genre" && annotation.source === "human_review" && annotation.review_state === "confirmed" && annotation.reviewer_id === "user-123"));
  assert.equal((result.datasetSummary.timeline as unknown[]).length, 0, "time series are stored as paginated frame rows rather than duplicated in the run summary");
  assert.match(result.resultChecksum, /^[a-f0-9]{64}$/);
  assert.match(result.trackId, /^[0-9a-f-]{36}$/i);
  assert.match(result.runId, /^[0-9a-f-]{36}$/i);
});

test("Music dataset validator rejects schema mismatches, inconsistent hashes, invalid timestamps and missing idempotency", () => {
  const wrongSchema = validMusicDatasetSavePayload();
  (wrongSchema.analysis as Record<string, unknown>).schema_version = "env.music-analysis.v1";
  assert.throws(() => validateMusicDatasetSaveBody(wrongSchema, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && /Only env.music-analysis.v2/.test(error.message));

  const inconsistentHash = validMusicDatasetSavePayload();
  const data = inconsistentHash.dataset_analysis as Record<string, unknown>;
  const fingerprint = data.fingerprint as Record<string, unknown>;
  fingerprint.file_sha256 = "cd".repeat(32);
  assert.throws(() => validateMusicDatasetSaveBody(inconsistentHash, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && /different source hashes/.test(error.message));

  const invalidTimeline = validMusicDatasetSavePayload();
  const invalidData = invalidTimeline.dataset_analysis as Record<string, unknown>;
  invalidData.timeline = [{ start_seconds: 2, end_seconds: 1 }];
  assert.throws(() => validateMusicDatasetSaveBody(invalidTimeline, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && /invalid time boundaries/.test(error.message));

  const missingKey = validMusicDatasetSavePayload();
  delete missingKey.idempotency_key;
  assert.throws(() => validateMusicDatasetSaveBody(missingKey, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && /idempotency_key is required/.test(error.message));
});

test("Music dataset validator caps oversized feature/event arrays and annotation lists", () => {
  const tooManyFrames = validMusicDatasetSavePayload();
  const frameData = tooManyFrames.dataset_analysis as Record<string, unknown>;
  frameData.timeline = Array.from({ length: 5_001 }, (_, index) => ({ start_seconds: index * 0.5, end_seconds: index * 0.5 + 0.5 }));
  assert.throws(() => validateMusicDatasetSaveBody(tooManyFrames, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && error.status === 413);

  const tooManyEvents = validMusicDatasetSavePayload();
  const eventData = tooManyEvents.dataset_analysis as Record<string, unknown>;
  const pitch = eventData.pitch as Record<string, unknown>;
  pitch.points = Array.from({ length: 10_001 }, (_, index) => ({ time_seconds: index * 0.0001, frequency_hz: 440, midi_note: 69, note: "A4", confidence: 0.8 }));
  assert.throws(() => validateMusicDatasetSaveBody(tooManyEvents, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && error.status === 413);

  const tooManyLabels = validMusicDatasetSavePayload();
  const labels = (tooManyLabels.dataset_analysis as Record<string, unknown>).annotations as Record<string, unknown>;
  labels.genre = Array.from({ length: 81 }, (_, index) => `tag-${index}`);
  assert.throws(() => validateMusicDatasetSaveBody(tooManyLabels, "user-123"), (error: unknown) => error instanceof MusicDatasetInputError && /too many values/.test(error.message));
});
