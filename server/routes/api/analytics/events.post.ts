import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";
import { AnalyticsError, ingestAnalyticsEvents } from "../../../../src/lib/analytics/analytics.server";
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 16384);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "The analytics batch is invalid or too large." }, 400);
  try { return jsonResponse({ ok: true, data: await ingestAnalyticsEvents(request, body) }); }
  catch (error) {
    if (error instanceof AnalyticsError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "ANALYTICS_INGEST_UNAVAILABLE", message: "Usage events were not accepted. The client may retry safely." }, 503);
  }
});
