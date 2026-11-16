import { timingSafeEqual } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { reconcilePendingPurchasesBatch } from "../../../../src/lib/billing/purchase-reconciliation.server";

function cronAuthorized(request: Request) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (!actual || expected.length < 32) return false;
  const supplied = Buffer.from(actual);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!cronAuthorized(request)) {
    return jsonResponse({ ok: false, error: "BILLING_RECONCILIATION_UNAUTHORIZED" }, 401);
  }

  try {
    const data = await reconcilePendingPurchasesBatch();
    return jsonResponse({ ok: true, data });
  } catch {
    console.error("[billing-purchase-reconciliation] Scheduled batch failed.");
    return jsonResponse({
      ok: false,
      error: "BILLING_RECONCILIATION_UNAVAILABLE",
      message: "The scheduled payment reconciliation could not complete.",
    }, 503);
  }
});
