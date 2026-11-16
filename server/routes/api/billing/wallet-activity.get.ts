import { defineHandler } from "nitro/h3";
import { getWalletActivity } from "../../../../src/lib/billing/ledger.server";
import { jsonResponse, requireBillingUser } from "../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    const requestUrl = new URL(event.req.url);
    const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
    const page = await getWalletActivity(auth.userId, requestedLimit, requestUrl.searchParams.get("cursor"));
    return jsonResponse({ ok: true, data: {
      activity: page.items,
      activityNextCursor: page.nextCursor,
      activityHasMore: page.hasMore,
    } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "WALLET_ACTIVITY_UNAVAILABLE",
      message: "Transaction history could not be loaded. Your wallet balance and payment records were not changed.",
    }, 503);
  }
});
