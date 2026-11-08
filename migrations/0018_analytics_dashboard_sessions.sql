-- Server-revocable developer dashboard sessions.
-- Only keyed digests are stored; raw session IDs remain inside signed HttpOnly cookies.
create table if not exists public.product_analytics_dashboard_sessions (
  session_digest text primary key check (session_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists product_analytics_dashboard_sessions_expiry_idx
  on public.product_analytics_dashboard_sessions(expires_at);
create index if not exists product_analytics_dashboard_sessions_revoked_idx
  on public.product_analytics_dashboard_sessions(revoked_at) where revoked_at is not null;
alter table public.product_analytics_dashboard_sessions enable row level security;
comment on table public.product_analytics_dashboard_sessions is
  'Server-only dashboard session allowlist. Contains HMAC digests, expiry and revocation timestamps, never raw cookie/session tokens.';
