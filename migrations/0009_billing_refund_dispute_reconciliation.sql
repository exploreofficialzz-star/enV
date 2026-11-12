-- Provider refund and chargeback reconciliation.
--
-- This migration is intentionally idempotent: the production Supabase project
-- already has these columns/tables from the initial guarded rollout. Keeping
-- the SQL in the canonical application migrations makes fresh and preview
-- databases converge on the same private wallet schema.

ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS recovery_debt_subunits bigint NOT NULL DEFAULT 0;

ALTER TABLE public.billing_purchase_intents
  ADD COLUMN IF NOT EXISTS refunded_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_subunits bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.billing_accounts'::regclass
       AND conname = 'billing_accounts_recovery_debt_subunits_check'
  ) THEN
    ALTER TABLE public.billing_accounts
      ADD CONSTRAINT billing_accounts_recovery_debt_subunits_check
      CHECK (recovery_debt_subunits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.billing_purchase_intents'::regclass
       AND conname = 'billing_purchase_intents_refunded_amount_minor_check'
  ) THEN
    ALTER TABLE public.billing_purchase_intents
      ADD CONSTRAINT billing_purchase_intents_refunded_amount_minor_check
      CHECK (refunded_amount_minor >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.billing_purchase_intents'::regclass
       AND conname = 'billing_purchase_intents_refunded_subunits_check'
  ) THEN
    ALTER TABLE public.billing_purchase_intents
      ADD CONSTRAINT billing_purchase_intents_refunded_subunits_check
      CHECK (refunded_subunits >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_purchase_refunds (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_refund_id text NOT NULL,
  purchase_intent_id text NOT NULL REFERENCES public.billing_purchase_intents(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency character(3) NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'needs_attention'::text, 'failed'::text, 'completed'::text
  ])),
  payload_digest text NOT NULL,
  reversed_subunits bigint NOT NULL DEFAULT 0 CHECK (reversed_subunits >= 0),
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_refund_id)
);

CREATE INDEX IF NOT EXISTS billing_purchase_refunds_intent_idx
  ON public.billing_purchase_refunds (purchase_intent_id, status);

CREATE TABLE IF NOT EXISTS public.billing_purchase_disputes (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_dispute_id text NOT NULL,
  purchase_intent_id text NOT NULL REFERENCES public.billing_purchase_intents(id) ON DELETE CASCADE,
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency character(3),
  status text NOT NULL CHECK (status = ANY (ARRAY[
    'open'::text, 'accepted'::text, 'declined'::text, 'review_required'::text, 'won'::text, 'lost'::text
  ])),
  resolution text,
  payload_digest text NOT NULL,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (provider, provider_dispute_id)
);

CREATE INDEX IF NOT EXISTS billing_purchase_disputes_active_idx
  ON public.billing_purchase_disputes (purchase_intent_id, status);

-- Billing records are accessed only through enV's server-side Postgres
-- connection. No anon/authenticated Supabase Data API policies are added.
ALTER TABLE public.billing_purchase_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_purchase_disputes ENABLE ROW LEVEL SECURITY;
