import { timingSafeEqual } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { offlineRecoveryQueue } from "../../../../../src/lib/billing/offline.server";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";

function authorized(request: Request): boolean {
  const configured = process.env.BILLING_ADMIN_TOKEN?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!configured || Buffer.byteLength(configured, "utf8") < 32 || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Read-only recovery queue; this endpoint cannot settle, refund, or release tokens. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (!authorized(request)) return jsonResponse({ ok: false, error: "ADMIN_AUTH_REQUIRED" }, 401);
  const url = new URL(request.url, "http://localhost");
  const parsed = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
  try {
    return jsonResponse({ ok: true, data: { cases: await offlineRecoveryQueue(limit), readOnly: true } });
  } catch {
    return jsonResponse({ ok: false, error: "OFFLINE_RECOVERY_QUEUE_UNAVAILABLE" }, 503);
  }
});
