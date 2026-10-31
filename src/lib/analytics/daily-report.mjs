const count = value => {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};
const toolId = value => {
  const text = String(value ?? "");
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(text) ? text : "";
};
const errorCode = value => {
  const text = String(value ?? "UNSPECIFIED");
  return /^[A-Z0-9_]{1,64}$/.test(text) ? text : "UNSPECIFIED";
};

/**
 * Builds a privacy-safe, deterministic daily product-health report from aggregate
 * database rows. Inputs contain no account, installation, session or raw user data.
 */
export function buildDailyAnalyticsReport({ day, overview = {}, tools = [], platforms = [], failures = [], generatedAt }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day ?? ""))) {
    throw new TypeError("A valid YYYY-MM-DD report day is required.");
  }
  const totals = {
    events: count(overview.events),
    installations: count(overview.installations),
    sessions: count(overview.sessions),
    toolsUsed: count(overview.toolsUsed),
    views: count(overview.views),
    starts: count(overview.starts),
    completed: count(overview.completed),
    failed: count(overview.failed),
    cancelled: count(overview.cancelled),
    abandoned: count(overview.abandoned),
    offlineEvents: count(overview.offlineEvents),
  };
  const toolActivity = tools.map(row => ({
    toolId: toolId(row.toolId),
    views: count(row.views),
    starts: count(row.starts),
    completed: count(row.completed),
    failed: count(row.failed),
    abandoned: count(row.abandoned),
  })).filter(row => row.toolId).sort((a,b) => b.failed-a.failed || b.views-a.views || a.toolId.localeCompare(b.toolId)).slice(0,50);
  const platformActivity = platforms.map(row => ({
    platform: ["web","android","ios"].includes(String(row.platform)) ? String(row.platform) : "unknown",
    events: count(row.events),
  })).sort((a,b) => b.events-a.events || a.platform.localeCompare(b.platform));
  const topFailures = failures.map(row => ({
    toolId: toolId(row.toolId),
    code: errorCode(row.code),
    count: count(row.count),
  })).filter(row => row.count > 0).sort((a,b) => b.count-a.count || a.toolId.localeCompare(b.toolId) || a.code.localeCompare(b.code)).slice(0,20);
  const date = generatedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(date))) throw new TypeError("generatedAt must be a valid timestamp.");
  return {
    schemaVersion: "env.analytics.daily-report.v1",
    reportDay: day,
    generatedAt: new Date(date).toISOString(),
    headline: totals.events === 0
      ? "No consented product activity was recorded."
      : `${totals.events} events across ${totals.toolsUsed} tools; ${totals.failed} failed executions and ${totals.abandoned} abandonment events were recorded.`,
    totals,
    tools: toolActivity,
    platforms: platformActivity,
    topFailures,
    interpretation: "These are aggregate events from users who opted in. An abandonment event indicates a page or app exit after a tool interaction; it is a friction signal, not proof of why a person left.",
  };
}
