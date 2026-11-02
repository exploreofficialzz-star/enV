-- Music Analyzer result library. The original audio is never stored in PostgreSQL.
-- Persist only validated metadata, analysis runs, time-series features, events and annotation history.
-- Every owner-scoped child references (user_id, id) so the schema itself resists cross-tenant links.

create table if not exists music_tracks (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  source_sha256 text,
  source_sha256_verified boolean not null default false,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  mime_type text,
  duration_seconds double precision check (duration_seconds is null or (duration_seconds > 0 and duration_seconds < 'Infinity'::double precision)),
  sample_rate_hz integer check (sample_rate_hz is null or sample_rate_hz between 1000 and 768000),
  channels integer check (channels is null or channels between 1 and 64),
  source_metadata jsonb not null default '{}'::jsonb,
  normalized_metadata jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  rights_status text not null default 'unknown' check (rights_status in ('unknown','user_owned','permission_granted','licensed','public_domain','restricted','not_applicable')),
  retention_policy text not null default 'analysis_only' check (retention_policy in ('analysis_only','retain_metadata','retain_until_deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint music_tracks_hash_format check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  unique (user_id, id)
);

create index if not exists music_tracks_owner_created_idx on music_tracks (user_id, created_at desc, id);
create index if not exists music_tracks_owner_hash_idx on music_tracks (user_id, source_sha256) where source_sha256 is not null;
create index if not exists music_tracks_owner_name_idx on music_tracks (user_id, lower(file_name));
create index if not exists music_tracks_owner_search_idx on music_tracks using gin (to_tsvector('simple', search_text));

create table if not exists music_analysis_runs (
  id text primary key,
  user_id text not null,
  track_id text not null,
  idempotency_key text not null,
  run_number integer not null check (run_number > 0),
  analysis_schema_version text not null,
  dataset_schema_version text not null,
  engine_version text not null,
  processing_route text not null check (processing_route in ('web_local','android_native','ios_native','backend_dsp','imported_result')),
  status text not null check (status in ('completed','failed','cancelled','imported')),
  source_sha256 text,
  analysis_summary jsonb not null,
  dataset_summary jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  result_checksum text not null,
  started_at timestamptz,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (user_id, track_id) references music_tracks (user_id, id) on delete cascade,
  unique (user_id, id),
  unique (user_id, idempotency_key),
  unique (user_id, track_id, run_number),
  constraint music_analysis_runs_hash_format check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists music_analysis_runs_owner_created_idx on music_analysis_runs (user_id, created_at desc, id);
create index if not exists music_analysis_runs_track_history_idx on music_analysis_runs (user_id, track_id, run_number desc);

create table if not exists music_feature_frames (
  user_id text not null,
  analysis_run_id text not null,
  frame_index integer not null check (frame_index >= 0),
  start_seconds double precision not null check (start_seconds >= 0 and start_seconds < 'Infinity'::double precision),
  end_seconds double precision not null check (end_seconds > start_seconds and end_seconds < 'Infinity'::double precision),
  start_sample_frame bigint check (start_sample_frame is null or start_sample_frame >= 0),
  end_sample_frame bigint check (end_sample_frame is null or end_sample_frame >= start_sample_frame),
  features jsonb not null,
  primary key (analysis_run_id, frame_index),
  foreign key (user_id, analysis_run_id) references music_analysis_runs (user_id, id) on delete cascade
);

create index if not exists music_feature_frames_timeline_idx on music_feature_frames (analysis_run_id, start_seconds);

create table if not exists music_analysis_events (
  user_id text not null,
  analysis_run_id text not null,
  event_type text not null check (event_type in ('pitch_point','chord_candidate','change_point','section_candidate','repetition_candidate')),
  event_index integer not null check (event_index >= 0),
  start_seconds double precision not null check (start_seconds >= 0 and start_seconds < 'Infinity'::double precision),
  end_seconds double precision check (end_seconds is null or (end_seconds >= start_seconds and end_seconds < 'Infinity'::double precision)),
  payload jsonb not null,
  primary key (analysis_run_id, event_type, event_index),
  foreign key (user_id, analysis_run_id) references music_analysis_runs (user_id, id) on delete cascade
);

create index if not exists music_analysis_events_timeline_idx on music_analysis_events (analysis_run_id, event_type, start_seconds);

-- Append-only annotation revisions: corrections never silently erase prior label provenance.
create table if not exists music_annotations (
  id text primary key,
  user_id text not null,
  track_id text not null,
  analysis_run_id text,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  field_value jsonb not null,
  source text not null check (source in ('human_review','user_provided','embedded_metadata','external_catalogue','signal_estimate','rule_derived','unknown')),
  review_state text not null check (review_state in ('unreviewed','suggested','confirmed','rejected','unknown')),
  reviewer_id text,
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  start_seconds double precision check (start_seconds is null or (start_seconds >= 0 and start_seconds < 'Infinity'::double precision)),
  end_seconds double precision check (end_seconds is null or (end_seconds >= 0 and end_seconds < 'Infinity'::double precision)),
  created_at timestamptz not null default now(),
  foreign key (user_id, track_id) references music_tracks (user_id, id) on delete cascade,
  foreign key (user_id, analysis_run_id) references music_analysis_runs (user_id, id) on delete cascade,
  check (end_seconds is null or start_seconds is null or end_seconds >= start_seconds)
);

create index if not exists music_annotations_track_history_idx on music_annotations (user_id, track_id, field_key, created_at desc);
create index if not exists music_annotations_review_queue_idx on music_annotations (user_id, review_state, created_at desc);

create table if not exists music_collections (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name)
);

create table if not exists music_collection_tracks (
  user_id text not null,
  collection_id text not null,
  track_id text not null,
  added_at timestamptz not null default now(),
  primary key (collection_id, track_id),
  foreign key (user_id, collection_id) references music_collections (user_id, id) on delete cascade,
  foreign key (user_id, track_id) references music_tracks (user_id, id) on delete cascade
);

create index if not exists music_collection_tracks_track_idx on music_collection_tracks (user_id, track_id);

-- Database-backed rate windows survive serverless cold starts and are shared by app instances.
create table if not exists music_dataset_api_limits (
  user_id text not null references "user" ("id") on delete cascade,
  operation text not null check (operation in ('read','write','delete')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, operation)
);
