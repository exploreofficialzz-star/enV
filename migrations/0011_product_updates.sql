-- Platform-targeted release notes and product announcements.
create table if not exists product_updates (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  slug varchar(100) not null unique check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  title varchar(120) not null check (char_length(title) between 5 and 120),
  summary varchar(240) not null check (char_length(summary) between 10 and 240),
  body text not null check (char_length(body) between 1 and 6000),
  update_type text not null check (update_type in ('release', 'feature', 'maintenance', 'security', 'notice')),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  platform_scope text[] not null default array['web','android','ios']::text[],
  channels text[] not null default array['stable']::text[],
  minimum_version varchar(40),
  starts_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(platform_scope) between 1 and 3),
  check (cardinality(channels) between 1 and 3),
  check (platform_scope <@ array['web','android','ios']::text[]),
  check (channels <@ array['stable','preview','beta']::text[]),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index if not exists product_updates_public_idx
  on product_updates (status, published_at desc, starts_at, expires_at);
create index if not exists product_updates_platform_idx
  on product_updates using gin (platform_scope);
create index if not exists product_updates_channels_idx
  on product_updates using gin (channels);

create table if not exists product_update_audit_events (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  update_id text not null references product_updates(id) on delete cascade,
  actor text not null check (actor = 'developer_admin'),
  action text not null check (action in ('created', 'edited', 'published', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists product_update_audit_update_idx
  on product_update_audit_events (update_id, created_at desc);

alter table public.product_updates enable row level security;
alter table public.product_update_audit_events enable row level security;

comment on table product_updates is
  'Developer-authored release notes and notices filtered by product platform, release channel, and publication window.';
