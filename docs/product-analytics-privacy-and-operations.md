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

Android and iOS have independent native consent surfaces and clients. Android stores the bounded event queue encrypted with an Android Keystore-backed AES-GCM key; iOS stores its subject and queue in Keychain. Both clients use the same versioned, metadata-only protocol and HTTPS API. Native collection is disabled by default in release configuration; it must be enabled deliberately only after the server and privacy release gates below pass.

## Server configuration

- `ANALYTICS_ENABLED=true` enables collection APIs.
- `ANALYTICS_HASH_SECRET` is a server-only random secret of at least 32 characters.
- `ANALYTICS_ADMIN_TOKEN` is an optional separate server-only credential of at least 32 characters for trusted server-to-server aggregate reporting; the private dashboard uses its own password and revocable session cookie.
- `CRON_SECRET` protects scheduled retention.
- `ANALYTICS_RETENTION_DAYS` accepts 30–365 days and defaults to 90.
- `VITE_ANALYTICS_ENABLED=true` enables the Web consent UI only after the API and privacy notice are ready.

Never put these server secrets in `VITE_*`, mobile binaries, source control or chat. Use distinct preview and production credentials.

## Release switches

- Web production: set server-only `ANALYTICS_ENABLED=true`, `ANALYTICS_HASH_SECRET`, `ANALYTICS_DASHBOARD_ENABLED=true`, `ANALYTICS_DASHBOARD_PASSWORD` (24+ characters), and `ANALYTICS_DASHBOARD_COOKIE_SECRET` (32+ characters). Set build-time `VITE_ANALYTICS_ENABLED=true` to show the opt-in prompt and `VITE_ANALYTICS_DASHBOARD_ENABLED=true` to render the dashboard sign-in UI. Keep all server secrets out of `VITE_*`.
- Android: the Gradle release property `-PenvAnalyticsEnabled=true` enables the native consent surface and event client. It defaults to `false`.
- iOS: pass `ENV_ANALYTICS_ENABLED=YES` to the intended `xcodebuild` release invocation. The project setting defaults to `NO`; `Info.plist` is build-setting driven.
- Keep native and Web collection switches off until the same server API, migration, consent text, privacy notice and withdrawal checks are ready. The native clients do not need or receive any analytics secret.

## Dashboard access

`GET /api/analytics/summary` returns aggregate activity only: a 30-day detailed window plus up to 365 days of daily aggregates. It accepts either the server-only bearer `ANALYTICS_ADMIN_TOKEN` for trusted server-to-server use or the dashboard's eight-hour signed `HttpOnly; Secure; SameSite=Strict` browser cookie. The browser password exchange is protected by database-backed throttling. Each cookie maps to an HMAC-digested server-side session row; every summary request checks that row, and sign-out revokes it immediately so a copied cookie stops working. The database stores neither the raw cookie nor the session ID. It does not return individual events, installation digests, account IDs, IP data or free-form content.

Before enabling `userbehavior.envtools.store`, require the application dashboard login and use Vercel Deployment Protection or an equivalent developer-identity access boundary when it can be applied without blocking the public product hosts. Do not enable project-wide deployment protection on the shared public project. The application login and server-revocable session are mandatory even when an outer host gate is used.

## Retention

A daily Vercel cron calls `GET /api/analytics/retention` at 03:00 UTC with `Authorization: Bearer $CRON_SECRET`. It removes raw events older than the configured retention window and rate-limit rows older than one day. Aggregates are currently computed from retained rows; there is not yet a separate long-term aggregate warehouse.

## Production release gates

1. Publish and legally review the privacy notice for actual purposes, lawful basis, retention and international processing.
2. Verify opt-in, denial, withdrawal and deletion flows on Web, Android and iOS.
3. Configure separate preview and production secrets.
4. Apply the migration through the existing explicit `npm run db:migrate` release operation.
5. Apply migration `0018_analytics_dashboard_sessions.sql` as part of the reviewed migration sequence; verify the dashboard session table has RLS enabled and no client policies.
6. Protect the private dashboard host and configure the dashboard password/session secrets.
7. Test ingestion, consent denial, withdrawal racing with event ingestion, copied-cookie rejection after sign-out, rate limiting, admin authorization and retention against staging PostgreSQL.
7. Ensure Apple App Store and Google Play privacy disclosures match actual collection and SDK behavior.
8. Keep analytics disabled until all applicable checks are complete.


## Developer feedback is a separate purpose

Developer feedback submissions are not analytics events and are never copied into analytics properties. The ticket API is independently disabled by default with `FEEDBACK_ENABLED=false`. It stores the report title and description, category, platform, optional catalogue tool ID and app version, ticket status/priority, and an optional verified account reference. The API does not ask for an e-mail address. Users must be warned not to include passwords, payment details, authentication tokens, private contact data or other secrets in a report.

Anonymous abuse control uses a keyed HMAC digest of a network identifier; the raw address is not stored. The digest secret must remain server-only. Access to ticket descriptions is restricted to the developer moderation service. Resolved and closed tickets are removed after the configured retention interval (default 365 days); unresolved tickets remain until resolved or deleted under the applicable privacy request process. Public tool discussions must use a distinct service with independent identity, visibility and moderation controls.


## Public community content and counters

Comments, replies, selected public display labels, reactions, reports and blocks are community features, not analytics. Comment content is visible to other visitors and should be accompanied by clear posting/visibility terms. Choosing **Anonymous** hides the public display label; it does not mean the service has no private abuse-control record. The service retains a keyed HMAC actor digest so users can block/report abuse and moderators can enforce rules. Raw IP addresses are not stored by this community schema. A **Public** display label is user-selected and is not a verified real-world identity. Community view counters are deduplicated once per pseudonymous actor/tool/day and do not store full page URLs. Users can remove their own comments; moderators can hide or remove reported content. Publish retention, deletion, reporting and appeal processes before enabling the feature.


## Private analytics dashboard access

The `userbehavior.envtools.store` dashboard is protected by a server-side password exchange and a short-lived (8-hour) signed `HttpOnly; Secure; SameSite=Strict` cookie. The dashboard password and cookie signing secret are server-only deployment secrets; neither is exposed through `VITE_*` bundles. Failed sign-ins are rate-limited using a keyed digest of a network identifier. The legacy bearer `ANALYTICS_ADMIN_TOKEN` remains server-only and must never be placed in a browser, mobile bundle, query string or local storage. Sign-out clears the browser session cookie. The dashboard displays aggregate, consented data only; it is not a device-level surveillance feed.


## Aggregate history retention

The analytics retention job first snapshots the previous completed day into `product_analytics_daily_snapshots`, then applies the configured raw-event retention (default 90 days, allowed 30–365). Snapshots retain daily counts by platform, tool and event type, failures, distinct installation/session counts and duration totals, without copying user, installation, session, IP, or event identifiers. Snapshots are retained for up to 730 days and are pruned after that. The private dashboard shows a 30-day detailed overview plus up to 365 days of aggregate daily history. Snapshot completeness must be checked after PostgreSQL migration and scheduled-job activation; no historical snapshots can be reconstructed for days before the job is first enabled.


## Community retention and pseudonymous view counts

The daily community retention job snapshots unique views by tool and day into a table containing only the day, tool ID and aggregate count. It then removes the per-visitor view rows after 30 days. Lifetime page-view counts are read from the snapshot plus the unsnapshotted recent rows. Reviewed/dismissed/actioned reports are retained for up to 365 days; hidden/removed comments are eligible for deletion 365 days after their last update; block records are pruned after 730 days; short-lived rate-limit digests are pruned after 48 hours. Open reports and visible user comments are not automatically deleted by this job. A published community-specific deletion/appeal procedure is still required before enabling public discussions.
