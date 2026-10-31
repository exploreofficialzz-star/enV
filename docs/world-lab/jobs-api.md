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

## Off-device exhaustive digital invention checks (migration 0013)

Local Boolean evaluation and exhaustive checks through 8 inputs remain available
offline. Larger 9–12 input combinational networks have up to 4096 possible input
vectors; the worker now runs a deterministic, prevalidated graph evaluation
without re-parsing the project for each vector. Instead of storing 4096 verbose
JSON rows it returns losslessly recoverable, MSB-first output bit-plane hex plus
high-count totals, the declared input/output order, assumption and model labels.
This is a real exhaustive mathematical computation, NOT real electronics or an
unbounded binary processor emulator. It has no external calls or user code.
Accounts, job limits, cloud workers and migration 0013 must be deployed before
it is available to end users.

## Reopening cloud calculations after refresh

GET /api/world-lab/jobs returns at most the last 30 owner-scoped job summaries
(newest first). It never exposes stored project input_json and never transmits
large result_json in the list. The Web studio can inspect the list and explicitly
fetch one prior job's full evidence with the existing owner-gated GET /jobs/:id.
This is durable account-job retrieval, not implicit project synchronization;
inventions never silently replace local documents. A previous calculation
remains only as long as the backing database retains it.

## Hypothetical chemical sensitivity grids (migration 0014)

The worker can execute `chemical-sweep` with one explicit, validated 0D
Arrhenius/thermal assumption record. A deterministic 5×5 grid varies the
declared frequency factor and reaction heat independently by 0.5, 0.75,
1, 1.25, and 1.5. Each accepted numerical scenario returns final reactant,
product, temperature, peak temperature and energy residual summaries.
Unsupported assumption variants produce `outside-domain`/null fields, not
fabricated temperatures. The parent project is included for provenance and
no externally supplied executable code is allowed. The 25-case grid is
a mathematical sensitivity analysis, not uncertainty probabilities or
real chemical safety validation. The cloud choice requires consent.

## Retention and recovery bounds

Account science jobs retain their submitted portable project input and result
for up to approximately 30 days, then the dedicated worker removes expired
rows in bounded 200-item DELETE batches on startup and every six hours.
Actual expiry depends on the worker running; a stopped worker cannot perform
cleanup. Do not rely on this as a compliance retention guarantee without
hosted-worker monitoring. The GET history index omits inputs and outputs,
while explicit single-job retrieval remains owner-scoped. Job quota and
lease-token cancellation remain in place.
