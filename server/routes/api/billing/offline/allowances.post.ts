import { defineHandler } from "nitro/h3";
import { issueOfflineAllowance, OfflineWalletError } from "../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireOfflineBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 12_000);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "Provide a small JSON request body." }, 400);
  try {
    const result = await issueOfflineAllowance({
      userId: auth.userId,
      requestedSubunits: body.requestedSubunits as number,
      idempotencyKey: body.idempotencyKey as string,
      platform: body.platform as "web" | "android" | "ios",
      publicKeyValue: body.publicKeyJwk,
      expectedDeviceKeyDigest: auth.deviceKeyDigest,
      expectedPlatform: auth.platform ?? "web",
    });
    return jsonResponse({ ok: true, data: result }, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "OFFLINE_ALLOWANCE_UNAVAILABLE", message: "No offline allowance was issued and no wallet balance was changed. Retry later." }, 503);
  }
});
