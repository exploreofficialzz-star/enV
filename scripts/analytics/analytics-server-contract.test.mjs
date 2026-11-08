import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../../src/lib/analytics/analytics.server.ts", import.meta.url), "utf8");
const privacyPage = readFileSync(new URL("../../src/routes/privacy.tsx", import.meta.url), "utf8");
const revokeRoute = readFileSync(new URL("../../server/routes/api/analytics/admin/session/revoke.post.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../migrations/0018_analytics_dashboard_sessions.sql", import.meta.url), "utf8");
const privilegeMigration = readFileSync(new URL("../../migrations/0020_analytics_privilege_lockdown.sql", import.meta.url), "utf8");
const analyticsMigrator = readFileSync(new URL("../migrate-analytics.mjs", import.meta.url), "utf8");
const liveSmoke = readFileSync(new URL("../check-subdomain-live.mjs", import.meta.url), "utf8");
const iosClient = readFileSync(new URL("../../apps/ios/enV/ContentViews.swift", import.meta.url), "utf8");
const iosToolViews = readFileSync(new URL("../../apps/ios/enV/ToolViews.swift", import.meta.url), "utf8");
const iosInfo = readFileSync(new URL("../../apps/ios/enV/Info.plist", import.meta.url), "utf8");
const iosProject = readFileSync(new URL("../../apps/ios/enV.xcodeproj/project.pbxproj", import.meta.url), "utf8");
const androidGradle = readFileSync(new URL("../../apps/android/app/build.gradle.kts", import.meta.url), "utf8");
const androidActivity = readFileSync(new URL("../../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

test("consent withdrawal locks the consent row before deleting events and consent", () => {
  const withdrawalStart = server.indexOf("export async function saveAnalyticsConsent");
  const ingestionStart = server.indexOf("export async function ingestAnalyticsEvents");
  assert.ok(withdrawalStart >= 0 && ingestionStart > withdrawalStart);
  const withdrawal = server.slice(withdrawalStart, ingestionStart);
  const advisoryLock = withdrawal.indexOf("pg_advisory_xact_lock(hashtextextended($1, 0))");
  const lock = withdrawal.indexOf("where subject_digest=$1 for update");
  const eventsDelete = withdrawal.indexOf("delete from product_analytics_events");
  const consentDelete = withdrawal.indexOf("delete from product_analytics_consents");
  assert.ok(advisoryLock >= 0 && lock > advisoryLock && eventsDelete > lock && consentDelete > eventsDelete);
});

test("event ingestion locks current consent before inserting a batch", () => {
  const ingestionStart = server.indexOf("export async function ingestAnalyticsEvents");
  const summaryStart = server.indexOf("export async function getAnalyticsSummary");
  const ingestion = server.slice(ingestionStart, summaryStart);
  const advisoryLock = ingestion.indexOf("pg_advisory_xact_lock(hashtextextended($1, 0))");
  const lock = ingestion.indexOf("where subject_digest=$1 and policy_version=$2 for update");
  const insert = ingestion.indexOf("insert into product_analytics_events");
  assert.ok(advisoryLock >= 0 && lock > advisoryLock && insert > lock);
});

test("browser dashboard sessions require an active server-side HMAC digest row", () => {
  assert.match(server, /readDashboardSession\(cookieToken\(request\), secret/);
  assert.match(server, /where session_digest=\$1 and revoked_at is null and expires_at>now\(\) limit 1/);
  assert.match(server, /dashboardSessionDigest\(session\.sessionId, secret\)/);
  assert.match(server, /set revoked_at=coalesce\(revoked_at, now\(\)\)/);
  assert.match(revokeRoute, /await revokeAnalyticsDashboardSession\(request\)/);
  assert.match(revokeRoute, /clearAnalyticsDashboardCookie\(\)/);
  assert.match(revokeRoute, /status:503/);
  const revokeFailure = revokeRoute.slice(revokeRoute.indexOf("} catch {"));
  assert.match(revokeFailure, /Your session remains active/);
  assert.doesNotMatch(revokeFailure, /set-cookie.*clearCookie/);
  assert.match(server, /where session_digest=\$1 and revoked_at is null/);
});

test("dashboard session migration stores only HMAC digests and enables RLS", () => {
  assert.match(migration, /session_digest text primary key check/);
  assert.match(migration, /alter table public\.product_analytics_dashboard_sessions enable row level security/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.doesNotMatch(migration, /cookie_token|raw_session|session_id text/i);
  assert.doesNotMatch(migration, /create policy/i);
});

test("live smoke requires an enabled dashboard login and strict API denial", () => {
  assert.match(liveSmoke, /enabled developer sign-in page was not rendered/);
  assert.match(liveSmoke, /dashboard UI is disabled in the production Web build/);
  assert.match(liveSmoke, /\[401, 403\]\.includes\(summary\.status\)/);
  assert.doesNotMatch(liveSmoke, /\[401, 403, 503\]\.includes\(summary\.status\)/);
});

test("Web, Android and iOS collection switches default off", () => {
  assert.match(envExample, /^ANALYTICS_ENABLED=false$/m);
  assert.match(envExample, /^VITE_ANALYTICS_ENABLED=false$/m);
  assert.match(envExample, /^VITE_ANALYTICS_DASHBOARD_ENABLED=false$/m);
  assert.match(androidGradle, /buildConfigField\("boolean",\s*"ANALYTICS_ENABLED",\s*providers\.gradleProperty\("envAnalyticsEnabled"\)\.orNull \?: "false"\)/);
  assert.match(iosInfo, /<key>ENV_ANALYTICS_ENABLED<\/key>\s*<string>\$\(ENV_ANALYTICS_ENABLED\)<\/string>/);
  assert.match(iosProject, /ENV_ANALYTICS_ENABLED = NO/);
  assert.match(iosClient, /\[("1",\s*"yes",\s*"true")\]/);
});

test("iOS records tool views and unfinished executions", () => {
  assert.match(iosToolViews, /NativeAnalyticsClient\.record\("tool_viewed", toolID: tool\.id\)/);
  assert.match(iosToolViews, /func abandon\(\)/);
  assert.match(iosToolViews, /"tool_abandoned"/);
  assert.match(iosToolViews, /NATIVE_TOOL_LEFT_BEFORE_RESULT/);
  assert.match(iosToolViews, /\.onDisappear \{ executionTracker\.abandon\(\) \}/);
});

test("iOS synchronous tools record repeated identical results", () => {
  assert.match(iosToolViews, /var completion: \(\(\) -> Bool\)\? = nil/);
  assert.match(iosToolViews, /if let completion \{\s*executionTracker\?\.finish\(success: completion\(\)\)/);
  const synchronousRuns = iosToolViews.match(/completion: \{ error(?: == nil|\.isEmpty) \}/g) ?? [];
  assert.equal(synchronousRuns.length, 11);
});

test("Android records native tool executions abandoned before a result", () => {
  assert.match(androidActivity, /DisposableEffect\(telemetry\)\s*\{\s*onDispose \{ telemetry\.abandon\(\) \}/);
  assert.match(androidActivity, /@Synchronized fun abandon\(\)/);
  assert.match(androidActivity, /"tool_abandoned"/);
  assert.match(androidActivity, /NATIVE_TOOL_LEFT_BEFORE_RESULT/);
});


test("analytics tables and migration ledger are private to the server role", () => {
  assert.match(privilegeMigration, /alter table public\._migrations enable row level security/i);
  assert.match(privilegeMigration, /revoke all privileges on table[\s\S]*from public/i);
  assert.match(privilegeMigration, /array\['anon',\s*'authenticated'\]/i);
  for (const table of [
    "public._migrations",
    "public.product_analytics_consents",
    "public.product_analytics_events",
    "public.product_analytics_rate_limits",
    "public.product_analytics_admin_rate_limits",
    "public.product_analytics_daily_snapshots",
    "public.product_analytics_daily_reports",
    "public.product_analytics_dashboard_sessions",
  ]) {
    assert.ok(privilegeMigration.includes(table), table + " must be included in the access lockdown");
  }
  assert.doesNotMatch(privilegeMigration, /create policy/i);
});

test("analytics migrator uses pooler-safe transaction-scoped locking", () => {
  assert.match(analyticsMigrator, /SET LOCAL search_path TO public/);
  assert.match(analyticsMigrator, /pg_advisory_xact_lock/);
  assert.match(analyticsMigrator, /await client\.query\("BEGIN"\)/);
  assert.match(analyticsMigrator, /await client\.query\("COMMIT"\)/);
  assert.doesNotMatch(analyticsMigrator, /pg_advisory_lock\(/);
  assert.doesNotMatch(analyticsMigrator, /pg_advisory_unlock/);
  assert.doesNotMatch(analyticsMigrator, /SET search_path TO public/);
});


test("public privacy notice states analytics purpose, identifiers, retention and withdrawal", () => {
  const sectionStart = privacyPage.indexOf('<h2 className="text-lg font-semibold text-fg">Optional analytics</h2>');
  const sectionEnd = privacyPage.indexOf('<h2 className="text-lg font-semibold text-fg">Community and public content</h2>');
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  const section = privacyPage.slice(sectionStart, sectionEnd);
  assert.match(section, /product analytics helps/i);
  assert.match(section, /not used to target advertisements/i);
  assert.match(section, /keyed HMAC digests/i);
  assert.match(section, /private dashboard sign-in/i);
  assert.match(section, /only the digest is stored/i);
  assert.match(section, /pseudonymous/i);
  assert.match(section, /90 days from receipt/i);
  assert.match(section, /up to 730 days/i);
  assert.match(section, /offline/i);
  assert.match(section, /revocation request/i);
  assert.match(section, /eu-central-1/);
  assert.doesNotMatch(section, /raw IP addresses.*are collected/i);
});
