# How to learn how people actually search for each tool

**Status: pipeline built and tested on synthetic data only. No real query data has been collected or analysed. Nothing in the repo claims measured demand except what you feed through the pipeline.** The aliases in `src/data/search-aliases.ts` are marked `editorial-hypothesis` / `reviewed: false` for that reason.

## Hard constraint found in the repo
`src/routes/privacy.tsx` says analytics records do **not** contain search terms. Logging what people type into enV's search box would contradict that published statement. Do not add it without (1) your explicit decision, (2) a Privacy page update, and (3) respecting the existing Cookie-preferences choice.

## Sources, in order of preference
| Source | What it tells you | Needs | Privacy |
| --- | --- | --- | --- |
| **Google Search Console** → Performance → export Queries **with Pages** | How people reach each tool page from Google: real phrasings, impressions, clicks, position | your GSC property (envtools.store) | Aggregated; Google already anonymizes rare queries |
| **Bing Webmaster Tools** → Search Performance export | Same, for Bing (and sources that reuse Bing) | your Bing account | Same |
| **User-submitted tool suggestions / feedback** (existing routes) | Needs people explicitly wrote | read access to those records | Already user-submitted; review before use |
| *Optional, only if you approve:* opt-in in-app search-term aggregation | How people search inside enV | policy change + consent + retention rule | Highest risk; k-anonymity ≥ 20 sessions, no user/session IDs, 90-day cap |

## Run it
1. Export a **page-level** query report (columns Query, Page, Clicks, Impressions, Position). A query-only export is not enough: the pipeline needs to know which tool page each query landed on.
2. `node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/learn-search-aliases.mjs --input gsc.csv`
3. Read `audit/discovery/demand/DEMAND-REPORT.md` and `proposed-aliases.json`.
4. For each proposed phrase a person confirms, add it to `src/data/search-aliases.ts` with `source: "search-console"` (or `"bing-webmaster"`) and `reviewed: true`, then run `npm run discovery:check` and regenerate golden fixtures (`npm run discovery:search-golden`).

## What the pipeline does and does not do
- Drops emails, URLs, long digit runs, token-like strings, brand queries, over-long queries, and anything under 30 impressions.
- Maps landing pages to tool IDs, asks enV's own search where that tool ranks for the query, and proposes an alias only when it is outside the top 3 and not already a name/keyword/alias.
- Flags **ambiguous** queries (two tools get similar clicks) for a human to decide, and lists **unmet-intent leads** (queries landing on non-tool pages where enV search finds nothing). A lead is not evidence that a tool should be built.
- Writes click-based relevance judgments marked `BEHAVIORAL_NOT_HUMAN_REVIEWED`.
- **Never changes ranking by itself.** Click data measures web-search behaviour, is position-biased, and says nothing about whether a tool worked for the visitor.

## Not measured, and can only come from live telemetry you approve
Reformulation rate, selection rate and time-to-correct-tool for the in-app search box.
