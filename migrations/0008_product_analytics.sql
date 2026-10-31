-- Consented, metadata-only product analytics for Web, Android and iOS.
-- No raw IP address, full user-agent, user-entered text, file data, search query,
-- prompt, URL query string, or authentication secret is stored here.

create table if not exists product_analytics_consents (
  subject_digest text primary key check (subject_digest ~ '^[a-f0-9]{64}$'),
  user_id text references "user" ("id") on delete set null,
  platform text not null check (platform in ('web', 'android', 'ios')),
  consent_status text not null check (consent_status in ('granted', 'denied')),
  policy_version text not null,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_analytics_consents_user_idx
  on product_analytics_consents (user_id, updated_at desc) where user_id is not null;

create table if not exists product_analytics_events (
  event_id text primary key check (event_id ~ '^[0-9a-fA-F-]{36}$'),
  event_name text not null check (event_name in (
    'app_opened', 'tool_viewed', 'tool_started', 'tool_completed', 'tool_failed',
    'tool_cancelled', 'tool_abandoned', 'comment_created', 'reaction_created',
    'feedback_submitted', 'update_viewed', 'offline_sync_succeeded', 'offline_sync_failed'
  )),
  platform text not null check (platform in ('web', 'android', 'ios')),
  tool_id text,
  user_id text references "user" ("id") on delete set null,
  anonymous_subject_digest text not null check (anonymous_subject_digest ~ '^[a-f0-9]{64}$'),
  session_digest text not null check (session_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  device_class text not null default 'unknown' check (device_class in ('phone', 'tablet', 'desktop', 'unknown')),
  os_family text not null default 'unknown' check (os_family in ('android', 'ios', 'windows', 'macos', 'linux', 'other', 'unknown')),
  browser_family text not null default 'unknown' check (browser_family in ('chrome', 'edge', 'firefox', 'safari', 'opera', 'other', 'unknown')),
  app_version text,
  network_type text not null default 'unknown' check (network_type in ('wifi', 'cellular', 'ethernet', 'unknown')),
  network_effective_type text not null default 'unknown' check (network_effective_type in ('slow-2g', '2g', '3g', '4g', 'unknown')),
  is_offline boolean not null default false,
  referrer_source text not null default 'unknown' check (referrer_source in ('direct', 'google', 'bing', 'duckduckgo', 'yahoo', 'brave', 'internal', 'referral', 'unknown')),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  outcome text not null default 'unknown' check (outcome in ('success', 'failure', 'cancelled', 'abandoned', 'unknown')),
  error_code text,
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object')
);
create index if not exists product_analytics_events_received_idx
  on product_analytics_events (received_at desc);
create index if not exists product_analytics_events_tool_received_idx
  on product_analytics_events (tool_id, received_at desc) where tool_id is not null;
create index if not exists product_analytics_events_platform_received_idx
  on product_analytics_events (platform, received_at desc);
create index if not exists product_analytics_events_subject_received_idx
  on product_analytics_events (anonymous_subject_digest, received_at desc);
create index if not exists product_analytics_events_outcome_received_idx
  on product_analytics_events (outcome, received_at desc);

-- Fixed-window request throttling uses a keyed pseudonymous subject digest,
-- never an IP address. Rows older than one day are removed by the retention job.
create table if not exists product_analytics_rate_limits (
  subject_digest text not null check (subject_digest ~ '^[a-f0-9]{64}$'),
  window_minute bigint not null,
  request_count integer not null check (request_count between 1 and 30),
  updated_at timestamptz not null default now(),
  primary key (subject_digest, window_minute)
);

comment on table product_analytics_events is
  'Opt-in, metadata-only usage events. Raw user content, files, IP addresses and search query strings are prohibited.';
comment on table product_analytics_consents is
  'Per-installation pseudonymous product analytics consent and policy version.';
