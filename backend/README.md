# enV backend gateway

This folder contains the server-side integration boundary for the existing Vercel deployment. The Nitro routes in `server/routes/api/backend` are deployed as Vercel Functions together with the website; no second deployment is required.

## Routes

- `GET /api/backend/health` reports whether the configured processors are reachable by configuration (it never exposes secrets).
- `POST /api/backend/media` proxies FFmpeg file-processing requests.
- `POST /api/backend/url-media/info` proxies metadata inspection for supported public URLs.
- `POST /api/backend/url-media/download` proxies downloads for supported public URLs, including YouTube, TikTok, Facebook, Instagram, and X when the upstream processor supports them.
- `POST /api/backend/transcribe` proxies audio/video transcription.

Same-origin media, URL-media, and transcription requests are proxied directly to the configured processors. The browser enforces a conservative 4MB aggregate input limit for same-origin media/transcription because Vercel Function request payload limits apply. Configure the processor URL as a direct browser endpoint when larger uploads are required, and protect that processor with its own authentication/rate limits.

## Vercel environment variables

Set these in the existing Vercel project, for Production and Preview as appropriate:

- `MEDIA_PROCESSOR_URL`: external FFmpeg processor endpoint (the endpoint that accepts the existing multipart `/media` contract).
- `URL_MEDIA_PROCESSOR_URL`: external URL-media processor base URL (it must provide `/info` and `/download`).
- `TRANSCRIBE_URL`: external transcription processor base URL (it must provide `/transcribe`).
- `BACKEND_ALLOWED_ORIGIN`: optional allowed origin; leave unset for the default permissive CORS behavior used by the existing standalone processors.
- `PROCESSOR_SHARED_SECRET`: server-only secret shared by Vercel and the Render processor. Render's Blueprint generates it for the processor; copy the same value into the Vercel project without exposing it as `VITE_*`.

The Vercel gateway intentionally does not run FFmpeg, yt-dlp, or Whisper itself. Vercel Functions are request handlers with temporary writable storage and execution limits; those processor binaries belong in the configured external service. The frontend falls back to these same-origin routes when the corresponding public `VITE_*` URL is not set, so processor URLs and credentials remain server-side.

The repository includes a Render-ready processor in `processor/` and `render.yaml`. It packages the existing FFmpeg and yt-dlp implementations into one HTTPS service. Render Free is appropriate for initial testing but may sleep after inactivity, has limited CPU/RAM, and has no persistent filesystem; Blob remains the durable file store.

For same-origin media conversion and transcription, the browser sends the selected file to the gateway as multipart form data and is limited to 4MB to stay below the Vercel Function request ceiling. For larger files, configure a direct processor URL and apply authentication/rate limiting at that processor.

## Active backend-tool coverage

The catalog currently has **33 active tools** that use the gateway:

- **25 FFmpeg tools**: 9 audio conversions/merges and 16 video conversions/edits. They all use `MEDIA_PROCESSOR_URL`.
- **8 URL-media tools**: YouTube audio/video, Facebook, Instagram, TikTok, X, generic URL downloads, and URL inspection. They all use `URL_MEDIA_PROCESSOR_URL`.

The catalog also contains planned OCR, document conversion, DNS/WHOIS, screenshot, and transcription entries. They are not silently treated as working; they remain planned until their real processor is connected. `TRANSCRIBE_URL` is ready for the transcription route when those tools are promoted.

### Important Vercel boundary

Vercel hosts the gateway and API responses in this repository. It does not automatically provide FFmpeg, yt-dlp/social-platform extraction, or Whisper. Heavy processing belongs in the configured processor services. The gateway intentionally does not create public file objects or expose uploaded media through a public Blob URL.
