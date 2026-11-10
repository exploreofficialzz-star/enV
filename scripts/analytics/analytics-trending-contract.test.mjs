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

test("public trending is derived from opt-in starts, with an aggregate privacy threshold", () => {
  assert.match(analyticsServer, /export async function getPublicTrendingTools\(\)/);
  assert.match(analyticsServer, /ANALYTICS_ENABLED !== "true"/);
  assert.match(analyticsServer, /count\(\*\) filter \(where event_name='tool_started'\) as starts/);
  assert.match(analyticsServer, /count\(distinct anonymous_subject_digest\) filter \(where event_name='tool_started'\) as starting_installations/);
  assert.match(analyticsServer, /where starts > 0 and starting_installations >= 3/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc/);
  assert.match(analyticsServer, /toolIds \}/);
  const publicResult = analyticsServer.slice(analyticsServer.indexOf("const toolIds = rows"), analyticsServer.indexOf("export async function runAnalyticsRetention"));
  assert.match(publicResult, /return \{ generatedAt: new Date\(\)\.toISOString\(\), windowDays: 30, toolIds \}/);
  assert.doesNotMatch(publicResult, /user_id|anonymous_subject_digest|session_digest/);
});

test("the public endpoint is read-only, same-origin for browsers and safely cacheable", () => {
  assert.match(trendingRoute, /request\.method !== "GET"/);
  assert.match(trendingRoute, /isSameOriginRequest\(request\)/);
  assert.match(trendingRoute, /getPublicTrendingTools\(\)/);
  assert.match(trendingRoute, /s-maxage=300, stale-while-revalidate=900/);
});

test("Web Home uses analytics IDs and never falls back to catalogue popularity", () => {
  assert.match(home, /fetch\("\/api\/analytics\/trending"/);
  assert.match(home, /getToolById\(id\)/);
  assert.match(home, /Ranked by actual tool starts over the last 30 days/);
  assert.doesNotMatch(home, /getPopularTools/);
});

test("the private User Behavior dashboard ranks and exports actual starts", () => {
  assert.match(analyticsServer, /count\(\*\) filter\(where event_name='tool_started'\) starts/);
  assert.match(analyticsServer, /order by starts desc, completed desc, views desc, tool_id asc limit 25/);
  assert.match(dashboard, /toolId: string; starts: number; views: number/);
  assert.match(dashboard, /\["Tool activity", "Starts", "Views", "Completed", "Failures"\]/);
  assert.match(dashboard, /\{row\.starts\.toLocaleString\(\)\} starts/);
});

test("Android Home obtains trending IDs from the shared API without sorting by popularity", () => {
  const homeSource = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun MostUsedToolsTray")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchToolIds\(\)/);
  assert.match(homeSource, /trendingIds\.mapNotNull/);
  assert.doesNotMatch(homeSource, /sortedByDescending \{ it\.popularity \}/);
  assert.match(androidClient, /https:\/\//);
  assert.match(androidClient, /api\/analytics\/trending/);
});

test("iOS Home obtains trending IDs from the same aggregate API", () => {
  const homeSource = ios.split("struct HomeView: View")[1]?.split("private struct ResponsiveToolGrid")[0] ?? "";
  assert.ok(homeSource.length > 0);
  assert.match(homeSource, /NativeTrendingToolsClient\.fetchToolIDs\(\)/);
  assert.match(homeSource, /trendingToolIDs\.compactMap/);
  assert.doesNotMatch(homeSource, /store\.catalog\.webSearch\("", limit: Int\.max/);
});
