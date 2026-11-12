# Adsterra Web rollout

## Selected placements

Adsterra is restricted to qualified Web tool pages. Home, the All tools directory, Blog index, and Blog article pages never render advertising. A tool qualifies when it is active, public, device-local, backend-free, auth-free, and outside restricted health/finance/earnings/personal/fitness topics. Eligibility is evaluated from the live tool record and verified local-execution policy across suitable categories; it does not depend on the offline-wallet allowlist. Studio workspaces, AI-related tools, Labs and Sandbox experiences are excluded by category and tool metadata.

| Qualified tool surface | Format | Publisher placement | Purpose |
|---|---|---:|---|
| Tool page, above the tool interface | Responsive 320x50 mobile / 728x90 desktop | 32202130 / 32202131 | Responsive banner |
| Tool page, below the tool interface | 300x250 | 32202127 | Medium-rectangle display unit |
| Tool page, below the tool interface | Native Banner | 32202120 | Contextual native placement |
| Qualified tool page | Popunder | Publisher script | Loads only after consent and same-origin reachability; may open a separate tab after an interaction |
| Qualified tool output action | Smartlink | Publisher URL | Opens from the user's direct copy/download/export action, without delaying or gating the tool output |

Each placement is labelled as an advertisement and is requested only when the production flag is enabled, the visitor has explicitly allowed advertising, and the same-origin page is reachable. The Cookie preferences section remains on the Privacy page; there is no site-wide advertising popup. A qualified guest can use the tool after allowing advertising. A guest who declines or has not chosen advertising sees a tool-level access choice and must allow ads or sign in/create an account; signed-in users can use the tool without ads. No advertising script is requested while offline.

## Production boundaries

- Do not load Adsterra scripts before the visitor's advertising choice in Cookie preferences. The supplied tags may process network/device information and use cookies or similar storage. The privacy notice must keep clear Allow and Decline choices and provide a way to withdraw consent.
- A guest who declines advertising may still browse enV, use non-ad-supported tools, and create an account. Only a qualified Adsterra tool requires either explicit ad consent or a signed-in account; signed-in users are never required to accept advertising.
- Ads are only a funding mechanism for the service; a visitor's privacy choice does not turn off enV's monetization configuration for other visitors.
- Adsterra scripts and publisher URLs are Web-only. Android Kotlin and iOS Swift use separate native AdMob integrations; those native placements remain fail-closed until production app IDs, banner unit IDs and UMP privacy configuration are supplied.
- Google AdSense remains independently configured and unchanged.
- The checked-in build flag `VITE_ADSTERRA_ENABLED` defaults to false. Vercel sets it to `true` for the `envtools.store` **Production** target only; Preview and Development targets are intentionally unset so test traffic does not create publisher impressions.

## Deliberately not enabled yet

- 468x60, 160x300 and 160x600 banners: not included in the current tool-page layout; the responsive, 300x250 and native placements cover qualified tools without repeating large formats.
- Social Bar: a persistent floating overlay is too intrusive for the toolkit interface.
- Popunder is mounted only on a qualified tool page and may react to eligible page interactions. It is not a verified rewarded-ad callback and is not proof that a tool output was completed; never gate, replace or delay downloads and exports behind it.
- Smartlink: the publisher-supplied destination opens synchronously from an explicit output-action click on a qualified tool page. It is gated by the same production flag, explicit advertising consent and online state. The output action continues independently; browsers may still block an additional tab. Smartlink is not a verified rewarded-ad completion callback and does not unlock or gate tool output.
- `ads.txt`: the existing file contains the Google seller line. Add Adsterra only from the exact seller record shown for this publisher/site in the Adsterra dashboard; do not manufacture a seller record from a placement ID.

## Verification

- `src/lib/ads/adsterra.test.ts` checks the selected provider placements and the deployment, consent and online-state requirements before ad requests.
- `AdsterraResponsiveBanner`, `AdsterraBanner` and `AdsterraNativeBanner` mount on qualified tool pages, outside fullscreen. The responsive unit is above the tool interface; the 300x250 and native units are below it.
- Native placement cleanup removes the injected script and rendered creative when consent is withdrawn or the component unmounts, allowing a later re-grant to load the placement again.
- The tool-scoped Popunder script is loaded only on qualified tool pages after explicit consent and same-origin reachability; it is Web-only and does not gate tool output actions. Banner and Popunder script failures receive bounded retries instead of remaining permanently disabled after one failed request.
