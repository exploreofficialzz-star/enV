# Music Analyzer — local DSP contract

## Processing policy

The Music Analyzer uses deterministic signal processing and embedded metadata parsing. It does **not** run or host AI/ML models, download model weights, call a hosted classifier, transcribe lyrics, or send source audio to an AI service.

The retired `POST /api/music-analysis` endpoint returns HTTP 410 (`MUSIC_ANALYSIS_MODEL_DISABLED`) and does not read or forward the request body. The `MUSIC_ANALYSIS_ENDPOINT` and `MUSIC_ANALYSIS_TOKEN` environment settings are intentionally removed. Do not re-enable this route or add a remote inference path without separate approval.

Semantic fields such as genre, sub-style, language, mood, instrument identity, lyrics/theme, vocal role and detailed vocal delivery remain unknown unless supplied and reviewed by a human through the annotation workflow. Embedded ID3/container tags are preserved as metadata, not promoted into confirmed classifications. Rule-derived cues and signal measurements must remain distinct from semantic labels.

## Current execution boundaries

- Web Music Analyzer decodes locally through the browser's Web Audio APIs. The current implementation retains a 25 MiB file limit and a two-minute duration limit as memory-safety guards. These are local-device limits, not claimed media-format limits.
- Native Android/iOS offline analysis uses each platform's native WAV path and exposes platform-specific input/resource limits. The native paths do not embed the web app or run a hosted model.
- The existing FFmpeg processor provides bounded media conversion operations. It is **not yet** a durable Music Analyzer DSP job queue: do not treat its availability as proof of full-track analysis, resumable analysis jobs, or persisted cloud datasets.
- Long-track and batch analysis require a separately implemented non-model DSP worker/job path, validated resource budgets, authenticated ownership, actual job states/cancellation, checkpointing and explicit consent before upload. Until that path is deployed and verified, the Analyzer must keep its device safety guard instead of increasing limits speculatively.
- Browser IndexedDB, where used elsewhere in enV, is quota-limited and may be evicted. A local export is a user-controlled copy, not a claim of a durable server backup.

## Measurement contract

The detailed signal contract is `env.music-analysis.v2`. The compact profile contract is `env.music-profile.v2`. The time-series dataset contract is `env.music-dataset-analysis.v2`.

- `peak_dbfs` is the maximum decoded sample peak; it is not true peak in dBTP.
- `rms_dbfs` is the RMS level in dBFS for the reported analysis scope.
- `rms_loudness_proxy_db` is a fixed-offset, RMS-derived decibel proxy. It is **not** integrated LUFS and does not implement standards-compliant EBU R 128 / ITU-R BS.1770 K-weighting and gating.
- `fingerprint.file_sha256` is SHA-256 of the exact original file bytes and supports byte-identical duplicate detection only. It is not an acoustic fingerprint. Old v1 exports cannot reconstruct this hash and migrate with `file_sha256: null` and `exact_match_method: "not-computed"`.
- `silence_percent` is based on 100 ms windows below the current threshold; it is not a perceptual silence judgment.
- Scope fields are per section: `audio.metric_scope_seconds` describes full-track audio-quality statistics; `rhythm.analysis_scope_seconds` is capped at 90 seconds; `tonality.analysis_scope_seconds` and `timbre.spectral_scope_seconds` are capped at 30 seconds; `timbre.zero_crossing_scope_seconds` spans the full first channel. The associated method text states these excerpt limits.
- Tempo, key, chords, dominant pitch, spectral descriptors and feature-change sections are estimates/candidates. Full-mix dominant pitch is not a vocal melody or vocal register.
- Harmonic/percussive and frequency/spatial outputs are candidate signal layers, not clean source-separated stems.
- Repetition candidates compare normalized 8-second feature sequences at 4-second steps. Scores are similarity measures, not probabilities or proof of identical audio; near-silence and almost-flat feature windows are excluded.
- Unknown measurements are null/unavailable; semantic facts are not inferred from tempo, spectrum or other signal metrics.

A schema change that renames the RMS proxy from the misleading `estimated_loudness_lufs` field is versioned as v2. Consumers must not interpret the legacy field as a standards loudness result.

## Private dataset library currently implemented on this branch

The branch adds migration `migrations/0009_music_dataset.sql` and owner-scoped server handlers at `/api/music-dataset/tracks`, `/api/music-dataset/tracks/:id` and `/api/music-dataset/runs/:id`.

- `GET /api/music-dataset/tracks?page=1&limit=20&q=...` returns a bounded, searchable list. The server caps page size at 100 and queries only the verified user's rows.
- `POST /api/music-dataset/tracks` saves validated v2 result JSON, technical/source metadata, time-aligned feature frames, event rows, label/review revisions and a result checksum in one database transaction. The request is capped at 4 MiB and requires a UUID idempotency key.
- `GET /api/music-dataset/tracks/:id` returns the caller's track and latest annotation revisions.
- `GET /api/music-dataset/runs/:id?frames_offset=0&frames_limit=200&events_offset=0&events_limit=200` returns separately paginated frames and events. Each page is capped at 500 records.
- `DELETE /api/music-dataset/tracks/:id` removes that user's track and cascaded analysis, event, feature, collection-membership and annotation rows.
- Tracks, runs, frames, events, and annotations use owner-scoped keys/foreign keys. Analysis runs retain immutable results/checksums; annotation edits are represented as later history rows. Exact SHA-256 matches are returned as candidates, never automatically merged.

Cloud dataset access requires a configured database, and verified authentication must be enabled/configured. Deployment must apply `npm run db:migrate` so the `0009_music_dataset.sql` migration is installed. The API reports an auth/configuration failure when that prerequisite is absent; it does not claim a saved record exists in that case. The web UI uploads only structured results and metadata for this save operation, not the original audio. A client-computed SHA-256 is stored with `source_sha256_verified=false`; it is an unverified duplicate candidate, not a server-verified source identity.

This establishes the private result-library baseline, not the entire target product. Full source-upload/object storage, a durable background DSP worker with real job state/cancellation/restart recovery, batch processing, 10,000-track load testing, cloud result reconstruction/export, native Android/iOS cloud-library UX, and corpus-based accuracy benchmarks remain to be implemented and verified.

## Dataset and provenance expectations

Keep source metadata, DSP measurements, user annotations, and reviewer-confirmed labels separate. The dataset migration uses separate track, run, feature-frame, event, collection and annotation tables rather than one unbounded timeline JSON. Exported data should contain schema/engine versions, measurement methods and units, annotation provenance, unknown/missing fields, rights/retention state and checksums when available.

## Verification status

The contract updates in this branch add regression assertions for the v2 loudness field and retire the old model-forwarding endpoint. They do not by themselves implement a durable worker queue, standards-compliant LUFS/true-peak analysis, cloud dataset persistence, 10,000-track pagination, or a reference-corpus accuracy benchmark. Those capabilities must be implemented and verified separately; do not advertise them as active until that evidence exists.
