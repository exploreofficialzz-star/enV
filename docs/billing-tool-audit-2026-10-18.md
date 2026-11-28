# enV catalogue-wide per-tool billing audit — 2026-11-25

Generated from the authoritative Web catalogue and native runtime-extension registry. Every tool ID receives an individually addressable profile. Local workload rates are draft value/usage estimates, not measured handset CPU costs. Variable AI/provider and remote infrastructure work remain usage/invoice-driven. No profile in this report is approved for live token deductions.

- Base catalogue tools: 10,001
- Runtime extension tools: 13
- Total profiles: 10,014
- Local/web-local profiles with numeric workload tariffs: 9,780
- Direct AI profiles with model-rate metering: 28
- Remote profiles awaiting provider/infrastructure allocation: 206
- Android native inventory IDs covered: 7,909
- iOS native inventory IDs covered: 7,909

## Execution distribution

| Execution mode | Tools |
|---|---:|
| cloud-or-remote | 234 |
| local-device | 9779 |
| web-local | 1 |

## Billing classification distribution

| Billing key | Tools |
|---|---:|
| ai.standard | 28 |
| cloud.audio_processing | 8 |
| cloud.document_processing | 75 |
| cloud.generic_processing | 13 |
| cloud.transcription | 3 |
| cloud.video_processing | 107 |
| local.audio_processing | 104 |
| local.calculator | 6549 |
| local.converter | 146 |
| local.general | 2556 |
| local.image_basic | 236 |
| local.image_intensive | 148 |
| local.text | 38 |
| local.video_processing | 3 |

## Pricing interpretation

- Local/web-local tools receive an individual numeric draft rate, tool-specific unit, workload tier, formula, factors and metering dimensions. The selected unit must be calculated from the operation actually completed.
- Direct AI tools are priced from the selected provider/model's input/output tokens, audio seconds or compute seconds. Returned usage is recorded with model-registry estimated cost, retries/fallback indicators and a provisional margin. This is not a final provider invoice.
- Other cloud/remote tools remain unpriced until per-tool provider invoices and infrastructure allocations can be recorded. Do not divide Render service-wide graphs across tools as though they were tool-level invoices.
- The separate 267-tool ad-free access/session rate is not an operation price and does not replace the per-tool workload schedule.
- Ad eligibility is determined by the separate Adsterra policy; a billing profile never grants ad eligibility.
- Every row remains manual-audit-required and non-billable until benchmarks, exact measurement wiring, finance approval, reservations, settlement and production tests are complete.

## Generated source of truth

- `src/data/billing-profiles.json`: full profile for each base catalogue tool.
- `src/data/billing-profile-runtime-extensions.json`: additional native/runtime tools.
- `src/lib/billing/proposed-pricing.mjs`: deterministic draft workload calculator.
- `docs/billing-proposed-prices-2026-11-25.md`: local rate distribution and per-tool pricing policy.