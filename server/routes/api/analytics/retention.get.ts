import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { AnalyticsError, runAnalyticsRetention } from "../../../../src/lib/analytics/analytics.server";
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try { return jsonResponse({ ok: true, data: await runAnalyticsRetention(request) }); }
  catch (error) {
    if (error instanceof AnalyticsError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "ANALYTICS_RETENTION_FAILED", message: "The retention job did not complete." }, 503);
  }
});
