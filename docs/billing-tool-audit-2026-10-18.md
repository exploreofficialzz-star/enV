# enV tool-by-tool monetization profile audit — 2026-10-18

## Scope

Generated from the authoritative Web catalogue metadata. This is a first-pass classification, not a claim that each operation's real compute cost has been measured. Every profile is marked provisional and requires a manual cost/pricing audit before live charging.

- Catalogue tools profiled: **10,025**
- Local-device profiles: **9824**
- Cloud/remote profiles: **201**
- Profiles requiring manual audit: **10,025**
- Android native tool IDs covered by this registry: **7,783 / 7,783**
- iOS native tool IDs covered by this registry: **7,783 / 7,783**
- Advertising eligible in this monetization plan: **0**
- The base catalogue profile index remains at **10,025** entries; the native-only `song-metadata-analyzer` extension has a separate provisional profile in `src/data/billing-profile-runtime-extensions.json`.

## Count by billing rule

| Billing rule | Tools |
|---|---:|
| `cloud.audio_processing` | 7 |
| `cloud.document_processing` | 82 |
| `cloud.generic_processing` | 3 |
| `cloud.transcription` | 3 |
| `cloud.video_processing` | 106 |
| `local.audio_processing` | 106 |
| `local.calculator` | 6546 |
| `local.converter` | 145 |
| `local.general` | 2603 |
| `local.image_basic` | 235 |
| `local.image_intensive` | 148 |
| `local.text` | 38 |
| `local.video_processing` | 3 |

## Count by catalogue status

| Status | Tools |
|---|---:|
| active | 10025 |

## Reading these profiles

- `local.*` rules are pricing hypotheses for small, standard or intensive local work. They are not evidence of direct server cost, and should be validated with user research and value/effort tests.
- `cloud.*` rules require measured provider/infrastructure cost, retry/fallback accounting and margin calculations before a quote can be charged.
- Tools whose `engineType` is `ai` may expose an optional AI-assist path; their normal deterministic/local path must not automatically be charged as an AI request. The AI operation should be metered separately when invoked.
- Usage-sensitive tools require their handler to supply measurements (for example audio duration, image pixel count, document pages, video duration/resolution). The registry lists the dimensions that must be captured. Do not bill them with a guessed number of units.
- `src/data/billing-profiles.json` is generated; change `scripts/generate-billing-profiles.mjs` then re-run generation rather than editing profile rows by hand.

## Required next audit actions

1. Sample each billing rule and verify the actual entry point and whether it runs locally, remotely or through an optional remote assist.
2. Instrument input/output dimensions and measure representative light, normal and heavy workloads.
3. Capture provider invoices/rates, retries, cache hits, failed jobs, storage and bandwidth costs.
4. Calculate margins after provider fees, app-store fees, refunds and promotional credits.
5. Remove pricing for any tool that cannot show a credible estimate before execution; ship it as free or premium capability until measured.
6. Turn on billing only after entitlement enforcement, ledger settlement and production tests are complete.

## Continuation audit — persistent AI usage capture (2026-10-18)

The next engineering pass wires the AI HTTP handler to the existing persistent billing usage ledger in **shadow-metering mode**:

- Successful AI requests record task ID, provider/model when a new provider call occurred, provider-reported token/audio usage, request latency, retry/fallback indicators, pricing version, and a model-registry cost estimate where available.
- Cache hits are recorded as zero new provider spend and zero provider tokens for the cached invocation.
- Valid AI executions that fail are recorded as `unknown_cost`, rather than incorrectly recording zero. They do not create a token deduction.
- Prompts, response content, files, conversation history, account identifiers in the admin report, and provider payloads are not included in usage event metadata. The user ID is stored only in the private ledger foreign key where an authenticated ID was available.
- `actual_cost_usd_micros` remains null because registry estimates are not provider invoices. Failed attempts and retry/fallback attempts may still have unmeasured upstream cost; these records are explicitly surfaced.
- All captured usage events have `billed_subunits = 0`. Shadow metering does not itself authorize or activate charging.

Added `GET /api/billing/admin/usage` as a bearer-token-protected aggregate report over the last 30 days. Configure the server-only `BILLING_ADMIN_TOKEN` to enable it; the route returns 404 if not configured, uses timing-safe comparison, is no-store, and intentionally excludes user IDs and task input/output content. Actual provider costs are returned as `null` until provider invoices are ingested.

Validation: `npm run check:billing` passed after adding source checks for the AI capture hooks, unknown-cost failure path, no-charge shadow mode, and admin report protections. The targeted AI handler runtime tests could not execute in this environment because the provided `node_modules` has incomplete packages (the `zod` entry point is missing); full `npm run typecheck` is likewise blocked because `@types/node` and `vite/client` type definitions are absent. This is a dependency/environment blocker, not a claimed passing compile.

Remaining before production charging: collect per-provider invoice/usage records; cost and approve profiles tool-by-tool; wire reservation/settlement to actual agent/tool execution; require sign-in; implement and verify provider-specific webhooks plus Apple/Google store purchase verification; reconcile refunds/disputes; and complete clean-install Web, Android and iOS build verification. Billing launch and enforcement remain off.

## Continuation — operational usage capture (2026-10-18)

The phase-2 audit adds shadow telemetry at AI, proxy and local server processing boundaries. Remote processor requests record known input length, streamed output bytes, upstream HTTP status/host class and duration; locally executed server operations record route class, input length when declared, streamed output bytes, response status and duration. No request bodies, response bodies, file names or extracted content are written to the usage ledger. Actual and estimated dollar cost remain `null` for gateway/self-hosted operations until infra invoice data and allocation rates are connected. AI model-registry estimates remain estimates; they are not invoice truth. All measured events still have zero billed token subunits.

Instrumented gateway routes include proxy media, transcription, website screenshot, URL media and cloud OCR, plus locally executed documents, PDF, images, barcode, network lookup, mockup rendering, screenshots, template tools and local Tesseract OCR. This is operational telemetry coverage, not proof that every catalogue tool has been individually cost-benchmarked.
