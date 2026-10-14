# Remaining Blockers & Reproducible Build Guide

**Date:** 14 October 2026

## Remaining blockers

| # | Blocker | Impact | Exact resolution steps |
|---|---------|--------|------------------------|
| 1 | Clean dependency install | 19 formatter routes blocked; unit tests & build unavailable | Use Node.js 22. `npm ci`. Verify `node_modules/sql-formatter` and `node_modules/prettier` exist. |
| 2 | Full 446-route smoke | Cannot claim 100 % functional routes | After #1: `npm run check:developer-routes` (or the route-smoke script). Expect 446 passes. |
| 3 | Android full build & tests | Native release gate incomplete | Trigger existing Android CI workflow or run `./gradlew :app:assembleRelease :app:test` with Android SDK 34+. |
| 4 | iOS full build & XCTest | Native release gate incomplete | macOS + Xcode 16+: open `apps/ios/enV.xcodeproj`, build scheme `enV`, run test targets. |
| 5 | Live Playwright privacy/axe | Accessibility & runtime privacy unproven on built app | `npx playwright install --with-deps chromium && npm run audit:developer:browser:ci` |
| 6 | Production network-capture privacy | Cannot claim zero payload egress in production | Deploy staging, exercise tools with sentinel payloads, inspect HAR / server logs. |

## Reproducible build & verification guide

```sh
# 1. Environment
#    Node.js 22.x (required by package.json engines)
#    npm 10+
#    Optional: Android SDK, Xcode (for native)

# 2. Install
git clone <repo> && cd <repo>   # or unpack this archive
npm ci

# 3. Static & catalog checks
npm run check:developer
npm run check:developer:fixtures
npm run check:developer:privacy
npm run check:execution-policy

# 4. Unit / golden tests
npm test
# or focused:
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test \
  src/lib/engines/developer-studios.test.ts \
  src/lib/engines/precise-formatters.test.ts \
  src/lib/engines/regex-studio.test.ts

# 5. Type / lint / production build
npm run typecheck
npm run lint
npm run build

# 6. Route smoke (446 operations)
npm run check:developer-routes

# 7. Browser privacy + accessibility
npx playwright install --with-deps chromium
npm run audit:developer:browser:ci

# 8. Benchmark (optional, local)
node scripts/developer-tool-benchmark.mjs

# 9. Native (separate runners)
# Android: ./gradlew ...
# iOS: xcodebuild ...
```

## ZIP integrity

After packaging, compute:

```sh
sha256sum enV-developer-quality-round6-updated-*.zip
```

Store the digest alongside the archive.

EOF