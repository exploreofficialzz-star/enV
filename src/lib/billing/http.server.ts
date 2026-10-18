/** HTTP/auth helpers shared by the monetization API routes. */
import { createSessionLookup } from "../ai/server/session";
import { readBoundedJsonObject } from "./bounded-json.server";
import { getSql } from "../db";
import { sha256Hex } from "./offline-crypto.server";

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const authConfigured = process.env.VITE_AUTH_ENABLED === "true";
const explicitAuthOrigin = (() => {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && isProduction) return null;
    return url.origin;
  } catch {
    return null;
  }
})();

const lookupUserId = createSessionLookup({
  baseUrl: (request) => explicitAuthOrigin ?? (!isProduction ? new URL(request.url).origin : null),
  timeoutMs: 3_000,
});

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
      .split(",")[0]!.trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJsonObject(request: Request, maxBytes = 4_096): Promise<Record<string, unknown> | null> {
  return readBoundedJsonObject(request, maxBytes);
}

export async function requireBillingUser(request: Request): Promise<{ userId: string | null; response?: Response }> {
  if (!authConfigured) {
    return {
      userId: null,
      response: jsonResponse({
        ok: false,
        error: "BILLING_AUTH_NOT_CONFIGURED",
        message: "A verified account is required for wallet balances and purchases. Account sign-in is not enabled for this deployment.",
      }, 503),
    };
  }
  const userId = await lookupUserId(request).catch(() => null);
  if (!userId) {
    return {
      userId: null,
      response: jsonResponse({ ok: false, error: "AUTH_REQUIRED", message: "Sign in to access your enV wallet." }, 401),
    };
  }
  return { userId };
}

/** Return a server-verified user id when auth is enabled, without making public preview endpoints require sign-in. */
export async function getOptionalBillingUserId(request: Request): Promise<string | null> {
  if (!authConfigured) return null;
  return lookupUserId(request).catch(() => null);
}


export type OfflineBillingPrincipal = {
  userId: string | null;
  response?: Response;
  platform?: "web" | "android" | "ios";
  deviceKeyDigest?: string;
  nativeSessionId?: string;
};

/**
 * Authenticate only the offline-wallet API with either the normal verified web session
 * or a short-lived native credential minted by the one-time account-pairing flow.
 * A malformed explicit bearer token never falls back to cookie authentication.
 */
export async function requireOfflineBillingUser(request: Request): Promise<OfflineBillingPrincipal> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    const web = await requireBillingUser(request);
    return { ...web, platform: "web" };
  }
  const match = /^Bearer (envnative1_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) {
    return { userId: null, response: jsonResponse({ ok: false, error: "NATIVE_SESSION_INVALID", message: "The paired device session is invalid. Pair this device again from the signed-in enV wallet." }, 401) };
  }
  if (!authConfigured) {
    return { userId: null, response: jsonResponse({ ok: false, error: "BILLING_AUTH_NOT_CONFIGURED", message: "Account-backed native wallet sessions are not enabled for this deployment." }, 503) };
  }
  try {
    const digest = sha256Hex(match[1]!);
    const sql = await getSql();
    const rows = await sql.query<{ id: string; user_id: string; platform: string; device_key_digest: string }>(
      `select id,user_id,platform,device_key_digest from billing_offline_native_sessions
       where token_digest=$1 and revoked_at is null and expires_at > now() limit 1`, [digest]);
    const row = rows[0];
    if (!row || (row.platform !== "android" && row.platform !== "ios") || !/^[a-f0-9]{64}$/.test(row.device_key_digest)) {
      return { userId: null, response: jsonResponse({ ok: false, error: "NATIVE_SESSION_INVALID", message: "The paired device session expired or was revoked. Pair the device again from your signed-in enV wallet." }, 401) };
    }
    await sql.query("update billing_offline_native_sessions set last_used_at=now() where id=$1 and revoked_at is null", [row.id]);
    return { userId: row.user_id, platform: row.platform, deviceKeyDigest: row.device_key_digest, nativeSessionId: row.id };
  } catch {
    return { userId: null, response: jsonResponse({ ok: false, error: "NATIVE_SESSION_UNAVAILABLE", message: "The paired device session could not be verified. Retry when the service is available." }, 503) };
  }
}
