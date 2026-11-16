import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../../src/lib/billing/http.server";
import { authorizeFlutterwaveCharge } from "../../../../../src/lib/billing/flutterwave.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 4_096);
  if (!body || typeof body.reference !== "string" ||
      (body.authorizationType !== "otp" && body.authorizationType !== "pin" && body.authorizationType !== "avs")) {
    return jsonResponse({ ok: false, error: "INVALID_AUTHORIZATION" }, 400);
  }
  try {
    const result = await authorizeFlutterwaveCharge({
      userId: auth.userId,
      reference: body.reference,
      authorizationType: body.authorizationType,
      otp: typeof body.otp === "string" ? body.otp : undefined,
      encryptedPin: typeof body.encryptedPin === "string" ? body.encryptedPin : undefined,
      nonce: typeof body.nonce === "string" ? body.nonce : undefined,
      customerAddress: body.customerAddress && typeof body.customerAddress === "object" &&
        !Array.isArray(body.customerAddress) ? {
          city: typeof (body.customerAddress as Record<string, unknown>).city === "string" ? String((body.customerAddress as Record<string, unknown>).city) : "",
          state: typeof (body.customerAddress as Record<string, unknown>).state === "string" ? String((body.customerAddress as Record<string, unknown>).state) : "",
          line1: typeof (body.customerAddress as Record<string, unknown>).line1 === "string" ? String((body.customerAddress as Record<string, unknown>).line1) : "",
          line2: typeof (body.customerAddress as Record<string, unknown>).line2 === "string" ? String((body.customerAddress as Record<string, unknown>).line2) : undefined,
          postalCode: typeof (body.customerAddress as Record<string, unknown>).postalCode === "string" ? String((body.customerAddress as Record<string, unknown>).postalCode) : "",
        } : undefined,
    });
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const requestId = randomUUID();
    if (status >= 500) {
      console.error("[billing-flutterwave-authorize] requestId=" + requestId +
        " causeType=" + (error instanceof Error ? error.name : "UnknownError"));
    }
    return jsonResponse({
      ok: false,
      error: typeof candidate.code === "string" ? candidate.code : "FLUTTERWAVE_AUTHORIZATION_FAILED",
      message: status < 500 && typeof candidate.message === "string"
        ? candidate.message
        : "The bank authorization could not be completed. No wallet tokens were added.",
      requestId,
    }, status);
  }
});
