# enV Developer Category — Audit, Implementation & Verification Record

**Audit date:** 2026-10-13  
**Source package:** `enV-current-state-20261013.zip`  
**Requirements:** `enV-developer-category-agent-prompt.txt`  
**Scope:** Broad in-place implementation pass across Web/TypeScript, Android/Kotlin, and iOS/Swift. The original catalog remains authoritative. This record distinguishes source changes and automated checks from builds that could not run in this environment.

## Preservation and architectural boundaries

- The overall catalog retains 10,000 tools. All 474 Developer category records remain active with the same IDs, slugs, ordering, and engine routing as the source-derived inventory.
- The 446 records dispatched through the Web `developer` engine have an example-driven route smoke test. The other 28 Developer-category records continue to use their existing dedicated engine types (`codec`, `text`, `generator`, `mime`, and `datetime`); they were not silently rerouted into the new studio engine.
- Web changes live in TypeScript under `src/`. Android behavior is implemented in Kotlin under `apps/android/`. iOS behavior is implemented in Swift under `apps/ios/`. The native engines are separate implementations; neither requires WebView execution for these deterministic developer utilities.
- The Developer catalog continues to mark its processing as client-side and does not require backend routing. This audit does not add user-input upload calls to these deterministic utilities.
- Existing tool IDs, slugs, and routes are preserved; the studio logic is shared by related pages without deleting pages.

## Implemented Web studios and behavior

Implemented or expanded `src/lib/engines/developer-studios.ts` and wired it through `src/components/engines/developer-engine.tsx`:

- **JSON:** strict parse/validate, readable format/minify, key sorting, structural diagnostics with line/column/path, simple path queries, two-document diff, and JSON Schema inference. Integer-valued JSON samples are inferred as `integer` rather than `number`.
- **JWT:** local header/payload decode, registered-claim time annotations and expiry interpretation. UI/output explicitly says that decoding does not verify the signature.
- **Encoding:** UTF-8-safe Base64 and URL encoding/decoding, URL-safe Base64, hex/binary/ASCII/Unicode helpers, HTML entities and CSS escaping; malformed inputs are surfaced as errors.
- **Hash:** supported digest algorithms via local Web Crypto plus local fallback where available, multiple output encodings/comparison; hash decoding correctly explains that hashes are one-way digests.
- **Regex:** JavaScript RegExp execution, matches/groups/indexes, flags and replacement behavior.
- **Time/Cron:** seconds/milliseconds timestamps and local/UTC display; five-field cron validation, explanation and upcoming execution times in local and UTC.
- **UUID:** batch generation/shape validation and related UUID operations.
- **SQL/markup:** domain-specific formatting/minification/preview behavior with capability limits kept explicit rather than advertised as a full SQL execution engine.
- **HTTP/API and generators:** useful local results for status/query operations and copy-ready DevOps/config templates; generators include practical stack/preset output instead of a generic “toolkit utility” response.
- **Shared UI affordances:** visible local-processing privacy copy, example loaders, consistent primary action labels, copy/download output, keyboard execution for applicable tools, and family-related links.

The implementations favor deterministic browser APIs and local processing. A result can be useful without implying that a lightweight parser is a standards-complete compiler or execution engine.

## Android/Kotlin changes

Files include:

- `apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt`
- `apps/android/app/src/main/java/com/chastech/env/MainActivity.kt`
- `apps/android/app/src/test/java/com/chastech/env/engine/NativeDeveloperStudioTest.kt`

The native dispatcher includes local JSON/JWT/encoding/hash/UUID/time/cron/SQL/CSS/Markdown and generator behavior, plus domain-specific query-string parsing/building, cookie parsing, safer HTTP-header building, and user-agent inspection. HTML/XML/SVG entity tools process entities rather than falsely treating the payload as Base64. Cron encoder/decoder routes validate/normalize the five-field expression and provide upcoming-run feedback. UUID validation was moved to a shared class-level helper so both native dispatch paths use the same implementation. The native form includes example inputs, local-file hashing, copy/export behavior, and privacy messaging.

Native regression tests were added for representative golden behavior. They are committed as source tests; see the environment limitations below for why the Gradle suite itself was not executed.

## iOS/Swift changes

Files include:

- `apps/ios/enV/NativeUtilityEngine.swift`
- `apps/ios/enV/ToolViews.swift`
- `apps/ios/enVTests/NativeDeveloperStudioTests.swift`

The Swift dispatcher implements its own equivalents of the native utilities; it does not call the TypeScript engine. This includes local JSON Schema inference, cron operations, entity encoding/decoding, CSS/SQL/Markdown processing, query-string parser/builder, cookie parser, guarded HTTP-header building, user-agent parsing, UUID operations, and more useful generator outputs. The native form supports local file import/hash, examples, privacy copy, and copy/export behavior. Swift regression tests were added alongside the existing iOS tests.

## Additional implementations from current competitor feedback

A dated, source-linked market/feedback review is included at `audit/COMPETITIVE-RESEARCH-AND-IMPLEMENTATION-REVIEW-2026-10-13.md`. It separates official product capabilities from maintainer statements, individual bug reports, self-selected community comments, and this project's own inference. It also documents competitor gaps that have already been fixed upstream (for example, Regex101 now documents multi-sample tests), so stale complaints are not passed off as current defects.

This pass added the following implementation changes beyond the earlier package:

- **Web JSON safety and diagnostics:** bounded structural inspector (50 MiB input / 100,000 node default cap), object/array/depth/property/string counts, duplicate-key paths, unsafe integer token detection that does not mistake numeric text inside strings for numeric literals, truncation warnings, structural JSON diff that ignores object key order, and schema inference that merges heterogeneous array shapes.
- **Web regex workflow:** independent JSON-array sample testing (bounded to 100 samples/1 MiB aggregate), match/index/capture reporting and replacement previews; labels the JavaScript engine and reports a heuristic warning for selected high-risk nested-quantifier patterns. This heuristic is not advertised as a general timeout or security sandbox.
- **Web resource guard:** whole-file hash inputs over 256 MiB are refused before `arrayBuffer()` allocates the file. The UI states why and asks the user to use a trusted local streaming workflow for larger files.
- **Kotlin/Swift native JSON inspection:** added separate native structural stats, integer-token detection, duplicate-key paths and truncation limits; duplicate-key findings are presented as ambiguity warnings rather than declaring that duplicate keys are invalid JSON syntax.
- **Kotlin/Swift JWT resilience:** extreme `exp`/`iat`/`nbf` values no longer risk breaking the entire decode report, and native output carries explicit decode-only/signature-not-verified semantics.
- **Cron correctness:** fixed the Web weekday explanation mapping, made day-field wildcard/step behavior explicit, and reported the helper as Vixie-style rather than universal across cron dialects.
- **Evidence-first roadmap:** recipe chaining is called out as a substantive CyberChef-strength gap, not represented as shipped. Full browser/device builds, network-capture privacy validation, standards-conformance packs and formal comparative benchmarks remain explicit follow-up work.

## Regression and catalog QA

### Checks that passed

- `node scripts/check-production.mjs` — 10,000 unique catalog tool IDs.
- `node scripts/check-execution-policy.mjs` — passed.
- `node scripts/check-catalog.mjs` — 10,000 tools across 42 categories.
- `node scripts/check-native-ai.mjs` — passed.
- `node scripts/check-native-related.mjs` — all 10,000 detail routes match related IDs/order.
- `node scripts/check-native-backend-forms.mjs` — passed, 82 document operations audited.
- `node scripts/check-native-ui-parity.mjs` — passed.
- `node scripts/check-accessibility-parity.mjs` — passed, 37 rule keys/report contract across TypeScript, Kotlin, Swift.
- `node scripts/check-native-coverage.mjs` — 9,371/10,000 overall active tools have native/backend-executable paths; 629 overall catalog records remain explicitly Web-only (mostly `custom`, plus one `file-converter`). These are overall catalog figures, not a claim that all tools belong to Developer.
- `node scripts/check-native-backend-dispatch.mjs`, `check-native-executability.mjs`, `check-native-no-web-runtime.mjs`, and `check-native-icons.mjs` — passed.
- `node scripts/check-developer.mjs` — all 474 Developer IDs/slugs/order/routes preserved; all Developer records retain client-side/no-backend declarations.
- Web engine focused test command — **26/26 tests passed** across `developer-utils.test.ts` and `developer-studios.test.ts` in the latest run.
- `scripts/audit-developer-studio-routes.mjs` — **446 operations exercised, zero failures, zero suspicious generic-placeholder outputs**. One expected domain refusal is recorded for hash-decoder, which correctly states that hashes cannot be reversed.
- `swiftc -parse apps/ios/enV/NativeUtilityEngine.swift apps/ios/enV/ToolViews.swift apps/ios/enVTests/*.swift` — passed. This verifies Swift syntax parsing only, not SwiftUI typechecking or linking.

Focused Web test command:

```sh
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test \
  src/lib/engines/developer-utils.test.ts \
  src/lib/engines/developer-studios.test.ts
```

The route-level smoke result is stored at `audit/developer-route-smoke-results.json`; the source-derived original inventory is stored at `audit/developer-tool-inventory.json`. A repeatable route audit command is registered as `npm run check:developer-routes` and included in the project `verify` chain.

## Verification blockers — not reported as passes

- **Web project typecheck/build:** `npm run typecheck` cannot start successfully because installed `@types/node` and `vite/client` type definitions are absent (`TS2688`). `npm run build` stops before compilation because `vite` is not installed (`spawn vite ENOENT`). The isolated engine tests work with Node’s type-stripping runtime, but do not substitute for full TypeScript compilation.
- **Full Web test suite:** `npm test` ran 170 passing tests before one test failed because `src/lib/storage.test.ts` could not resolve the missing `zustand` package. The remainder of the chained test suites therefore did not run. The Developer engine tests and route smoke are independently green as reported above.
- **Android Gradle build/tests:** the wrapper requires Gradle 8.9, and its distribution download failed due to unavailable DNS/network access to `services.gradle.org`. A standalone `kotlinc` attempt is also not a project build because Android, app-model, and `org.json` dependencies are absent from that invocation; no syntax diagnostics were emitted by the Kotlin parser check, but this is not typechecking. No Android build or unit-test pass is claimed.
- **iOS build/tests:** the environment has no Xcode/iOS SDK, so only Swift syntax parsing was available. No simulator/device build or Swift unit-test pass is claimed.
- A real full-catalog device QA pass, browser-rendered layout check, network capture, and formal competitor accuracy/benchmark comparison still require the relevant runtimes/devices and data. Route smoke tests are not the same as a visual or performance benchmark. The competitive research report documents the remaining feature gaps and the fact that evidence from issues/comments is qualitative rather than a statistically representative review sample.

## Latest repeat verification (2026-10-13)

- `node scripts/check-developer.mjs` — passed: 474 active Developer entries, unique IDs/slugs, original order and routes unchanged; privacy copy/client-side policy checks passed.
- `node scripts/check-production.mjs` — passed: 10,000 unique catalog IDs. It warns that `.enV/app-env.json` disables authentication locally and production must explicitly set `VITE_AUTH_ENABLED=true` if authentication is required; this configuration warning has not been changed by the Developer utility work.
- `node scripts/check-execution-policy.mjs` — passed.
- `node scripts/check-catalog.mjs` — passed: 10,000 tools / 42 categories.
- `node scripts/check-native-related.mjs` — passed: 10,000 detail routes preserve related IDs/order.
- `npm run check:developer-routes` — passed: 446 Web operations, failures=0, generic placeholders=0, one expected refusal for irreversible hash decoding.
- Focused Node tests — **26/26 passed** (`developer-utils.test.ts` and `developer-studios.test.ts`).
- `swiftc -parse apps/ios/enV/NativeUtilityEngine.swift apps/ios/enV/ToolViews.swift apps/ios/enVTests/*.swift` — passed syntax parsing only.
- A direct invocation of `node scripts/audit-developer-studio-routes.mjs` without the package script failed because Node was asked to import a `.ts` file without the project's type-stripping setup. The supported `npm run check:developer-routes` command includes the needed runtime registration and passed; the failed direct invocation is not counted as an application failure.

## Honest status

This package contains substantial in-place implementations and regression coverage across all three source platforms, and the measured Web Developer route smoke and catalog-preservation checks pass. It should **not** be interpreted as proof that every one of the 474 tools matches or exceeds specialist competitors, that every suffix uses a complete standards-grade parser, or that Android/iOS binaries have built successfully. Remaining work is identified by the checks above rather than hidden behind an “all green” claim.
