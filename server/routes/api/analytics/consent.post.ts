import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";
import { AnalyticsError, saveAnalyticsConsent } from "../../../../src/lib/analytics/analytics.server";
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 4096);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "Provide a small valid consent request." }, 400);
  try { return jsonResponse({ ok: true, data: await saveAnalyticsConsent(request, body) }); }
  catch (error) {
    if (error instanceof AnalyticsError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "ANALYTICS_CONSENT_UNAVAILABLE", message: "The consent preference could not be saved." }, 503);
  }
});
