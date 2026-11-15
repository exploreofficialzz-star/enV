import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, requireBillingUser } from "../../../../../src/lib/billing/http.server";
import { getFlutterwaveCardEncryptionKey } from "../../../../../src/lib/billing/flutterwave.server";

export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(event.req)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    return jsonResponse({ ok: true, data: { encryptionKey: getFlutterwaveCardEncryptionKey() } });
  } catch {
    return jsonResponse({ ok: false, error: "FLUTTERWAVE_NOT_CONFIGURED" }, 503);
  }
});
