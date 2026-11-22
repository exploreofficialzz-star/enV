# Adsterra Web rollout

## Selected placements

Adsterra is restricted to qualified Web tool pages. Home, the All tools directory, Blog index, and Blog article pages never render advertising. A tool qualifies when its Web tool record is active and it is outside restricted health/finance/earnings/personal/fitness topics. Eligibility applies across ordinary categories and does not depend on local versus backend execution, account state or the offline-wallet allowlist. Studio workspaces, AI-related tools, Labs and Sandbox experiences are excluded by category and tool metadata.

| Qualified tool surface | Format | Publisher placement | Purpose |
|---|---|---:|---|
| Tool page, above the tool interface | Responsive 320x50 mobile / 728x90 desktop | 32202130 / 32202131 | Responsive banner |
| Tool page, below the tool interface | 300x250 | 32202127 | Medium-rectangle display unit |
| Tool page, below the tool interface | Native Banner | 32202120 | Contextual native placement |
| Qualified tool page | Popunder | Publisher script | Loads only after consent and same-origin reachability; may open a separate tab after an interaction |
| Qualified tool output action | Smartlink | Publisher URL | Opens from the user's direct copy/download/export action, without delaying or gating the tool output |

Each Adsterra placement is labelled as an advertisement and is requested only when the production flag is enabled, the visitor has explicitly allowed advertising, and the same-origin page is reachable. Adsterra placements are not rewarded video and do not unlock tools. A separate, explicitly allowlisted Google Publisher Tag rewarded flow can gate selected tools when its own deployment flag, rewarded unit and Google privacy messaging are configured. Guests who decline or cannot complete that rewarded ad must sign in; signed-in users can choose ad-free access only at a manually approved per-tool token price. The rewarded access gate is off by default and does not gate non-allowlisted tools. No ad script is requested while offline.

## Production boundaries

- Do not load Adsterra scripts before the visitor's advertising choice in Cookie preferences. The supplied tags may process network/device information and use cookies or similar storage. The privacy notice must keep clear Allow and Decline choices and provide a way to withdraw consent.
- Declining advertising stops Adsterra requests. For a tool explicitly included in the separate rewarded-access allowlist, guests must then sign in and signed-in users can only unlock ad-free access through the approved price for that specific tool. Consent remains optional and is never changed automatically.
- Ads are only a funding mechanism for the service; a visitor's privacy choice does not turn off enV's monetization configuration for other visitors.
- Adsterra scripts and publisher URLs are Web-only. Android Kotlin and iOS Swift use native Google Mobile Ads integrations: AdMob app/banner IDs are separate from the Google Ad Manager rewarded unit path. Native rewarded access remains fail-closed until the production GAM path, AdMob app/banner configuration and UMP privacy setup are supplied.
- Google AdSense's Privacy & Messaging readiness is required before the Web rewarded flow loads GPT. Google Ad Manager rewarded events are separate from AdSense display units.
- The new access-gate settings default off: VITE_AD_ACCESS_GATE_ENABLED=false, VITE_AD_ACCESS_TOOL_IDS=, and VITE_GAM_REWARDED_AD_UNIT_PATH=. Enable only after a publisher-generated rewarded unit exists and the privacy/CMP path has been validated.
- An ad counts only when GPT reports both rewardedSlotGranted and rewardedSlotVideoCompleted for the same slot. Before requesting one, enV requires resolved consent-mode values for ad storage, ad user data and ad personalization, no applicable US opt-out, and Google's ad-blocker status to explicitly report no blocker. Unknown or denied states fail closed. Rewarded completions are counted locally on the browser/device in a rolling 30-day window; the ad-free token offer appears once after three completed ads. The per-tool ads-versus-tokens preference is also stored on that device, but never bypasses sign-in, approved-price checks or explicit token confirmation.
- Per-tool token access is backed by `src/data/billing-tool-access-approvals.json`. The current registry approves 267 cross-platform local calculators at 100 subunits (0.1 enV token) per calculation, version `env-tool-access-local-calculator-v1`. All other tools remain unpriced until explicitly approved; generated provisional profiles never trigger deductions. The server reserves and settles only that approved per-tool amount after a successful result.
- The checked-in build flag `VITE_ADSTERRA_ENABLED` defaults to false. Vercel sets it to `true` for the `envtools.store` **Production** target only; Preview and Development targets are intentionally unset so test traffic does not create publisher impressions.

## Deliberately not enabled yet

- 468x60, 160x300 and 160x600 banners: not included in the current tool-page layout; the responsive, 300x250 and native placements cover qualified tools without repeating large formats.
- Social Bar: a persistent floating overlay is too intrusive for the toolkit interface.
- Popunder is mounted only on a qualified tool page and may react to eligible page interactions. It is not a verified rewarded-ad callback and is not proof that a tool output was completed; never gate, replace or delay downloads and exports behind it.
- Smartlink: the publisher-supplied destination opens synchronously from an explicit output-action click on a qualified tool page. It is gated by the same production flag, explicit advertising consent and online state. The output action continues independently; browsers may still block an additional tab. Smartlink is not a verified rewarded-ad completion callback and does not unlock or gate tool output.
- `ads.txt`: the existing file contains the Google seller line. Add Adsterra only from the exact seller record shown for this publisher/site in the Adsterra dashboard; do not manufacture a seller record from a placement ID.

## Verification

- `src/lib/ads/adsterra.test.ts` checks the selected provider placements and the deployment, consent and online-state requirements before ad requests.
- `src/lib/ads/policy.test.ts` verifies ordinary active tools across categories are eligible while Studio, AI, Lab/Sandbox and restricted sensitive topics remain excluded; eligibility is independent of account state and execution type.
- `AdsterraResponsiveBanner`, `AdsterraBanner` and `AdsterraNativeBanner` mount on qualified tool pages, outside fullscreen, independently of sign-in state. The responsive unit is above the tool interface; the 300x250 and native units are below it.
- Native placement cleanup removes the injected script and rendered creative when consent is withdrawn or the component unmounts, allowing a later re-grant to load the placement again.
- The tool-scoped Popunder script is loaded only on qualified tool pages after explicit consent and same-origin reachability; it is Web-only and does not gate tool output actions. Banner and Popunder script failures receive bounded retries instead of remaining permanently disabled after one failed request.
