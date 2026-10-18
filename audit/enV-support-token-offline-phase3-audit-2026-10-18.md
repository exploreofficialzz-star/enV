# enV combined support, token-explanation, and offline-wallet foundation audit

**Date:** 18 October 2026  
**Base:** `enV-monetization-phase2-usage-audit.zip`  
**Scope:** Web help/blog/token documentation experience, per-tool provisional billing explanation, offline-wallet data model, navigation, and static verification.  
**Release status:** Improved development package; **not approved for production activation**.

## Implemented in this pass

- Added `/blog` with four editorial starter articles and `/blog/$slug` article pages.
- Added `/help` with grouped help-center topics for getting started, tokens/costs, offline use/sync, privacy, and account security.
- Added `/tokens` as a full token explanation page with category and name search across the current searchable tool catalogue.
- Added `/tokens/$toolId` for a tool-specific billing explanation page.
- Added public `GET /api/billing/tool?toolId=...` profile lookup. It exposes only a generated provisional profile, pricing version, and generic measurement notes; it does not expose wallet data or enable charging.
- Added desktop navigation links and grouped footer links for Blog, Help Center, and Token Guide; mobile still has the links in the More menu.
- Linked the pricing page to the full token guide.
- Added `migrations/0003_offline_wallet.sql` with server-side offline allowance, per-allowance transaction idempotency/sequence constraints, and metadata-only security-event tables.
- Added offline wallet threat model, cross-platform storage guidance, lost-record recovery policy, and production launch gates in `docs/billing-offline-wallet-security.md`.
- Added editorial policy and support-center route map in `docs/support-center-content-and-editorial.md`.
- Added `npm run check:support-center` and included it in the package's `verify` chain.

## Verification performed

- `node scripts/check-support-center.mjs` — PASS.
- `node scripts/check-billing.mjs` — PASS.
- `node scripts/check-production.mjs` — PASS (10,000 base catalogue tools, unique IDs).
- `node scripts/check-production-gating.mjs` — PASS; local environment warning notes auth is disabled.
- `npm run check:billing` — PASS; 9 billing catalog tests and billing invariant checks passed.
- TypeScript `transpileModule` syntax checks — PASS for all seven new TS/TSX files.

## Not verified / not implemented

- Full TypeScript semantic check, Vite production build, lint, and browser/mobile visual tests could not be run because `node_modules` is absent. Running the migration script also fails locally because the `pg` dependency is not installed. This is an environment/dependency limitation, not a passing result.
- The new offline migration has not been applied to a real production database.
- The offline issue/sync/settle/release/recovery API lifecycle is **not implemented** yet. The migration and threat model alone do not enable offline spending.
- Android Room/WorkManager and iOS durable journal/sync UI implementations are **not included in this pass**; the platform-specific requirements are documented for the next implementation phase.
- Live purchase adapters, verified store receipts/webhooks, welcome grants, wallet deductions, and offline deductions remain disabled. The token catalogue rates remain provisional.
- No production deployment was performed; deployment access, secrets, real database, app-store configuration, and release approvals are outside this local package operation.

## Required next production gates

1. Install dependencies in a network-enabled build environment and run the full `npm run verify`, fixing all failures.
2. Generate and validate TanStack route types, build Web production output, and test responsive keyboard/screen-reader behavior.
3. Apply migration 0003 in a staging database and test transaction rollback, duplicate sync, sequence conflict, lost records, expiry, two-device reservations, and account deletion.
4. Implement signed offline allowance issuance, platform journals, idempotent sync/reconciliation, conservative recovery, revocation, and monitoring.
5. Complete native Android/iOS storage and synchronization implementations with parity tests.
6. Perform a security review and test abuse/rate-limit controls before enabling any live billing.
