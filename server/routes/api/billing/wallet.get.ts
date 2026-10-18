import { defineHandler } from "nitro/h3";
import { getWalletActivity, readWallet } from "../../../../src/lib/billing/ledger.server";
import { jsonResponse, requireBillingUser } from "../../../../src/lib/billing/http.server";

export default defineHandler(async (event) => {
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    const [wallet, activity] = await Promise.all([readWallet(auth.userId), getWalletActivity(auth.userId, 20)]);
    return jsonResponse({ ok: true, data: { wallet, activity } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "WALLET_UNAVAILABLE",
      message: "The wallet service is not ready. No payment or credit change was made.",
    }, 503);
  }
});
