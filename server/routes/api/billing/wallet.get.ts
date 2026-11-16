import { defineHandler } from "nitro/h3";
import { getWalletActivity, readWallet } from "../../../../src/lib/billing/ledger.server";
import { reconcilePendingPurchasesForUser } from "../../../../src/lib/billing/purchase-reconciliation.server";
import { jsonResponse, requireBillingUser } from "../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    await reconcilePendingPurchasesForUser(auth.userId);
    const requestUrl = new URL(event.req.url);
    const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
    const activityPage = await getWalletActivity(auth.userId, requestedLimit, requestUrl.searchParams.get("cursor"));
    const wallet = await readWallet(auth.userId);
    return jsonResponse({ ok: true, data: {
      wallet,
      activity: activityPage.items,
      activityNextCursor: activityPage.nextCursor,
      activityHasMore: activityPage.hasMore,
    } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "WALLET_UNAVAILABLE",
      message: "The wallet service is not ready. No payment or credit change was made.",
    }, 503);
  }
});
