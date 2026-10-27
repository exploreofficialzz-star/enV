# Local Song Analyzer

The Song Metadata Analyzer at `/tools/audio/song-metadata-analyzer` performs metadata and signal analysis on the device. The web version can also run speech recognition, sound classification and four-stem separation in browser workers. The optional Python companion adds CLAP tagging, a constrained local LLM, faster-whisper and Demucs. Android and iOS perform signal analysis natively and can use the optional enV song backend for the heavier models.

When the backend is configured, web analysis selects it for phones and low-memory devices and retries there if a local model fails. Native Full Analysis uses the backend for speech and sound recognition. Separation uses the backend on native clients and on web devices that need it. Backend processing uploads the selected audio; results identify the processing location and audio artifacts expire after an hour. Without a configured backend, the web app uses its on-device models and native apps retain their local measurements.

## Start locally

Use Python 3.11–3.13, FFmpeg/FFprobe on `PATH`, and approximately 8 GB available RAM for the complete CPU pipeline. Linux/macOS are the reference platforms; use WSL on Windows. Long tracks and stems take substantially longer than browser measurements. A GPU deployment is not configured by this package.

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e './local-song-analyzer[test]'
# CPU PyTorch avoids pulling CUDA libraries on Linux.
pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
pip install -e './local-song-analyzer[tagger]'
env-song-analyzer prepare

export SONG_API_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
# Include the exact origin of the enV website you open, with no trailing slash.
export SONG_ALLOWED_ORIGINS="http://localhost:8080,http://127.0.0.1:8080"
env-song-analyzer serve
```

Open the tool, add audio, run **Full Analysis**, then expand **Local AI & stems**. Connect to `http://127.0.0.1:8765` with your `SONG_API_TOKEN` value. Credentials stay in component memory and are not stored in browser storage. **Connect** sends a health request only. **Analyze locally** explicitly transfers the selected track to the companion on your own computer. A hosted web page may require the browser's local network permission. If local access is blocked, open enV locally with `npm run dev` and add its origin to the allowlist.

The core service can decode, measure and export sections without any neural dependencies: uncheck Audio tags and Local LLM. It reports missing requested components as partial results with notes, retaining all successfully produced data.

Tag review works in Quick Scan and when browser DSP is unavailable. Browser reports always include `review_annotations`, independently of `dataset_analysis`; when detailed DSP exists, its legacy `annotations` copy stays synchronized. This allows long tracks to use companion tagging without fabricating browser measurements.

After reviewing tags, **Export tagged audio** writes them into a new audio file. It copies the encoded audio stream without re-encoding, retains existing metadata/attached artwork where the output container supports them, and records the full reviewed label set in a comment. Genre/language/mood are also written as conventional tags; FFprobe verifies the exported label comment before download. Tag export does not submit corrections or train a model.

## Local LLM

Install [Ollama](https://ollama.com), start its local server, then:

```bash
ollama pull qwen2.5:1.5b
ollama create env-song-tagger -f local-song-analyzer/Modelfile
```

Default settings are `SONG_OLLAMA_URL=http://127.0.0.1:11434` and `SONG_OLLAMA_MODEL=env-song-tagger`. Only loopback HTTP is accepted. The LLM receives measured tempo/key, audio candidate labels, and aggregate evaluation metrics. It receives no audio, filename, embedded tags, or lyrics. JSON-schema enums and post-validation reject labels outside the supplied candidates. The response records the local model digest.

The LLM is a local candidate curator, not an audio decoder. FFmpeg decodes audio; CLAP produces audio embeddings and similarity-ranked labels. A text-only model cannot reliably identify instruments or languages from a filename or numerical spectrum.

## Optional lyrics and stems

```bash
pip install -e './local-song-analyzer[transcription]'
# Download an explicitly chosen faster-whisper-compatible model during setup:
python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir='./local-song-analyzer/data/whisper-small')"
export SONG_WHISPER_MODEL="$PWD/local-song-analyzer/data/whisper-small"

pip install torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
pip install -e './local-song-analyzer[stems]'
export SONG_DEMUCS_REPO="$PWD/local-song-analyzer/data/demucs"
env-song-analyzer prepare-stems
env-song-analyzer serve
```

Restart the companion after changing configuration. Select **Lyrics**, **4 stems**, or **Section WAVs** in the tool before starting a job. Results include timestamped lyric candidates and downloadable vocals, drums, bass and other WAVs. When both transcription and separation are requested, Whisper uses the estimated vocal stem; if the stem cannot be decoded, it falls back to the full mix and reports that choice. CLAP also analyzes the bass, drums and other stems. Demucs processes overlapping bounded windows and joins their complete outputs, including the tail. The ZIP includes the full analysis and requested audio artifacts.

Whisper is speech ASR: singing, Yoruba, Nigerian Pidgin and code-switching need independent review. Empty transcription is valid. Language is not inferred from genre. Word alignment is not implemented. Demucs can leave source leakage and does not isolate every instrument. **The upstream Demucs repository explicitly states that the checkpoint's licensing is unclear**; evaluate the rights for your intended deployment before enabling it. The checkpoint is optional and is never downloaded by an analysis request.

## Optional backend worker

`local-song-analyzer/Dockerfile` prepares a separate CPU service with pinned CLAP, faster-whisper tiny and Demucs models. It binds to `PORT` and requires a randomly generated `SONG_PROCESSOR_KEY` of at least 24 characters. Configure the existing Render gateway with `SONG_PROCESSOR_URL` (the worker's HTTPS origin) and the same `SONG_PROCESSOR_KEY`. The key stays on the servers; the clients use `/api/song/v1/...` through the gateway. The worker exposes only health, bounded jobs, cancellation and allowlisted artifacts. Feedback and training endpoints remain exclusive to the local companion. Jobs and audio are ephemeral and deleted after one hour or service restart.

The existing free Render service has 512 MB RAM; do not enable these models inside that shared process. A separate service must be sized for the models and concurrent work. In a local sequential-job smoke test, the companion plus Demucs subprocess reached about 2.4 GiB RSS before OS cache, so a 4 GB plan is a starting point, not a load-test guarantee. One job runs at a time and a bounded queue and retention limit apply. Long tracks can take substantially longer than the browser path. Do not expose the worker key in a `VITE_` variable or a mobile app.

Demucs 4.0.1 serializes model classes. Its subprocess permits legacy PyTorch deserialization only after checking the exact checkpoint SHA-256 and repository configuration. The permission is scoped to that child process. Do not substitute arbitrary checkpoint files. The fixed local repository prevents analysis-time network downloads.

## What learns

1. Listen, correct the draft tags, enter a reviewer and mark the tags reviewed.
2. Explicitly permit local training, then select **Save corrections**. The SQLite store saves the source hash, pinned-encoder audio embedding, reviewed labels, reviewer and update time. No audio, transcript or notes are saved in this store. Re-reviewing identical source bytes replaces the prior record.
3. After at least ten distinct reviewed tracks, select **Train & evaluate**. A ridge-regression multilabel head learns genre, mood, instruments and vocal labels from CLAP embeddings. LLM/base audio-model weights stay fixed. Language and lyric themes are excluded from this audio-only learner.
4. Future jobs use this trained head alongside CLAP candidates. Every suggestion still requires review. Merely analyzing a track or applying draft suggestions never trains anything.

The split is deterministic: `int(source_sha256[:8], 16) % 5 == 0` reserves test tracks permanently. Training requires at least six fitting tracks, two test tracks, two positive and two negative fitting examples for a label, and two reviewed test examples for its field. Missing fields are unknown; explicitly supplied empty arrays mean reviewed absence. API callers can omit unreviewed fields. The web review checkbox confirms the complete displayed annotation set.

The fit uses only the training partition, with fixed regularization and threshold. Reports contain per-field/per-label precision, recall, macro-F1, support and train/test counts. These metrics are evidence about the submitted corpus only. The current head is a small baseline, not calibrated probability. The split prevents exact-file leakage; near duplicates, alternate encodes, artist leakage, and reviewer disagreement still require corpus curation. No real-song accuracy benchmark is bundled. A passing synthetic learning test is not a music-accuracy claim.

`env-song-analyzer train` also trains/evaluates from the local review store. The database defaults to `~/.local/share/env-song-analyzer/reviews.sqlite3`; set `SONG_DATA_DIR` to change it. Stop the service and remove that file to erase all local learning. Back it up yourself if needed. Models and training data are git-ignored.

## Output and limits

- Raw FFprobe format, stream, chapter and embedded-tag metadata, plus source SHA-256.
- Full-track 16 kHz antialiased DSP: tempo with half/double-time alternatives, beat times, key candidates, two-second chord estimates, peak/RMS, clipping, and contiguous signal-change sections.
- CLAP processes consecutive ten-second windows across the complete 48 kHz decoded mono track, including the tail; pools audible-window embeddings; returns per-window and pooled genre/mood/instrument/vocal candidates. All scores are raw cosine similarities, not certainty percentages. Silence yields no semantic tags.
- Sections are signal changes, not claims of verse/chorus identity. Section cuts and source separation are distinct operations.
- Source file limit 50 MB; known duration up to 15 minutes; one inference job at a time; four pending/running jobs and twelve retained jobs maximum. Uploaded files are local-only and not fetched from arbitrary URLs.
- Jobs and audio artifacts expire one hour after finishing, with cleanup every thirty seconds. Startup removes orphaned jobs after crashes. Graceful shutdown removes job artifacts. Reviewed embeddings/labels persist until explicitly erased. The companion does not log audio or transcripts.
- API bearer authentication, exact origin allowlist, loopback host/bind restrictions, request/body size checks, no-store responses, opaque job IDs, artifact allowlists, bounded subprocess timeouts and cancellation. Use a single service process for a single local operator; this is not a shared multi-tenant web backend.

API: authenticated `GET /v1/health`, multipart `POST /v1/jobs` (`audio`, JSON `options`), `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/cancel`, `DELETE /v1/jobs/{id}`, `GET /v1/jobs/{id}/artifacts/{name}`, `POST /v1/feedback`, and `POST /v1/train`. Feedback requires both `reviewed: true` and `training_consent: true`. Job results use `env.local-song.v1`; exported browser reports use song schema `1.2` without removing existing root fields.

`POST /v1/jobs/{id}/tagged-copy` accepts reviewed annotations and returns a newly tagged audio download without training consent or dataset submission.

## Verification

```bash
pytest -q local-song-analyzer
npm run test:song-analyzer
npm run typecheck
npm run check:audio-studios
npm run build
# With enV already running; add SONG_AUDIT_TOKEN to also exercise your companion.
npm run audit:song-analyzer:browser
```

The CI workflow tests real FFmpeg decoding, section WAV export, corrupt inputs, cancellation, authentication/CORS, API artifact retrieval/deletion, consent enforcement, review deduplication, encoder compatibility and fixed-holdout learning. Neural checkpoints are prepared separately rather than downloaded on every CI run. See [research and validation](../docs/song-analyzer-local-research.md) for model choices and known limits.

For the complete browser/neural audit, use a disposable `SONG_DATA_DIR` and set `SONG_AUDIT_TOKEN`, `SONG_AUDIT_STEMS=1`, `SONG_AUDIT_LYRICS=1` and optionally `SONG_AUDIT_LEARNING=1`. The learning flag explicitly submits the generated test fixture’s reviewed labels to that local store; leave it unset when using an existing personal dataset.
