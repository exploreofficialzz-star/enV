/** Node-only cryptography for offline allowance signatures and device-journal verification. */
import { createHash, createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { isCanonicalBase64Url, isValidBase64Url, type OfflineAllowanceClaims, type OfflinePublicJwk } from "./offline-protocol.ts";

export class OfflineCryptoError extends Error {
  readonly code: "OFFLINE_SIGNING_NOT_CONFIGURED" | "INVALID_ALLOWANCE_TOKEN" | "INVALID_DEVICE_SIGNATURE";
  constructor(code: "OFFLINE_SIGNING_NOT_CONFIGURED" | "INVALID_ALLOWANCE_TOKEN" | "INVALID_DEVICE_SIGNATURE", message: string) {
    super(message);
    this.code = code;
    this.name = "OfflineCryptoError";
  }
}

export function getOfflineSigningSecret(): string {
  const secret = process.env.OFFLINE_ALLOWANCE_SIGNING_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new OfflineCryptoError("OFFLINE_SIGNING_NOT_CONFIGURED", "Offline allowance signing is not configured with a sufficiently strong server secret.");
  }
  return secret;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Ensure a syntactically shaped JWK is an actual importable P-256 public point before reserving funds. */
export function isUsableOfflinePublicKey(jwk: OfflinePublicJwk): boolean {
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
  } catch {
    return false;
  }
}

function hmacBytes(secret: string, value: string): Buffer {
  return createHmac("sha256", secret).update(value, "utf8").digest();
}

export function signAllowanceToken(claims: OfflineAllowanceClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = hmacBytes(secret, payload).toString("base64url");
  return `${payload}.${signature}`;
}

export function verifyAllowanceToken(token: string, secret: string, expectedUserId: string, nowMs = Date.now()): OfflineAllowanceClaims {
  if (typeof token !== "string" || token.length > 4_096) throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token is invalid.");
  const pieces = token.split(".");
  if (pieces.length !== 2 || !isCanonicalBase64Url(pieces[0]) || !isValidBase64Url(pieces[1], 43, 43)) {
    throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token is invalid.");
  }
  const expected = hmacBytes(secret, pieces[0]!);
  let actual: Buffer;
  try { actual = Buffer.from(pieces[1]!, "base64url"); } catch { throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token is invalid."); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token signature is invalid.");
  }
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(pieces[0]!, "base64url").toString("utf8")); } catch {
    throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token payload is invalid.");
  }
  if (!claims || typeof claims !== "object") throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token payload is invalid.");
  const c = claims as Partial<OfflineAllowanceClaims>;
  if (c.v !== 1 || c.userId !== expectedUserId || typeof c.allowanceId !== "string" || c.allowanceId.length > 100 ||
      typeof c.deviceKeyDigest !== "string" || !/^[a-f0-9]{64}$/.test(c.deviceKeyDigest) ||
      !Number.isSafeInteger(c.allowanceSubunits) || (c.allowanceSubunits ?? 0) < 100 || (c.allowanceSubunits ?? Number.MAX_SAFE_INTEGER) > 20_000 ||
      typeof c.pricingVersion !== "string" || c.pricingVersion.length < 1 || c.pricingVersion.length > 120 ||
      !Number.isSafeInteger(c.issuedAt) || !Number.isSafeInteger(c.expiresAt) || !Number.isSafeInteger(c.syncUntil) ||
      (c.expiresAt ?? 0) <= (c.issuedAt ?? 0) || (c.expiresAt ?? 0) - (c.issuedAt ?? 0) > 72 * 60 * 60 + 1 ||
      (c.syncUntil ?? 0) !== (c.expiresAt ?? 0) + 14 * 24 * 60 * 60 ||
      (c.issuedAt ?? 0) * 1000 > nowMs + 5 * 60_000 || nowMs > (c.syncUntil ?? 0) * 1000) {
    throw new OfflineCryptoError("INVALID_ALLOWANCE_TOKEN", "The offline allowance token is expired or does not belong to this account.");
  }
  return c as OfflineAllowanceClaims;
}

/** Verify either WebCrypto's 64-byte IEEE-P1363 signature or native ECDSA DER output. */
export function verifyDeviceSignature(jwk: OfflinePublicJwk, message: string, signature: string): boolean {
  if (typeof signature !== "string" || signature.length < 80 || signature.length > 200 || !/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    const bytes = Buffer.from(signature, "base64url");
    if (bytes.length === 64 && verifySignature("sha256", Buffer.from(message, "utf8"), { key, dsaEncoding: "ieee-p1363" }, bytes)) return true;
    return verifySignature("sha256", Buffer.from(message, "utf8"), key, bytes);
  } catch {
    return false;
  }
}
