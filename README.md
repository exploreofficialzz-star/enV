# enV — Browser Toolkit


**Useful tools. One place.** enV is a responsive collection of browser-based tools for everyday calculations, conversions, color and CSS work, QR codes, image tasks, and mockups. Wherever possible, processing happens in the visitor's browser rather than uploading files to a server.

## Requirements

- Node.js 22
- npm

## Local development

```bash
npm ci
npm run dev
```

The development server is available at `http://localhost:8080`.

## Quality checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

`npm run build` creates the Vercel/Nitro production output. It deliberately does **not** mutate a database during a Vercel build. Authentication is disabled by default.

## Vercel deployment

The repository is configured for Vercel through the Nitro Vercel preset in `vite.config.ts` and `vercel.json`.

- **Install command:** `npm ci --omit=dev --no-audit --no-fund`
- **Build command:** `npm run build`
- **Node.js:** 22

The production install intentionally omits development-only packages; build-time tooling required by Vite and Nitro is declared in `dependencies`. The Node.js engine is pinned to major version 22.

### Optional authentication

Authentication is off by default. To enable the optional Better Auth integration, configure its production secrets and OAuth broker in Vercel Project Settings, then set `VITE_AUTH_ENABLED=true`:

- `BETTER_AUTH_URL` — canonical HTTPS origin for the deployed application.
- `BETTER_AUTH_SECRET` — high-entropy server-only signing secret.
- `DATABASE_URL` — Postgres connection string, if persistent accounts are required.
- `AUTH_OAUTH_ISSUER`, `AUTH_OAUTH_CLIENT_ID`, `AUTH_OAUTH_CLIENT_SECRET` — credentials for a compatible OAuth broker. The broker must support the authorization, token, and user-info endpoints used by Better Auth.

Apply the committed SQL schema as a separate, deliberate release operation with `npm run db:migrate` after setting `DATABASE_URL`, then enable auth. The build intentionally cannot write to the production database. The same migration files are applied automatically to local PGLite during development.

Never prefix secrets with `VITE_` and never commit their values. Keep preview and production credentials in their respective Vercel environments. OAuth and account creation remain unavailable until the corresponding provider and database settings are configured.

## Optional AI features

enV can add optional AI help (captions, titles, regex/SQL/JSON explanations, image alt text, short audio transcripts) through a server-side layer that routes to OpenRouter, Groq and Gemini with cost-aware fallback. It stays off until you set at least one provider key, and every deterministic tool works without it. Setup, costs, privacy, operations and how to extend it are in [docs/ai-infrastructure.md](docs/ai-infrastructure.md); the variables are listed in `.env.example`. Run `npm run check:ai` after changing anything under `src/lib/ai`.

## Project structure

- `src/routes/` — route-level pages
- `src/components/` — application and tool UI
- `src/lib/engines/` — browser-side utility implementations
- `src/data/` — tool catalog and categories
- `public/` — static assets, app icon, and social share card
- `migrations/` — SQL schema migrations
- `scripts/` — build, migration, and quality tooling

## Native Android and iOS

Android and iOS are maintained as first-class native applications under `apps/android/` and `apps/ios/`. They do not embed the website. Offline-capable tools execute in Kotlin/Swift, server-dependent tools call the enV backend gateway directly, and AI-assisted features call `/api/ai/status` and `/api/ai/run` directly from Kotlin/Swift. Provider secrets never ship with the apps; only the backend URL is configured per native build.

Native AI uses the same task contracts as the web layer: anonymous signed AI-session cookies are stored locally so the backend can apply per-session rate limits, while provider selection, fallback, structured-output validation, privacy routing, and spend limits remain server-side.

## Privacy and security

The project does not require an account for its browser-based utilities. Keep file handling local to the browser unless a specific feature clearly requires server processing. Review changes to authentication, migrations, and external network requests carefully.


## Category 20 — AI micro-tools

The AI micro-tools category keeps its deterministic generators available offline. Optional AI assists are layered on top where they add material value: platform captions/titles, regex explanations, SQL explanations, JSON structure analysis, image alt text, and short audio transcription. Nothing leaves the device until the user explicitly invokes the AI assist. The same server-side AI task contract is used by the web, Android, and iOS clients.

## FFmpeg media processor

The optional `scripts/media-processor.mjs` service provides real FFmpeg-backed media processing for tools that require server-side codecs. Configure the web app with `VITE_MEDIA_PROCESSOR_URL` pointing at the processor's `/media` endpoint.

The processor uses an allowlisted operation table rather than accepting arbitrary FFmpeg commands. Current multi-file operations include:

- `video-merge` — concatenates multiple video files into a normalized MP4 and supplies silent audio when an input has no audio track.
- `audio-merge` — concatenates multiple audio files into a WAV output.
- `video-replace-audio` — keeps the first input's video stream and replaces its audio with the second input's audio stream.

Multi-file uploads are sent as repeated `files` multipart fields and are subject to the processor's aggregate upload-size limit. The service also validates operation names, isolates temporary files per request, and removes temporary files after processing.

## Transcription backend (optional, real model required)

`script/transcription-processor.mjs` provides a separate, isolated speech-to-text service for future Audio to Text, Audio to Subtitles, Video to Text, and Video to Subtitles tools. It is deliberately not activated in the catalog until a real Whisper-compatible executable and model are configured.

Environment:
- `WHISPER_BIN` — Whisper-compatible CLI, default `whisper-cli`
- `WHISPER_MODEL` — path to the downloaded Whisper model
- `TRANSCRIBE_PORT` — default `8788`
- `TRANSCRIBE_MAX_BYTES` — default 250 MiB
- `TRANSCRIBE_ALLOWED_ORIGIN` — CORS origin

Endpoints:
- `GET /health` — reports executable/model readiness
- `POST /transcribe` — multipart `file`, with `format=txt|srt|vtt`, optional `language`, and optional `translate=true`

The service uses an allowlisted command shape, isolated temporary directories, bounded uploads, and never accepts arbitrary shell arguments. The existing transcription catalog entries remain Coming Soon until a real model is installed and the client integration is completed.

## URL media processor

`URL_MEDIA_PROCESSOR_URL` is the optional enV URL-media backend endpoint. The service in `scripts/url-media-processor.mjs` currently defines provider adapters for YouTube, TikTok, Facebook, Instagram, and X and uses `yt-dlp` only when the deployment explicitly provides that executable.

Security boundaries include:
- HTTPS/HTTP only
- explicit provider-host allowlist
- DNS resolution with private/local IP rejection
- no arbitrary provider URLs
- `--no-playlist`
- configurable output-size and duration limits
- request timeout and cancellation
- isolated temporary job directories
- no arbitrary downloader command input from clients

The corresponding catalog downloader tools remain Coming Soon until a deployment has a real `yt-dlp` runtime and the provider operation has been validated end-to-end.
