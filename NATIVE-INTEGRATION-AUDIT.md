# Native Android/iOS Integration Audit

## Architecture decision

Android and iOS no longer embed or execute the frontend website. The native applications use Kotlin and Swift engines directly. When a tool genuinely requires server-side processing, the native app calls the enV backend API directly. The web application remains the website implementation and is not used as a native runtime.

## Current catalog

- Total catalog records: 10,000
- Active/beta: 8,894
- Planned: 1,106
- Active offline-native: 8,815
- Active backend-native: 79
- Planned offline-native execution paths: 1,095
- Planned backend execution paths: 11
- Android/iOS execution matrix: 10,000 / 10,000

## Native behavior

- Existing family-specific Kotlin/Swift engines remain authoritative where they already implement an operation.
- The native expanded engine handles catalog operations that do not need a remote processor instead of falling back to the website.
- Backend-required operations call the existing `/api/backend/*` gateway directly.
- Audio/video transcription, OCR, PDF/media processing, URL media, DNS/RDAP, and website screenshots are represented as native backend calls.
- File selection, execution, result display, copy, and save/share remain native UI behavior.

## Environment configuration

Android accepts `-PENV_API_BASE_URL=...` and includes `.env.example`. iOS exposes `ENV_API_BASE_URL`/processor variables through `Config.xcconfig.example`. Server-side processor URLs are read from environment variables and may be added to the repository/deployment environment as requested.

## Verification

- `scripts/check-native-executability.mjs` validates Android/iOS parity against the canonical catalog.
- `scripts/check-native-no-web-runtime.mjs` rejects WebView/WKWebView/hybrid native runtime references.
- `scripts/export-native-execution-matrix.mjs` regenerates the complete 10,000-record execution matrix.
- Android/iOS source remains separated from the website source.

## Build limitation in this environment

The sandbox does not contain the Android SDK/Gradle distribution or Apple Xcode SDK, so a production APK/IPA build cannot honestly be marked successful here. The source-level audits and Swift syntax checks available in this Linux environment are run before packaging.

## Final sandbox validation

- Catalog audit: PASS
- Production uniqueness audit: PASS
- Full native execution matrix: PASS (10,000/10,000)
- Android/iOS parity: PASS
- Native no-WebView guard: PASS
- Swift syntax parse: PASS for all checked Swift sources
- Kotlin syntax scan: no Kotlin parser/syntax errors detected; full compilation is SDK-dependent
- Node/TypeScript server-route syntax checks: PASS with Node strip-types mode
- Full npm dependency test/build/lint suite: not executable in this sandbox because the final source archive intentionally contains no `node_modules`, and network/package installation is unavailable.
- Android APK and iOS IPA builds: not executable here because the Linux sandbox does not contain the Android SDK/Gradle distribution or Apple Xcode SDK.
Final native source guard and stale-reference scan completed.

## AI infrastructure integration — 2026-10-04

- Native Android and iOS AI clients call the repository AI API directly at `/api/ai/status` and `/api/ai/run`; they do not use WebView/WKWebView or the frontend website runtime.
- The native backend/AI base URL is configured as `https://env-q3mq.onrender.com` for the supplied deployment, with Android Gradle override support and an iOS Xcode build setting/xcconfig example.
- Provider secrets remain server-side. No OpenRouter, Groq, or Gemini key is embedded in Android/iOS source or build configuration.
- The AI feature bindings are audited against the canonical catalog, and the same 17 active AI bindings are mapped to Kotlin and Swift.
- Server-side AI routing retains provider selection, cost/privacy gates, rate limiting, request validation, prompt snapshots, and provider fallbacks from `src/lib/ai`.
- Image and audio AI payloads are prepared natively before transmission; anonymous AI session cookies are persisted locally so backend session controls remain effective.

### Final AI/native security checks

- `check-native-ai` passes after asserting the configured native backend URL is `https://env-q3mq.onrender.com` and the old native Vercel URL is absent.
- No provider credentials (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`) are present in `apps/android` or `apps/ios`.
- Native AI calls remain direct Kotlin/Swift HTTP requests; no web runtime is involved.
