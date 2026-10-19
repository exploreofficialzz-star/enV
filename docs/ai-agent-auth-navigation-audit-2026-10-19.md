# enV AI Agent, authentication, and navigation audit — 2026-10-19

## Implemented

- Web footer now contains only the compact copyright/catalogue status row. Product, Resources and Legal links are available from the three-dot menu.
- Android and iOS mirror the compact footer and overflow destinations. Their account menus open hosted sign-in/create-account routes.
- The user-visible AI assistant labels become **AI Agent**. Web uses canonical `/agent`; `/assistant` remains for compatibility.
- Web has sign-in, sign-up, forgot-password, reset-password, and Better Auth API routes.
- Email/password authentication requires both client and server feature flags, verification/reset email delivery, and a configured Resend sender. Production auth fails closed without persistent Postgres, a server-only signing secret and canonical HTTPS origin.
- Dependency-free audit checks are included in `npm test`.

## Deployment requirements before enabling accounts

1. Set `VITE_AUTH_ENABLED=true` in the client build and server runtime.
2. Configure `BETTER_AUTH_URL` (canonical HTTPS origin), a high-entropy server-only `BETTER_AUTH_SECRET`, and durable `DATABASE_URL`.
3. Run `npm run db:migrate` deliberately against the target database.
4. Configure either a complete OIDC issuer/client/secret tuple and callback registration, or email/password flags plus `RESEND_API_KEY` and `AUTH_EMAIL_FROM` for a verified sender domain.
5. Validate email verification, login/logout/session expiry, password recovery and invalid/expired links, OIDC callbacks, origin/CSRF protections and account recovery in staging.

No production secrets or deployment control-plane credentials were present in the uploaded archive. Thus account screens are implemented, but production identity/email/database services cannot honestly be called connected until environment configuration is supplied and validated.

## AI Agent production gap

The current AI surface discovers tools and returns up to three catalogue-backed links. It does not autonomously invoke arbitrary tools. The app's tool engines span web React forms, native Kotlin/Swift, on-device/browser operations, and remote processors; they do not yet share a unified versioned agent execution protocol.

A Manus-class agent still requires a versioned `AgentTool` contract (schema, executor, permissions, risk class, idempotency and artifacts), a server-side planner/executor, per-user authorization, human confirmation for external or irreversible actions, step/time/token budgets, durable jobs/checkpoints, resumable tasks, artifact persistence, audit traces and sandboxed external connectors. These are runtime/security/backend capabilities, not a label change. The UI prompt now avoids claiming execution the app does not perform.

Billing remains fail-closed until payment/store adapters, receipt/webhook verification and usage metering are configured. Native auth currently launches the hosted web flow; native callback/session-return handling is a separate release requirement.

## Validation performed

Passed in this isolated working environment: `check-production.mjs` (10,000 tool IDs), `check-production-gating.mjs`, `check-agent-auth-navigation.mjs`, `check-support-center.mjs`, `check-native-ui-parity.mjs`, `check-native-ai.mjs`, `check-billing.mjs`, and `check-execution-policy.mjs`.

Full npm install/build/typecheck/lint/tests were blocked because the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). Android Gradle compile was blocked while resolving the Gradle distribution host; `xcodebuild` is not installed. The auth invariant check also requires a dev server unavailable without dependencies. Run full CI and platform builds in a provisioned network-enabled runner before release; these checks are not reported as passes.
