-- Immutable bounded revision history of authenticated World Lab backups.
-- Deploy migration 0010 first. No direct anonymous or client SQL access.
CREATE TABLE IF NOT EXISTS public.world_lab_project_versions (
  user_id text NOT NULL,
  project_id text NOT NULL,
  server_revision integer NOT NULL CHECK(server_revision BETWEEN 1 AND 1000000000),
  project_revision integer NOT NULL CHECK(project_revision BETWEEN 0 AND 1000000000),
  project_title text NOT NULL CHECK(char_length(project_title) BETWEEN 1 AND 120),
  project_json jsonb NOT NULL CHECK(octet_length(project_json::text) <= 1048576),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,project_id,server_revision),
  FOREIGN KEY (user_id,project_id) REFERENCES public.world_lab_projects(user_id,project_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS world_lab_versions_recent_idx
  ON public.world_lab_project_versions(user_id,project_id,server_revision DESC);
ALTER TABLE public.world_lab_project_versions ENABLE ROW LEVEL SECURITY;
-- Backfill latest pre-existing snapshots. Existing older versions cannot be reconstructed.
INSERT INTO public.world_lab_project_versions
  (user_id,project_id,server_revision,project_revision,project_title,project_json)
SELECT user_id,project_id,server_revision,project_revision,project_title,project_json
FROM public.world_lab_projects
ON CONFLICT (user_id,project_id,server_revision) DO NOTHING;
