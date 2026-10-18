import { defineHandler } from "nitro/h3";
import { redeemOfflinePairingCode, OfflineWalletError } from "../../../../../../src/lib/billing/offline.server";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../../../src/lib/billing/http.server";

/** Public only to the extent that a single-use, 256-bit pairing code is a bearer credential. */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 8_192);
  if (!body || typeof body.pairingCode !== "string" || typeof body.publicKeyJwk !== "object" || body.publicKeyJwk === null ||
      (body.platform !== "android" && body.platform !== "ios")) {
    return jsonResponse({ ok: false, error: "INVALID_REQUEST", message: "Provide the one-time pairing code, native platform, and public device key." }, 400);
  }
  try {
    const data = await redeemOfflinePairingCode({ pairingCode: body.pairingCode, platform: body.platform, publicKeyValue: body.publicKeyJwk });
    // The raw token is intentionally returned exactly once; the database stores only its digest.
    return jsonResponse({ ok: true, data }, 201);
  } catch (error) {
    if (error instanceof OfflineWalletError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "PAIRING_UNAVAILABLE", message: "The pairing code was not redeemed. Generate a fresh code and retry." }, 503);
  }
});
