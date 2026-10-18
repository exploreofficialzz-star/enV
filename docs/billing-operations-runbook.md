# enV billing operations runbook (shadow-metering phase)

## Current status

- Real-money checkout: disabled.
- Automatic token deduction: disabled.
- Usage capture: best-effort, content-free, server-side.
- AI costs from the model registry: estimates only, not provider invoices.
- Proxy/self-hosted compute costs: unknown until a cost-allocation or invoice integration exists.
- Purchased-token and promotional-token distinction: should remain explicit when promotions are introduced.

## Required deployment setup

1. Configure `DATABASE_URL` for the production PostgreSQL/Neon database.
2. Run `npm run db:migrate` as a release/deployment step before expecting usage events to persist. Production Neon does not apply SQL migrations automatically on first request. The local PGLite fallback applies them at startup.
3. Set a long random server-only `BILLING_ADMIN_TOKEN`. Do not prefix it with `VITE_`, place it in a client bundle, or commit the secret. If the token is unset, the usage-report route returns `404`.
4. Ensure production authentication settings and trusted auth origin are explicitly configured before wallet/purchase endpoints are used. Wallet access is intentionally unavailable when billing authentication is not configured.

## Read the usage report

Request `GET /api/billing/admin/usage` with:

```http
Authorization: Bearer <BILLING_ADMIN_TOKEN>
```

The response summarizes the last 30 days and groups events by billing key/provider. It omits user IDs, request bodies, prompts, model outputs, OCR text, file names and generated files. `actualProviderCostUsd: null` means no provider/infrastructure invoice cost is connected; it does **not** mean the work cost nothing.

## How to interpret the measures

- `estimatedProviderCostUsd` for AI comes from the configured model-price registry and can be wrong if provider prices change, the request used retries/fallbacks, or upstream usage was not fully returned.
- Proxy `inputBytes`, streamed `outputBytes`, status and `elapsedMs` measure gateway request/transfer behavior, not a dollar amount or pure compute time.
- Local server operation measurements similarly record route class, declared input length, streamed output size, status and elapsed time. They do not store user inputs or content.
- Rows with `status = unknown_cost` and `usage.executionStatus = succeeded` indicate successful work whose true monetary cost is still unknown. Unknown-cost failures must remain visible because failed calls can still have incurred upstream spend.
- `billedSubunits` is zero for this phase. Any report showing a nonzero amount requires investigation before the system is changed to charge users.

## Safe next steps before live billing

- Import provider invoices/usage and reconcile them with AI request IDs, retry/fallback attempts and tool execution records.
- Add hosting/processor infrastructure cost allocation and benchmark representative light/normal/heavy jobs.
- Audit tool profiles individually and approve margins, rounding, refunds and failure/cancellation treatment.
- Connect reservation, approval and settlement to a real AI-agent tool dispatcher. The current project does not yet expose a complete autonomous multi-tool agent lifecycle for safe integration.
- Implement Web provider webhooks, StoreKit/App Store Server verification, Google Play purchase verification, restore/refund/dispute handling and product ID mapping.
- Run clean-install typecheck/build/tests and native Android/iOS builds before activating checkout.
