import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, requireBillingUser } from "../../../../src/lib/billing/http.server";

/** Deliberately fails closed until real web/store adapters and webhook verification are configured. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  return jsonResponse({
    ok: false,
    error: "PAYMENTS_NOT_CONFIGURED",
    message: "No payment was taken. A verified payment-provider adapter and product catalog must be configured before checkout can start.",
  }, 503);
});
