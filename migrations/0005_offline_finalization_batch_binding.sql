-- A native finalization proof must bind to the exact canonical batch, not only its checkpoint.
-- Any legacy proof without this binding is untrusted and must never release a reservation.
ALTER TABLE billing_offline_finalization_proofs
  ADD COLUMN IF NOT EXISTS batch_digest text;

DELETE FROM billing_offline_finalization_proofs WHERE batch_digest IS NULL;

ALTER TABLE billing_offline_finalization_proofs
  ALTER COLUMN batch_digest SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_offline_finalization_batch_digest_check'
      AND conrelid = 'billing_offline_finalization_proofs'::regclass
  ) THEN
    ALTER TABLE billing_offline_finalization_proofs
      ADD CONSTRAINT billing_offline_finalization_batch_digest_check
      CHECK (batch_digest ~ '^[a-f0-9]{64}$');
  END IF;
END $$;
