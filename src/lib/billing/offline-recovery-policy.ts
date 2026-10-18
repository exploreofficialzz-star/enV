/** Recovery state policy kept pure so replay/finalization rules can be regression-tested. */
export type OfflineRecoveryStatus = "issued" | "syncing" | "reconciled" | "expired" | "needs_recovery" | "revoked";

export interface OfflineRecoveryDecisionInput {
  status: OfflineRecoveryStatus | string;
  recoveryReason: string | null;
  /** True only after the server found verified evidence bound to the exact saved final batch digest. */
  matchingVerifiedFinalizationProof: boolean;
}

/**
 * Recovery may resume only for the two explicitly repairable ledger/checkpoint errors, or for
 * the exact final batch after independent server-side integrity verification. A client assertion
 * or a different batch ID must never clear FINALIZATION_PROOF_REQUIRED.
 */
export function canResumeOfflineSync(input: OfflineRecoveryDecisionInput): boolean {
  if (input.status === "revoked" || input.status === "expired") return false;
  if (input.status !== "needs_recovery") return true;
  if (input.recoveryReason === "SEQUENCE_GAP" || input.recoveryReason === "CHECKPOINT_SEQUENCE_MISMATCH") return true;
  return input.recoveryReason === "FINALIZATION_PROOF_REQUIRED" && input.matchingVerifiedFinalizationProof;
}

/** In-memory local development only: never applicable to production, Vercel, or any external DB.
 * This allows end-to-end reconciliation tests without treating a client assertion as trusted
 * evidence for real customer balances. Production must use an independently verified proof. */
export function isLocalTestFinalizationEnabled(input: {
  flag: string | undefined;
  nodeEnv: string | undefined;
  vercel: string | undefined;
  databaseUrl: string | undefined;
}): boolean {
  return input.flag === "true" && input.nodeEnv !== "production" && input.vercel !== "1" && !input.databaseUrl?.trim();
}
