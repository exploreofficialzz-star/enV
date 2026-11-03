-- Extend the bounded scientific job queue to include 3D rigid hard-sphere contacts.
-- Requires 0009. No migration or direct SQL policy creates user access.
ALTER TABLE public.world_lab_jobs
  DROP CONSTRAINT IF EXISTS world_lab_jobs_kind_check;
ALTER TABLE public.world_lab_jobs
  ADD CONSTRAINT world_lab_jobs_kind_check
  CHECK(kind IN ('hydrostatics','dc-network','wired-motor','chemical-thermal','multi-sphere'));
