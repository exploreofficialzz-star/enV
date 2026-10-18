import test from "node:test";
import assert from "node:assert/strict";
import { canResumeOfflineSync, isLocalTestFinalizationEnabled } from "./offline-recovery-policy.ts";

test("only ledger-sequence and checkpoint errors are retryable without integrity proof", () => {
  for (const recoveryReason of ["SEQUENCE_GAP", "CHECKPOINT_SEQUENCE_MISMATCH"]) {
    assert.equal(canResumeOfflineSync({ status: "needs_recovery", recoveryReason, matchingVerifiedFinalizationProof: false }), true);
  }
  for (const recoveryReason of ["TRANSACTION_REPLAY_CONFLICT", "PRICING_OR_CLAIM_MISMATCH", "CLIENT_REPORTED_LOCAL_RECORDS_LOST", null]) {
    assert.equal(canResumeOfflineSync({ status: "needs_recovery", recoveryReason, matchingVerifiedFinalizationProof: false }), false);
  }
});

test("finalization recovery can resume only with a matching server-verified proof", () => {
  assert.equal(canResumeOfflineSync({ status: "needs_recovery", recoveryReason: "FINALIZATION_PROOF_REQUIRED", matchingVerifiedFinalizationProof: false }), false);
  assert.equal(canResumeOfflineSync({ status: "needs_recovery", recoveryReason: "FINALIZATION_PROOF_REQUIRED", matchingVerifiedFinalizationProof: true }), true);
  // A proof cannot relax any different recovery reason.
  assert.equal(canResumeOfflineSync({ status: "needs_recovery", recoveryReason: "TRANSACTION_REPLAY_CONFLICT", matchingVerifiedFinalizationProof: true }), false);
});

test("ordinary active states are unaffected, while expired and revoked allowances stay blocked", () => {
  for (const status of ["issued", "syncing", "reconciled"]) {
    assert.equal(canResumeOfflineSync({ status, recoveryReason: "FINALIZATION_PROOF_REQUIRED", matchingVerifiedFinalizationProof: false }), true);
  }
  for (const status of ["expired", "revoked"]) {
    assert.equal(canResumeOfflineSync({ status, recoveryReason: "SEQUENCE_GAP", matchingVerifiedFinalizationProof: true }), false);
  }
});


test("local finalization test override requires an explicit flag and an in-memory non-production runtime", () => {
  assert.equal(isLocalTestFinalizationEnabled({ flag: "true", nodeEnv: "development", vercel: undefined, databaseUrl: undefined }), true);
  assert.equal(isLocalTestFinalizationEnabled({ flag: "false", nodeEnv: "development", vercel: undefined, databaseUrl: undefined }), false);
  assert.equal(isLocalTestFinalizationEnabled({ flag: "true", nodeEnv: "production", vercel: undefined, databaseUrl: undefined }), false);
  assert.equal(isLocalTestFinalizationEnabled({ flag: "true", nodeEnv: "development", vercel: "1", databaseUrl: undefined }), false);
  assert.equal(isLocalTestFinalizationEnabled({ flag: "true", nodeEnv: "development", vercel: undefined, databaseUrl: "postgres://external" }), false);
});
