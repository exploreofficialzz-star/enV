# Hybrid ad-supported guest access

## Product rule

The hybrid economy applies only to tool IDs explicitly selected for the cohort.

- **Online:** a selected access-gated tool can be used by a guest only through the ad-supported path: explicit advertising consent, then a user-initiated rewarded ad that Google confirms was granted and completed. A banner impression, banner click or Smartlink open never unlocks the tool. A guest who declines or cannot complete the ad must create/sign in to an enV account. A signed-in user can choose a token-backed, ad-free session only when that exact tool has a manually approved price. The server reserves that per-tool price and settles it only after a successful tool result; failed or abandoned runs release the reservation. No provisional price is charged.
- **Offline:** the same selected tool requires an authenticated enV account and a valid, pre-issued offline allowance. The allowance must be active, unexpired, and use the current offline pricing version. A failed/missing allowance rejects the operation before the tool computes or reveals a result.
- **Unselected tools:** retain their existing access and offline policy. The feature must not silently broaden to every local tool.

The selected hybrid cohort is intersected with `src/data/offline-eligible-tools.json`. Each candidate must already have a `local.*` billing profile and explicit `web`, `android`, and `ios` platform coverage. The Web, Android, and iOS execution boundaries all enforce the offline rule independently in their native implementation. This registry is exclusively an offline-wallet boundary; it must not be reused as the Adsterra ad allowlist.

## Safety defaults

Native Google Mobile Ads placements are **off by default** in Android and iOS builds until the production AdMob app ID/banner unit, Google Ad Manager rewarded unit path, and UMP privacy messaging are configured. Web Adsterra is a separate rollout: its production flag is enabled only for `envtools.store`, while requests remain gated by explicit visitor consent and same-origin availability. Never treat an Adsterra Web flag as proof that native AdMob is configured.

The selected-tool allowlist is the offline-access boundary only and is evaluated independently from ad rendering. Web Adsterra banner placements use their own eligibility policy for active ordinary tools, excluding Studio, AI, Labs/Sandbox and restricted sensitive experiences. The rewarded access gate has a separate, explicit VITE_AD_ACCESS_TOOL_IDS allowlist and is disabled unless the rewarded ad unit and Google privacy messaging are configured. Adsterra banners and Smartlink do not count as rewarded views. A guest who declines advertising or cannot complete the rewarded ad must sign in; a signed-in user must use the exact tool's approved token price. If a reviewed price is absent, the server rejects token access and does not charge. These online access rules do not change offline allowance enforcement.

The following are not supplied by this repository and must not be fabricated:

- Google's final AdSense site approval and production serving eligibility;
- the production AdMob Android and iOS app IDs and banner unit IDs;
- the account's certified Google consent messages / CMP configuration;
- the exact authorized-seller line for `ads.txt`;
- the final list of tool IDs approved for ad funding.

## Web / AdSense configuration

The publisher supplied the AdSense publisher client ID `ca-pub-2492078126313994` and responsive display slot `5033935799` (`enV Responsive Tools`). Site ownership has been verified in AdSense and the site review has been requested. The shared document head exposes the client ID using Google’s supported `<meta name="google-adsense-account" content="ca-pub-2492078126313994">` verification method. The AdSense JavaScript library is loaded only after an eligible tool slot mounts, after its CMP callback has been registered, so the global script cannot mutate the page before React hydration.

The production Vercel project `env` currently has `VITE_ADS_ENABLED=true`, `VITE_ADSENSE_PRIVACY_CONFIGURED=true`, `VITE_ADSENSE_CLIENT_ID`, and `VITE_ADSENSE_TOOL_SLOT_ID` configured. These are existing Web advertising settings, separate from rewarded access. The production project does **not** currently have `VITE_AD_ACCESS_GATE_ENABLED`, `VITE_AD_ACCESS_TOOL_IDS`, or `VITE_GAM_REWARDED_AD_UNIT_PATH`, so the new rewarded access gate remains off. Existing AdSense or Adsterra flags must never be treated as permission to turn on rewarded gating. Keep AdSense Auto ads disabled: Auto ads can bypass the enV selected-tool placement allowlist.

These existing values are configured in production. Treat the separate rewarded-gate variables as a distinct rollout and do not add them until the publisher account, selected-tool allowlist, and CMP path are approved:

| Variable | Required value |
|---|---|
| `VITE_ADS_ENABLED` | `true` in current production for the existing Web advertising placements; not the rewarded access-gate flag |
| `VITE_ADSENSE_CLIENT_ID` | `ca-pub-2492078126313994` (configured for production) |
| `VITE_ADSENSE_TOOL_SLOT_ID` | `5033935799` (configured for production) |
| `VITE_AD_SUPPORTED_TOOL_IDS` | Not configured; set only to reviewed IDs in the canonical local/cross-platform registry |
| `VITE_ADSENSE_PRIVACY_CONFIGURED` | `true` in current production; continue validating the published Google Privacy & Messaging / certified CMP configuration independently |

The Web component requests non-personalized ads. That is not equivalent to “no cookies” or “no identifiers”; the disclosure explains that the provider can process request context and technical identifiers for delivery, fraud prevention, frequency capping, and reporting. Analytics consent and advertising consent are separate controls. When Google's Privacy & Messaging API is ready, the enV Privacy page exposes Google's documented consent-revocation entry point.

Do not turn on `VITE_ADSENSE_PRIVACY_CONFIGURED` merely to make ads render. Configure the messages and regions in the AdSense Privacy & Messaging console first. Where Google requires a certified CMP (including applicable EEA, UK, and Switzerland traffic), ensure its message and consent flow are actually published and test both consent and refusal paths.

## Rewarded-ad access and three-view offer

Web rewarded ads use Google Publisher Tag (Google Ad Manager), not the existing Adsterra banners or Smartlink. The production `env` project currently has none of the three rewarded-gate settings configured: `VITE_AD_ACCESS_GATE_ENABLED`, `VITE_AD_ACCESS_TOOL_IDS`, and `VITE_GAM_REWARDED_AD_UNIT_PATH`. Keep the gate off until a publisher-generated rewarded unit path and the exact reviewed tool allowlist are available and Google Privacy & Messaging has been published and tested. The same-origin page must also retain its valid `VITE_ADSENSE_CLIENT_ID` and `VITE_ADSENSE_PRIVACY_CONFIGURED=true` CMP-ready configuration.

A rewarded view counts only after GPT emits both rewardedSlotGranted and rewardedSlotVideoCompleted for the same slot. Before requesting the slot, the Web flow also waits for the Google consent-mode decision, checks US state opt-out data when applicable, and requires Google's ad-blocker status to resolve to no blocker. Declined/unknown consent, a privacy opt-out, an active ad blocker, or an unknown blocker state does not request an ad; a guest must sign in instead. rewardedSlotClosed alone, a fill/impression, a click, a banner, or an Adsterra Smartlink does not count. After three such completions within a rolling 30-day window, enV shows the ad-free token offer once for that window. The completion count is stored locally on the browser/device (Web localStorage, Android app-private preferences, iOS UserDefaults); it does not create account token credits or discounts. The ads-versus-tokens preference is stored per tool on that device. It only selects the preferred route and never bypasses login, an approved price, or explicit token confirmation.

The native apps use Google Mobile Ads rewarded callbacks (Android Kotlin, iOS Swift) with Google Ad Manager rewarded unit paths and explicit UMP consent. Android uses the Next-Gen `AdRequest.Builder(adUnitId)` API; iOS uses `AdManagerRequest()`. Native AdMob banner units remain a separate configuration and never count as rewarded views. Use Google's dedicated test GAM rewarded path `/21775744923/example/rewarded` during development, then replace it with the publisher's production GAM path before release.

Paid access uses the separate manual approval registry at `src/data/billing-tool-access-approvals.json`. It currently contains 267 approved cross-platform local-calculator prices at 100 subunits (0.1 enV token) per calculation, version `env-tool-access-local-calculator-v1`. This is the existing local calculator tariff, not a blanket price for the catalogue: tools outside those exact approvals remain unpriced and receive `TOOL_PRICE_NOT_APPROVED` with no reservation or deduction. Generated provisional profiles are never used as paid prices. The server determines the immutable amount, reserves funds before unlocking, settles the reserved amount only after a successful tool result, and releases it on cancellation, failure, or abandonment. Client-supplied prices are never accepted.

## Android / AdMob configuration

The Android app uses Kotlin, Jetpack Compose, Google Mobile Ads Next-Gen SDK, and UMP. No WebView is used.

Gradle properties (for example in a protected release `gradle.properties` or CI secrets) are:

| Property | Required value |
|---|---|
| `envAdsEnabled` | `true` |
| `envAdsPrivacyConfigured` | `true` only after UMP messages are published and tested in AdMob |
| `envAdmobAppId` | Production Android app ID, format `ca-app-pub-################~##########` |
| `envAdmobBannerAdUnitId` | Production Android banner unit ID |
| `envGamRewardedAdUnitPath` | Production Google Ad Manager rewarded unit path, format `/network-id/ad-unit` (not an AdMob `ca-app-pub-...` ID) |
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
| `ENV_GAM_REWARDED_AD_UNIT_PATH` | Production Google Ad Manager rewarded unit path, format `/network-id/ad-unit` (not an AdMob `ca-app-pub-...` ID) |
| `ENV_AD_SUPPORTED_TOOL_IDS` | The same reviewed comma-separated cohort as Web and Android |

The checked-in iOS app ID is Google's iOS **test app ID** and the ad unit is blank; the feature defaults off. The app refreshes UMP consent at launch, waits for consent before initializing Google Mobile Ads, uses a native adaptive banner, and exposes the UMP privacy-options form on the Privacy page when required.

## Tool selection and privacy boundaries

For Web Adsterra, include suitable active, public, device-local tools across eligible categories; do not limit selection to calculators or intersect this policy with `offline-eligible-tools.json`. Exclude Studio workspaces, AI-related tools, Labs/Sandboxes, health, fitness, finance, earnings, personal-data, account, upload and backend-dependent tools. The tool must be auth-free for guest access and classified as device-local by the execution policy. Android/iOS AdMob eligibility uses its own native check and publisher configuration; it must not reuse the offline-wallet eligibility predicate.

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

1. A Web guest can use a rewarded-access tool only after explicitly allowing advertising and completing the rewarded video; declining or failing the provider request presents sign-up/sign-in or approved token access.
2. Web Adsterra scripts are not requested when disabled, unqualified, consent is missing/declined, or the application origin is unreachable. Verify eligibility is independent of offline-wallet enrollment.
3. Android and iOS guest can run the same selected tool while online without sign-in.
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
