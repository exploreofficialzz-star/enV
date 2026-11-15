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

The following copy is written to describe the product's actual native/web split. It is a preparation draft, **not a published store listing**.

### Product identity

- Name: enV
- Website: https://envtools.store
- Support URL: https://envtools.store/contact
- Privacy policy URL: https://envtools.store/privacy
- Android application ID: com.chastech.env
- iOS bundle identifier: com.chastech.env

### Google Play draft

**Short description (69 of 80 characters):**

> Native tools for everyday tasks; web-only tools open in your browser.

**Full description:**

> enV brings practical tools for everyday tasks into native Android and iOS apps. Browse available calculators, converters, file and document utilities, QR and barcode tools, and creative and media tools. Tools with native support run inside the enV app; Web-only tools open in your system browser. Availability and capabilities vary by tool and platform. Check each tool's page for supported inputs, processing requirements, account needs and limits.

### Apple App Store draft

**Subtitle (24 of 30 characters):**

> Tools for everyday tasks

Use the same factual long description above, adapted only where App Store Connect fields require separate text. Do not add a keyword list of unsupported capabilities or imply that every web tool is implemented natively.

Google Play's current help pages specify a 30-character app-name limit, an 80-character short-description limit, and a 4,000-character full-description limit. Apple's App Store Connect reference specifies a 30-character app name and 30-character subtitle; Apple also identifies a privacy-policy URL as app information. Recheck the live forms when entering metadata because store requirements and review policies can change:
- Google Play listing fields: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play metadata policy and description guidance: https://support.google.com/googleplay/android-developer/answer/9898842
- Apple App Store Connect app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Apple product page guidance: https://developer.apple.com/app-store/product-page/

Do not finalize screenshots or preview videos from mockups. Use captures from the actual release builds on supported device sizes, and make sure every visible feature exists in the submitted native build.

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
