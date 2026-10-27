# Song Analyzer validation — 2026-10-27

Scope: the web Song Metadata Analyzer, browser metadata/section exports, and the optional local Python companion. Native Android/iOS clients were not modified or built for this change.

Environment: Linux, Python 3.12.14, Node 24.19.0, system FFmpeg/FFprobe and headless Chromium. The repository targets Node 22; the added GitHub Actions workflow uses Node 22 and Python 3.12. Local build artifacts are not committed.

## Checks completed

| Check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed with the updated lockfile. |
| `npm test` | Passed, including the existing production/auth checks and Node test suites. |
| `npm run test:song-analyzer` | 14 tests passed: real WAV metadata, source-rate provenance, PCM16 stereo section bounds, URL restrictions, archive checks, CSV safety and result-contract rejection. |
| `node --experimental-strip-types --test src/lib/engines/music-dataset-analysis.test.ts` | 6 existing DSP tests passed. |
| `pytest -q local-song-analyzer` | 9 tests passed: real decoding/section export, corrupt input, process cancellation, authentication/CORS/private-network preflight, actual-byte body limits, job/export/delete flow, consent, original-file preservation, reviewed-data deduplication and fixed-holdout learning. |
| `npm run typecheck` | Passed. |
| `npm run lint` | No errors; 126 existing repository warnings. Changed analyzer UI/client files also passed focused ESLint checks. |
| `npm run build` | Passed; Vite/Nitro production output generated. Existing framework directive/bundle warnings remain. |
| `npm run check:audio-studios` | Passed. |
| `npm run check:audio-studio-interfaces` | Passed. |
| `npm run check:audio-studio-usability` | 9 checks passed. These are source checks, not native device tests. |
| `git diff --check` | Passed. |

The production-preview browser audit ran with a real local companion and prepared CLAP, Ollama/Qwen, faster-whisper and Demucs models:

```bash
BROWSER_AUDIT_BASE_URL=http://127.0.0.1:8081 \
SONG_AUDIT_TOKEN="$SONG_API_TOKEN" \
SONG_AUDIT_STEMS=1 SONG_AUDIT_LYRICS=1 SONG_AUDIT_LEARNING=1 \
npm run audit:song-analyzer:browser
```

It passed the complete flow:

- File import → full browser measurements → JSON export with the mature metadata parser and original 16 kHz/stereo properties.
- No audio upload during browser analysis or companion connection; one explicit local job upload after selecting Analyze locally.
- Full-track local tagging, including the short tail window; a recorded local LLM digest; schema-validated results; timestamped lyric candidates.
- Actual four-stem output and section WAVs inside a downloadable ZIP; reviewed tagged-audio download.
- Manual comma-separated typing, review-state reset after applying model suggestions, and explicit submission of a generated fixture's corrections to a disposable local SQLite store.
- Tag editing/export in Quick Scan with `dataset_analysis: null`; detailed DSP is not required for annotation review.
- Phone viewport, narrow workspace on a desktop viewport, and explicit desktop workspace; no horizontal page overflow.
- No browser page errors and no serious/critical axe WCAG 2 A/AA or 2.1 AA violations in the analyzer interface. The audit caught and prompted fixes for overlapping desktop columns in the narrow workspace, nested file-input interaction and insufficient contrast on the Partial badge.

A separate production-browser MP3 check confirmed title `Analyzer Test Track`, full date `2026-10-27`, source rate 22,050 Hz and a distinct decoded analysis rate of 44,100 Hz, with `music-metadata@12.3.2` rather than the fallback parser.

## Models actually exercised

- CLAP: immutable `laion/clap-htsat-unfused@8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`, running on CPU and returning 512-dimensional audio embeddings.
- Local LLM: custom Ollama `env-song-tagger` built from Qwen2.5 1.5B, generating constrained candidate selections locally and recording its installed digest.
- Demucs: checksum-verified `htdemucs` checkpoint, producing actual vocals/drums/bass/other WAVs. No models are downloaded during analysis.
- ASR: downloaded local faster-whisper tiny checkpoint for the smoke test, using the FFmpeg-decoded PCM path. Instrumental synthetic audio correctly allowed an empty lyric candidate result. The setup guide recommends choosing/evaluating an appropriate checkpoint, rather than treating this smoke-test model as a singing-quality baseline.
- Learning: artificial separable embeddings tested that reviewed examples alter predictions and that the deterministic holdout remains excluded from fitting. The browser also submitted one reviewed synthetic track through the real feedback API. No user audio or real-song labels were used for training.

## Interpretation and remaining limits

These checks establish functioning code paths, exports, privacy boundaries and learning mechanics. They do not establish real-song genre/instrument accuracy, reliable verse/chorus recognition, isolated-source quality, singing transcription accuracy or target-language quality. CLAP can give plausible labels to synthetic tones; all its outputs remain unreviewed candidates. The small trained head exposes corpus-specific holdout metrics, not calibrated confidence. The LLM/base encoder weights are not fine-tuned.

A rights-cleared, independently reviewed song corpus is still needed for the accuracy acceptance process in [the research report](song-analyzer-local-research.md). Optional model installation and local service startup remain operator steps. Demucs upstream explicitly leaves checkpoint licensing unclear, so enabling that component does not imply commercial clearance.

The added CI workflow repeats the Python/TypeScript checks, production build and browser/accessibility workflow without downloading neural models. The optional neural audit can be repeated against a separately prepared, disposable companion instance.
