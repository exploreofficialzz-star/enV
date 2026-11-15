# enV payment-provider country routing

## Runtime decision

Payment routing uses the visitor's country as observed by the hosting edge, not a country or currency sent in the browser request.

1. The funding-options API reads Vercel's `x-vercel-ip-country`. It reads `cf-ipcountry` only when `COUNTRY_GEO_PROVIDER=cloudflare` and `CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED=true`; direct Vercel-origin access must be blocked before enabling that fallback.
2. The purchase API repeats that lookup on the server. A client-supplied country, currency, payment method list, or amount is ignored.
3. A country profile maps to one currency and a provider-specific set of methods.
4. Paystack is offered only when the detected customer country matches `PAYSTACK_MERCHANT_COUNTRY`. enV routes Nigeria through Paystack. Flutterwave V4 is a separate explicit option for non-Nigerian customers in an enabled Flutterwave country/currency profile. A foreign customer is never sent through the Paystack merchant-country checkout as an automatic fallback.
5. A provider is offered only when its merchant account, server credential, supported currency, currency allowlist, provider approval and billing release gates are configured; Paystack/Flutterwave amounts also require a fresh server-side USD FX quote.
6. When the edge cannot identify a country, enV does not silently assume Nigeria. Local Paystack and Flutterwave options are not offered until a country is resolved. A country code is a routing hint, not KYC or proof of residence; VPNs, carrier gateways and corporate proxies can affect geolocation.

## One USD reference price and local FX

The enV reference price is fixed globally at **100 enV tokens = USD $1.00** (one token = USD $0.01). Wallet, token dashboard and token-pack cards use this USD reference value consistently. There are no per-country token-price environment variables.

Paystack and Flutterwave checkout amounts are derived server-side from the selected token pack's USD cents using the latest available USD-base FX snapshot from ExchangeRate-API Open Access. That endpoint updates once per day, is rate-limited, allows commercial currency conversion, and requires visible linked attribution. It is not a live, continuously updated market feed. enV caches a snapshot for up to six hours, rejects upstream data older than 36 hours, and fails closed when it cannot obtain a supported current rate. The source update time, fetch time, quote time and rate are saved in the purchase intent metadata so settlement is verified against the amount originally quoted, not a later rate.

The public funding-options API exposes only customer-facing method availability, detected country/currency and generic guidance; provider identities, raw FX rates and local checkout amounts remain server-side. The user sees the USD reference value on the pack card. The final payment amount and settlement currency are shown by the provider's hosted checkout. A customer's card issuer may separately apply its own foreign-exchange rules or fees.

## Flutterwave v4 collection coverage

Flutterwave is a standalone payment choice in the enV wallet. It is not a Paystack fallback, and choosing it never changes the Paystack Nigeria route. Customers outside Nigeria may explicitly choose Flutterwave where the detected country has an enV country/currency profile, the currency is enabled on the Flutterwave merchant account, and a V4 payment method is available. Nigeria remains Paystack-only in enV; Flutterwave is not exposed for NGN or as an alternative Nigeria payment route.

The integration uses the Flutterwave V4 OAuth and Orchestrator APIs. It does not call Standard checkout or any `/v3` endpoint:

- **Card:** V4 Orchestrator direct charge. The browser encrypts each card field with AES-256-GCM and a unique 12-character nonce before sending it to enV. Raw PAN, expiry and CVV are not posted to or stored by enV.
- **Mobile money:** V4 Orchestrator with a country-specific network allowlist. The current supported networks are Ghana (MTN, Telecel, AirtelTigo), Kenya (M-Pesa), Côte d'Ivoire (MTN, Orange, Wave), Cameroon (MTN, Orange), Rwanda (Airtel, MTN), Tanzania (Airtel, Tigo, Halopesa), Uganda (Airtel, MTN), Zambia (Airtel, MTN, Zamtel), Burkina Faso (Orange, Mobicash), and Senegal (Orange, Free Money, Wave).
- **Ghana GHS:** Card and the configured mobile-money networks. Dynamic virtual-account bank transfer can be exposed only when the merchant has Ghana virtual-account capability and `GHS` is explicitly added to `FLUTTERWAVE_VIRTUAL_ACCOUNT_CURRENCIES`. Ghana virtual accounts are not automatically available to merchants registered outside Ghana.
- **Other supported currency profiles:** Card is available only where the profile/currency and merchant account permit it. enV does not advertise a local rail merely because Flutterwave lists a currency.

The country-routing catalogue includes NGN for Paystack, plus GHS, KES, ZAR, MWK, UGX, RWF, TZS, XOF, XAF, ZMW, EGP, GBP, USD, CAD, COP, INR, SLL and EUR for other regional routing. Nigeria is excluded from the Flutterwave service itself. A country profile and currency allowlist are necessary but do not guarantee that the merchant account has a particular rail activated. Flutterwave merchant-country rules and feature approval remain authoritative.

The server creates an enV purchase intent before any provider request. Card and live-configured mobile-money payments use V4 Orchestrator direct charges. Ghana bank transfers use the V4 Customers and Virtual Accounts APIs and create a dynamic GHS account linked to the enV purchase reference. Flutterwave may add a collection fee to the requested amount; enV therefore saves and displays the exact amount returned by the virtual-account response. The final charge is independently retrieved from the V4 Charges API and compared against the saved reference, amount and currency before the shared ledger credits tokens. A bank-transfer account alone never credits tokens.

V4 configuration is server-only:

- `FLW_CLIENT_ID` and `FLW_CLIENT_SECRET`: OAuth client credentials for the selected environment.
- `FLW_ENVIRONMENT`: `production` or `sandbox`; use credentials from the same environment.
- `FLW_ENCRYPTION_KEY`: V4 card-field encryption key; never expose it in a browser bundle.
- `FLW_SECRET_HASH`: V4 webhook HMAC-SHA256 verification key.
- `FLUTTERWAVE_ENABLED_CURRENCIES`: currencies enabled on the actual Flutterwave merchant account.
- `FLUTTERWAVE_VIRTUAL_ACCOUNT_CURRENCIES`: dynamic bank-transfer currencies explicitly enabled for this merchant. enV supports GHS only, and only after Flutterwave confirms GHS virtual-account access for the merchant. NGN virtual accounts are intentionally not used by enV because Nigeria is Paystack-only.

The V4 webhook endpoint verifies the raw request body against the `flutterwave-signature` HMAC-SHA256 header using a timing-safe comparison. `charge.completed` events are verified with the V4 charge retrieval API; asynchronous bank transfers are found by their unique reference through the V4 charge-list endpoint before retrieval. Refund and chargeback callbacks are re-fetched from the V4 Refunds/Chargebacks APIs before the shared ledger can reverse funds. Redirects and webhook payloads alone are never treated as proof of payment.

## Paystack coverage and account boundaries

Paystack's supported merchant registration countries are Nigeria, Ghana, South Africa and Kenya. Paystack's merchant-country documentation currently lists Nigeria, Ghana, South Africa and Kenya; Côte d'Ivoire and Egypt are not enabled as merchant-registration countries by this implementation. Merchant registration country is not the same as customer location.

- Set `PAYSTACK_MERCHANT_COUNTRY` to the country where the actual Paystack merchant account is registered. Local Paystack checkout is offered only to a customer detected in that same country, and uses that merchant country's local currency.
- Nigeria uses `PAYSTACK_SECRET_KEY` and `PAYSTACK_PROVIDER_APPROVED`. The USD token reference price and live FX snapshot determine the NGN amount.
- The merchant account uses one `PAYSTACK_SECRET_KEY` for every transaction currency. For a Ghana, Kenya or South Africa merchant account, the matching local-currency route additionally requires its market approval (`PAYSTACK_PROVIDER_APPROVED_GHS/KES/ZAR`). The checkout amount is converted from the USD reference price at the current FX snapshot; there are no manually maintained local token-price tables.
- This implementation configures one Paystack merchant account country at a time. Supporting separate enV merchant entities in multiple Paystack countries would require separate merchant account routing, keys and settlement/legal configurations; it does not guess or merge those accounts.
- Paystack technically supports international cards when the merchant has separately passed its dashboard/compliance approval, but enV's Add Funds routing does not use that facility for foreign customers. A Paystack customer checkout is shown only when the customer's detected country matches `PAYSTACK_MERCHANT_COUNTRY`; for a Nigerian merchant this means Paystack is used for Nigeria-based customers only.
- Customers outside Nigeria may explicitly select Flutterwave V4 only when their country has an explicit Flutterwave profile and the profile currency is enabled on the enV merchant account. Their checkout uses that country's configured currency and method allowlist (for example GHS for Ghana, KES for Kenya, GBP for the United Kingdom, USD for the United States, EUR for the euro area, XOF/XAF for the corresponding West/Central African markets). If Flutterwave is not approved/configured for that country/currency, enV shows no card option instead of silently presenting a Nigerian Paystack checkout.
- A customer in Ghana does not receive Nigerian NGN Paystack checkout merely because the enV Paystack merchant is Nigerian. Their eligible Flutterwave checkout is quoted in GHS. Paystack's international feature remains documented above for merchant capabilities, but is deliberately not an automatic Add Funds fallback in enV.

Paystack's local channels are controlled by the merchant account and dashboard. enV does not claim that every method is available for every Paystack merchant. FX values and converted settlement amounts are retained server-side; no raw rate, local pack amount or secret is exposed by the public funding-options API. Paystack's current international eligibility guidance lists mobile-wallet businesses among categories not eligible for international transactions. Because enV credits are held in a wallet-like ledger, enV must obtain written classification and approval for this specific non-transferable tool-credit product before enabling international card processing. Do not assume that technical API support equals merchant approval.

## Flutterwave and Paystack checkout integrity

- Each provider creates an enV purchase intent before checkout and uses a unique idempotency key.
- Paystack remains limited to the configured merchant country. Flutterwave is independently selected and never used as a silent fallback.
- V4 card and bank-payment actions are completed on Flutterwave or the selected bank; redirects never credit the wallet by themselves.
- Flutterwave settlement retrieves the V4 charge and compares the saved purchase reference, exact amount and currency before calling the shared ledger. Bank-transfer webhook references are resolved through the V4 charge list, then retrieved by charge ID.
- Flutterwave V4 webhook signatures are verified over the bounded raw request body using HMAC-SHA256 and the `flutterwave-signature` header.
- Tokens are credited only through `creditVerifiedPurchase`, which enforces the stored purchase intent, provider transaction uniqueness and idempotent event handling.
- Refund and chargeback webhooks are re-fetched from Flutterwave's V4 resource endpoints and reconciled against the original purchase intent before a wallet reversal.

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
- Flutterwave V4 Orchestrator direct charges: https://developer.flutterwave.com/v4/api/charges/charges_post
- Flutterwave V4 webhook signature verification: https://developer.flutterwave.com/v4/docs/webhooks
- ExchangeRate-API Open Access terms, update schedule and attribution: https://www.exchangerate-api.com/docs/free
