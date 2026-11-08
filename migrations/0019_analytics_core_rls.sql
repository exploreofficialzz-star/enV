-- Isolated RLS migration for User Behavior analytics.
-- Product Feedback has separate migrations and is intentionally not part of this file.
-- The server uses the private PostgreSQL connection; no anon/authenticated policies are created.
ALTER TABLE public.product_analytics_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_analytics_rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.product_analytics_consents IS
  'Server-only consent records for opt-in product analytics. Direct public Data API access is blocked by RLS.';
COMMENT ON TABLE public.product_analytics_events IS
  'Server-only metadata-only product analytics events. Direct public Data API access is blocked by RLS.';
COMMENT ON TABLE public.product_analytics_rate_limits IS
  'Server-only analytics throttling metadata. Direct public Data API access is blocked by RLS.';
