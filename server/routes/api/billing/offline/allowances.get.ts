import { defineHandler } from "nitro/h3";
import { listOfflineAllowances } from "../../../../../src/lib/billing/offline.server";
import { jsonResponse, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const auth = await requireOfflineBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    const allowances = await listOfflineAllowances(auth.userId, auth.deviceKeyDigest);
    return jsonResponse({ ok: true, data: allowances });
  } catch {
    return jsonResponse({ ok: false, error: "OFFLINE_STATUS_UNAVAILABLE", message: "Offline allowance status is temporarily unavailable." }, 503);
  }
});
