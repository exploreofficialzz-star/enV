# Song Analyzer: local pipeline research and validation

Reviewed against primary project documentation on 2026-10-27. This implementation enhances the web Song Metadata Analyzer and supplies a separately installed local companion. Existing Android/iOS implementations are unchanged; the new companion controls have not been added to native clients.

## Decisions

| Job | Selected component | Reason and boundary |
| --- | --- | --- |
| Metadata | `music-metadata@12.3.2` in the browser; FFprobe locally | Expands common/native tags, source codec/rate/bit depth, chapters, dates and identifiers beyond the legacy handwritten parser. Binary tag payloads become byte-count descriptors in browser JSON. Embedded tags remain unverified. |
| Decode | Browser AudioContext; FFmpeg companion | Browser supports quick private use; FFmpeg broadens local codec support. Original stream properties remain separate from decoded/resampled properties. Unsupported/corrupt inputs produce useful partial/failure states. |
| Musical measurement | Existing browser DSP; companion librosa | Full-track measurements, beat timestamps and half/double tempo alternatives. Chroma templates are estimates, particularly in polyphonic audio. RMS is not integrated LUFS. |
| Audio semantics | LAION CLAP via Transformers | Runs on CPU, reusable 512-dimensional audio embeddings and open-label candidate comparison. Checkpoint card declares Apache-2.0. Fixed immutable revision `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`. |
| Local LLM | Ollama custom `env-song-tagger`, Qwen2.5 1.5B | Small local curator with schema-constrained candidate selection; checks unknown labels. It does not hear audio and cannot replace an audio encoder. Base weights remain fixed; the result records the installed model digest. |
| Learning | Local reviewed embeddings + ridge multilabel head | Cheap supervised updates with reproducible held-out evaluation and no self-training on generated labels. Small-data baseline; do not claim calibrated precision on a different corpus. |
| Lyrics/language | Optional faster-whisper with explicitly downloaded local checkpoint | Timestamped speech-ASR candidates, never verified lyrics. Singing and code-switching are hard; theme inference remains manual. |
| Source separation | Optional Demucs 4.0.1 `htdemucs` | Four broad sources: vocals, drums, bass, other. Pinned checkpoint SHA-256 `8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`. Upstream explicitly says checkpoint licensing is unclear; do not represent this as cleared for commercial deployment. |

CLAP's repository reports GTZAN results for distinct music-specialist checkpoints; those results do **not** establish accuracy of this smaller Transformers checkpoint, our prompts, the selected label vocabulary, or Nigerian music. Ten-second windows cover the full track and make changing tags inspectable. The final short window is padded where necessary and its real timestamps are retained. Low-energy windows do not contribute to pooled embeddings.

No model score here is a calibrated probability. The UI shows raw similarity values and draft/review states. Metadata, DSP, audio candidates, curated selections and reviewed annotations have separate provenance. Source hashes deduplicate identical files; alternate encodes and related tracks must be grouped manually when curating a production evaluation corpus.

## Other approaches reviewed

The existing [architecture review](architecture/song-metadata-intelligence-analyzer-plan.md) covers MOSS-Music, NaijaVox, CocoTagger, MuQ and Audio Flamingo. MOSS-Music is worth a GPU music-understanding bake-off, but an 8B stack is a substantial installation for a small local baseline. Generic text LLMs cannot decode waveform bytes. Audio Flamingo and MuQ checkpoint restrictions preclude assuming unrestricted commercial use. A hand-written FFT-to-genre heuristic would give misleading labels, so it is not used.

Demucs is source separation; HPSS and frequency filters produce different kinds of layers and are not relabelled as isolated voices/instruments. Automatic feature-change boundaries do not establish verse/chorus structure. Forced alignment, melody transcription to MIDI, reliable meter/downbeats, fingerprint-based identity lookup, standards-compliant LUFS, and validated multilingual singing ASR remain future work.

## Accuracy acceptance

Before making accuracy claims, curate a rights-cleared corpus with multiple reviewers covering full songs, excerpts, instrumental/rap/sung vocals, dense mixes, Afrobeats/afro-pop/amapiano/highlife/gospel and neighboring genres, Nigerian Pidgin/Yoruba/code-switching and non-target languages. Keep alternate encodes, versions and artist groups out of both sides of a split. Choose target precision/recall by field before tuning; retain an untouched final test corpus.

Report genre/mood/instrument/vocal precision, recall and macro-F1 by field and subgroup; BPM error with half/double-time tolerance; key confusion including relative major/minor; singing WER/CER by language; stem quality/leakage; unsupported labels; runtime/RAM and failure/cancellation rates. Evaluate empty/unknown outcomes as valid behavior. The in-product head reports a fixed source-hash holdout, per-label support and uncalibrated scores; it is a development aid and does not replace the broader benchmark.

## Verification evidence

See the [validation report](song-analyzer-validation.md) for exact commands and observed outcomes. Synthetic audio tests verify decoding, timing, WAV headers, cancellation, privacy boundaries and supervised-learning behavior. They cannot prove real-song genre, instrument, language or stem quality. No user-provided audio has been used for training during implementation.

## Primary references

- [music-metadata API and browser support](https://github.com/Borewit/music-metadata)
- [FFprobe stream, format and chapter inspection](https://ffmpeg.org/ffprobe.html)
- [librosa beat tracking](https://librosa.org/doc/latest/generated/librosa.beat.beat_track.html)
- [CLAP source, model variants and reported results](https://github.com/LAION-AI/CLAP)
- [Selected CLAP checkpoint and Apache-2.0 model card](https://huggingface.co/laion/clap-htsat-unfused)
- [Transformers CLAP model API](https://huggingface.co/docs/transformers/model_doc/clap)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Qwen2.5 1.5B model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)
- [faster-whisper local inference](https://github.com/SYSTRAN/faster-whisper)
- [Demucs CPU operation, sources and checkpoint license caveat](https://github.com/adefossez/demucs)
