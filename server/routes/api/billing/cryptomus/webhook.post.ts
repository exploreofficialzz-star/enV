import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";
import { handleCryptomusWebhook } from "../../../../../src/lib/billing/cryptomus.server";

export default defineHandler(async (event) => {
  if (event.req.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  try {
    const result = await handleCryptomusWebhook(event.req);
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const status = typeof candidate.status === "number" ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "WEBHOOK_UNAVAILABLE";
    const message = code === "CRYPTOMUS_REFUND_RECONCILIATION_REQUIRED"
      ? "This refund event needs manual wallet reconciliation. No wallet balance was changed; retry delivery after reconciliation is available."
      : typeof candidate.message === "string" && status < 500
        ? candidate.message
        : "The crypto payment event could not be verified. It will not change your wallet until verification succeeds.";
    const requestId = randomUUID();
    if (status >= 500) {
      console.error("[billing-cryptomus-webhook] " + code + " requestId=" + requestId +
        " causeType=" + (error instanceof Error ? error.name : "UnknownError"));
    }
    return jsonResponse({ ok: false, error: code, message, requestId }, status);
  }
});
