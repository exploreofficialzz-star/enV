import { defineHandler } from "nitro/h3";
import { getTokenUsageDashboard } from "../../../../src/lib/billing/token-usage.server";
import { jsonResponse, requireOfflineBillingUser } from "../../../../src/lib/billing/http.server";
import { readWallet } from "../../../../src/lib/billing/ledger.server";

/** Shared, read-only token dashboard for a verified web session or paired native device. */
export default defineHandler(async (event) => {
  const auth = await requireOfflineBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const requestUrl = new URL(event.req.url);
  const timeZone = requestUrl.searchParams.get("timezone");
  try {
    const [wallet, tokenUsage] = await Promise.all([
      readWallet(auth.userId),
      getTokenUsageDashboard(auth.userId, timeZone),
    ]);
    const { userId: _userId, ...publicWallet } = wallet;
    return jsonResponse({ ok: true, data: { wallet: publicWallet, tokenUsage } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "TOKEN_USAGE_UNAVAILABLE",
      message: "Token usage history is temporarily unavailable. No balance was changed.",
    }, 503);
  }
});
