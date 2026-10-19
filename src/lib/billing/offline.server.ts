/** Server-authoritative offline wallet lifecycle. Feature flags fail closed by default. */
import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "../db";
import { PRICING_VERSION } from "./catalog";
import { getToolBillingProfile } from "./tool-profiles.server";
import { canResumeOfflineSync, isLocalTestFinalizationEnabled } from "./offline-recovery-policy";
import {
  canonicalOfflineCheckpoint,
  canonicalOfflinePublicKey,
  canonicalOfflineTransaction,
  isCanonicalUtcTimestamp,
  isValidBase64Url,
  normalizeOfflinePublicJwk,
  type OfflineAllowanceClaims,
  type OfflinePlatform,
  type OfflinePublicJwk,
  type OfflineTransactionRecord,
} from "./offline-protocol";
import {
  getOfflineSigningSecret,
  isUsableOfflinePublicKey,
  OfflineCryptoError,
  sha256Hex,
  signAllowanceToken,
  verifyAllowanceToken,
  verifyDeviceSignature,
} from "./offline-crypto.server";

const TOKEN_SUBUNITS_PER_TOKEN = 1_000;
const MAX_ALLOWANCE_SUBUNITS = 20 * TOKEN_SUBUNITS_PER_TOKEN;
const MAX_ACTIVE_ALLOWANCES_PER_USER = 3;
const MAX_TRANSACTIONS_PER_BATCH = 250;
const SYNC_GRACE_SECONDS = 14 * 24 * 60 * 60;
const OFFLINE_BILLABLE_KEYS = new Set(["local.calculator"]);

type OfflineErrorCode =
  | "OFFLINE_FEATURE_DISABLED" | "OFFLINE_PRODUCTION_LOCKED" | "OFFLINE_SIGNING_NOT_CONFIGURED"
  | "INVALID_REQUEST" | "RATE_LIMITED" | "INSUFFICIENT_CREDITS" | "ALLOWANCE_NOT_FOUND"
  | "ALLOWANCE_ALREADY_ACTIVE" | "ALLOWANCE_LIMIT_REACHED" | "ALLOWANCE_NOT_ACTIVE"
  | "INVALID_ALLOWANCE_TOKEN" | "INVALID_DEVICE_SIGNATURE" | "IDEMPOTENCY_CONFLICT"
  | "SEQUENCE_GAP" | "OFFLINE_NEEDS_RECOVERY" | "OFFLINE_PRICING_NOT_APPROVED"
  | "OFFLINE_FINALIZATION_VERIFIER_REQUIRED" | "PAIRING_CODE_INVALID" | "PAIRING_LIMIT_REACHED"
  | "NATIVE_SESSION_INVALID" | "DEVICE_BINDING_MISMATCH" | "NATIVE_SESSION_NOT_FOUND";

export class OfflineWalletError extends Error {
  readonly code: OfflineErrorCode;
  readonly status: number;
  constructor(code: OfflineErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "OfflineWalletError";
  }
}

type DbAllowance = {
  id: string; user_id: string; reservation_id: string; device_key_digest: string;
  device_public_key: unknown; allowance_subunits: number | string; pricing_version: string;
  status: string; issued_at: string | Date; expires_at: string | Date; last_sync_at: string | Date | null;
  last_accepted_sequence: number | string; last_processed_sequence: number | string;
  accepted_subunits: number | string; issue_idempotency_key: string | null; token_digest: string | null;
  platform: string;
  recovery_reason: string | null;
};

type NormalizedTransaction = OfflineTransactionRecord;
type SyncInput = {
  userId: string;
  allowanceToken: string;
  batchId: string;
  transactions: NormalizedTransaction[];
  checkpointSequence: number;
  checkpointSignature: string;
  finalized: boolean;
  expectedDeviceKeyDigest?: string;
  expectedPlatform?: OfflinePlatform;
};

function productionRuntime(): boolean {
  // Any configured external database may contain durable customer balances. Keep the
  // offline client-claim protocol locked there even if a staging deploy mislabels NODE_ENV.
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || Boolean(process.env.DATABASE_URL?.trim());
}

function localTestFinalizationEnabled(): boolean {
  return isLocalTestFinalizationEnabled({ flag: process.env.BILLING_OFFLINE_TEST_FINALIZATION,
    nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, databaseUrl: process.env.DATABASE_URL });
}

/** Offline operations intentionally remain unavailable in production until app/device attestation is implemented and reviewed. */
export function offlineWalletAvailability(): { enabled: boolean; code: string; message: string } {
  if (productionRuntime()) return {
    enabled: false,
    code: "INTEGRITY_VERIFICATION_REQUIRED",
    message: "Offline token spending is paused until independent native app-integrity verification and security review are implemented.",
  };
  if (process.env.VITE_AUTH_ENABLED !== "true") return {
    enabled: false, code: "AUTH_NOT_CONFIGURED",
    message: "Account authentication is not enabled, so enV cannot securely bind offline allowances to a shared wallet. Configure and verify account authentication first.",
  };
  if (process.env.BILLING_OFFLINE_ENABLED !== "true") return {
    enabled: false, code: "FEATURE_DISABLED",
    message: "Offline token spending is not enabled for this deployment.",
  };
  if (process.env.BILLING_OFFLINE_PRICING_APPROVED !== "true") return {
    enabled: false, code: "PRICING_NOT_APPROVED",
    message: "Offline pricing has not been approved for this deployment.",
  };
  try { getOfflineSigningSecret(); }
  catch { return { enabled: false, code: "SIGNING_NOT_CONFIGURED", message: "Offline wallet signing is not configured." }; }
  if (!localTestFinalizationEnabled()) return {
    enabled: false, code: "FINALIZATION_VERIFIER_REQUIRED",
    message: "Offline allowance issuance remains paused until independent finalization verification is configured. For isolated local integration tests only, an explicit test-finalization flag is supported when no external database is configured.",
  };
  return {
    enabled: true, code: "LOCAL_TEST_ONLY",
    message: "Local test-only mode: this ephemeral in-memory wallet can test allowance issuance, synchronization, and settlement. Never enable test finalization in staging or production.",
  };
}

function requireOfflineEnabled(): string {
  if (productionRuntime()) {
    throw new OfflineWalletError(
      "OFFLINE_PRODUCTION_LOCKED",
      "Offline token enforcement is disabled in production until native integrity checks and an independent review are complete; browser-local execution cannot be made tamper-proof and must not be hard-billed on client claims alone.",
      503,
    );
  }
  if (process.env.BILLING_OFFLINE_ENABLED !== "true") {
    throw new OfflineWalletError("OFFLINE_FEATURE_DISABLED", "Offline wallet support is not enabled for this deployment.", 503);
  }
  if (process.env.BILLING_OFFLINE_PRICING_APPROVED !== "true") {
    throw new OfflineWalletError("OFFLINE_PRICING_NOT_APPROVED", "Offline token rates have not been approved for this deployment.", 503);
  }
  try { getOfflineSigningSecret(); }
  catch { throw new OfflineWalletError("OFFLINE_SIGNING_NOT_CONFIGURED", "Offline signing is not configured. No wallet balance was changed.", 503); }
  if (!localTestFinalizationEnabled()) {
    throw new OfflineWalletError("OFFLINE_FINALIZATION_VERIFIER_REQUIRED", "Independent finalization verification is not configured. Offline allowances cannot be issued until the verifier or the explicit local-only test mode is enabled.", 503);
  }
  return getOfflineSigningSecret();
}

function safeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 120 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new OfflineWalletError("INVALID_REQUEST", "Provide an idempotency key containing 8–120 letters, digits, underscores or hyphens.");
  }
  return value;
}

function platformValue(value: unknown): OfflinePlatform {
  if (value === "web" || value === "android" || value === "ios") return value;
  throw new OfflineWalletError("INVALID_REQUEST", "Platform must be web, android, or ios.");
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : value == null ? NaN : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("A stored offline wallet amount is invalid.");
  return parsed;
}

function dateMillis(value: string | Date): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("A stored offline wallet timestamp is invalid.");
  return result;
}

async function recordSecurityEvent(input: {
  userId?: string | null; eventType: string; severity: "info" | "low" | "medium" | "high" | "critical";
  eventKey: string; reasonCode: string; platform?: OfflinePlatform | "server"; metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = await getSql();
    const allowedMetadata: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(input.metadata ?? {}).slice(0, 12)) {
      if (/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
          (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        allowedMetadata[key] = typeof value === "string" ? value.slice(0, 120) : value;
      }
    }
    await sql.query(
      `insert into billing_security_events
        (id, user_id, event_type, severity, event_key, subject_digest, platform, reason_code, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (event_key) do nothing`,
      [randomUUID(), input.userId ?? null, input.eventType.slice(0, 80), input.severity,
        input.eventKey.slice(0, 200), input.userId ? sha256Hex(input.userId) : null,
        input.platform ?? "server", input.reasonCode.slice(0, 100), JSON.stringify(allowedMetadata)],
    );
  } catch {
    // Security telemetry must never contain sensitive content or prevent the primary safe failure.
  }
}

async function consumeRateLimit(input: {
  action: string; subject: string; maximum: number; windowMs: number;
}): Promise<boolean> {
  const sql = await getSql();
  const bucketMs = Math.floor(Date.now() / input.windowMs) * input.windowMs;
  const bucket = new Date(bucketMs).toISOString();
  const rows = await sql.query<{ hit_count: number | string }>(
    `insert into billing_security_rate_limits (action, subject_digest, window_start, hit_count)
     values ($1, $2, $3, 1)
     on conflict (action, subject_digest, window_start) do update
       set hit_count = billing_security_rate_limits.hit_count + 1, updated_at = now()
       where billing_security_rate_limits.hit_count < $4
     returning hit_count`,
    [input.action, sha256Hex(input.subject), bucket, input.maximum],
  );
  return rows.length > 0;
}

async function requireRateLimit(input: { action: string; subject: string; maximum: number; windowMs: number; userId: string; platform?: OfflinePlatform }) {
  if (await consumeRateLimit(input)) return;
  await recordSecurityEvent({
    userId: input.userId, eventType: "offline_rate_limit", severity: "medium",
    eventKey: sha256Hex(`${input.action}:${input.subject}:${Math.floor(Date.now() / input.windowMs)}`),
    reasonCode: "RATE_LIMIT_EXCEEDED", platform: input.platform,
    metadata: { action: input.action, maximum: input.maximum, windowMs: input.windowMs },
  });
  throw new OfflineWalletError("RATE_LIMITED", "Too many offline-wallet requests. Please wait before trying again.", 429);
}

async function ensureAccount(tx: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<void> {
  await tx.query("insert into billing_accounts (user_id) values ($1) on conflict (user_id) do nothing", [userId]);
}

/** Device pairing authorizes a revocable, read-only Wallet session even while offline spending is disabled. */
export async function createOfflinePairingCode(input: { userId: string; platform: "android" | "ios" }) {
  if (input.platform !== "android" && input.platform !== "ios") {
    throw new OfflineWalletError("INVALID_REQUEST", "Choose Android or iOS for this pairing request.");
  }
  await requireRateLimit({ action: "offline-pair-code-create", subject: input.userId, maximum: 5,
    windowMs: 60 * 60_000, userId: input.userId, platform: input.platform });
  const pairingCode = `envpair1_${randomBytes(32).toString("base64url")}`;
  const codeDigest = sha256Hex(pairingCode);
  const pairingId = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    await ensureAccount(tx, input.userId);
    await tx.query(`update billing_offline_pairing_codes set consumed_at = coalesce(consumed_at, now())
      where user_id = $1 and platform = $2 and consumed_at is null`, [input.userId, input.platform]);
    await tx.query(`insert into billing_offline_pairing_codes (id,user_id,platform,code_digest,expires_at)
      values ($1,$2,$3,$4,$5)`, [pairingId, input.userId, input.platform, codeDigest, expiresAt.toISOString()]);
  });
  return { pairingCode, pairingId, platform: input.platform, expiresAt: expiresAt.toISOString() };
}

/** Redeem a single-use pairing code for a revocable native session; offline allowances remain separately gated. */
export async function redeemOfflinePairingCode(input: { pairingCode: string; platform: "android" | "ios"; publicKeyValue: unknown }) {
  if (input.platform !== "android" && input.platform !== "ios" || typeof input.pairingCode !== "string" ||
      !/^envpair1_[A-Za-z0-9_-]{43}$/.test(input.pairingCode)) {
    throw new OfflineWalletError("PAIRING_CODE_INVALID", "This pairing code is invalid or expired. Generate a new code from the signed-in enV wallet.", 401);
  }
  const publicJwk = normalizeOfflinePublicJwk(input.publicKeyValue);
  if (!publicJwk || !isUsableOfflinePublicKey(publicJwk)) {
    throw new OfflineWalletError("INVALID_REQUEST", "Provide a valid P-256 public device key. Private key material must never be uploaded.");
  }
  const codeDigest = sha256Hex(input.pairingCode);
  if (!await consumeRateLimit({ action: "offline-pair-code-redeem", subject: codeDigest, maximum: 5, windowMs: 10 * 60_000 })) {
    throw new OfflineWalletError("RATE_LIMITED", "This pairing code has had too many attempts. Generate a fresh code in the wallet.", 429);
  }
  const deviceKeyDigest = sha256Hex(canonicalOfflinePublicKey(publicJwk));
  const nativeSessionToken = `envnative1_${randomBytes(32).toString("base64url")}`;
  const tokenDigest = sha256Hex(nativeSessionToken);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  const sql = await getSql();
  try {
    const session = await sql.transaction(async (tx) => {
      const codeRows = await tx.query<{ id: string; user_id: string; platform: string; expires_at: string | Date; consumed_at: string | Date | null }>(
        `select id,user_id,platform,expires_at,consumed_at from billing_offline_pairing_codes where code_digest = $1 for update`, [codeDigest]);
      const code = codeRows[0];
      if (!code || code.platform !== input.platform || code.consumed_at || dateMillis(code.expires_at) <= Date.now()) {
        throw new OfflineWalletError("PAIRING_CODE_INVALID", "This pairing code is invalid, expired, or has already been used. Generate a new code from the signed-in enV wallet.", 401);
      }
      await tx.query("select user_id from billing_accounts where user_id = $1 for update", [code.user_id]);
      const active = await tx.query<{ count: number | string }>(
        `select count(*) as count from billing_offline_native_sessions where user_id=$1 and revoked_at is null and expires_at > now()`, [code.user_id]);
      if (toNumber(active[0]?.count ?? 0) >= 5) {
        throw new OfflineWalletError("PAIRING_LIMIT_REACHED", "This account already has five active paired native devices. Revoke a device you no longer use and retry.", 409);
      }
      await tx.query("update billing_offline_pairing_codes set consumed_at=now() where id=$1 and consumed_at is null", [code.id]);
      await tx.query(`insert into billing_offline_native_sessions
        (id,user_id,platform,device_key_digest,token_digest,expires_at)
        values ($1,$2,$3,$4,$5,$6)`,
        [sessionId, code.user_id, input.platform, deviceKeyDigest, tokenDigest, expiresAt.toISOString()]);
      return { userId: code.user_id, platform: input.platform };
    });
    await recordSecurityEvent({ userId: session.userId, eventType: "offline_native_device_paired", severity: "info",
      eventKey: sha256Hex(`offline-native-paired:${sessionId}`), reasonCode: "ONE_TIME_PAIRING_REDEEMED",
      platform: input.platform, metadata: { sessionId, platform: input.platform } });
  } catch (error) {
    if (error instanceof OfflineWalletError) throw error;
    throw new OfflineWalletError("PAIRING_CODE_INVALID", "The pairing request could not be completed safely. Generate a fresh code and retry.", 401);
  }
  return { sessionId, sessionToken: nativeSessionToken, platform: input.platform, expiresAt: expiresAt.toISOString(), deviceKeyDigest };
}

export async function listOfflineNativeSessions(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; platform: string; created_at: string | Date; expires_at: string | Date; last_used_at: string | Date | null; revoked_at: string | Date | null }>(
    `select id,platform,created_at,expires_at,last_used_at,revoked_at from billing_offline_native_sessions
      where user_id=$1 order by created_at desc limit 20`, [userId]);
  return rows.map((row) => ({ sessionId: row.id, platform: row.platform,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    lastUsedAt: row.last_used_at ? (row.last_used_at instanceof Date ? row.last_used_at.toISOString() : String(row.last_used_at)) : null,
    revoked: Boolean(row.revoked_at) }));
}

export async function revokeOfflineNativeSession(input: { userId: string; sessionId: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) throw new OfflineWalletError("NATIVE_SESSION_NOT_FOUND", "The paired device was not found.", 404);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const rows = await tx.query<{ id: string; platform: string; device_key_digest: string; revoked_at: string | Date | null }>(
      `select id,platform,device_key_digest,revoked_at from billing_offline_native_sessions where id=$1 and user_id=$2 for update`,
      [input.sessionId, input.userId]);
    const session = rows[0];
    if (!session) throw new OfflineWalletError("NATIVE_SESSION_NOT_FOUND", "The paired device was not found.", 404);
    if (session.revoked_at) return { sessionId: session.id, revoked: true, alreadyRevoked: true };
    await tx.query("update billing_offline_native_sessions set revoked_at=now() where id=$1", [session.id]);
    // Revocation must not release reservations. Active allowances enter recovery because the
    // device can no longer use its bearer credential to send pending offline records.
    const affected = await tx.query<{ id: string }>(`update billing_offline_allowances set status='needs_recovery',
      recovery_reason='NATIVE_SESSION_REVOKED', updated_at=now() where user_id=$1 and device_key_digest=$2 and status in ('issued','syncing') returning id`,
      [input.userId, session.device_key_digest]);
    await tx.query(`insert into billing_security_events
      (id,user_id,event_type,severity,event_key,subject_digest,platform,reason_code,metadata)
      values ($1,$2,'offline_native_device_revoked','medium',$3,$4,$5,'USER_REVOKED_NATIVE_SESSION',$6::jsonb)
      on conflict(event_key) do nothing`,
      [randomUUID(), input.userId, sha256Hex(`offline-native-revoked:${session.id}`), sha256Hex(input.userId), session.platform,
        JSON.stringify({ sessionId: session.id, affectedAllowances: affected.length })]);
    return { sessionId: session.id, revoked: true, alreadyRevoked: false, affectedAllowances: affected.length };
  });
}

function claimsFor(row: DbAllowance): OfflineAllowanceClaims {
  const issuedAt = Math.floor(dateMillis(row.issued_at) / 1000);
  const expiresAt = Math.floor(dateMillis(row.expires_at) / 1000);
  return {
    v: 1,
    allowanceId: row.id,
    userId: row.user_id,
    deviceKeyDigest: row.device_key_digest,
    allowanceSubunits: toNumber(row.allowance_subunits),
    pricingVersion: row.pricing_version,
    issuedAt,
    expiresAt,
    syncUntil: expiresAt + SYNC_GRACE_SECONDS,
  };
}

export interface IssueOfflineAllowanceInput {
  userId: string;
  requestedSubunits: number;
  idempotencyKey: string;
  platform: OfflinePlatform;
  publicKeyValue: unknown;
  expectedDeviceKeyDigest?: string;
  expectedPlatform?: OfflinePlatform;
}

export async function issueOfflineAllowance(input: IssueOfflineAllowanceInput) {
  const signingSecret = requireOfflineEnabled();
  const requestKey = idempotencyKey(input.idempotencyKey);
  const platform = platformValue(input.platform);
  if (input.expectedPlatform && platform !== input.expectedPlatform) {
    throw new OfflineWalletError("DEVICE_BINDING_MISMATCH", "This paired device is not authorized to issue allowances for another platform.", 403);
  }
  if (!safeInteger(input.requestedSubunits, 100, MAX_ALLOWANCE_SUBUNITS)) {
    throw new OfflineWalletError("INVALID_REQUEST", `Offline allowances must be between 0.1 and ${MAX_ALLOWANCE_SUBUNITS / TOKEN_SUBUNITS_PER_TOKEN} tokens.`);
  }
  const publicJwk = normalizeOfflinePublicJwk(input.publicKeyValue);
  if (!publicJwk || !isUsableOfflinePublicKey(publicJwk)) {
    throw new OfflineWalletError("INVALID_REQUEST", "Provide a valid on-curve P-256 public device key. Private key material must never be uploaded.");
  }
  const deviceKeyDigest = sha256Hex(canonicalOfflinePublicKey(publicJwk));
  if (input.expectedDeviceKeyDigest && deviceKeyDigest !== input.expectedDeviceKeyDigest) {
    throw new OfflineWalletError("DEVICE_BINDING_MISMATCH", "This paired session is bound to a different device signing key.", 403);
  }
  const namespacedIdempotency = sha256Hex(`${input.userId}:${requestKey}`);
  await requireRateLimit({ action: "offline-issue-user", subject: input.userId, maximum: 4, windowMs: 60 * 60_000, userId: input.userId, platform });
  await requireRateLimit({ action: "offline-issue-device", subject: deviceKeyDigest, maximum: 3, windowMs: 60 * 60_000, userId: input.userId, platform });

  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await ensureAccount(tx, input.userId);
    const accounts = await tx.query<{ available_subunits: number | string; reserved_subunits: number | string }>(
      "select available_subunits, reserved_subunits from billing_accounts where user_id = $1 for update", [input.userId]);
    const account = accounts[0];
    if (!account) throw new Error("The wallet account could not be locked.");

    const priorRows = await tx.query<DbAllowance>(
      `select * from billing_offline_allowances where issue_idempotency_key = $1 for update`, [namespacedIdempotency]);
    if (priorRows[0]) {
      const prior = priorRows[0];
      if (prior.user_id !== input.userId || prior.device_key_digest !== deviceKeyDigest ||
          toNumber(prior.allowance_subunits) !== input.requestedSubunits || prior.platform !== platform || prior.pricing_version !== PRICING_VERSION) {
        throw new OfflineWalletError("IDEMPOTENCY_CONFLICT", "The issue idempotency key was reused with different allowance parameters.", 409);
      }
      const token = signAllowanceToken(claimsFor(prior), signingSecret);
      if (!prior.token_digest || sha256Hex(token) !== prior.token_digest) {
        throw new OfflineWalletError("ALLOWANCE_NOT_ACTIVE", "The existing offline allowance cannot be safely resumed. Use recovery instead.", 409);
      }
      return { allowance: publicAllowance(prior), allowanceToken: token, idempotentReplay: true };
    }

    const active = await tx.query<{ count: number | string; total_subunits: number | string }>(
      `select count(*) as count, coalesce(sum(allowance_subunits), 0) as total_subunits
         from billing_offline_allowances where user_id = $1 and status in ('issued', 'syncing', 'needs_recovery')`, [input.userId]);
    const activeCount = toNumber(active[0]?.count ?? 0);
    const totalActiveSubunits = toNumber(active[0]?.total_subunits ?? 0);
    if (activeCount >= MAX_ACTIVE_ALLOWANCES_PER_USER || totalActiveSubunits + input.requestedSubunits > MAX_ALLOWANCE_SUBUNITS) {
      throw new OfflineWalletError("ALLOWANCE_LIMIT_REACHED", "This account has reached its active offline allowance limit. Sync an existing device or resolve its recovery state first.", 409);
    }
    const sameDevice = await tx.query<{ id: string }>(
      `select id from billing_offline_allowances where user_id = $1 and device_key_digest = $2
        and status in ('issued', 'syncing', 'needs_recovery') limit 1`, [input.userId, deviceKeyDigest]);
    if (sameDevice[0]) throw new OfflineWalletError("ALLOWANCE_ALREADY_ACTIVE", "This device already has an unresolved offline allowance.", 409);
    const available = toNumber(account.available_subunits);
    if (available < input.requestedSubunits) throw new OfflineWalletError("INSUFFICIENT_CREDITS", "There are not enough available tokens for this offline allowance.", 409);

    const allowanceId = randomUUID();
    const reservationId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60_000);
    const claims: OfflineAllowanceClaims = {
      v: 1, allowanceId, userId: input.userId, deviceKeyDigest,
      allowanceSubunits: input.requestedSubunits, pricingVersion: PRICING_VERSION,
      issuedAt: Math.floor(now.getTime() / 1000), expiresAt: Math.floor(expiresAt.getTime() / 1000),
      syncUntil: Math.floor(expiresAt.getTime() / 1000) + SYNC_GRACE_SECONDS,
    };
    const token = signAllowanceToken(claims, signingSecret);
    const tokenDigest = sha256Hex(token);
    const reservationIdempotency = `offline-${namespacedIdempotency}`;
    const reservedAccount = await tx.query<{ user_id: string }>(
      `update billing_accounts set available_subunits = available_subunits - $2,
         reserved_subunits = reserved_subunits + $2, updated_at = now()
       where user_id = $1 and available_subunits >= $2 returning user_id`, [input.userId, input.requestedSubunits]);
    if (!reservedAccount[0]) throw new OfflineWalletError("INSUFFICIENT_CREDITS", "The wallet balance changed before offline tokens could be reserved. Refresh the wallet and retry.", 409);
    await tx.query(
      `insert into billing_reservations
        (id, user_id, operation_id, idempotency_key, reserved_subunits, status, pricing_version, metadata, expires_at)
       values ($1, $2, 'offline.allowance', $3, $4, 'reserved', $5, $6::jsonb, $7)`,
      [reservationId, input.userId, reservationIdempotency, input.requestedSubunits, PRICING_VERSION,
        JSON.stringify({ allowanceId, platform, deviceKeyDigest }), expiresAt.toISOString()]);
    await tx.query(
      `insert into billing_credit_ledger
        (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, idempotency_key, reference_id, description, metadata)
       values ($1, $2, 'reservation', $3, $4, $5, $6, $7, $8::jsonb)`,
      [randomUUID(), input.userId, -input.requestedSubunits, input.requestedSubunits,
        `offline-reserve:${namespacedIdempotency}`, reservationId, "Reserved for offline enV tools",
        JSON.stringify({ allowanceId, platform })]);
    await tx.query(
      `insert into billing_offline_allowances
        (id, user_id, reservation_id, device_key_digest, device_public_key, allowance_subunits,
         pricing_version, status, issued_at, expires_at, issue_idempotency_key, token_digest, platform)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, 'issued', $8, $9, $10, $11, $12)`,
      [allowanceId, input.userId, reservationId, deviceKeyDigest, JSON.stringify(publicJwk), input.requestedSubunits,
        PRICING_VERSION, now.toISOString(), expiresAt.toISOString(), namespacedIdempotency, tokenDigest, platform]);
    await tx.query(
      `delete from billing_security_rate_limits where updated_at < now() - interval '2 days'`);
    const row: DbAllowance = {
      id: allowanceId, user_id: input.userId, reservation_id: reservationId, device_key_digest: deviceKeyDigest,
      device_public_key: publicJwk, allowance_subunits: input.requestedSubunits, pricing_version: PRICING_VERSION,
      status: "issued", issued_at: now, expires_at: expiresAt, last_sync_at: null, last_accepted_sequence: 0,
      last_processed_sequence: 0, accepted_subunits: 0, issue_idempotency_key: namespacedIdempotency,
      token_digest: tokenDigest, platform, recovery_reason: null,
    };
    return { allowance: publicAllowance(row), allowanceToken: token, idempotentReplay: false };
  }).catch(async (error: unknown) => {
    if (error instanceof OfflineWalletError) throw error;
    // Unique-index races return a generic response instead of exposing database internals.
    await recordSecurityEvent({ userId: input.userId, eventType: "offline_issue_failure", severity: "medium",
      eventKey: sha256Hex(`issue-failure:${input.userId}:${namespacedIdempotency}`), reasonCode: "ISSUE_TRANSACTION_FAILED",
      platform, metadata: { operation: "issue" } });
    throw new OfflineWalletError("ALLOWANCE_ALREADY_ACTIVE", "The offline allowance could not be issued safely. Refresh wallet status and retry with the same idempotency key.", 409);
  });
}

function publicAllowance(row: DbAllowance) {
  return {
    allowanceId: row.id,
    reservationId: row.reservation_id,
    platform: row.platform,
    allowanceSubunits: toNumber(row.allowance_subunits),
    allowanceTokens: toNumber(row.allowance_subunits) / TOKEN_SUBUNITS_PER_TOKEN,
    pricingVersion: row.pricing_version,
    status: row.status,
    issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString() : String(row.issued_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    lastSyncAt: row.last_sync_at ? (row.last_sync_at instanceof Date ? row.last_sync_at.toISOString() : String(row.last_sync_at)) : null,
    lastProcessedSequence: toNumber(row.last_processed_sequence),
    acceptedSubunits: toNumber(row.accepted_subunits),
    recoveryReason: row.recovery_reason,
  };
}

function normalizeTransaction(value: unknown): NormalizedTransaction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.transactionId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(record.transactionId) ||
      !safeInteger(record.sequenceNumber, 1, 2_147_483_647) || typeof record.toolId !== "string" ||
      !/^[A-Za-z0-9._-]{1,160}$/.test(record.toolId) || typeof record.pricingVersion !== "string" ||
      record.pricingVersion.length > 120 || record.unitCount !== 1 ||
      (record.outcome !== "succeeded" && record.outcome !== "failed") ||
      !isCanonicalUtcTimestamp(record.recordedAt) || !isValidBase64Url(record.signature, 80, 200)) return null;
  return {
    transactionId: record.transactionId,
    sequenceNumber: record.sequenceNumber,
    toolId: record.toolId,
    pricingVersion: record.pricingVersion,
    unitCount: record.unitCount,
    outcome: record.outcome,
    recordedAt: record.recordedAt,
    signature: record.signature,
  };
}

export interface SyncOfflineAllowanceRequest {
  userId: string;
  allowanceToken: string;
  batchId: string;
  transactionsValue: unknown;
  checkpointSequence: number;
  checkpointSignature: string;
  finalized: boolean;
  expectedDeviceKeyDigest?: string;
  expectedPlatform?: OfflinePlatform;
}

export async function syncOfflineAllowance(input: SyncOfflineAllowanceRequest) {
  const signingSecret = requireOfflineEnabled();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.batchId) || !Array.isArray(input.transactionsValue) ||
      input.transactionsValue.length > MAX_TRANSACTIONS_PER_BATCH || !safeInteger(input.checkpointSequence, 0, 2_147_483_647) ||
      typeof input.finalized !== "boolean" || !isValidBase64Url(input.checkpointSignature, 80, 200)) {
    throw new OfflineWalletError("INVALID_REQUEST", `A valid sync batch with at most ${MAX_TRANSACTIONS_PER_BATCH} transactions is required.`);
  }
  let claims: OfflineAllowanceClaims;
  try { claims = verifyAllowanceToken(input.allowanceToken, signingSecret, input.userId); }
  catch (error) {
    if (error instanceof OfflineCryptoError) throw new OfflineWalletError("INVALID_ALLOWANCE_TOKEN", error.message, 401);
    throw error;
  }
  if (input.expectedDeviceKeyDigest && claims.deviceKeyDigest !== input.expectedDeviceKeyDigest) {
    throw new OfflineWalletError("DEVICE_BINDING_MISMATCH", "This paired native session cannot synchronize a different device allowance.", 403);
  }
  const transactions = input.transactionsValue.map(normalizeTransaction);
  if (transactions.some((tx) => tx === null)) throw new OfflineWalletError("INVALID_REQUEST", "At least one offline transaction record is malformed.");
  const normalized = (transactions as NormalizedTransaction[]).slice().sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const txIds = new Set<string>();
  const txSequences = new Set<number>();
  for (const tx of normalized) {
    if (txIds.has(tx.transactionId) || txSequences.has(tx.sequenceNumber)) {
      await recordSecurityEvent({ userId: input.userId, eventType: "offline_batch_duplicate", severity: "high",
        eventKey: sha256Hex(`offline-batch-duplicate:${claims.allowanceId}:${input.batchId}`), reasonCode: "DUPLICATE_ID_OR_SEQUENCE",
        metadata: { batchId: input.batchId, transactionCount: normalized.length } });
      throw new OfflineWalletError("IDEMPOTENCY_CONFLICT", "A sync batch cannot contain duplicate transaction IDs or sequence numbers.", 409);
    }
    txIds.add(tx.transactionId); txSequences.add(tx.sequenceNumber);
  }
  const sql = await getSql();
  const preflightRows = await sql.query<DbAllowance>(
    `select * from billing_offline_allowances where id = $1 and user_id = $2`, [claims.allowanceId, input.userId]);
  const preflight = preflightRows[0];
  if (!preflight) throw new OfflineWalletError("ALLOWANCE_NOT_FOUND", "The offline allowance was not found for this account.", 404);
  const storedPublicKey = normalizeOfflinePublicJwk(preflight.device_public_key);
  if ((input.expectedPlatform && preflight.platform !== input.expectedPlatform) ||
      (input.expectedDeviceKeyDigest && preflight.device_key_digest !== input.expectedDeviceKeyDigest) ||
      preflight.token_digest !== sha256Hex(input.allowanceToken) || preflight.device_key_digest !== claims.deviceKeyDigest ||
      !storedPublicKey || !isUsableOfflinePublicKey(storedPublicKey) ||
      sha256Hex(canonicalOfflinePublicKey(storedPublicKey)) !== preflight.device_key_digest) {
    await recordSecurityEvent({ userId: input.userId, eventType: "offline_token_binding_failure", severity: "high",
      eventKey: sha256Hex(`offline-token-binding:${claims.allowanceId}:${input.batchId}`), reasonCode: "TOKEN_OR_KEY_BINDING_MISMATCH",
      platform: preflight.platform === "android" || preflight.platform === "ios" ? preflight.platform : "web",
      metadata: { allowanceId: claims.allowanceId, batchId: input.batchId } });
    throw new OfflineWalletError("INVALID_ALLOWANCE_TOKEN", "The allowance token is not valid for this device and wallet.", 401);
  }
  // Consume limits before any public-key signature verification to constrain CPU spent on a valid-token flood.
  const platform = preflight.platform === "android" || preflight.platform === "ios" ? preflight.platform : "web";
  await requireRateLimit({ action: "offline-sync-user", subject: input.userId, maximum: 30, windowMs: 60_000, userId: input.userId, platform });
  await requireRateLimit({ action: "offline-sync-device", subject: claims.deviceKeyDigest, maximum: 20, windowMs: 60_000, userId: input.userId, platform });
  const publicJwk = storedPublicKey;
  for (const tx of normalized) {
    const message = canonicalOfflineTransaction({ allowanceId: claims.allowanceId, ...tx, recordedAt: tx.recordedAt });
    if (!verifyDeviceSignature(publicJwk, message, tx.signature)) {
      await recordSecurityEvent({ userId: input.userId, eventType: "offline_invalid_device_signature", severity: "high",
        eventKey: sha256Hex(`offline-invalid-signature:${claims.allowanceId}:${tx.transactionId}`), reasonCode: "TRANSACTION_SIGNATURE_INVALID",
        platform: preflight.platform === "android" || preflight.platform === "ios" ? preflight.platform : "web",
        metadata: { allowanceId: claims.allowanceId, transactionId: tx.transactionId, sequenceNumber: tx.sequenceNumber } });
      throw new OfflineWalletError("INVALID_DEVICE_SIGNATURE", "An offline transaction signature is invalid. No new token charge was applied.", 401);
    }
    const recorded = Date.parse(tx.recordedAt);
    if (recorded < claims.issuedAt * 1000 - 5 * 60_000 || recorded > claims.expiresAt * 1000 || recorded > Date.now() + 5 * 60_000) {
      throw new OfflineWalletError("INVALID_REQUEST", "An offline transaction timestamp falls outside its allowance window.", 409);
    }
  }
  const checkpointMessage = canonicalOfflineCheckpoint({ allowanceId: claims.allowanceId, checkpointSequence: input.checkpointSequence, finalized: input.finalized });
  if (!verifyDeviceSignature(publicJwk, checkpointMessage, input.checkpointSignature)) {
    await recordSecurityEvent({ userId: input.userId, eventType: "offline_invalid_checkpoint_signature", severity: "high",
      eventKey: sha256Hex(`offline-invalid-checkpoint:${claims.allowanceId}:${input.batchId}`), reasonCode: "CHECKPOINT_SIGNATURE_INVALID",
      metadata: { allowanceId: claims.allowanceId, batchId: input.batchId } });
    throw new OfflineWalletError("INVALID_DEVICE_SIGNATURE", "The device checkpoint signature is invalid. No new token charge was applied.", 401);
  }
  const canonicalBatch = JSON.stringify({
    allowanceId: claims.allowanceId, batchId: input.batchId, finalized: input.finalized,
    checkpointSequence: input.checkpointSequence,
    transactions: normalized.map((tx) => ({ ...tx })),
    checkpointSignature: input.checkpointSignature,
  });
  const batchDigest = sha256Hex(canonicalBatch);
  return sql.transaction(async (tx) => {
    await ensureAccount(tx, input.userId);
    await tx.query("select user_id from billing_accounts where user_id = $1 for update", [input.userId]);
    const lockedRows = await tx.query<DbAllowance>(
      `select * from billing_offline_allowances where id = $1 and user_id = $2 for update`, [claims.allowanceId, input.userId]);
    const allowance = lockedRows[0];
    if (!allowance) throw new OfflineWalletError("ALLOWANCE_NOT_FOUND", "The offline allowance was not found for this account.", 404);
    const priorBatchRows = await tx.query<{ payload_digest: string; response: unknown }>(
      `select payload_digest, response from billing_offline_sync_batches where allowance_id = $1 and batch_id = $2`, [allowance.id, input.batchId]);
    let matchingVerifiedFinalizationProof = false;
    if (priorBatchRows[0]) {
      if (priorBatchRows[0].payload_digest !== batchDigest) {
        throw new OfflineWalletError("IDEMPOTENCY_CONFLICT", "A sync batch ID was replayed with different content. The allowance was not changed.", 409);
      }
      matchingVerifiedFinalizationProof = input.finalized && allowance.status === "needs_recovery" &&
        allowance.recovery_reason === "FINALIZATION_PROOF_REQUIRED" && (await tx.query<{ id: string }>(
          `select id from billing_offline_finalization_proofs
            where allowance_id = $1 and user_id = $2 and checkpoint_sequence = $3
              and platform = $4 and pricing_version = $5 and device_key_digest = $6 and batch_digest = $7
              and evidence_digest ~ '^[a-f0-9]{64}$' and verified_at is not null
            limit 1`,
          [allowance.id, input.userId, input.checkpointSequence, platform, allowance.pricing_version, allowance.device_key_digest, batchDigest])).length > 0;
      if (!matchingVerifiedFinalizationProof) {
        return { ...(priorBatchRows[0].response as Record<string, unknown>), idempotentReplay: true };
      }
      // Reprocess the exact same final batch only after server-side integrity verification exists.
    }
    if (allowance.status === "reconciled") {
      const result = { status: "reconciled", allowanceId: allowance.id, acceptedSubunits: toNumber(allowance.accepted_subunits),
        releasedSubunits: toNumber(allowance.allowance_subunits) - toNumber(allowance.accepted_subunits), lastProcessedSequence: toNumber(allowance.last_processed_sequence), idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }
    if (["revoked", "expired"].includes(allowance.status) || !canResumeOfflineSync({
      status: allowance.status, recoveryReason: allowance.recovery_reason, matchingVerifiedFinalizationProof,
    })) {
      throw new OfflineWalletError("OFFLINE_NEEDS_RECOVERY", "This allowance needs account recovery or support review. Its reserved balance has not been silently released.", 409);
    }
    if (allowance.pricing_version !== PRICING_VERSION || claims.pricingVersion !== allowance.pricing_version ||
        claims.allowanceSubunits !== toNumber(allowance.allowance_subunits)) {
      await markNeedsRecovery(tx, allowance.id, "PRICING_OR_CLAIM_MISMATCH", input.userId, platform, input.batchId);
      const result = { status: "needs_recovery", allowanceId: allowance.id, error: "PRICING_OR_CLAIM_MISMATCH", acceptedSubunits: toNumber(allowance.accepted_subunits), idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }

    let lastSequence = toNumber(allowance.last_processed_sequence);
    let acceptedSubunits = toNumber(allowance.accepted_subunits);
    let recoveryReason: string | null = null;
    let newlyAccepted = 0;
    for (const txRecord of normalized) {
      const digest = sha256Hex(`${canonicalOfflineTransaction({ allowanceId: allowance.id, ...txRecord })}.${txRecord.signature}`);
      const existing = await tx.query<{ transaction_id: string; sequence_number: number | string; usage_digest: string; outcome: string; accepted_subunits: number | string | null }>(
        `select transaction_id, sequence_number, usage_digest, outcome, accepted_subunits
           from billing_offline_transactions where allowance_id = $1 and
             (transaction_id = $2 or sequence_number = $3) for update`,
        [allowance.id, txRecord.transactionId, txRecord.sequenceNumber]);
      if (existing[0]) {
        const match = existing.length === 1 && existing[0]!.transaction_id === txRecord.transactionId &&
          toNumber(existing[0]!.sequence_number) === txRecord.sequenceNumber && existing[0]!.usage_digest === digest;
        if (!match) { recoveryReason = "TRANSACTION_REPLAY_CONFLICT"; break; }
        continue;
      }
      if (txRecord.sequenceNumber !== lastSequence + 1) { recoveryReason = "SEQUENCE_GAP"; break; }
      const profile = getToolBillingProfile(txRecord.toolId);
      if (!profile || !OFFLINE_BILLABLE_KEYS.has(profile.billingKey) || profile.pricingMode !== "per-unit-hypothesis" ||
          !profile.provisionalSubunitsPerUnit ||
          txRecord.pricingVersion !== allowance.pricing_version) {
        await tx.query(
          `insert into billing_offline_transactions
            (id, allowance_id, transaction_id, sequence_number, tool_id, pricing_version, unit_count,
             execution_outcome, claimed_subunits, accepted_subunits, usage_digest, outcome, rejection_code, device_recorded_at, reconciled_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,0,null,$9,'needs_review','OFFLINE_TOOL_OR_PRICE_NOT_ALLOWED',$10,now())`,
          [randomUUID(), allowance.id, txRecord.transactionId, txRecord.sequenceNumber, txRecord.toolId,
            txRecord.pricingVersion, txRecord.unitCount, txRecord.outcome, digest, txRecord.recordedAt]);
        lastSequence = txRecord.sequenceNumber;
        recoveryReason = "OFFLINE_TOOL_OR_PRICE_NOT_ALLOWED";
        break;
      }
      // Client-reported failure is not trustworthy billing evidence: a modified client can
      // sign a forged outcome. Every durably started metered operation is charged; outcome
      // is telemetry only. Validate inputs before creating the local operation ticket.
      const charge = profile.provisionalSubunitsPerUnit * txRecord.unitCount;
      if (!Number.isSafeInteger(charge) || charge < 0 || acceptedSubunits + charge > toNumber(allowance.allowance_subunits)) {
        await tx.query(
          `insert into billing_offline_transactions
            (id, allowance_id, transaction_id, sequence_number, tool_id, pricing_version, unit_count,
             execution_outcome, claimed_subunits, accepted_subunits, usage_digest, outcome, rejection_code, device_recorded_at, reconciled_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,0,null,$9,'needs_review','OFFLINE_ALLOWANCE_EXCEEDED',$10,now())`,
          [randomUUID(), allowance.id, txRecord.transactionId, txRecord.sequenceNumber, txRecord.toolId,
            txRecord.pricingVersion, txRecord.unitCount, txRecord.outcome, digest, txRecord.recordedAt]);
        lastSequence = txRecord.sequenceNumber;
        recoveryReason = "OFFLINE_ALLOWANCE_EXCEEDED";
        break;
      }
      await tx.query(
        `insert into billing_offline_transactions
          (id, allowance_id, transaction_id, sequence_number, tool_id, pricing_version, unit_count,
           execution_outcome, claimed_subunits, accepted_subunits, usage_digest, outcome, device_recorded_at, reconciled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,'accepted',$11,now())`,
        [randomUUID(), allowance.id, txRecord.transactionId, txRecord.sequenceNumber, txRecord.toolId,
          txRecord.pricingVersion, txRecord.unitCount, txRecord.outcome, charge, digest, txRecord.recordedAt]);
      lastSequence = txRecord.sequenceNumber;
      acceptedSubunits += charge;
      newlyAccepted += charge;
    }

    if (!recoveryReason && input.checkpointSequence !== lastSequence) recoveryReason = "CHECKPOINT_SEQUENCE_MISMATCH";
    if (recoveryReason) {
      await tx.query(
        `update billing_offline_allowances set status = 'needs_recovery', last_sync_at = now(),
           last_processed_sequence = $2, last_accepted_sequence = $2, accepted_subunits = $3,
           recovery_reason = $4, updated_at = now() where id = $1`,
        [allowance.id, lastSequence, acceptedSubunits, recoveryReason]);
      await tx.query(
        `insert into billing_security_events (id, user_id, event_type, severity, event_key, subject_digest, platform, reason_code, metadata)
         values ($1,$2,'offline_reconciliation_anomaly','high',$3,$4,$5,$6,$7::jsonb) on conflict(event_key) do nothing`,
        [randomUUID(), input.userId, sha256Hex(`offline-anomaly:${allowance.id}:${input.batchId}`), sha256Hex(input.userId), platform, recoveryReason,
          JSON.stringify({ allowanceId: allowance.id, batchId: input.batchId, lastSequence, newlyAccepted })]);
      const result = { status: "needs_recovery", allowanceId: allowance.id, error: recoveryReason,
        acceptedSubunits, lastProcessedSequence: lastSequence, idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }

    await tx.query(
      `update billing_offline_allowances set status = 'syncing', last_sync_at = now(),
         last_processed_sequence = $2, last_accepted_sequence = $2, accepted_subunits = $3,
         recovery_reason = null, updated_at = now()
       where id = $1`, [allowance.id, lastSequence, acceptedSubunits]);
    if (!input.finalized) {
      const result = { status: "syncing", allowanceId: allowance.id, acceptedSubunits,
        newlyAcceptedSubunits: newlyAccepted, lastProcessedSequence: lastSequence, idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }

    // A device-signed final checkpoint is not proof that the journal is complete: a modified
    // client can omit operations and sign an empty/short final batch. Until an independent
    // server-side integrity verifier records a matching proof, do not release unused reserved
    // funds. An explicit local-only test override exists solely for ephemeral in-memory PGlite
    // integration tests; production and any external database always require the independent proof.
    // Production offline metering remains hard-locked until attestation/integrity review is complete.
    const testFinalization = localTestFinalizationEnabled();
    const verifiedFinalization = testFinalization
      ? [{ id: "local-in-memory-test-finalization" }]
      : platform === "android" || platform === "ios"
        ? await tx.query<{ id: string }>(
            `select id from billing_offline_finalization_proofs
              where allowance_id = $1 and user_id = $2 and checkpoint_sequence = $3
                and platform = $4 and pricing_version = $5 and device_key_digest = $6 and batch_digest = $7
                and evidence_digest ~ '^[a-f0-9]{64}$' and verified_at is not null
              limit 1`,
            [allowance.id, input.userId, input.checkpointSequence, platform, allowance.pricing_version, allowance.device_key_digest, batchDigest])
        : [];
    if (verifiedFinalization.length === 0) {
      await tx.query(
        `update billing_offline_allowances set status = 'needs_recovery', last_sync_at = now(),
           last_processed_sequence = $2, last_accepted_sequence = $2, accepted_subunits = $3,
           recovery_reason = 'FINALIZATION_PROOF_REQUIRED', updated_at = now() where id = $1`,
        [allowance.id, lastSequence, acceptedSubunits]);
      await markNeedsRecovery(tx, allowance.id, "FINALIZATION_PROOF_REQUIRED", input.userId, platform, input.batchId);
      const result = { status: "needs_recovery", allowanceId: allowance.id, error: "FINALIZATION_PROOF_REQUIRED",
        acceptedSubunits, lastProcessedSequence: lastSequence, reservedFundsReleased: false, idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }

    const reservations = await tx.query<{ id: string; reserved_subunits: number | string; status: string; user_id: string }>(
      `select id, reserved_subunits, status, user_id from billing_reservations where id = $1 for update`, [allowance.reservation_id]);
    const reservation = reservations[0];
    if (!reservation || reservation.user_id !== input.userId || reservation.status !== "reserved") {
      await tx.query(`update billing_offline_allowances set status = 'needs_recovery', recovery_reason = 'RESERVATION_NOT_ACTIVE', updated_at = now() where id = $1`, [allowance.id]);
      const result = { status: "needs_recovery", allowanceId: allowance.id, error: "RESERVATION_NOT_ACTIVE", acceptedSubunits, idempotentReplay: false };
      await saveBatch(tx, allowance, input, batchDigest, result);
      return result;
    }
    const reserved = toNumber(reservation.reserved_subunits);
    if (acceptedSubunits > reserved) throw new Error("Offline settlement would exceed its server reservation.");
    const released = reserved - acceptedSubunits;
    const accountUpdate = await tx.query<{ user_id: string }>(
      `update billing_accounts set available_subunits = available_subunits + $2,
         reserved_subunits = reserved_subunits - $3,
         lifetime_consumed_subunits = lifetime_consumed_subunits + $4, updated_at = now()
       where user_id = $1 and reserved_subunits >= $3 returning user_id`,
      [input.userId, released, reserved, acceptedSubunits]);
    if (!accountUpdate[0]) throw new Error("Offline settlement could not reconcile the reserved wallet amount.");
    await tx.query(
      `update billing_reservations set actual_subunits = $2, status = 'settled', completed_at = now() where id = $1`,
      [reservation.id, acceptedSubunits]);
    await tx.query(
      `insert into billing_credit_ledger
        (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, consumed_subunits,
         idempotency_key, reference_id, description, metadata)
       values ($1,$2,'settlement',$3,$4,$5,$6,$7,$8,$9::jsonb)
       on conflict (idempotency_key) do nothing`,
      [randomUUID(), input.userId, released, -reserved, acceptedSubunits, `offline-settlement:${allowance.id}`,
        allowance.id, "Reconciled offline enV usage", JSON.stringify({ allowanceId: allowance.id, transactionCount: lastSequence })]);
    await tx.query(
      `update billing_offline_allowances set status = 'reconciled', reconciled_at = now(),
         last_sync_at = now(), last_processed_sequence = $2, last_accepted_sequence = $2,
         accepted_subunits = $3, recovery_reason = null, updated_at = now() where id = $1`,
      [allowance.id, lastSequence, acceptedSubunits]);
    const balance = await tx.query<{ available_subunits: number | string; reserved_subunits: number | string }>(
      `select available_subunits, reserved_subunits from billing_accounts where user_id = $1`, [input.userId]);
    const result = { status: "reconciled", allowanceId: allowance.id, acceptedSubunits,
      newlyAcceptedSubunits: newlyAccepted, releasedSubunits: released, lastProcessedSequence: lastSequence,
      walletAvailableSubunits: toNumber(balance[0]?.available_subunits), idempotentReplay: false };
    await saveBatch(tx, allowance, input, batchDigest, result);
    return result;
  }).catch(async (error: unknown) => {
    if (error instanceof OfflineWalletError) throw error;
    await recordSecurityEvent({ userId: input.userId, eventType: "offline_sync_failure", severity: "medium",
      eventKey: sha256Hex(`offline-sync-failure:${claims.allowanceId}:${input.batchId}`), reasonCode: "SYNC_TRANSACTION_FAILED",
      platform, metadata: { batchId: input.batchId, transactionCount: normalized.length } });
    throw new OfflineWalletError("OFFLINE_NEEDS_RECOVERY", "Offline records could not be reconciled safely. Reserved tokens remain protected; retry with the same batch ID or contact support.", 409);
  });
}

async function saveBatch(tx: Awaited<ReturnType<typeof getSql>>, allowance: DbAllowance, input: Pick<SyncOfflineAllowanceRequest, "userId" | "batchId">,
  payloadDigest: string, response: Record<string, unknown>): Promise<void> {
  await tx.query(
    `insert into billing_offline_sync_batches (id, allowance_id, user_id, batch_id, payload_digest, response)
     values ($1,$2,$3,$4,$5,$6::jsonb)
     on conflict (allowance_id, batch_id) do update
       set payload_digest = excluded.payload_digest, response = excluded.response`,
    [randomUUID(), allowance.id, input.userId, input.batchId, payloadDigest, JSON.stringify(response)]);
}

async function markNeedsRecovery(tx: Awaited<ReturnType<typeof getSql>>, allowanceId: string, reason: string,
  userId: string, platform: OfflinePlatform, batchId: string): Promise<void> {
  await tx.query(`update billing_offline_allowances set status = 'needs_recovery', recovery_reason = $2, updated_at = now() where id = $1`, [allowanceId, reason]);
  await tx.query(
    `insert into billing_security_events (id,user_id,event_type,severity,event_key,subject_digest,platform,reason_code,metadata)
     values ($1,$2,'offline_reconciliation_anomaly','high',$3,$4,$5,$6,$7::jsonb) on conflict(event_key) do nothing`,
    [randomUUID(), userId, sha256Hex(`offline-anomaly:${allowanceId}:${batchId}`), sha256Hex(userId), platform, reason, JSON.stringify({ allowanceId, batchId })]);
}

export async function listOfflineAllowances(userId: string, deviceKeyDigest?: string) {
  const sql = await getSql();
  const rows = deviceKeyDigest
    ? await sql.query<DbAllowance>(`select * from billing_offline_allowances where user_id=$1 and device_key_digest=$2 order by created_at desc limit 10`, [userId, deviceKeyDigest])
    : await sql.query<DbAllowance>(`select * from billing_offline_allowances where user_id=$1 order by created_at desc limit 10`, [userId]);
  return rows.map(publicAllowance);
}

/** Conservative missing-record recovery: marks the allowance for review; it never frees the reservation. */
export async function reportOfflineAllowanceLost(input: { userId: string; allowanceId: string; expectedDeviceKeyDigest?: string; expectedPlatform?: OfflinePlatform }) {
  if (typeof input.allowanceId !== "string" || !/^[A-Za-z0-9-]{16,80}$/.test(input.allowanceId)) {
    throw new OfflineWalletError("INVALID_REQUEST", "A valid allowance ID is required.");
  }
  await requireRateLimit({ action: "offline-recovery-user", subject: input.userId, maximum: 3, windowMs: 24 * 60 * 60_000, userId: input.userId });
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await tx.query("select user_id from billing_accounts where user_id = $1 for update", [input.userId]);
    const rows = await tx.query<{ id: string; status: string; accepted_subunits: number | string; device_key_digest: string; platform: string }>(
      `select id,status,accepted_subunits,device_key_digest,platform from billing_offline_allowances where id = $1 and user_id = $2 for update`, [input.allowanceId, input.userId]);
    const row = rows[0];
    if (!row || (input.expectedDeviceKeyDigest && row.device_key_digest !== input.expectedDeviceKeyDigest) ||
        (input.expectedPlatform && row.platform !== input.expectedPlatform)) {
      throw new OfflineWalletError("ALLOWANCE_NOT_FOUND", "The offline allowance was not found for this account or paired device.", 404);
    }
    if (row.status === "reconciled") return { status: row.status, alreadyReconciled: true };
    await tx.query(
      `update billing_offline_allowances set status = 'needs_recovery', recovery_reason = 'CLIENT_REPORTED_LOCAL_RECORDS_LOST', updated_at = now() where id = $1`, [row.id]);
    await tx.query(
      `insert into billing_security_events (id,user_id,event_type,severity,event_key,subject_digest,platform,reason_code,metadata)
       values ($1,$2,'offline_local_data_lost','medium',$3,$4,'server','CLIENT_REPORTED_LOCAL_RECORDS_LOST',$5::jsonb)
       on conflict(event_key) do nothing`,
      [randomUUID(), input.userId, sha256Hex(`offline-lost:${row.id}`), sha256Hex(input.userId), JSON.stringify({ allowanceId: row.id })]);
    return { status: "needs_recovery", acceptedSubunits: toNumber(row.accepted_subunits), reservedFundsReleased: false,
      message: "Your unsynchronized usage records could not be verified. Reserved tokens remain protected until support or a verified recovery process resolves this allowance." };
  });
}

/** Read-only operator queue; it never approves refunds or releases reserved funds. */
export async function offlineRecoveryQueue(limit = 50) {
  const boundedLimit = safeInteger(limit, 1, 100) ? limit : 50;
  const sql = await getSql();
  const rows = await sql.query<{
    allowance_id: string; user_id: string; platform: string; status: string; recovery_reason: string | null;
    allowance_subunits: number | string; accepted_subunits: number | string; reserved_subunits: number | string;
    reservation_status: string; issued_at: string | Date; expires_at: string | Date; last_sync_at: string | Date | null;
    updated_at: string | Date; transaction_count: number | string; accepted_transaction_count: number | string;
  }>(
    `select a.id as allowance_id, a.user_id, a.platform, a.status, a.recovery_reason,
            a.allowance_subunits, a.accepted_subunits, r.reserved_subunits, r.status as reservation_status,
            a.issued_at, a.expires_at, a.last_sync_at, a.updated_at,
            count(t.id) as transaction_count,
            count(t.id) filter (where t.outcome = 'accepted') as accepted_transaction_count
       from billing_offline_allowances a
       join billing_reservations r on r.id = a.reservation_id
       left join billing_offline_transactions t on t.allowance_id = a.id
      where a.status = 'needs_recovery'
         or (a.status in ('issued','syncing') and a.expires_at + interval '14 days' < now())
      group by a.id, r.id
      order by a.updated_at asc
      limit $1`, [boundedLimit]);
  return rows.map((row) => ({
    allowanceId: row.allowance_id,
    userId: row.user_id,
    platform: row.platform,
    status: row.status,
    recoveryReason: row.recovery_reason ?? (dateMillis(row.expires_at) + 14 * 24 * 60 * 60_000 < Date.now() ? "SYNC_GRACE_EXPIRED" : null),
    allowanceSubunits: toNumber(row.allowance_subunits),
    acceptedSubunits: toNumber(row.accepted_subunits),
    reservedSubunits: toNumber(row.reserved_subunits),
    reservationStatus: row.reservation_status,
    issuedAt: new Date(dateMillis(row.issued_at)).toISOString(),
    expiresAt: new Date(dateMillis(row.expires_at)).toISOString(),
    lastSyncAt: row.last_sync_at ? new Date(dateMillis(row.last_sync_at)).toISOString() : null,
    updatedAt: new Date(dateMillis(row.updated_at)).toISOString(),
    transactionCount: toNumber(row.transaction_count),
    acceptedTransactionCount: toNumber(row.accepted_transaction_count),
  }));
}

export async function offlineSecuritySummary(hours = 24) {
  const boundedHours = safeInteger(hours, 1, 168) ? hours : 24;
  const sql = await getSql();
  const [events, types, unresolved] = await Promise.all([
    sql.query<{ severity: string; count: number | string }>(
      `select severity, count(*) as count from billing_security_events where created_at >= now() - ($1 || ' hours')::interval group by severity`, [String(boundedHours)]),
    sql.query<{ event_type: string; reason_code: string; count: number | string }>(
      `select event_type, reason_code, count(*) as count from billing_security_events where created_at >= now() - ($1 || ' hours')::interval group by event_type, reason_code order by count(*) desc limit 30`, [String(boundedHours)]),
    sql.query<{ status: string; count: number | string; reserved_subunits: number | string }>(
      `select a.status, count(*) as count, coalesce(sum(a.allowance_subunits),0) as reserved_subunits
         from billing_offline_allowances a where a.status in ('issued','syncing','needs_recovery') group by a.status`),
  ]);
  return {
    windowHours: boundedHours,
    eventCountsBySeverity: events.map((r) => ({ severity: r.severity, count: toNumber(r.count) })),
    topEventTypes: types.map((r) => ({ eventType: r.event_type, reasonCode: r.reason_code, count: toNumber(r.count) })),
    unresolvedAllowances: unresolved.map((r) => ({ status: r.status, count: toNumber(r.count), reservedSubunits: toNumber(r.reserved_subunits) })),
    generatedAt: new Date().toISOString(),
  };
}
