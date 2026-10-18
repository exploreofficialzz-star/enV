import { defineHandler } from "nitro/h3";
import { revokeOfflineNativeSession, OfflineWalletError } from "../../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  if (!body || typeof body.sessionId !== "string") return jsonResponse({ ok: false, error: "INVALID_REQUEST" }, 400);
  try {
    return jsonResponse({ ok: true, data: await revokeOfflineNativeSession({ userId: auth.userId, sessionId: body.sessionId }) });
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "PAIRING_REVOKE_UNAVAILABLE", message: "The device was not revoked. Retry or contact support." }, 503);
  }
});
