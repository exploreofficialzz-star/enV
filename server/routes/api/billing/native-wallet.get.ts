import { defineHandler } from "nitro/h3";
import { jsonResponse, requireOfflineBillingUser } from "../../../../src/lib/billing/http.server";
import { readWallet, getWalletActivity } from "../../../../src/lib/billing/ledger.server";
import { getRewardsSummary } from "../../../../src/lib/billing/rewards.server";
import { getTokenUsageDashboard } from "../../../../src/lib/billing/token-usage.server";

/**
 * Read-only native Wallet snapshot. It requires a currently valid, revocable paired-device
 * credential; the web account's cookie-only session cannot call this native route.
 */
export default defineHandler(async (event) => {
  const auth = await requireOfflineBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  if ((auth.platform !== "android" && auth.platform !== "ios") || !auth.nativeSessionId) {
    return jsonResponse({
      ok: false,
      error: "NATIVE_PAIRING_REQUIRED",
      message: "Open the signed-in enV web Wallet and pair this native device to view account balances.",
    }, 403);
  }
  try {
    const timeZone = new URL(event.req.url).searchParams.get("timezone");
    const [wallet, activity, rewards, tokenUsage] = await Promise.all([
      readWallet(auth.userId),
      getWalletActivity(auth.userId, 20),
      getRewardsSummary(auth.userId),
      getTokenUsageDashboard(auth.userId, timeZone),
    ]);
    const { userId: _userId, ...walletSnapshot } = wallet;
    return jsonResponse({ ok: true, data: { wallet: walletSnapshot, activity, rewards, tokenUsage } });
  } catch {
    return jsonResponse({
      ok: false,
      error: "NATIVE_WALLET_UNAVAILABLE",
      message: "The shared wallet could not be loaded. No balance or payment was changed.",
    }, 503);
  }
});
