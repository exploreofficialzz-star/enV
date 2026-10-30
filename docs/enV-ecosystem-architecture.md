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
