-- Explicit, owner-scoped backups for immutable gravity and material-heat evidence.
-- 0010 and 0011 must already be migrated. Never expose SQL directly to clients.
CREATE TABLE IF NOT EXISTS public.world_lab_science_evidence (
  user_id text NOT NULL,
  project_id text NOT NULL,
  evidence_id text NOT NULL CHECK(char_length(evidence_id) BETWEEN 1 AND 120),
  project_revision integer NOT NULL CHECK(project_revision BETWEEN 0 AND 1000000000),
  kind text NOT NULL CHECK(kind IN ('newton-gravity','material-heat')),
  created_at timestamptz NOT NULL,
  evidence_json jsonb NOT NULL CHECK(octet_length(evidence_json::text) <= 2097152),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,project_id,evidence_id),
  FOREIGN KEY (user_id,project_id) REFERENCES public.world_lab_projects(user_id,project_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS world_lab_science_evidence_recent_idx
  ON public.world_lab_science_evidence(user_id,project_id,uploaded_at DESC);
ALTER TABLE public.world_lab_science_evidence ENABLE ROW LEVEL SECURITY;
-- Service-level SQL with Better Auth ownership check, no direct Data API policy.
