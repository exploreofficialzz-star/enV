import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "./db";

export class DeveloperAdminError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "DeveloperAdminError";
  }
}

const cookieName = "env_developer_admin";
const sessionLifetime = 8 * 60 * 60;

function configuration() {
  if (process.env.DEVELOPER_ADMIN_ENABLED !== "true") {
    throw new DeveloperAdminError("DEVELOPER_ADMIN_DISABLED", "The developer workspace is disabled.", 503);
  }
  const password = process.env.DEVELOPER_ADMIN_PASSWORD?.trim() ?? "";
  const secret = process.env.DEVELOPER_ADMIN_COOKIE_SECRET?.trim() ?? "";
  if (password.length < 24 || secret.length < 32) {
    throw new DeveloperAdminError("DEVELOPER_ADMIN_NOT_CONFIGURED", "Developer workspace credentials are not configured.", 503);
  }
  return { password, secret };
}

function networkDigest(request: Request, secret: string) {
  // Never let an untrusted request header select its own login throttle bucket.
  const forwarded = request.headers.get("x-vercel-forwarded-for");
  const address = forwarded?.split(",").at(-1)?.trim().slice(0, 128);
  if (!address) throw new DeveloperAdminError("ADMIN_RATE_LIMIT_UNAVAILABLE", "Secure sign-in throttling is unavailable. Please retry later.", 503);
  return createHmac("sha256", secret).update("developer-admin-network:" + address).digest("hex");
}

function cookieValue(request: Request) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return value.join("=");
  }
  return "";
}

export function hasDeveloperAdminSession(request: Request) {
  try {
    const { secret } = configuration();
    const token = cookieValue(request);
    const [payload, signature, ...extra] = token.split(".");
    if (!payload || !signature || extra.length) return false;
    const supplied = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", secret).update(payload).digest();
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      version?: number; sessionId?: string; issuedAt?: number; expiresAt?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    return data.version === 1
      && typeof data.sessionId === "string"
      && typeof data.issuedAt === "number"
      && typeof data.expiresAt === "number"
      && data.issuedAt <= now + 60
      && data.expiresAt > now
      && data.expiresAt - data.issuedAt <= sessionLifetime;
  } catch {
    return false;
  }
}

export async function createDeveloperAdminSession(request: Request, input: unknown) {
  const { password, secret } = configuration();
  if (!input || typeof input !== "object" || Array.isArray(input)
    || typeof (input as Record<string, unknown>).password !== "string"
    || (input as Record<string, string>).password.length > 256) {
    throw new DeveloperAdminError("INVALID_ADMIN_CREDENTIALS", "Enter the developer workspace password.", 400);
  }
  const supplied = (input as Record<string, string>).password;
  const expectedDigest = createHmac("sha256", secret).update(password).digest();
  const suppliedDigest = createHmac("sha256", secret).update(supplied).digest();
  const matches = timingSafeEqual(expectedDigest, suppliedDigest);

  const sql = await getSql();
  const subject = networkDigest(request, secret);
  const bucket = Math.floor(Date.now() / 900000);
  const allowed = await sql.query(
    `insert into developer_admin_login_rate_limits(subject_digest,window_bucket,request_count,updated_at)
     values($1,$2,1,now()) on conflict(subject_digest,window_bucket) do update
     set request_count=developer_admin_login_rate_limits.request_count+1,updated_at=now()
     where developer_admin_login_rate_limits.request_count<8 returning request_count`,
    [subject, bucket],
  );
  if (!allowed.length) throw new DeveloperAdminError("ADMIN_LOGIN_RATE_LIMITED", "Too many sign-in attempts. Try again later.", 429);
  if (!matches) throw new DeveloperAdminError("ADMIN_LOGIN_FAILED", "The developer workspace password is incorrect.", 401);

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1, sessionId: randomUUID(), issuedAt: now, expiresAt: now + sessionLifetime,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  await sql.query("delete from developer_admin_login_rate_limits where window_bucket<$1", [bucket - 96]);
  return {
    expiresAt: new Date((now + sessionLifetime) * 1000).toISOString(),
    setCookie: cookieName + "=" + payload + "." + signature
      + "; Path=/api; Max-Age=" + sessionLifetime + "; HttpOnly; Secure; SameSite=Strict",
  };
}

export function revokeDeveloperAdminSession() {
  return cookieName + "=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}
