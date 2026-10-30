# enV product analytics — privacy and operations

**Policy contract:** `2026-10-30.v1`

## Collection scope

Only after explicit, optional consent on the installation, collect fixed event names, catalogue tool IDs, platform, approximate device class, normalized OS/browser family, coarse network type, online/offline status, referrer category, bounded duration, machine-readable outcome/error code and a small allowlist of workflow metadata. Installation and session identifiers are random and stored server-side only as keyed HMAC digests. Associate an account only when the backend independently verifies its session and analytics consent exists.

## Never collect

Do not send passwords, cookies, auth tokens, payment data, IP addresses, full user-agent strings, search terms, full URLs, prompts, lyrics, documents, messages, comments, filenames, files, tool inputs or outputs, contacts, clipboard content or screen recordings. Do not use analytics as a general-purpose log endpoint. Free-form properties and raw exception messages are rejected.

## Consent controls

- Analytics is off unless the user actively chooses **Allow analytics**.
- Consent is installation-scoped and tied to a policy version.
- **No thanks** stops local queuing, clears the local queue and requests deletion of that installation's event history.
- The Web prompt can be reopened through **Privacy choices** while the UI flag is enabled.
- A changed policy version requires renewed consent.
- The server rejects event batches without a current granted consent record.
- Account creation or ordinary tool use is not consent.

Native Android and iOS must add equivalent native disclosure, consent, withdrawal and event queue handling before their clients send analytics.

## Server configuration

- `ANALYTICS_ENABLED=true` enables collection APIs.
- `ANALYTICS_HASH_SECRET` is a server-only random secret of at least 32 characters.
- `ANALYTICS_ADMIN_TOKEN` is a separate server-only credential of at least 32 characters for aggregate reporting.
- `CRON_SECRET` protects scheduled retention.
- `ANALYTICS_RETENTION_DAYS` accepts 30–365 days and defaults to 90.
- `VITE_ANALYTICS_ENABLED=true` enables the Web consent UI only after the API and privacy notice are ready.

Never put these server secrets in `VITE_*`, mobile binaries, source control or chat. Use distinct preview and production credentials.

## Dashboard access

`GET /api/analytics/summary` returns 30-day aggregates only. The endpoint requires a bearer `ANALYTICS_ADMIN_TOKEN` and does not return individual events, installation digests, account IDs, IP data or free-form content. Before exposing `userbehavior.envtools.store`, enable Vercel Deployment Protection or equivalent developer identity access control. The API token is a second layer, not a substitute for a private host.

## Retention

A daily Vercel cron calls `GET /api/analytics/retention` at 03:00 UTC with `Authorization: Bearer $CRON_SECRET`. It removes raw events older than the configured retention window and rate-limit rows older than one day. Aggregates are currently computed from retained rows; there is not yet a separate long-term aggregate warehouse.

## Production release gates

1. Publish and legally review the privacy notice for actual purposes, lawful basis, retention and international processing.
2. Verify opt-in, denial, withdrawal and deletion flows on Web, Android and iOS.
3. Configure separate preview and production secrets.
4. Apply the migration through the existing explicit `npm run db:migrate` release operation.
5. Protect the private dashboard host.
6. Test ingestion, consent denial, revocation, rate limiting, admin authorization and retention against staging PostgreSQL.
7. Ensure Apple App Store and Google Play privacy disclosures match actual collection and SDK behavior.
8. Keep analytics disabled until all applicable checks are complete.


## Developer feedback is a separate purpose

Developer feedback submissions are not analytics events and are never copied into analytics properties. The ticket API is independently disabled by default with `FEEDBACK_ENABLED=false`. It stores the report title and description, category, platform, optional catalogue tool ID and app version, ticket status/priority, and an optional verified account reference. The API does not ask for an e-mail address. Users must be warned not to include passwords, payment details, authentication tokens, private contact data or other secrets in a report.

Anonymous abuse control uses a keyed HMAC digest of a network identifier; the raw address is not stored. The digest secret must remain server-only. Access to ticket descriptions is restricted to the developer moderation service. Resolved and closed tickets are removed after the configured retention interval (default 365 days); unresolved tickets remain until resolved or deleted under the applicable privacy request process. Public tool discussions must use a distinct service with independent identity, visibility and moderation controls.
