-- enV monetization foundation. No payment processor is activated by this schema alone.
-- Balances are held in integer milli-tokens (1,000 milli-tokens = 1 visible token).
-- One visible token has a proposed reference value of USD $0.01; rates remain configurable.

create table if not exists billing_accounts (
  user_id text primary key references "user" ("id") on delete cascade,
  available_subunits bigint not null default 0 check (available_subunits >= 0),
  reserved_subunits bigint not null default 0 check (reserved_subunits >= 0),
  lifetime_purchased_subunits bigint not null default 0 check (lifetime_purchased_subunits >= 0),
  lifetime_consumed_subunits bigint not null default 0 check (lifetime_consumed_subunits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_credit_ledger (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  entry_type text not null check (entry_type in ('purchase', 'promotion', 'reservation', 'settlement', 'release', 'refund', 'adjustment')),
  delta_available_subunits bigint not null default 0,
  delta_reserved_subunits bigint not null default 0,
  consumed_subunits bigint not null default 0 check (consumed_subunits >= 0),
  idempotency_key text not null unique,
  reference_id text,
  description text not null,
  currency char(3),
  payment_amount_minor bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_credit_ledger_user_created_idx on billing_credit_ledger (user_id, created_at desc);
create index if not exists billing_credit_ledger_reference_idx on billing_credit_ledger (reference_id) where reference_id is not null;

create table if not exists billing_reservations (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  operation_id text not null,
  idempotency_key text not null unique,
  reserved_subunits bigint not null check (reserved_subunits > 0),
  actual_subunits bigint check (actual_subunits >= 0),
  status text not null check (status in ('reserved', 'settled', 'released', 'needs_approval')),
  pricing_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists billing_reservations_user_status_idx on billing_reservations (user_id, status, created_at desc);

create table if not exists billing_purchase_intents (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  provider text not null,
  platform text not null check (platform in ('web', 'android', 'ios', 'voucher', 'carrier')),
  product_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  credits_subunits bigint not null check (credits_subunits > 0),
  status text not null check (status in ('created', 'pending', 'verified', 'credited', 'failed', 'cancelled', 'refunded', 'disputed')),
  provider_transaction_id text,
  idempotency_key text not null unique,
  checkout_url text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credited_at timestamptz
);
create unique index if not exists billing_purchase_provider_txn_unique on billing_purchase_intents (provider, provider_transaction_id) where provider_transaction_id is not null;
create index if not exists billing_purchase_user_created_idx on billing_purchase_intents (user_id, created_at desc);

-- Current cross-platform subscription/feature access. Provider callbacks must be verified
-- before an entitlement row is made active; this table does not itself enable premium.
create table if not exists billing_entitlements (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  entitlement_key text not null,
  provider text not null,
  platform text not null check (platform in ('web', 'android', 'ios', 'manual', 'partner')),
  product_id text not null,
  original_transaction_id text not null,
  latest_transaction_id text,
  status text not null check (status in ('pending', 'active', 'grace_period', 'cancelled', 'expired', 'revoked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  auto_renew boolean,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, original_transaction_id)
);
create index if not exists billing_entitlements_user_key_status_idx on billing_entitlements (user_id, entitlement_key, status);
create index if not exists billing_entitlements_period_end_idx on billing_entitlements (current_period_end) where status in ('active', 'grace_period');

create table if not exists billing_entitlement_events (
  id text primary key,
  provider text not null,
  provider_event_id text not null,
  entitlement_id text references billing_entitlements (id) on delete set null,
  payload_digest text not null,
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (provider, provider_event_id)
);

create table if not exists billing_webhook_events (
  id text primary key,
  provider text not null,
  provider_event_id text not null,
  purchase_intent_id text references billing_purchase_intents (id) on delete set null,
  payload_digest text not null,
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (provider, provider_event_id)
);

create table if not exists billing_usage_events (
  id text primary key,
  user_id text references billing_accounts (user_id) on delete set null,
  execution_id text,
  tool_id text not null,
  billing_key text not null,
  pricing_version text not null,
  provider text,
  estimated_cost_usd_micros bigint check (estimated_cost_usd_micros is null or estimated_cost_usd_micros >= 0),
  actual_cost_usd_micros bigint check (actual_cost_usd_micros is null or actual_cost_usd_micros >= 0),
  billed_subunits bigint not null default 0 check (billed_subunits >= 0),
  idempotency_key text not null unique,
  status text not null check (status in ('quoted', 'succeeded', 'failed', 'refunded', 'unknown_cost')),
  usage jsonb not null default '{}'::jsonb,
  usage_digest text not null,
  created_at timestamptz not null default now()
);
create index if not exists billing_usage_events_created_idx on billing_usage_events (created_at desc);
create index if not exists billing_usage_events_tool_created_idx on billing_usage_events (tool_id, created_at desc);
create index if not exists billing_usage_events_provider_created_idx on billing_usage_events (provider, created_at desc) where provider is not null;
