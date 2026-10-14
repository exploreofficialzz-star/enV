# enV Developer Category — Deep Research & Enhancement Round 4

**Research/implementation date:** 13 October 2026
**Scope:** Existing Developer tools and engine routes in Web TypeScript, Android Kotlin, and iOS Swift
**Rule preserved:** no Developer catalog entries, IDs, slugs, ordering, or engine routes intentionally deleted or renamed.

## Executive summary

This round applies targeted correctness and security hardening to tools that process developer data: lossless JSON formatting, structural JSON diff and key sorting, raw JWT segment inspection, CORS/CSP policy generation, Data URI limitations, and the HTTP registry's status descriptions. These changes address a class of failures that are more consequential than a cosmetic formatting issue: quietly altered numeric identifiers, ambiguous duplicate JSON members, confusing “decoded” with “verified” JWTs, and generators that emit unsafe security policy.

This is not evidence that enV already beats every competitor or every premium feature. It is an implementation round plus a source-backed roadmap. Some tools now have substantially safer behavior, but parser completeness, actual device builds, live network privacy inspection, user testing, and reproducible competitor benchmarks are still required before any “best” claim is justified.

## Research findings and product decisions

### 1. Standards accuracy matters as much as breadth

The current IANA HTTP Status Code Registry lists 104 `Upload Resumption Supported` as a **temporary** registration with an expiry date of 13 November 2026; it lists 305 `Use Proxy`, 306 `(Unused)`, and 418 `(Unused)` [IANA HTTP Status Code Registry](https://www.iana.org/assignments/http-status-codes). The current resumable upload specification is still an active Internet-Draft last updated on 6 October 2026 and is intended to become a Proposed Standard, not yet an RFC [IETF Resumable Uploads draft](https://datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/).

**Implemented:** 104 now carries a visible temporary-registration caveat; 305 is marked deprecated; 306 is labelled unused; and 418 keeps the familiar “I'm a teapot” lookup requested by the hard-retest prompt while explaining that the registry currently marks it unused and the teapot wording is historical/application-specific. The reference tables now include the extra note instead of teaching the joke label as current general-purpose HTTP semantics.

### 2. Preserve JSON source tokens, not just parsed values

[RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html) says object member names SHOULD be unique and warns that implementations vary when duplicate names occur. ECMAScript numbers also cannot safely represent every integer in JSON's possible numeric range. A formatter that runs `JSON.parse` and `JSON.stringify` without a warning can silently change IDs or counters.

**Implemented this round:**
- Lossless JSON formatter/minifier implementations in Kotlin and Swift scan and re-emit validated JSON token streams so unsafe numeric lexemes and duplicate object member occurrences are not first collapsed by platform-number/object serialization.
- Web JSON key sorting and structural diff preserve raw numeric lexemes and report differences with structural paths.
- JSON Pointer querying supports escaped property names (`~1` for `/`, `~0` for `~`) and reports unsafe integer values explicitly.
- JWT decoding returns exact raw header/payload JSON for inspection and warns when either segment contains unsafe integer tokens. The decoder retains explicit DECODE ONLY / not-signature-verified semantics.

This is still a defensive tool, not a substitute for a lossless, formally verified general JSON parser. Keep identifiers as strings in interoperable data models where appropriate.

### 3. Security generators should validate and explain risk

A one-click generator can be dangerous when its output invites copy/paste into production without context. OWASP recommends avoiding sensitive information in browser `localStorage`, because same-origin script can read it and XSS can steal or alter it [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

**Implemented:**
- CORS generation accepts structured configuration, validates origins/methods/header names, rejects `credentials: true` with a wildcard origin, and labels multi-origin middleware examples as pseudocode rather than executable drop-in middleware.
- CSP generation accepts structured directives, validates inputs, and flags permissive sources such as `*`, `unsafe-inline`, `unsafe-eval`, and broad `http:` sources.
- Data URI tools explain MIME metadata and explicitly distinguish text/UTF-8 handling from arbitrary binary-file support.

These generated policies are starting points, not a full app-specific security audit. CORS is not authorization, and a strict CSP requires reviewing the application's script/style/resource architecture. Never paste production secrets into a tool and never persist raw inputs by default. No new client-side history or payload persistence is introduced in this round.

### 4. Premium regex tools show where enV can go next

The official regex101 Pro docs list multiple test strings, substitution pipelines, regex formatting, deeper PCRE2 debugging, benchmarking, document extraction, and comparison/conversion between regex flavors [regex101 Pro documentation](https://docs.regex101.com/application/regex101-pro/) [regex flavor conversion and comparison](https://docs.regex101.com/). Matching and benchmarks run locally in the browser according to regex101's documentation.

**Product implication:** matching a single sample and displaying matches is not premium-grade completeness. Next steps should include saved-as-file test cases, regression assertions, a multi-stage replacement preview, controlled benchmark repeats and context (engine/device/input), and flavor-specific syntax/warnings. enV must label its current engine as JavaScript RegExp and must not claim PCRE2/Python/Rust/.NET equivalence. High-risk regex heuristics are not a timeout; a Web Worker with a killable budget is safer for potentially expensive work.

### 5. Big-toolkit strength is breadth; weakness can be workflow complexity

CyberChef's official project emphasizes a large collection of data operations and recipe chaining [CyberChef project](https://github.com/gchq/CyberChef). Its issue tracker includes a mobile-phone support request, which is a useful signal that mobile interaction remains an important use case to test rather than assume [CyberChef mobile issue #2051](https://github.com/gchq/CyberChef/issues/2051). DevToys positions itself as an everyday developer-toolbox and promotes fast local tools and extension breadth [DevToys project](https://github.com/DevToys-app/DevToys).

**Product implication:** make one-shot actions fast, and add workflow chaining as an optional layer instead of forcing every user through recipe creation. A large catalog only helps if each route has reliable behavior, explanatory errors, accessible mobile controls, and golden tests.

### 6. Formatters should be real formatters

Prettier documents a parser-based, opinionated formatting model across JavaScript/TypeScript and a range of markup/data languages [Prettier documentation](https://prettier.io/docs/). SQL Formatter supports multiple SQL dialects and exposes dialect/configuration choices [SQL Formatter project](https://github.com/sql-formatter-org/sql-formatter).

**Current-state distinction:** the enV improvements in this source tree are conservative lexical formatters. They now return multi-line output for the supplied difficult fixtures and protect SQL strings/comments from keyword rewriting, but they are not replacements for a mature parser/AST formatter. The next major formatter increment should bundle a license-reviewed, offline-capable parser/formatter with a pinned version and dialect options, and keep an explicitly labelled basic fallback for unsupported input. Dependency/network access and license review must be resolved before adopting one.

## Competitor-informed opportunity matrix

| Area | Publicly documented strength in competitors | enV direction | Current round status |
|---|---|---|---|
| JSON | Mature editors, structure-aware review | Lossless numeric handling, duplicate member warning, paths, structural diff, sort | Improved; Web tests pass; native XCTest/JUnit not run in this environment |
| JWT | Standard decode/reference workflow | Raw JSON segment inspection, unsafe integer warning, claim notes, explicit decode-only | Improved; do not imply signature validation |
| Regex | regex101 Pro test sets, substitution pipelines, benchmarking, flavor tools | Multi-case regressions, safe replacement pipelines, benchmarks and engine label | Partial existing batch tooling; premium-level workflow remains roadmap |
| HTTP | IANA/RFC coverage and accurate registry semantics | Correct registry notes, actions, retry guidance without treating every status alike | Expanded tables and nuanced 104/305/306/418 descriptions |
| JS/CSS/HTML/JSON/Markdown formatting | Prettier's parser-based ecosystem | Bundle parser-backed offline formatters under license audit | Current conservative formatters are better on hard fixtures but not parser-equivalent |
| SQL | Dialect-aware formatter ecosystems | SQL dialect selection, real parse-aware formatting | Current formatting is deliberately conservative; parser-backed dialect support remains roadmap |
| Security config | Framework-specific security knowledge | CORS/CSP validation plus specific warnings and examples | Structured validation added; application-level review still required |
| Cross-device | Native/offline app workflows | Independent Kotlin/Swift implementations, parity fixture sharing | Source changes added; real-device parity not yet demonstrated |
| Privacy | Some online formatters enable saving/sharing | No raw-payload persistence by default; local-processing copy only when true | Source intent strengthened; live network capture still not performed |

## Implementation summary — Round 4

### Web TypeScript
- Lossless-aware JSON structural diff and key sorting with unsafe integer preservation and duplicate-key caveats.
- JSON Pointer escape validation/query behavior.
- JWT raw header/payload JSON fields and unsafe-number warnings across segments.
- Structured CORS/CSP generators with origin/method/header/directive validation, wildcard-credentials guard, and weak-policy warnings.
- Data URI text/binary limitation messaging.
- HTTP status registry updates with 104/305/306 and correct caveat for 418.
- Additional golden regression coverage.

### Android Kotlin
- Native lossless JSON formatter/minifier path in legacy and parity dispatch, preserving numeric token text and duplicate members.
- JWT raw segment and precision fields.
- Structured CORS/CSP validation and warnings.
- Data URI limitations and expanded HTTP status notes.
- New native regression tests for lossless JSON, JWT raw precision, CORS/CSP, and HTTP registry semantics.

### iOS Swift
- Native lossless JSON formatter/minifier path, preserving unsafe numeric tokens and duplicate member occurrences.
- JWT raw segment/precision fields.
- Structured CORS/CSP validation and warnings.
- Data URI limitations and expanded HTTP status notes.
- New XCTest coverage for lossless JSON, JWT raw precision, CORS/CSP, and HTTP registry semantics.

## Verification and limitations

**Verified in this environment:**
- Focused Node Web engine suite: 41/41 tests passed after the status-regression assertions were aligned with the table's current format.
- Production, execution-policy, catalog, Developer-category, and Text-engine checks passed; Developer inventory remained 474/474 with stable IDs/order/routing.
- Route smoke audit passed 446 operations with zero failures and zero generic placeholders (one expected domain error case).
- Swift frontend syntax parsing for the engine and XCTest source passed (syntax parse only; not an iOS SDK build).
- Native test source includes the new regression cases, but full Android JUnit and iOS XCTest execution are not claimed.

**Not verified / blocked:**
- No production deployment to `envtools.store` was performed.
- No browser network-capture test was available, so the zero-payload-upload claim is not independently network-proven in this round.
- The full dependency-backed Web build/typecheck/lint could not be completed because dependencies were not installed and package retrieval failed in this environment.
- Full Android Gradle/JUnit execution is blocked by unavailable Gradle/dependency distribution and Android classpath; a bare compiler invocation shows unresolved Android/project dependencies and no reported parser-level syntax error, but is not a substitute for that build.
- Full iOS build/XCTest needs Xcode and Apple SDKs, which are unavailable here.
- Cross-device touch/accessibility QA, screen-reader testing, performance profiling, and side-by-side competitive accuracy benchmarks are still required.

## Prioritized next roadmap

### P0 — Release confidence
1. Run the full Web typecheck/build/test/lint and dependency/license inventory in CI with network access.
2. Run Android Gradle tests and build on a real SDK; run iOS XCTest and build with Xcode.
3. Add a deterministic shared fixture pack for every golden test to Web/Kotlin/Swift, including malformed UTF-8, huge JSON numbers, duplicate keys, JWT claims, and adversarial format inputs.
4. Capture network requests while using every privacy-labelled tool and prove no user payload is transmitted; inspect analytics, errors, logs, and browser storage too.
5. Deploy to staging, run all 474 catalogue routes and 446 engine operations, then canary before production.

### P1 — Premium formatter and Regex Studios
1. Add offline, parser-backed JS/TS/JSON/CSS/HTML/Markdown/YAML/XML formatter options after dependency pinning and license review.
2. Add SQL dialect selection and parser-backed formatting; label the current lexical path clearly until then.
3. Add multi-case regex test collections with explicit pass/fail assertions, substitutions as a step-by-step pipeline, and repeatable local benchmarks.
4. Isolate potentially expensive regex runs in a killable worker/time budget; heuristics alone are not execution limits.
5. Add JSON tree expansion, precise path+line errors for each supported parser, and visual two-pane diffs that keep unsafe numeric tokens raw.

### P2 — Workflow and mobile finish
1. Optional recipe chaining that preserves one-shot actions and exposes each step's input/output.
2. File-based hash and encoding workflows with explicit size caps and cancellation; multi-hash output and digest comparison.
3. Accessibility checks: keyboard navigation, large touch targets, dynamic text, screen reader semantics, and narrow-screen panes; do not change established visual design without a dedicated UX request.
4. No sensitive history by default. Any future saved workspace must be explicit opt-in, scrub secrets where possible, and warn when sharing includes input payloads.

### P3 — Evidence for “best” positioning
- Build an open, repeatable set of real user tasks and difficult fixtures; compare correctness, error recovery, latency, usability, mobile outcomes, and privacy claims across free and paid competitor tiers.
- Track validated negative reviews and issue reports by recurring failure mode; add a regression test for each confirmed case instead of using anecdotal complaints as facts.
- Publish per-tool compatibility and limitations so a large catalog does not disguise weak or partial engines.

## Sources reviewed

1. [IANA HTTP Status Code Registry](https://www.iana.org/assignments/http-status-codes) — source for registered/temporary/unused semantics; current page says updated 2025-09-15.
2. [IETF Resumable Uploads Internet-Draft](https://datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/) — revision dated 6 October 2026; working draft, intended Proposed Standard.
3. [RFC 8259 — The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259.html) — duplicate object name interoperability caution.
4. [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) — sensitive localStorage and XSS cautions.
5. [regex101 Pro docs](https://docs.regex101.com/application/regex101-pro/) and [regex101 project docs](https://docs.regex101.com/) — existing paid test-set, pipeline, benchmark, extraction, and flavor features.
6. [CyberChef GitHub](https://github.com/gchq/CyberChef) and [mobile support issue #2051](https://github.com/gchq/CyberChef/issues/2051) — documented scope and mobile request.
7. [DevToys GitHub](https://github.com/DevToys-app/DevToys) — everyday tool collection and extensibility model.
8. [Prettier docs](https://prettier.io/docs/) and [SQL Formatter GitHub](https://github.com/sql-formatter-org/sql-formatter) — parser/dialect formatter expectations.
9. User-provided `enV Developer Category — Hard Retest Results + Competitor Comparison + Full AI Agent Prompt` — product requirements, hard fixtures, and preservation rules.
