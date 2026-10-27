# Music Analyzer — local DSP contract

## Processing policy

The Music Analyzer uses deterministic signal processing and embedded metadata parsing. It does **not** run or host AI/ML models, download model weights, call a hosted classifier, transcribe lyrics, or send source audio to an AI service.

The retired `POST /api/music-analysis` endpoint returns HTTP 410 (`MUSIC_ANALYSIS_MODEL_DISABLED`) and does not read or forward the request body. The `MUSIC_ANALYSIS_ENDPOINT` and `MUSIC_ANALYSIS_TOKEN` environment settings are intentionally removed. Do not re-enable this route or add a remote inference path without separate approval.

Semantic fields such as genre, sub-style, language, mood, instrument identity, lyrics/theme, vocal role and detailed vocal delivery remain unknown unless supplied and reviewed by a human through the annotation workflow. Embedded ID3/container tags are preserved as metadata, not promoted into confirmed classifications. Rule-derived cues and signal measurements must remain distinct from semantic labels.

## Current execution boundaries

- Web Music Analyzer decodes locally through the browser's Web Audio APIs and runs the heavy DSP pipeline in a dedicated module Web Worker. The original file is read locally; no audio is uploaded by the local-analysis or batch path.
- Local device guards are explicit: 25 MiB per source file, 2 minutes per track, 64 MiB decoded PCM per track, 20 files per local batch and 200 MiB combined selected bytes. The 64 MiB PCM budget is checked after decode and before channel copies are transferred to the Worker. These are product resource limits, not claimed media-format limits. Browser codec support remains the actual format capability boundary.
- Local batch work runs sequentially, with persisted per-track states and completed report data in IndexedDB, per-track failure isolation, cancellation, retry, prioritization, pause-after-current, and ZIP/JSONL/CSV exports. On reload, an interrupted in-progress item is marked as requiring the original source file again; completed reports remain available if browser storage has not been evicted.
- Saving a completed batch result to the private dataset is a separate, explicit action. That request sends structured analysis JSON and metadata only, not the source audio; per-item idempotency keys prevent duplicate cloud runs when a response is lost. Client-computed SHA-256 stays marked unverified by the server.
- Native Android/iOS offline analysis uses each platform's native WAV path and exposes platform-specific input/resource limits. These native paths are independent implementations; this web batch/Worker layer does not by itself implement native batch processing or a native cloud-library UI.
- The existing FFmpeg processor provides bounded media conversion operations. It is **not yet** a durable Music Analyzer DSP job queue: do not treat its availability as proof of cloud full-track processing, accepted-job recovery after worker restart, server-side batch tasking or persisted source audio.
- Browser IndexedDB is quota-limited and may be evicted. A local export is a user-controlled copy, not a claim of a durable server backup. Local queue state does not continue running after the browser closes or the app is suspended.

## Separate optional FFmpeg loudness report

- The local Analyzer's env.music-analysis.v2 still reports sample peak dBFS, RMS dBFS and an RMS-derived proxy. It does not silently populate LUFS or true-peak fields.
- A separate audio-loudness-report operation runs the configured FFmpeg ebur128=peak=sample+true filter for one uploaded file, limited to 15 minutes and the processor's configured request-byte limit. The processor probes actual stream metadata and calculates SHA-256 over the bytes it receives; the report returns integrated loudness LUFS, loudness range LU, sample peak dBFS, true peak dBTP, FFmpeg build identity and a result checksum. If the meter/filter/report fields are unavailable, the operation fails or returns explicit null/unavailable values rather than inventing readings.
- This path is **off the local-only path** and is never invoked automatically. The user must check a separate, initially unchecked upload-consent control and explicitly press the meter button. The Web UI verifies the report schema and response checksum before displaying/exporting it. The ordinary local analysis and local batch flow never send the source audio.
- The processor stores the input only in its per-request temporary working directory and attempts cleanup in a finally block. This code path does not add durable audio object storage or retain the source in the dataset database. Hosting/operator-level retention and deployment secrets still require operational review.
- The default same-origin media gateway is limited to 4 MiB per upload; larger files require an appropriately configured direct processor route subject to that deployment's request limits. A service-supported upload is not a promise of a particular runtime.
- A synthetic 1 kHz reference-tone regression is included, but it is not the full official ITU-R BS.1770 / EBU R 128 reference-sequence suite. Broadcast-compliance claims remain gated on independent official reference sequences, inter-sample peaks, silence/gating edge cases, multichannel validation, exact deployed FFmpeg build licensing/configuration and measured tolerances. The optional operation must not be called fully release-validated until those tests pass.

## Measurement contract

The detailed signal contract is `env.music-analysis.v2`. The compact profile contract is `env.music-profile.v2`. The time-series dataset contract is `env.music-dataset-analysis.v2`.

- `peak_dbfs` is the maximum decoded sample peak; it is not true peak in dBTP.
- `rms_dbfs` is the RMS level in dBFS for the reported analysis scope.
- `rms_loudness_proxy_db` is a fixed-offset, RMS-derived decibel proxy. It is **not** integrated LUFS and does not implement standards-compliant EBU R 128 / ITU-R BS.1770 K-weighting and gating.
- Integrated LUFS, loudness range and true peak are returned only in the separate optional env.music-loudness-report.v1 response from the explicit-consent FFmpeg processor path. Do not copy those values into the local v2 RMS-proxy field or assume that the synthetic-tone smoke test alone proves broadcast compliance.
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
- Per-user database-backed hourly windows cap reads at 120, saves at 30 and deletions at 10. Counters are shared across warm/serverless instances and saturate at limit + 1 rather than growing without bound.
- Tracks, runs, frames, events, and annotations use owner-scoped keys/foreign keys. Analysis runs retain immutable results/checksums; annotation edits are represented as later history rows. Exact SHA-256 matches are returned as candidates, never automatically merged.

Cloud dataset access requires a configured database, and verified authentication must be enabled/configured. Deployment must apply `npm run db:migrate` so the `0009_music_dataset.sql` migration is installed. The API reports an auth/configuration failure when that prerequisite is absent; it does not claim a saved record exists in that case. The web UI uploads only structured results and metadata for this save operation, not the original audio. A client-computed SHA-256 is stored with `source_sha256_verified=false`; it is an unverified duplicate candidate, not a server-verified source identity.

This establishes the private result-library baseline, a local-first Web batch workflow, and a separately consented FFmpeg loudness-report path—not the entire target product. Still outstanding: a durable server-side DSP queue and always-on worker, private source-audio object storage and lifecycle cleanup, server-verified hashes for stored dataset runs, 10,000-job metadata load testing, measured full-audio throughput, round-trip cloud export and run comparison, native Android/iOS batch and cloud-library UX, complete official BS.1770/EBU R 128 reference-sequence validation and exact-build/legal sign-off, plus licensed reference-corpus semantic benchmarks. Those are explicit gaps, not hidden fallbacks.

## Dataset and provenance expectations

Keep source metadata, DSP measurements, user annotations, and reviewer-confirmed labels separate. The dataset migration uses separate track, run, feature-frame, event, collection and annotation tables rather than one unbounded timeline JSON. Exported data should contain schema/engine versions, measurement methods and units, annotation provenance, unknown/missing fields, rights/retention state and checksums when available.

## Verification status

The v2 schema, local Worker/batch engine, its state/recovery tests, per-item private-result save flow, and separate explicit-consent FFmpeg ebur128 operation have been committed for CI verification. Do not call this full production acceptance yet: current-revision build/typecheck/tests must pass, the configured production processor must prove the actual ebur128 capability, and full official-reference loudness validation, durable backend queue, object storage, native-batch parity, 10,000-job load testing and licensed corpus benchmarks are still outstanding. The machine-checkable acceptance inventory lives at docs/audits/music-analysis-acceptance.json; it records unfinished gates instead of presenting them as complete.
