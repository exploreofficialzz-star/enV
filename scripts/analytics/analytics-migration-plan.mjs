export const ANALYTICS_MIGRATION_FILES = Object.freeze([
  "0008_product_analytics.sql",
  "0012_analytics_dashboard_security.sql",
  "0013_analytics_daily_snapshots.sql",
  "0017_analytics_daily_reports.sql",
  "0018_analytics_dashboard_sessions.sql",
  "0019_analytics_core_rls.sql",
]);

/**
 * Build the ordered, analytics-only migration plan.
 * Shared Product Feedback and every other feature migration are deliberately
 * excluded from this allowlist.
 *
 * @param {Iterable<string>} availablePaths
 * @param {Iterable<string>} appliedNames
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingAnalyticsMigrations(availablePaths, appliedNames = []) {
  const available = new Set(
    [...availablePaths]
      .filter((path) => typeof path === "string" && path.endsWith(".sql"))
      .map((path) => path.split("/").at(-1)),
  );
  const missing = ANALYTICS_MIGRATION_FILES.filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error("Missing required analytics migration files: " + missing.join(", "));
  }

  const applied = new Set(
    [...appliedNames].map((name) => String(name).split("/").at(-1)),
  );
  return ANALYTICS_MIGRATION_FILES
    .filter((name) => !applied.has(name))
    .map((name) => ({ name, path: name }));
}

/**
 * Analytics events reference the existing Better Auth user table.
 * Fail closed before creating or changing any schema if it is absent.
 *
 * @param {{ userTableExists: boolean }} input
 */
export function assertAnalyticsMigrationPrerequisites({ userTableExists }) {
  if (userTableExists !== true) {
    throw new Error(
      'Analytics migrations require the existing public."user" table. ' +
      "No analytics schema changes were made; verify the auth baseline first.",
    );
  }
}
