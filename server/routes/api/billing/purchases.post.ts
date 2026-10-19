import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../src/lib/billing/http.server";
import { initializePaystackCheckout } from "../../../../src/lib/billing/paystack.server";

/** Checkout is opened server-side and remains closed until launch, enforcement, auth, and pricing are configured. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const body = await readJsonObject(request, 2_048);
  if (!body || typeof body.tokenPack !== "number" || !Number.isInteger(body.tokenPack) ||
      typeof body.idempotencyKey !== "string") {
    return jsonResponse({ ok: false, error: "INVALID_PURCHASE", message: "Choose a token pack and submit a fresh checkout request." }, 400);
  }
  try {
    const checkout = await initializePaystackCheckout({
      userId: auth.userId,
      tokenPack: body.tokenPack,
      idempotencyKey: body.idempotencyKey,
    });
    return jsonResponse({ ok: true, data: checkout }, 201);
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "PAYMENTS_UNAVAILABLE";
    const message = typeof candidate.message === "string" ? candidate.message : "Checkout is unavailable. No payment was taken.";
    return jsonResponse({ ok: false, error: code, message }, status);
  }
});
