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


## Developer utilities audit


The Developer category's platform-specific implementation notes, regression evidence, competitor/user-feedback research, known limitations, and next-priority backlog are maintained in:

- [Developer category audit and verification record](audit/DEVELOPER-CATEGORY-AUDIT-2026-10-13.md)
- [Competitive research and feedback-to-fix mapping](audit/COMPETITIVE-RESEARCH-AND-IMPLEMENTATION-REVIEW-2026-10-13.md)
- [Developer category changelog](audit/DEVELOPER-CATEGORY-CHANGELOG.md)

The reports distinguish source-level changes and automated Web checks from Android/iOS builds and device/network tests that have not run in environments with the required SDKs.

## Vercel deployment

The repository is configured for Vercel through the Nitro Vercel preset in `vite.config.ts` and `vercel.json`.

- **Install command:** `npm ci --omit=dev --no-audit --no-fund`
- **Build command:** `npm run build`
- **Node.js:** 22

The production install intentionally omits development-only packages; build-time tooling required by Vite and Nitro is declared in `dependencies`. The Node.js engine is pinned to major version 22.

### Optional authentication

Authentication is off by default. The app now has sign-in, sign-up, password-reset, and Better Auth API routes, but these screens do not make account creation live by themselves. Enable authentication only after completing the deployment setup below.

Required production settings:

- `VITE_AUTH_ENABLED=true` — public feature switch; must be set in the production build and server environment.
- `BETTER_AUTH_URL` — canonical HTTPS origin for the deployed application (currently `https://envtools.store`).
- `BETTER_AUTH_SECRET` — high-entropy server-only signing secret.
- `DATABASE_URL` — durable Postgres connection string; production authentication refuses to start without it.

Choose at least one identity method for the shared Account, sign-in and sign-up screens:

- **Google:** Set server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; set public `VITE_AUTH_GOOGLE_ENABLED=true` to show the Google button. Register `https://envtools.store/api/auth/callback/google` as an Authorized redirect URI in Google Cloud Console.
- **Apple:** Set server-only `APPLE_CLIENT_ID` (Apple Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`; the server generates short-lived-use Apple client-secret JWTs with a six-month maximum lifetime. Set public `VITE_AUTH_APPLE_ENABLED=true` only after the Apple callback and domain are verified. Register `https://envtools.store/api/auth/callback/apple` as the Return URL in Apple Developer. An externally generated `APPLE_CLIENT_SECRET` is supported as a manual-rotation alternative.
- **OIDC/OAuth:** Set `AUTH_OAUTH_ISSUER`, `AUTH_OAUTH_CLIENT_ID`, and `AUTH_OAUTH_CLIENT_SECRET` together. The issuer must expose standard OIDC discovery, authorization, token, and user-info endpoints. Register the Better Auth callback URL for the deployed origin with the identity provider.
- **Email/password:** Set server-only `AUTH_EMAIL_PASSWORD_ENABLED=true` and public `VITE_AUTH_EMAIL_ENABLED=true`, plus `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. Verify the sender domain with Resend. Email/password sign-up requires email verification and password reset uses emailed, expiring links. Never put `RESEND_API_KEY` in a `VITE_` variable.

The Web Account route and native Android/iOS Account entry points open the same responsive sign-in page, with sign-up and password recovery links available from that screen.

Apply the committed SQL schema as a deliberate release operation with `npm run db:migrate` after setting `DATABASE_URL`; the build does not write to the production database. Use [the account authentication runbook](docs/account-auth-setup.md) for the full provider checklist. Verify migration completion, sender deliverability, exact OAuth callback URLs, password reset, verification expiry, session cookies, and logout in a staging deployment before enabling production auth. Do not enable a public provider flag until its server credentials and staging checks are complete.

Never commit secret values. Keep preview and production credentials separate and use secure environment settings. Local development intentionally ships with auth disabled until a developer opts in.

## Monetization foundation (preview only)

enV uses an advertising-free monetization policy and is being prepared for a shared usage-based token wallet across Web, Android and iOS. The proposed reference value is 100 tokens ≈ USD $1.00; rates are provisional, and remote AI/media work must be priced from measured usage and provider costs. Premium access is intended for frontier models and advanced workflows, not unlimited compute.

The initiation release adds the metering rules, generated billing profiles for the current 10,025-entry Web catalogue, preview quote endpoint, database ledger/reservation schema, authenticated wallet endpoint, and cross-platform pricing copy. **Live purchases and automatic deductions remain disabled.** Do not set billing launch flags to true until each payment adapter, store product, receipt/webhook verifier, cost audit, entitlement check and usage-metering integration has been implemented and tested.

See [Monetization architecture and launch checklist](docs/monetization-architecture.md) and [tool-by-tool billing profile audit](docs/billing-tool-audit-2026-10-18.md). Validate changes with `npm run check:billing`; regenerate catalogue profiles with `npm run generate:billing-profiles`.

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

## Developer category audit & competitive research

The Developer category's source audit, implementation changelog, and research-to-fix evidence maps are maintained under `audit/`. The latest research pass is [Deep Research & Enhancement Round 4](audit/DEEP-RESEARCH-ENHANCEMENT-ROUND4-2026-10-13.md), following [Round 3](audit/DEEP-RESEARCH-ENHANCEMENT-ROUND3-2026-10-13.md); the broader competitor review is [Competitive Research & Implementation Review](audit/COMPETITIVE-RESEARCH-AND-IMPLEMENTATION-REVIEW-2026-10-13.md). The focused Web engine tests and route/catalog-preservation checks are reproducible via `npm run check:developer`, `npm run check:developer-routes`, and the Node test command documented in the latest audit. Build blockers and the distinction between source checks and actual Android/iOS builds are explicitly recorded there.

## Latest Developer Studio work — Round 5 (13 October 2026)

The latest Developer Studio changes extend Regex Studio with cross-platform batch assertions, bounded local benchmarks, substitution pipelines, named capture output, regex source inspection, and static flavor hints. SQL dialect controls now feed the separate TypeScript, Kotlin and Swift formatter engines. Shared golden fixtures and verification scripts are included to catch cross-platform drift. Read `audit/DEEP-RESEARCH-IMPLEMENTATION-ROUND5-2026-10-13.md` and `audit/ROUND5-VERIFICATION-RESULTS-2026-10-13.md` for the implementation inventory, test results and explicit limitations. SQL formatting remains lexical rather than parser-backed; full platform builds, browser privacy/a11y runtime checks and quantitative competitor benchmarks still require their respective toolchains and environments.

## Developer Studios quality gates (Round 6)

The Developer Studios now use local parser/formatter engines where the Web can bundle maintained parsers, with independent Kotlin and Swift native formatters. Shared regression fixtures are stored at `tests/fixtures/developer-studio-golden.json` and verified with `npm run check:developer:fixtures`. Run `npm run check:developer`, `npm run check:developer:privacy`, and `npm run check:developer-routes` before merging changes. In a network-enabled environment, also run `npm run audit:developer:browser:ci` and `npm run benchmark:developer`. Android/iOS source changes must pass the authoritative platform workflows. See `audit/ROUND6-IMPLEMENTATION-AND-VERIFICATION-2026-10-14.md` for exact verification status and limitations; XML Web formatting is a conservative structure preflight plus the HTML printer, and native SQL formatting remains a lexer rather than a full SQL parser.

## Audio & Live Video Studio interface work — Round 10 (16 October 2026)

Round 10 adds goal-first Music Studio shortcuts, a drag-and-drop audio import zone, explicit workflow progress and ready states, keyboard navigation for workspace tabs, and clearer recording setup guidance. Android/Kotlin and iOS/SwiftUI now include native quick-start guides and full-width camera actions for phone layouts. Existing expert controls remain accessible. Research findings, source links, checks, and limitations are documented in `audit/AUDIO-LIVE-VIDEO-STUDIO-ROUND10-UX-RESEARCH-CHANGELOG-2026-10-16.md`. Run `npm run check:audio-studio-usability` alongside the audio-specific checks. Source-level tests are passing; full web dependency builds and authoritative Android/iOS device builds and viewport tests remain unverified in the current environment.
