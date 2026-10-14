# Developer Category Changelog — 2026-10-13 (competitive research pass)

## Competitive-feedback-driven improvements
- Added a source-linked competitive research report that separates official capability information, current/older issue reports, maintainer comments, community anecdotes, and implementation decisions; it calls out already-fixed competitor issues rather than reusing stale complaints.
- Expanded JSON inspection across Web/Kotlin/Swift with bounded structure statistics, duplicate-key path warnings, large integer lexical scanning outside string contents, and truncation/resource limits.
- Expanded regex workflow with bounded JSON-array multi-sample execution, capture/index output, replacement previews, JavaScript-engine labeling, and a heuristic high-risk pattern warning (explicitly not a complete execution timeout).
- Added a 256 MiB pre-allocation cap for Web whole-file hash processing to avoid attempting an unbounded in-memory allocation.
- Made extreme JWT claim timestamps non-fatal and explicit in native output; retained decode-only and `signatureVerified: false` safeguards.
- Corrected cron weekday text and clarified Vixie-style day-field/wildcard semantics with a cron-dialect caveat.
- Explicitly tracked recipe chaining, real device builds, network capture tests, standards conformance, and formal competitor benchmarks as remaining strategic gaps rather than claiming they are complete.


- Added a shared Web Developer Studio engine and representative golden tests for JSON diagnostics/path queries/schema inference, JWT decoding clarity, UTF-8-safe encoding, hashes, regex, cron/timestamps, UUIDs, query utilities, and generator output.
- Added example loading and standardized client-side privacy/action/copy/download affordances to the Web Developer engine experience.
- Expanded native Kotlin dispatch and Android form support with local file hashing/import, examples, copy/export, privacy messaging, JSON Schema inference, query/cookie/header/user-agent helpers, markup encoders/decoders, and improved suffix/generator handling.
- Expanded native Swift dispatch and iOS form support with separately implemented native equivalents and Swift regression tests.
- Corrected UUID validation in TypeScript, Kotlin, and Swift and aligned accepted UUID version/variant patterns, including Nil and Max identifiers where supported.
- Replaced misleading Base64 handling in HTML/XML/SVG entity tools with actual entity encode/decode behavior.
- Corrected webhook generator output so arbitrary event labels still produce valid JSON, and improved cron encode/decode route handling.
- Added source-derived inventory preservation checks and an example-driven route audit for all 446 Web Developer-engine operations. Added `npm run check:developer-routes` and included it in the `verify` chain.
- No Developer catalog IDs, slugs, ordering, or engine routes were intentionally removed or renamed.
- Verification results, known environment blockers, and honest capability limitations are documented in `DEVELOPER-CATEGORY-AUDIT-2026-10-13.md`.

Research evidence and feedback mapping: `audit/COMPETITIVE-RESEARCH-AND-IMPLEMENTATION-REVIEW-2026-10-13.md`.

## Deep research & hardening pass — 13 October 2026
- Added `audit/DEEP-RESEARCH-ENHANCEMENT-ROUND3-2026-10-13.md`, linking verified current documentation, selected current issue reports, maintainer release notes, security advisories, and user-community feedback to concrete fixes and open gaps.
- Tightened `src/lib/engines/codecs.ts` Base64 error diagnostics so invalid alphabet/length, non-canonical trailing bits, and decoded invalid UTF-8 are not conflated.
- Added direct SHA-384 tool-ID mapping and known-answer coverage in Kotlin and Swift codec engines; SHA-384 was already part of multi-hash output.
- Added precise secure-token length parsing in Kotlin and Swift so fractional/nonnumeric lengths cannot be silently truncated or converted into the default length; cryptographic token output remains sourced from OS-backed secure RNGs.
- Expanded native test fixtures to cover direct SHA-384, invalid Base64 UTF-8, fractional token lengths, and non-numeric token lengths.
- Focused Web engine suite passes 39/39; 474 Developer catalog identity/route checks and 446 Web route smoke checks pass. Standalone Kotlin codec compilation and Swift syntax parsing passed. Full app builds remain blocked by unavailable dependencies/toolchains as recorded in the audit.

## Hard-ret test remediation — 13 October 2026
- Fixed JSON formatter unsafe-integer silence by formatting original JSON number tokens lexically on Web and surfacing explicit unsafe-integer warnings; also call out duplicate-key last-wins ambiguity. Duplicate source member occurrences are retained in formatted output.
- Expanded HTTP status explanations for 418 (I'm a teapot), 422, 429, and 503.
- Replaced the live shared Text-engine's empty/spacing-only JavaScript formatter with a conservative lexical multi-line formatter and an explicit non-parser-completeness note.
- Replaced the live shared Text-engine's simplistic SQL formatting with clause-aware formatting that protects literals, quoted identifiers, and comments.
- Added Web hard-fixture regressions for unsafe JSON integers, duplicate keys, HTTP descriptions, and difficult minified JS/SQL; added native Kotlin/Swift text-engine and status/JSON regression tests.
- Current focused Web tests: 31/31 passed; Developer catalog audit: 474 entries, unchanged IDs/order/routing; route smoke: 446 operations, zero failures or generic placeholders. Standalone Kotlin engine compilation and Swift syntax parsing passed; these are not full Android/iOS builds.
- Full dependency-backed Web build/test, Android Gradle/JUnit, Xcode/XCTest, production deployment verification, and network-capture privacy proof remain blocked/unavailable. Exact detail: `audit/DEVELOPER-HARD-RETEST-REMEDIATION-2026-10-13.md`.


## Deep research & premium-readiness hardening — Round 4 — 13 October 2026
- Added `audit/DEEP-RESEARCH-ENHANCEMENT-ROUND4-2026-10-13.md` with fresh research on current HTTP registry semantics, resumable-upload draft status, JSON duplicate-key ambiguity, safe local-storage policy, regex101 Pro capabilities, CyberChef mobile discussion, DevToys workflow model, and parser-backed formatters.
- Made Kotlin/Swift JSON formatting token-lossless for unsafe integer text and duplicate object keys rather than reserializing through ordinary number/object models.
- Extended Web structural JSON diff/key sorting and JSON Pointer escaping tests for exact numeric tokens.
- Exposed raw JWT header/payload JSON and unsafe numeric precision warnings across Web/Kotlin/Swift; no signature verification is claimed.
- Added structured, input-validated CORS/CSP generators and expanded native regression tests; multi-origin output is explicitly pseudocode and not a drop-in production middleware package.
- Expanded status references with temporary 104 and deprecated/unused 305/306 semantics; 418 retains the familiar teapot lookup while clearly noting that IANA currently marks it unused in general HTTP semantics.
- Focused Web engine suite passes 41/41. Web production build, Android Gradle/JUnit, iOS XCTest, live deployment, network-capture privacy proof, and real-device QA remain unverified or blocked; details are documented in the Round 4 report.

## Regex Studio, dialect formatting and cross-platform regression pass — Round 5 — 13 October 2026
- Connected the advanced Regex Studio engine to the live Web Developer UI and added mode-aware controls on Web, Android and iOS for batch testing, bounded benchmarking, ordered substitution pipelines, safe source token display and static regex flavor notes.
- Added named and numbered captures, per-sample assertions, replacement previews, bounded input/output and truncation reporting; fixed the Kotlin at-limit truncation ambiguity and pipeline stage input-length report.
- Web regex calls use a terminable Worker with tested success cleanup, cancellation and hard deadline. Native Kotlin Java Pattern and Swift ICU execution report their inability to guarantee a killable deadline for one active match; they use conservative risk/input bounds rather than making the same claim as Web.
- Added SQL dialect controls for standard SQL, PostgreSQL, MySQL, MariaDB, SQLite, T-SQL, BigQuery, Snowflake, Oracle, Redshift and DuckDB and wired them to Web, Kotlin and Swift lexical formatters. The formatter protects common string/comment/quoted regions and remains explicitly labeled non-parser-backed.
- Added canonical cross-platform golden fixture source and TypeScript/Kotlin/Swift fixture synchronization/check command; fixtures cover multiple regex samples, named captures, substitution layers, hard JS/SQL formatting input, unsafe JSON integer and duplicate keys, and standard hash vectors.
- Added static Developer privacy-source tripwire and a Playwright/axe runtime audit script for outgoing request sentinels, browser storage, serious/critical accessibility violations and narrow-width overflow.
- Round 5 verification: **49/49 focused Web tests passed**; 474/474 Developer entries and 10,000-tool catalog checks passed; 446 route operations had zero failures/zero generic placeholders; Swift standalone regex runtime smoke passed; Kotlin SQL standalone runtime smoke and Kotlin regex typecheck passed; Swift syntax and Xcode project plist checks passed.
- Full Web build/dependency-backed validation, Android Gradle/JUnit, Xcode/XCTest, Playwright runtime privacy/a11y, device QA, deployment, and quantitative competitor benchmarking remain not run or blocked. Detailed commands and limits: `audit/ROUND5-VERIFICATION-RESULTS-2026-10-13.md` and `audit/DEEP-RESEARCH-IMPLEMENTATION-ROUND5-2026-10-13.md`.

## Parser-backed formatters, Worker safeguards, native XML, integrity remediation — Round 6 — 14 October 2026
- Added `sql-formatter@15.9.0` (MIT) with explicit dialect selection, 1 MB input cap, non-empty output checks and limitation notes for Web SQL Formatter routes.
- Integrated Prettier standalone with local plugins for CSS, HTML, YAML, Markdown and GraphQL; JavaScript/TypeScript continues on the project printer path.
- All formatter work runs inside a disposable same-origin Worker with an 8-second hard deadline that terminates the Worker.
- Conservative XML structure preflight (nesting, single root, entities, DOCTYPE rejection) ahead of Prettier HTML printer; limitation label present.
- Android: JAXP DOM + Transformer XML formatter with XInclude/external-entity/DTD disabled and DOCTYPE rejection; retained native lexical SQL/CSS/HTML/JS/YAML.
- iOS: FoundationXML XMLParser + local serializer with DOCTYPE rejection and size caps; retained native lexical formatters.
- Extended shared golden fixtures for CSS/HTML/XML/YAML/Markdown/GraphQL and SQL dialects (PostgreSQL, MySQL, SQLite, BigQuery, Snowflake).
- Added `scripts/developer-tool-benchmark.mjs` (median/p95 timing, output SHA-256).
- Hardened browser audit script for result verification, sentinel egress, storage checks, 390×844 overflow and axe-core.
- CI workflow `.github/workflows/developer-studios-quality.yml` for parser regression, fixtures, Playwright and benchmarks.
- **Integrity remediation (post-archive):** Official registry integrity digest for `sql-formatter@15.9.0` inserted into `package-lock.json`. Catalog 474/474, golden fixtures synchronized.
- Remaining: clean `npm ci` (Node 22), full 446-route smoke re-run, Android Gradle, iOS Xcode, live Playwright audit.
