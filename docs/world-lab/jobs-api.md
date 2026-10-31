# World Lab account-owned scientific jobs

Status: SOURCE IMPLEMENTED, DISABLED AND UNDEPLOYED. Not a production acceptance claim.

Requires migration 0009, configured Better Auth, PostgreSQL and a private worker.
Set WORLD_LAB_JOBS_ENABLED=true only after the final security and deployment audit.

- POST /api/world-lab/jobs: user-authenticated, same-origin JSON <=64 KiB,
  mandatory Idempotency-Key (8–120 safe characters), bounded scientific inputs,
  returns 202 and an opaque job ID.
- GET /api/world-lab/jobs/:id: only owner can read status, scientific result and
  sanitized error. Other user identifiers are returned as not found.
- POST /api/world-lab/jobs/:id/cancel: same-origin owner-only cancellation.
  Worker lease-token completion cannot overwrite a cancelled job.
- npm run world-lab:worker: dedicated private worker process.
  npm run world-lab:worker:once: claims at most one job.

Per-owner limits: 3 active jobs, 30 submitted in an hour, 60-KiB input, 2-MiB
result, 3 attempts, 90-second lease recovery. Submission uses SQL user-row lock
to serialize quota enforcement across servers. User uploads contain no executable
scripts, arbitrary DLLs or unsupported solver inputs.

Still required: independently verify SQL migration and RLS, real sessions, parallel
enqueues, cancellation during execution, retries/lease expiry, worker hosting,
cost and quota calibration, retention, streaming and solver scientific validation.
Do not enable this code in production solely because compilation succeeds.

Supported hypothetical `chemical-thermal` operations include a fully specified
`chemicalInput` record of bounded Arrhenius reaction-rate, enthalpy, initial
reactant, thermal capacity, ambient cooling and external heating fields.
No chemical name, measured reactivity, complex mechanism or user-executable
code is inferred. This migration/worker expansion remains disabled and unverified.

## 3D multiple hard-sphere job (migration 0012)

The authenticated queue also accepts `kind="multi-sphere"`, a strictly parsed portable project containing 2–12 non-overlapping spheres with assumed densities, a map of entity IDs to finite X/Y/Z velocities no faster than 100 m/s, restitution 0–1, and simulation duration 0.01–5 s. The worker executes the same bounded event-driven Web reference solver and returns the complete impulse, conservation, evidence, and time-of-contact record. Disjoint simultaneous impacts are supported; shared-sphere simultaneous contacts remain unsupported rather than guessed. The Web queue surface can submit the open group assumptions, poll, cancel, and export resulting immutable evidence. This is not a generic remote physics service or an FMI plugin. Migration 0012 extends the database job-kind constraint, and workers plus feature flags must remain disabled until authenticated deployment is audited.
