# enV Date & Time: competitor benchmark and user-review evidence
**Research snapshot: 31 October 2026**

## Method and limits

This is a qualitative product review, not a statistically representative survey. It records public store ratings, visible user-review themes and vendor-published feature descriptions. Store ratings and review counts are snapshots and may change. Individual reviews are evidence of reported experience, not proof that every user has the same issue.

## Competitor evidence

| Product | Public evidence | Positive themes | Negative themes / opportunities |
|---|---|---|---|
| World Time Buddy / Time Buddy | Google Play listing showed 4.6/5 from about 5.06K reviews; Apple App Store listing showed 4.8/5 from 14K ratings. A 30 June 2026 Google Play review praised quick multi-country scheduling and said the free tier was enough for a small set of zones. | Strong visual multi-zone comparison, quick scheduling, work-hour tiles, useful free tier for modest needs. | A public user review describes the reference line becoming misaligned around local day rollover. Another asks for a home alarm that follows a manually selected travel-home location. Preserve clear date/day shifts and avoid implying that a world clock is an alarm. |
| Savvy Time | Apple App Store listing showed 4.9/5 from 531 ratings; Chrome Web Store showed 4.5/5 from 188 ratings and 100K users. The listing advertises 24,000+ locations, offline comparison, DST awareness and adjustable 12/24-hour display. | Fast, clear, multi-city comparison; offline use; large city search; adjustable display. | Third-party review aggregation reports requests for a vertical comparison reference line and weather, plus reported Cairo DST and Edge compatibility issues. This is secondary evidence, not a countable sample of original reviews. |
| timeanddate World Clock | US App Store review page showed 4.2/5 from 104 ratings. Visible reviews praise detailed DST/GMT information and simple presentation. | Detailed time-zone context, UTC/GMT offsets and DST information. | Visible reviews report repeated location-permission prompts, missing/dated widgets, unavailable time-zone map/weather and search display problems after an iOS update. A 2024 review reports that the app/widget experience was stale on the reviewer’s phone. |
| Every Time Zone | A 2026 independent converter comparison describes the product as lightweight and reports a date-picker issue in its own test. | Minimal visual schedule; low-distraction presentation. | The date-picker issue is one tester’s finding, not a broad user-review statistic. It reinforces the need for date-boundary regression coverage. |

## What enV should take from this

1. **Correctness before decoration:** retain exact IANA time-zone rules, explicit UTC offsets, date-shift reporting, DST-gap rejection and a documented earlier-occurrence rule for repeated local times.
2. **City discoverability:** a hand-maintained list of a few dozen cities is not competitive with 20K+ location libraries. Web, Android and iOS now resolve unambiguous terminal city names from their installed IANA time-zone database, with curated aliases taking precedence. This is local and requires no location permission. It is not a 20K-place gazetteer: ambiguous city names must be entered by IANA ID or a curated alias.
3. **Transparent meeting planning:** show shared working-hour slots, offsets, local dates and an ICS event, but state that this is not private calendar free/busy.
4. **Respect user control:** keep location permission out of the conversion flow; let users enter cities or IANA IDs directly.
5. **Explicit release gaps:** enV still does not claim a maintained official country-by-country holiday database, calendar account integration, alarms, weather, a world map, native widgets or cloud-synchronised saved places. These require separate data, permissions, provider credentials or product work; do not simulate them with static or invented data.

## Source links

- World Time Buddy Google Play listing and visible user reviews (ratings, features, 30 June 2026 review and rollover/home-alarm feedback): https://play.google.com/store/apps/details?hl=en-US&id=com.helloka.worldtimebuddy
- World Time Buddy Apple App Store listing and ratings: https://apps.apple.com/us/app/time-buddy-easy-time-zones/id719765848
- Savvy Time Apple App Store listing and ratings/features: https://apps.apple.com/us/app/savvy-time/id1604337442
- Savvy Time Chrome Web Store listing and ratings/features: https://chromewebstore.google.com/detail/savvy-time-zone-converter/plhnjpnbkmdmooideifhkonobdkgbbof
- Savvy Time secondary user-review aggregation (clearly secondary evidence): https://chrome-stats.com/d/bllheieknegogcakbmiahgkabagcfihf/reviews
- timeanddate World Clock US App Store user reviews: https://apps.apple.com/us/app/world-clock-by-timeanddate-com/id959962122?see-all=reviews
- timeanddate World Clock UK App Store user reviews: https://apps.apple.com/gb/app/world-clock-by-timeanddate-com/id959962122?platform=iphone&see-all=reviews
- timeanddate Android support: search aliases/misspellings, favorite management and purchase restoration: https://www.timeanddate.com/android/worldclock/support
- Independent 2026 time-zone converter comparison: https://sitecurio.com/guides/time-zone-converter-test/
