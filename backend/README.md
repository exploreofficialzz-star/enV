# enV backend gateway

This folder contains the server-side integration boundary for the existing Vercel deployment. The Nitro routes in `server/routes/api/backend` are deployed as Vercel Functions together with the website; no second deployment is required.

## Routes

- `GET /api/backend/health` reports whether the configured processors are reachable by configuration (it never exposes secrets).
- `POST /api/backend/blob-upload` authorizes a direct Vercel Blob client upload up to 100MB, so media does not pass through the 4.5MB Function request limit.
- `POST /api/backend/media` proxies FFmpeg file-processing requests.
- `POST /api/backend/url-media/info` proxies metadata inspection for supported public URLs.
- `POST /api/backend/url-media/download` proxies downloads for supported public URLs, including YouTube, TikTok, Facebook, Instagram, and X when the upstream processor supports them.
- `POST /api/backend/transcribe` proxies audio/video transcription.

For same-origin requests, media outputs are written to Vercel Blob and the API returns a result URL. The browser then downloads that URL directly, avoiding the 4.5MB Vercel Function response limit.

## Vercel environment variables

Set these in the existing Vercel project, for Production and Preview as appropriate:

First create a **Blob** store in the Vercel project’s **Storage** tab and connect it to the project. Vercel then supplies `BLOB_READ_WRITE_TOKEN` automatically. This is required for the direct-upload route.

- `MEDIA_PROCESSOR_URL`: external FFmpeg processor endpoint (the endpoint that accepts the existing multipart `/media` contract).
- `URL_MEDIA_PROCESSOR_URL`: external URL-media processor base URL (it must provide `/info` and `/download`).
- `TRANSCRIBE_URL`: external transcription processor base URL (it must provide `/transcribe`).
- `BLOB_READ_WRITE_TOKEN`: supplied automatically after connecting a Vercel Blob store; do not commit it to Git.
- `BACKEND_ALLOWED_ORIGIN`: optional allowed origin; leave unset for the default permissive CORS behavior used by the existing standalone processors.
- `PROCESSOR_SHARED_SECRET`: server-only secret shared by Vercel and the Render processor. Render's Blueprint generates it for the processor; copy the same value into the Vercel project without exposing it as `VITE_*`.

The Vercel gateway intentionally does not run FFmpeg, yt-dlp, or Whisper itself. Vercel Functions are request handlers with temporary writable storage and execution limits; those processor binaries belong in the configured external service. The frontend falls back to these same-origin routes when the corresponding public `VITE_*` URL is not set, so processor URLs and credentials remain server-side.

The repository includes a Render-ready processor in `processor/` and `render.yaml`. It packages the existing FFmpeg and yt-dlp implementations into one HTTPS service. Render Free is appropriate for initial testing but may sleep after inactivity, has limited CPU/RAM, and has no persistent filesystem; Blob remains the durable file store.

For local media conversion and transcription, the browser uploads the selected file directly to Vercel Blob first. The gateway then fetches the Blob URL and sends a multipart request to the configured processor. This keeps the Vercel Function request under its payload limit and enforces the current 100MB per-file policy.

## Active backend-tool coverage

The catalog currently has **33 active tools** that use the gateway:

- **25 FFmpeg tools**: 9 audio conversions/merges and 16 video conversions/edits. They all use `MEDIA_PROCESSOR_URL`.
- **8 URL-media tools**: YouTube audio/video, Facebook, Instagram, TikTok, X, generic URL downloads, and URL inspection. They all use `URL_MEDIA_PROCESSOR_URL`.

The catalog also contains planned OCR, document conversion, DNS/WHOIS, screenshot, and transcription entries. They are not silently treated as working; they remain planned until their real processor is connected. `TRANSCRIBE_URL` is ready for the transcription route when those tools are promoted.

### Important Vercel boundary

Vercel **does host the gateway, upload-token route, result storage, and API responses** in this repository. It does not automatically provide FFmpeg, yt-dlp/social-platform extraction, or Whisper. Vercel’s current Function limits include a 4.5MB request/response payload limit, a 500MB writable `/tmp` scratch space, and a maximum duration that depends on the plan; that is why this project uses Blob for files and a processor URL for heavy work. The gateway and processor are separate responsibilities even though the gateway remains on the same Vercel deployment.
