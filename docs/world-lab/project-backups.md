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
