-- enV Supabase/PostgreSQL security baseline.
--
-- All application reads/writes for these tables must go through enV's
-- server-only PostgreSQL connection. No anon/authenticated Data API policies
-- are created here intentionally. Do not expose the database connection string
-- or a Supabase service-role key in browser/mobile code.
--
-- This migration is idempotent and mirrors the "Run and enable RLS" selections
-- used while setting up the schema manually in the Supabase SQL Editor.

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_purchase_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_offline_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_offline_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_offline_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_security_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_offline_finalization_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_offline_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_offline_native_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reward_events ENABLE ROW LEVEL SECURITY;
