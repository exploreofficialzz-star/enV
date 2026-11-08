import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../../src/lib/analytics/analytics.server.ts", import.meta.url), "utf8");
const revokeRoute = readFileSync(new URL("../../server/routes/api/analytics/admin/session/revoke.post.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../migrations/0018_analytics_dashboard_sessions.sql", import.meta.url), "utf8");
const liveSmoke = readFileSync(new URL("../check-subdomain-live.mjs", import.meta.url), "utf8");

test("consent withdrawal locks the consent row before deleting events and consent", () => {
  const withdrawalStart = server.indexOf("export async function saveAnalyticsConsent");
  const ingestionStart = server.indexOf("export async function ingestAnalyticsEvents");
  assert.ok(withdrawalStart >= 0 && ingestionStart > withdrawalStart);
  const withdrawal = server.slice(withdrawalStart, ingestionStart);
  const lock = withdrawal.indexOf("where subject_digest=$1 for update");
  const eventsDelete = withdrawal.indexOf("delete from product_analytics_events");
  const consentDelete = withdrawal.indexOf("delete from product_analytics_consents");
  assert.ok(lock >= 0 && eventsDelete > lock && consentDelete > eventsDelete);
});

test("event ingestion locks current consent before inserting a batch", () => {
  const ingestionStart = server.indexOf("export async function ingestAnalyticsEvents");
  const summaryStart = server.indexOf("export async function getAnalyticsSummary");
  const ingestion = server.slice(ingestionStart, summaryStart);
  const lock = ingestion.indexOf("where subject_digest=$1 and policy_version=$2 for update");
  const insert = ingestion.indexOf("insert into product_analytics_events");
  assert.ok(lock >= 0 && insert > lock);
});

test("browser dashboard sessions require an active server-side HMAC digest row", () => {
  assert.match(server, /readDashboardSession\(cookieToken\(request\), secret/);
  assert.match(server, /where session_digest=\$1 and revoked_at is null and expires_at>now\(\) limit 1/);
  assert.match(server, /dashboardSessionDigest\(session\.sessionId, secret\)/);
  assert.match(server, /set revoked_at=coalesce\(revoked_at, now\(\)\)/);
  assert.match(revokeRoute, /await revokeAnalyticsDashboardSession\(request\)/);
  assert.match(revokeRoute, /clearAnalyticsDashboardCookie\(\)/);
  assert.match(revokeRoute, /status:503/);
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
