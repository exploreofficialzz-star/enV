# enV offline wallet integration — Phase 5

**Release posture:** integrated implementation checkpoint; production offline token collection remains disabled.

## What is wired end-to-end

The Web wallet, Android native app, and iOS native app now share a generated allowlist, canonical protocol fixtures, the same billing-profile pricing version, server-issued allowance claims, idempotency rules, and a single server reconciliation contract. The allowlist is intentionally limited to **267 explicitly instrumented local calculator actions** that have matching Web/Android/iOS execution paths; additional catalogue tools must not be added until each action boundary is wired and tested.

### Request/response lifecycle

| Step | API / local component | Responsibility |
|---|---|---|
| Check availability | `GET /api/billing/offline/status` | Returns a non-sensitive status and the exact disable reason. |
| Issue an allowance | `POST /api/billing/offline/allowances` | Authenticated wallet reservation; uses a client-persisted idempotency key and server-priced fixed units. |
| List account/device allowances | `GET /api/billing/offline/allowances` | Account scoped for Web; device scoped when authenticated by a paired native session. |
| Journal a local operation | Web IndexedDB / Android SQLite + Keystore / iOS SQLite + Keychain | Writes a unique transaction sequence and signature before making the result visible. Invalid calculator input is evaluated before a token-consuming journal ticket is started. |
| Synchronize | `POST /api/billing/offline/sync` | Validates allowance token, platform/device binding, canonical signatures, sequence, transaction uniqueness, pricing version, and server-side unit price. The same saved batch ID is reused for ambiguous retries. |
| Report lost records | `POST /api/billing/offline/recovery` | Places the allowance in recovery; never infers that missing records mean unused tokens. |
| Pair a native device | `POST /api/billing/offline/pairing`, then `POST /api/billing/offline/pairing/redeem` | Authenticated web user creates a one-time short-lived code. Native app redeems it with its public device key; the server stores only the session-token digest. |
| Inventory and revoke devices | `GET /api/billing/offline/pairing/sessions`, `POST /api/billing/offline/pairing/revoke` | Authenticated, account-scoped inventory and revocation. Revocation does not release an outstanding reservation. |

### Local preflight and billing semantics

For the currently allowlisted deterministic calculators, the three clients validate/compute locally before starting the chargeable journal ticket. Results remain hidden until the durable journal transition completes. This prevents ordinary invalid inputs from consuming an offline token. The server still does not trust a client-reported success/failure flag to determine the charge for a valid signed record.

Other local utilities continue to work normally but are not included in this offline billing allowlist. That is deliberate: a shared catalogue ID alone is not proof that its exact execution path is metered on every platform.

## Required environment

Example environment values in `.env.example` are intentionally disabled. Do not copy these local-test settings to production.

- Account authentication must be fully configured before wallet routes can identify an account.
- The offline signing secret must be a randomly generated secret of at least 32 bytes and must remain server-side.
- Pricing must be approved only after measured economics, user-facing disclosure, and support/refund policy are signed off.
- Persistent deployment migrations must be applied and verified against the actual production database.
- Real checkout and live token deductions remain separately gated.

The isolated local PGlite test-finalization mode requires explicit `BILLING_OFFLINE_TEST_FINALIZATION=true`, local non-production execution, and **no** `DATABASE_URL` or Vercel runtime marker. It is for synthetic test accounts and must never be enabled in a deployed environment.

## Production blockers — do not bypass these gates

### Independent finalization verification

No production verifier currently writes a trusted row into `billing_offline_finalization_proofs`. Device signatures prove possession of a private key for a message, but they do not prove that an unmodified client submitted every offline operation. The server therefore refuses to release unused reserved funds based solely on a final client-signed checkpoint.

Before enabling native production offline settlement, implement and independently test:

- Apple App Attest challenge issuance, attestation certificate-chain/app-identity/nonce verification, public-key and environment binding, assertion signature verification, and monotonic counter enforcement.
- Google Play Integrity token request binding via `requestHash`, server-side token decode/verification with Google, package/certificate/version/device verdict checks, and replay/one-time challenge protection.
- One-time server challenge rows bound to user, platform, native device key, allowance, pricing version, checkpoint sequence, and exact final batch digest. Challenge consumption, assertion-counter update, proof insertion, and wallet settlement must be transactionally replay-safe.
- An explicit Web policy. Browser-only JavaScript/WebCrypto cannot independently prove journal completeness against a modified browser. Do not hard-bill Web offline claims as if the browser provided native hardware attestation. Either use conservative no-refund/prepaid semantics disclosed before issue, keep Web offline actions unmetered, or require online settlement for token-consuming operations.

Authoritative integration guidance:

- Apple: https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server
- Apple: https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity
- Google: https://developer.android.com/google/play/integrity/standard

Platform credentials, app identifiers, production entitlements, service-account configuration, trust-root management, and actual device test vectors are environment-specific and were not available in this source-only integration pass. Do not replace those requirements with a client-provided boolean.

### Platform build and infrastructure verification

Before production:

1. Install exact locked dependencies with `npm ci` in a network-enabled environment.
2. Run the complete `npm run verify`, `npm run typecheck`, `npm run build`, and `npm run lint` commands.
3. Run Android Gradle compilation/tests using the configured Gradle distribution and Android SDK.
4. Build and test iOS with Xcode, signing, supported App Attest entitlements, and real supported devices.
5. Apply all migrations in order to a disposable PostgreSQL instance and verify the ledger with race/replay tests, then repeat a controlled migration rehearsal against staging.
6. Execute cross-platform integration tests for duplicate/ambiguous requests, concurrent devices, interrupted uploads, expired/revoked sessions, missing local storage, stale pricing versions, insufficient allowances, and recovery review.
7. Keep all real purchases and deductions disabled until the above pass and the security review signs off.
