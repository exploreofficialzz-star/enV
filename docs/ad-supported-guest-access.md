# Hybrid ad-supported guest access

## Product rule

The hybrid economy applies only to tool IDs explicitly selected for the cohort.

- **Online:** a selected tool is publicly usable without enV sign-in. Ads are an optional funding placement below the tool interface. Tool execution does not depend on an ad being filled or clicked.
- **Offline:** the same selected tool requires an authenticated enV account and a valid, pre-issued offline allowance. The allowance must be active, unexpired, and use the current offline pricing version. A failed/missing allowance rejects the operation before the tool computes or reveals a result.
- **Unselected tools:** retain their existing access and offline policy. The feature must not silently broaden to every local tool.

The selected hybrid cohort is intersected with `src/data/offline-eligible-tools.json`. Each candidate must already have a `local.*` billing profile and explicit `web`, `android`, and `ios` platform coverage. The Web, Android, and iOS execution boundaries all enforce the offline rule independently in their native implementation.

## Safety defaults

Advertising is **off by default** in Web, Android, and iOS builds. Blank provider IDs, blank allowlists, or an unconfigured privacy flag fail closed. Do not enable the feature until you have completed the relevant publisher account setup, privacy messaging, test-device setup, and release review.

The following are not supplied by this repository and must not be fabricated:

- the approved AdSense site / publisher account and responsive display unit;
- the production AdMob Android and iOS app IDs and banner unit IDs;
- the account's certified Google consent messages / CMP configuration;
- the exact authorized-seller line for `ads.txt`;
- the final list of tool IDs approved for ad funding.

## Web / AdSense configuration

Set these Vercel environment variables only for the production deployment after the provider and privacy configuration are ready:

| Variable | Required value |
|---|---|
| `VITE_ADS_ENABLED` | `true` |
| `VITE_ADSENSE_CLIENT_ID` | Actual `ca-pub-...` publisher client ID |
| `VITE_ADSENSE_TOOL_SLOT_ID` | Actual numeric display-ad slot ID |
| `VITE_AD_SUPPORTED_TOOL_IDS` | Comma-separated IDs reviewed against the local/cross-platform registry |
| `VITE_ADSENSE_PRIVACY_CONFIGURED` | `true` only after the Google-certified CMP / Privacy & Messaging configuration has been tested |

The Web component requests non-personalized ads. That is not equivalent to “no cookies” or “no identifiers”; the disclosure explains that the provider can process request context and technical identifiers for delivery, fraud prevention, frequency capping, and reporting. Analytics consent and advertising consent are separate controls.

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

Start with a small, reviewed group of simple calculators. Do not select health, fitness, finance, earnings, personal-data, account, AI, upload, or backend-dependent tools. The runtime policy only admits active public tools classified as device-local and present in the canonical three-platform offline pricing registry. The IDs are deliberately not hard-coded into the repository; maintainers must review and explicitly set the allowlist consistently across the three platforms.

## Offline wallet boundary

The client-side gate only uses an existing selected, signed allowance and journals the operation. It does **not** enable the server-side production allowance issuance/settlement lock. Production issuance remains disabled pending independent device-integrity validation, authenticated allowance issuance, replay/recovery testing, approved pricing, and security review. Do not set `BILLING_OFFLINE_ENABLED` or `BILLING_OFFLINE_PRICING_APPROVED` here or in a deployment merely to test this feature.

Offline access is not “anonymous free use”: the selected tools reject execution when no valid allowance has already been prepared by an authenticated user. When online, the same local action stays guest-available and is not deducted from offline tokens.

## Ads.txt and release verification

After AdSense supplies the authorized seller account record, add the exact line to the site's `/ads.txt` file. Do not guess the publisher number or seller type.

Before launch, verify:

1. Web guest can open and run a selected tool without sign-in while online.
2. Web ad script is not requested when disabled, unallowlisted, offline, or privacy is not ready.
3. Android and iOS guest can run the same selected tool while online without sign-in.
4. UMP consent/refusal and privacy-options paths work on both native platforms.
5. All three apps reject that tool offline without a selected, current allowance.
6. A valid allowance records one durable operation before the result appears, and sync/replay recovery is verified.
7. Non-selected local tools are unchanged.
8. No ads appear in full-screen mode, and no ad slot blocks tool use when no ad is returned.
9. The production publisher configuration, CMP messages, authorized-seller record, and app-store privacy declarations have been reviewed.

## Provider references

- [AdSense non-personalized ad guidance](https://support.google.com/adsense/answer/9007336?hl=en)
- [Google's CMP requirement for relevant EEA, UK, and Switzerland traffic](https://support.google.com/adsense/answer/13554116?hl=en)
- [AdSense ads.txt guidance](https://support.google.com/adsense/answer/9785052?hl=en)
- [Android Google Mobile Ads Next-Gen quick start](https://developers.google.com/ad-manager/mobile-ads-sdk/android/next-gen/quick-start)
- [Android UMP privacy setup](https://developers.google.com/admob/android/privacy)
- [iOS Google Mobile Ads quick start](https://developers.google.com/admob/ios/quick-start)
- [iOS UMP privacy setup](https://developers.google.com/admob/ios/privacy)
- [iOS banner implementation](https://developers.google.com/admob/ios/banner)
