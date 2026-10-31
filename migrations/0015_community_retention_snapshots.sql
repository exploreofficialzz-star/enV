-- Preserve aggregate tool views while pruning pseudonymous viewer digests.
create table if not exists tool_community_daily_view_snapshots (
  snapshot_day date not null,
  tool_id text not null,
  view_count bigint not null default 0 check (view_count >= 0),
  captured_at timestamptz not null default now(),
  primary key(snapshot_day,tool_id)
);
create index if not exists tool_community_daily_view_snapshots_tool_day_idx
  on tool_community_daily_view_snapshots(tool_id,snapshot_day desc);
alter table public.tool_community_daily_view_snapshots enable row level security;
comment on table tool_community_daily_view_snapshots is
  'Daily unique tool view counts without visitor or account identifiers.';
