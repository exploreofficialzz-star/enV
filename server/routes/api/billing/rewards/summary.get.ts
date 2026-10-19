import { defineHandler } from "nitro/h3";
import { jsonResponse, requireBillingUser } from "../../../../../src/lib/billing/http.server";
import { getRewardsSummary } from "../../../../../src/lib/billing/rewards.server";

export default defineHandler(async (event) => {
  const auth = await requireBillingUser(event.req);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  try {
    const rewards = await getRewardsSummary(auth.userId);
    return jsonResponse({ ok: true, data: rewards });
  } catch {
    return jsonResponse({
      ok: false,
      error: "REWARDS_UNAVAILABLE",
      message: "Referral rewards are temporarily unavailable. Your wallet balance has not changed.",
    }, 503);
  }
});
