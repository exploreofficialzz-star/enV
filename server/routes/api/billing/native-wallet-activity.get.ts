import { defineHandler } from "nitro/h3";
import { jsonResponse, requireOfflineBillingUser } from "../../../../src/lib/billing/http.server";
import { getWalletActivity } from "../../../../src/lib/billing/ledger.server";

/** Account-scoped native transaction history for a valid paired device only. */
export default defineHandler(async (event) => {
  const auth = await requireOfflineBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  if ((auth.platform !== "android" && auth.platform !== "ios") || !auth.nativeSessionId) {
    return jsonResponse({
      ok: false,
      error: "NATIVE_PAIRING_REQUIRED",
      message: "Pair this device from your signed-in enV web Wallet to view transaction history.",
    }, 403);
  }
  try {
    const requestUrl = new URL(event.req.url);
    const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 50);
    const page = await getWalletActivity(auth.userId, requestedLimit, requestUrl.searchParams.get("cursor"));
    return jsonResponse({ ok: true, data: {
      activity: page.items,
      activityNextCursor: page.nextCursor,
      activityHasMore: page.hasMore,
    } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "NATIVE_WALLET_ACTIVITY_UNAVAILABLE",
      message: "Transaction history could not be loaded. No wallet balance or payment was changed.",
    }, 503);
  }
});
