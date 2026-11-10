import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const analyticsServer = source("src/lib/analytics/analytics.server.ts");
const trendingRoute = source("server/routes/api/analytics/trending.get.ts");
const home = source("src/routes/index.tsx");
const dashboard = source("src/routes/userbehavior.tsx");
const android = source("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidClient = source("apps/android/app/src/main/java/com/chastech/env/NativeTrendingToolsClient.kt");
const ios = source("apps/ios/enV/ContentViews.swift");

test("public Trending falls back to a shared daily discovery shuffle, then switches to qualified analytics", () => {
  assert.match(analyticsServer, /export async function getPublicTrendingTools\(\)/);
  assert.match(analyticsServer, /import \{ getActiveTools \} from "\.\.\/registry"/);
  assert.match(analyticsServer, /getDailyDiscoveryToolIds/);
  assert.match(analyticsServer, /env-public-trending-discovery-v1:/);
  assert.match(analyticsServer, /mode: "discovery" as const/);
  assert.match(analyticsServer, /mode: "analytics" as const/);
  assert.match(analyticsServer, /ANALYTICS_ENABLED !== "true"/);
  assert.match(analyticsServer, /count\(\*\) filter \(where event_name='tool_started'\) as starts/);
  assert.match(analyticsServer, /count\(distinct anonymous_subject_digest\) filter \(where event_name='tool_started'\) as starting_installations/);
  assert.match(analyticsServer, /where starts > 0 and starting_installations >= 3/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc/);
  assert.match(analyticsServer, /limit \$\{PUBLIC_TRENDING_TOOL_LIMIT\}/);
  assert.match(analyticsServer, /if \(!toolIds\.length\) return publicTrendingDiscoveryResponse\(\)/);
  const publicResult = analyticsServer.slice(analyticsServer.indexOf("export async function getPublicTrendingTools"), analyticsServer.indexOf("export async function runAnalyticsRetention"));
  assert.match(publicResult, /toolIds/);
  assert.doesNotMatch(publicResult, /select user_id|return .*anonymous_subject_digest|return .*session_digest/);
});

test("the public endpoint is read-only, same-origin for browsers and safely cacheable", () => {
  assert.match(trendingRoute, /request\.method !== "GET"/);
  assert.match(trendingRoute, /isSameOriginRequest\(request\)/);
  assert.match(trendingRoute, /getPublicTrendingTools\(\)/);
  assert.match(trendingRoute, /s-maxage=300, stale-while-revalidate=900/);
});

test("Web Home displays the feed mode and does not use legacy popularity scores", () => {
  assert.match(home, /fetch\("\/api\/analytics\/trending"/);
  assert.match(home, /getToolById\(id\)/);
  assert.match(home, /payload\.data\?\.mode/);
  assert.match(home, /A daily rotating selection of tools to explore/);
  assert.match(home, /Ranked by actual tool starts over the last 30 days/);
  assert.doesNotMatch(home, /getPopularTools/);
});

test("the private User Behavior dashboard continues to rank and export actual starts", () => {
  assert.match(analyticsServer, /count\(\*\) filter\(where event_name='tool_started'\) starts/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc limit 25/);
  assert.match(dashboard, /toolId: string; starts: number; views: number/);
  assert.match(dashboard, /\["Tool activity", "Starts", "Views", "Completed", "Failures"\]/);
  assert.match(dashboard, /\{row\.starts\.toLocaleString\(\)\} starts/);
});

test("Android consumes the same shared tool order and presents the active feed mode", () => {
  const homeSource = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun MostUsedToolsTray")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchFeed\(\)/);
  assert.match(homeSource, /trendingIds\.mapNotNull/);
  assert.match(homeSource, /A daily rotating selection of tools to explore/);
  assert.doesNotMatch(homeSource, /sortedByDescending \{ it\.popularity \}/);
  assert.match(androidClient, /https:\/\//);
  assert.match(androidClient, /api\/analytics\/trending/);
  assert.match(androidClient, /data\.optString\("mode"\)/);
  assert.match(androidClient, /seen\.take\(500\)/);
});

test("iOS consumes the same shared tool order and presents the active feed mode", () => {
  const homeSource = ios.split("struct HomeView: View")[1]?.split("private struct ResponsiveToolGrid")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchFeed\(\)/);
  assert.match(homeSource, /trendingToolIDs\.compactMap/);
  assert.match(homeSource, /A daily rotating selection of tools to explore/);
  assert.doesNotMatch(homeSource, /store\.catalog\.webSearch\("", limit: Int\.max/);
  const clientSource = ios.slice(ios.indexOf("private enum NativeTrendingToolsClient"), ios.indexOf("struct HomeView: View"));
  assert.match(clientSource, /payload\["mode"\]/);
  assert.match(clientSource, /prefix\(500\)/);
});
