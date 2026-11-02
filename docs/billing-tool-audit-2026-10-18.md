# enV tool-by-tool monetization profile audit — 2026-10-18

## Scope

Generated from the authoritative Web catalogue metadata. This is a first-pass classification, not a claim that each operation's real compute cost has been measured. Every profile is marked provisional and requires a manual cost/pricing audit before live charging.

- Catalogue tools profiled: **10,001**
- Local-device profiles: **9800**
- Cloud/remote profiles: **201**
- Profiles requiring manual audit: **10,001**
- Android native tool IDs covered by this registry: **7,758 / 7,758**
- iOS native tool IDs covered by this registry: **7,758 / 7,758**
- Advertising eligible in this monetization plan: **0**

## Count by billing rule

| Billing rule | Tools |
|---|---:|
| `cloud.audio_processing` | 7 |
| `cloud.document_processing` | 82 |
| `cloud.generic_processing` | 3 |
| `cloud.transcription` | 3 |
| `cloud.video_processing` | 106 |
| `local.audio_processing` | 107 |
| `local.calculator` | 6516 |
| `local.converter` | 145 |
| `local.general` | 2608 |
| `local.image_basic` | 235 |
| `local.image_intensive` | 148 |
| `local.text` | 38 |
| `local.video_processing` | 3 |

## Count by catalogue status

| Status | Tools |
|---|---:|
| active | 10001 |

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
