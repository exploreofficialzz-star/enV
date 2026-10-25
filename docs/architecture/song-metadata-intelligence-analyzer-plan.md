# Song Metadata Intelligence Analyzer — Research & Implementation Plan

**Status:** Implementation and verification reference. Executable Web, Android, and iOS tool flows are included in this branch; semantic-model quality, singing-ASR coverage, and target-domain accuracy still require benchmark validation before making accuracy claims.  
**Date:** 2026-10-25  
**Target:** enV Web, Android, and iOS as independent clients with a versioned shared analysis contract  
**Proposed tool slug:** `song-metadata-analyzer`

## 1. Product goal

Build a real analyzer that describes a song's *file metadata, technical audio properties, musical characteristics, vocals, lyrics/language, and semantic meaning*. It must not be limited to reading tags that happen to be embedded in the file.

The user-facing result must preserve the requested top-level fields:

- `genre`, `sub_style`, `language`
- `tempo_bpm`, `tempo_band`, `key`, `energy`
- `mood`, `theme`, `setting`
- `vocals`, `instruments`, `descriptions`

The result should also expose technical file details, embedded tags, optional lyrics and song structure, evidence/provenance, warnings, and an explicit schema version. Missing or unsupported findings must be represented as unknown/null/empty with an explanation; they must not be invented to make the JSON look complete.

### Two primary modes

1. **Quick Scan — local by default.** Read available embedded tags and artwork; inspect container/codec, size, duration, bitrate, sample rate, channel count/layout, bit depth where knowable, and parse warnings. It does not claim to know mood, themes, genre, or instruments just because it can read file tags.
2. **Full Music Analysis — resource-aware.** Run actual audio analysis for BPM/key/rhythm/signal properties, music-understanding inference for genre/vibe/instruments/vocal presentation/captioning, and singing transcription/language detection followed by lyric interpretation where supported. Before sending any audio to a remote inference service, disclose the upload and obtain an explicit user action.

## 2. Current enV foundations found

These are reuse candidates, not proof that the final feature already exists:

- `src/lib/media/music-metadata.ts` parses common ID3/MP3, FLAC/Vorbis, Ogg/Opus, WAV/RIFF, and MP4/M4A tags, and can extract artwork. Reuse or compare its output against fixtures instead of building a second tag parser without need.
- `src/lib/engines/audio-studio.ts` includes lightweight BPM and key estimators. Its comments describe the BPM result as a best-effort estimate and the key detector as a lightweight chroma-template suggestion. Benchmark these implementations on known-reference tracks before promoting their output as production results.
- `src/components/engines/music-downloader-engine.tsx` already supports metadata-aware collection ZIP output. This analyzer should be a separate tool and must not depend on downloading a song from a provider.
- `scripts/gen-catalog.mjs`, audio catalog checks, native catalog registries, and native coverage files are part of the current tool-registration surface. Before implementation, trace the actual generation/dispatch path and change source-of-truth files only; do not hand-edit generated output without confirming the build contract.
- The AI interface currently uses a JSON task contract at `/api/ai/run`. A large multipart audio upload and a long-running batch are not ordinary small JSON inputs; use a purpose-designed job/upload flow or a separately deployed inference service rather than pushing raw audio through the generic task payload.

## 3. Candidate model and library assessment

This is a research shortlist, not an unconditional adoption decision. Confirm exact checkpoint, code, dependency, and training-data terms at implementation time.

| Candidate | Best-fit role | License/deployment note | Decision |
|---|---|---|---|
| [MOSS-Music 8B](https://github.com/OpenMOSS/MOSS-Music) | Whole-song music QA, rich captions/tags, structure and singing-lyrics transcription | The project states its models are Apache-2.0. The released models are approximately 9.1B total parameters; the official serving guide uses its SGLang `moss-audio` path and CUDA/cuDNN setup. GPU memory, throughput, and per-track cost must be measured on the actual serving target. | **Primary candidate to benchmark.** Compare Instruct and Thinking checkpoints for accuracy, latency, and cost. Avoid exposing private model reasoning traces. |
| [NaijaVox-2.0](https://huggingface.co/Axiveri/NaijaVox-2.0) | Nigerian Pidgin, Yoruba, Nigerian English, Hausa, and Igbo transcription | The model card lists Apache-2.0 weights and reports WER by language, but normal speech results do not prove singing-transcription quality. Training datasets keep their own license terms. | **Specialist ASR candidate.** Test on sung lyrics, noise, code-switching, names, and dialect variation; do not assume it replaces singing-specific ASR. |
| [CocoTagger / MusicCocoa](https://github.com/shoegazerstella/cocotagger) | Multi-label genre, mood, vocals, texture and custom semantic tags; CPU-friendly baseline | The tagger code states MIT, documents about 800 MB loaded models/1.2 GB peak memory and English-centric limitations. Independently verify rights/terms for all downloaded model assets before commercial use. Tag scores are similarity scores, not calibrated probabilities. | **Useful comparison baseline**, not yet the primary production engine. Test African genres and text-label bias. |
| [Music Flamingo / Audio Flamingo](https://github.com/NVIDIA/audio-flamingo) | Strong music captioning and broader audio understanding comparison | The repository says code is MIT but checkpoints are non-commercial and have additional underlying-model terms. | **Do not put these checkpoints into a commercial product** without separate written rights that cover the intended use. |
| [MuQ-MuLan](https://github.com/tencent-ailab/MuQ) | Audio/text embedding and candidate-label matching | The referenced MuQ/MuQ-MuLan checkpoint documentation lists CC BY-NC 4.0. Code and weights have separate terms. | **Exclude non-commercial weights** from a commercial production path unless appropriate licensing is obtained. |

### Model selection principle

Use different tools for distinct jobs, not one generative prompt for every field:

1. Deterministic file/tag parser for embedded metadata.
2. Audio DSP/beat-tracking and tonal analysis for measurable signal properties.
3. Music-understanding model for musical descriptions and multi-label semantic tagging.
4. Singing ASR and/or Nigerian-language ASR for lyric candidates and language evidence.
5. A constrained interpretation stage for themes, followed by schema validation and evidence checks.

MOSS-Music is particularly promising because its project explicitly targets musical captioning, lyrics ASR, structure, chord/key/tempo reasoning, instruments, voices, and full-track question answering. Its published results are vendor-reported benchmark results, not independent validation on Nigerian recordings. No reviewed source establishes its accuracy specifically for Afrobeats, Yoruba singing, or Nigerian Pidgin singing. Those are required target-domain evaluation areas, not claims we should assume.

### Required model bake-off

Before freezing the backend, compare MOSS-Music-Instruct, MOSS-Music-Thinking, NaijaVox-2.0, and a CPU-friendly semantic tagger on the same legally usable evaluation corpus. Record:
- exact checkpoint and immutable revision;
- license files and dependency/license inventory;
- model download footprint, peak RAM/VRAM, cold-start time, per-track latency, batch throughput, and failure behavior;
- quality by output field and by genre/language group;
- cost per analyzed minute at the chosen hardware/provider;
- whether full-track inference or representative segments performs better for this workload.

Do not choose a model based on a benchmark average alone. If the best musical model is too expensive for routine use, use a documented tiered path: local Quick Scan, lower-cost semantic tags where licensed, and opt-in Full Analysis through a configured inference service.

## 4. Field semantics and evidence

The schema should keep the user-requested fields at the root for ease of use and add structured sections without removing those fields.

| Field | Required source/behavior |
|---|---|
| `genre`, `sub_style` | Music-model classification against a maintained taxonomy. Support hybrid/uncertain cases without forcing certainty. Evaluate Afrobeats, afro-pop, amapiano, highlife, gospel, hip-hop, R&B, and ambiguous hybrids. |
| `language` | Infer from vocal/lyrics evidence, not tags alone. Support multi-language/code-switching; preserve language labels in a defined canonical vocabulary. Instrumentals return an empty list or an explicit no-vocals state. |
| `tempo_bpm` | Audio-derived estimate. Cross-check model reasoning, retain alternative half/double-time candidates and beat/downbeat data when supported. If beat tracking is ambiguous, report ambiguity. |
| `tempo_band` | Deterministic mapping from `tempo_bpm` with documented product-defined cutoffs. Example policy to validate: slow < 80, mid 80–109, upbeat 110–129, fast >= 130 BPM. These are product labels, not a universal music standard. |
| `key` | Audio-derived estimate with major/minor mode; cross-check model output. A null/low-confidence result is valid for atonal, noisy, short, or harmonically ambiguous audio. |
| `energy` | Combine measured rhythm/dynamics with perceptual analysis. Loudness alone is not energy, and normalized volume should not make all tracks appear high-energy. |
| `mood` | Multi-label impression (e.g. confident, joyful, melancholic) grounded in the sound. Scores are not probabilities unless calibrated on held-out data. |
| `theme` | Prefer lyric-grounded interpretation. If transcript quality is insufficient, return unknown/empty with a warning rather than inventing a story. |
| `setting` | Define as an **inferred listening/activity context or sonic scene** (e.g. club/dance floor), not the factual physical place where the recording was made. |
| `vocals` | Describe audible roles and presentation (lead/backing/duet/chorus, singing/rap, approximate perceived register, smooth/raspy/airy delivery, vocal effects). A voice timbre label is not the singer's identity or verified gender identity. Autotune/pitch correction is a likely effect, not always provable; label it as estimated when appropriate. |
| `instruments` | List instruments/sources believed audible, distinguishing likely instrument-family labels from highly specific instruments that the mix cannot disambiguate. |
| `descriptions` | Generate three distinct concise descriptions by default, grounded in results from audio and available transcript evidence. Do not introduce unsupported lyrics, artist identity, recording location, or instruments. |
| Technical metadata | Keep source file/container/codec details separate from decoded/resampled analysis audio. Do not report an AudioContext's decoded sample rate as the original file's sample rate. |
| `lyrics`, `structure` | Optional transcript and timestamped intro/verse/chorus/bridge/outro segments, with per-segment uncertainty. Do not expose invented word timestamps. |
| `evidence`, `warnings` | Record each field's source class: embedded tag, signal analysis, music model, ASR, or lyric interpretation. Return meaningful warnings for disagreement, missing inputs, unsupported formats, and uncertain results. |

A numeric confidence value must not be presented as calibrated probability unless it has been calibrated and evaluated. Before that, use clearly named qualitative confidence/quality bands or expose raw model similarity scores with their meaning explained.

## 5. Proposed result contract

Illustrative shape (values are not a claim about an analyzed recording):

```json
{
  "schema_version": "1.0",
  "genre": "Afrobeats",
  "sub_style": "afro-pop",
  "language": ["Nigerian Pidgin", "Yoruba"],
  "tempo_bpm": 104,
  "tempo_band": "mid",
  "key": "A minor",
  "energy": "high",
  "mood": ["party", "confident"],
  "theme": ["celebration", "success"],
  "setting": ["club", "dance floor"],
  "vocals": ["male lead", "smooth sing-song", "autotune"],
  "instruments": ["log drum", "shaker", "synth bass"],
  "descriptions": [
    "Bouncy mid-tempo Afrobeats with a log drum groove and a catchy sing-along chorus in Pidgin and Yoruba.",
    "Confident party song with processed lead vocals over shakers and a deep synth bass.",
    "High-energy dance-floor Afrobeats about celebrating success, with a prominent hook."
  ],
  "identity": {
    "title": null,
    "artist": null,
    "album": null,
    "release_date": null,
    "artwork_available": false
  },
  "technical": {
    "container": null,
    "codec": null,
    "duration_seconds": null,
    "file_size_bytes": null,
    "bitrate_bps": null,
    "bitrate_mode": null,
    "sample_rate_hz": null,
    "bit_depth": null,
    "channels": null,
    "channel_layout": null
  },
  "lyrics": {
    "status": "not_analyzed",
    "transcript": null,
    "detected_languages": [],
    "warnings": []
  },
  "structure": [],
  "evidence": {},
  "warnings": []
}
```

Implementation should use a strict runtime-validated schema (use the repository's established validation library/patterns after confirming them) and enforce bounded array/string lengths. Each track gets its own result and warnings. CSV uses stable flattened columns; JSON retains nested fields; a report ZIP includes CSV/JSON, processing issues, and optionally extracted artwork. Do not include the original music files in an exported report by default.

## 6. Batch/import workflow

Support:
- individual audio files and multi-file selection;
- folder selection where the platform supports it;
- ZIP archives containing songs and nested folders;
- formats that the chosen tag reader and decoder actually support, detected from file contents plus extension rather than trusting filename/MIME alone.

Recommended processing state machine:

`queued -> validating -> reading-tags -> decoding -> analyzing-audio -> transcribing-lyrics -> classifying -> packaging -> completed | partial | failed | cancelled`

Each track has its own state and error. A corrupt/unreadable track must not block the rest of the batch. Allow cancellation and cleanup; show separate progress for validation, decoding, model inference, transcription, and export. Prevent stale jobs from overwriting newer UI state.

Use existing music-downloader limits (50 tracks, 50 MB per track, 200 MB aggregate) only as **initial proposals**, not guaranteed safe limits for full neural analysis. Confirm or change them after measuring decoded PCM memory and target mobile/device/backend constraints. Apply a configurable expanded-archive budget, total entry count, allowed nesting policy, per-track duration limit, queue timeout, output cap, and model concurrency cap. Start with one neural inference at a time per small worker until profiling proves safe concurrency.

ZIP handling must never blindly extract arbitrary paths to disk. Reject or ignore traversal entries and symlinks, canonicalize display paths, validate entry sizes and actual decompressed byte counts, avoid unbounded nested archive recursion, and protect against decompression bombs. Stream/iterate archive entries where possible and release file buffers as soon as the job stage no longer needs them.

## 7. Web, Android, iOS, and backend boundaries

### Web
- Dedicated responsive tool route/component; no reuse of downloader UI as the analyzer.
- Quick Scan should read locally wherever browser APIs permit.
- Full Analysis discloses remote processing before any upload, provides progress/cancel, and never silently uploads an audio file.
- Bound decoded buffer memory, move CPU-intensive work off the rendering thread where practical, and keep mobile devices from decoding many tracks simultaneously.

### Android
- Native Kotlin screens/navigation, system document picker, local tag parsing, native decoding/analysis where supported, background/IO execution, progress/cancellation, and system share/save exports.
- Treat compressed format support as codec/device dependent and verify actual files; do not equate MediaMetadataRetriever metadata access with audio decoding or signal analysis.
- Apply file/expanded ZIP/decoded memory limits and clean up cancelled temporary files.

### iOS
- Native SwiftUI screen and document picker, local tag parsing, native audio decoding/analysis, background processing within platform limits, progress/cancellation, and share/export support.
- Verify each target format and long-file behavior with AVFoundation on supported OS versions; do not infer support from the extension alone.

### Inference API/service
The generic `/api/ai/run` endpoint is JSON-oriented and should not be the raw-audio transport. Recommended contract for a new versioned music-analysis service:

- `POST /api/music-analysis/jobs`: multipart upload + selected analysis options + explicit upload/processing consent; returns a job id.
- `GET /api/music-analysis/jobs/{id}`: status, progress, current stage, and per-track statuses.
- `POST /api/music-analysis/jobs/{id}/cancel`: idempotent cancellation.
- `GET /api/music-analysis/jobs/{id}/result`: validated JSON result when available; result retrieval must check job/session ownership.
- Optional report export endpoint only if packaging cannot be handled safely on the client.

The exact route structure can be adapted after inspecting server conventions. Use server-side-only model credentials, request/body size limits, per-session/user rate and concurrency limits, idempotency, job expiry, timeout/retry rules, and a sandboxed inference worker. The service must return an explicit “model unavailable / not configured” state rather than fabricated output. Keep inference adapters swappable and pin model versions. Do not log raw audio, complete lyrics, or secret data; keep uploaded files and derived artifacts only as long as the job requires and disclose retention.

## 8. Evaluation corpus and quality gates

Create a rights-cleared corpus with known reference labels, including:
- Afrobeats and afro-pop, plus adjacent genres such as amapiano, highlife, gospel, hip-hop, R&B, dance/electronic, and hybrid tracks;
- Nigerian Pidgin, Yoruba (including diacritics where appropriate), code-switching, Nigerian English, other languages, and instrumentals;
- full songs and short excerpts; intros, verses, choruses, bridges and outros;
- clean and dense mixes, heavy processing, backing vocals, percussion-led tracks, speech/rap/singing, variable bit rate, common tag formats, missing metadata, inconsistent tags, and corrupt/truncated files.

Use synthetic or appropriately licensed/reference-controlled audio. A small curated set should be manually reviewed by people competent in Nigerian music and languages before using it as evidence of product quality. Do not use private user songs to train or benchmark models without a separate explicit permission process.

Measure by field and subgroup:
- BPM absolute error, and correctness when half/double-time alternatives are considered;
- key accuracy and confusion groups (including relative major/minor);
- precision/recall and macro-F1 for genre/substyle, mood, instruments, and vocal descriptors;
- lyrics word/character error rates by language and singing condition, plus code-switching behavior;
- schema validity, unsupported-claim rate, description groundedness, and missing/uncertain-result behavior;
- latency, throughput, memory/VRAM, cancellation response, and cost per analyzed minute.

Do not use a single overall score to hide a failure on Yoruba or Pidgin content. Set pass thresholds from a documented baseline before release; require field-by-field results and manual review of a target-domain sample. Until Nigerian sung-language accuracy is demonstrated, show that limitation in the product and allow a truthful partial result.

## 9. Tests and release gates

Required test categories:
- unit tests for tag parsing, normalized fields, BPM/key algorithms, output schema, tempo-band mapping and evidence provenance;
- fixtures for ID3 versions/encodings, FLAC/Vorbis, Ogg/Opus, WAV/RIFF and MP4/M4A, artwork, empty or duplicate tags, and unsupported formats;
- archive tests for traversal names, corrupt ZIPs, oversized declared and actual expansion, many tiny files, nested archives, duplicate paths and partial extraction failures;
- full-batch tests for mixed valid/invalid files, cancellations, queue timeouts, duplicate songs, per-track error isolation, and stable CSV/JSON/ZIP exports;
- model integration tests with fixed model revisions and redacted fixture outputs, schema rejection/retry limits, timeout/backpressure, unavailable-service behavior and resource accounting;
- Web accessibility and mobile viewport checks; Android/iOS unit tests and authoritative builds; manual device tests with large archives and low-memory conditions;
- regression gates: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, catalog/audio checks, and relevant platform build/workflow commands. Record each command's actual status; source assertions are not evidence of an actual device build.

No release claim until batch import, full analysis, exports, privacy boundaries, and native platform paths have been exercised end-to-end in their respective environments.

## 10. Implementation stages and acceptance criteria

1. **Architecture and model bake-off:** lock data contract, model revisions, license inventory, target-domain corpus, latency/cost/memory baseline, and field quality baseline.
2. **Shared result and tag foundation:** robust parser adapter, technical metadata, strict versioned result schema, tag-vs-inference distinction, provenance/warnings and unit fixtures.
3. **Analysis core:** benchmark/upgrade BPM/key; integrate licensed semantic and singing-ASR adapters behind interfaces; lyric theme inference only when transcript evidence is adequate.
4. **Web full workflow:** separate analyzer UI, Quick Scan, explicit opt-in Full Analysis, file/ZIP queue, progress/cancel, per-track results and exports.
5. **Native clients:** independent Kotlin and Swift implementations using equivalent result contracts and platform-native pickers/progress/export.
6. **Batch hardening and release audit:** malicious/malformed archives, memory/concurrency stress, model outages, privacy/retention, regression gates, accessibility, Android/iOS device tests, and field-by-field evaluation report.

A stage is complete only when its code, tests, and behavior are verified. Catalog presence, a documentation statement, a passing source-level assertion, or a model-generated example does not prove the analyzer works.

## 11. Research references

- MOSS-Music code, capabilities, model sizes, evaluation, and license: https://github.com/OpenMOSS/MOSS-Music
- MOSS-Music official SGLang serving guide: https://github.com/OpenMOSS/MOSS-Music/blob/main/moss_music_usage_guide.md
- MOSS-Music 8B Instruct model card: https://huggingface.co/OpenMOSS-Team/MOSS-Music-8B-Instruct
- NaijaVox-2.0 model card, language-specific ASR numbers, and checkpoint license: https://huggingface.co/Axiveri/NaijaVox-2.0
- CocoTagger implementation, benchmark claims, CPU measurements, limitations, and code license: https://github.com/shoegazerstella/cocotagger
- NVIDIA Audio Flamingo code/checkpoint license distinctions: https://github.com/NVIDIA/audio-flamingo
- MuQ source/checkpoint/license notes: https://github.com/tencent-ailab/MuQ
- Existing enV metadata parser: https://github.com/exploreofficialzz-star/enV/blob/main/src/lib/media/music-metadata.ts
- Existing enV audio-analysis functions: https://github.com/exploreofficialzz-star/enV/blob/main/src/lib/engines/audio-studio.ts
- Existing enV music downloader contract: https://github.com/exploreofficialzz-star/enV/blob/main/docs/music-downloader-production.md
- Existing enV AI architecture: https://github.com/exploreofficialzz-star/enV/blob/main/docs/ai-infrastructure.md

**Scope of this document:** this is the research/design proposal only. It does not add a catalog entry, UI, API, model, runtime dependency, or production capability.
