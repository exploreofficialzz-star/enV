# enV Developer Studios — Round 6 Implementation & Verification

**Date:** 14 October 2026
**Scope:** Web TypeScript, Android Kotlin, iOS Swift, parser integration, local-processing safeguards, shared golden fixtures, CI, privacy/accessibility audit, reproducible benchmark.
**Baseline:** Round 5 premium enhancement archive.
**Compatibility rule:** Existing tool IDs, slugs, catalog membership, and routing are retained.

## Implemented in this round

### Web / TypeScript

- Added `sql-formatter@15.9.0` as an application dependency. The Web SQL Formatter routes call its local formatter with explicit dialect selection, normalized aliases, uppercase keyword/type/function settings, a 1 MB input limit, non-empty-output checks, and a limitation note. Supported dialects are checked before the library is invoked.
- Added locally bundled Prettier standalone integrations for CSS, HTML, YAML, Markdown, and GraphQL, using explicit local plugin imports. JavaScript/TypeScript formatting continues to use the project's TypeScript parser/printer path where configured.
- Kept formatter execution behind a disposable same-origin Worker with an eight-second deadline; the deadline terminates the Worker instead of leaving the UI blocked.
- Added conservative XML structure preflight ahead of Prettier's HTML printer. It checks nesting, a single root, quoting, duplicate attributes, supported entity references and basic comment/CDATA/processing-instruction structure; rejects DOCTYPE declarations. **It is not a complete XML 1.0 parser and does not guarantee namespace, schema, or all Unicode-name conformance.** The output labels that limitation clearly.
- Parser calls have a clear local-processing error path, an explicit size cap, and non-empty output checks.

### Android / Kotlin

- Implemented XML formatting with the native JAXP DOM parser/Transformer path. The parser disables XInclude, external entity resolution and external DTD/schema access where supported; it rejects DOCTYPE and caps input at 1 MB.
- Retained the Kotlin-native SQL/CSS/HTML/JS/YAML implementations; the SQL formatter now tokenizes multi-character operators as units and emits better spaced comparisons while preserving literals/comments. **Apart from XML's parser/serializer, these native formatters are conservative lexical implementations, not full CSS/HTML/ECMAScript/YAML parser-backed formatters.** SQL dialect selection affects lexical protection/layout only, not a full grammar parser.
- Added shared golden-corpus checks for markup/structured samples, SQL dialect samples and malformed/unsafe XML.

### iOS / Swift

- Implemented XML formatting with native FoundationXML `XMLParser` and a local node serializer, including DOCTYPE rejection, size caps, escaped text/attributes, indentation and XML declaration preservation.
- Added handling for `XMLParser` parse-error callbacks. The standalone runtime regression caught that FoundationXML on Linux could otherwise report successful parsing on a malformed nesting sample; the formatter now rejects the sample.
- Kept SQL/CSS/HTML/JS/YAML formatting in Swift-native code rather than using a WebView or executing TypeScript. **Apart from XML's native parser/serializer, these implementations remain conservative lexical formatters, not full CSS/HTML/ECMAScript/YAML grammar engines.** SQL tokenization recognizes common multi-character operators and dialect-specific literal/comment boundaries; it is explicitly documented as a lexer, not a full SQL parser.
- Added native XCTest cases for the shared formatter corpus, SQL dialect samples, malformed XML and DOCTYPE rejection.

### Shared regression data and automation

- Extended `tests/fixtures/developer-studio-golden.json` for CSS, HTML, XML, YAML, Markdown, GraphQL, and SQL fixtures for PostgreSQL, MySQL, SQLite, BigQuery and Snowflake.
- Added synchronization checks so TypeScript, Kotlin and Swift test fixtures are generated from the same canonical input corpus.
- Added `scripts/developer-tool-benchmark.mjs`; it measures local time for 2 warmups and at least 5 (default 12) measured runs per parser/dialect sample. Reports include median/p95/min/max times, output length and SHA-256 output hashes, not source text. It is explicitly **not** a competitor benchmark.
- Hardened `scripts/audit-developer-studios-browser.mjs`: checks actual result output rather than echoed input on three representative routes (Regex, JavaScript, SQL), records any outgoing request containing test sentinels without writing the sentinel or payload into the report, checks local/session storage, IndexedDB, script-visible cookies and Cache Storage, checks 390×844 horizontal overflow and fails if axe-core is unavailable or detects serious/critical violations. This is intentionally a focused route sample, not yet a crawl of all 474 Developer URLs.
- Added `scripts/run-developer-browser-audit.mjs` to start a local Vite server, run the browser audit and clean up the server.
- Added `.github/workflows/developer-studios-quality.yml` for Web parser regression tests, fixture/catalog/policy checks, Playwright privacy/accessibility audit, and benchmark artifacts. Existing authoritative Android and iOS build workflows now trigger on shared fixture changes as well as their native source changes.

## Verification performed in the available environment

| Check | Result | Evidence / limitation |
|---|---|---|
| Shared fixtures | PASS | `node scripts/sync-developer-golden-fixtures.mjs --check` |
| Developer catalog and routing integrity | PASS | `node scripts/check-developer.mjs`: 474 entries, 474 active, unique IDs/slugs, route order/routing unchanged; source families 446 developer + 15 codec + 9 text + 2 generator + 1 MIME + 1 date-time |
| Execution policy | PASS | 10,000 active catalog tools; 12 local platform family claims |
| Static privacy tripwire | PASS | 11 guarded engine/UI files; no forbidden executable network primitive or payload-history storage found in guarded paths. This is static analysis, not runtime proof. |
| Native no-Web-runtime check | PASS | `node scripts/check-native-no-web-runtime.mjs` |
| Native UI parity check | PASS | Navigation, catalog discovery, width and typography guards |
| Accessibility parity check | PASS | 37 required rule keys plus report contract in TypeScript/Kotlin/Swift |
| Regex Studio tests | PASS | 11/11 `src/lib/engines/regex-studio.test.ts` tests, including Worker cancellation/deadline and shared golden captures |
| Kotlin engine compile/runtime smoke | PASS | Standalone `kotlinc` compile and runtime execution; valid XML formats, malformed XML/DOCTYPE rejected, SQL sample is multi-line with `active = true` spacing. Compiler reported pre-existing unchecked casts in the bundled simple YAML parser. |
| Swift engine typecheck/runtime smoke | PASS with toolchain qualification | Swift typecheck using a temporary NaturalLanguage API stub because Linux has no Apple NaturalLanguage framework; standalone runtime test used FoundationXML, formatted valid XML, rejected malformed XML/DOCTYPE and formatted SQL. This is not an Xcode/iOS build. |
| TypeScript/module syntax and audit-script syntax | PASS | `node --experimental-strip-types --check` on the changed formatter engine/test and `node --check` on browser audit/benchmark scripts |
| Full route smoke | BLOCKED PARTIALLY | 446 operations attempted; 19 failures arise because `prettier`/`sql-formatter` packages are not installed in this container. No generic-placeholder outputs were found. This cannot be called a clean route smoke. |
| Full Web parser suite | NOT RUN | No `node_modules`; package registry DNS/network is unavailable in the container, so the required runtime dependencies could not be installed. |
| Live browser privacy/axe audit | NOT RUN | Playwright and a running application are not available in this environment. CI now installs Chromium/Playwright and runs the audit. |
| Android Gradle/JUnit and iOS Xcode/XCTest | NOT RUN | Android project Gradle distribution/dependencies and Apple Xcode/iOS SDK are unavailable here. Native engine smoke/typecheck is not a replacement for full app CI. |
| Deployment and production privacy proof | NOT RUN | No deployment made. No claim of a passing live network-capture test is made. |

## Deployment configuration note

The preserved `.enV/app-env.json` currently sets `VITE_AUTH_ENABLED` to `false`. It is included to preserve the project’s existing local configuration; it must not be interpreted as a recommendation to expose authenticated functionality without a gate. Before a public deployment, confirm the product's intended access model and set `VITE_AUTH_ENABLED=true` (and configure the corresponding authentication provider/secrets) when authentication is required. Do not put secrets into `VITE_*` variables because they are exposed to browser code.

## Dependency-lock caveat requiring resolution before release

The lockfile pins `sql-formatter` to version `15.9.0` and the official registry tarball URL, but its `package-lock.json` record does **not** yet contain an `integrity` digest. Registry access was unavailable while building this archive, so an integrity hash was not guessed or fabricated. In a network-enabled environment, regenerate/reconcile the lockfile with the project’s supported npm version, confirm the resulting `integrity` field from the official registry, run `npm ci`, and review the lockfile diff before release.

## Commands to run in a network-enabled CI/release environment

```sh
npm ci
npm run check:developer:fixtures
npm run check:developer
npm run check:developer:privacy
npm run check:developer-routes
npm run check:execution-policy
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test \
  src/lib/engines/developer-studios.test.ts \
  src/lib/engines/precise-formatters.test.ts \
  src/lib/engines/regex-studio.test.ts
npx playwright install --with-deps chromium
npm run audit:developer:browser:ci
npm run benchmark:developer -- --report=audit/developer-tool-benchmark.json
npm run build
npm run typecheck
npm run lint
```

Use the existing Android and iOS CI workflows to run Gradle/JUnit/lint and Xcode/XCTest on their supported runners. Treat benchmark results as reproducibility baselines until competitors are tested with the same fixtures, devices, versions and acceptance criteria.

## Post-archive integrity remediation (same session)

- Retrieved the official registry integrity for `sql-formatter@15.9.0`:
  `sha512-3A/N+v+mA5/PDU+FlO4uTFE0L/Mmg63c/Ny161Qv2b1Mxp9IX8War+LLmq17LA/Kgu4KXAR7iutK2JaHWJMMtw==`
- Injected the integrity field into `package-lock.json` under `packages["node_modules/sql-formatter"]`.
- Confirmed catalog integrity: 474 Developer entries, unique IDs/slugs, routing unchanged.
- Confirmed shared golden fixtures synchronized across TypeScript / Kotlin / Swift.
- Full `npm ci` remains environment-limited in this container (slow/partial install due to Node 24 vs required 22 and concurrent process pressure). The lockfile is now registry-consistent; a clean `npm ci` on Node 22 with network access is the remaining step to unblock the 19 formatter routes and the full parser suite.

## Remaining production blockers (exact)

1. Clean `npm ci` on Node.js 22 (lockfile integrity now present).
2. Re-run the 446-operation route smoke; expected to clear the previous 19 prettier/sql-formatter failures.
3. Full Android Gradle + instrumentation and iOS Xcode + XCTest on supported runners.
4. Playwright + axe live browser audit against the built app.
5. Production deployment privacy network capture (not performed).
