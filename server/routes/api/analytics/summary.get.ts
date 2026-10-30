import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse } from "../../../../src/lib/billing/http.server";
import { AnalyticsError, getAnalyticsSummary } from "../../../../src/lib/analytics/analytics.server";
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  try { return jsonResponse({ ok: true, data: await getAnalyticsSummary(request) }); }
  catch (error) {
    if (error instanceof AnalyticsError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "ANALYTICS_SUMMARY_UNAVAILABLE", message: "The developer analytics summary is temporarily unavailable." }, 503);
  }
});
