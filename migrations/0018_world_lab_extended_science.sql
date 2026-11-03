-- Extend the immutable account-owned evidence kind constraint without changing
-- or reapplying the original migration to already deployed installations.
-- The evidence API still enforces user ownership, revision and strict
-- mathematical record validation before storing any record.
ALTER TABLE public.world_lab_science_evidence
  DROP CONSTRAINT IF EXISTS world_lab_science_evidence_kind_check;
ALTER TABLE public.world_lab_science_evidence
  ADD CONSTRAINT world_lab_science_evidence_kind_check
  CHECK (kind IN ('newton-gravity','material-heat','interface-optics',
                 'optical-scene-ray','elastic-wave','thermal-radiation'));
