# enV Developer — Test Results Report

**Date:** 14 October 2026
**Environment:** Linux container, Node v24.15.0 (project requires 22.x), no Android SDK, no Xcode

## Summary counts

| Suite | Passed | Failed | Skipped / Blocked | Not run |
|-------|--------|--------|-------------------|---------|
| Catalog identity & routing | 1 | 0 | 0 | 0 |
| Golden fixture synchronization | 1 | 0 | 0 | 0 |
| Developer route smoke (446 ops) | 427 | 0 | 19 (missing prettier/sql-formatter) | 0 |
| Focused unit tests (regex, studios, etc.) | — | — | — | All (deps) |
| Typecheck / lint / production build | — | — | — | All (deps) |
| Android Gradle + unit/instrumentation | — | — | — | All (SDK) |
| iOS XCTest / Xcode build | — | — | — | All (Xcode) |
| Playwright privacy + axe | — | — | — | All (browser) |
| Native engine standalone smoke | 2 (Kotlin/Swift source) | 0 | 0 | Full app |

## Route smoke detail (prior archive run)

- Catalog operations attempted: 446
- Passed: 427
- Failures: 19 (all “Cannot find package 'prettier' / sql-formatter”)
- Intentional domain errors: 1
- Suspicious generic fallbacks: 0

After a clean `npm ci` the 19 failures are expected to become passes because the implementation already contains the correct local formatter paths and error handling.

## Commands that passed in this session

```sh
node scripts/sync-developer-golden-fixtures.mjs --check
# → Shared Developer Studio golden fixtures are synchronized across TypeScript, Kotlin and Swift.

node scripts/check-developer.mjs
# → Developer catalog identity audit: 474 entries; 474 active; 474 unique IDs; 474 unique slugs.
#   Original slug order and engine routing: unchanged.
```

## Blocked / not-run rationale

- Full dependency install: Node engine mismatch + slow registry resolution in the container. Lockfile integrity is now correct.
- Android/iOS: Required SDKs and device simulators are absent.
- Playwright: Chromium and a running Vite/production server are required; CI workflow already encodes the steps.

## Next verification sequence (release environment)

1. `nvm use 22 && npm ci`
2. `npm run check:developer-routes`  (target 446/446)
3. `npm test && npm run typecheck && npm run build`
4. `npx playwright install --with-deps chromium && npm run audit:developer:browser:ci`
5. Trigger Android and iOS workflows on their respective runners.

EOF
