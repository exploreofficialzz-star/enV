import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_MIGRATION_FILES,
  assertAnalyticsMigrationPrerequisites,
  pendingAnalyticsMigrations,
} from "./analytics-migration-plan.mjs";

const allFeatureMigrations = [
  "0001_auth.sql",
  "0008_product_analytics.sql",
  "0008_supabase_rls.sql",
  "0009_product_feedback.sql",
  "0009_world_lab_jobs.sql",
  "0010_tool_community.sql",
  "0012_analytics_dashboard_security.sql",
  "0013_analytics_daily_snapshots.sql",
  "0016_analytics_feedback_rls.sql",
  "0017_analytics_daily_reports.sql",
  "0018_analytics_dashboard_sessions.sql",
  "0019_analytics_core_rls.sql",
  "0020_analytics_privilege_lockdown.sql",
];

test("analytics migration plan contains only the User Behavior schema", () => {
  const pending = pendingAnalyticsMigrations(allFeatureMigrations, []);
  assert.deepEqual(
    pending.map(({ name }) => name),
    [
      "0008_product_analytics.sql",
      "0012_analytics_dashboard_security.sql",
      "0013_analytics_daily_snapshots.sql",
      "0017_analytics_daily_reports.sql",
      "0018_analytics_dashboard_sessions.sql",
      "0019_analytics_core_rls.sql",
      "0020_analytics_privilege_lockdown.sql",
    ],
  );
  assert.equal(pending.length, ANALYTICS_MIGRATION_FILES.length);
});

test("analytics plan never schedules shared feedback, community, wallet or World Lab migrations", () => {
  const pendingNames = new Set(
    pendingAnalyticsMigrations(allFeatureMigrations, []).map(({ name }) => name),
  );
  for (const excluded of [
    "0008_supabase_rls.sql",
    "0009_product_feedback.sql",
    "0009_world_lab_jobs.sql",
    "0010_tool_community.sql",
    "0016_analytics_feedback_rls.sql",
  ]) {
    assert.equal(
      pendingNames.has(excluded),
      false,
      excluded + " must stay out of the analytics rollout",
    );
  }
});

test("analytics plan skips only migrations already recorded as applied", () => {
  const pending = pendingAnalyticsMigrations(allFeatureMigrations, [
    "0008_product_analytics.sql",
    "0012_analytics_dashboard_security.sql",
  ]);
  assert.deepEqual(
    pending.map(({ name }) => name),
    [
      "0013_analytics_daily_snapshots.sql",
      "0017_analytics_daily_reports.sql",
      "0018_analytics_dashboard_sessions.sql",
      "0019_analytics_core_rls.sql",
      "0020_analytics_privilege_lockdown.sql",
    ],
  );
});

test("analytics plan fails closed when an allowlisted migration file is missing", () => {
  assert.throws(
    () => pendingAnalyticsMigrations(
      allFeatureMigrations.filter((name) => name !== "0020_analytics_privilege_lockdown.sql"),
      [],
    ),
    /Missing required analytics migration files/,
  );
});

test("analytics plan refuses to run without the existing auth user table", () => {
  assert.throws(
    () => assertAnalyticsMigrationPrerequisites({ userTableExists: false }),
    /require the existing public\."user" table/,
  );
  assert.doesNotThrow(
    () => assertAnalyticsMigrationPrerequisites({ userTableExists: true }),
  );
});
