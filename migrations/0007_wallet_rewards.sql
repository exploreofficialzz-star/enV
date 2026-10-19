-- Wallet rewards and referral attribution. No rewards are granted for clicks or self-reported views.
-- A referral only qualifies after a verified, server-credited purchase.
create table if not exists billing_referral_profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now(),
  check (referral_code ~ '^[A-Z0-9]{8,24}$')
);

create table if not exists billing_referrals (
  id text primary key,
  referrer_user_id text not null references "user" ("id") on delete cascade,
  referred_user_id text not null unique references "user" ("id") on delete cascade,
  referral_code text not null references billing_referral_profiles (referral_code) on delete restrict,
  source text not null default 'referral' check (source in ('referral', 'video')),
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'rejected')),
  qualified_purchase_intent_id text references billing_purchase_intents (id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referrer_user_id <> referred_user_id)
);
create index if not exists billing_referrals_referrer_created_idx
  on billing_referrals (referrer_user_id, created_at desc);
create index if not exists billing_referrals_video_status_idx
  on billing_referrals (referrer_user_id, status) where source = 'video';

create table if not exists billing_reward_events (
  id text primary key,
  user_id text not null references billing_accounts (user_id) on delete cascade,
  source_user_id text references "user" ("id") on delete set null,
  referral_id text references billing_referrals (id) on delete set null,
  reward_type text not null check (reward_type in ('referral_inviter', 'referral_invitee', 'affiliate_conversion', 'bonus')),
  amount_subunits bigint not null check (amount_subunits > 0),
  status text not null default 'credited' check (status in ('pending', 'credited', 'reversed')),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  credited_at timestamptz
);
create index if not exists billing_reward_events_user_created_idx
  on billing_reward_events (user_id, created_at desc);
create index if not exists billing_reward_events_referral_idx
  on billing_reward_events (referral_id) where referral_id is not null;

-- Look up provider references efficiently when a verified Paystack callback arrives.
create index if not exists billing_purchase_paystack_reference_idx
  on billing_purchase_intents (id) where provider = 'paystack';
