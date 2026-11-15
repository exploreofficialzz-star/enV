# enV native store and external discovery audit

**Audit date:** 15 November 2026  
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

## 2. Shared native catalogue reconciliation

The generated native inventory currently records:

- Expanded native catalogue records: **10,004**
- Engine families: **27**
- Android native coverage manifest: **7,902 unique tool IDs**
- iOS native coverage manifest: **7,902 unique tool IDs**
- Android/iOS manifest ID sets: **identical**

The matching ID sets are enforced by scripts/check-native-store-discovery.mjs and scripts/generate-seo-artifacts.mjs. Both applications consume the shared native catalogue export.

**Important interpretation:** these are generated catalogue and coverage-manifest counts. A listed tool ID is a declared native coverage entry; it does not prove a successful workflow on every Android/iOS version or physical device. Families with zero manifest entries remain visible in native-engine-inventory.json. Device-level acceptance still depends on the Android and iOS native test suites and representative real-device checks.

The SEO inventory now carries Android and iOS manifest membership per tool ID alongside the web runtime engine, status, route, canonical target/disposition, and guide-source classification. This makes catalogue differences visible without equating a manifest declaration with implementation proof.

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

The discovery work is being carried on the isolated branch `feat/complete-discovery-ws02-ws09-20261115`, based on main commit `a18c54df64f2cbb0c51413df0824b381458b850a`. The branch was 47 commits ahead and zero commits behind at the time of this snapshot; it had not been merged.

The connected Vercel project produced a READY preview for commit `6929b9935621e5cd7e69ed7e9216f9a0d0a6a7cb` (`env-pjgfy1c21-en-v1.vercel.app`). Its build log shows the native catalogue export and native store identity audit passing, with 10,004 expanded records, 27 engine families and matching 7,902-ID Android/iOS coverage manifests. The production build and postbuild completed; postbuild verified the existing runtime catalogue fingerprint `v58f9a538e469` with 9,976 list entries, 9,976 search entries and 40 detail shards.

That preview predates later Celebration guide and test-contract edits on the branch. It therefore verifies the catalogue/export/SEO-generation build at commit 6929, not the newest branch head. A fresh test/build of the latest branch state remains required before merge. The preview is not production: the canonical production aliases still pointed to the READY main deployment when checked.

Social preview generation, guide contracts and newer documentation must be verified on the newest branch commit before being declared complete. The account-level gates in Section 7 remain open regardless of a successful source build.
