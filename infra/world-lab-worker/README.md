# enV World Lab optional science worker deployment

This is a standalone deployment template; **it is not an active service**.
The existing root `render.yaml` remains unchanged. Creating a Render worker
may incur charges; do not provision or enable it without explicit operator
approval and a reviewed service plan.

1. Ensure Better Auth, production PostgreSQL and the application API are
   functioning with real account sessions and same-origin request protection.
2. Run the repository's `npm run db:migrate` explicitly against the intended
   production database, audit migration 0009 and new 0010–0015, plus owner
   isolation. The worker refuses to start if migration 0015 is not recorded.
3. Deploy this Dockerfile as an internal/private worker with outbound database
   access only. Supply `DATABASE_URL` as a private secret and enable
   `WORLD_LAB_JOBS_ENABLED=true`, `VITE_AUTH_ENABLED=true` only after auditing.
4. Deploy the Web application with `WORLD_LAB_JOBS_ENABLED=true` on the Nitro
   API, and `VITE_WORLD_LAB_JOBS_ENABLED=true` at Web build time; the latter
   is an availability hint, never authorization. The API checks real sessions.
5. Validate with two independently owned users, malformed payload limits,
   9–12 switch truth tables, chemical/beam model domains, cancellation,
   retries, retention and cost monitoring. Check worker restarts after
   deployment and monitor schema/readiness failures.

**Do not set the feature flags to true until the real end-to-end acceptance
checks pass.** No account tokens, user sessions or provider credentials are
embedded in this Docker image. The native Android and iOS clients currently
lack a secure Better Auth API session bridge for this queue; they continue
running their supported solvers locally and exchanging portable projects.
