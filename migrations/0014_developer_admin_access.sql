-- Privacy-preserving sign-in throttling for the private developer workspace.
create table if not exists developer_admin_login_rate_limits (
  subject_digest text not null check (subject_digest ~ '^[a-f0-9]{64}$'),
  window_bucket bigint not null,
  request_count integer not null check (request_count between 1 and 12),
  updated_at timestamptz not null default now(),
  primary key(subject_digest,window_bucket)
);
alter table public.developer_admin_login_rate_limits enable row level security;
