-- 0014: bounded chemical parameter-grid calculations on the private worker.
-- Requires the 0009, 0012 and 0013 queue migrations.
ALTER TABLE public.world_lab_jobs
  DROP CONSTRAINT IF EXISTS world_lab_jobs_kind_check;
ALTER TABLE public.world_lab_jobs
  ADD CONSTRAINT world_lab_jobs_kind_check CHECK (
    kind IN ('hydrostatics','dc-network','wired-motor','chemical-thermal',
      'multi-sphere','exhaustive-logic','chemical-sweep')
  );
