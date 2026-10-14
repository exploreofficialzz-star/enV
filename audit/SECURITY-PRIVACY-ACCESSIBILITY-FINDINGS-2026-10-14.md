# Security, Privacy & Accessibility Findings — Round 6 continuation

**Date:** 14 October 2026

## Privacy

- All Developer formatter / parser / regex / hash / encoding tools are documented and implemented as client-side / local-processing.
- Static tripwire (`scripts/check-developer-privacy` family) scans guarded engine and UI paths for forbidden network primitives and payload-history storage. PASS in prior Round 6 verification.
- Browser audit script injects synthetic sentinels and asserts no egress in request URL/body, no leakage into localStorage/sessionStorage/IndexedDB/cookies/Cache Storage.
- Live network-capture privacy proof against a deployed instance is still outstanding.

## Security

- XML paths (Web preflight, Android JAXP, iOS FoundationXML) explicitly reject DOCTYPE and disable external entity / XInclude / external DTD resolution where the platform API permits.
- Input size caps (1 MB) applied before parser invocation.
- Worker-based execution for Web formatters provides hard timeout and cancellation, mitigating ReDoS-style hangs for the supported parser set.
- sql-formatter and Prettier are MIT-licensed; lockfile integrity now present for sql-formatter.
- Backend base URL remains the existing configured value; no secrets are committed.
- Content-Security-Policy and CORS generators exist as deterministic local tools; they produce guidance, not production middleware.

## Accessibility

- Accessibility parity check (37 required rule keys + report contract) present across TypeScript / Kotlin / Swift.
- Browser audit includes axe-core serious/critical failure gate and 390×844 horizontal overflow check.
- Live axe run against the built application is still required.

## Known limitations (documented, not defects)

- Native (Kotlin/Swift) SQL/CSS/HTML/JS/YAML formatters are conservative lexical implementations, not full grammar parsers.
- Web XML uses structural preflight + HTML printer; it is not a complete XML 1.0 processor.
- Regex cancellation guarantees differ by platform; only the Web Worker path provides a hard kill.

## Residual actions

1. Execute the Playwright + axe CI job after `npm ci` and build.
2. Confirm no sensitive payloads appear in production logs or analytics.
3. Re-validate Android network-security-config and iOS App Transport Security settings on device builds.

EOF