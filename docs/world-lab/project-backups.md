# World Lab authenticated project backup contract

Status: source only, gated; migration not deployed or audited.

Backups are scoped to real Better Auth owners. Their portable project revision
is left unchanged; a separate monotonically increasing serverRevision is an
optimistic concurrency token. First backup requires expectedServerRevision=null.
Updates must match the most recent token or return a 409 conflict, never silently
replace another backup. At most 50 projects per owner and 900 KB per project.

POST /api/world-lab/projects: save an owned portable project.
GET /api/world-lab/projects: list owned project summaries.
GET /api/world-lab/projects/:id: retrieve a single owner's archived copy.

Enable WORLD_LAB_PROJECT_SYNC_ENABLED=true only after Postgres migration 0010
and authenticated ownership, CSRF, concurrency, privacy, and deployment tests.
Never auto-restore or replace an open local project. This is not live sync.

## Cloud version history and deletion (migration 0011 required)

Every accepted backup write appends an immutable per-owner snapshot with its server revision. The database transaction retains only the newest 20 versions per project (oldest snapshots are intentionally pruned). Migration 0011 backfills the **current** snapshot of older projects, not imaginary historical copies. GET /api/world-lab/projects/:id/versions returns metadata; GET /api/world-lab/projects/:id/versions/:revision returns an owner-checked snapshot, which Web downloads as portable JSON without replacing the open workspace. DELETE /api/world-lab/projects/:id requires a body with the exact current expectedServerRevision, validates the authenticated same-origin request, and deletes the cloud project and its snapshot history using foreign-key cascading. Browser UI requires explicit confirmation. Local device data is unaffected. The feature must remain disabled until migrations, account isolation and deployment behavior are validated.

## Explicit cloud-to-device copies

The Web studio can import a current or historical owner-scoped cloud version as
a *new* local IndexedDB project with a fresh UUID, then list it alongside
existing saved projects. Both the currently edited project and its run history
stay untouched. This is a user-requested transfer, not background live sync
or a silent cloud merge; numerical run records are not part of cloud project
backups. Requires explicit backup feature flags and migrations 0010–0011.


### Scientific evidence account backup (migration 0017)
Owner-scoped `POST /api/world-lab/projects/:id/evidence` accepts one validated
science record, `GET /api/world-lab/projects/:id/evidence` lists only metadata,
`GET /:id/evidence/:evidenceId` retrieves the full immutable document and
`DELETE /:id/evidence/:evidenceId` removes only that document. The evidence
must belong to an already backed-up authenticated invention and a project
revision no newer than the stored project backup. The 20-record/16 MB quotas
avoid unbounded account storage. These records are not cloud-worker jobs;
they persist until explicitly deleted or the parent project is deleted.
The user must opt in to upload via the Web interface.
