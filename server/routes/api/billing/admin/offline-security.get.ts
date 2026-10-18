import { timingSafeEqual } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { offlineSecuritySummary } from "../../../../../src/lib/billing/offline.server";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";

function authorized(request: Request): boolean {
  const configured = process.env.BILLING_ADMIN_TOKEN?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!configured || Buffer.byteLength(configured, "utf8") < 32 || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export default defineHandler(async (event) => {
  const request = event.req;
  if (!authorized(request)) return jsonResponse({ ok: false, error: "ADMIN_AUTH_REQUIRED" }, 401);
  const url = new URL(request.url, "http://localhost");
  const parsed = Number(url.searchParams.get("hours") ?? 24);
  const hours = Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 168 ? parsed : 24;
  try {
    return jsonResponse({ ok: true, data: await offlineSecuritySummary(hours) });
  } catch {
    return jsonResponse({ ok: false, error: "SECURITY_REPORT_UNAVAILABLE" }, 503);
  }
});
