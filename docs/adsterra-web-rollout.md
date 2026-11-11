# Adsterra Web rollout

## Selected placements

The Web rollout uses a limited set of publisher-provided placements to keep the toolkit usable.

| Surface | Format | Placement ID | Purpose |
|---|---|---:|---|
| Home | Responsive 320x50 mobile / 728x90 desktop | 32202130 / 32202131 | One horizontal display placement below the hero |
| All tools directory | 300x250 | 32202127 | One medium rectangle below the directory heading |
| Blog articles | Native Banner | 32202120 | One contextual placement after the second paragraph of the first eligible section |

Each placement is labelled as an advertisement and is requested only when the production flag is enabled, the visitor has explicitly allowed advertising in that browser, and the same-origin page is reachable. Declining advertising does not block tools. No advertising script is requested while offline. The advertising choice is separate from product analytics.

## Production boundaries

- Do not load Adsterra scripts before the visitor's advertising choice. The supplied tags may process network/device information and use cookies or similar storage. The privacy notice must keep clear Allow and Decline choices and provide a way to withdraw consent.
- A browser declining advertising remains a normal enV visitor. Do not gate tool access, downloads, exports, or account use on ad consent.
- Ads are only a funding mechanism for the service; a visitor's privacy choice does not turn off enV's monetization configuration for other visitors.
- This rollout is Web-only. Android Kotlin and iOS Swift implementations are unchanged; they need a separately reviewed native ad integration rather than reusing browser script tags.
- Google AdSense remains independently configured and unchanged.
- The public build flag `VITE_ADSTERRA_ENABLED` defaults to false. Production deployment has it set to true.

## Deliberately not enabled yet

- 468x60, 160x300 and 160x600 banners: not needed in the initial layout; the selected placements cover mobile, desktop and directory use without duplicate banners.
- Social Bar: a persistent floating overlay is too intrusive for the toolkit interface.
- Popunder: the supplied page-level script can react to general page clicks, not only output actions. Do not install it globally or load it as a substitute for a real output-action integration.
- Smartlink: placement ID 32202122 is recorded, but it is not itself a destination URL. Adsterra's active Smartlink URL or generated code is needed before wiring it to an explicit output action. Never replace or delay the real download/export action with a Smartlink redirect.
- `ads.txt`: the existing file contains the Google seller line. Add Adsterra only from the exact seller record shown for this publisher/site in the Adsterra dashboard; do not manufacture a seller record from a placement ID.

## Verification

- `src/lib/ads/adsterra.test.ts` checks the selected provider placements and the deployment, consent and online-state requirements before ad requests.
- `AdsterraBanner` and `AdsterraNativeBanner` are Web-only.
- Native placement cleanup removes the injected script and rendered creative when consent is withdrawn or the component unmounts, allowing a later re-grant to load the placement again.
