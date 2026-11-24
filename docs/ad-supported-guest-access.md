# Adsterra Web advertising and access rollout

## Provider boundary

Adsterra is the only advertising provider used by enV Web. AdSense, AdMob and Google Ad Manager are not part of the current advertising rollout. Android and iOS ship with no advertising SDK, publisher identifiers, ad requests, or advertising access gate; their native ad rollout is deferred until a separate launch decision.

The supplied Web placements are:

| Web placement | Publisher placement ID | Use |
|---|---:|---|
| Responsive mobile 320x50 | 32202130 | Above the tool interface |
| Responsive desktop 728x90 | 32202131 | Above the tool interface |
| 300x250 banner | 32202127 | Below the tool interface |
| Native banner | 32202120 | Below the tool interface |
| Smartlink | Publisher-supplied URL in `src/lib/ads/adsterra.ts` | Explicit user click only; never opened automatically by copy, download, or execution actions |

Adsterra publicly offers banner, native, social-bar, popunder and Smartlink formats. The current enV rollout uses the supplied banner/native units and Smartlink URL; no popunder or social-bar script is enabled. https://adsterra.com/publishers/

## Placement and consent rules

- `VITE_ADSTERRA_ENABLED` controls Web ad loading. It is enabled only on the production Web deployment.
- A visitor's advertising choice is explicit and stored separately from optional analytics consent. No ad script is requested before advertising consent is granted.
- Placements load only on eligible active Web tool pages while the same-origin enV site is reachable. Home, the All tools directory, and Blog pages do not render these placements.
- AI, Studio, Labs/Sandbox and restricted sensitive topics remain excluded by the shared tool eligibility policy.
- Withdrawing advertising consent reloads the page so provider-installed scripts and listeners from the previous consent state are not reused.
- Smartlink navigation is never attached to unrelated tool actions. It may only be opened by a labelled link the visitor chooses.

## Selected tool access and the three-visit offer

The access gate is separate from general ad display. It applies only when the deployment enables `VITE_AD_ACCESS_GATE_ENABLED`, the exact tool ID appears in `VITE_AD_ACCESS_TOOL_IDS`, the tool is eligible for Adsterra, and the same tool has a manually approved token price plus a cross-platform offline profile.

A guest can choose Adsterra-supported access for the current visit or create/sign in to an enV account. A signed-in user can choose tokens only for the exact tool's approved price. The server reserves the price before access and settles that reservation only after a successful tool result; a failed or cancelled run releases it. Unapproved tools remain unpriced and cannot be charged.

Adsterra's publisher reporting API exposes aggregate reporting such as impressions, clicks, CTR, CPM and revenue. It is not a documented per-user rewarded-video completion callback. https://adsterra.com/blog/how-to-use-adsterra-publishers-api/ Therefore enV does **not** describe Adsterra banners, clicks, Smartlink opens or script loads as completed rewarded videos. The local ad-free offer is labelled **three ad-supported visits** and is counted only after an eligible Adsterra placement script loads during a tool visit. That local cadence is a preference prompt only; it is not billing evidence, a verified impression, or a server reward.

After three such visits within the rolling 30-day window, the offer lets a signed-in visitor choose tokens as the default for future visits. The already-unlocked visit remains free. Guests are offered account creation/sign-in. Token prices are still shown and confirmed per tool before a reservation is made.

## Native Android and iOS pre-launch posture

Android remains Kotlin and iOS remains Swift. AdMob / Google Mobile Ads and UMP remain optional native provider integrations, but are disabled in current builds:
- Android ENV_ADS_ENABLED and ENV_ADS_PRIVACY_CONFIGURED default to false; no production banner unit or rewarded GAM path is enabled.
- iOS Debug and Release build settings keep ENV_ADS_ENABLED = NO and ENV_ADS_PRIVACY_CONFIGURED = NO; banner and rewarded unit settings remain empty.
- Native AdMob remains disabled. No AdMob or Google rewarded ad is requested while those settings remain false. Do not enable them as part of the Adsterra Web rollout.

The native token-access gate is independent from AdMob. Android and iOS gate the same reviewed, cross-platform local-tool cohort using native UI and the shared offline eligibility registry. When online, the user signs in and pairs the device with the enV Wallet, the server checks the exact approved tool price, the user confirms the reservation, and the native execution callback settles successful runs or releases failed/cancelled runs. When AdMob is disabled, the native gate offers token access; it does not wait for UMP, a GAM rewarded path, or an AdMob banner.

Offline execution remains a separate signed-allowance flow. Production offline allowance issuance and spending remain fail-closed pending independent device-integrity, pricing, and finalization reviews. Adsterra scripts and Smartlink URLs are Web-only and must never be copied into Kotlin or Swift.

## Offline-wallet boundary

Offline execution remains governed by the existing signed, pre-issued allowance protocol. An advertising preference, an Adsterra script request, or a three-visit offer cannot issue, extend, bypass, or settle an offline allowance. Selected hybrid tools still require an authenticated enV account and a valid allowance while offline. This policy is independent of the Web advertising provider.
