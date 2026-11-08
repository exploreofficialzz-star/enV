-- Close inherited Data API grants on all User Behavior tables and the private app migration ledger.
-- RLS with no client policies is defense in depth; explicit grants are also revoked.
-- service_role keeps its direct server-side grants.

ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public._migrations,
  public.product_analytics_consents,
  public.product_analytics_events,
  public.product_analytics_rate_limits,
  public.product_analytics_admin_rate_limits,
  public.product_analytics_daily_snapshots,
  public.product_analytics_daily_reports,
  public.product_analytics_dashboard_sessions
FROM PUBLIC;

DO $analytics_privileges$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE
          public._migrations,
          public.product_analytics_consents,
          public.product_analytics_events,
          public.product_analytics_rate_limits,
          public.product_analytics_admin_rate_limits,
          public.product_analytics_daily_snapshots,
          public.product_analytics_daily_reports,
          public.product_analytics_dashboard_sessions
         FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$analytics_privileges$;
