-- Owner-scoped remote backups. No anonymous/authenticated direct SQL policies.
CREATE TABLE IF NOT EXISTS public.world_lab_projects (
  user_id text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  project_id text NOT NULL,
  project_title text NOT NULL,
  project_revision integer NOT NULL CHECK(project_revision BETWEEN 0 AND 1000000000),
  server_revision integer NOT NULL DEFAULT 1 CHECK(server_revision BETWEEN 1 AND 1000000000),
  project_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,project_id),
  CHECK (octet_length(project_json::text) <= 1048576),
  CHECK (char_length(project_title) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS world_lab_projects_owner_recent_idx
  ON public.world_lab_projects(user_id,updated_at DESC);
ALTER TABLE public.world_lab_projects ENABLE ROW LEVEL SECURITY;
-- Only authenticated service SQL should own backups; no direct Data API policies.
