-- Native wallet pairing is scoped to offline-wallet APIs only. The bearer credential is
-- opaque, short-lived relative to account sessions, stored only as a SHA-256 digest, and
-- bound to one platform-specific P-256 device key. These tables do not enable production billing.

create table if not exists billing_offline_pairing_codes (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  code_digest text not null unique check (code_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists billing_offline_pairing_codes_user_active_idx
  on billing_offline_pairing_codes (user_id, platform, expires_at) where consumed_at is null;

create table if not exists billing_offline_native_sessions (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  device_key_digest text not null check (device_key_digest ~ '^[a-f0-9]{64}$'),
  token_digest text not null unique check (token_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists billing_offline_native_sessions_user_active_idx
  on billing_offline_native_sessions (user_id, platform, expires_at) where revoked_at is null;
create index if not exists billing_offline_native_sessions_device_idx
  on billing_offline_native_sessions (device_key_digest, user_id) where revoked_at is null;
