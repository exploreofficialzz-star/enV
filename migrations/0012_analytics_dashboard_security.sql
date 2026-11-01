-- Failed dashboard sign-in throttling; the subject is a keyed digest, not a raw address.
create table if not exists product_analytics_admin_rate_limits (
  subject_digest text not null check (subject_digest ~ '^[a-f0-9]{64}$'),
  window_minute bigint not null,
  request_count integer not null check (request_count between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key(subject_digest,window_minute)
);
alter table public.product_analytics_admin_rate_limits enable row level security;
