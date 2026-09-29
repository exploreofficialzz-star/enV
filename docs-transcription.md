# enV transcription processor

The transcription service supports two real local runtimes:

- `whisper-cli` (whisper.cpp)
- `faster-whisper` (Python)

No paid API is required. The runtime and model must be installed/configured on the server before transcription is enabled.

## whisper.cpp

```bash
export TRANSCRIBE_ENGINE=whisper-cli
export WHISPER_BIN=/path/to/whisper-cli
export WHISPER_MODEL=/path/to/ggml-model.bin
node scripts/transcription-processor.mjs
```

## Faster-Whisper

Install the optional Python dependency in the transcription server environment:

```bash
python3 -m pip install faster-whisper
```

Then configure:

```bash
export TRANSCRIBE_ENGINE=faster-whisper
export FASTER_WHISPER_MODEL=small
export FASTER_WHISPER_DEVICE=cpu
export FASTER_WHISPER_COMPUTE_TYPE=int8
node scripts/transcription-processor.mjs
```

The first Faster-Whisper run may download the selected model to the server's model cache. For production, pre-warm the model during deployment rather than making the first customer request pay the download/startup cost.

## Endpoints

`GET /health` reports the selected engine and whether its runtime is actually importable/available.

`POST /transcribe` accepts multipart form data:

- `file`: audio/video file
- `format`: `txt`, `srt`, or `vtt`
- `language`: ISO language code or `auto`
- `translate`: `true` to translate speech to English when supported
- `outputName`: optional safe output filename

The processor keeps transcription tools unactivated in the catalog until a real runtime is configured. This prevents the UI from claiming transcription works on a deployment that has no model.
