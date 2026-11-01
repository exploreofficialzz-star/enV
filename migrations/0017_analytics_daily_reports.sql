-- Persist a human-readable, privacy-safe daily analytics digest.
-- The report contains aggregates only; no account, installation, session, or event IDs.
create table if not exists public.product_analytics_daily_reports (
  report_day date primary key,
  schema_version text not null check (schema_version = 'env.analytics.daily-report.v1'),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object'),
  generated_at timestamptz not null default now()
);
create index if not exists product_analytics_daily_reports_generated_idx
  on public.product_analytics_daily_reports(generated_at desc);
alter table public.product_analytics_daily_reports enable row level security;
comment on table public.product_analytics_daily_reports is
  'Private retained daily product-health digests. Aggregate-only, with no account, device, installation, or session identifiers.';
