# enV production subdomain release runbook

**Purpose:** Launch the five product subdomains on the production enV deployment without changing the canonical Web host or exposing private developer services.

## Host responsibilities

| Host | Production purpose | Public access |
|---|---|---|
| `android.envtools.store` | Android system-browser handoff for Web-only tools | Public |
| `ios.envtools.store` | iOS system-browser handoff for Web-only tools | Public |
| `feedback.envtools.store` | Feedback intake and product support | Public submission; private moderation |
| `updates.envtools.store` | Product updates and release notes | Public read; developer-only publishing |
| `userbehavior.envtools.store` | Consent-based aggregate product analytics | Private developer dashboard |

The Android/iOS hosts do not replace the native apps and must never be loaded inside an app WebView. Native-capable tools remain native.

## Source routing

`vercel.json` owns server-side host rewrites. `src/lib/subdomain-routing.ts` mirrors those mappings in TanStack Router so the browser URL, SSR route and client navigation remain consistent. Tool paths such as `/tools/:category/:slug` are not rewritten. Feedback and updates expose `/admin` externally and route it internally to the signed-in developer workspace.

Run the deterministic host-routing check with:

```sh
node --experimental-strip-types scripts/check-subdomain-routing.mjs
```

## Vercel and DNS release steps

1. In the intended production Vercel project, add each of the five exact hostnames under **Settings → Domains**. Keep the canonical `envtools.store` domain attached to the current Web application.
2. For each hostname, use the exact DNS record type, name and target Vercel displays for that domain. Do not copy a guessed CNAME target or IP from this document; Vercel's required target can vary by project and account.
3. In Namecheap, open the domain's Advanced DNS records and create the corresponding records exactly as Vercel specifies. Remove only conflicting records for the same host after confirming they are obsolete. Do not change nameservers or apex records for this subdomain rollout.
4. Return to Vercel and wait until every hostname is marked configured/verified and its HTTPS certificate is active. Do not treat a DNS lookup alone as proof that TLS is ready.
5. Keep `userbehavior.envtools.store` on a separately protected Vercel project/deployment if using Vercel Deployment Protection. Project-wide protection on the shared public project would also block the public Android, iOS, feedback and updates hosts. The application dashboard password/cookie is an additional control, not a reason to publish the analytics endpoint without reviewing the access boundary.
6. Use separate production and preview credentials. Never put server credentials in `VITE_*`, source control, mobile binaries or browser storage.

## Application release gates

All switches remain disabled in `.env.example`; do not flip them simply to make a page appear live.

- **Feedback intake:** configure `FEEDBACK_ENABLED=true`, a random `FEEDBACK_HASH_SECRET` of at least 32 characters, and `VITE_FEEDBACK_ENABLED=true` only after the production database migration, consent notice, abuse controls and inbox access are verified. `FEEDBACK_ADMIN_TOKEN` is server-only if bearer administration is used.
- **Developer workspace:** configure `DEVELOPER_ADMIN_ENABLED=true`, a unique `DEVELOPER_ADMIN_PASSWORD` of at least 24 characters, `DEVELOPER_ADMIN_COOKIE_SECRET` of at least 32 characters, and `VITE_DEVELOPER_ADMIN_ENABLED=true` only after the private workspace and login throttling are tested.
- **Updates feed:** configure `UPDATES_ENABLED=true` and `VITE_UPDATES_ENABLED=true` only after the publishing workflow, stable/preview policy and first reviewed announcement are ready. `UPDATES_ADMIN_TOKEN` is server-only if bearer administration is used.
- **Analytics dashboard:** configure `ANALYTICS_ENABLED=true`, `ANALYTICS_HASH_SECRET` (32+ characters), `ANALYTICS_DASHBOARD_ENABLED=true`, `ANALYTICS_DASHBOARD_PASSWORD` (24+ characters), `ANALYTICS_DASHBOARD_COOKIE_SECRET` (32+ characters), and `VITE_ANALYTICS_DASHBOARD_ENABLED=true` only after consent withdrawal/deletion, privacy notice, database migration, retention and host access review have passed. Dashboard cookies are backed by HMAC-digested rows in `product_analytics_dashboard_sessions`; summary requests check the active row and sign-out revokes it. `ANALYTICS_ADMIN_TOKEN` is optional for trusted server-to-server reporting; `CRON_SECRET` remains server-only and is required by the daily retention cron.
- **Analytics collection:** `VITE_ANALYTICS_ENABLED=true` enables only the Web consent client. Android native collection requires `-PenvAnalyticsEnabled=true` on its intended Gradle release build; iOS native collection requires `ENV_ANALYTICS_ENABLED=YES` on its intended Xcode build. All platform collection flags default off and must remain off until the opt-in, withdrawal, privacy and store-disclosure gates are complete.

Run `npm run db:migrate` as an explicit, reviewed release operation against the intended production PostgreSQL database; never run it as part of a Vercel build. Verify the target database and a restorable backup first. The analytics release requires migrations `0008_product_analytics.sql`, `0009_product_feedback.sql`, `0012_analytics_dashboard_security.sql`, `0013_analytics_daily_snapshots.sql`, `0016_analytics_feedback_rls.sql`, `0017_analytics_daily_reports.sql` and `0018_analytics_dashboard_sessions.sql` to be applied before enabling dashboard sessions or retention.

## Live verification

After Vercel reports all five domains configured and HTTPS is active, run the manual GitHub Actions workflow **enV subdomain live smoke**. It verifies unique landing-page content on the four public hosts and checks that the private analytics host does not expose its summary endpoint without authentication.

Also manually verify on Android and iOS devices that Web-only tool handoff opens the intended host in the system browser/Custom Tabs, that native tools remain in the native application, and that feedback/update links remain on their respective domains.

## Launch is complete only when

- All five production hostnames are attached to their intended Vercel deployment(s), DNS records are verified, and HTTPS works without an unexpected redirect.
- Public routes render the correct product page on first load and after client-side hydration/navigation.
- The private analytics dashboard cannot be reached without the approved developer access controls.
- Feature flags are enabled only for services whose server configuration, database, content and privacy gates have actually passed.
- Android/iOS handoff, root links, `/admin`, sign-in, sign-out, query strings and deep tool links have been tested against production.
