# Round 5 verification results — 13 October 2026

## Passed

| Check | Result |
|---|---|
| Focused Developer/Web engine suite | **49 passed, 0 failed** |
| Canonical fixture synchronization | TypeScript, Kotlin and Swift fixture outputs match the canonical JSON source |
| Developer catalog identity check | **474/474 entries** preserved; unique IDs/slugs, ordering and engine routing unchanged |
| Full tool catalog | **10,000 tools**, 42 categories; catalog check passed |
| Developer route smoke | **446 operations; failures=0; generic placeholders=0; 1 expected domain-error test** |
| Production static audit | Passed: 10,000 tools and 10,000 unique IDs; warning listed below |
| Execution policy audit | Passed |
| Static Developer privacy tripwire | Passed across 11 guarded source/UI files; source-only check, not runtime proof |
| Native no-Web-runtime guard | Passed; WebView remains limited to its existing APCA use |
| Native UI parity | Passed |
| Accessibility rule parity | 37 required rule keys + report contract in TypeScript, Kotlin and Swift |
| Swift frontend syntax parse | Passed for changed engine/UI/test source files |
| Xcode project plist validation | Passed |
| Swift Regex Studio standalone runtime smoke | Passed: 3/3 shared regex sample assertions, named captures, substitution pipeline |
| Kotlin Regex Studio standalone typecheck | Passed against minimal `org.json` interface stubs; not Android/JUnit |
| Kotlin SQL formatter standalone runtime smoke | Passed: SQL clause layout and quoted/dollar-quoted text preservation |

## Not run / blocked

- **Full Web build/typecheck/lint/all repository tests:** `node_modules` is absent. The focused Node engine tests use the source loader and pass, but this is not a full production build. Dependency installation is unavailable in the current environment.
- **Playwright browser privacy and axe audit:** the script is included but exits because Playwright is not installed. There is no running app to inspect. No claim of runtime network privacy or axe compliance is made.
- **Android Gradle/JUnit/device build:** cannot be truthfully reported as passed; the required Android/project classpath and Gradle distribution were unavailable. Kotlin Regex Studio typechecks against stubs and the native SQL formatter passed a standalone smoke test, which are narrower checks.
- **iOS Xcode/XCTest/device build:** Xcode and Apple SDKs are unavailable. Swift syntax parsing and a standalone compiled engine smoke test are not equivalent to a full iOS app build or XCTest run.
- **Deployment and competitor benchmark:** no deployment, real-device QA, or reproducible competitor benchmark was performed.

## Production warning

`node scripts/check-production.mjs` passed catalog integrity but warned that `.enV/app-env.json` disables auth locally. Explicitly set `VITE_AUTH_ENABLED=true` in production **if authentication is required** and verify the intended access policy before shipping.

## Important capability caveat

The SQL formatter is dialect-aware lexical formatting which protects common quoted/comment content; it is **not** a parser-backed dialect formatter and does not validate or execute queries. Regex risk scanners are conservative heuristics, not a general ReDoS detector. The Web Worker can be terminated; a single in-progress regex call on Java/ICU cannot reliably be hard-killed by these native engines.
