# enV Phase 4 — Offline Wallet, Request Abuse, and Support-Center Hardening Audit

**Audit date:** 18 October 2026  
**Status:** Hardened engineering checkpoint; **not production-ready**  
**Billing posture:** Real purchases and automatic token deductions remain disabled.

## Executive result

This phase continues from the Phase 3 package and hardens the shared enV wallet foundation. It closes an offline finalization state-transition bypass, adds a bounded streaming request-body parser, expands regression tests, and strengthens the security/attestation rollout requirements. Web support pages for Blog, Help, and token-by-tool explanations remain included.

The source and targeted static checks pass. Full dependency-backed Web build/typecheck/lint, Android compilation/tests, iOS compilation/tests, a real PostgreSQL migration run, native attestation, and full integration with every local tool execution path are **not verified or not implemented**. Production offline charging remains deliberately locked.

## Changes included

### 1. Offline wallet and ledger invariants

- Server-issued allowance reservations are authoritative; a client-provided balance is never accepted as wallet truth.
- Allowance issuance reserves wallet subunits transactionally, uses account/device rate limits, bounded allowance amounts, a unique idempotency key, and one unresolved allowance per device.
- Transaction IDs, sequence numbers, canonical payload digests, device signatures, pricing versions, and server-side fixed-price lookup are validated during reconciliation.
- Every durably started metered invocation consumes its reserved amount regardless of whether the client labels its final outcome `succeeded` or `failed`. Client-reported failure cannot trigger a refund.
- Duplicate batch IDs with different payloads, duplicate transaction IDs/sequences, signature mismatch, pricing mismatch, tool-not-eligible, sequence gaps, or allowance overflow are rejected or moved into recovery review.
- The generic reservation expiry sweeper excludes reservations belonging to offline allowances. It cannot release an allowance whose unsynchronized local records may have been lost.
- Lost local records move the allowance into a recovery queue. Neither the client nor the read-only operator endpoint can issue an automatic refund or release the reservation.

### 2. Finalization recovery state-machine fix

A device signature proves possession of a private key for a message; it does not prove that a modified client submitted every offline operation. `FINALIZATION_PROOF_REQUIRED` now resumes only if the server is replaying the same saved final batch ID and digest and finds a separately server-verified proof bound to that exact digest, account, device key, platform, pricing version, and checkpoint sequence. A fresh or non-final batch cannot clear the lock and move the allowance back to `syncing`.

No endpoint currently creates trusted finalization proofs. This is intentional until platform integrity verification is implemented and independently reviewed. Therefore, the production gate remains closed.

### 3. Request-body abuse protection

`src/lib/billing/bounded-json.server.ts` reads billing JSON bodies as a stream and enforces the byte cap while reading—even if `Content-Length` is missing. It rejects a declared oversized body before consuming it, cancels over-limit streams, performs strict UTF-8 decoding, and accepts only JSON objects. The shared `readJsonObject` helper now uses this bounded reader.

Regression cases cover absent `Content-Length`, a declared oversized body, oversized streamed/chunked input, cancellation, malformed JSON, invalid UTF-8, array payloads, and unsupported content types.

### 4. Cross-platform local journal safeguards

- Web uses IndexedDB and a non-exportable WebCrypto private key.
- Android uses a SQLite journal and Android Keystore key material.
- iOS uses a SQLite journal and device-only Keychain key material.
- Web, Android, and iOS can replace a pending batch envelope only for the explicit `SEQUENCE_GAP` or `CHECKPOINT_SEQUENCE_MISMATCH` responses and only when the batch ID matches. They retain transaction rows and spend/sequence counters; other errors stay locked for recovery review.
- Native finalization blocks additional local operations once finalization starts.

These platform components are journal/key primitives and guarded protocol paths—not evidence of full integration into every native tool execution or an operating-system background-sync worker. That integration remains a launch requirement.

### 5. Abuse controls and operational visibility

- User/device fixed-window rate limits guard allowance issuance, sync, and recovery actions.
- Payload sizes, transaction counts, token-unit counts, fixed-price profiles, and allowance totals are bounded.
- Canonical Base64URL validation rejects noncanonical encodings for signed inputs and public-key coordinates.
- `/api/billing/offline/status` exposes the feature-gate state without revealing signing material.
- `/api/billing/admin/offline-recoveries` is a read-only, bearer-secret-protected queue. It requires a configured `BILLING_ADMIN_TOKEN` with at least 32 UTF-8 bytes and uses timing-safe comparison. It cannot mutate wallet balances.
- Security events record bounded metadata, not prompts, file contents, extracted text, private keys, or raw payment details.

Rate limits at the app/database layer do not replace edge/CDN volumetric protection. Shared IPs alone are not sufficient evidence of fraud.

### 6. Customer education and navigation

The package contains website routes for `/blog`, `/blog/$slug`, `/help`, `/tokens`, and `/tokens/$toolId`, navigation/footer links, token/pricing explanations, and lost-record recovery guidance. Proposed reference pricing remains clearly labeled as provisional, and unknown cloud costs are not shown as guaranteed charges.

## Verification results

### Passed in this checkpoint

| Check | Result |
|---|---|
| Billing unit/catalog tests + bounded JSON reader | 13 tests passed; billing schema/idempotency/fail-closed/profile audit passed |
| Offline cryptographic protocol + recovery policy | 9 tests passed; static offline-wallet audit passed |
| Product catalogue invariant | 10,000 tools; 10,000 unique IDs |
| Production gating | 10,000 catalogue tools scanned; 2,637 restricted; six exemption categories match across Web/Android/iOS; 2 tests passed |
| Blog/Help/token support-center audit | Passed; 10 artifacts/navigation/content invariants checked |
| Execution policy | Passed; 10,000 active catalog tools audited |
| Native UI parity | Passed |
| Accessibility rule parity | 37 required rule keys and report contract present in TypeScript/Kotlin/Swift |
| Migration plan tests | 6 tests passed; order/idempotency bookkeeping checked |
| TypeScript/TSX syntax transpilation | 23 changed server, billing, route, and test modules passed syntax transpilation |
| Swift syntax parsing | Offline key/journal, ContentViews, and protocol tests parsed successfully |

The focused test subsets above total 30 passing Node tests. These are not a substitute for a full end-to-end build or a security review.

### Blocked or unverified

| Check | State / reason |
|---|---|
| `npm run verify` | Stops at the AI integration check because installed dependencies are incomplete (`zod/index.js` missing). |
| `npm run build` | Blocked: Vite executable is missing from the partial `node_modules` tree. |
| `npm run typecheck` | Blocked: `@types/node` and `vite/client` type definitions are missing. Syntax transpilation does not establish type safety. |
| `npm run lint` | Blocked: ESLint executable is missing. |
| Browser calculator audit | Blocked: Playwright module is missing. |
| Full `npm test` | Earlier run: 275 passed and 7 failed due to missing modules (Prettier standalone, SQL formatter, and Zustand); rerun after a complete dependency install. |
| Android Gradle test/build | Not verified: Gradle distribution download failed in the network-restricted environment, and Android SDK/`android.jar` is unavailable. |
| iOS build/tests | Not verified: Xcode/iOS SDK is not available in this environment; Swift parser only. |
| SQL migrations | Migration ordering tests pass, but migrations were not applied to a real PostgreSQL/Neon instance or PGlite runtime here. Review and test them against a disposable database before deployment. |
| Runtime integration | No production environment, payment credentials, signed store receipts, device attestation services, or full tool-execution integration were tested. |

The dependency registry could not be reached from this environment during installation. Do not interpret absent build output as proof of a successful build.

## Production launch blockers — do not bypass

1. **Independent native integrity proof:** implement and verify Apple App Attest and Google Play Integrity on the server. Bind a one-time challenge to the user, device key, allowance, pricing version, checkpoint sequence, and exact final-batch digest; enforce single-use challenge and replay/counter semantics atomically with settlement. Do not trust a client-supplied verdict.
2. **Full client integration:** connect the journal to the real eligible tool execution wrappers and durable background/foreground synchronization in Web, Android, and iOS. Until then, these files are primitives, not an end-to-end offline-wallet feature.
3. **Trusted lost-record recovery:** define a reviewed support resolution process with an immutable audit record and explicit approval/settlement rules; never silently refund a reservation just because storage was cleared.
4. **Production database:** run and test migrations 0003–0005 and all required earlier billing/auth migrations on a disposable production-equivalent PostgreSQL database; verify locking, concurrent sync, uniqueness, and rollback behavior.
5. **Pricing and economics:** all generated tool prices remain provisional. Measure per-class costs, provider billing, retries, failures, fees, promotional grants, and margins before enabling charges.
6. **Authentication and payment flows:** configure and verify production auth and account recovery. Implement provider/server receipt validation, refunds/revocations, webhooks, Google Play Billing, and Apple StoreKit before enabling purchases.
7. **Dependency-backed verification:** perform clean dependency installation in a network-enabled CI environment, then pass full typecheck, lint, Web build, complete test suite, Android tests/build, iOS build/tests, and a separate security review.

## Rollout guard

The server intentionally reports offline spending disabled in production, on Vercel, or when `DATABASE_URL` is configured. `BILLING_OFFLINE_ENABLED` and `BILLING_OFFLINE_PRICING_APPROVED` are false in `.env.example`. Keep the lock. Do not set these flags to bypass the independent production lock; even in a non-production development environment, do not treat provisional price profiles as approved commercial pricing.

## Official integrity references

- Apple, *Validating apps that connect to your server*: https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
- Android, *Overview of the Play Integrity API*: https://developer.android.com/google/play/integrity/overview
- Android, *Make a standard Play Integrity API request*: https://developer.android.com/google/play/integrity/standard

