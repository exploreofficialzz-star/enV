/** Shared, deterministic wire contract for Web, Android, iOS, and the wallet API. */
export type OfflinePlatform = "web" | "android" | "ios";

export interface OfflinePublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
  [key: string]: unknown;
}

export interface OfflineTransactionRecord {
  transactionId: string;
  sequenceNumber: number;
  toolId: string;
  pricingVersion: string;
  unitCount: number;
  outcome: "succeeded" | "failed";
  recordedAt: string;
  signature: string;
}

export interface OfflineAllowanceClaims {
  v: 1;
  allowanceId: string;
  userId: string;
  deviceKeyDigest: string;
  allowanceSubunits: number;
  pricingVersion: string;
  issuedAt: number;
  expiresAt: number;
  syncUntil: number;
}

/** Exact array ordering is part of protocol v1; change it only with a version bump. */
export function canonicalOfflineTransaction(input: {
  allowanceId: string;
  transactionId: string;
  sequenceNumber: number;
  toolId: string;
  pricingVersion: string;
  unitCount: number;
  outcome: "succeeded" | "failed";
  recordedAt: string;
}): string {
  return JSON.stringify([
    input.allowanceId,
    input.transactionId,
    input.sequenceNumber,
    input.toolId,
    input.pricingVersion,
    input.unitCount,
    input.outcome,
    input.recordedAt,
  ]);
}

export function canonicalOfflineCheckpoint(input: {
  allowanceId: string;
  checkpointSequence: number;
  finalized: boolean;
}): string {
  return JSON.stringify([input.allowanceId, input.checkpointSequence, input.finalized]);
}

export function canonicalOfflinePublicKey(jwk: OfflinePublicJwk): string {
  return JSON.stringify([jwk.kty, jwk.crv, jwk.x, jwk.y]);
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Reject alternate textual encodings of the same bytes (including non-zero unused trailing bits).
 * Canonical encodings matter because signatures, key digests, replay IDs, and audit hashes use text.
 */
export function isCanonicalBase64Url(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const remainder = value.length % 4;
  if (remainder === 1) return false;
  const last = BASE64URL_ALPHABET.indexOf(value[value.length - 1]!);
  if (last < 0) return false;
  if (remainder === 2 && (last & 0x0f) !== 0) return false;
  if (remainder === 3 && (last & 0x03) !== 0) return false;
  return true;
}

export function isValidBase64Url(value: unknown, minLength = 16, maxLength = 512): value is string {
  return isCanonicalBase64Url(value) && value.length >= minLength && value.length <= maxLength;
}

export function normalizeOfflinePublicJwk(value: unknown): OfflinePublicJwk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // A private key MUST never cross the device/server boundary.
  if ("d" in record || record.kty !== "EC" || record.crv !== "P-256" ||
      typeof record.x !== "string" || typeof record.y !== "string" ||
      !/^([A-Za-z0-9_-]{43})$/.test(record.x) || !/^([A-Za-z0-9_-]{43})$/.test(record.y) ||
      !isCanonicalBase64Url(record.x) || !isCanonicalBase64Url(record.y)) return null;
  const x = BufferlessBase64Length(record.x);
  const y = BufferlessBase64Length(record.y);
  if (x !== 32 || y !== 32) return null;
  // Whitelist fields. Ignore client metadata and never persist arbitrary JSON.
  return { kty: "EC", crv: "P-256", x: record.x, y: record.y, ext: true, key_ops: ["verify"] };
}

function BufferlessBase64Length(value: string): number {
  // base64url strings are unpadded; 43 characters represents exactly 32 bytes.
  // Strict character/length checks happen above; avoid Node-only APIs in this shared module.
  return Math.floor(value.length * 3 / 4);
}

export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}
