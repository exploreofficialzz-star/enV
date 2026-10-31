import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyAnalyticsReport } from "../../src/lib/analytics/daily-report.mjs";

test("daily report derives stable aggregate tool and platform summaries", () => {
  const report = buildDailyAnalyticsReport({
    day: "2026-10-30",
    generatedAt: "2026-10-31T03:00:00.000Z",
    overview: { events: 150, installations: 12, sessions: 32, toolsUsed: 4, views: 70, starts: 40, completed: 25, failed: 6, cancelled: 2, abandoned: 7, offlineEvents: 9 },
    tools: [
      { toolId: "image-resizer", views: 30, starts: 20, completed: 12, failed: 5, abandoned: 2 },
      { toolId: "json-formatter", views: 40, starts: 20, completed: 13, failed: 1, abandoned: 5 },
    ],
    platforms: [{ platform: "web", events: 100 }, { platform: "android", events: 35 }, { platform: "ios", events: 15 }],
    failures: [{ toolId: "image-resizer", code: "DECODE_FAILED", count: 4 }, { toolId: "json-formatter", code: "INVALID_INPUT", count: 2 }],
  });
  assert.equal(report.schemaVersion, "env.analytics.daily-report.v1");
  assert.equal(report.totals.events, 150);
  assert.equal(report.tools[0].toolId, "image-resizer");
  assert.equal(report.topFailures[0].code, "DECODE_FAILED");
  assert.equal(report.platforms[0].platform, "web");
  assert.match(report.headline, /6 failed executions/);
});

test("daily report sanitizes labels and rejects malformed report dates", () => {
  const report = buildDailyAnalyticsReport({
    day: "2026-10-30",
    overview: { events: -4, failures: "NaN" },
    tools: [{ toolId: "../private", views: 3 }],
    failures: [{ toolId: "tool", code: "User typed a password", count: 3 }],
  });
  assert.equal(report.totals.events, 0);
  assert.deepEqual(report.tools, []);
  assert.equal(report.topFailures[0].code, "UNSPECIFIED");
  assert.throws(() => buildDailyAnalyticsReport({ day: "yesterday" }), /YYYY-MM-DD/);
});
