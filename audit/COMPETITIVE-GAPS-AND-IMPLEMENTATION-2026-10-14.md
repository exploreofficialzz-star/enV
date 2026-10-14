# enV Developer Studios — Gap Matrix and Implementation Audit

**Audit date:** 14 October 2026\
**Authoritative task brief:** `audit/DEVELOPER-CATEGORY-AGENT-PROMPT.txt` and the supplied `enV-developer-full-gaps-agent-prompt.txt`\
**Scope:** Developer Studio features only; TypeScript/Web, Kotlin/Android, and Swift/iOS are separate implementations. All other categories and project files are retained.

## Status meaning

- **Done** — implementation exists and the available checks provide direct evidence for the criterion.
- **Partial** — implementation was added or is present, but an explicit sub-requirement, complete native build/test, runtime privacy check, or competitive comparison is still unverified or incomplete.
- **Missing** — no implementation was located. None of the original 474 Developer slugs was removed; this is not a claim that every long-tail tool is a specialist-grade replacement.

## G01–G22 gap matrix

| ID | Requirement | Status | Evidence / remaining qualification |
|---|---|---|---|
| G01 | Studio-first navigation, 12 cards first | Done | Catalog/source checks retain 12 Studios; 75 modes are aligned across TypeScript, Kotlin and Swift. Category-page visual review still requires a browser run. |
| G02 | Smart detect for pasted text and explicit clipboard detect | Partial | Detection helpers are aligned for JWT, UUID, timestamps, cron, JSON, five digest sizes, Base64 and URL-like input. Web and native surfaces expose user-initiated detection and native suggestion navigation. Native UI test suites could not be run in this environment. |
| G03 | Narrow-screen/mobile-first Studio controls | Partial | Web mode chips use horizontal overflow and 40px minimum height; Android chips and iOS horizontal mode chips are touch-sized. A complete native build and screenshot/overflow audit are not available here. |
| G04 | Shareable Studio mode / action deep links | Done (Web) | Studio route audit generated mode/operation maps for all 474 legacy routes; Web Studio supports mode/action query state. Mobile persists selected Studio modes locally instead of using browser URLs. |
| G05 | Regex match highlights, groups, engine labels | Partial | Web segment/highlight path exists; Kotlin `java.util.regex` and Swift ICU helpers are wired to native preview UI. Swift helper compiled and passed an emoji UTF-16/named-capture smoke. Full Android/iOS app tests remain unrun. |
| G06 | Regex flags and replacement preview | Partial | Web/native interfaces provide flags and replacement inputs. Supported flag semantics differ by engine; `g` is not a Java/ICU engine flag in the same sense as JavaScript, and engine labels/notes disclose this. Full native integration test remains blocked. |
| G07 | MD5, SHA-1, SHA-256, SHA-384, SHA-512; file hash and compare | Partial | Existing Hash Studio and local hash/file/compare paths remain. Smart detection now recognizes all five digest lengths. Web golden test verifies MD5/SHA-256; all-device regression execution is not possible here. |
| G08 | JWT decode-only honesty, claims and human time | Partial | Web and native engine code exposes decode-only status and claims. Decode is not signature verification; iOS/Android XCTest/JUnit could not be executed here. |
| G09 | Cron explanation and next run times | Partial | Cron parsing/explanation and upcoming runs are implemented; Web tests cover deterministic UTC runs. A single identical local/UTC display contract across device time zones is not proven in this environment. |
| G10 | Lossless JSON and unsafe integer warning | Partial | Web tests confirm unsafe integer digits and duplicate-key reporting; native regression tests are present in source. Full native test execution remains blocked. |
| G11 | Useful HTTP status table including 418, 422, 429, 503 | Partial | Web tests cover these statuses and source includes the table; native counterparts are present but their test suites could not be run here. |
| G12 | Deterministic recipe pipeline, allow-listed operations only | Done (source + Web tests) | 33 ordered operations match across TS/Kotlin/Swift contracts; parity and security checks pass. No eval, shell, or recipe-driven network execution is permitted. |
| G13 | Privacy strip and no payload upload | Partial | Static privacy source guard passes over 11 guarded files, with no forbidden executable network primitive or payload-history storage detected. Static analysis is not runtime proof; Playwright/network-capture audit was not run. |
| G14 | Clipboard read only after explicit action | Done (source review) | Web, Android and iOS clipboard reads are user-triggered; no background clipboard listener/poll is introduced. Runtime OS/browser permission behavior still merits platform CI. |
| G15 | Real formatters for JS, SQL, HTML, CSS, YAML, XML | Partial | Web developer-engine tests pass for JavaScript and SQL hard fixtures; earlier audit has separate native lexical/XML implementations and documents limits. 18 route checks are environment-blocked because local formatter packages are missing, including several Prettier-powered routes. |
| G16 | No filler tool descriptions | Done (catalog audit) | Route audit reports zero generic placeholders; preserve the limitation that a zero-placeholder check does not certify every page as best-in-class. |
| G17 | Map every legacy slug to Studio + mode; no removals | Done | `audit/developer-studio-route-map.json` maps 474 unique legacy IDs/slugs to 12 Studio routes and a selected mode; route smoke reports zero mapping failures. |
| G18 | Copy-ready DevOps generators and stack presets | Partial | Web, Kotlin and Swift now distinguish Node, Python, Go, Java/Kotlin, Rust, Swift, static-site, Android build-container and generic Dockerfile choices; Web tests and standalone Kotlin/Swift template smokes pass. Generated templates remain starters: inspect base-image versions, package manager, app entry point, repository shape, and deployment policy before use. |
| G19 | Independent TypeScript/Kotlin/Swift engines | Partial | Catalog and recipe parity checks pass, and changed detection/regex/template logic is implemented in native language. Full app CI cannot be run without installed Web dependencies, Gradle distribution/Android dependencies, and Xcode/iOS SDK. |
| G20 | Shared golden fixtures, cross-platform regression | Partial | Canonical fixtures are synchronized; Web developer engine suite passes 52/52 and utility tests pass 6/6. Native XCTest/JUnit have added/retained cases but could not be run in their platform build environments. |
| G21 | Studio-first habit / specialist retention | Partial | Studio-first navigation and smart routing reduce friction; retention or task-completion superiority is not measurable from source audits and has not been claimed. Requires usability data. |
| G22 | Evidence-based competitor claims | Partial | This package reports auditable code checks and explicit blockers. No same-fixture, same-version, same-device competitor benchmark was conducted; there is no basis to claim whole-system superiority or CyberChef operation-count parity. |

## Commands and results in this runtime

| Check | Result |
|---|---|
| `node --experimental-strip-types --test src/lib/engines/developer-utils.test.ts` | PASS — 6/6 |
| `node --experimental-strip-types --test src/lib/engines/developer-studios.test.ts` | PASS — 52/52, including distinct DevOps preset templates |
| `node scripts/check-developer.mjs` | PASS — 474 catalog entries, 474 active, 474 unique IDs/slugs, original slug order/routing preserved |
| `node scripts/check-developer-privacy.mjs` | PASS — static source guard only, not runtime proof |
| `node scripts/check-developer-studio-platform-parity.mjs` | PASS — 12 Studios / 75 modes match |
| `node scripts/check-developer-recipe-parity.mjs` | PASS — 33 deterministic operations match |
| `node scripts/sync-developer-golden-fixtures.mjs --check` | PASS — canonical TS/Kotlin/Swift fixtures synchronized |
| `node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/audit-developer-studio-routes.mjs` | PASS with environment-blocked cases — 474 legacy route mappings, 448 executable developer-engine entries; 429 pass, 18 blocked by unavailable formatter packages, 1 expected domain error, 0 mapping failures/placeholders |
| `swiftc -typecheck NativeDeveloperSmartDetect.swift NativeRegexHighlight.swift` | PASS — Foundation-only helpers |
| Swift helper standalone runtime check | PASS — detection, UTF-16 emoji offsets, named capture groups |
| Standalone Kotlin smart-detect compile / Dockerfile helper smoke | PASS — pure Kotlin detector compilation; extracted Dockerfile helper validates 9 presets |
| Standalone Swift Dockerfile helper smoke | PASS — extracted helper validates 9 presets |
| `plutil -lint apps/ios/enV.xcodeproj/project.pbxproj` | PASS |
| `npm run typecheck` | BLOCKED — empty/incomplete `node_modules`; missing `@types/node` and `vite/client` type definitions |
| `npm run build` | BLOCKED — local Vite binary missing (`spawn vite ENOENT`) |
| `cd apps/android && ./gradlew testDebugUnitTest` | BLOCKED — Gradle wrapper distribution download cannot resolve `services.gradle.org` in this runtime |
| Xcode/iOS full app build and XCTest | NOT RUN — `xcodebuild` and Apple iOS SDK are unavailable on this Linux runtime |
| Live Playwright privacy/axe/narrow-screen audit | NOT RUN — dependencies/app server cannot be launched in the incomplete npm install |

## Competitive positioning

The target remains the supplied prompt's daily-task bundle: DevToys for local utility workflows, CyberChef for recipe chaining, regex101 for regex feedback, jwt.io for token inspection, crontab.guru for schedule explanation, and IT-Tools / formatter-class sites for broad utility coverage. enV now has a cohesive multi-Studio architecture and focused implementations, but there is **no verified claim** that this package matches every specialist feature, engine semantic, operation count, interface detail, or performance profile. In particular, CyberChef has a wider transformation catalog and regex101 has deeper engine-specific debugging/visualization. enV must be assessed with repeatable benchmark fixtures and complete platform CI before making comparative superiority claims.

## Required pre-release closeout

1. On Node.js 22 with network access, run a clean `npm ci`, confirm package-lock integrity, then rerun the 18 blocked route checks, full TypeScript typecheck/build, full tests, and the live Playwright browser/privacy/axe audit.
2. On a supported Android runner, execute `./gradlew testDebugUnitTest`, Android lint, and a release build; inspect mobile DevOps/Regex screens on a device/emulator.
3. On a supported macOS/Xcode runner, build the iOS target, run XCTest, and inspect native Regex Studio match overlays plus DevOps preset outputs.
4. Run a same-fixture comparative evaluation against current versions of competitors before making any superiority claim.
5. Review generated Dockerfiles against real project manifests and build them in isolated CI; these are starting points, not guaranteed drop-in production deployments.
