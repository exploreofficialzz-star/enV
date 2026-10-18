import { defineHandler } from "nitro/h3";
import { OfflineWalletError, reportOfflineAllowanceLost } from "../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireOfflineBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 4_096);
  if (!body || typeof body.allowanceId !== "string") return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400);
  try {
    const result = await reportOfflineAllowanceLost({ userId: auth.userId, allowanceId: body.allowanceId, expectedDeviceKeyDigest: auth.deviceKeyDigest, expectedPlatform: auth.platform ?? "web" });
    return jsonResponse({ ok: true, data: result }, result.status === "needs_recovery" ? 202 : 200);
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "OFFLINE_RECOVERY_UNAVAILABLE", message: "No tokens were automatically released. Retry later or contact support." }, 503);
  }
});
