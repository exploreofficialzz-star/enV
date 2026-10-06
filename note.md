# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 17:06 UTC

## Status at a glance

| Workstream | Status | Evidence |
|---|---|---|
| Category 1 — Calculators | Complete and deployed | 221/221 production browser checks passed; no failed tools or browser errors. |
| Category 2 — Converters and shared tool UI | Complete and deployed | Commit `c240eee` is on `main`; 142/142 live browser checks passed; Vercel checks succeeded. |
| Android GitHub Actions build | Added locally, not yet pushed or run | `.github/workflows/android-build.yml` builds a debug APK and an unsigned release AAB, then uploads both artifacts. |
| GitHub Actions / APK / AAB / Vercel verification for the mobile batch | Pending | Requires the native-app commit to be pushed and remote jobs to finish. |

Category audits remain sequential. After the Android release batch is pushed and verified, resume at Category 3 — Developer, following `src/data/categories.ts`.

## Category 1 — Calculators

The final real-browser production sweep passed all **221/221** active calculator tools with zero failures and zero browser errors. The audit fixed route rendering, strict empty-number validation, and defects in Percentage, Gas Law, Molar Mass, Coordinate Geometry, and IRR. The production fixes and closeout record are already on `main`, and their Vercel checks succeeded.

## Category 2 — Converters and shared tool UI

Category 2 contains 142 active tools: 121 system converters, 20 file converters, and one number-base codec. The full live sweep initially exposed four Data Transfer errors because case-insensitive unit lookup conflated case-sensitive bit and byte identifiers. Exact-match-first lookup with an ambiguity-safe fallback fixed the defect; focused rechecks passed, then the production sweep passed **142/142** tools at 390×844 with no browser errors. Regression tests cover the affected units. The completed batch is commit `c240eee` on `main`; both Vercel status contexts succeeded. Its production report is in this sandbox at `/tmp/env-converter-category02-production-final.json`.

The shared tool shell no longer renders “How to use” or FAQ sections. The duplicate mobile-header Favorites heart is hidden; the bottom Saved tab and desktop Favorites shortcut remain. Mobile and desktop real-browser checks passed. A production browser check of the screenshot’s MD5 tool also confirmed the retained description, the UI changes, and a hash result matching Node’s independent `crypto` reference.

## Android app and future iOS target



The generated test APK uses an ephemeral debug keystore created by CI; the keystore is ignored and is not committed. Release signing is intentionally not configured with the public debug key. The CI AAB is therefore **unsigned and for build validation only**, not ready for Google Play. Production signing requires a separate keystore and protected secrets.

## Android workflow and local validation


Completed local checks: clean `npm ci` (including reapplying the query-string compatibility patch), `npx expo install --check`, full `npm audit` with **zero vulnerabilities**, mobile lint, `npm run check:mobile` (typecheck plus all 44 Android files), clean Android prebuild with the persistent signing plugin, and `npx expo export --platform android` (1,259 modules bundled; 2.7 MB Hermes bundle). Workflow YAML, triggers, read-only permissions, and artifact paths were parsed and checked. The root web suite also passed `npm test`, lint, typecheck, converter catalog checks, `git diff --check`, and the production build. The build emitted nonfatal third-party “use client” directive warnings but completed successfully. No APK or AAB has been built yet because the local Android SDK is unavailable.

## Dependency security

The original mobile dependency audit found moderate advisories in `decode-uri-component` (GHSA-vcc3-ghjq-m6fr, affected `<=0.4.2`) and `uuid` (GHSA-w5hq-g745-h8pq, affected `<11.1.1`). The lockfile now overrides these to `decode-uri-component@0.5.0` and `uuid@11.1.1`; a patch-package compatibility fix adapts query-string 7 to the fixed decoder’s ESM default export. Valid/malformed URL parsing and UUID generation are exercised by the mobile project checker. A clean install and repeat full audit both pass with zero advisories.

## References


## Next steps

1. Review and stage the exact mobile, generated Android, workflow, README, and note changes; confirm no debug keystore, secret, or ignored build output is staged.
2. Commit and push the batch to `main`.
3. Verify the actual GitHub Actions run succeeds and contains both APK and AAB artifacts. If the build fails, correct the issue and push a verified follow-up.
4. Verify Vercel’s production build for the same pushed commit, then record the exact commit, workflow result, and artifact links here and push the final note update.
5. Resume the sequential browser audit at Category 3 — Developer.
