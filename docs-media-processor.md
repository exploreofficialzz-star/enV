# enV FFmpeg Media Processor

The web app remains browser-first. Heavy or format-specific operations can use the optional FFmpeg media processor through `VITE_MEDIA_PROCESSOR_URL`.

## Run locally

Requirements: Node.js 22+ and a system `ffmpeg` + `ffprobe` executable.

```bash
MEDIA_PORT=8787 npm run media:processor
```

Health check:

```text
GET /health
```

Processing endpoint:

```text
POST /media
Content-Type: multipart/form-data
```

Fields:
- `file`: input media file
- `operation`: one of the allowlisted operations
- `outputName`: desired download filename
- `params`: JSON parameters for the operation

Current operations:
- `video-to-mp4`
- `video-to-mp3`
- `video-to-gif`
- `video-to-webm`
- `video-to-mov`
- `video-to-avi`
- `video-resize`
- `video-crop`
- `video-rotate`
- `video-mute`
- `video-fps`
- `video-bitrate`
- `video-compress`
- `video-trim`
- `audio-to-mp3`
- `audio-to-wav`
- `audio-to-ogg`
- `audio-to-flac`

## Web app configuration

Set `VITE_MEDIA_PROCESSOR_URL` to the processor's `/media` endpoint. The client sends only JSON-safe parameters; the binary file is sent separately as multipart form data.

The processor deliberately does **not** accept arbitrary FFmpeg command-line arguments. Operations and their FFmpeg flags are allowlisted in `scripts/media-processor.mjs`.

For production, put the processor behind HTTPS, authentication/rate limiting, a request-size limit, isolated temporary storage, and an appropriate `MEDIA_ALLOWED_ORIGIN` value.

## Current enV tool integrations

The web app now exposes these FFmpeg-backed tools through the shared media runtime:
- Video to MP4
- Video to MP3
- Video to GIF
- Video to WebM
- Video to MOV
- Video to AVI
- Video Resizer
- Video Cropper
- Video Rotator
- Mute Video
- Video Frame Rate Converter
- Video Bitrate Converter
- Audio to MP3
- Audio to WAV
- Audio to OGG
- Audio to FLAC

These catalog entries are marked active but `requiresBackend: true`. They intentionally fail with a clear configuration message when `VITE_MEDIA_PROCESSOR_URL` is absent.

The existing browser-local Video Trimmer, Video Speed Changer, Browser Video Compressor, and Extract Audio tools remain browser-first and do not require the server processor.

## URL media inspection

The URL media processor also exposes `POST /info` for metadata-only inspection. It uses yt-dlp's `--dump-single-json` and `--skip-download` modes, so inspection does not download the media file. The endpoint applies the same supported-provider, public-host, and duration checks as downloads. It returns normalized title, uploader, duration, thumbnail, live state, resolution, codecs, and a bounded list of available formats. The frontend can use `VITE_URL_MEDIA_PROCESSOR_URL` to call this endpoint through the URL Media Inspector tool.
