import { defineHandler } from "nitro/h3";
import { TOKEN_SUBUNITS_PER_TOKEN } from "../../../../../src/lib/billing/catalog";
import { getOptionalBillingUserId, jsonResponse, requireOfflineBillingUser } from "../../../../../src/lib/billing/http.server";
import { readWallet } from "../../../../../src/lib/billing/ledger.server";
import { getAdFallbackQuote } from "../../../../../src/lib/ads/fallback.server";

export default defineHandler(async (event) => {
  const request = event.req;
  const toolId = new URL(request.url).searchParams.get("toolId") ?? "";
  const quote = getAdFallbackQuote(toolId);
  if (!quote) return jsonResponse({ ok: false, error: "AD_FALLBACK_NOT_AVAILABLE" }, 404);

  let userId: string | null = null;
  let platform: "web" | "android" | "ios" = "web";
  if (request.headers.has("authorization")) {
    const auth = await requireOfflineBillingUser(request);
    if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
    userId = auth.userId;
    platform = auth.platform ?? "web";
  } else {
    userId = await getOptionalBillingUserId(request);
  }

  try {
    const wallet = userId ? await readWallet(userId) : null;
    return jsonResponse({
      ok: true,
      data: {
        ...quote,
        availableSubunits: wallet?.availableSubunits ?? null,
        availableTokens: wallet ? wallet.availableSubunits / TOKEN_SUBUNITS_PER_TOKEN : null,
        authenticated: Boolean(userId),
        platform: userId ? platform : null,
        billingEnabled: process.env.BILLING_AD_FALLBACK_ENABLED === "true" &&
          process.env.BILLING_LAUNCH_ENABLED === "true" &&
          process.env.BILLING_ENFORCEMENT_ENABLED === "true" &&
          process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true",
      },
    });
  } catch {
    return jsonResponse({ ok: false, error: "AD_FALLBACK_ACCESS_UNAVAILABLE" }, 503);
  }
});
