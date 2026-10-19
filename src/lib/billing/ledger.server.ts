/** Server-only token ledger. Never expose purchase-crediting mutations to client code. */
import { createHash, randomUUID } from "node:crypto";
import { getSql } from "../db";
import { PRICING_VERSION } from "./catalog";

export type ReservationStatus = "reserved" | "settled" | "released" | "needs_approval";
export type WalletSnapshot = {
  userId: string;
  availableSubunits: number;
  reservedSubunits: number;
  availableTokens: number;
  reservedTokens: number;
  lifetimePurchasedSubunits: number;
  lifetimeConsumedSubunits: number;
  updatedAt: string;
};

export class BillingError extends Error {
  constructor(
    readonly code: "INSUFFICIENT_CREDITS" | "INVALID_AMOUNT" | "RESERVATION_NOT_FOUND" | "RESERVATION_NOT_ACTIVE" | "WORKFLOW_BUDGET_EXCEEDED" | "IDEMPOTENCY_CONFLICT" | "PURCHASE_NOT_VERIFIED" | "PURCHASE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

const SUBUNITS_PER_TOKEN = 1_000;
const MAX_TOKEN_SUBUNITS = 9_000_000_000_000;
const RESERVATION_TTL_MINUTES = 20;

function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_TOKEN_SUBUNITS) {
    throw new BillingError("INVALID_AMOUNT", "A stored token amount is outside the supported safe range.");
  }
  return parsed;
}

function requireAmount(value: number, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_TOKEN_SUBUNITS) {
    throw new BillingError("INVALID_AMOUNT", "The token amount is invalid.");
  }
  return value;
}

function validIdempotencyKey(key: string): string {
  if (typeof key !== "string" || key.length < 8 || key.length > 160 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    throw new BillingError("INVALID_AMOUNT", "Provide a valid idempotency key (8–160 letters, numbers, colons, underscores or hyphens).");
  }
  return key;
}

/** Stable JSON encoding so an idempotency replay cannot silently change its usage measurements. */
function canonicalUsageJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (Array.isArray(current)) return current.map(normalize);
    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BillingError("INVALID_AMOUNT", "Usage measurements must use plain JSON objects.");
      }
      const record = current as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
    }
    throw new BillingError("INVALID_AMOUNT", "Usage measurements must contain only finite JSON values.");
  };
  try {
    const result = JSON.stringify(normalize(value));
    if (typeof result !== "string") throw new Error("Usage JSON could not be serialized.");
    return result;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError("INVALID_AMOUNT", "Usage measurements are not valid JSON data.");
  }
}

async function ensureBillingAccount(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<void> {
  await sql.query(
    `insert into billing_accounts (user_id) values ($1) on conflict (user_id) do nothing`,
    [userId],
  );
}


/** Release stale reservations in bounded, idempotent batches when a user returns. */
async function releaseExpiredReservationsForUser(userId: string): Promise<number> {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await ensureBillingAccount(tx, userId);
    await tx.query(`select user_id from billing_accounts where user_id = $1 for update`, [userId]);
    const expired = await tx.query<{
      id: string; operation_id: string; reserved_subunits: number | string;
    }>(
      `select id, operation_id, reserved_subunits from billing_reservations
        where user_id = $1 and status = 'reserved' and expires_at <= now()
          -- Offline allowances require dedicated reconciliation. Never let this generic
          -- reservation sweeper release funds when local usage records may be missing.
          and not exists (
            select 1 from billing_offline_allowances offline
             where offline.reservation_id = billing_reservations.id
          )
        order by expires_at asc limit 100 for update skip locked`,
      [userId],
    );
    for (const reservation of expired) {
      const reservedSubunits = amount(reservation.reserved_subunits);
      const accountUpdate = await tx.query<{ user_id: string }>(
        `update billing_accounts
            set available_subunits = available_subunits + $2,
                reserved_subunits = reserved_subunits - $2,
                updated_at = now()
          where user_id = $1 and reserved_subunits >= $2
          returning user_id`,
        [userId, reservedSubunits],
      );
      if (!accountUpdate[0]) throw new Error("Expired reservation balance could not be reconciled.");
      await tx.query(
        `update billing_reservations set status = 'released', completed_at = now()
          where id = $1 and status = 'reserved'`,
        [reservation.id],
      );
      await tx.query(
        `insert into billing_credit_ledger
          (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, idempotency_key, reference_id, description)
         values ($1, $2, 'release', $3, $4, $5, $6, $7)
         on conflict (idempotency_key) do nothing`,
        [randomUUID(), userId, reservedSubunits, -reservedSubunits, `expire:${reservation.id}`, reservation.id,
          `Automatically released expired reservation for ${reservation.operation_id}`],
      );
    }
    return expired.length;
  });
}

export async function readWallet(userId: string): Promise<WalletSnapshot> {
  await releaseExpiredReservationsForUser(userId);
  const sql = await getSql();
  await ensureBillingAccount(sql, userId);
  const rows = await sql.query<{
    user_id: string;
    available_subunits: number | string;
    reserved_subunits: number | string;
    lifetime_purchased_subunits: number | string;
    lifetime_consumed_subunits: number | string;
    updated_at: string | Date;
  }>(
    `select user_id, available_subunits, reserved_subunits, lifetime_purchased_subunits,
            lifetime_consumed_subunits, updated_at
       from billing_accounts where user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new Error("Billing account could not be loaded.");
  const availableSubunits = amount(row.available_subunits);
  const reservedSubunits = amount(row.reserved_subunits);
  return {
    userId: row.user_id,
    availableSubunits,
    reservedSubunits,
    availableTokens: availableSubunits / SUBUNITS_PER_TOKEN,
    reservedTokens: reservedSubunits / SUBUNITS_PER_TOKEN,
    lifetimePurchasedSubunits: amount(row.lifetime_purchased_subunits),
    lifetimeConsumedSubunits: amount(row.lifetime_consumed_subunits),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function getWalletActivity(userId: string, limit = 20) {
  const sql = await getSql();
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 20));
  return sql.query<{
    id: string;
    entry_type: string;
    delta_available_subunits: number;
    delta_reserved_subunits: number;
    consumed_subunits: number;
    description: string;
    reference_id: string | null;
    created_at: string | Date;
  }>(
    `select id, entry_type, delta_available_subunits, delta_reserved_subunits,
            consumed_subunits, description, reference_id, created_at
       from billing_credit_ledger where user_id = $1
       order by created_at desc limit $2`,
    [userId, boundedLimit],
  );
}

export interface ReserveCreditsInput {
  userId: string;
  operationId: string;
  subunits: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  pricingVersion?: string;
}

export async function reserveCredits(input: ReserveCreditsInput) {
  const subunits = requireAmount(input.subunits);
  const idempotencyKey = validIdempotencyKey(input.idempotencyKey);
  if (!input.operationId || input.operationId.length > 120) throw new BillingError("INVALID_AMOUNT", "A valid operation id is required.");
  await releaseExpiredReservationsForUser(input.userId);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await ensureBillingAccount(tx, input.userId);
    const accounts = await tx.query<{ available_subunits: number | string; reserved_subunits: number | string }>(
      `select available_subunits, reserved_subunits from billing_accounts where user_id = $1 for update`,
      [input.userId],
    );
    const account = accounts[0];
    if (!account) throw new Error("Billing account could not be locked.");

    const existing = await tx.query<{
      id: string; user_id: string; operation_id: string; reserved_subunits: number | string;
      actual_subunits: number | string | null; status: ReservationStatus; pricing_version: string;
    }>(`select id, user_id, operation_id, reserved_subunits, actual_subunits, status, pricing_version
          from billing_reservations where idempotency_key = $1`, [idempotencyKey]);
    if (existing[0]) {
      const row = existing[0];
      if (row.user_id !== input.userId || row.operation_id !== input.operationId ||
          amount(row.reserved_subunits) !== subunits || row.pricing_version !== (input.pricingVersion ?? PRICING_VERSION)) {
        throw new BillingError("IDEMPOTENCY_CONFLICT", "This idempotency key was reused with a different user, operation, budget or pricing version.");
      }
      return {
        id: row.id, status: row.status, reservedSubunits: amount(row.reserved_subunits),
        actualSubunits: row.actual_subunits == null ? null : amount(row.actual_subunits), idempotentReplay: true,
      };
    }

    const available = amount(account.available_subunits);
    if (available < subunits) throw new BillingError("INSUFFICIENT_CREDITS", "There are not enough available tokens for this task.");

    const id = randomUUID();
    const pricingVersion = input.pricingVersion ?? PRICING_VERSION;
    const metadata = JSON.stringify(input.metadata ?? {});
    const accountUpdate = await tx.query<{ user_id: string }>(
      `update billing_accounts
          set available_subunits = available_subunits - $2,
              reserved_subunits = reserved_subunits + $2,
              updated_at = now()
        where user_id = $1 and available_subunits >= $2
        returning user_id`,
      [input.userId, subunits],
    );
    if (!accountUpdate[0]) throw new BillingError("INSUFFICIENT_CREDITS", "There are not enough available tokens for this task.");
    await tx.query(
      `insert into billing_reservations
        (id, user_id, operation_id, idempotency_key, reserved_subunits, status, pricing_version, metadata, expires_at)
       values ($1, $2, $3, $4, $5, 'reserved', $6, $7::jsonb, now() + ($8 || ' minutes')::interval)`,
      [id, input.userId, input.operationId, idempotencyKey, subunits, pricingVersion, metadata, String(RESERVATION_TTL_MINUTES)],
    );
    await tx.query(
      `insert into billing_credit_ledger
        (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, idempotency_key, reference_id, description, metadata)
       values ($1, $2, 'reservation', $3, $4, $5, $6, $7, $8::jsonb)`,
      [randomUUID(), input.userId, -subunits, subunits, `reserve:${idempotencyKey}`, id, `Reserved for ${input.operationId}`, metadata],
    );
    return { id, status: "reserved" as const, reservedSubunits: subunits, actualSubunits: null, idempotentReplay: false };
  });
}

export async function settleReservation(input: { userId: string; reservationId: string; actualSubunits: number }) {
  const actualSubunits = requireAmount(input.actualSubunits, true);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string; user_id: string; operation_id: string; reserved_subunits: number | string;
      actual_subunits: number | string | null; status: ReservationStatus;
    }>(`select id, user_id, operation_id, reserved_subunits, actual_subunits, status
          from billing_reservations where id = $1 for update`, [input.reservationId]);
    const reservation = rows[0];
    if (!reservation || reservation.user_id !== input.userId) throw new BillingError("RESERVATION_NOT_FOUND", "The billing reservation was not found.");
    if (reservation.status === "settled") {
      return { id: reservation.id, status: reservation.status, actualSubunits: amount(reservation.actual_subunits), idempotentReplay: true };
    }
    if (reservation.status !== "reserved") throw new BillingError("RESERVATION_NOT_ACTIVE", "This reservation is no longer active.");

    const reservedSubunits = amount(reservation.reserved_subunits);
    if (actualSubunits > reservedSubunits) {
      throw new BillingError("WORKFLOW_BUDGET_EXCEEDED", "Actual cost exceeded the approved budget. Pause execution, obtain user approval, then release this reservation and create a larger one before continuing.");
    }
    const releaseSubunits = reservedSubunits - actualSubunits;
    const accountUpdate = await tx.query<{ user_id: string }>(
      `update billing_accounts
          set available_subunits = available_subunits + $2,
              reserved_subunits = reserved_subunits - $3,
              lifetime_consumed_subunits = lifetime_consumed_subunits + $4,
              updated_at = now()
        where user_id = $1 and reserved_subunits >= $3
        returning user_id`,
      [input.userId, releaseSubunits, reservedSubunits, actualSubunits],
    );
    if (!accountUpdate[0]) throw new Error("The account reservation balance could not be reconciled.");
    await tx.query(
      `update billing_reservations set actual_subunits = $2, status = 'settled', completed_at = now() where id = $1`,
      [reservation.id, actualSubunits],
    );
    await tx.query(
      `insert into billing_credit_ledger
        (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, consumed_subunits, idempotency_key, reference_id, description)
       values ($1, $2, 'settlement', $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), input.userId, releaseSubunits, -reservedSubunits, actualSubunits, `settlement:${reservation.id}`, reservation.id, `Settled ${reservation.operation_id}`],
    );
    return { id: reservation.id, status: "settled" as const, reservedSubunits, actualSubunits, releasedSubunits: releaseSubunits, idempotentReplay: false };
  });
}

export async function releaseReservation(input: { userId: string; reservationId: string; reason?: string }) {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string; user_id: string; operation_id: string; reserved_subunits: number | string; status: ReservationStatus;
    }>(`select id, user_id, operation_id, reserved_subunits, status from billing_reservations where id = $1 for update`, [input.reservationId]);
    const reservation = rows[0];
    if (!reservation || reservation.user_id !== input.userId) throw new BillingError("RESERVATION_NOT_FOUND", "The billing reservation was not found.");
    if (reservation.status === "released") return { id: reservation.id, status: reservation.status, idempotentReplay: true };
    if (reservation.status !== "reserved") throw new BillingError("RESERVATION_NOT_ACTIVE", "Only active reservations can be released.");
    const reservedSubunits = amount(reservation.reserved_subunits);
    const accountUpdate = await tx.query<{ user_id: string }>(
      `update billing_accounts set available_subunits = available_subunits + $2,
          reserved_subunits = reserved_subunits - $2, updated_at = now()
        where user_id = $1 and reserved_subunits >= $2 returning user_id`, [input.userId, reservedSubunits],
    );
    if (!accountUpdate[0]) throw new Error("The account reservation balance could not be reconciled.");
    await tx.query(`update billing_reservations set status = 'released', completed_at = now() where id = $1`, [reservation.id]);
    await tx.query(
      `insert into billing_credit_ledger
        (id, user_id, entry_type, delta_available_subunits, delta_reserved_subunits, idempotency_key, reference_id, description)
       values ($1, $2, 'release', $3, $4, $5, $6, $7)`,
      [randomUUID(), input.userId, reservedSubunits, -reservedSubunits, `release:${reservation.id}`, reservation.id,
        input.reason?.slice(0, 240) || `Released reservation for ${reservation.operation_id}`],
    );
    return { id: reservation.id, status: "released" as const, releasedSubunits: reservedSubunits, idempotentReplay: false };
  });
}

/** Server-side entitlement lookup. Do not trust premium flags supplied by a client. */
export async function hasActiveEntitlement(userId: string, entitlementKey = "premium"): Promise<boolean> {
  if (!userId || userId.length > 256 || !entitlementKey || entitlementKey.length > 120) return false;
  const sql = await getSql();
  const rows = await sql.query<{ active: boolean }>(
    `select exists (
       select 1 from billing_entitlements
        where user_id = $1 and entitlement_key = $2
          and ((status in ('active', 'grace_period') and (current_period_end is null or current_period_end > now()))
               or (status = 'cancelled' and current_period_end is not null and current_period_end > now()))
     ) as active`,
    [userId, entitlementKey],
  );
  return rows[0]?.active === true;
}

export interface RecordUsageEventInput {
  userId?: string | null;
  executionId?: string | null;
  toolId: string;
  billingKey: string;
  pricingVersion?: string;
  provider?: string | null;
  estimatedCostUsdMicros?: number | null;
  actualCostUsdMicros?: number | null;
  billedSubunits?: number;
  idempotencyKey: string;
  status: "quoted" | "succeeded" | "failed" | "refunded" | "unknown_cost";
  usage?: Record<string, unknown>;
}

/** Append an immutable, idempotent cost/usage measurement for audit and reconciliation. */
export async function recordUsageEvent(input: RecordUsageEventInput) {
  if (!input.toolId || input.toolId.length > 160 || !input.billingKey || input.billingKey.length > 120) {
    throw new BillingError("INVALID_AMOUNT", "A valid tool id and billing key are required for usage accounting.");
  }
  const idempotencyKey = validIdempotencyKey(input.idempotencyKey);
  const billedSubunits = requireAmount(input.billedSubunits ?? 0, true);
  const estimatedCost = input.estimatedCostUsdMicros == null ? null : requireAmount(input.estimatedCostUsdMicros, true);
  const actualCost = input.actualCostUsdMicros == null ? null : requireAmount(input.actualCostUsdMicros, true);
  if (input.userId && input.userId.length > 256) throw new BillingError("INVALID_AMOUNT", "The user id is invalid.");
  if (input.executionId && input.executionId.length > 200) throw new BillingError("INVALID_AMOUNT", "The execution id is invalid.");
  if (input.provider && input.provider.length > 120) throw new BillingError("INVALID_AMOUNT", "The provider id is invalid.");
  const usageJson = canonicalUsageJson(input.usage ?? {});
  if (new TextEncoder().encode(usageJson).byteLength > 16_384) throw new BillingError("INVALID_AMOUNT", "Usage measurements exceed the allowed size.");
  const usageDigest = createHash("sha256").update(usageJson).digest("hex");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    if (input.userId) await ensureBillingAccount(tx, input.userId);
    const inserted = await tx.query<{ id: string }>(
      `insert into billing_usage_events
        (id, user_id, execution_id, tool_id, billing_key, pricing_version, provider,
         estimated_cost_usd_micros, actual_cost_usd_micros, billed_subunits, idempotency_key, status, usage, usage_digest)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
       on conflict (idempotency_key) do nothing returning id`,
      [randomUUID(), input.userId ?? null, input.executionId ?? null, input.toolId, input.billingKey,
        input.pricingVersion ?? PRICING_VERSION, input.provider ?? null, estimatedCost, actualCost,
        billedSubunits, idempotencyKey, input.status, usageJson, usageDigest],
    );
    if (inserted[0]) return { id: inserted[0].id, idempotentReplay: false };
    const existing = await tx.query<{
      id: string; user_id: string | null; execution_id: string | null; tool_id: string; billing_key: string;
      pricing_version: string; provider: string | null; estimated_cost_usd_micros: number | string | null;
      actual_cost_usd_micros: number | string | null; billed_subunits: number | string; status: string; usage_digest: string;
    }>(`select id, user_id, execution_id, tool_id, billing_key, pricing_version, provider, estimated_cost_usd_micros, actual_cost_usd_micros, billed_subunits, status, usage_digest
         from billing_usage_events where idempotency_key = $1`, [idempotencyKey]);
    const prior = existing[0];
    if (!prior || prior.user_id !== (input.userId ?? null) || prior.execution_id !== (input.executionId ?? null) ||
        prior.tool_id !== input.toolId || prior.billing_key !== input.billingKey ||
        prior.pricing_version !== (input.pricingVersion ?? PRICING_VERSION) || prior.provider !== (input.provider ?? null) ||
        (prior.estimated_cost_usd_micros == null ? null : amount(prior.estimated_cost_usd_micros)) !== estimatedCost ||
        (prior.actual_cost_usd_micros == null ? null : amount(prior.actual_cost_usd_micros)) !== actualCost ||
        amount(prior.billed_subunits) !== billedSubunits || prior.status !== input.status || prior.usage_digest !== usageDigest) {
      throw new BillingError("IDEMPOTENCY_CONFLICT", "This usage idempotency key was reused with different execution data.");
    }
    return { id: prior.id, idempotentReplay: true };
  });
}

/** Call only after the provider webhook/signature and order amount/currency have been verified. */
export async function creditVerifiedPurchase(input: {
  purchaseIntentId: string;
  provider: string;
  providerEventId: string;
  providerTransactionId: string;
  paidAmountMinor: number;
  paidCurrency: string;
  payloadDigest: string;
}) {
  if (!Number.isSafeInteger(input.paidAmountMinor) || input.paidAmountMinor <= 0 ||
      !input.provider || input.provider.length > 80 || !input.providerEventId || input.providerEventId.length > 200 ||
      !input.providerTransactionId || input.providerTransactionId.length > 240 ||
      !/^[A-Z]{3}$/i.test(input.paidCurrency) || !/^[a-f0-9]{64}$/i.test(input.payloadDigest)) {
    throw new BillingError("PURCHASE_MISMATCH", "The verified payment metadata is invalid.");
  }
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const intents = await tx.query<{
      id: string; user_id: string; provider: string; amount_minor: number | string; currency: string;
      credits_subunits: number | string; status: string; provider_transaction_id: string | null;
    }>(`select id, user_id, provider, amount_minor, currency, credits_subunits, status, provider_transaction_id
          from billing_purchase_intents where id = $1 for update`, [input.purchaseIntentId]);
    const intent = intents[0];
    if (!intent) throw new BillingError("PURCHASE_NOT_VERIFIED", "The purchase intent does not exist.");
    if (intent.provider !== input.provider || amount(intent.amount_minor) !== input.paidAmountMinor || intent.currency.toUpperCase() !== input.paidCurrency.toUpperCase()) {
      throw new BillingError("PURCHASE_MISMATCH", "The verified provider payment does not match the purchase intent.");
    }
    const events = await tx.query<{ id: string }>(
      `insert into billing_webhook_events
         (id, provider, provider_event_id, purchase_intent_id, payload_digest, processing_status)
       values ($1, $2, $3, $4, $5, 'received')
       on conflict (provider, provider_event_id) do nothing returning id`,
      [randomUUID(), input.provider, input.providerEventId, intent.id, input.payloadDigest],
    );
    if (!events[0]) {
      const priorEvents = await tx.query<{ purchase_intent_id: string | null; payload_digest: string; processing_status: string }>(
        `select purchase_intent_id, payload_digest, processing_status from billing_webhook_events
          where provider = $1 and provider_event_id = $2`,
        [input.provider, input.providerEventId],
      );
      const prior = priorEvents[0];
      if (!prior || prior.purchase_intent_id !== intent.id || prior.payload_digest !== input.payloadDigest) {
        throw new BillingError("PURCHASE_MISMATCH", "A previously seen provider event does not match this purchase and payload.");
      }
      return { status: "already-processed" as const, creditedSubunits: 0 };
    }
    if (intent.status === "credited") {
      await tx.query(
        `update billing_webhook_events set processing_status = 'ignored', processed_at = now(), error_code = 'PURCHASE_ALREADY_CREDITED'
          where provider = $1 and provider_event_id = $2`,
        [input.provider, input.providerEventId],
      );
      return { status: "already-processed" as const, creditedSubunits: 0 };
    }
    if (!(intent.status === "created" || intent.status === "pending" || intent.status === "verified")) {
      throw new BillingError("PURCHASE_NOT_VERIFIED", "The purchase intent is not in a creditable state.");
    }
    if (intent.provider_transaction_id && intent.provider_transaction_id !== input.providerTransactionId) {
      throw new BillingError("PURCHASE_MISMATCH", "The provider transaction id does not match the purchase intent.");
    }
    const creditSubunits = requireAmount(amount(intent.credits_subunits));
    await ensureBillingAccount(tx, intent.user_id);
    const accountUpdate = await tx.query<{ user_id: string }>(
      `update billing_accounts set available_subunits = available_subunits + $2,
        lifetime_purchased_subunits = lifetime_purchased_subunits + $2, updated_at = now()
        where user_id = $1 returning user_id`,
      [intent.user_id, creditSubunits],
    );
    if (!accountUpdate[0]) throw new Error("The billing account could not be credited.");
    await tx.query(
      `insert into billing_credit_ledger
       (id, user_id, entry_type, delta_available_subunits, idempotency_key, reference_id, description, currency, payment_amount_minor, metadata)
       values ($1, $2, 'purchase', $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [randomUUID(), intent.user_id, creditSubunits, `purchase:${intent.id}`, intent.id, "Verified credit purchase", intent.currency.toUpperCase(), input.paidAmountMinor,
        JSON.stringify({ provider: input.provider, transactionId: input.providerTransactionId })],
    );
    await tx.query(
      `update billing_purchase_intents set status = 'credited', provider_transaction_id = $2, credited_at = now(), updated_at = now() where id = $1`,
      [intent.id, input.providerTransactionId],
    );

    // Referral rewards are granted only after the first verified paid conversion.
    // The reward, immutable ledger entry, and referral status update share this transaction.
    const referrals = await tx.query<{
      id: string; referrer_user_id: string; referred_user_id: string; source: "referral" | "video";
    }>(
      `select id, referrer_user_id, referred_user_id, source
         from billing_referrals where referred_user_id = $1 and status = 'pending'
         for update`,
      [intent.user_id],
    );
    const referral = referrals[0];
    if (referral) {
      const configuredBase = Number(process.env.BILLING_REFERRAL_REWARD_TOKENS ?? "5");
      const baseTokens = Number.isSafeInteger(configuredBase) && configuredBase > 0 && configuredBase <= 100 ? configuredBase : 5;
      const configuredPercent = Number(process.env.BILLING_AFFILIATE_REWARD_PERCENT ?? "10");
      const affiliatePercent = Number.isFinite(configuredPercent) && configuredPercent > 0 && configuredPercent <= 25 ? configuredPercent : 10;
      const configuredMax = Number(process.env.BILLING_AFFILIATE_REWARD_MAX_TOKENS ?? "100");
      const affiliateMaxSubunits = Number.isSafeInteger(configuredMax) && configuredMax > 0 && configuredMax <= 1_000
        ? configuredMax * SUBUNITS_PER_TOKEN : 100 * SUBUNITS_PER_TOKEN;
      const rewards: Array<{ userId: string; sourceUserId: string; type: "referral_inviter" | "referral_invitee" | "affiliate_conversion"; subunits: number; key: string; description: string }> = [
        { userId: referral.referrer_user_id, sourceUserId: referral.referred_user_id, type: "referral_inviter",
          subunits: baseTokens * SUBUNITS_PER_TOKEN, key: `referral:${referral.id}:inviter`, description: "Verified enV referral reward" },
        { userId: referral.referred_user_id, sourceUserId: referral.referrer_user_id, type: "referral_invitee",
          subunits: baseTokens * SUBUNITS_PER_TOKEN, key: `referral:${referral.id}:invitee`, description: "Welcome reward for a verified enV referral" },
      ];
      if (referral.source === "video") {
        const affiliateSubunits = Math.min(affiliateMaxSubunits, Math.floor(creditSubunits * affiliatePercent / 100));
        if (affiliateSubunits > 0) rewards.push({
          userId: referral.referrer_user_id, sourceUserId: referral.referred_user_id, type: "affiliate_conversion",
          subunits: affiliateSubunits, key: `referral:${referral.id}:affiliate`, description: "Verified video affiliate conversion reward",
        });
      }
      for (const reward of rewards) {
        await ensureBillingAccount(tx, reward.userId);
        const created = await tx.query<{ id: string }>(
          `insert into billing_reward_events
            (id, user_id, source_user_id, referral_id, reward_type, amount_subunits, status, idempotency_key, metadata, credited_at)
           values ($1, $2, $3, $4, $5, $6, 'credited', $7, $8::jsonb, now())
           on conflict (idempotency_key) do nothing returning id`,
          [randomUUID(), reward.userId, reward.sourceUserId, referral.id, reward.type, reward.subunits, reward.key,
            JSON.stringify({ purchaseIntentId: intent.id, provider: input.provider })],
        );
        if (!created[0]) continue;
        const credited = await tx.query<{ user_id: string }>(
          `update billing_accounts set available_subunits = available_subunits + $2, updated_at = now()
            where user_id = $1 returning user_id`,
          [reward.userId, reward.subunits],
        );
        if (!credited[0]) throw new Error("A referral reward could not be credited.");
        await tx.query(
          `insert into billing_credit_ledger
            (id, user_id, entry_type, delta_available_subunits, idempotency_key, reference_id, description, metadata)
           values ($1, $2, 'promotion', $3, $4, $5, $6, $7::jsonb)`,
          [randomUUID(), reward.userId, reward.subunits, `reward:${reward.key}`, referral.id, reward.description,
            JSON.stringify({ rewardType: reward.type, purchaseIntentId: intent.id })],
        );
      }
      await tx.query(
        `update billing_referrals set status = 'rewarded', qualified_purchase_intent_id = $2, rewarded_at = now()
          where id = $1 and status = 'pending'`,
        [referral.id, intent.id],
      );
    }
    await tx.query(`update billing_webhook_events set processing_status = 'processed', processed_at = now() where provider = $1 and provider_event_id = $2`, [input.provider, input.providerEventId]);
    return { status: "credited" as const, creditedSubunits: creditSubunits };
  });
}
