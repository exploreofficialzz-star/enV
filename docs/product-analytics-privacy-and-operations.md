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

Android and iOS already have independent native consent surfaces and clients. Android keeps its bounded event queue encrypted with an Android Keystore-backed AES-GCM key; iOS stores its subject and queue in Keychain. Both use the same versioned metadata-only protocol and HTTPS API. Native collection is disabled by default in release configuration and must be deliberately enabled only after the server and privacy release gates below pass.

## Server configuration

- `ANALYTICS_ENABLED=true` enables collection APIs.
- `ANALYTICS_HASH_SECRET` is a server-only random secret of at least 32 characters.
- `ANALYTICS_ADMIN_TOKEN` is optional and server-only; it supports trusted server-to-server aggregate reporting. The browser dashboard uses its own password and revocable session cookie.
- `CRON_SECRET` protects scheduled retention.
- `ANALYTICS_RETENTION_DAYS` accepts 30–365 days and defaults to 90.
- `VITE_ANALYTICS_ENABLED=true` enables the Web consent UI only after the API and privacy notice are ready.

Never put these server secrets in `VITE_*`, mobile binaries, source control or chat. Use distinct preview and production credentials.

## Release switches

- Web production: configure server-only `ANALYTICS_ENABLED=true`, `ANALYTICS_HASH_SECRET`, `ANALYTICS_DASHBOARD_ENABLED=true`, `ANALYTICS_DASHBOARD_PASSWORD` (24+ characters), and `ANALYTICS_DASHBOARD_COOKIE_SECRET` (32+ characters). Set build-time `VITE_ANALYTICS_DASHBOARD_ENABLED=true` to render the dashboard login UI. Keep `VITE_ANALYTICS_ENABLED=false` until the consent and privacy gates pass.
- Android: the intended Gradle release can enable the native consent UI with `-PenvAnalyticsEnabled=true`; the build default remains disabled.
- iOS: the intended Xcode release can set `ENV_ANALYTICS_ENABLED=YES`; the project/configuration default remains `NO`.
- Native clients never receive the analytics signing or dashboard secrets. All platform collection switches remain disabled until the consent, withdrawal, privacy notice and store disclosure checks pass.

## Dashboard access

`GET /api/analytics/summary` returns aggregate activity only: a 30-day detailed window plus up to 365 days of daily aggregates. It accepts either the optional server-only bearer `ANALYTICS_ADMIN_TOKEN` for trusted server-to-server use or the dashboard's eight-hour signed `HttpOnly; Secure; SameSite=Strict` browser cookie. Each browser session is backed by an HMAC-digested row in `product_analytics_dashboard_sessions`; each summary request checks that the row is active, and sign-out revokes it so a copied cookie stops working. The database never stores the raw cookie token or session ID. Summary responses do not return individual events, installation digests, account IDs, IP data or free-form content.

The application password login and server-revocable session are mandatory. Use a separate identity gate for the private hostname only when it can be applied without blocking the shared public product hosts. Do not turn on project-wide Vercel Deployment Protection for the shared public project.

## Retention

A daily Vercel cron calls `GET /api/analytics/retention` at 03:00 UTC with `Authorization: Bearer $CRON_SECRET`. Before pruning, it upserts daily aggregates into `product_analytics_daily_snapshots` and privacy-safe daily reports into `product_analytics_daily_reports`; it then removes raw events older than the configured retention window and stale rate-limit rows. Snapshots and reports are retained for up to 730 days. The cron requires a server-only `CRON_SECRET` and all supporting migrations to be applied; verify actual successful scheduled runs rather than assuming the configured cron has executed.

## Production release gates

1. Publish and legally review the privacy notice for actual purposes, lawful basis, retention and international processing.
2. Verify opt-in, denial, withdrawal and deletion flows on Web, Android and iOS.
3. Configure separate preview and production secrets.
4. Verify the target PostgreSQL database and a restorable backup. Run `npm run db:migrate:analytics -- --dry-run` first and confirm that it identifies only the User Behavior migration allowlist and the expected database. After that verification, run `npm run db:migrate:analytics -- --apply` as the explicit schema-changing release operation. This isolated command applies only `0008_product_analytics.sql`, `0012_analytics_dashboard_security.sql`, `0013_analytics_daily_snapshots.sql`, `0017_analytics_daily_reports.sql`, `0018_analytics_dashboard_sessions.sql`, `0019_analytics_core_rls.sql` and `0020_analytics_privilege_lockdown.sql`; it requires the existing `public."user"` auth table. The runner uses `SET LOCAL` and a transaction-scoped advisory lock, so it is compatible with Supabase's transaction pooler, and all allowlisted schema changes plus ledger entries commit as one transaction. It deliberately skips `0009_product_feedback.sql`, `0016_analytics_feedback_rls.sql`, the shared Supabase RLS baseline and every Wallet, Community, Product Feedback and World Lab migration.
5. Verify `product_analytics_dashboard_sessions` has RLS enabled and no client-facing policies.
6. Test ingestion, consent denial, withdrawal racing with event ingestion, copied-cookie rejection after sign-out, rate limiting, admin authorization and retention against staging PostgreSQL.
7. Protect the private dashboard with its application login and a host-only identity boundary where available without blocking public product hosts.
8. Ensure Apple App Store and Google Play privacy disclosures match actual collection and SDK behavior.
9. Keep analytics disabled until all applicable checks are complete.


## Developer feedback is a separate purpose

Developer feedback submissions are not analytics events and are never copied into analytics properties. The ticket API is independently disabled by default with `FEEDBACK_ENABLED=false`. It stores the report title and description, category, platform, optional catalogue tool ID and app version, ticket status/priority, and an optional verified account reference. The API does not ask for an e-mail address. Users must be warned not to include passwords, payment details, authentication tokens, private contact data or other secrets in a report.

Anonymous abuse control uses a keyed HMAC digest of a network identifier; the raw address is not stored. The digest secret must remain server-only. Access to ticket descriptions is restricted to the developer moderation service. Resolved and closed tickets are removed after the configured retention interval (default 365 days); unresolved tickets remain until resolved or deleted under the applicable privacy request process. Public tool discussions must use a distinct service with independent identity, visibility and moderation controls.


## Public community content and counters

Comments, replies, selected public display labels, reactions, reports and blocks are community features, not analytics. Comment content is visible to other visitors and should be accompanied by clear posting/visibility terms. Choosing **Anonymous** hides the public display label; it does not mean the service has no private abuse-control record. The service retains a keyed HMAC actor digest so users can block/report abuse and moderators can enforce rules. Raw IP addresses are not stored by this community schema. A **Public** display label is user-selected and is not a verified real-world identity. Community view counters are deduplicated once per pseudonymous actor/tool/day and do not store full page URLs. Users can remove their own comments; moderators can hide or remove reported content. Publish retention, deletion, reporting and appeal processes before enabling the feature.


## Private analytics dashboard access

The `userbehavior.envtools.store` dashboard is protected by a server-side password exchange and a short-lived (8-hour) signed `HttpOnly; Secure; SameSite=Strict` cookie. Each cookie is backed by an HMAC-digested server-side session row, checked on every dashboard summary request and revoked on sign-out. The database stores neither the raw cookie token nor the raw session ID. The dashboard password and cookie signing secret are server-only deployment secrets; neither is exposed through `VITE_*` bundles. Failed sign-ins are rate-limited using a keyed digest of a network identifier. The optional bearer `ANALYTICS_ADMIN_TOKEN` remains server-only and must never be placed in a browser, mobile bundle, query string or local storage. The dashboard displays aggregate, consented data only; it is not a device-level surveillance feed.


## Aggregate history retention

The analytics retention job first snapshots the previous completed day into `product_analytics_daily_snapshots`, then applies the configured raw-event retention (default 90 days, allowed 30–365). Snapshots retain daily counts by platform, tool and event type, failures, distinct installation/session counts and duration totals, without copying user, installation, session, IP, or event identifiers. Snapshots are retained for up to 730 days and are pruned after that. The private dashboard shows a 30-day detailed overview plus up to 365 days of aggregate daily history. Snapshot completeness must be checked after PostgreSQL migration and scheduled-job activation; no historical snapshots can be reconstructed for days before the job is first enabled.


## Community retention and pseudonymous view counts

The daily community retention job snapshots unique views by tool and day into a table containing only the day, tool ID and aggregate count. It then removes the per-visitor view rows after 30 days. Lifetime page-view counts are read from the snapshot plus the unsnapshotted recent rows. Reviewed/dismissed/actioned reports are retained for up to 365 days; hidden/removed comments are eligible for deletion 365 days after their last update; block records are pruned after 730 days; short-lived rate-limit digests are pruned after 48 hours. Open reports and visible user comments are not automatically deleted by this job. A published community-specific deletion/appeal procedure is still required before enabling public discussions.
