# Adsterra Web rollout

## Selected placements

The first Web rollout uses only a small number of the publisher's placements.

| Surface | Format | Placement ID | Purpose |
|---|---|---:|---|
| Home | Responsive 320x50 mobile / 728x90 desktop | 32202130 / 32202131 | One horizontal display placement below the hero |
| All tools directory | 300x250 | 32202127 | One medium rectangle below the directory heading |
| Blog articles | Native Banner | 32202120 | One contextual placement after the second paragraph of the first eligible section |

Each placement is labelled as an advertisement and only requested when the production flag is enabled, the visitor explicitly allows advertising, and the enV origin is reachable. Declining advertising does not block tools. No advertising script is requested while offline.

## Deliberately not enabled

- 468x60, 160x300 and 160x600 banners: redundant formats not needed in the initial layout.
- Social Bar: a persistent floating overlay is too intrusive for the enV toolkit interface.
- Smartlink: only a placement ID was supplied; a complete Smartlink destination URL or generated code is required before attaching it to an explicit output action.
- Popunder: the supplied script is page-level and may activate on clicks anywhere on the site. It is intentionally excluded because it is not a documented output-button-only trigger.

## Provider and privacy rules

- This rollout is Web-only. Android Kotlin and iOS Swift implementations are unchanged.
- Google AdSense remains independently configured and disabled.
- The first-party advertising choice is separate from optional product analytics. Declining ads does not restrict enV tools.
- The public build flag VITE_ADSTERRA_ENABLED defaults to false. Enable it only for the production website after confirming the placements are approved in the Adsterra dashboard.
- The existing ads.txt contains Google's seller line only. Add an Adsterra seller line only after copying the exact authorized-seller record from the Adsterra dashboard. Do not infer it from the website ID or placement IDs.
