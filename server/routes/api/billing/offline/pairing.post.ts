import { defineHandler } from "nitro/h3";
import { createOfflinePairingCode, OfflineWalletError } from "../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";

/** Issue a one-time, high-entropy pairing code to a signed-in web account. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireOfflineBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  if (auth.platform !== "web" || auth.nativeSessionId) return jsonResponse({ ok: false, error: "WEB_ACCOUNT_SESSION_REQUIRED", message: "Create a device pairing code from the signed-in web wallet." }, 403);
  const body = await readJsonObject(request, 2_048);
  const platform = body?.platform;
  if (platform !== "android" && platform !== "ios") return jsonResponse({ ok: false, error: "INVALID_PLATFORM", message: "Choose Android or iOS." }, 400);
  try {
    const data = await createOfflinePairingCode({ userId: auth.userId, platform });
    return jsonResponse({ ok: true, data }, 201);
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "PAIRING_UNAVAILABLE", message: "No pairing code was created. Retry when the wallet service is available." }, 503);
  }
});
