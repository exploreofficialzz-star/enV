# enV billing operations runbook (shadow-metering phase)

## Current status

- Real-money checkout: disabled.
- Automatic token deduction: disabled.
- Usage capture: best-effort, content-free, server-side.
- AI costs from the model registry: estimates only, not provider invoices.
- Proxy/self-hosted compute costs: unknown until a cost-allocation or invoice integration exists.
- Purchased-token and promotional-token distinction: should remain explicit when promotions are introduced.

## Country-aware provider routing

The Web funding-options and purchase routes use Vercel's `x-vercel-ip-country` edge header. Cloudflare's `cf-ipcountry` is ignored unless `COUNTRY_GEO_PROVIDER=cloudflare` and `CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED=true`; direct access to the Vercel origin must be blocked before enabling that fallback. The API does not accept a browser-provided country or currency and never defaults an unknown visitor to Nigeria. Review `docs/payment-provider-routing.md` before changing country, currency or provider settings.

Set `PAYSTACK_MERCHANT_COUNTRY` to the actual registration country of the configured merchant account. Paystack local checkout is offered only to customers detected in that country. Customers elsewhere can use Paystack only with `PAYSTACK_INTERNATIONAL_ENABLED=true`, the merchant's dashboard approval and a receiving currency allowed for that merchant country. International checkout is card-only; it does not give a foreign customer the merchant's local USSD, bank-transfer or mobile-money methods.

The single global enV token reference price is 100 tokens = USD $1.00 (USD $0.01 per token). Paystack and Flutterwave amounts are converted server-side into the country-specific settlement currency using a dated USD FX snapshot; there are no per-currency price variables. The snapshot's rate, source, upstream update time, fetch time and quote time are stored in purchase-intent metadata. ExchangeRate-API Open Access updates once per day and is a reference rate, not a live tick feed. The wallet now presents one amount selector, the actual quoted local-currency charge and the USD reference value for the selected enV balance. The public funding-options endpoint exposes only server-calculated amounts and ISO currencies; raw FX rates remain server-side. Checkout independently re-quotes before initializing the provider.

Flutterwave checkout uses a country-specific ISO currency and the corresponding documented `payment_options`. Flutterwave ignores per-payment options while **Enable Dashboard Payment Options** remains enabled. Turn that dashboard option off, verify it in the merchant account, then set `FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED=true`; the app fails closed while that acknowledgement is false. Set `FLUTTERWAVE_ENABLED_CURRENCIES` only to currencies actually enabled on the merchant account. The server reads `FLW_SECRET_KEY` and verifies the webhook using the dashboard `FLW_SECRET_HASH` (both the v3 `verif-hash` form and the current HMAC signature form are supported). The Standard v3 adapter uses integer major-unit amounts and rejects fractional major-unit results rather than rounding. The Flutterwave checkout gate also requires provider, currency, dashboard-option, launch and refund/dispute approvals.

The user-country signal is for checkout routing only. It is not residency verification, KYC, tax determination or a guarantee that a provider supports the visitor's bank. Provider account configuration, settlement eligibility and channel activation remain authoritative.

## Payment release blockers — keep checkout disabled

The Paystack and Flutterwave refund/dispute reconciliation paths are now implemented in the server code. They verify provider-issued refund or dispute records against the original enV purchase intent, transaction reference, amount and currency before changing the wallet. Webhook retries are idempotent. Partial and full refunds reverse the corresponding proportion of purchased token subunits. Available tokens are removed immediately; if some refunded value has already been spent, the remainder becomes a recovery debt on the account. New token usage is paused while that debt remains or while a dispute is unresolved. Future verified purchase credits first pay down recovery debt before becoming spendable.

Paystack refund callbacks are verified against the provider refund list for the original transaction, and dispute callbacks are re-fetched from the Disputes API. Flutterwave refund callbacks are checked against the v3 refund records for the original transaction; chargebacks are matched using the stored `flw_ref` and provider status. A webhook notification alone never changes the wallet. The initial Paystack `refund.pending` notification can have a null `refund_reference`; it is acknowledged without a reversal until Paystack supplies a stable refund ID.

Cryptomus refund callbacks remain deliberately fail-closed with `CRYPTOMUS_REFUND_RECONCILIATION_REQUIRED`. Cryptomus checkout must stay disabled until its own provider-specific refund status lookup and recovery path are implemented and verified. Do not treat the shared wallet ledger as proof that every payment provider is ready.

Keep all of these gates false until the corresponding tests and operator procedures are signed off:

- `BILLING_LAUNCH_ENABLED=false`
- `BILLING_ENFORCEMENT_ENABLED=false`
- `BILLING_REFUND_DISPUTE_HANDLING_APPROVED=false`
- `PAYSTACK_PROVIDER_APPROVED=false`, `FLUTTERWAVE_PROVIDER_APPROVED=false`, and `CRYPTOMUS_PROVIDER_APPROVED=false` until each provider approves the exact business model, channels and markets.

The additional refund/dispute gate specifically prevents new checkout from opening while refund events, partial refunds, chargebacks, provider retries and customer wallet recovery are not fully reconciled. It does not block verification of an already-created Paystack transaction: settlement must keep working if new checkout is paused, so customers who have already paid are not stranded by a kill switch.

Before enabling real money, automated tests and provider sandbox/live-verification procedures must cover duplicate and out-of-order charge/refund/dispute notifications; success callbacks arriving before checkout-init finalization; failed, pending, partial and full refunds; dispute initiated/accepted/declined/won/lost transitions; webhook retries; concurrent reversals; restored disputes; and accounts that have already spent refunded credits. Confirm that the ledger and wallet balances remain consistent after every retry. Cryptomus refund cases remain on the blocked list until that provider-specific integration is implemented.

Native Android/iOS digital token purchases are separately unavailable until Google Play Billing and Apple StoreKit purchase/restore/refund verification and product mapping are implemented. Do not use the web checkout as a native-app billing bypass.

## Required deployment setup

1. Configure `DATABASE_URL` for the enV production Supabase PostgreSQL session pooler.
2. Run `npm run db:migrate` as a release/deployment step before expecting billing or usage records to persist. Supabase does not apply repository SQL migrations automatically on first request. The local PGLite fallback applies them at startup.
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
