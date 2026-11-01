-- Public tool-page community features. These are separate from private feedback tickets
-- and from optional product analytics. Pseudonymous actor digests are used for controls.

create table if not exists tool_community_comments (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-fA-F-]{36}$'),
  tool_id text not null,
  parent_id text references tool_community_comments(id) on delete cascade,
  author_digest text not null check (author_digest ~ '^[a-f0-9]{64}$'),
  author_user_id text references "user" ("id") on delete set null,
  identity_mode text not null check (identity_mode in ('public', 'anonymous')),
  display_name varchar(32),
  body varchar(2000) not null check (char_length(body) between 1 and 2000),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_digest, idempotency_key),
  check ((identity_mode = 'anonymous' and display_name is null) or (identity_mode = 'public' and display_name is not null))
);
create index if not exists tool_community_comments_tool_created_idx
  on tool_community_comments (tool_id, created_at desc) where moderation_status = 'visible';
create index if not exists tool_community_comments_parent_idx
  on tool_community_comments (parent_id, created_at) where parent_id is not null;

create table if not exists tool_community_reactions (
  tool_id text not null,
  actor_digest text not null check (actor_digest ~ '^[a-f0-9]{64}$'),
  actor_user_id text references "user" ("id") on delete set null,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tool_id, actor_digest)
);
create index if not exists tool_community_reactions_tool_type_idx
  on tool_community_reactions (tool_id, reaction_type);

-- A view is counted once per pseudonymous actor per tool per calendar day.
create table if not exists tool_community_views (
  tool_id text not null,
  viewer_digest text not null check (viewer_digest ~ '^[a-f0-9]{64}$'),
  view_date date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (tool_id, viewer_digest, view_date)
);
create index if not exists tool_community_views_tool_date_idx
  on tool_community_views (tool_id, view_date desc);

create table if not exists tool_community_reports (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  comment_id text not null references tool_community_comments(id) on delete cascade,
  reporter_digest text not null check (reporter_digest ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('spam', 'harassment', 'misinformation', 'inappropriate', 'other')),
  details varchar(500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, reporter_digest)
);
create index if not exists tool_community_reports_inbox_idx
  on tool_community_reports (status, created_at desc);

create table if not exists tool_community_blocks (
  blocker_digest text not null check (blocker_digest ~ '^[a-f0-9]{64}$'),
  blocked_author_digest text not null check (blocked_author_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (blocker_digest, blocked_author_digest),
  check (blocker_digest <> blocked_author_digest)
);

create table if not exists tool_community_rate_limits (
  subject_digest text not null check (subject_digest ~ '^[a-f0-9]{64}$'),
  window_minute bigint not null,
  request_count integer not null check (request_count between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (subject_digest, window_minute)
);

create table if not exists tool_community_moderation_events (
  id text primary key check (id ~ '^[0-9a-fA-F-]{36}$'),
  report_id text not null references tool_community_reports(id) on delete cascade,
  comment_id text not null references tool_community_comments(id) on delete cascade,
  actor text not null check (actor = 'developer_admin'),
  report_status text not null check (report_status in ('open', 'reviewed', 'dismissed', 'actioned')),
  comment_status text not null check (comment_status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists tool_community_moderation_ticket_idx
  on tool_community_moderation_events (report_id, created_at desc);

-- All access is through the trusted enV server. Never grant direct public table access.
alter table public.tool_community_comments enable row level security;
alter table public.tool_community_reactions enable row level security;
alter table public.tool_community_views enable row level security;
alter table public.tool_community_reports enable row level security;
alter table public.tool_community_blocks enable row level security;
alter table public.tool_community_rate_limits enable row level security;
alter table public.tool_community_moderation_events enable row level security;

comment on table tool_community_comments is
  'Public comments/replies. Anonymous display hides author identity; author digest remains private for safety and moderation.';
comment on table tool_community_views is
  'Aggregate page views, deduplicated by pseudonymous actor and calendar day. No raw IP or URL is stored.';
