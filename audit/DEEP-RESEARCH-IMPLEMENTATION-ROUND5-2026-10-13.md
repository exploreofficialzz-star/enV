# enV Developer Studio — Round 5 Implementation Report

**Date:** 13 October 2026
**Scope:** Regex Studio workflows, SQL dialect-aware formatting, cross-platform golden fixtures, privacy tripwires, and mobile/accessibility parity.
**Platforms:** Web TypeScript/React, Android Kotlin, iOS Swift.
**Compatibility rule:** Keep all existing tool IDs, slugs, catalog order, and engine routes.

## Executive summary

This round implements working features in the repository rather than only collecting competitive ideas. The central addition is a common test corpus that is generated into TypeScript, Kotlin, and Swift fixtures, combined with actual platform-native implementations rather than a WebView dependency. The Web interface now exposes the existing Regex Studio execution engine; native UI routes expose separate batch-test, benchmark, substitution-pipeline, source-format and flavor-analysis modes. SQL dialect controls are connected to each platform's live formatting path. Privacy and regression checks were added so these areas can be guarded as the catalog evolves.

The current result is **more capable and better tested, not proven to beat every competitor**. Some gaps depend on packages/toolchains and empirical validation unavailable in this environment and remain explicitly listed below.

## Implemented changes

### 1. Regex Studio — actual user-facing modes

- Connected the existing Web Regex Studio engine to the Developer tool interface rather than leaving the advanced engine disconnected from the primary form.
- Added native mode controls and dispatch on Android and iOS using `java.util.regex.Pattern` and Foundation `NSRegularExpression` (ICU), respectively.
- Batch input accepts JSON arrays and labeled sample objects, with expected-match and expected-count assertions, match positions, numbered captures, named captures, bounded previews, replacement previews, and visible truncation metadata.
- Substitution pipeline accepts a JSON object with an `input` and ordered `layers`; each layer can carry a name, expression, flags, and replacement. Per-layer output previews and status are returned, with strict layer/input/output limits.
- Benchmark mode reports median, p95, minimum/maximum and jitter where supported; iteration count and input lengths are bounded. It labels results as device/runtime-specific microbenchmarks, not universal speed rankings.
- Format mode returns an exact-round-trip tokenized display instead of inserting free-spacing syntax that can alter JavaScript/Java/ICU expressions. Flavor mode produces static compatibility observations; it does not claim to execute against every regex implementation.
- Web execution uses a terminable Worker with cancellation and a deadline. If Worker support is unavailable, higher-risk and oversized work is refused rather than pretending synchronous work has a killable timeout. Tests verify Worker termination after success, cancellation, and deadline.
- Native engines clearly disclose their limitation: a synchronous `Matcher.find()` or `NSRegularExpression` call cannot reliably be force-killed mid-match. They use risk heuristics, conservative input limits and between-iteration benchmark budgets. The heuristics are not a general ReDoS proof.

### 2. SQL formatter — dialect selector connected to real engines

- Added user-selectable dialects for standard SQL, PostgreSQL, MySQL, MariaDB, SQLite, T-SQL, BigQuery, Snowflake, Oracle, Redshift and DuckDB to Web, Android and iOS SQL formatter forms.
- Direct SQL formatter routes and Developer Studio routes dispatch to the corresponding platform's shared formatter implementation so two routes do not silently use different implementations.
- The formatter shields string literals, quoted identifiers, comments, and applicable PostgreSQL/Redshift/DuckDB dollar-quoted bodies while splitting common SQL clauses and joins across lines.
- The output is deliberately labeled **dialect-aware lexical formatting**, not a complete grammar/parser, query validator, or database execution engine. Do not rely on it for dialect correctness or automatic repair of arbitrary stored procedures. A maintained SQL parser/formatter dependency and dialect-specific golden corpus are a remaining enhancement, not something this round claims to have completed.

### 3. Shared cross-platform golden fixtures

Canonical fixture source: `tests/fixtures/developer-studio-golden.json`.
Generator/checker: `scripts/sync-developer-golden-fixtures.mjs`.

The shared cases include named regex groups, positive and negative batch samples, expected assertions, a two-layer text-substitution pipeline, a nested-quantifier near miss, minified async JavaScript, a difficult SQL query with keywords inside a regular string and a PostgreSQL dollar-quoted body, JSON with unsafe integer digits and duplicate keys, and established hash vectors.

Generated fixtures are maintained for TypeScript, Kotlin and Swift. `--check` fails if any platform's generated fixture drifts from the canonical source. Platform test cases exercise those vectors; standalone Kotlin/Swift smoke checks cover the native paths that could run without the full mobile toolchain.

### 4. Correctness refinements from execution review

- Kotlin native regex results now expose named capture values and distinguish an exact-at-limit match list from a genuinely truncated list by probing one extra match; the count returned is bounded and a lower-bound field is included when truncated.
- Kotlin substitution-pipeline layer reports now measure that stage's actual input length, not the original pipeline input length.
- No user input history was added as a convenience feature. Results are transient and shown as bounded previews by the native Regex Studio engines.
- The project preserves its lossless JSON work from Round 4: unsafe integer lexemes and duplicate source members are kept visible, warnings explain ambiguity/precision risks, and JWT views retain exact header/payload JSON without implying signature verification.

### 5. Privacy and mobile quality guards

- `scripts/check-developer-privacy.mjs` is a static source tripwire for risky executable network primitives and arbitrary payload-history storage in guarded Developer source paths. It explicitly says it is not proof of runtime behavior.
- `scripts/audit-developer-studios-browser.mjs` provides a Playwright/axe-oriented runtime audit covering sample Developer routes, outgoing request payload sentinels, browser storage, serious/critical accessibility violations, and mobile-width overflow.
- Existing native UI parity, native-no-Web-runtime, and accessibility rule parity checkers were rerun.

## Competitor capability map → implementation decision

| Competitor / reference | Specific capability or concern | enV implementation outcome this round | Honest status |
|---|---|---|---|
| regex101 Pro | Multiple test strings and per-sample assertions | JSON batch inputs plus expected-match/count assertions across Web/Kotlin/Swift | Implemented; native engines differ intentionally |
| regex101 Pro | Substitution pipeline | Ordered, named layers with preview and status reporting on all platforms | Implemented; risk guards differ by runtime |
| regex101 Pro | Regex benchmarks | Bounded local benchmark summaries and runtime/device labels | Implemented; not comparable across devices |
| Regex flavor tooling | Engine compatibility and syntax | Static flavor hints plus named/numbered group results | Partial by design; no cross-engine execution/equivalence proof |
| sql-formatter ecosystem | Multiple SQL dialects and reliable formatting | Dialect pickers and quote/comment-aware lexical formatting in all three native implementations | Useful improvement, but not yet parser-backed |
| OWASP browser-storage guidance | Avoid treating browser storage as a safe place for sensitive user content | No new arbitrary payload history; static tripwire and a runtime audit script | Static check passed; runtime browser audit not run here |
| Mobile-first daily toolkits | Useful native behavior without routing through a website | Separate Kotlin and Swift engines + native mode selectors and dialect controls | Source/smoke checks passed; full mobile application builds not run |

## Sources reviewed

- Regex101 Pro overview: https://docs.regex101.com/application/regex101-pro/
- Regex101 Pro — multiple test strings: https://docs.regex101.com/application/regex101-pro/multiple-test-strings/
- Regex101 Pro — substitution pipelines: https://docs.regex101.com/application/regex101-pro/substitution-pipeline/
- Regex101 Pro — benchmark suite: https://docs.regex101.com/application/regex101-pro/benchmark-suite/
- SQL Formatter project (dialect support and scope): https://github.com/sql-formatter-org/sql-formatter
- OWASP HTML5 Security Cheat Sheet (browser storage caveats): https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- JSON interoperability and duplicate member names: https://www.rfc-editor.org/rfc/rfc8259.html

## Files changed most materially

- `src/lib/engines/regex-studio.ts`
- `src/lib/engines/developer-regex-worker.ts`
- `src/lib/engines/regex-studio.test.ts`
- `src/lib/engines/developer-studios.ts`
- `src/lib/engines/developer-studios.test.ts`
- `src/components/engines/developer-engine.tsx`
- `src/components/engines/io-engines.tsx`
- `apps/android/app/src/main/java/com/chastech/env/engine/NativeRegexStudio.kt`
- `apps/android/app/src/main/java/com/chastech/env/engine/NativeTextEngine.kt`
- `apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt`
- `apps/android/app/src/main/java/com/chastech/env/MainActivity.kt`
- `apps/android/app/src/test/java/com/chastech/env/engine/NativeDeveloperStudioTest.kt`
- `apps/android/app/src/test/java/com/chastech/env/engine/NativeTextEngineTest.kt`
- `apps/ios/enV/NativeRegexStudio.swift`
- `apps/ios/enV/NativeTextEngine.swift`
- `apps/ios/enV/NativeUtilityEngine.swift`
- `apps/ios/enV/ToolViews.swift`
- `apps/ios/enV.xcodeproj/project.pbxproj`
- `apps/ios/enVTests/DeveloperStudioGoldenFixtures.swift`
- `apps/ios/enVTests/NativeTextEngineTests.swift`
- `tests/fixtures/developer-studio-golden.json`
- `scripts/sync-developer-golden-fixtures.mjs`
- `scripts/check-developer-privacy.mjs`
- `scripts/audit-developer-studios-browser.mjs`

## Explicit remaining work

1. Add and lock a maintained parser-backed SQL formatter dependency once package installation/lockfile update can run; then add dialect-specific edge-case tests. Current SQL formatting is lexical, not an SQL AST formatter.
2. Run the full web build, typecheck, lint and complete repository test suite after dependencies install. Only the focused engine suite ran here.
3. Run Android Gradle/JUnit with a working Gradle distribution and SDK; run iOS Xcode build/XCTest on macOS.
4. Run Playwright/axe privacy and accessibility audit against a real local/deployed app; inspect requests and browser storage, not just source patterns.
5. Test performance and accessibility on physical phones, different screen-reader setups, and representative slow devices.
6. Build a versioned comparative corpus against competitor tools with correctness, latency and adversarial-case metrics before making any “beats premium” claim.
7. Deploy only after confirming production auth policy and environment variables. No production deployment was made by this task.
