# Developer hard-retest remediation — 13 October 2026

## Scope and source of truth

This pass follows `enV-developer-hard-retest-and-agent-prompt.txt` supplied for this audit. Changes are in the project source and are packaged here; they have **not** been deployed to `envtools.store`, so the earlier live-site observations should not be treated as newly retested production behavior. Existing Developer catalog records, IDs, slug order, and engine routing were kept in place.

## P0 fixes implemented

- **JSON unsafe integers (Web):** JSON formatting uses a strict lexical formatter so original number tokens such as `9007199254740993` are not round-tripped through JavaScript `Number`. It surfaces the required warning that JavaScript `Number` cannot safely represent an unsafe integer. It does not silently claim that a warning means every JSON consumer will preserve such numbers.
- **Duplicate JSON object keys:** the formatter preserves source member occurrences and reports that ordinary JavaScript parsing commonly applies last-key-wins behavior. Duplicate names remain an ambiguity warning; they are not mislabeled as universally invalid JSON syntax.
- **HTTP status lookup:** useful descriptions cover `418` (“I'm a teapot”), `422`, `429`, and `503` as well as the common status table entries.
- **JavaScript formatter:** the live Text engine now uses a conservative lexical formatter that emits readable multi-line output for the hard minified async/arrow fixture and returns an honest parser-limit note. It is not represented as a standards-complete ECMAScript parser.
- **SQL formatter:** the live Text engine now separates major clauses and common join/group/having/order syntax while protecting quoted strings, quoted identifiers, and comments from keyword rewriting.

## Platform implementations and tests

- Web Developer Studio engine: `src/lib/engines/developer-studios.ts`.
- Live Web text transforms: `src/lib/engines/transforms.ts`.
- Android implementations: `apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt` and `NativeTextEngine.kt`.
- iOS implementations: `apps/ios/enV/NativeUtilityEngine.swift` and `NativeTextEngine.swift`.
- Regression tests are added/updated alongside the Web, Kotlin, and Swift engines. Native changes are implemented separately in Kotlin and Swift; they do not forward the actual formatting work to the web frontend.

## Verification performed for this pass

- `node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test src/lib/engines/developer-studios.test.ts src/lib/engines/transforms.test.ts` — **31/31 tests passed**.
- `node scripts/check-developer.mjs` — **474/474** active Developer catalog entries, unique IDs/slugs, original slug order and engine routing unchanged; client-side/privacy declarations and source regression checks passed.
- `node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/audit-developer-studio-routes.mjs` — **446 operations, 0 failures, 0 generic-placeholder results**, 1 expected domain refusal (a hash cannot be reversed).
- Standalone `kotlinc` compilation of `NativeTextEngine.kt` — passed, with warnings only for existing unchecked casts in its simple YAML parser. A direct Kotlin fixture run produced readable multi-line JavaScript and SQL with the SQL literal phrase `group by or order by` intact. This is not a full Android application build.
- `swiftc -frontend -parse` on the modified Swift engines and their related test files — passed syntax parsing. An isolated formatter runtime was also exercised with a temporary Linux `NaturalLanguage` stub; that does not substitute for Xcode typechecking or XCTest on Apple platforms.
- The broader project static checks previously rerun in this session passed: production/catalog identity, execution policy, native AI bindings, related routes, backend forms, native UI parity, accessibility parity, native coverage accounting, backend dispatch, native executability, no-web-runtime, icon checks, and Developer preservation checks.

## Limitations and remaining verification

- `npm ci` could not complete because DNS/network access to `registry.npmjs.org` failed (`EAI_AGAIN`). As a result, a full dependency-backed Web build, TypeScript typecheck, lint, and full `npm test` chain could not be verified in this environment. The focused Node test suites above run using Node's built-in TypeScript stripping and do not replace the complete build.
- The Android Gradle wrapper needs Gradle 8.9, whose distribution download is unavailable here; Android JUnit tests and APK builds were therefore not run.
- Xcode and the iOS SDK are not available on this Linux host. Swift syntax parsing and the isolated stub-assisted formatter check are not an iOS build or XCTest pass.
- “Nothing is uploaded” remains the intended execution policy and is checked by source audits, but a browser/device network-capture test was not possible here. Do not interpret static checks as network-level proof.
- The catalog-wide smoke/preservation checks establish route coverage and useful output for the current harness; they do not prove that all 474 pages match every specialist competitor or that conservative JS/SQL formatting is fully standards-conformant. Recipe chaining, cross-device performance/accessibility QA, full standards suites, real network capture, and formal side-by-side competitor benchmarks remain open work as documented in the main audit.

## Outcome

The source-level P0 fixes and focused regression checks are complete for this package. Production deployment and full Web/Android/iOS build-and-runtime verification remain uncompleted due to the environment/toolchain limits above.
