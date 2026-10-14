# enV Developer Studios — deep enhancement changelog

**Date:** 14 October 2026

## Recipe Pipeline: major expansion

- Added 33 deterministic text/data transformation operations to the Diff & Inspect Studio Recipe Pipeline across TypeScript, Kotlin and Swift.
- Added native Android Compose and iOS SwiftUI recipe builders: source text, ordered steps, operation chooser, reorder/remove controls, bounded maximum of 16 steps, find/replacement and RFC 6901 JSON Pointer parameter inputs, and Copy recipe JSON.
- Added per-step audit/status/size/preview behaviour on the web workbench and preserved the no-arbitrary-code/no-network-operation design.
- Added lossless JSON Pointer extraction that keeps selected unsafe JSON number lexemes intact.
- Added explicit NFC/NFD/NFKC/NFKD, BOM stripping, newline normalization, final-newline controls, line sorting/reversal/deduplication, Base64/Base64URL, hex, URL component, HTML, JSON and CSV transforms.

## Security and correctness hardening

- Added canonical Base64 validation, including padding/pad-bit checks.
- Added duplicate-key rejection for recipe configuration and duplicate-key-aware JSON behaviour.
- Added pre-allocation literal replacement expansion checks to avoid large output allocation before enforcing the 2 MiB per-step budget.
- Added JSON nesting-depth limits (128), bounded pretty-format output estimation, strict JSON Pointer escapes/array index checks, and deterministic error behaviour.
- Fixed Kotlin reverse-lines to reverse line order rather than characters in a line.
- Fixed Swift JSON integer grammar checks, BOM-preserving recipe configuration parsing, and CRLF inside quoted CSV fields.
- Expanded native regression coverage for resource limits, duplicate configuration keys, multiline CSV and replacement expansion.

## Quality gate and docs

- Upgraded the parity script to verify all 33 operations, bounded-input/security contracts, native UI-builder wiring, and recipe-config export controls.
- Wired iOS recipe unit-test source files into the Developer Studio workflow path filters.
- Re-ran golden fixture synchronization, route audit, static privacy guard, focused web tests and cross-runtime harnesses.
- Preserved all 474 Developer tool slugs; catalog check reports 12 Studios and 75 modes aligned across TypeScript/Kotlin/Swift.
- Updated implementation/QA report with competitor research sources, exact test outcomes, and environment blockers.
