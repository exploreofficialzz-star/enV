# enV Developer — Production Readiness Report

**Date:** 14 October 2026
**Archive baseline:** enV-developer-quality-round6-20261014
**Agent session:** Integrity remediation + verification continuation

## Executive summary

The Round 6 codebase implements local parser-backed formatters (sql-formatter + Prettier standalone plugins), Worker-based timeout/cancellation, shared golden fixtures, privacy tripwires, and native Kotlin/Swift XML formatters with DOCTYPE/entity safeguards. Catalog identity (474 Developer tools) and routing are intact.

The single critical remaining dependency blocker from the archive — missing `integrity` digest for `sql-formatter@15.9.0` — has been remediated using the official npm registry value. A clean `npm ci` on Node.js 22 is now expected to succeed and unblock the 19 previously failing formatter routes.

Native Android/iOS full builds and the live Playwright privacy/axe audit remain environment-blocked in this Linux container and must be executed on the project’s authoritative CI runners.

## Verification matrix (this session)

| Gate | Status | Notes |
|------|--------|-------|
| Catalog identity (474 entries) | PASS | `node scripts/check-developer.mjs` |
| Golden fixture sync (TS/Kotlin/Swift) | PASS | `node scripts/sync-developer-golden-fixtures.mjs --check` |
| sql-formatter lockfile integrity | FIXED | Official sha512 injected |
| Route smoke (446 ops) | PARTIAL | 427 pass / 19 blocked by missing node_modules in prior run; re-run after `npm ci` |
| TypeScript parser unit tests | NOT RUN (deps) | Requires full install |
| Android Gradle / JUnit | NOT RUN | No Gradle distribution / SDK |
| iOS Xcode / XCTest | NOT RUN | No Xcode / Apple SDK |
| Playwright privacy + axe | NOT RUN | Requires built app + Chromium |
| Native no-Web-runtime | PASS (source) | Script present |
| Static privacy tripwire | PASS (source) | Guarded engines |

## Remaining blockers (exact resolution steps)

1. **Dependency install**
   ```sh
   # On Node.js 22
   npm ci
   npm run check:developer
   npm run check:developer-routes   # expected 446/446 after install
   ```

2. **Full Web quality suite**
   ```sh
   npm test
   npm run typecheck
   npm run lint
   npm run build
   npx playwright install --with-deps chromium
   npm run audit:developer:browser:ci
   ```

3. **Android**
   Use the project’s existing GitHub Actions Android workflow or local Android Studio / Gradle 8+ with SDK 34.

4. **iOS**
   Use macOS runner with Xcode 16+; open `apps/ios/enV.xcodeproj` and run the enV scheme + XCTest targets.

5. **Production privacy proof**
   Deploy to a staging environment, capture network traffic while exercising Developer tools with synthetic sensitive payloads, confirm zero payload egress.

## Risk assessment

- **High**: Incomplete lockfile integrity (now fixed).
- **Medium**: Node engine mismatch (package.json requires 22.x; current container is 24). Use Node 22 for release.
- **Low**: Native formatters are intentionally conservative lexical implementations; documented limitations are already present in UI copy and audit notes.

## Recommendation

Proceed to a Node-22 CI job that performs `npm ci`, the full route smoke, unit tests, and the Playwright audit. Promote to release candidate only after the 19 formatter routes pass and the privacy audit reports zero serious/critical axe violations and zero sentinel egress.

EOF
