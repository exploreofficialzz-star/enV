# enV payment-provider country routing

## Runtime decision

Payment routing uses the visitor's country as observed by the hosting edge, not a country or currency sent in the browser request.

1. The funding-options API reads Vercel's `x-vercel-ip-country`. It reads `cf-ipcountry` only when `COUNTRY_GEO_PROVIDER=cloudflare` and `CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED=true`; direct Vercel-origin access must be blocked before enabling that fallback.
2. The purchase API repeats that lookup on the server. A client-supplied country, currency, payment method list, or amount is ignored.
3. A country profile maps to one currency and a provider-specific set of methods.
4. A provider is offered only when its merchant account, server credential, supported currency, provider approval and billing release gates are configured; Paystack/Flutterwave pack amounts also require a fresh server-side USD FX quote.
5. When the edge cannot identify a country, enV does not silently assume Nigeria. Local Paystack and Flutterwave options are not offered until a country is resolved. A country code is a routing hint, not KYC or proof of residence; VPNs, carrier gateways and corporate proxies can affect geolocation.

## One USD reference price and local FX

The enV reference price is fixed globally at **100 enV tokens = USD $1.00** (one token = USD $0.01). Wallet, token dashboard and token-pack cards use this USD reference value consistently. There are no per-country token-price environment variables.

Paystack and Flutterwave checkout amounts are derived server-side from the selected token pack's USD cents using the latest available USD-base FX snapshot from ExchangeRate-API Open Access. That endpoint updates once per day, is rate-limited, allows commercial currency conversion, and requires visible linked attribution. It is not a live, continuously updated market feed. enV caches a snapshot for up to six hours, rejects upstream data older than 36 hours, and fails closed when it cannot obtain a supported current rate. The source update time, fetch time, quote time and rate are saved in the purchase intent metadata so settlement is verified against the amount originally quoted, not a later rate.

The public funding-options API exposes pack availability and the currency label only; raw FX rates and local checkout amounts remain server-side. The user sees the USD reference value on the pack card. The final payment amount and settlement currency are shown by the provider's hosted checkout. A customer's card issuer may separately apply its own foreign-exchange rules or fees.

## Flutterwave collection coverage

The current country profile catalogue is deliberately explicit. Flutterwave's Standard checkout receives the country-specific currency and `payment_options` list. Flutterwave also filters methods that do not apply to a selected currency.

| Customer country | Checkout currency | Methods requested from Flutterwave |
|---|---:|---|
| Nigeria | NGN | Card, USSD, bank transfer, bank account, internet banking, NQR, eNaira, OPay |
| Ghana | GHS | Card, Ghana mobile money (`ghanamobilemoney`) |
| Kenya | KES | Card, M-Pesa |
| South Africa | ZAR | Card, bank account, 1Voucher |
| Malawi | MWK | Card, Malawi mobile money |
| Uganda | UGX | Card, Uganda mobile money |
| Rwanda | RWF | Card, Rwanda mobile money |
| Tanzania | TZS | Card, Tanzania mobile money |
| Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo | XOF | Card, West African mobile money |
| Cameroon, Central African Republic, Chad, Republic of the Congo, Equatorial Guinea, Gabon | XAF | Card, Central African mobile money |
| Zambia | ZMW | Card, Zambia mobile money |
| Egypt | EGP | Card, FawryPay |
| United Kingdom | GBP | Card, bank account |
| United States | USD | Card, bank account |
| Euro-area countries (including Bulgaria from 1 January 2026) | EUR | Card, bank account |

Only currencies enabled on the actual merchant account and listed in `FLUTTERWAVE_ENABLED_CURRENCIES` can be purchasable. The token-pack value is converted from the single USD reference price using the FX snapshot; no `FLUTTERWAVE_TOKEN_PRICE_<CURRENCY>_MINOR` variables exist. Flutterwave Standard currently documents `amount` as an int32 in major currency units. enV therefore enables a pack only when the converted amount is an exact whole major unit within the provider's int32 limit; fractional major-unit results are disabled rather than rounded or sent in an unsupported format. Flutterwave's current documentation also requires the account-level **Enable Dashboard Payment Options** switch to be unchecked before per-payment `payment_options` are applied. Set `FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED=true` only after verifying that dashboard setting. The deployment also requires `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `FLUTTERWAVE_PROVIDER_APPROVED=true`, the global billing gates, and `FLUTTERWAVE_REFUND_DISPUTE_HANDLING_APPROVED=true`. The last flag is intentionally false by default: the provider's refund/chargeback reconciliation and wallet reversal policy must be implemented and tested before activation.

Flutterwave method identifiers are currency-region specific: Ghana uses `ghanamobilemoney`; West African XOF uses `mobilemoneyxof`; Central African XAF uses `mobilemoneyxaf`. Flutterwave's documentation lists these identifiers separately from its country/currency matrix, so enV does not interchange XOF and XAF method names.

The country-to-method table is a request allowlist, not a guarantee that the merchant's Flutterwave account has every method activated. The account's live eligibility, settlement currencies, dashboard settings and provider onboarding remain authoritative.

## Paystack coverage and account boundaries

Paystack's supported merchant registration countries are Nigeria, Ghana, South Africa and Kenya. Paystack's merchant-country documentation currently lists Nigeria, Ghana, South Africa and Kenya; Côte d'Ivoire and Egypt are not enabled as merchant-registration countries by this implementation. Merchant registration country is not the same as customer location.

- Set `PAYSTACK_MERCHANT_COUNTRY` to the country where the actual Paystack merchant account is registered. Local Paystack checkout is offered only to a customer detected in that same country, and uses that merchant country's local currency.
- Nigeria uses `PAYSTACK_SECRET_KEY` and `PAYSTACK_PROVIDER_APPROVED`. The USD token reference price and live FX snapshot determine the NGN amount.
- The merchant account uses one `PAYSTACK_SECRET_KEY` for every transaction currency. For a Ghana, Kenya or South Africa merchant account, the matching local-currency route additionally requires its market approval (`PAYSTACK_PROVIDER_APPROVED_GHS/KES/ZAR`). The checkout amount is converted from the USD reference price at the current FX snapshot; there are no manually maintained local token-price tables.
- This implementation configures one Paystack merchant account country at a time. Supporting separate enV merchant entities in multiple Paystack countries would require separate merchant account routing, keys and settlement/legal configurations; it does not guess or merge those accounts.
- For customers outside the merchant's registration country, Paystack is offered only when `PAYSTACK_INTERNATIONAL_ENABLED=true`, international acceptance is approved in the Paystack dashboard, and the selected currency is permitted for that merchant country. Paystack documents NGN/USD for Nigeria, GHS for Ghana, KES/USD for Kenya, and ZAR for South Africa. Use `PAYSTACK_INTERNATIONAL_CURRENCY` only within that table. An international route is card-only; it does not claim to offer the customer's local bank, USSD or mobile-money rail.
- A Paystack customer in Ghana does not receive Ghana mobile-money rails from a Nigerian merchant account just because the visitor is in Ghana. The checkout currency and local methods belong to the merchant account. The customer's bank or card provider may convert an international card charge.

Paystack's local channels are controlled by the merchant account and dashboard. enV does not claim that every method is available for every Paystack merchant. FX values and converted settlement amounts are retained server-side; no raw rate, local pack amount or secret is exposed by the public funding-options API. Paystack's current international eligibility guidance lists mobile-wallet businesses among categories not eligible for international transactions. Because enV credits are held in a wallet-like ledger, enV must obtain written classification and approval for this specific non-transferable tool-credit product before enabling international card processing. Do not assume that technical API support equals merchant approval.

## Flutterwave and Paystack checkout integrity

- Checkout initialization creates a purchase intent before calling the provider and uses a unique idempotency key.
- The browser only receives a validated HTTPS hosted-checkout URL from the provider's expected checkout host.
- Redirects do not credit the wallet by themselves. Paystack and Flutterwave transaction details are re-fetched from the provider API and compared with the stored reference, transaction ID, exact amount and currency.
- Flutterwave webhook requests require the exact configured `verif-hash` header to match `FLW_SECRET_HASH`; the handler reads a bounded body and verifies the transaction with Flutterwave before calling the shared idempotent wallet ledger.
- Tokens are credited only through `creditVerifiedPurchase`, which enforces the stored purchase intent and provider transaction uniqueness.
- Flutterwave refund/dispute callbacks fail closed until a separate reconciliation and wallet reversal procedure exists. Never enable the provider-specific refund approval flag as a way to bypass that work.

## Deployment configuration

Keep these false until the end-to-end production checks are complete:

- `BILLING_LAUNCH_ENABLED=false`
- `BILLING_ENFORCEMENT_ENABLED=false`
- `BILLING_REFUND_DISPUTE_HANDLING_APPROVED=false`
- `PAYSTACK_PROVIDER_APPROVED=false` (and currency-specific Paystack approvals)
- `FLUTTERWAVE_PROVIDER_APPROVED=false`
- `FLUTTERWAVE_REFUND_DISPUTE_HANDLING_APPROVED=false`

Keep the global reference at 100 enV tokens = USD $1.00. The application derives Paystack/Flutterwave local amounts from a dated USD FX snapshot, and no per-country token-price variables should be added. Enable a currency only after the specific enV merchant account is able to receive it and its intended payment channels are enabled. Do not set a provider approval flag merely because a country appears in the technical documentation.

Native Android and iOS digital token purchases remain separate. This web checkout must not be used as a substitute for Google Play Billing or Apple StoreKit.

## Primary provider documentation

- Paystack merchant countries and international-payment eligibility: https://support.paystack.com/en/articles/2130562 and https://support.paystack.com/en/articles/2130690
- Paystack payment channels: https://paystack.com/docs/payments/payment-channels/
- Flutterwave payment methods and country/currency mapping: https://developer.flutterwave.com/docs/payment-methods
- Flutterwave Standard hosted checkout and integer amount field: https://developer.flutterwave.com/reference/checkout
- Flutterwave V3 webhook secret-hash (`verif-hash`) verification: https://developer.flutterwave.com/docs/webhooks
- Flutterwave hosted Standard checkout: https://developer.flutterwave.com/reference/checkout
- Flutterwave transaction verification: https://developer.flutterwave.com/docs/transaction-verification
- Flutterwave webhook signature verification: https://developer.flutterwave.com/docs/webhooks
- ExchangeRate-API Open Access terms, update schedule and attribution: https://www.exchangerate-api.com/docs/free
