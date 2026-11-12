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

The single global enV token reference price is 100 tokens = USD $1.00 (USD $0.01 per token). Paystack and Flutterwave pack amounts are converted server-side into the detected merchant settlement currency using a dated USD FX snapshot; there are no per-currency price variables. The snapshot's FX rate, source, upstream update time, fetch time and quote time are stored in purchase-intent metadata. ExchangeRate-API Open Access updates once per day, is rate-limited and requires visible linked attribution; it is a daily reference rate, not a live tick feed. The wallet pack cards show the USD reference value, while actual local charge amounts and raw FX data remain server-side and are not returned from the public funding-options endpoint.

Flutterwave checkout is configured with a country-specific currency and allowlisted `payment_options`. Flutterwave ignores the per-payment allowlist while **Enable Dashboard Payment Options** remains enabled in account settings. Turn that dashboard option off, verify it in the merchant account, then set `FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED=true`; the application fails closed while this acknowledgement is false. Set `FLUTTERWAVE_ENABLED_CURRENCIES` only to currencies enabled on the actual merchant account. Configure `FLW_SECRET_KEY` and the exact dashboard webhook `FLW_SECRET_HASH`. Flutterwave Standard documents an int32 major-unit amount, so the enV adapter enables only packs that convert to an exact whole major unit; it disables fractional results instead of rounding them. The Flutterwave adapter also requires `FLUTTERWAVE_REFUND_DISPUTE_HANDLING_APPROVED=true`; keep it false until refund/chargeback events, wallet reversals, webhook retries, already-spent credits and recovery have been implemented and tested.

The user-country signal is for checkout routing only. It is not residency verification, KYC, tax determination or a guarantee that a provider supports the visitor's bank. Provider account configuration, settlement eligibility and channel activation remain authoritative.

## Payment release blockers — keep checkout disabled

The server-side Paystack, Flutterwave and Cryptomus web checkout adapters are present, but that is not sufficient for real-money launch. The current release does not yet implement complete refund/dispute reconciliation or a tested wallet-credit reversal policy. Paystack's webhook handler currently processes successful charges; Cryptomus refund-state callbacks are not fully reconciled into wallet reversals. A refunded or disputed charge must never be allowed to leave spendable credits without an explicit, audited decision.

Until that work is complete, signed Paystack refund/dispute events and Cryptomus `refund_process`, `refund_fail` and `refund_paid` callbacks deliberately return HTTP 503 with `REFUND_DISPUTE_RECONCILIATION_REQUIRED` or `CRYPTOMUS_REFUND_RECONCILIATION_REQUIRED`. They are not acknowledged as successfully handled or silently ignored. This is a delivery/reconciliation guard, **not** refund processing: no wallet balance is reversed by these callbacks, and operators must use provider delivery history plus the purchase ledger for manual investigation. Keep new checkout disabled.

Keep all of these gates false until the corresponding tests and operator procedures are signed off:

- `BILLING_LAUNCH_ENABLED=false`
- `BILLING_ENFORCEMENT_ENABLED=false`
- `BILLING_REFUND_DISPUTE_HANDLING_APPROVED=false`
- `PAYSTACK_PROVIDER_APPROVED=false`, `FLUTTERWAVE_PROVIDER_APPROVED=false`, and `CRYPTOMUS_PROVIDER_APPROVED=false` until each provider approves the exact business model, channels and markets.

The additional refund/dispute gate specifically prevents new checkout from opening while refund events, partial refunds, chargebacks, provider retries and customer wallet recovery are not fully reconciled. It does not block verification of an already-created Paystack transaction: settlement must keep working if new checkout is paused, so customers who have already paid are not stranded by a kill switch.

Before enabling real money, add automated tests for: duplicate and out-of-order webhooks; success callbacks arriving before the checkout-init request is finalized; failed/pending/partial/full refunds; dispute create/remind/resolve events; Cryptomus `refund_process`, `refund_fail` and `refund_paid` states; webhook retries after partial processing; and recovery when refunded tokens have already been spent. Decide whether reversals debit unused wallet value, create a recoverable balance obligation, or require manual review—never silently credit or remove tokens based only on a browser redirect.

Native Android/iOS digital token purchases are separately unavailable until Google Play Billing and Apple StoreKit purchase/restore/refund verification and product mapping are implemented. Do not use the web checkout as a native-app billing bypass.

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
