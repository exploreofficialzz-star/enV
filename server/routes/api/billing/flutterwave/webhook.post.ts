import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";
import { handleFlutterwaveWebhook } from "../../../../../src/lib/billing/flutterwave.server";

export default defineHandler(async (event) => {
  if (event.req.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  try {
    const result = await handleFlutterwaveWebhook(event.req);
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "WEBHOOK_UNAVAILABLE";
    const requestId = randomUUID();
    if (status >= 500) {
      console.error("[billing-flutterwave-webhook] " + code + " requestId=" + requestId +
        " causeType=" + (error instanceof Error ? error.name : "UnknownError"));
    }
    return jsonResponse({
      ok: false,
      error: code,
      message: status < 500 && typeof candidate.message === "string"
        ? candidate.message
        : "The Flutterwave payment event could not be reconciled. No wallet tokens were added.",
      requestId,
    }, status);
  }
});
