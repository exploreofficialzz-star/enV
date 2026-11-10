import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse } from "../../../../src/lib/billing/http.server";
import { getPublicTrendingTools } from "../../../../src/lib/analytics/analytics.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);

  try {
    const response = jsonResponse({ ok: true, data: await getPublicTrendingTools() });
    response.headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=900");
    return response;
  } catch {
    return jsonResponse({
      ok: false,
      error: "ANALYTICS_TRENDING_UNAVAILABLE",
      message: "Trending tools are temporarily unavailable.",
    }, 503);
  }
});
