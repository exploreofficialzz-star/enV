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
