# enV monetization architecture — initiation release

**Status:** foundation implemented; live purchases and token enforcement remain disabled.  
**Pricing version:** `env-metering-preview-2026-10-18-v1`  
**Catalogue coverage:** 10,025 Web catalogue tool entries at the time of profile generation. All 7,782 Android and 7,782 iOS native-engine inventory IDs also resolve to the shared profile registry.

## Decisions locked for this release

1. No advertising in this monetization plan. The policy sets `adsEligible: false` for every catalogue profile. Tool screens remain focused; revenue comes from token usage and optional premium capability access.
2. A shared enV token wallet meters tool work and AI-agent workflows. The visible enV Token is a prepaid accounting unit, not an AI model token.
3. The proposed reference value is 1 enV Token = USD $0.01 (100 enV Tokens ≈ USD $1.00). Rates are configurable and are not a live offer.
4. The ledger stores integer milli-tokens: 1 visible token = 1,000 subunits. This permits very small usage prices without floating-point arithmetic.
5. The initial calculator hypothesis is 100 subunits per simple calculation: ten basic calculations = one token. This is illustrative and must be tested for usability before production.
6. Local operations use provisional intensity classes. Cloud, AI and agent work require defensible all-in variable-cost measurements and a configured margin before the quote can return a numeric price. The code has a provisional 60% gross-margin target as a default, not an approved business setting; provider, gateway/store, infrastructure and other variable fees must be included in the cost model before production pricing is approved.
7. Premium is an entitlement for access to frontier models and genuinely advanced workflows; it is not unlimited computation. Metered work still consumes tokens.
8. Purchased tokens are intended not to expire. Purchased and promotional tokens should be kept separately if promotions are later added. Store and jurisdictional terms apply.
9. No real payment, top-up, voucher redemption, carrier-billing charge or token deduction is activated by these changes.

## Architecture

- `src/lib/billing/catalog.ts`: central operation rules, reference-value conversions, quote logic and the public billing status.
- `scripts/generate-billing-profiles.mjs`: classifies each tool from the authoritative catalogue fields. Re-run with `npm run generate:billing-profiles` when the catalogue changes.
- `src/data/billing-profiles.json`: full generated profile and audit reason for each tool.
- `src/data/billing-profile-index.json`: compact runtime lookup by tool ID.
- `docs/billing-tool-audit-2026-10-18.md`: profile counts, assumptions and required audit steps.
- `migrations/0002_billing.sql`: wallet accounts, append-only token ledger, reservations, purchase intents, shared premium entitlement state, idempotent event records and per-operation usage events.
- `src/lib/billing/ledger.server.ts`: server-only wallet mutations with transactions, locking, idempotency and budget reservation/settlement/release primitives.
- `server/routes/api/billing/catalog.get.ts`: public policy and supported-operation preview.
- `server/routes/api/billing/quote.post.ts`: provisional operation/tool quote. Cloud and AI operations do not receive invented prices in the absence of measured cost.
- `server/routes/api/billing/wallet.get.ts`: authenticated wallet and ledger activity endpoint; requires configured account auth.
- `server/routes/api/billing/purchases.post.ts`: intentionally fails closed until a real verified provider adapter and product registry exist.
- `src/components/billing/tool-token-estimate.tsx`: Web tool-detail estimate, explicitly marked provisional and non-billable in this release.
- Android/iOS/Web pricing and legal copy: aligned on token reference value, no disruptive ads, premium-vs-usage distinction and inactive purchases.

## Per-tool profile rules

The generator uses catalogue execution metadata, category, engine type and descriptive signals to assign a draft billing key, and it fails if any native Android/iOS tool ID is missing from the shared registry. It creates a profile for every catalogue tool and marks every row `manualAuditRequired: true`. This is a classification and pricing hypothesis, **not a measurement of each tool's real compute cost**.

Current generated distribution:

| Draft billing class | Tools |
|---|---:|
| Local calculator | 6,546 |
| Local general utility | 2,603 |
| Local audio processing | 106 |
| Local basic image | 235 |
| Local intensive image | 148 |
| Local converter | 145 |
| Local text | 38 |
| Local video | 3 |
| Cloud audio | 7 |
| Cloud documents | 82 |
| Cloud generic | 3 |
| Cloud transcription | 3 |
| Cloud video | 106 |
| **Total** | **10,025** |

Use these groupings to prioritize the audit. Do not treat them as final prices, verified runtime classifications, or proof that the work runs on a particular device or server. Verify actual execution paths and instrument dimensions at the handler that does the work.

## Quote and charge contract

Before live billing is enabled, each chargeable handler must:

1. Resolve an authoritative server-side tool profile and pricing version; ignore any client-supplied cost, price, premium flag or token balance.
2. Gather actual usage dimensions and a provider/infrastructure estimate before execution when a reliable estimate is possible.
3. Explain the estimate in user-facing tokens and reference value before expensive work begins.
4. Reserve tokens using a server-generated idempotency key and enforce a user-approved maximum budget for any agent workflow.
5. Meter every underlying AI call, tool invocation, retry and processor operation; never let the agent bypass the same ledger.
6. Settle using recorded actual cost and the published margin rule, releasing unused reservation. Pause for explicit approval if work would exceed the authorized reservation.
7. Refund or release tokens under explicit failed-job and cancellation rules; reconcile ledger totals against provider and store reports.

The quote endpoint deliberately accepts `toolId` or `operationId` and not a client-provided provider cost. Premium access is derived from server-side entitlement state when auth is configured; a client-supplied premium flag is never trusted. The current response always marks `billingActive: false`.

## Security and accounting requirements

- Do not add tokens to a wallet from a browser success redirect or client receipt claim. Verify provider signatures/transactions and validate provider, product, amount, currency, transaction ID, user ownership and event replay on the server.
- Keep purchase credentials server-side; never put provider secrets in client-prefixed environment variables or native app binaries.
- Use idempotency keys, unique provider event IDs, database transactions, row locking and provider/store reconciliation to prevent duplicate token grants.
- Keep a ledger history; do not silently overwrite balances. Maintain separate purchased, promotional, reserved and consumed accounting as the economy matures.
- Handle chargebacks, refunds, duplicate webhooks, payment pending states, failed jobs and account deletion with documented rules.
- Add rate limits and abuse monitoring for quotes, login, redemption, top-ups, agent retries and spending-limit changes.
- Treat the token's USD value as a non-cash reference. Tokens must not be advertised as withdrawable or transferable unless the legal/financial model has explicitly been approved.

## Global payment approach

Use a shared backend wallet and platform-specific purchase adapters:

- Web: a suitable merchant checkout provider with signed webhooks and refunds.
- Android: Google Play Billing for digital goods/virtual currency when required by the applicable Play policy.
- iOS: StoreKit / Apple In-App Purchase for digital goods/virtual currency when required by the applicable App Store policy.
- Later-market expansion: direct carrier billing, country-specific payment methods, cash vouchers and official enV gift cards only after merchant/processor approval, country coverage, refunds and fraud controls are confirmed.

Do not accept arbitrary Apple/Google/Amazon/Steam gift-card codes as enV wallet funding, and do not treat a third-party airtime-top-up API as a gateway for converting existing mobile airtime to cash. Carrier billing is a separate operator-authorized payment rail. A universal one-cent transaction is not practical across all gateways; users should make fewer supported top-ups and then consume fractional tokens internally.

## Launch gating checklist

Do not switch `BILLING_LAUNCH_ENABLED` or `BILLING_ENFORCEMENT_ENABLED` to `true` merely as a configuration change. First:

- Enable and harden authenticated accounts in the deployment and apply database migrations deliberately.
- Finish handler-by-handler cost and execution audit, benchmark small/normal/heavy input sizes, collect current provider rates, and approve margin/rounding rules.
- Implement and independently test each web/native purchase adapter, signature/store-receipt verification, webhook replay protection, refund processing, restore purchases, product ID mapping and settlement reconciliation.
- Implement premium entitlement verification and connect server-side token reservations/settlement to every billable tool and AI-agent invocation.
- Add operational limits, monitoring, financial dashboards, support processes and legal disclosures for supported jurisdictions.
- Run production-like tests for double-taps, duplicate webhooks, failed or partial jobs, timeout/retry behavior, refund/chargeback, currency rounding, exhausted budgets, concurrent tasks and account deletion.
- Confirm store review and regional alternative-billing requirements before each release.

## Verification

Run:

```bash
npm run generate:billing-profiles
npm run check:billing
npm run typecheck
npm run build
```

The profile audit should be regenerated and reviewed whenever catalogue IDs, categories, engine types, or execution requirements change.

## Phase-2 execution measurement (18 October 2026)

The AI runtime now persists metrics-only events in shadow mode. Proxy routes for media/video, transcription, website screenshots, URL media and cloud OCR record input length (when present), streamed output bytes, status, configured processor hostname and end-to-end gateway duration. Locally executed server endpoints for documents, PDF, images, barcode generation, network lookups, mockup rendering, screenshots, template tools and Tesseract OCR record route class, input length (when present), streamed output size, status and elapsed time. No input/output content, prompts, extracted text, file names or generated files are stored. No event deducts tokens or invents dollar cost from time/bytes.

`GET /api/billing/admin/usage` reports aggregate event counts and distinguishes estimated AI model-registry cost from actual provider invoice cost; actual cost remains null until invoice ingestion exists. Read `docs/billing-operations-runbook.md` for deployment migration, admin-token setup and interpretation details. On a production PostgreSQL/Neon deployment, apply migrations with `npm run db:migrate`; unlike the PGLite preview, Neon does not auto-apply migrations per request.

Verification: `npm run check:billing`, `npm run check:production`, `npm run check:production-gating`, `npm run check:native-ui-parity` and `npm run check:processor` passed in this pass. Syntax transpilation passed for changed TypeScript files. Full `npm run typecheck`, `npm run build`, AI runtime tests and native compilation remain unverified because the supplied dependency installation is incomplete. Checkout and token deduction remain disabled.

## Wallet rewards and funding

Migration `migrations/0007_wallet_rewards.sql` adds referral attribution and a ledger-backed reward-event record. Referral invitations and creator/video affiliate links are attributed to a signed-up account, but a reward is not granted for clicks, impressions, or client-reported views. The first qualifying payment must be verified by the configured provider; the referral, reward event, promotion-ledger entries, and purchase credit are processed in the same database transaction with idempotency keys. Video-affiliate referrals additionally require an HMAC-signed enV-issued attribution link bound to the referral code, so adding `source=video` to an ordinary invitation cannot unlock the extra creator-conversion reward. Default referral amounts and affiliate rate/cap are documented in `.env.example`; the price-per-token must be approved and explicitly configured. These defaults are development configuration, not a public financial offer.

Paystack checkout initialization uses a server-side secret, server-defined NGN token price and supported token packs. The hosted checkout reference, paid amount, currency, status, and provider transaction ID must be re-verified with Paystack before the token ledger is credited. Webhooks require an HMAC-SHA512 signature checked with a timing-safe comparison. The launch and enforcement flags remain off by default. Do not turn them on until production authentication and PostgreSQL migrations, finance-approved pricing, Paystack merchant credentials, supported-country/currency behavior, refunds/chargebacks, monitoring and release tests have been completed.

Android/iOS wallet dashboards read the shared balance using a revocable paired-device session. Their purchase controls remain disabled until Google Play Billing / Apple StoreKit adapters and server-side receipt verification are separately implemented; the Web Paystack route is not used as a shortcut around digital-goods store policies.


## Multi-provider wallet checkout — implementation

The Web wallet now opens a payment-method chooser before checkout. The server publishes the two configured methods through the existing funding-options endpoint:

- **Paystack (NGN):** hosted checkout is initialized with the secret key on the server. The provider must confirm the transaction and enV must match the purchase intent's provider reference, product, amount, currency and transaction ID before the ledger is credited. The signed Paystack webhook uses HMAC-SHA512 with a timing-safe comparison.
- **Cryptomus (crypto invoice):** enV creates a fiat-priced USD invoice, then directs the customer to the provider-hosted invoice page, where the available currencies and networks come from the merchant configuration. The Merchant API request is signed server-side using Cryptomus' documented MD5(base64(JSON body) + payment API key) format. The webhook signature is verified, then the server independently queries the invoice by order ID and matches invoice UUID, expected USD amount, currency, final paid status and the original purchase intent before crediting tokens. Browser return URLs never credit tokens.
- **Shared ledger:** both methods use the same wallet account, integer milli-token units, purchase-intent table, idempotency constraints, provider transaction uniqueness and verified-purchase ledger transaction. Replayed callbacks do not create a second credit.
- **Exceptional crypto statuses:** partial, underpaid, paid-over, locked, cancelled, failed or unfinalized invoices do not grant token credit automatically. Paid-over, locked and incorrect-amount invoices are flagged as disputed for manual review; refunds and disputes still require an operator's reconciled resolution under the published policy.

### Configuration and deliberate launch gates

All of the following stay disabled or empty by default:

- BILLING_LAUNCH_ENABLED and BILLING_ENFORCEMENT_ENABLED
- PAYSTACK_PROVIDER_APPROVED and CRYPTOMUS_PROVIDER_APPROVED
- PAYSTACK_TOKEN_PRICE_NGN_KOBO and CRYPTOMUS_TOKEN_PRICE_USD_CENTS
- Paystack secret credentials and Cryptomus merchant UUID/payment API key

Set the provider approval flags only after that provider has expressly approved the enV business model, the intended geography and payment rails, finance has approved the matching pack prices, the production domain/authentication/database are available, and end-to-end verification/refund/reconciliation checks have passed. A configured API key is not evidence of merchant approval. Cryptomus access and crypto acceptance in Nigeria also require the business's KYC, tax, AML, sanctions, consumer-disclosure and local legal review; this code does not establish legal eligibility.

Paystack documents restrictions for mobile-wallet and cryptocurrency businesses for international payment acceptance and flags some merchant categories for further review. Ask Paystack to classify enV's non-transferable tool-credit product and approve the Nigerian and international channels you actually intend to offer before enabling card checkout. Do not describe enV credits as cash, withdrawable value or cryptocurrency.

### Native-store restrictions

The Web chooser is responsive and can be used in a mobile browser. Native Android and iOS wallet buttons must not open this Web checkout as a workaround for store billing. Digital token credits generally require Google Play Billing on Google Play and Apple In-App Purchase/StoreKit on the App Store, unless the app and storefront meet a specific published exception or approved external-billing program. Native purchase adapters, signed store transaction verification, restore/revoke handling and store reconciliation are separate launch blockers. Until those adapters are completed and tested, the native Add funds action must state clearly that in-app purchases are not available in that release and must not launch Paystack or crypto checkout.

### Deployment checklist specific to payments

1. Configure the production PostgreSQL database and apply every required migration; verify wallet and purchase-intent/ledger transaction behavior on a production-equivalent database.
2. Complete provider onboarding/KYC and written approval, including approval for the intended sale of enV tool credits.
3. Approve the actual NGN-kobo and USD-cent prices per visible enV token; never treat the reference-value display as automatically approved pricing.
4. Add server-only credentials and the canonical HTTPS authentication URL in the production secret manager; register the Cryptomus webhook URL at /api/billing/cryptomus/webhook and the existing Paystack webhook URL in each provider dashboard.
5. Test signed good/bad webhooks, stale/duplicate callbacks, amount/currency/reference mismatch, expiry, underpayment, overpayment, provider timeout, database failure after invoice creation, refunds/chargebacks, support/reconciliation and mobile-browser redirect flows.
6. Complete Google Play Billing and Apple StoreKit product/receipt verification before enabling native-store purchases. Never embed gateway secrets in TypeScript clients, Android assets or iOS binaries.
7. Only then set the global enforcement and launch flags and each provider approval gate to true. If any live prerequisites are absent, checkout remains closed and the UI must communicate that no payment was taken.

