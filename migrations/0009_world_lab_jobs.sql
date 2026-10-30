-- enV World Lab bounded scientific jobs. All operations are server-side.
-- Requires the real Better Auth account; never use shared development identity.
CREATE TABLE IF NOT EXISTS public.world_lab_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  input_sha256 char(64) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hydrostatics','dc-network','wired-motor')),
  project_id text NOT NULL,
  project_revision integer NOT NULL CHECK (project_revision >= 0),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input_json jsonb NOT NULL,
  result_json jsonb,
  error_code text,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_token text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (octet_length(input_json::text) <= 65536),
  CHECK (result_json IS NULL OR octet_length(result_json::text) <= 2097152),
  CHECK ((status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status <> 'running')
);
CREATE UNIQUE INDEX IF NOT EXISTS world_lab_jobs_owner_idempotency_idx
  ON public.world_lab_jobs(user_id,idempotency_key);
CREATE INDEX IF NOT EXISTS world_lab_jobs_owner_recent_idx
  ON public.world_lab_jobs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS world_lab_jobs_queue_idx
  ON public.world_lab_jobs(created_at)
  WHERE status IN ('queued','running');
ALTER TABLE public.world_lab_jobs ENABLE ROW LEVEL SECURITY;
-- No direct Supabase Data API policies: only authenticated server SQL.
