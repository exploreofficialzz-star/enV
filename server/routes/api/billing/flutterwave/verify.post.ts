import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../../src/lib/billing/http.server";
import { verifyAndCreditFlutterwaveReference } from "../../../../../src/lib/billing/flutterwave.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  const reference = typeof body?.reference === "string" ? body.reference : "";
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    return jsonResponse({ ok: false, error: "INVALID_PAYMENT_REFERENCE" }, 400);
  }
  try {
    const result = await verifyAndCreditFlutterwaveReference(reference, undefined, undefined, auth.userId);
    return jsonResponse({ ok: true, data: { status: "succeeded", result } });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    if (candidate.code === "PAYMENT_NOT_CONFIRMED") {
      return jsonResponse({ ok: true, data: { status: "pending" } });
    }
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    return jsonResponse({
      ok: false,
      error: typeof candidate.code === "string" ? candidate.code : "FLUTTERWAVE_VERIFICATION_FAILED",
      message: status < 500 && typeof candidate.message === "string"
        ? candidate.message
        : "Flutterwave has not confirmed this payment yet. No wallet tokens were added.",
    }, status);
  }
});
