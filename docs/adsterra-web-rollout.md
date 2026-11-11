# Adsterra Web rollout

## Selected placements

The Web rollout uses a limited set of publisher-provided placements to keep the toolkit usable. The responsive banners cover Home and the All tools directory; the supplied Native Banner also appears below tool interfaces and within eligible Blog articles.

| Surface | Format | Placement ID | Purpose |
|---|---|---:|---|
| Home | Responsive 320x50 mobile / 728x90 desktop | 32202130 / 32202131 | One horizontal display placement below the hero |
| All tools directory | 300x250 | 32202127 | One medium rectangle below the directory heading |
| Tool pages and Blog articles | Native Banner | 32202120 | One contextual placement below eligible tool interfaces and in eligible articles |
| Supported Web pages | Popunder | Publisher script | Loads only after explicit ad consent and same-origin reachability; may open a separate tab after a page interaction |

Each placement is labelled as an advertisement and is requested only when the production flag is enabled, the visitor has explicitly allowed advertising in the global Cookie preferences dialog, and the same-origin page is reachable. The same dialog holds the optional analytics and Adsterra advertising choices alongside always-active essential storage; there is no separate Adsterra preference screen. Visitors can reopen the dialog from the Privacy page. Declining advertising does not block tools. No advertising script is requested while offline.

## Production boundaries

- Do not load Adsterra scripts before the visitor's advertising choice in Cookie preferences. The supplied tags may process network/device information and use cookies or similar storage. The privacy notice must keep clear Allow and Decline choices and provide a way to withdraw consent.
- A browser declining advertising remains a normal enV visitor. Do not gate tool access, downloads, exports, or account use on ad consent.
- Ads are only a funding mechanism for the service; a visitor's privacy choice does not turn off enV's monetization configuration for other visitors.
- This rollout is Web-only. Android Kotlin and iOS Swift implementations are unchanged; they need a separately reviewed native ad integration rather than reusing browser script tags.
- Google AdSense remains independently configured and unchanged.
- The public build flag `VITE_ADSTERRA_ENABLED` defaults to false. Production deployment has it set to true.

## Deliberately not enabled yet

- 468x60, 160x300 and 160x600 banners: not needed in the initial layout; the selected placements cover mobile, desktop and directory use without duplicate banners.
- Social Bar: a persistent floating overlay is too intrusive for the toolkit interface.
- Popunder is page-level and can react to general page interactions. It is not a rewarded-ad callback and is not proof that a tool output was completed; never gate, replace or delay downloads and exports behind it.
- Smartlink: the publisher-supplied destination opens in a separate tab when a shared Web download helper is called from an explicit output action. It is gated by the same production flag, explicit advertising consent and online state. The actual download continues independently; browsers may block the additional tab, in which case the download still proceeds. Smartlink is not a verified rewarded-ad completion callback and does not unlock or gate tool output.
- `ads.txt`: the existing file contains the Google seller line. Add Adsterra only from the exact seller record shown for this publisher/site in the Adsterra dashboard; do not manufacture a seller record from a placement ID.

## Verification

- `src/lib/ads/adsterra.test.ts` checks the selected provider placements and the deployment, consent and online-state requirements before ad requests.
- `AdsterraBanner` and `AdsterraNativeBanner` are Web-only.
- Native placement cleanup removes the injected script and rendered creative when consent is withdrawn or the component unmounts, allowing a later re-grant to load the placement again.
- The site-level Popunder script is loaded only after explicit consent and same-origin reachability; it is Web-only and does not gate tool output actions. Banner and Popunder script failures receive bounded retries instead of remaining permanently disabled after one failed request.
