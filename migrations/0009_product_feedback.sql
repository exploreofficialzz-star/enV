-- Private developer feedback tickets. Public tool discussions use a separate schema/API.
-- Reporter identifiers are keyed HMAC digests; raw IP addresses are never stored.

create table if not exists product_feedback (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-fA-F-]{36}$'),
  reporter_digest text not null check (reporter_digest ~ '^[a-f0-9]{64}$'),
  user_id text references "user" ("id") on delete set null,
  platform text not null check (platform in ('web', 'android', 'ios')),
  category text not null check (category in ('bug', 'tool_issue', 'idea', 'account', 'billing', 'other')),
  title varchar(120) not null check (char_length(title) between 5 and 120),
  description text not null check (char_length(description) between 20 and 4000),
  tool_id text,
  app_version varchar(40),
  status text not null default 'open' check (status in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  developer_note varchar(2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_digest, idempotency_key)
);
create index if not exists product_feedback_inbox_idx
  on product_feedback (status, priority desc, created_at desc);
create index if not exists product_feedback_tool_idx
  on product_feedback (tool_id, created_at desc) where tool_id is not null;
create index if not exists product_feedback_retention_idx
  on product_feedback (resolved_at) where resolved_at is not null;

-- Fixed-hour reporter throttling. The HMAC subject digest is not reversible without
-- the server secret; this table never contains a raw address or device identifier.
create table if not exists product_feedback_rate_limits (
  reporter_digest text not null check (reporter_digest ~ '^[a-f0-9]{64}$'),
  window_hour bigint not null,
  request_count integer not null check (request_count between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (reporter_digest, window_hour)
);

create table if not exists product_feedback_status_events (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  feedback_id text not null references product_feedback (id) on delete cascade,
  actor text not null check (actor = 'developer_admin'),
  previous_status text not null check (previous_status in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  next_status text not null check (next_status in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists product_feedback_status_events_ticket_idx
  on product_feedback_status_events (feedback_id, created_at desc);

comment on table product_feedback is
  'Private developer feedback tickets. Not public comments or community discussions. Avoid collecting secrets or payment details.';
comment on column product_feedback.reporter_digest is
  'Keyed HMAC digest for abuse controls; never a raw IP address or device identifier.';


-- Application data is accessed through the trusted server connection only.
-- No anon/authenticated client policies are created.
alter table public.product_analytics_consents enable row level security;
alter table public.product_analytics_events enable row level security;
alter table public.product_analytics_rate_limits enable row level security;
alter table public.product_feedback enable row level security;
alter table public.product_feedback_rate_limits enable row level security;
alter table public.product_feedback_status_events enable row level security;
