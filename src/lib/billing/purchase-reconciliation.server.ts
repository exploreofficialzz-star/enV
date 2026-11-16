import { getSql } from "../db";
import { verifyAndCreditPaystackReference } from "./paystack.server";
import { verifyAndCreditFlutterwaveReference } from "./flutterwave-v4.server";
import { verifyAndCreditCryptomusReference } from "./cryptomus.server";

type PendingPurchase = {
  id: string;
  provider: string;
  provider_transaction_id: string | null;
};

/**
 * Recover provider-confirmed purchases if the customer returned before a webhook
 * was delivered or the first verification attempt could complete. Only intents
 * owned by the authenticated user are selected; each provider is re-queried
 * before the existing atomic ledger-credit transaction is allowed to run.
 */
export async function reconcilePendingPurchasesForUser(userId: string): Promise<void> {
  if (!userId || userId.length > 256) return;
  const sql = await getSql();
  const pending = await sql.query<PendingPurchase>(
    `with eligible as (
       select id
         from billing_purchase_intents
        where user_id = $1
          and provider in ('paystack', 'flutterwave', 'cryptomus')
          and status in ('created', 'pending', 'verified')
          and created_at >= now() - interval '30 days'
          and updated_at <= now() - interval '15 seconds'
        order by updated_at asc
        limit 10
        for update skip locked
     )
     update billing_purchase_intents as intent
        set updated_at = now()
       from eligible
      where intent.id = eligible.id
     returning intent.id, intent.provider, intent.provider_transaction_id`,
    [userId],
  );

  for (const purchase of pending) {
    try {
      if (purchase.provider === "paystack") {
        await verifyAndCreditPaystackReference(purchase.id);
      } else if (purchase.provider === "flutterwave") {
        await verifyAndCreditFlutterwaveReference(
          purchase.id,
          purchase.provider_transaction_id ?? undefined,
          undefined,
          userId,
        );
      } else if (purchase.provider === "cryptomus") {
        await verifyAndCreditCryptomusReference(
          purchase.id,
          purchase.provider_transaction_id ?? undefined,
        );
      }
    } catch (error) {
      const candidate = error as { code?: unknown };
      const code = typeof candidate.code === "string" ? candidate.code : "RECONCILIATION_FAILED";
      if (code !== "PAYMENT_NOT_CONFIRMED") {
        console.error("[billing-purchase-reconciliation] " + JSON.stringify({
          provider: purchase.provider,
          reference: purchase.id,
          code,
          causeType: error instanceof Error ? error.name : "UnknownError",
        }));
      }
    }
  }
}
