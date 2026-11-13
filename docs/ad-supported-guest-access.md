# Hybrid ad-supported guest access

## Product rule

The hybrid economy applies only to tool IDs explicitly selected for the cohort.

- **Online:** a selected ad-supported tool can run for a guest only when the ad provider delivers a visible creative. If no ad fills, guests must sign in/create an account; signed-in users must have sufficient enV and the server must confirm a per-run debit before the tool executes.
- **Offline:** the same selected tool requires an authenticated enV account and a valid, pre-issued offline allowance. The allowance must be active, unexpired, and use the current offline pricing version. A failed/missing allowance rejects the operation before the tool computes or reveals a result.
- **Unselected tools:** retain their existing access and offline policy. The feature must not silently broaden to every local tool.

The selected hybrid cohort is intersected with `src/data/offline-eligible-tools.json`. Each candidate must already have a `local.*` billing profile and explicit `web`, `android`, and `ios` platform coverage. The Web, Android, and iOS execution boundaries all enforce the offline rule independently in their native implementation. This registry is exclusively an offline-wallet boundary; it must not be reused as the Adsterra ad allowlist.

## Safety defaults

Native AdMob advertising is **off by default** in Android and iOS builds until production publisher IDs, banner units and UMP privacy messaging are configured. Web Adsterra is a separate rollout: its production flag is enabled only for `envtools.store`, while requests remain gated by explicit visitor consent and same-origin availability. Never treat an Adsterra Web flag as proof that native AdMob is configured.

The selected-tool allowlist is the offline-access boundary only and is evaluated independently from ad rendering. Web Adsterra uses a separate policy for active, public, device-local tools across categories, excluding Studio, AI, Labs/Sandbox, the private A book notes workspace and restricted sensitive experiences. It does not require membership in the offline-wallet registry. A qualified guest must explicitly allow ads and receive a verified fill to execute. If the ad is declined, blocked or unfilled, the guest must sign in/create an account. Signed-in execution requires a server-side enV debit only when the tool has an approved fixed local billing profile; backend/cloud or measured-cost tools remain blocked until an authoritative price is available. These online access rules do not change offline allowance enforcement.

The following are not supplied by this repository and must not be fabricated:

- Google's final AdSense site approval and production serving eligibility;
- the production AdMob Android and iOS app IDs and banner unit IDs;
- the account's certified Google consent messages / CMP configuration;
- the exact authorized-seller line for `ads.txt`;
- the final list of tool IDs approved for ad funding.

## Web / AdSense configuration

The publisher supplied the AdSense publisher client ID `ca-pub-2492078126313994` and responsive display slot `5033935799` (`enV Responsive Tools`). Site ownership has been verified in AdSense and the site review has been requested. The shared document head exposes the client ID using Google’s supported `<meta name="google-adsense-account" content="ca-pub-2492078126313994">` verification method. The AdSense JavaScript library is loaded only after an eligible tool slot mounts, after its CMP callback has been registered, so the global script cannot mutate the page before React hydration.

The production Vercel project `env` has `VITE_ADSENSE_CLIENT_ID=ca-pub-2492078126313994` and `VITE_ADSENSE_TOOL_SLOT_ID=5033935799` configured. Serving remains explicitly disabled with `VITE_ADS_ENABLED=false` and `VITE_ADSENSE_PRIVACY_CONFIGURED=false`; the reviewed cross-platform tool allowlist is not yet configured. Keep AdSense Auto ads disabled: Auto ads can bypass the enV selected-tool placement allowlist.

Set these Vercel environment variables only for the production deployment after the provider and privacy configuration are ready:

| Variable | Required value |
|---|---|
| `VITE_ADS_ENABLED` | `false` until AdSense approval, CMP validation, and release checks are complete; production currently remains `false` |
| `VITE_ADSENSE_CLIENT_ID` | `ca-pub-2492078126313994` (configured for production) |
| `VITE_ADSENSE_TOOL_SLOT_ID` | `5033935799` (configured for production) |
| `VITE_AD_SUPPORTED_TOOL_IDS` | Not configured; set only to reviewed IDs in the canonical local/cross-platform registry |
| `VITE_ADSENSE_PRIVACY_CONFIGURED` | `false` until the published Google Privacy & Messaging / certified CMP configuration has been tested; production currently remains `false` |

The Web component requests non-personalized ads. That is not equivalent to “no cookies” or “no identifiers”; the disclosure explains that the provider can process request context and technical identifiers for delivery, fraud prevention, frequency capping, and reporting. Analytics consent and advertising consent are separate controls. When Google's Privacy & Messaging API is ready, the enV Privacy page exposes Google's documented consent-revocation entry point.

Do not turn on `VITE_ADSENSE_PRIVACY_CONFIGURED` merely to make ads render. Configure the messages and regions in the AdSense Privacy & Messaging console first. Where Google requires a certified CMP (including applicable EEA, UK, and Switzerland traffic), ensure its message and consent flow are actually published and test both consent and refusal paths.

## Android / AdMob configuration

The Android app uses Kotlin, Jetpack Compose, Google Mobile Ads Next-Gen SDK, and UMP. No WebView is used.

Gradle properties (for example in a protected release `gradle.properties` or CI secrets) are:

| Property | Required value |
|---|---|
| `envAdsEnabled` | `true` |
| `envAdsPrivacyConfigured` | `true` only after UMP messages are published and tested in AdMob |
| `envAdmobAppId` | Production Android app ID, format `ca-app-pub-################~##########` |
| `envAdmobBannerAdUnitId` | Production Android banner unit ID |
| `envAdSupportedToolIds` | The same reviewed comma-separated cohort as Web |

The checked-in app ID default is Google's Android **test app ID**. Ads remain disabled and the test banner unit is not configured. Replace it through protected build properties before any production ad release. The client refreshes UMP consent on launch, checks `canRequestAds`, hides slots without validated network, and exposes the required privacy-options form from Privacy when UMP says it is required.

## iOS / AdMob configuration

The iOS app uses Swift, SwiftUI, Swift Package Manager, Google Mobile Ads, and UMP. No web runtime or HTML ad container is used.

Set these Xcode User-Defined Build Settings in the protected release configuration:

| Build setting | Required value |
|---|---|
| `ENV_ADS_ENABLED` | `YES` |
| `ENV_ADS_PRIVACY_CONFIGURED` | `YES` only after UMP messages are published and tested in AdMob |
| `ENV_ADMOB_APP_ID` | Production iOS app ID |
| `ENV_ADMOB_BANNER_AD_UNIT_ID` | Production iOS banner unit ID |
| `ENV_AD_SUPPORTED_TOOL_IDS` | The same reviewed comma-separated cohort as Web and Android |

The checked-in iOS app ID is Google's iOS **test app ID** and the ad unit is blank; the feature defaults off. The app refreshes UMP consent at launch, waits for consent before initializing Google Mobile Ads, uses a native adaptive banner, and exposes the UMP privacy-options form on the Privacy page when required.

## Tool selection and privacy boundaries

For Web Adsterra, include suitable active, public, device-local tools across eligible categories; do not limit selection to calculators or intersect this policy with `offline-eligible-tools.json`. Exclude Studio workspaces, AI-related tools, Labs/Sandboxes, health, fitness, finance, earnings, personal-data, account, upload and backend-dependent tools. The tool must be auth-free for guest access and classified as device-local by the execution policy. Android/iOS AdMob eligibility uses its own native check and publisher configuration; it must not reuse the offline-wallet eligibility predicate.

## Online ad-fallback billing

- Web, Android and iOS treat actual ad fill as a delivery result; SDK/script initialization alone is not sufficient.
- The shared server quote validates the canonical tool, local billing profile, fixed per-unit rate and active status. The client cannot set the price or submit a balance.
- The server reserves and settles the enV amount through the existing immutable wallet ledger. Insufficient balances return a paywall result; guest requests cannot debit.
- `BILLING_AD_FALLBACK_ENABLED=false` is the fail-closed default. Do not enable until the tool-rate audit and Web/Android/iOS regression suite pass.
- The existing local per-unit profile is still provisional. Only tools with a fixed local profile can receive this fallback quote. Backend/cloud/measured-cost tools remain blocked until a measured quote is approved; no generic fee is invented.
- A valid offline allowance remains the only offline path. It is not inferred from ad-fill state and is not replaced by this online debit.

## Offline wallet boundary

The client-side gate only uses an existing selected, signed allowance and journals the operation. It does **not** enable the server-side production allowance issuance/settlement lock. Production issuance remains disabled pending independent device-integrity validation, authenticated allowance issuance, replay/recovery testing, approved pricing, and security review. Do not set `BILLING_OFFLINE_ENABLED` or `BILLING_OFFLINE_PRICING_APPROVED` here or in a deployment merely to test this feature.

Offline access is not “anonymous free use”: the selected tools reject execution when no valid allowance has already been prepared by an authenticated user. When online, the same local action stays guest-available and is not deducted from offline tokens.

## Ads.txt and release verification

The publisher-authorized seller record is committed at `public/ads.txt`:

```text
google.com, pub-2492078126313994, DIRECT, f08c47fec0942fa0
```

As of 2026-11-09, the verified GitHub `main` commit `b975bf1b774925e6b29325eadafe4b3e0e47551e` is serving `https://envtools.store/ads.txt` with HTTP 200 and the exact seller line above. The same READY Vercel deployment serves the homepage with the AdSense account verification meta tag. Its custom-domain alias points to deployment `dpl_HjSxtuSJQnmiMYbc1oSD92EQyNk3`, built from `main` at that commit. The Vercel deployment record still reports `target: null`, so this is a verified live custom-domain alias, not a deployment record marked as a production target. Verify the target and alias on the next Git-triggered `main` deployment before treating automatic production promotion as proven. Ad delivery remains disabled while Google's site review and the CMP/privacy release gates are pending.

Before launch, verify:

1. A Web guest can use an Adsterra-qualified tool only after explicit advertising consent and a visible creative fill. Declined, blocked or unfilled placements require sign-in; signed-in execution requires a server-confirmed enV debit only where an approved fixed local price exists. Backend/cloud tools without a measured quote stay blocked.
2. Web Adsterra scripts are not requested when disabled, unqualified, consent is missing/declined, or the application origin is unreachable. Verify eligibility is independent of offline-wallet enrollment.
3. Android and iOS use the same guest sign-in and signed-in enV fallback rule when their native ad SDK does not deliver an ad.
4. UMP consent/refusal and privacy-options paths work on both native platforms.
5. All three apps reject that tool offline without a selected, current allowance.
6. A valid allowance records one durable operation before the result appears, and sync/replay recovery is verified.
7. Non-selected local tools are unchanged.
8. No ads appear in full-screen mode, and no ad slot blocks tool use when no ad is returned.
9. The production publisher configuration, CMP messages, authorized-seller record, and app-store privacy declarations have been reviewed.

## Provider references

- [AdSense non-personalized ad guidance](https://support.google.com/adsense/answer/9007336?hl=en)
- [Google Privacy & Messaging JavaScript API and consent revocation](https://developers.google.com/funding-choices/fc-api-docs)
- [Google's CMP requirement for relevant EEA, UK, and Switzerland traffic](https://support.google.com/adsense/answer/13554116?hl=en)
- [AdSense ads.txt guidance](https://support.google.com/adsense/answer/9785052?hl=en)
- [Android Google Mobile Ads Next-Gen quick start](https://developers.google.com/ad-manager/mobile-ads-sdk/android/next-gen/quick-start)
- [Android UMP privacy setup](https://developers.google.com/admob/android/privacy)
- [iOS Google Mobile Ads quick start](https://developers.google.com/admob/ios/quick-start)
- [iOS UMP privacy setup](https://developers.google.com/admob/ios/privacy)
- [iOS banner implementation](https://developers.google.com/admob/ios/banner)

## Editorial AdSense page formats

The web editorial surfaces support three separately configured publisher units: an in-feed unit in the public Guides feed, an in-article unit after the second paragraph of the first eligible article section, and a Multiplex unit at the end of an article. Each has its own slot ID; the in-feed unit also requires the layout key generated by AdSense. The publisher tag is loaded only after the page is online and Google's Privacy & Messaging consent data is ready. Requests are made as non-personalized ads. Missing or malformed unit configuration omits that unit. These editorial placements do not alter tool execution, guest access, offline allowances, or token billing.

Required build-time variables: `VITE_ADSENSE_IN_FEED_SLOT_ID`, `VITE_ADSENSE_IN_FEED_LAYOUT_KEY`, `VITE_ADSENSE_IN_ARTICLE_SLOT_ID`, and `VITE_ADSENSE_MULTIPLEX_SLOT_ID`. Keep `VITE_ADS_ENABLED` and `VITE_ADSENSE_PRIVACY_CONFIGURED` false until the AdSense site review is approved and the published CMP has been verified end-to-end. Auto ads remain disabled during the controlled rollout.
