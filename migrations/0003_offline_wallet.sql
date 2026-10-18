-- Offline wallet foundation only. These tables do not enable offline token spending.
-- All amounts are integer milli-token subunits. Server reservations remain authoritative.

create table if not exists billing_offline_allowances (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  reservation_id text not null unique references billing_reservations (id) on delete cascade,
  device_key_digest text not null,
  allowance_subunits bigint not null check (allowance_subunits > 0),
  pricing_version text not null,
  status text not null check (status in ('issued', 'syncing', 'reconciled', 'expired', 'needs_recovery', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_sync_at timestamptz,
  last_accepted_sequence bigint not null default 0 check (last_accepted_sequence >= 0),
  accepted_subunits bigint not null default 0 check (accepted_subunits >= 0),
  payload_digest text,
  recovery_reason text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accepted_subunits <= allowance_subunits),
  check (expires_at > issued_at)
);
create index if not exists billing_offline_allowances_user_status_idx
  on billing_offline_allowances (user_id, status, expires_at);
create index if not exists billing_offline_allowances_expiry_idx
  on billing_offline_allowances (expires_at) where status in ('issued', 'syncing', 'needs_recovery');

-- Each locally generated operation is idempotent and ordered within its allowance.
-- Only server-validated rows are accepted; client claims never directly mutate wallet balances.
create table if not exists billing_offline_transactions (
  id text primary key,
  allowance_id text not null references billing_offline_allowances (id) on delete cascade,
  transaction_id text not null,
  sequence_number bigint not null check (sequence_number > 0),
  tool_id text not null,
  pricing_version text not null,
  unit_count bigint not null default 1 check (unit_count > 0),
  claimed_subunits bigint not null check (claimed_subunits >= 0),
  accepted_subunits bigint check (accepted_subunits is null or accepted_subunits >= 0),
  usage_digest text not null,
  outcome text not null check (outcome in ('received', 'accepted', 'rejected', 'needs_review')),
  rejection_code text,
  device_recorded_at timestamptz,
  received_at timestamptz not null default now(),
  reconciled_at timestamptz,
  unique (allowance_id, transaction_id),
  unique (allowance_id, sequence_number)
);
create index if not exists billing_offline_transactions_allowance_outcome_idx
  on billing_offline_transactions (allowance_id, outcome, sequence_number);

-- Security telemetry is deliberately metadata-only. Never put user files, prompts, text,
-- credentials, raw device identifiers, or payment details in this table.
create table if not exists billing_security_events (
  id text primary key,
  user_id text references billing_accounts (user_id) on delete set null,
  event_type text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  event_key text not null unique,
  subject_digest text,
  platform text check (platform is null or platform in ('web', 'android', 'ios', 'server')),
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_security_events_created_severity_idx
  on billing_security_events (created_at desc, severity);
create index if not exists billing_security_events_user_created_idx
  on billing_security_events (user_id, created_at desc) where user_id is not null;
