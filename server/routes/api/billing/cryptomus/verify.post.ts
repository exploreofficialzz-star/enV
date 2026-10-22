import { randomUUID } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { getSql } from "../../../../../src/lib/db";
import { verifyAndCreditCryptomusReference } from "../../../../../src/lib/billing/cryptomus.server";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../../../../../src/lib/billing/http.server";

/** Authenticated return-path verification. A return URL alone never grants wallet tokens. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  }
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) {
    return auth.response ?? jsonResponse({ ok: false, error: "AUTH_REQUIRED" }, 401);
  }
  const body = await readJsonObject(request, 2_048);
  const reference = typeof body?.reference === "string" ? body.reference : "";
  if (!/^[a-f0-9-]{36}$/i.test(reference)) {
    return jsonResponse({ ok: false, error: "INVALID_PAYMENT_REFERENCE", message: "The crypto payment reference is invalid." }, 400);
  }

  try {
    const sql = await getSql();
    const intents = await sql.query<{ user_id: string; provider: string }>(
      "select user_id, provider from billing_purchase_intents where id = $1 limit 1",
      [reference],
    );
    const intent = intents[0];
    if (!intent || intent.user_id !== auth.userId || intent.provider !== "cryptomus") {
      return jsonResponse({ ok: false, error: "PAYMENT_NOT_FOUND", message: "This crypto payment could not be found for the signed-in account." }, 404);
    }

    const result = await verifyAndCreditCryptomusReference(reference);
    return jsonResponse({
      ok: true,
      data: {
        status: result.status,
        credited: result.status === "credited" || result.status === "already-processed",
      },
    });
  } catch (error) {
    const candidate = error as { code?: unknown; status?: unknown };
    const status = typeof candidate.status === "number" && candidate.status < 500 ? candidate.status : 503;
    const code = typeof candidate.code === "string" ? candidate.code : "CRYPTO_VERIFICATION_UNAVAILABLE";
    const requestId = randomUUID();
    if (status >= 500) {
      console.error("[billing-cryptomus-verify] " + code + " requestId=" + requestId +
        " causeType=" + (error instanceof Error ? error.name : "UnknownError"));
    }
    return jsonResponse({
      ok: false,
      error: status < 500 ? code : "CRYPTO_VERIFICATION_UNAVAILABLE",
      message: status < 500
        ? "The payment reference could not be verified."
        : "The payment could not be checked right now. Your wallet will be credited only after verification succeeds.",
      requestId,
    }, status);
  }
});
