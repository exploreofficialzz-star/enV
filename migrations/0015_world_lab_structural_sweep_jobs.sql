-- 0015: 25-case assumed structural beam sensitivity jobs.
-- Requires existing world_lab_jobs migrations 0009 and 0012–0014.
ALTER TABLE public.world_lab_jobs DROP CONSTRAINT IF EXISTS world_lab_jobs_kind_check;
ALTER TABLE public.world_lab_jobs ADD CONSTRAINT world_lab_jobs_kind_check CHECK(
 kind IN ('hydrostatics','dc-network','wired-motor','chemical-thermal',
   'multi-sphere','exhaustive-logic','chemical-sweep','structural-sweep')
);
