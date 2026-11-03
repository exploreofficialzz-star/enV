-- Bounded 2–32 body Newtonian gravity queue jobs; migrations 0009 and 0012–0015 first.
ALTER TABLE public.world_lab_jobs DROP CONSTRAINT IF EXISTS world_lab_jobs_kind_check;
ALTER TABLE public.world_lab_jobs ADD CONSTRAINT world_lab_jobs_kind_check CHECK(
 kind IN ('hydrostatics','dc-network','wired-motor','chemical-thermal',
  'multi-sphere','exhaustive-logic','chemical-sweep','structural-sweep','newton-gravity')
);
