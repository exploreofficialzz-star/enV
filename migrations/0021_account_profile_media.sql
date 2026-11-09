-- Private, account-owned profile avatar and cover photos.
-- Requests are served only by authenticated enV server routes; no Supabase Data API access.

CREATE TABLE IF NOT EXISTS public.account_profile_media (
  user_id TEXT PRIMARY KEY
    REFERENCES public."user" ("id") ON DELETE CASCADE,
  avatar_bytes BYTEA,
  avatar_mime TEXT,
  cover_bytes BYTEA,
  cover_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_profile_media_avatar_pair_check
    CHECK ((avatar_bytes IS NULL) = (avatar_mime IS NULL)),
  CONSTRAINT account_profile_media_cover_pair_check
    CHECK ((cover_bytes IS NULL) = (cover_mime IS NULL)),
  CONSTRAINT account_profile_media_avatar_size_check
    CHECK (avatar_bytes IS NULL OR octet_length(avatar_bytes) BETWEEN 1 AND 1572864),
  CONSTRAINT account_profile_media_cover_size_check
    CHECK (cover_bytes IS NULL OR octet_length(cover_bytes) BETWEEN 1 AND 4194304),
  CONSTRAINT account_profile_media_avatar_mime_check
    CHECK (avatar_mime IS NULL OR avatar_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT account_profile_media_cover_mime_check
    CHECK (cover_mime IS NULL OR cover_mime IN ('image/jpeg', 'image/png', 'image/webp'))
);

COMMENT ON TABLE public.account_profile_media IS
  'Private per-account profile avatar and cover images. Accessed only by authenticated enV server routes; never exposed directly through the Supabase Data API.';

ALTER TABLE public.account_profile_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.account_profile_media FROM PUBLIC;

DO $profile_media_privileges$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.account_profile_media FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$profile_media_privileges$;
