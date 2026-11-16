import { getSql } from "../db";
import { verifyAndCreditPaystackReference } from "./paystack.server";
import { verifyAndCreditFlutterwaveReference } from "./flutterwave-v4.server";
import { verifyAndCreditCryptomusReference } from "./cryptomus.server";

type PendingPurchase = {
  id: string;
  user_id: string;
  provider: string;
  provider_transaction_id: string | null;
};

type ReconciliationCounts = {
  scanned: number;
  credited: number;
  alreadyProcessed: number;
  awaitingConfirmation: number;
  requiresReview: number;
  cancelled: number;
  failed: number;
  remainingEligible: number;
};

const RECONCILIATION_BATCH_LIMIT = 100;
const RECONCILIATION_CONCURRENCY = 10;

async function reconcilePurchaseBatch(userId: string | null, requestedLimit: number): Promise<ReconciliationCounts> {
  const empty: ReconciliationCounts = {
    scanned: 0, credited: 0, alreadyProcessed: 0, awaitingConfirmation: 0,
    requiresReview: 0, cancelled: 0, failed: 0, remainingEligible: 0,
  };
  if (userId !== null && (!userId || userId.length > 256)) return empty;
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(RECONCILIATION_BATCH_LIMIT, requestedLimit))
    : 25;
  const sql = await getSql();
  const userFilter = userId === null ? "" : "and user_id = $1";
  const limitParameter = userId === null ? "$1" : "$2";
  const parameters = userId === null ? [limit] : [userId, limit];

  // Claim a bounded batch atomically. Updating updated_at prevents overlapping cron
  // runs and wallet reads from repeatedly claiming the same provider references.
  const pending = await sql.query<PendingPurchase>(
    `with eligible as (
       select id
         from billing_purchase_intents
        where provider in ('paystack', 'flutterwave', 'cryptomus')
          and status in ('created', 'pending', 'verified', 'failed')
          and updated_at <= now() - interval '15 seconds'
          ${userFilter}
        order by updated_at asc, created_at asc, id asc
        limit ${limitParameter}
        for update skip locked
     )
     update billing_purchase_intents as intent
        set updated_at = now()
       from eligible
      where intent.id = eligible.id
     returning intent.id, intent.user_id, intent.provider, intent.provider_transaction_id`,
    parameters,
  );

  const counts: ReconciliationCounts = { ...empty, scanned: pending.length };
  const processPurchase = async (purchase: PendingPurchase) => {
    try {
      let result: { status: string };
      if (purchase.provider === "paystack") {
        result = await verifyAndCreditPaystackReference(purchase.id);
      } else if (purchase.provider === "flutterwave") {
        result = await verifyAndCreditFlutterwaveReference(
          purchase.id,
          purchase.provider_transaction_id ?? undefined,
          undefined,
          purchase.user_id,
        );
      } else if (purchase.provider === "cryptomus") {
        result = await verifyAndCreditCryptomusReference(
          purchase.id,
          purchase.provider_transaction_id ?? undefined,
        );
      } else {
        throw new Error("Unsupported payment provider in reconciliation batch.");
      }
      switch (result.status) {
        case "credited": counts.credited += 1; break;
        case "already-processed": counts.alreadyProcessed += 1; break;
        case "requires-review": counts.requiresReview += 1; break;
        case "cancelled": counts.cancelled += 1; break;
        case "failed": counts.failed += 1; break;
        default: counts.awaitingConfirmation += 1; break;
      }
    } catch (error) {
      const candidate = error as { code?: unknown };
      const code = typeof candidate.code === "string" ? candidate.code : "RECONCILIATION_FAILED";
      if (code === "PAYMENT_NOT_CONFIRMED") {
        counts.awaitingConfirmation += 1;
      } else {
        counts.failed += 1;
        console.error("[billing-purchase-reconciliation] " + JSON.stringify({
          provider: purchase.provider,
          code,
          causeType: error instanceof Error ? error.name : "UnknownError",
        }));
      }
    }
  };

  for (let offset = 0; offset < pending.length; offset += RECONCILIATION_CONCURRENCY) {
    await Promise.all(pending.slice(offset, offset + RECONCILIATION_CONCURRENCY).map(processPurchase));
  }

  const remaining = await sql.query<{ count: number | string }>(
    `select count(*)::text as count
       from billing_purchase_intents
      where provider in ('paystack', 'flutterwave', 'cryptomus')
        and status in ('created', 'pending', 'verified', 'failed')
        and updated_at <= now() - interval '15 seconds'
        ${userFilter}`,
    userId === null ? [] : [userId],
  );
  counts.remainingEligible = Number(remaining[0]?.count ?? 0);
  return counts;
}

/**
 * Recover provider-confirmed purchases for one authenticated account. The user ID
 * comes from the verified session, never from a request body or provider email.
 * Each provider is re-queried before the atomic ledger-credit transaction runs.
 */
export async function reconcilePendingPurchasesForUser(userId: string): Promise<void> {
  await reconcilePurchaseBatch(userId, 10);
}

/**
 * Bounded scheduled recovery across all accounts. The original purchase intent
 * remains the sole source of account ownership; the job never guesses an account
 * from a payer email. Provider confirmation and the idempotent ledger transaction
 * are required for every credit.
 */
export async function reconcilePendingPurchasesBatch(): Promise<ReconciliationCounts> {
  return reconcilePurchaseBatch(null, 100);
}
