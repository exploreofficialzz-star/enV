import { defineHandler } from "nitro/h3";
import { listOfflineNativeSessions } from "../../../../../../src/lib/billing/offline.server";
import { jsonResponse, requireBillingUser } from "../../../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    return jsonResponse({ ok: true, data: await listOfflineNativeSessions(auth.userId) });
  } catch {
    return jsonResponse({ ok: false, error: "PAIRING_SESSIONS_UNAVAILABLE", message: "Paired devices could not be loaded." }, 503);
  }
});
