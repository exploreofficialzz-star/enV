import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const analyticsServer = source("src/lib/analytics/analytics.server.ts");
const trendingRoute = source("server/routes/api/analytics/trending.get.ts");
const home = source("src/routes/index.tsx");
const homeTrendingLoader = source("src/lib/analytics/trending.functions.ts");
const dashboard = source("src/routes/userbehavior.tsx");
const android = source("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidClient = source("apps/android/app/src/main/java/com/chastech/env/NativeTrendingToolsClient.kt");
const ios = source("apps/ios/enV/ContentViews.swift");

test("public Trending contains only ranked, consented tool starts", () => {
  assert.ok(analyticsServer.includes("export async function getPublicTrendingTools()"));
  assert.match(analyticsServer, /ANALYTICS_ENABLED !== "true"/);
  assert.ok(analyticsServer.includes("count(*) filter (where event_name='tool_started') as starts"));
  assert.ok(analyticsServer.includes("count(distinct anonymous_subject_digest) filter (where event_name='tool_started') as starting_installations"));
  assert.match(analyticsServer, /where starts > 0 and starting_installations >= 3/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc/);
  assert.ok(analyticsServer.includes("PUBLIC_TRENDING_TOOL_LIMIT * 3"));
  assert.ok(analyticsServer.includes("activeToolIds.has(id)"));
  const publicResult = analyticsServer.slice(analyticsServer.indexOf("export async function getPublicTrendingTools"), analyticsServer.indexOf("export async function runAnalyticsRetention"));
  assert.match(publicResult, /toolIds/);
  assert.ok(publicResult.includes("return empty();"));
  assert.doesNotMatch(publicResult, /getDailyDiscoveryToolIds|publicTrendingDiscoveryResponse|mode: "discovery"/);
  assert.doesNotMatch(publicResult, /select user_id|return .*anonymous_subject_digest|return .*session_digest/);
});

test("the public endpoint is read-only, same-origin for browsers and safely cacheable", () => {
  assert.match(trendingRoute, /request\.method !== "GET"/);
  assert.match(trendingRoute, /isSameOriginRequest\(request\)/);
  assert.match(trendingRoute, /getPublicTrendingTools\(\)/);
  assert.match(trendingRoute, /s-maxage=300, stale-while-revalidate=900/);
});

test("Web Home shows Trending without helper copy or advertising placements", () => {
  assert.match(home, /fetch\("\/api\/analytics\/trending"/);
  assert.match(home, /getToolById\(id\)/);
  assert.match(home, /loadHomeTrendingTools/);
  assert.match(home, /title="Trending tools"/);
  assert.doesNotMatch(home, /index >= 6 \? "hidden md:flex"/);
  assert.doesNotMatch(home, /className=\{prefsHydrated \? "visible" : "invisible"\}/);
  assert.doesNotMatch(home, /daily rotating|Ranked by actual tool starts/);
  assert.doesNotMatch(home, /Adsterra|AdSlot|AdSensePageUnit|getPopularTools/);
  assert.match(homeTrendingLoader, /getPublicTrendingTools\(\)/);
  assert.match(homeTrendingLoader, /getActiveTools\(\)/);
  assert.match(homeTrendingLoader, /isToolUnderProduction/);
  assert.match(homeTrendingLoader, /Math\.random\(\)/);
  assert.match(homeTrendingLoader, /byCategory/);
  assert.match(homeTrendingLoader, /randomCrossCategoryTools\(getActiveTools\(\), 12\)/);
  assert.match(homeTrendingLoader, /isToolUnderProduction\(tool\)/);
  assert.match(homeTrendingLoader, /while \(selection\.length < limit\)/);
  assert.match(homeTrendingLoader, /mode: "discovery"/);
  assert.match(home, /hasLiveTrendingData/);
  assert.match(home, /5 \* 60 \* 1000/);
  assert.match(home, /if \(ranked\.length > 0\)/);
});

test("the private User Behavior dashboard continues to rank and export actual starts", () => {
  assert.match(analyticsServer, /count\(\*\) filter\(where event_name='tool_started'\) starts/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc limit 25/);
  assert.match(dashboard, /toolId: string; starts: number; views: number/);
  assert.match(dashboard, /\["Tool activity", "Starts", "Views", "Completed", "Failures"\]/);
  assert.match(dashboard, /\{row\.starts\.toLocaleString\(\)\} starts/);
});

test("Android consumes the shared real-usage order without adding Trending helper copy", () => {
  const homeSource = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun MostUsedToolsTray")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchFeed\(\)/);
  assert.match(homeSource, /trendingIds\.mapNotNull/);
  assert.match(homeSource, /randomCrossCategoryTrendingTools\(availableTrendingTools\)/);
  assert.match(home, /groupBy \{ it\.category \}/);
  assert.match(home, /!it\.isUnderProduction\(\)/);
  assert.match(homeSource, /feed\.toolIds\.filter/);
  assert.match(homeSource, /kotlinx\.coroutines\.delay\(5 \* 60 \* 1000L\)/);
  assert.match(homeSource, /SectionTitle\("Trending tools"/);
  assert.doesNotMatch(homeSource, /A daily rotating selection|Ranked by actual tool starts|trendingMode/);
  assert.doesNotMatch(homeSource, /sortedByDescending \{ it\.popularity \}/);
  assert.match(androidClient, /https:\/\//);
  assert.match(androidClient, /api\/analytics\/trending/);
  assert.match(androidClient, /data\.optString\("mode"\)/);
  assert.match(androidClient, /seen\.take\(500\)/);
});

test("iOS consumes the shared real-usage order without adding Trending helper copy", () => {
  const homeSource = ios.split("struct HomeView: View")[1]?.split("private struct ResponsiveToolGrid")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchFeed\(\)/);
  assert.match(homeSource, /trendingToolIDs\.isEmpty\s*\?\s*fallbackTrendingToolIDs\s*:/);
  assert.match(homeSource, /fallbackTrendingToolIDs = randomCrossCategoryTrendingTools/);
  assert.match(ios, /by: \.category/);
  assert.match(homeSource, /let liveIDs = feed\.toolIDs\.filter/);
  assert.match(homeSource, /Task\.sleep\(nanoseconds: 300_000_000_000\)/);
  assert.match(homeSource, /selectedIDs\.compactMap/);
  assert.match(ios, /private var visibleLimit: Int \{ Int\.max \}/);
  assert.match(homeSource, /Trending tools/);
  assert.doesNotMatch(homeSource, /A daily rotating selection|Ranked by actual tool starts|trendingMode/);
  assert.doesNotMatch(homeSource, /store\.catalog\.webSearch\("", limit: Int\.max/);
  const clientSource = ios.slice(ios.indexOf("private enum NativeTrendingToolsClient"), ios.indexOf("struct HomeView: View"));
  assert.match(clientSource, /payload\["mode"\]/);
  assert.match(clientSource, /prefix\(500\)/);
});
