# enV backend gateway

This folder contains the server-side integration boundary for the existing Vercel deployment. The Nitro routes in `server/routes/api/backend` are deployed as Vercel Functions together with the website; no second deployment is required.

## Routes

- `GET /api/backend/health` reports whether the configured processors are reachable by configuration (it never exposes secrets).
- `POST /api/backend/media` proxies FFmpeg file-processing requests.
- `POST /api/backend/url-media/info` proxies metadata inspection for supported public URLs.
- `POST /api/backend/url-media/download` proxies downloads for supported public URLs, including YouTube, TikTok, Facebook, Instagram, and X when the upstream processor supports them.
- `POST /api/backend/transcribe` proxies audio/video transcription.

## Vercel environment variables

Set these in the existing Vercel project, for Production and Preview as appropriate:

- `MEDIA_PROCESSOR_URL`: external FFmpeg processor endpoint (the endpoint that accepts the existing multipart `/media` contract).
- `URL_MEDIA_PROCESSOR_URL`: external URL-media processor base URL (it must provide `/info` and `/download`).
- `TRANSCRIBE_URL`: external transcription processor base URL (it must provide `/transcribe`).
- `BACKEND_ALLOWED_ORIGIN`: optional allowed origin; leave unset for the default permissive CORS behavior used by the existing standalone processors.

The Vercel gateway intentionally does not run FFmpeg, yt-dlp, or Whisper itself. Vercel Functions are request handlers with temporary writable storage and execution limits; those processor binaries belong in the configured external service. The frontend falls back to these same-origin routes when the corresponding public `VITE_*` URL is not set, so processor URLs and credentials remain server-side.
