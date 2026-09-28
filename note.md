# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 16:06 UTC

**Status:** Category 1 (Calculators) is complete and deployed. Category 2 (Converters) has complete local browser coverage: all 142 active tools were exercised, with 138 passing in the first full sweep and the four initially failing tools passing after a confirmed engine fix. Category 2 and shared UI changes are **not yet committed or pushed**. The Expo/Android app is planned but not yet scaffolded.

## Completed — Category 1: Calculators

- Confirmed the production domain is [https://en-v-6h2l.vercel.app/](https://en-v-6h2l.vercel.app/) and the selected repository is `exploreofficialzz-star/enV` on `main`.
- Routing and strict blank-number validation fixes were pushed; the detail-route rendering bug is fixed.
- Gas Law, Molar Mass, Coordinate Geometry, Percentage, IRR, and audit-fixture fixes were verified and pushed in batches.
- Final real-browser production sweep: **221/221 active calculators passed**, with zero failed tools and zero browser errors. The final calculator batch was deployed; Vercel checks succeeded.
- The calculator audit harness covers valid inputs, blank/invalid input, result accuracy, selected known answers, IRR cash-flow sign cases, and Gas Law invalid-input cases.

## Completed — Category 2: Converters (local verification)

- Category 2 is the second entry in `src/data/categories.ts`. Inventory: **142 active tools** — 121 system converters, 20 file converters, and one number-base codec.
- A complete real-browser sweep exercised all 142 converter routes at a 390×844 mobile viewport. The initial result was 138 passes and four Data Transfer failures; the remaining tools completed, and the report had no browser-console/page errors.
- Root cause: unit lookup was case-insensitive even where unit IDs intentionally use case to distinguish bits from bytes (for example, `kbps` versus `kBps`). This made the engine return `1` instead of `8` for `1 kBps` to `kbps`.
- Fixed unit lookup to prefer exact IDs and use case-insensitive fallback only when the ID is unambiguous. Added unit-test coverage for all six case-sensitive bit/byte pairs and ambiguous fallback rejection.
- Re-ran the four affected tools through the browser after the fix — standard, table, quick, and comparison Data Transfer modes all passed (**4/4**). Combined with the 138 unaffected tools from the complete sweep, all **142 unique active converters are now verified**. The focused post-fix report had zero failures and zero browser errors.
- The Playwright harness waits for hydration through a real, reversible theme-toggle interaction, checkpoints each tool result, and verifies shared tool-page/header behavior.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:converters`, `npm run check:catalog`, `git diff --check`, and the Vercel/Nitro production build all passed after the fix. The bundler still emits non-fatal upstream TanStack `use client` directive warnings.

## Shared tool-page and mobile header changes

- Removed the globally rendered **How to use** and **Frequently asked questions** sections from the shared tool shell; retained **What this tool does**, disclaimers, and related tools.
- Removed the duplicate Favorites heart from the mobile header while retaining the desktop header Favorites link and the mobile bottom-navigation Saved tab.
- Real-browser UI smoke tests passed at mobile width (390px) on a unit converter, file converter, and number-base tool (**3/3**) and at desktop width (1024px) on a unit converter and number-base tool (**2/2**). The checks assert that help/FAQ headings are absent, the description remains, the mobile header heart is hidden, the Saved tab is visible, and the desktop header heart remains visible.
- These shared UI changes and Category 2 engine/harness/test changes remain local and uncommitted. The current local branch is `main`; before this batch is pushed, the local and remote branch tips are both `8eade77` (Category 1 closeout).

## Android / future iOS direction

- Selected architecture: **Expo / React Native** in a separate `apps/mobile` project, preserving the existing web app at the repository root because Vercel currently builds from that root.
- Planned implementation is a native Android application shell with a WebView for the existing enV web experience. This maximizes reuse of the current 3,639-tool product and leaves a shared Android/iOS path; it is not a claim that every tool has been reimplemented as native React Native screens.
- Official Expo documentation reviewed: [SDK reference](https://docs.expo.dev/versions/latest/) (identified SDK 57, React Native 0.86, React 19.2.3, and Node 22.13+), [monorepos](https://docs.expo.dev/guides/monorepos/), and [create a project](https://docs.expo.dev/get-started/create-a-project/). Verify actual generated package versions before locking dependencies.
- The sandbox has OpenJDK 21 but no configured Android SDK, `adb`, or standalone `gradle`; Android native project generation can be verified here, but a local APK build is not currently available to verify.

## Not done / deployment status

- Category 2 plus shared UI fixes have **not yet been committed or pushed**; no Vercel deployment of this batch has started.
- The complete Category 2 sweep was local. A production-domain Category 2 browser sweep and a production check of the screenshot-specific MD5 Hash Generator page remain to be run after deployment.
- The Android app, generated native `android/` project, app icons/configuration, and mobile setup documentation have not yet been created or validated.
- Categories after Converters remain unaudited. Category 3 is Developer; continue in the exact order in `src/data/categories.ts` after the current deployment and Android batch are closed.
- Navigation, Coming Soon states, downloads/exports, and tool-specific browser behavior across the remaining categories still require systematic audits.

## Next steps

1. Review the exact Category 2/shared UI diff, commit and push this verified batch, and wait for both Vercel status contexts to succeed.
2. Against the new live deployment, verify the MD5 Hash Generator screenshot route and run the Category 2 production browser sweep, including mobile/desktop shared UI checks.
3. Scaffold `apps/mobile` as a separate Expo/React Native app with a secure WebView shell, Android Gradle project files, future iOS configuration, app identity/assets, and clear local/EAS setup instructions; do not relocate the Vercel web root.
4. Run mobile lint/type/config checks and regenerate native Android files from the committed Expo config. Record the Android SDK limitation if APK compilation remains unavailable.
5. Commit/push the mobile app as a separate batch and verify that Vercel still builds the root web app successfully.
6. Once Category 2, shared UI, and mobile batches are closed, continue with Category 3 (Developer) and repeat listing → browser testing → fixing → pushing in order.
