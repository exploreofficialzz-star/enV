-- Long-lived aggregate analytics; keeps no subject, session, or raw event identifiers.
create table if not exists product_analytics_daily_snapshots (
  snapshot_day date not null,
  platform text not null check (platform in ('web','android','ios')),
  tool_id text not null default '',
  event_name text not null check (event_name in (
    'app_opened','tool_viewed','tool_started','tool_completed','tool_failed',
    'tool_cancelled','tool_abandoned','comment_created','reaction_created',
    'feedback_submitted','update_viewed','offline_sync_succeeded','offline_sync_failed'
  )),
  event_count bigint not null default 0 check (event_count >= 0),
  failure_count bigint not null default 0 check (failure_count >= 0),
  unique_installations bigint not null default 0 check (unique_installations >= 0),
  sessions bigint not null default 0 check (sessions >= 0),
  duration_total_ms bigint not null default 0 check (duration_total_ms >= 0),
  duration_sample_count bigint not null default 0 check (duration_sample_count >= 0),
  captured_at timestamptz not null default now(),
  primary key (snapshot_day,platform,tool_id,event_name)
);
create index if not exists product_analytics_daily_snapshots_day_idx
  on product_analytics_daily_snapshots(snapshot_day desc);
create index if not exists product_analytics_daily_snapshots_tool_idx
  on product_analytics_daily_snapshots(tool_id,snapshot_day desc) where tool_id <> '';
alter table public.product_analytics_daily_snapshots enable row level security;
comment on table product_analytics_daily_snapshots is
  'Long-lived daily aggregate product usage. Contains no installation, account or session identifiers and no raw event content.';
