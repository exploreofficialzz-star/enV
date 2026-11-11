# enV payment-provider country routing

## Runtime decision

Payment routing uses the visitor's country as observed by the hosting edge, not a country or currency sent in the browser request.

1. The funding-options API reads `x-vercel-ip-country`; `cf-ipcountry` is a fallback for a deployment behind Cloudflare.
2. The purchase API repeats that lookup on the server. A client-supplied country, currency, payment method list, or amount is ignored.
3. A country profile maps to one currency and a provider-specific set of methods.
4. A provider is offered only when its merchant account, server credential, finance-approved price, supported currency, provider approval and billing release gates are all configured.
5. When the edge cannot identify a country, enV does not silently assume Nigeria. Local Paystack and Flutterwave options are not offered until a country is resolved. A country code is a routing hint, not KYC or proof of residence; VPNs, carrier gateways and corporate proxies can affect geolocation.

The price is configured in integer minor units per enV token. No exchange rate is guessed at checkout. If a visitor is charged in a currency other than their bank-account currency, their card issuer or the payment provider handles conversion under its own rules.

## Flutterwave collection coverage

The current country profile catalogue is deliberately explicit. Flutterwave's Standard checkout receives the country-specific currency and `payment_options` list. Flutterwave also filters methods that do not apply to a selected currency.

| Customer country | Checkout currency | Methods requested from Flutterwave |
|---|---:|---|
| Nigeria | NGN | Card, USSD, bank transfer, bank account, internet banking, NQR, eNaira, OPay |
| Ghana | GHS | Card, Ghana mobile money |
| Kenya | KES | Card, M-Pesa |
| South Africa | ZAR | Card, bank account, 1Voucher |
| Malawi | MWK | Card, Malawi mobile money |
| Uganda | UGX | Card, Uganda mobile money |
| Rwanda | RWF | Card, Rwanda mobile money |
| Tanzania | TZS | Card, Tanzania mobile money |
| Côte d'Ivoire, Senegal | XOF | Card, West African mobile money |
| Cameroon | XAF | Card, Central African mobile money |
| Egypt | EGP | Card, FawryPay |
| United Kingdom | GBP | Card, bank account |
| United States | USD | Card, bank account |
| Selected EUR/SEPA account markets | EUR | Card, bank account |

Only currencies listed in `FLUTTERWAVE_ENABLED_CURRENCIES` are made purchasable, and each needs `FLUTTERWAVE_TOKEN_PRICE_<CURRENCY>_MINOR`. The deployment also requires `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `FLUTTERWAVE_PROVIDER_APPROVED=true`, the global billing gates, and `FLUTTERWAVE_REFUND_DISPUTE_HANDLING_APPROVED=true`. The last flag is intentionally false by default: the provider's refund/chargeback reconciliation and wallet reversal policy must be implemented and tested before activation.

The country-to-method table is a request allowlist, not a guarantee that the merchant's Flutterwave account has every method activated. The account's live eligibility, settlement currencies, dashboard settings and provider onboarding remain authoritative.

## Paystack coverage and account boundaries

Paystack serves businesses registered in Nigeria, Ghana, South Africa and Kenya. This must not be confused with the customer's location: a Nigerian enV merchant can receive an international card payment from a customer abroad only after Paystack enables international payments for the merchant.

- Customer in Nigeria: use the configured NGN merchant account. Existing `PAYSTACK_SECRET_KEY`, `PAYSTACK_PROVIDER_APPROVED` and `PAYSTACK_TOKEN_PRICE_NGN_KOBO` remain the Nigeria configuration.
- Customer in Ghana, Kenya or South Africa: use a local merchant currency only when the matching currency-specific secret, approval and price are configured: `PAYSTACK_SECRET_KEY_GHS/KES/ZAR`, `PAYSTACK_PROVIDER_APPROVED_GHS/KES/ZAR`, and `PAYSTACK_TOKEN_PRICE_GHS/KES/ZAR_MINOR`.
- Customer outside a configured local Paystack market: Paystack is offered only when `PAYSTACK_INTERNATIONAL_ENABLED=true`, the merchant has enabled international acceptance in the Paystack dashboard, and the configured international currency has a matching server key and price. That route is card-only; it does not claim to offer the customer's local bank, USSD or mobile-money rail.

Paystack's local channels are controlled by the merchant account and dashboard. enV does not claim that every method is available for every Paystack market. Currency-specific credentials and prices are kept server-side; no secret is exposed to the browser.

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

Configure a price only after finance approves the user-facing local-currency price. Enable a currency only after the specific enV merchant account is able to receive it and its intended payment channels are enabled. Do not set a provider approval flag merely because a country appears in the technical documentation.

Native Android and iOS digital token purchases remain separate. This web checkout must not be used as a substitute for Google Play Billing or Apple StoreKit.

## Primary provider documentation

- Paystack merchant countries and international-payment eligibility: https://support.paystack.com/en/articles/2130562 and https://support.paystack.com/en/articles/2130690
- Paystack payment channels: https://paystack.com/docs/payments/payment-channels/
- Flutterwave payment methods and country/currency mapping: https://developer.flutterwave.com/docs/payment-methods
- Flutterwave hosted Standard checkout: https://developer.flutterwave.com/reference/checkout
- Flutterwave transaction verification: https://developer.flutterwave.com/docs/transaction-verification
- Flutterwave webhook signature verification: https://developer.flutterwave.com/docs/webhooks
