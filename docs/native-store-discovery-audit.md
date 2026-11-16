# enV native store and external discovery audit

**Audit date:** 16 November 2026  
**Canonical product name:** enV  
**Publisher / parent company:** chAs Technologies LLC  
**Canonical website:** https://envtools.store  
**Scope:** Source-level native app identity, shared catalogue parity, store metadata preparation, and externally observable search evidence.

This document separates repository evidence from store-console and search-provider evidence. A build setting, coverage manifest, crawl permission, search result, or generated page is not proof that an app is published or that a page is indexed.

## 1. Native identity and cross-surface facts

| Property | Android | iOS | Result |
|---|---|---|---|
| App display name | enV (AndroidManifest.xml) | enV (Info.plist) | Match |
| Native application identifier | com.chastech.env | com.chastech.env | Match |
| Canonical website | https://envtools.store | https://envtools.store | Match |
| Web-only tool behavior | Opens in the system browser | Opens in the system browser | Described consistently by the shared platform handoff page |
| Current source release version | 1.1.1 | 1.1.0 | Different |
| Current source build number | 7 | 6 | Different |

The Android and iOS release version/build values are maintained in their separate native project files. This audit does not rewrite either value: an App Store or Play release may already have a higher version that is not visible from repository source. Confirm the current store version before preparing a submission. Do not infer release order or availability from the source version alone.

The web platform handoff page states that the native app remains native, that tools with native support continue in the app, and that Web-only tools open in the system browser. The Android and iOS landing routes have separate canonical URLs:
- https://envtools.store/platform/android
- https://envtools.store/platform/ios

## 2. Shared catalogue and native execution reconciliation

The completed discovery export and native-matrix workflow at PR #154 audit head 5190a486788ee1a9ec6ac25db4aa1fed8df3da86 reconciled the shared base catalogue, the Web runtime registry, searchable discovery and the Android/iOS execution matrix by stable tool ID.

| Inventory surface | Records | Active / beta | Planned | Meaning |
|---|---:|---:|---:|---|
| Shared source catalogue export | 10,001 | 9,741 | 260 | Base records emitted to apps/shared/catalog.json |
| Web runtime registry | 10,013 | 9,753 | 260 | Base records plus 12 runtime-only extension records |
| Searchable discovery registry | 9,978 | — | — | Search-facing records; not a substitute for the full runtime count |
| Category definitions | 43 | 42 populated | 1 empty | generators has no current runtime tool records |
| Native execution matrix | 10,013 | 9,753 | 260 | One matrix row for every runtime ID |

The reconciled native execution matrix classifies the active runtime records as:

- **7,909 offline-native** on both Android and iOS.
- **1,566 backend-native** on both Android and iOS.
- **278 Web-only** on both native products, with explicit disposition reasons.
- **0 active Android/iOS classification divergences.**
- **9,475 of 9,753 active records** have a matching native or backend execution path in both native products.

The per-platform combined explicit native coverage-manifest sets contain **7,933 unique IDs**. The matrix classifications are not a simple count of manifest lines: backend execution is also inferred from the registered backend engine/category policy in scripts/export-native-execution-matrix.mjs. The matrix checker verifies that all 10,013 runtime IDs appear exactly once and that the 278 Web-only records remain explicitly classified rather than silently omitted.

The catalogue source count and runtime count intentionally differ: the runtime registry adds 12 separately registered extensions, with no base-catalogue IDs missing from the runtime. The searchable registry exposes a separate virtual Studio surface. It contains 9,964 records shared with the runtime plus 14 virtual Studio records that are present in searchable discovery but not in getAllTools(). Conversely, 49 runtime records do not appear in search: 48 generated Accessibility action variants and the legacy audio-analyze-studio alias. The net difference is 35 fewer searchable records than runtime records (49 excluded minus 14 virtual Studio additions); it is not the count of hidden tools. The ledger records the full ID lists so additions, exclusions and aliases remain auditable without double-counting the canonical Studio destinations.

**Important interpretation:** a coverage manifest or matrix classification is source-level execution routing evidence, not proof that every tool was independently accepted on a real Android/iOS device. The current per-tool ledger reports zero full tool verifications and zero per-tool native execution attestations. Platform CI passing does not turn 9,475 matrix rows into 9,475 independent native acceptance tests. Device-level acceptance still needs tool-specific operation evidence and representative real-device checks.

The per-tool ledger also records source/runtime/search count reconciliation, category population, stable IDs, route identity, engine declaration, native-manifest membership, current-commit browser evidence and historical evidence separately. The current ledger artifact contains 103 per-tool browser records (93 Celebrations, 3 QR/barcode, 6 File Workspace and 1 ZIP); the new File-to-TXT local-extraction browser audit has been added to the next current-head run and is not counted until its commit-bound report passes. These records cover only the controls and outputs explicitly named in each audit; they do not fully verify every boundary case or native implementation.

## 3. Store listing metadata prepared for review

The source of truth is `docs/native-store-listing.json`. It contains a structured draft for the Android and iOS listings, including platform-specific text, categories, keywords, support/privacy URLs and explicit asset/publication states. The repeatable audit in `scripts/check-native-store-discovery.mjs` validates app identity, field limits, canonical support/privacy links, and that the draft stays unpublished until actual store-account evidence exists.

| Field | Google Play draft | Apple App Store draft |
|---|---:|---:|
| Product name | enV (3/30 characters) | enV (3/30 characters) |
| Short description | 77/80 characters | — |
| Subtitle | — | 24/30 characters |
| Promotional text | — | 95/170 characters |
| Full description | 831/4,000 characters | 793/4,000 characters |
| Keywords | — | 76/100 UTF-8 bytes |
| Primary category | Tools | Utilities |
| Secondary category | — | Productivity |
| App identity | `com.chastech.env` | `com.chastech.env` |

The copy explains that Android and iOS are native products, native-ready tools remain in the native application, and Web-only tools open separately in the system browser. It does not imply that all Web tools are implemented natively or that the entire app works offline. The copy describes processing as operation-dependent and directs users to each tool's own capability/processing notice.

- Website: https://envtools.store
- Support URL: https://envtools.store/help
- Privacy policy URL: https://envtools.store/privacy
- Android application ID: `com.chastech.env`
- iOS bundle identifier: `com.chastech.env`

**Source-field checks (15 November 2026):** Google Play lists a 30-character app-name limit, 80-character short-description limit and 4,000-character full-description limit. Its current metadata guidance also says the description should accurately and clearly explain the app, avoid unnecessary repetition, and not use misleading or irrelevant claims. Apple lists a 30-character app name and 30-character subtitle; platform-version metadata includes promotional text up to 170 characters, a 4,000-character description and up to 100 bytes of keywords. The actual listing draft and validator use these limits rather than unbounded copy:
- Google Play field definitions: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play description best practices: https://support.google.com/googleplay/android-developer/answer/13393723
- Google Play metadata policy: https://support.google.com/googleplay/android-developer/answer/9898842
- Apple App Store app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Apple platform-version information: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Apple product-page guidance: https://developer.apple.com/app-store/product-page/

The keyword field is a relevance aid, not a licence to add unrelated terms or other app/company names. Do not assume that the draft is compliant with every country-specific legal or review requirement simply because its text fits the field counters. Recheck the live store forms immediately before submission.

**Assets remain unverified.** Store screenshots and preview video must be captured from actual Android/iPhone release builds at the required device sizes. Do not submit Web product screenshots or generated social-card images as native-app screenshots, and do not show features that are missing from the submitted native binary. The JSON draft marks both platforms' asset readiness as not verified.

**Publication remains unverified.** Both `listingUrl` values are intentionally `null`; the metadata status is `draft-not-submitted`. Do not create guessed store links or install buttons before a real Play Console/App Store Connect product page has been confirmed.

## 4. Public listing verification status

No verified Google Play or Apple App Store product-page URL was available from the connected source/account evidence during this audit.

The following public search checks were attempted on 15 November 2026:
- site:play.google.com/store/apps/details "com.chastech.env" OR "chAs Technologies LLC" enV
- site:apps.apple.com "com.chastech.env" OR "chAs Technologies LLC" enV
- Searches for com.chastech.env and enV with the publisher identity.
- Direct retrieval attempts for the expected Google Play package URL and an Apple App Store search URL.

Those retrievals did not return a confirmed matching app listing; the direct URLs were not accessible through the available public retrieval path. This is **not proof that either listing is unpublished**. The authoritative status must be checked in the owner's Google Play Console and App Store Connect accounts. Do not create guessed store links or show install buttons until the real listing URLs are confirmed.

The current website platform pages describe browser handoff and do not expose unverified store-install links. Keep this behavior rather than directing users to a guessed package URL.

## 5. External search/discovery evidence

Public research was performed on 15 November 2026. It is a discovery snapshot, not a ranking or traffic baseline.

The search result set surfaced several relevant product-directory patterns:
- [AnyTools](https://anytools.world/en/tools) presented 131 tools across 4 languages and grouped tools into clear task categories. Its page emphasizes privacy/local processing and task-specific descriptions.
- [MayOnlineTools](https://mayonlinetools.com/ng/) presented a 234-tool directory with visible category groupings and a searchable catalogue.
- [env.dev](https://env.dev/tools) presented a developer-focused directory with 42 tools, category filters and descriptions that identify local/browser processing for relevant tools.
- [Envvip Tools](https://envvip.com.ng/) presented a smaller directory with 30+ free tools grouped by task.

These references support a practical discovery pattern for enV: searchable catalogues, clear category groupings, unique task-first tool explanations, truthful processing disclosures, and visible native-versus-Web distinctions. Counts and positioning above are observations from the retrieved pages on the audit date, not verified market-share or quality rankings.

Exact-domain searches for site:envtools.store and branded enV tool queries did not surface a matching enV result in the available search result set. Search results also included unrelated products with similar names (for example env.dev); do not confuse those domains with envtools.store. A limited search result set is not sufficient to conclude that the site is absent from every search engine or location.

## 6. Webmaster and IndexNow evidence

The connected Vercel project metadata reports envtools.store, android.envtools.store, and ios.envtools.store as verified custom domains attached to the enV project. The existing production deployment from main was READY when checked. Domain attachment and deployment readiness do not prove that a search engine has indexed any route.

The Production environment contains a sensitive INDEXNOW_KEY variable. Its value was not decrypted or displayed. INDEXNOW_SUBMIT_ALL is not configured, which avoids routine full-site resubmission. However:
- The key file has not been independently confirmed through a successful public fetch in this audit.
- No successful IndexNow endpoint receipt was available as evidence here.
- A submitted URL list would not prove crawling or indexing.
- Google Search Console and Bing Webmaster Tools remain separate verification and measurement tasks.

The connected Vercel project did not contain VITE_GOOGLE_SITE_VERIFICATION or VITE_BING_SITE_VERIFICATION when checked. No authenticated Google Search Console or Bing Webmaster Tools account evidence was available. Do not report either property as verified or its sitemap as processed.

## 7. Release blockers and next evidence

| Gate | Evidence required to close it |
|---|---|
| Google Play listing | Play Console app record, public listing URL, approved name/short/full descriptions, screenshots, support/privacy URLs and release status |
| Apple App Store listing | App Store Connect app record, public listing URL, approved name/subtitle/description/keywords, screenshots, support/privacy URLs and release status |
| Version alignment decision | Compare current store versions with Android 1.1.1 (7) and iOS 1.1.0 (6); choose per-platform release values deliberately |
| Google Search Console | Verified Domain property, submitted sitemap status, representative URL Inspection and baseline reports |
| Bing Webmaster Tools | Verified site, processed sitemap and crawl/index reports |
| IndexNow | Public key-file response matching the configured key and a recorded HTTP response from an actual production notification |
| Social preview services | Public fetches and platform-tool results from Facebook Sharing Debugger, LinkedIn Post Inspector and X card validation |
| Native parity | Passing Android/iOS native tests plus representative physical-device checks; manifest parity alone is not sufficient |

Do not treat source changes, the existence of an application ID, a generated catalogue, a sitemap entry, or a READY deployment as proof of a public store listing, indexing, user adoption or device-level feature parity.

## 8. Implementation and verification snapshot

This source snapshot is commit `f2055f3f989eebf50453d94cb4db8581ac564553` on the isolated branch `feat/complete-discovery-ws02-ws09-20261115`, based on main commit `a18c54df64f2cbb0c51413df0824b381458b850a`. That comparison showed 66 commits ahead and 0 behind. Subsequent commits added the Celebration renderer-map contract and expanded the live SEO smoke sample for Creator and Celebration routes. The branch remains ahead of main, 0 commits behind, and has not been merged.

The newest READY preview is `env-pjgfy1c21-en-v1.vercel.app` at commit `6929b9935621e5cd7e69ed7e9216f9a0d0a6a7cb`. That build passed the native catalogue export and native identity audit: 10,004 expanded native records, 27 engine families, matching 7,902-ID Android/iOS manifests, and the application identity checks. The production build and postbuild completed; the runtime catalogue check verified fingerprint `v58f9a538e469` with 9,976 list entries, 9,976 search entries and 40 detail shards.

**That READY preview is not the latest branch revision.** A later preview attempt at commit `b53f8b26f4f715dd63c00a13b25353963ed2999e` failed during SEO generation because the full-inventory table header was missing a comma. That was corrected at commit `b088b7d720766ec2e5f31e3cc6d727fb2d66b0cb`, and subsequent source checks/route contracts have been updated again. No successful Vercel preview exists for the latest source snapshot. The current commit status still shows the Vercel build-rate-limit failure; no further build was forced while the source audit was still in progress.

The new `test:discovery` script is part of the single Vercel prebuild sequence. It runs generated SEO/social-card/IndexNow checks, the full public tool-documentation contracts, Celebration utility tests (including the 93 supported IDs and HTML/time-zone/RSVP/photo/quiz validation), and the exact 93-ID generic-workflow policy check. Those tests are configured but have not yet been executed on the latest source snapshot.

The READY preview is a preview deployment, not production. The canonical production aliases still point to the existing READY main deployment. The external account-level gates in Section 7 remain open regardless of source build results.
