import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_SECONDS = 8 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertSecret(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new TypeError("A dashboard session secret of at least 32 characters is required.");
  }
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest();
}

export function issueDashboardSession(secret, nowSeconds, lifetimeSeconds = SESSION_SECONDS) {
  assertSecret(secret);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new TypeError("A valid issue time is required.");
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > SESSION_SECONDS) {
    throw new TypeError("Dashboard session lifetime must be between one second and eight hours.");
  }
  const sessionId = randomUUID();
  const expiresAt = nowSeconds + lifetimeSeconds;
  const payload = Buffer.from(JSON.stringify({ version: 1, sessionId, issuedAt: nowSeconds, expiresAt })).toString("base64url");
  const token = payload + "." + signature(payload, secret).toString("base64url");
  return { sessionId, issuedAt: nowSeconds, expiresAt, token };
}

export function readDashboardSession(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  if (typeof token !== "string" || token.length > 2048) return null;
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return null;

  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const [payload, suppliedText] = parts;
  let supplied;
  let session;
  try {
    supplied = Buffer.from(suppliedText, "base64url");
    const expected = signature(payload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!session || session.version !== 1 || typeof session.sessionId !== "string" || !UUID_PATTERN.test(session.sessionId)) return null;
  if (!Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt)) return null;
  if (session.issuedAt > nowSeconds + 60 || session.expiresAt <= nowSeconds) return null;
  if (session.expiresAt <= session.issuedAt || session.expiresAt - session.issuedAt > SESSION_SECONDS) return null;
  return { sessionId: session.sessionId.toLowerCase(), issuedAt: session.issuedAt, expiresAt: session.expiresAt };
}

export function dashboardSessionDigest(sessionId, secret) {
  assertSecret(secret);
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) throw new TypeError("A valid dashboard session ID is required.");
  return createHmac("sha256", secret).update("analytics-dashboard-session:" + sessionId.toLowerCase()).digest("hex");
}
