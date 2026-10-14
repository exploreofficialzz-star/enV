# enV Developer Studios — deep enhancement and QA report

**Audit date:** 14 October 2026  
**Source specification:** `docs/developer-studios-agent-prompt.txt`  
**Scope:** Existing Developer category across Web TypeScript/React, Android Kotlin/Compose, and iOS Swift/SwiftUI. Existing Developer tool slugs are preserved.

## Executive summary

This pass moves beyond Studio catalog/routing work by adding an inspectable, deterministic Recipe Pipeline in Diff & Inspect Studio, implementing its transformation engine independently in TypeScript, Kotlin, and Swift, and bringing native UI to parity with the web concept. It also hardens unsafe-input handling and adds cross-platform behavioural tests. It does **not** establish that enV has already outperformed every commercial competitor; that requires reproducible benchmarks and browser/device validation on comparable workloads.

## Product improvements

### Recipe Pipeline across three native stacks

A user can compose ordered text/data transformations, see per-step status, preview/intermediate results, and copy/download output on the web. The Android and iOS versions now offer native ordered-step builders as well: add, reorder and remove a step, edit the source text, set literal-replacement or JSON Pointer parameters, run the chain through the local Kotlin/Swift engine, and copy the recipe JSON for portability. Native processing does not call the web frontend.

The same 33-operation allow-list is implemented in all three stacks and checked for exact set/order and dispatch parity:

`trim`, `strip-bom`, `normalize-newlines`, `ensure-final-newline`, `remove-final-newline`, `collapse-whitespace`, `remove-blank-lines`, `sort-lines`, `unique-lines`, `reverse-lines`, `unicode-normalize-nfc`, `unicode-normalize-nfd`, `unicode-normalize-nfkc`, `unicode-normalize-nfkd`, `replace-literal`, `url-encode-component`, `url-decode-component`, `base64-encode`, `base64-decode`, `base64url-encode`, `base64url-decode`, `hex-encode`, `hex-decode`, `html-escape`, `html-unescape`, `json-format`, `json-minify`, `json-sort-keys`, `json-validate`, `json-pointer-get`, `csv-to-json`, `json-to-csv`, `sha256-hex`.

Operations are allow-listed and deterministic. Recipe content is not evaluated as JavaScript, shell commands, or arbitrary scripts; no operation performs network requests. Each step records useful status/size/preview information. SHA-256 is a one-way digest, not a decryption function or password-hashing scheme.

### Cross-platform correctness and resource safety

- **Large integers:** JSON number tokens are kept as source lexemes where possible, preventing an ordinary formatter/sorter/JSON Pointer selection from silently turning an integer such as `9007199254740993` into a rounded JavaScript number.
- **Duplicate keys:** Ambiguous duplicate keys in recipe configuration are rejected. Data JSON inspection/format behavior reports duplicates instead of pretending JSON parsers agree; RFC 8259 says object names SHOULD be unique and warns duplicate-name receiver behaviour is unpredictable.
- **JSON Pointer:** RFC 6901 escaping (`~0`, `~1`) is supported; malformed escapes, missing locations, and non-canonical array indexes are rejected.
- **Base64:** Standard and URL-safe alphabets are separate. Decoders validate alphabet/padding and reject non-canonical unused pad bits rather than accepting multiple strings for one byte sequence.
- **Unicode and line endings:** NFC/NFD/NFKC/NFKD, explicit BOM cleanup, final-newline controls, line reversal/sorting, CRLF handling, UTF-8 round trips, and quoted CSV line breaks have cross-platform regression coverage. Compatibility normalisation emits a warning because it can change text distinctions.
- **Bounded processing:** recipe input is capped at 1 MiB; a step's result is capped at 2 MiB; recipe configuration is capped at 7 MiB; recipes allow at most 16 steps; JSON container nesting is bounded at 128; pretty formatting is preflighted against the output budget. Literal replacement estimates output size before allocation and rejects expansion that would exceed the budget. JSON configuration duplicate keys fail closed.
- **CSV:** quoted commas, quote escaping, multiline quoted fields and CRLF are handled in the deterministic text-based CSV conversions. CSV data values remain strings rather than being guessed into JSON number/boolean types.

### Existing Developer Studios and tool routing

The Developer category remains organized around 12 Studio workspaces. The catalog/engine parity checker currently confirms **12 Studios and 75 mode keys** line up across TypeScript, Kotlin and Swift. The route inventory continues to map every **474 existing Developer slug** to a Studio/mode/action; no legacy slug was removed. A hash “decoder” route is correctly treated as a one-way hash-domain error, not fake reversible output.

## QA evidence from this execution environment

| Check | Result | Qualification |
|---|---|---|
| Focused Web Developer tests | **55/55 pass** | Node test run using the existing TypeScript source test path |
| Cross-platform behavioural differential cases | **20/20 pass** | Web/Kotlin/Swift engine harnesses; includes Unicode, codecs, BOM, JSON token precision, CSV CRLF, warning consistency, JSON Pointer and config escaping |
| Hostile/error parity cases | **4/4 pass** | Deep JSON, pretty-output budget, replacement expansion, and duplicate recipe configuration keys |
| Recipe operation parity | **Pass — 33 operations** | Exact operation order, dispatch/security/resource guards, and native visual-builder wiring checked |
| Studio catalog parity | **Pass — 12 Studios / 75 modes** | TypeScript/Kotlin/Swift catalogs |
| Shared golden fixture check | **Pass** | No platform drift detected by the fixture sync checker |
| Static privacy guard | **Pass** | 11 guarded engine/UI files; detects risky source primitives/storage patterns only, not runtime network behaviour |
| Developer route audit | **474 mapped; 448 executable smoke entries; 0 hard failures; 0 mapping failures; 0 generic placeholders** | 18 checks blocked by unavailable parser packages; one expected hash reversal domain error |
| Swift parser | **Pass** | Changed SwiftUI, recipe engine and native test files parse successfully |
| Kotlin recipe engine local harness | **Pass** | Compiled against temporary test doubles for Android Base64/JSON APIs; this is not an Android APK build |
| Swift recipe engine local harness/type-check | **Pass with limitation** | Linux CryptoKit interface stub used only to type-check/run non-hash cases; stub does not validate the actual iOS CryptoKit SHA-256 output |
| Full Web build/typecheck/browser audit | **Blocked** | `node_modules` is absent; `npm run build` fails with `vite: spawn ENOENT`. Registry access has been unavailable in this environment |
| Full Android Gradle test/lint/build | **Blocked** | Gradle wrapper distribution cannot be downloaded because this environment cannot resolve `services.gradle.org` |
| Full iOS Xcode build/XCTest | **Blocked** | Xcode is not installed on this Linux host |

The browser privacy/playwright audit remains a release gate. A static source guard must not be interpreted as proof that the running site sends no request. The CI workflows contain the authoritative dependency-installed Web, Android and macOS/Xcode build/test jobs; the added recipe parity check is wired into the Developer quality workflow.

## Competitive research and design implications

This research compares against the complete systems/features documented by vendors and current public issue trackers, not only their free tiers. It is used to build an actionable product backlog, not as a claim of measured superiority.

- **CyberChef** documents hundreds of data operations, chaining/reordering operations, auto-bake, breakpoints, intermediate output inspection, saved recipes, and deep links while processing in the browser. The Recipe Pipeline borrows the inspectable deterministic pipeline concept with much stricter explicit size/step/resource limits and native Kotlin/Swift engines. Current gap: it intentionally supports a small, text-oriented operation set—not CyberChef's broad binary/compression/cryptography ecosystem, file range or breakpoints.
- **regex101 Pro** documents multiple independent test strings, substitution pipelines, longer PCRE2 traces, benchmarking, regex formatting and document extraction. enV's deterministic pipeline foundation creates a reusable composition pattern, but enV does not claim parity with PCRE2, other regex flavours, or all Pro features; the current browser regex engine is JavaScript RegExp and native engines are platform-specific.
- **DevToys** promotes a native/offline toolkit and smart detection, while the modern repository advertises native editors, tabs/split panes and a large offline catalog. That makes genuine native processing and appropriate native workflow controls a product requirement here, rather than a WebView wrapper.
- **IT-Tools' public issue tracker** has recent requests for JSON beautification and XML diff, and reports involving integer formatting and navigation/scroll friction. This reinforces the importance of lossless number handling, XML/text diff depth, predictable errors and usable navigation. It does not prove all users have these problems or establish overall competitor quality.
- **Standards**: RFC 8259 is the basis for rejecting ambiguous configuration duplicate keys; RFC 4648 informs canonical Base64 pad-bit checks; RFC 6901 governs JSON Pointer escape and array-index rules.

## References

- CyberChef official project and recipe features: https://github.com/gchq/CyberChef
- CyberChef current public issues, including the July 29, 2026 navigation request: https://github.com/gchq/CyberChef/issues
- DevToys official repository: https://github.com/DevToys-app/DevToys
- DevToys newer Rust-native implementation repository: https://github.com/toy-forge/devtoys
- regex101 Pro feature matrix: https://support.regex101.com/application/regex101-pro/
- regex101 substitution pipeline guide: https://docs.regex101.com/application/regex101-pro/substitution-pipeline/
- IT-Tools issue tracker: https://github.com/CorentinTh/it-tools/issues
- RFC 8259 JSON: https://www.rfc-editor.org/rfc/rfc8259.html
- RFC 4648 Base-N encodings: https://www.rfc-editor.org/rfc/rfc4648.html
- RFC 6901 JSON Pointer: https://www.rfc-editor.org/rfc/rfc6901.html

## Release checklist

Run in a network-enabled environment with exact lockfile dependencies and the native toolchains installed:

```bash
npm ci
npm run check:developer:recipe-parity
npm run check:developer:fixtures
npm run check:developer
npm run check:developer:privacy
npm run check:developer-routes
npm run typecheck
npm run build
npm run audit:developer:browser:ci
```

Run the repository's `./gradlew test lint` / signed Android release job on the Android CI runner and the existing `xcodebuild` simulator/XCTest job on macOS. Before using the phrase “beats all competitors,” benchmark accuracy, latency, memory, mobile ergonomics and privacy with published fixtures against reproducible competitor versions/configurations.
