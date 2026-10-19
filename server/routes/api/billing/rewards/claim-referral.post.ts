import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../../src/lib/billing/http.server";
import { claimReferral } from "../../../../../src/lib/billing/rewards.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  if (!body || typeof body.referralCode !== "string" ||
      (body.source !== "referral" && body.source !== "video") ||
      (body.signature !== undefined && typeof body.signature !== "string")) {
    return jsonResponse({ ok: false, error: "INVALID_REFERRAL", message: "The referral details are not valid." }, 400);
  }
  try {
    const result = await claimReferral({
      referredUserId: auth.userId,
      referralCode: body.referralCode,
      source: body.source,
      signature: body.signature,
    });
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "REFERRAL_UNAVAILABLE";
    const message = typeof candidate.message === "string" ? candidate.message : "The referral could not be attached. Retry later.";
    return jsonResponse({ ok: false, error: code, message }, status);
  }
});
