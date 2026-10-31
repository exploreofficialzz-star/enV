-- Apply the same direct-Data-API protection used by the other enV feature tables.
-- Server handlers use the private database connection; no client-side policies are intended.
alter table public.product_analytics_consents enable row level security;
alter table public.product_analytics_events enable row level security;
alter table public.product_analytics_rate_limits enable row level security;

alter table public.product_feedback enable row level security;
alter table public.product_feedback_rate_limits enable row level security;
alter table public.product_feedback_status_events enable row level security;

comment on table public.product_analytics_rate_limits is
  'Server-only throttling metadata. Direct public Data API access is blocked by RLS.';
comment on table public.product_feedback_rate_limits is
  'Server-only feedback abuse controls. Direct public Data API access is blocked by RLS.';
