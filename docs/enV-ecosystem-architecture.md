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
