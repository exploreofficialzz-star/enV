# enV offline wallet and fraud-resistance design

**Status:** partial server/native implementation for audit and integration testing. Offline token spending, real-money purchases, promotional grants, and automatic deductions remain disabled. Production requests are explicitly locked. The native integrity/finalization verifier is not implemented, so a signed device checkpoint cannot release unused funds; finalization remains in recovery. This document is not evidence of a production-ready wallet.

## Core invariants

1. The server is authoritative for wallet balances, reservations, pricing versions, account linking, reward grants, and final transaction outcomes.
2. Money-like quantities use integer milli-token subunits (`1 token = 1,000 subunits`). Never use floating-point arithmetic for ledger writes.
3. Every mutation is transactional and idempotent. Replaying a sync request, payment callback, grant request, or settlement must not create value twice.
4. Offline operation is opt-in per supported tool and only available after a bounded server reservation is confirmed. Cloud-only operations cannot run offline.
5. Unknown-cost and ambiguous operations fail closed. No client-supplied balance or claimed cost can directly mutate a wallet.
6. Lost offline records do not prove zero usage. Unresolved allowances stay reserved pending a documented recovery decision; never auto-refund on a missing client ledger.
7. Security telemetry is metadata-only and privacy-minimized. Do not store file content, prompts, extracted text, passwords, private keys, raw device IDs, or payment-card data in security events.
8. A device signature proves that a key signed a statement; it does not prove a local tool ran or that the journal includes every operation. Never release unused reserved funds based solely on a client-signed final checkpoint.
9. Offline v1 is a single fixed-price invocation per record (`unitCount = 1`). User-controlled durations/batch counts cannot determine charges while the device is offline. The outcome is telemetry only; a client cannot avoid the charge for a durably started metered operation by reporting `failed`.

## Threat model and mitigations

| Threat | Required control |
|---|---|
| Duplicate sync / request replay | Unique transaction IDs, allowance-scoped sequence uniqueness, database constraints, idempotency keys, atomic wallet settlement. |
| Client edits claimed token usage | Recalculate from a server-owned, versioned operation registry; accept only allowlisted, fixed-price local tools. V1 rejects client-reported unit counts other than one. |
| Clear cache, browser storage, app data, or reinstall | Server-side reservation remains unresolved; no automatic refund; show recovery instructions and support path. Local durable storage reduces accidental loss but cannot prevent deletion. If records are gone, exact actual usage cannot be reconstructed from the server alone. |
| Device clock rollback or expiry bypass | Validate the signed server expiry, allowance state, sync grace, and bounds on record timestamps. Device time is not authoritative. |
| Omit operations then sign a short/empty final batch | A client signature is not journal-completeness proof. Keep the entire reservation unresolved unless a matching server-verified native integrity/finalization proof exists. No such verifier is active in this release. |
| Label a started operation as failed | The accepted fixed price is independent of the outcome field; clients cannot trigger a refund by signing a `failed` outcome. A partially written `preparing` ticket triggers recovery, not guessed usage. |
| Race two issuance/sync requests | Lock the wallet/account row, use unique database constraints and allowance-scoped idempotency, and keep settlement in one transaction. |
| Two offline devices spend the same wallet | Atomically reserve disjoint allowances from available balance; account linking never duplicates balances or welcome grants. |
| Fake signup / welcome-grant farming | Unique grant-event constraint, server-side account eligibility, per-account/device/network rate limits, risk-based challenges, and delayed review for suspicious clusters. Shared IP alone is not proof. |
| Credential stuffing / session theft | Rate limits, secure session cookies, reauthentication for sensitive wallet actions, revocation, anomaly detection, and recovery controls. |
| Forged purchase receipt or replayed webhook | Verify signatures/receipts with provider APIs, check product/amount/currency/ownership, and enforce provider event and transaction uniqueness. |
| Retry storms or agent runaway | Server-enforced per-task budgets, bounded concurrency, maximum retries, timeouts, reservations, and explicit user approval before extending budget. |
| Abuse of uploads and processors | File/type/size limits, URL egress protections, concurrency quotas, timeouts, global spend ceilings, and provider-level limits. |
| Admin telemetry misuse | Secret-managed admin access, least privilege, audit events, rate limits, and aggregate reports that omit user content. |

## Offline allowance lifecycle

1. Authenticate/identify the wallet and device using a server-validated session and a device public-key digest; never store raw device identifiers unnecessarily.
2. Server checks risk, balance, outstanding allowances, tool eligibility, and current pricing version. Reserve an amount transactionally in the shared wallet.
3. Issue a signed, expiring allowance that binds user, device key digest, allowance ID, amount, pricing version, eligible operation classes, and expiry. The signature must be verified by the server on sync; local storage alone is not authorization.
4. Client records each eligible operation in a durable journal before reporting local success. Each record has a random transaction ID, strictly increasing allowance-local sequence, tool ID, pricing version, usage digest, and bounded cost claim.
5. On sync, validate signature, status, expiry policy, sequence, operation allowlist, usage bounds, and remaining reserved amount. Recalculate accepted charges on the server. Insert transaction records and update wallet/reservation in one database transaction.
6. Duplicate transactions return their original result. Gaps, conflicts, changed pricing versions, invalid signatures, and cost overrun go to rejection or manual review; they never produce a negative wallet balance.
7. A normal-looking client journal and signed final checkpoint still do not prove completeness. Before releasing unused funds, require a matching proof inserted only after server-side native integrity/journal verification. That verifier is not currently implemented; therefore all final submissions end in `needs_recovery` and preserve the reservation. This is intentionally fail-closed.
8. After an independently verified proof exists, the server may re-evaluate the exact saved final batch, settle accepted fixed charges, and release the remainder atomically. Replaying that exact batch must remain idempotent.
9. Expiry is a recovery state, not permission to silently free a potentially spent allowance. Release only with verifiable evidence or a separately authorized, audited recovery decision. Define customer notices and escalation timelines before launch.

## Storage by platform

- **Web:** IndexedDB stores a non-exportable WebCrypto P-256 key, issue intent, operation journal, and byte-for-byte retryable batch. Browser storage can be cleared and client JavaScript can be modified; Web offline metering must not be treated as tamper-proof and is not enabled in production.
- **Android:** This package adds an SQLiteOpenHelper journal plus an Android Keystore P-256 signer. WorkManager scheduling and app-attestation verification are not yet wired; the native build has not been verified in this Linux environment. Keystore signing does not alone prove journal completeness or protect every compromised/rooted device.
- **iOS:** This package adds a SQLite journal plus a Keychain-backed P-256 signer using device-only accessibility. Secure Enclave enforcement and App Attest verification are not yet wired; the native build has not been verified here. Background execution is best-effort and OS-controlled.
- **Shared server:** same pricing versions, allowance state machine, ledger invariants, sequence validation, idempotency, fraud rules, and recovery policy across all clients. Native apps implement platform storage/sync, not independent wallet math.

## Production launch gates

Do not enable offline spending until all of the following are implemented and tested:

- Signed allowance issue/verify/revoke flow and device key enrollment/rotation, plus verified Apple App Attest / Google Play Integrity (or equivalent) integration for native app integrity.
- A server-side verifier for journal completeness that binds the attested app/key, exact allowance, pricing version, checkpoint sequence, and proof digest. Never trust a client-only `finalized` boolean; the current implementation intentionally refuses automatic final settlement until this exists.
- Decide the Web policy separately: leave token-consuming offline operations disabled, or explicitly commit a non-refundable offline budget at issue with clear consent. A browser-signed ledger cannot prove every local operation.
- Transactional reservation, sync, settlement, release, duplicate handling, and lost-record recovery endpoints. Current issue/status/sync/recovery APIs are feature-gated; normal final settlement is blocked awaiting verifier integration.
- Tool allowlist with explicit deterministic metering; no cloud/AI work without online authorization.
- Automated tests for replay, duplicate batches, partial sync, omitted records, empty final batch, reordered events, sequence gaps, expiry, clock rollback, cache clear, app-data clear, reinstall, account linking, two devices, failed-outcome manipulation, and concurrent requests.
- Abuse dashboards and alert thresholds for grant farming, repeated recovery events, unusual usage, failed auth, processor spend, and webhook failures.
- Privacy notice, user-facing offline allowance amount/expiry, support path, refund/recovery terms, and operational incident runbook.
- Independent security review and production database migration verification.

## Implemented paths and schema

- `migrations/0003_offline_wallet.sql`: allowances, transaction records, and metadata-only security events.
- `migrations/0004_offline_wallet_hardening.sql`: issue idempotency, platform/public-key binding, replay-safe batch responses, fixed-window account/device rate limits, and the server-verified finalization-proof table.
- `src/lib/billing/offline.server.ts`: bounded allowance issue, signed-token verification, idempotent record sync, fixed-price server lookup, loss recovery, abuse rate limiting, and aggregate security summaries.
- `src/lib/billing/offline-client.ts`: Web IndexedDB journal, non-exportable key, durable pre-execution ticket, gap detection, persisted pending batch, and recovery-safe acknowledgement rules.
- `apps/android/.../OfflineWalletDeviceKey.kt` and `OfflineWalletJournal.kt`: platform-keystore signer and SQLite journal.
- `apps/ios/enV/OfflineWalletDeviceKey.swift` and `OfflineWalletJournal.swift`: device-only Keychain signer and SQLite journal.
- `GET /api/billing/admin/offline-security?hours=24`: secret-protected aggregate reporting without returning user content.

Run `npm run db:migrate` against the configured production PostgreSQL database as a separately reviewed deployment step. The migration alone does not enable offline deduction. Production offline endpoints remain locked by `NODE_ENV=production` / Vercel detection, and the example flags default to `false`. Do not remove that lock until native attestation, verified journal completeness, pricing approval, support recovery, and platform builds have been independently tested.

## Phase 4 hardening update (2026-10-18)

- `GET /api/billing/offline/status` exposes only a generic feature-gate code/message; it does not expose signing material or backend credentials. The account wallet view surfaces this state and any allowance recovery reason without offering a client-controlled refund action.
- Any configured `DATABASE_URL` is treated as a persistent deployment for offline-metering gating, even if `NODE_ENV` is mislabeled. The unverified offline claim path therefore stays locked for external/staging/production databases.
- Operator endpoint `GET /api/billing/admin/offline-recoveries?limit=50` is read-only, requires `BILLING_ADMIN_TOKEN` of at least 32 UTF-8 bytes, compares equal-length secrets with `timingSafeEqual`, and never issues settlement/refund/release mutations. It lists unresolved recovery cases and reservations older than the 14-day sync grace for an operator to review.
- Public-key JWK coordinates, device signatures, and both segments of server-signed allowance tokens are rejected unless base64url is canonical, including zero unused trailing bits. This avoids alternate textual encodings for the same bytes being accepted as identity/signature inputs.
- On Web, Android, and iOS, only server rejection codes `SEQUENCE_GAP` and `CHECKPOINT_SEQUENCE_MISMATCH` can replace a pending batch envelope. The exact saved batch ID must match. Local transaction rows, sequence counters, and charged/spent subunits remain intact; all other anomalies stay locked for recovery review.
- The server recovery state machine permits `FINALIZATION_PROOF_REQUIRED` to resume only when it replays the same final batch ID and digest and finds a matching, server-verified proof. A fresh or non-final batch cannot clear that reason or transition the allowance back to `syncing`.
- Additional native unit assertions cover the retry-code allowlist. The Web account page exposes generic offline status and allowance recovery fields. It does not imply production offline spending is active.

### Independent integrity verification still required

A non-exportable WebCrypto key, Android Keystore key, iOS Keychain key, or a valid device signature proves possession of a key for a given message; none alone proves that an unmodified application submitted every offline operation. Do not populate `billing_offline_finalization_proofs` from a client assertion.

Before considering native offline metering, implement server-verified App Attest on Apple platforms and Play Integrity on Android, bind their server-verified evidence to a single-use challenge, account/device key, exact allowance ID, pricing version, checkpoint sequence, and final batch digest, and enforce replay/counter semantics server-side. Relevant official references:
The verifier plan should follow the platform-specific checks rather than treating a device signature as attestation:

- **Apple App Attest:** issue a random one-time server challenge; verify the attestation certificate chain, app identity and environment; store the verified key by user/device; verify later assertions against the exact canonical final-batch request and require the assertion counter to strictly increase. Never accept a client-provided “verified” boolean or replay an already consumed challenge.
- **Google Play Integrity Standard API:** request the integrity token for the finalization request, bind `requestHash` to a digest of the allowance ID, device-key digest, pricing version, checkpoint sequence, and final batch digest; decode/verify the verdict on the server; compare `requestDetails` to the original request and apply a tiered policy to app/device/account verdicts. Do not cache verdicts or trust a verdict passed through by the client.
- **Both platforms:** make challenges single-use and atomically consumed with the proof insert and final settlement; test duplicates, races, stale assertions, mismatched batch digests, replayed tokens, key rotation, and valid app / compromised device / unsupported integrity-service conditions. A failed or unavailable attestation keeps the reservation locked for review; it must not trigger an automatic refund.


- Apple: https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
- Android: https://developer.android.com/google/play/integrity/standard
- Android overview: https://developer.android.com/google/play/integrity/overview

These attestation integrations, signed device enrollment/rotation, production database integration tests, native platform builds, and independent security review remain launch blockers. Web token-consuming offline metering should remain disabled unless the product deliberately chooses a bounded, upfront, non-refundable allowance with clear user consent and an approved legal/support policy.

### Request-body abuse hardening

`src/lib/billing/bounded-json.server.ts` now reads JSON request bodies as a stream and enforces the byte limit while reading, including when `Content-Length` is absent or untrusted. Declared oversize bodies are rejected before reads, over-limit streams are cancelled, UTF-8 decoding is strict, and only JSON objects are accepted. The billing test suite includes no-length/chunked oversized requests, cancellation, malformed JSON, invalid UTF-8, and unsupported content types.
