import { defineHandler } from "nitro/h3";
import { OfflineWalletError, syncOfflineAllowance } from "../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireOfflineBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 256_000);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "Provide a valid synchronization batch within the request size limit." }, 400);
  try {
    const result = await syncOfflineAllowance({
      userId: auth.userId,
      allowanceToken: body.allowanceToken as string,
      batchId: body.batchId as string,
      transactionsValue: body.transactions,
      checkpointSequence: body.checkpointSequence as number,
      checkpointSignature: body.checkpointSignature as string,
      finalized: body.finalized as boolean,
      expectedDeviceKeyDigest: auth.deviceKeyDigest,
      expectedPlatform: auth.platform ?? "web",
    });
    if ("status" in result && result.status === "needs_recovery") {
      return jsonResponse({ ok: true, data: result, warning: "The allowance needs recovery review; reserved balance has not been automatically released." }, 409);
    }
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "OFFLINE_SYNC_UNAVAILABLE", message: "Offline records were not reconciled. Retry with the same batch ID; unresolved funds remain reserved." }, 503);
  }
});
