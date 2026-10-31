# enV ecosystem architecture

**Status:** Production-directed architecture baseline, 30 October 2026. A source change does not configure DNS, custom domains, secrets, app-store releases or native device verification.

## Product boundaries

- **Web:** independent routing, browser execution, consent UI, storage, accessibility and deployment.
- **Android:** independent Kotlin/Compose screens, navigation, permissions, persistence, background work and Android APIs.
- **iOS:** independent SwiftUI screens, navigation, permissions, persistence, background work, WidgetKit and App Intents where supported.

The products share versioned backend contracts and database records, not a WebView application shell.

## Domain responsibilities

| Host | Responsibility | Access boundary |
|---|---|---|
| `envtools.store` | Public Web application and shared API origin | Public |
| `android.envtools.store` | Allowlisted web-only tools opened from Android | System browser/Custom Tabs; never an app WebView |
| `ios.envtools.store` | Allowlisted web-only tools opened from iOS | System browser surface; never an app WebView |
| `feedback.envtools.store` | Developer feedback, issue reports and product communication | Public submission; private role-protected moderation |
| `updates.envtools.store` | Versioned product announcements and release notices | Public read feed; publishing is developer-only |
| `userbehavior.envtools.store` | Product usage analytics and internal reports | Private developer dashboard; admin authentication plus host protection |

The Android/iOS hosts are not alternative native apps. Native tools continue to execute natively; these subdomains are controlled handoff points for tools that lack a native engine.

## Deployment topology

The initial backend may share existing Vercel/Nitro and PostgreSQL infrastructure. Keep routes and authorization boundaries independent. Prefer separate Vercel projects for feedback, updates and the private analytics dashboard when their release cadence or access controls differ.

Before attaching any host, add it to its intended Vercel project, verify domain ownership, configure DNS using the exact records Vercel supplies, verify HTTPS and canonical redirects, confirm cookie scope, test unauthorized paths, and validate mobile handoff on real devices. Do not guess DNS records or expose preview deployments as production subdomains.

## Shared service contracts

| Service | Shared backend responsibility | Platform responsibility |
|---|---|---|
| Account/auth | Existing Better Auth contract | Native/Web sign-in UX remains independent |
| Analytics | Consent-gated metadata event API | Native consent and queue implementations still required |
| Feedback | Submission, status and moderation API | Separate native/Web forms |
| Updates | Versioned, platform-targeted release feed | Native/Web presentation and notification permissions |
| Community | Tool-scoped comments, reactions, reports and moderation | Separate native/Web UI |
| Tool catalogue | Stable tool IDs and capability metadata | Separate tool renderers and local engines |
| Token wallet | Server-authoritative integer-subunit ledger | StoreKit/Play Billing/Web purchase flows remain distinct |
| Offline execution | Capability declarations, signed authorization and idempotent sync | Local execution/persistence remains platform-native |

## First analytics tranche

This tranche introduces metadata-only event schema and APIs, explicit installation consent, event validation, request throttling, pseudonymous HMAC identifiers, aggregate summaries and a retention endpoint. It currently wires the Web consent control and tool-view event. Android and iOS still need native consent screens, queues and event instrumentation. The dashboard host still needs Vercel access protection.

## Updates and feedback

Feedback for developers is separate from public tool discussions. Community comments need their own reporting, moderation, block, rate-limit, deletion and public-anonymity rules. The updates feed should target platform (`web`, `android`, `ios`, `all`), release channel (`preview`, `stable`), app version, severity, publication time and expiry. Home notices should not interrupt critical tool workflows.

## Offline and tokens

The existing offline wallet schema is a foundation, not authorization to launch offline token spending. Preserve its production lock, device binding, allowance limits, pricing approval, replay protection, idempotency and unresolved-finalization safeguards until native integrity verification and recovery are independently implemented and reviewed. Tools may work offline without token billing only when their actual dependencies and local execution are available on that platform. A web-only tool is not automatically offline-capable.


## Developer feedback service — first backend slice

The feedback API is separate from tool-page community discussions:

- `POST /api/feedback` accepts public reports for Web, Android or iOS with a stable catalogue tool ID where applicable.
- Reports are bounded to 120-character titles and 4,000-character descriptions, use client idempotency keys, and are throttled to five submissions per pseudonymous reporter per hour.
- Anonymous abuse-control identifiers are keyed HMAC digests. Raw IP addresses, e-mail addresses and user-agent strings are not stored. Signed-in association is added only from a verified server session.
- `GET /api/feedback/admin` and `POST /api/feedback/admin/update` require the server-only developer bearer credential. Never ship this credential to a browser or mobile app; a private feedback dashboard must proxy its requests server-side and apply developer identity / deployment protection.
- Status changes are audited. Resolved/closed tickets are eligible for scheduled removal after the configured retention period; open work is not automatically deleted.

The backend is disabled by default. A public feedback form, native forms, private moderation dashboard, reply/contact workflow, attachments, and Vercel/DNS host attachment remain separate implementation/release tasks. Do not treat this API as the public social comment system.


## Tool-page community — first backend slice

The server-side community service is isolated from private developer feedback:

- `GET /api/community?toolId=...` returns public visible comments/replies, public counts and the current actor's reaction. It returns no account IDs or internal digests.
- `POST /api/community/comments` creates top-level comments or one-level replies. Users can choose a public display label or post as **Anonymous**; a public label is user-selected and is not identity verification.
- `POST /api/community/reactions` toggles one like/dislike per actor and tool. `POST /api/community/view` deduplicates a page view per pseudonymous actor per tool per day.
- `POST /api/community/reports`, `/api/community/blocks` and `/api/community/comments/delete` support reporting, blocking an author and removing one's own visible comment.
- `GET /api/community/admin` and `POST /api/community/admin/update` provide a bearer-protected developer moderation queue and audited actions.

Comment text is plain text and bounded; rendering clients must always render it as text, never inject it as HTML. Community actor IDs are pseudonymous HMAC digests for safety controls. They are not exposed publicly. The feature remains disabled until `COMMUNITY_ENABLED`, `COMMUNITY_HASH_SECRET` and the separate admin credential are configured. Public Web/native UI, privacy controls, moderation dashboard/host, anti-abuse monitoring and real platform testing are still required before launch.

The Web product now has a dedicated `/feedback` page. The public build flag `VITE_FEEDBACK_ENABLED` controls the form only; the backend remains independently gated by `FEEDBACK_ENABLED`. The form does not request an e-mail address, keeps an idempotency key for safe retry, and displays a ticket reference after accepted submission. A separate Vercel domain attachment and developer-facing dashboard are still needed for the planned `feedback.envtools.store` experience.


## Product updates and release announcements — first service slice

The release feed is a separate content service from analytics and community. Developers create drafts and publish/archive announcements through `POST /api/updates/admin`; `GET /api/updates/admin` returns the protected management list. Both require the server-only `UPDATES_ADMIN_TOKEN` and same-origin requests. Public clients read `GET /api/updates?platform=web|android|ios&channel=stable|preview|beta`. Published rows are filtered by platform, channel, start time and expiry, with optional minimum-version gating. All mutations are recorded in an audit table.

Web now has a dismissible, non-blocking home-page update banner and a `/updates` release-notes page. Public build visibility (`VITE_UPDATES_ENABLED`) is separate from server collection/serving (`UPDATES_ENABLED`). No announcement UI or notification may be enabled until a real admin workflow, update content, platform UI, deployment configuration and release channel policy are ready. Android/iOS home UI and the `updates.envtools.store` custom-domain attachment remain outstanding.


## Subdomain routing and private developer workspace

The Vercel deployment includes host-based rewrites for the five product domains. The Android and iOS roots resolve to dedicated handoff landing pages; existing `/tools/:category/:slug` routes remain available on their host, with native system-browser handoff updated to use `android.envtools.store` or `ios.envtools.store`. The feedback, updates and userbehavior roots resolve to their dedicated pages. The feedback and updates `/admin` paths resolve to the private developer workspace. These rewrites do not provision DNS, attach a domain to a Vercel project, or validate TLS: those actions must be completed in the Vercel/DNS account before the hostnames are live.

The private developer workspace is available at `/developer` and links the feedback inbox, community moderation queue and release-announcement manager. It uses a server-issued eight-hour signed HttpOnly cookie, a same-origin login/logout API and a database-backed failed-login throttle. Server bearer tokens are never sent to the client. Feature-specific services still require their own server-side configuration and remain independently gated. The private product analytics dashboard has its own separate session and configuration at `/userbehavior`.

## Native analytics and aggregate history

Android and iOS now include independent opt-in consent surfaces and metadata-only event queues. Android uses local app-private preferences and network capability classification; iOS stores the analytics subject key in Keychain and maintains a bounded local queue. Both call the same API directly over HTTPS, and opt-out takes effect locally immediately with server revocation retried when connectivity returns. Native build flags remain disabled by default. Daily aggregate snapshots are captured before raw event retention and retained for up to 730 days without subject or session identifiers; the private dashboard can display up to 365 days of aggregate trends.
