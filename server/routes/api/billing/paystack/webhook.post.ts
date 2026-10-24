import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";
import { handlePaystackWebhook } from "../../../../../src/lib/billing/paystack.server";

export default defineHandler(async (event) => {
  if (event.req.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const result = await handlePaystackWebhook(event.req);
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "WEBHOOK_UNAVAILABLE";
    const message = typeof candidate.message === "string" && status < 500 ? candidate.message : "The payment event could not be verified. Retry delivery later.";
    return jsonResponse({ ok: false, error: code, message }, status);
  }
});
