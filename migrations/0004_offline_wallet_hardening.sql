-- Hardening layer for the offline wallet API. All schema changes are additive.
-- New endpoints remain feature-gated; this migration alone does not enable billing.

alter table billing_offline_allowances
  add column if not exists issue_idempotency_key text,
  add column if not exists device_public_key jsonb,
  add column if not exists token_digest text,
  add column if not exists last_processed_sequence bigint not null default 0,
  add column if not exists platform text not null default 'web';

alter table billing_offline_transactions
  add column if not exists execution_outcome text not null default 'succeeded'
    check (execution_outcome in ('succeeded', 'failed'));

create unique index if not exists billing_offline_allowances_issue_key_unique
  on billing_offline_allowances (issue_idempotency_key)
  where issue_idempotency_key is not null;

-- A device may have only one unresolved allowance at a time. The service also
-- enforces a per-account concurrent allowance ceiling while holding the wallet row lock.
create unique index if not exists billing_offline_one_active_allowance_per_device
  on billing_offline_allowances (user_id, device_key_digest)
  where status in ('issued', 'syncing', 'needs_recovery');

create table if not exists billing_offline_sync_batches (
  id text primary key,
  allowance_id text not null references billing_offline_allowances (id) on delete cascade,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  batch_id text not null,
  payload_digest text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (allowance_id, batch_id)
);
create index if not exists billing_offline_sync_batches_user_created_idx
  on billing_offline_sync_batches (user_id, created_at desc);

-- Fixed-window limits are keyed by salted/hash identifiers, not raw IPs or device keys.
-- Edge/CDN rate limits remain necessary for unauthenticated volumetric attacks.
create table if not exists billing_security_rate_limits (
  action text not null,
  subject_digest text not null,
  window_start timestamptz not null,
  hit_count integer not null default 1 check (hit_count > 0),
  updated_at timestamptz not null default now(),
  primary key (action, subject_digest, window_start)
);
create index if not exists billing_security_rate_limits_updated_idx
  on billing_security_rate_limits (updated_at);

create index if not exists billing_offline_allowances_device_idx
  on billing_offline_allowances (device_key_digest, created_at desc);

-- A client-signed final checkpoint does not prove journal completeness. Only a future
-- server-side native integrity verifier may create a matching verified proof; Web cannot
-- use this table because browser-local execution is not tamper-proof.
create table if not exists billing_offline_finalization_proofs (
  id text primary key,
  allowance_id text not null references billing_offline_allowances (id) on delete cascade,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  checkpoint_sequence bigint not null check (checkpoint_sequence >= 0),
  pricing_version text not null,
  device_key_digest text not null check (device_key_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest text not null check (evidence_digest ~ '^[a-f0-9]{64}$'),
  verifier_policy_version text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (allowance_id, checkpoint_sequence, platform, verifier_policy_version)
);
create index if not exists billing_offline_finalization_proofs_user_created_idx
  on billing_offline_finalization_proofs (user_id, created_at desc);
