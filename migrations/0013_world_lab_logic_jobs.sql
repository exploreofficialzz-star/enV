-- 0013: bounded cloud-only exhaustive combinational digital checks.
-- Apply 0009 and 0012 before this migration. Owner RLS remains unchanged.
ALTER TABLE public.world_lab_jobs
  DROP CONSTRAINT IF EXISTS world_lab_jobs_kind_check;
ALTER TABLE public.world_lab_jobs
  ADD CONSTRAINT world_lab_jobs_kind_check CHECK(
    kind IN ('hydrostatics','dc-network','wired-motor','chemical-thermal',
      'multi-sphere','exhaustive-logic')
  );
