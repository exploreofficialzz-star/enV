# enV monetization continuation — 18 October 2026

## Work completed

1. Wired AI task execution into persistent `billing_usage_events` using a metrics-only hook. Successful executions capture provider/model when applicable, token/audio usage, an estimated cost from the model registry, latency, attempt count, fallback state and pricing version. No prompts or outputs are persisted in the usage event.
2. Cache hits are represented as zero provider usage/cost for that request. Failed executions after dispatch are recorded with `unknown_cost` and null usage/cost, because a provider may have incurred cost even if the task did not return a result.
3. Kept `actual_cost_usd_micros` null and `billed_subunits` at zero. A registry estimate must not be presented as an invoice, and this pass does not switch on billing.
4. Added `GET /api/billing/admin/usage`, a server-only aggregate report protected by `BILLING_ADMIN_TOKEN`, with a 30-day window and a maximum of 100 operation/provider groups. It does not return user IDs, prompt inputs, outputs or files. Actual cost appears as null until real invoice data is imported.
5. Updated `scripts/check-billing.mjs` to assert that the usage-capture hook exists, failure cost is not assumed to be zero, shadow mode never charges, admin-token verification is timing-safe, and missing invoice cost is reported as unknown.

## Tests and verification

- `npm run check:billing`: PASS (9 catalog tests + structural billing audit).
- `node --check scripts/check-billing.mjs`: PASS.
- `node --check scripts/generate-billing-profiles.mjs`: PASS.
- AI handler unit suite: BLOCKED before test execution because the supplied `node_modules/zod/index.js` is missing.
- TypeScript typecheck: BLOCKED because supplied `node_modules` lacks type definitions for `node` and `vite/client`.
- No clean Web production build or Android/iOS compile is claimed.

## Safety/production status

Real checkout, credit purchases, token deduction, and native store billing remain disabled. `BILLING_ADMIN_TOKEN` is an optional server-only secret to enable aggregated cost reporting. Profile rates remain provisional and require manual audit. Do not flip `BILLING_LAUNCH_ENABLED` or `BILLING_ENFORCEMENT_ENABLED` until approved pricing, user-approved reservations, workflow settlement, payment/store verification, refunds/disputes and clean multi-platform builds are tested.

## Continuation phase 2 — execution-path usage capture (2026-10-18)

1. **AI execution capture made safer.** The outgoing AI response is now serialized before recording the success event. If response serialization fails after model execution, the catch path records unknown cost rather than colliding with a prior success event under the same request ID.
2. **Remote processor proxy metering.** `backend/http.ts` records content-free usage events for media, transcription, website screenshots, URL-media and cloud OCR proxy requests. It records the route, operation class, configured upstream hostname, known input length, actual streamed output bytes, HTTP status and end-to-end duration. The response body is streamed with backpressure and cancellation forwarding; no request/response body contents are saved.
3. **Local server-side operations metered.** A shared `measureServerOperation` wrapper now records operational usage for document, PDF, image, barcode, network lookup, mockup, screenshot, template-tool and local Tesseract OCR routes. These entries are still `unknown_cost` because runtime, byte counts and route class do not establish the dollar cost of the hosting infrastructure.
4. **Admin report corrected.** Success counts now include successful `executionStatus` entries even when their cost remains unknown. Failure counts likewise retain failed execution attempts; actual provider/infrastructure costs remain `null` until invoice/usage ingestion is built.
5. **Still shadow-only.** All new measured operations use `billedSubunits = 0`; no price is inferred from runtime or bytes and no user balance is changed. Usage database capture failures are logged without replacing the user's result.

### Phase 2 verification

- `npm run check:billing`: PASS (9 billing catalogue tests + static billing/usage audit).
- `npm run check:production`: PASS (10,000 catalogue tools, unique IDs).
- `npm run check:production-gating`: PASS (10,000 catalogue entries reviewed, cross-platform gating checks pass, 2 production-notice tests pass).
- TypeScript syntax transpilation via the installed TypeScript compiler API: PASS for the changed AI, billing-report, proxy and local processing route files.
- Full `npm run typecheck` and `npm run build`: remain blocked by the partial provided `node_modules` tree; required type definitions/packages and Vite executable are unavailable. Runtime AI unit tests remain blocked by missing `zod` package entrypoint. No end-to-end HTTP/database integration or native app compilation is claimed.

### Remaining work

- Build a provider invoice/usage importer and reconcile model registry estimates with actual charges, including retries and fallback attempts.
- Measure actual self-hosted CPU/RAM/GPU and storage/bandwidth costs; route/byte/duration telemetry is an input to cost allocation, not a dollar cost by itself.
- Integrate reservation/settlement with the future autonomous agent's actual tool dispatcher. The current package does not yet expose a complete autonomous agent tool-orchestration lifecycle to hook safely into.
- Finish per-tool cost/usage dimensions, approved pricing, authenticated purchase adapters, Apple/Google verification, web payment providers, refunds/reconciliation and clean builds before enabling deductions.
