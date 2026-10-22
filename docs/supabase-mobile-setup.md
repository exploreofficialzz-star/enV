# Supabase setup from a mobile device

This runbook records the SQL batches applied manually in the Supabase SQL Editor and maps them to the repository's canonical migrations. **The migration files remain the single source of truth**; avoid adding duplicate copies of the same tables as new migrations.

## Batch-to-migration map

| Batch pasted into the SQL Editor | Canonical migration file |
| --- | --- |
| Part 1 — authentication tables | [`migrations/0001_auth.sql`](../migrations/0001_auth.sql) |
| Parts 2A–2E — wallet accounts, ledger, reservations, purchase intents, entitlements, webhook events, usage events | [`migrations/0002_billing.sql`](../migrations/0002_billing.sql) |
| Parts 3A–3C — offline allowances, offline transactions, security events | [`migrations/0003_offline_wallet.sql`](../migrations/0003_offline_wallet.sql) |
| Parts 3D–3F — offline hardening columns, sync batches, rate limits, finalization proofs | [`migrations/0004_offline_wallet_hardening.sql`](../migrations/0004_offline_wallet_hardening.sql) |
| Part 3G — bind native finalization proofs to the exact batch digest | [`migrations/0005_offline_finalization_batch_binding.sql`](../migrations/0005_offline_finalization_batch_binding.sql) |
| Next native pairing batch | [`migrations/0006_offline_native_pairing.sql`](../migrations/0006_offline_native_pairing.sql) |
| Referral and wallet rewards batch | [`migrations/0007_wallet_rewards.sql`](../migrations/0007_wallet_rewards.sql) |
| RLS protection across the schema | [`migrations/0008_supabase_rls.sql`](../migrations/0008_supabase_rls.sql) |

## Important migration-tracker detail

Running SQL manually in the Supabase dashboard **does not populate** the application's `_migrations` bookkeeping table. Before calling the database setup complete, apply the repository's migration sequence using:

```sh
npm run db:migrate
```

Run it from a trusted environment with the Supabase **Session Pooler** PostgreSQL connection string set as `DATABASE_URL`. Do not paste credentials into chat or commit them. The application's Vercel Production `DATABASE_URL` should use the connection URL appropriate for the deployed runtime as shown in the Supabase dashboard. Redeploy Vercel after changing environment variables.

The migration runner is transactional per file and records each successful migration in `_migrations`. The existing Part 3G migration intentionally removes proof records that do not have a batch digest before requiring the column. During the manual setup conversation, a read-only check returned **0 existing proof rows**. If setup is resumed much later or records have since been created, re-check the table before applying that cleanup.

## RLS policy model

`0008_supabase_rls.sql` enables Row Level Security on authentication, billing, offline-wallet, pairing, and rewards tables. It intentionally creates **no direct anon/authenticated-client policies**. enV should access this data through its server-only PostgreSQL connection, and never expose the connection string or privileged Supabase credentials in browser/mobile code. Enabling RLS is not a substitute for server-side authorization: every user-owned query must still be scoped to the authenticated user.

## Release gates

Do not enable public login, token spending, or payment providers based only on successful SQL-editor execution. Verify the database connection from the deployed server, run migrations and application tests, verify server-side ownership checks and RLS behavior, and test authentication/payment callbacks in a controlled environment first. A saved Vercel environment variable is configuration, not proof that the application can connect successfully.
