# A book — enV Toolkit Architecture

**Status:** Architecture baseline — implementation not yet merged  
**Tool ID:** a-book  
**Route slug:** a-book  
**Catalog category:** productivity  
**Display name:** A book  
**Platforms:** Web, Android, iOS  
**Architecture mode:** Online-first, local-capable, cloud-backed

## 1. Product boundary

A book is an enV Toolkit tool. It is not a separate product, account system, standalone application, or embedded web page inside the native apps.

It uses enV identity, account lifecycle, design system, API gateway, server-side authorization, database conventions, analytics consent and deployment infrastructure. It owns its note domain, editor, local persistence, synchronization protocol, attachment lifecycle and note-specific UI.

Each platform has an independent implementation:
- Web: React/TanStack application and browser storage APIs.
- Android: Kotlin/Jetpack Compose and Android platform services.
- iOS: SwiftUI and Apple platform services.

Shared contracts, document schemas, API payloads, catalog metadata and test fixtures are allowed. Cross-platform UI/runtime embedding is not.

## 2. Online-first and local-capable operating model

Online-first describes the normal service and account model: enV cloud APIs are available by default, the cloud owns account-wide authorization and durable records, and a connected client synchronizes promptly. It does not mean every keystroke must wait for a network response.

The client must commit user edits to its local durable database first, update the interface immediately, and enqueue an idempotent mutation. When online, the sync worker pushes that mutation promptly and confirms the server version. When offline, the client continues to support all locally executable features and retains the outbox across app restarts.

Authority boundaries:
- Local database: immediate UI read model and durable working copy for that device.
- enV API: authentication, authorization, validation, conflict checks, sharing rules and sync coordination.
- Cloud PostgreSQL: canonical account-wide metadata, document versions, tombstones and sync change log.
- Private object store: canonical attachment bytes.
- Backup systems: independent recovery copies for database and attachment storage.

Sync is not backup. A deletion or corrupt edit that synchronizes must not erase the only recoverable historical copy. Retain revisions and tombstones, maintain independent database and object-storage backups, and test restoration.

Never silently use last-write-wins for the body of a note. Use optimistic version checks. If a device submits an edit against a stale base version, preserve both versions as a conflict copy or invoke a documented block-level merge. The user must be able to inspect and recover either version.

## 3. High-level topology

Platform client
  - Native/responsive UI
  - Editor adapter
  - Local database and attachment cache
  - Search index
  - Durable outbox and sync cursor
  - Platform capture and notification adapters
        |
        | HTTPS authenticated API; idempotent mutations
        v
enV A book API
  - session verification and owner scoping
  - request/schema validation and rate limits
  - notebook/note/tag/revision services
  - sync push/pull and cursor validation
  - private attachment upload/download authorization
  - sharing/collaboration authorization (later phase)
        |
        +---- enV PostgreSQL
        |       notes, notebooks, tags, revisions,
        |       devices, mutation receipts, sync events
        |
        +---- Private object-storage adapter
        |       attachment originals and derived previews
        |
        +---- Backup and restore pipeline
                database backups + object-store recovery

All client traffic uses HTTPS. Database URLs, database credentials, signing secrets and object-store write credentials remain server-side. Native and browser clients never connect directly to PostgreSQL.

## 4. Platform implementation

### 4.1 Web

- React/TanStack route at /tools/productivity/a-book.
- IndexedDB for notebooks, notes, tags, revision metadata, sync outbox, cursors and attachment metadata.
- OPFS for large local binary caches and temporary import/export working files. Keep IndexedDB as the transactional metadata store.
- Request persistent browser storage when supported. Detect quota failures and display a clear storage warning; browser storage can be evicted or cleared by users and browsers.
- Service worker/PWA caches the application shell and versioned static assets. Do not treat a service-worker cache as a backup for private note data.
- Use Tiptap/ProseMirror as the web editor adapter, with a pinned and license-audited extension set.
- Use Web Crypto for cryptographic primitives where needed; never invent or claim end-to-end encryption without a complete key-management and recovery design.
- Import/export should use streaming or chunked processing for large files and must not load an unbounded archive into memory.

### 4.2 Android

- Native Kotlin/Jetpack Compose screens and editor; no WebView.
- Room/SQLite as the durable local store, with explicit schema migrations.
- App-private files for attachment cache and temporary documents.
- Android Keystore for device-protected secrets.
- WorkManager for durable, constraint-aware synchronization that survives process death and device restart.
- Sharesheet intent handling and document/camera pickers for capture/import.
- Home-screen widget and Quick Settings tile are platform-specific enhancements, not dependencies for core note creation.
- Respect runtime permissions and Android background execution rules; a denied permission must not break typed notes.

### 4.3 iOS

- Native SwiftUI screens and editor; no WebView.
- The current project deployment target is iOS 16.4. Do not make SwiftData (iOS 17+) a Phase 1 dependency unless the minimum supported OS is deliberately raised. Use Core Data or SQLite behind a repository interface.
- App-private files for attachment cache; Keychain for device secrets.
- App Groups for data intentionally shared with an approved Share Extension or widget.
- App Intents/Shortcuts and Share Extension for quick capture.
- WidgetKit for lightweight capture and recent-note entry points.
- Background URLSession/BGTaskScheduler for opportunistic sync; foreground sync must remain available because iOS does not guarantee arbitrary background execution.
- Request Photos, Camera, Microphone or file permissions only when the corresponding function is invoked.

## 5. Shared document contract

Define a versioned, platform-neutral document AST named env.abook.document.v1. Store structured JSON, not platform-rendered HTML. The schema must specify:
- Document schema version and stable document ID.
- Stable block IDs and deterministic ordering.
- Supported block types: paragraph, heading, bulleted/numbered list, checklist, quote, callout, code block, table, divider, image, file attachment and link.
- Text marks: bold, italic, underline, strike, highlight, inline code and hyperlink.
- Block attributes with validated types and size limits.
- Attachment references by stable attachment ID, never by a public storage URL.
- Unknown block preservation: older clients must retain unknown data when possible and display a safe unsupported-block placeholder rather than delete content.

The web editor maps this contract to/from ProseMirror JSON. Android and iOS implement native editing/rendering adapters over the same versioned AST. Markdown is an import/export format, not the canonical storage format. HTML is a sanitized import/export format, not the canonical storage format.

Schema changes require versioned migrations and cross-platform fixtures. Do not ship a new block type until Web, Android and iOS can safely round-trip it or the catalog clearly gates that capability by platform.

## 6. Functional domains

### Phase 1 — Core notes and reliable data
- Create, edit, rename, duplicate, pin, archive, restore and delete notes.
- Plain text and rich text with headings, lists, checklists, quotes, links, code blocks and tables.
- Notebooks, nested folders, tags, favorites, Inbox and saved views.
- Quick capture with automatic draft persistence.
- Search titles and full text; filter by notebook, tag, updated date and status.
- Attach images and common documents with a private file lifecycle.
- Offline read/create/edit of downloaded notes; durable outbox and background/foreground sync.
- Version snapshots, trash/tombstones, restore and conflict copies.
- Markdown, TXT, JSON and full-workspace export/import.
- Responsive Web, native Android and native iOS navigation.
- Accessible keyboard/screen-reader behavior and RTL-safe document rendering.

### Phase 2 — Capture and study
- Audio recording and playback with optional transcription integration.
- Image scanning and OCR.
- PDF reader, highlights, comments and annotation export.
- Handwriting and drawing with platform-native stylus support.
- Reminders, daily notes and calendar entry points.
- Widgets, browser clipper and expanded quick-capture integrations.

### Phase 3 — Knowledge and collaboration
- Backlinks, related notes, graph view and block references.
- Whiteboard, mind maps and visual boards.
- Sharing, invitations, comments, workspace roles and live collaboration.
- Shared editing must use a deliberately selected CRDT/OT design and a tested native interoperability strategy. Do not introduce web-only Yjs collaboration and claim cross-platform parity before native support is proven.

### Phase 4 — Optional intelligence and automation
- Optional summaries, rewriting, translation, task extraction, flashcards and semantic search.
- External AI provider connections only with explicit user consent, clear data scopes and privacy controls.
- AI must never be required for core writing, capture, search or export.

## 7. Data model and PostgreSQL migration

Add a new ordered migration, expected filename 0018_a_book.sql after confirming the current migration head immediately before implementation.

All ownership columns use TEXT and reference the existing Better Auth user ID format. The repository's development identity can be the string dev-user; do not use UUID for user_id.

Proposed tables:

### abook_notebooks
- id UUID primary key
- owner_user_id TEXT NOT NULL references public."user"(id)
- parent_id UUID nullable
- title, icon, color, sort_order
- archived_at, created_at, updated_at
- unique owner-scoped constraints and indexes

### abook_notes
- id UUID primary key
- owner_user_id TEXT NOT NULL references public."user"(id)
- notebook_id UUID nullable
- title TEXT
- schema_version INTEGER NOT NULL
- content_json JSONB NOT NULL
- plain_text TEXT NOT NULL for indexing and previews
- excerpt TEXT
- version BIGINT NOT NULL
- pinned_at, archived_at, deleted_at
- created_at, updated_at
- owner-scoped notebook and update indexes

### abook_tags and abook_note_tags
- owner-scoped tag names and normalized lookup keys
- many-to-many relationship with uniqueness constraints
- no cross-owner joins

### abook_note_revisions
- immutable note snapshot or content JSON per committed revision
- note_id, owner_user_id, version, content hash, revision source and created_at
- unique (note_id, version)
- retain enough history to recover accidental edits; define retention policy before release

### abook_attachments
- stable attachment ID, owner_user_id, note_id
- opaque private object key, original filename, detected MIME, byte size, checksum
- upload state, encryption metadata, dimensions/duration when appropriate
- never expose a public object URL

### abook_devices
- user-owned device ID, platform, app version, last_seen_at, sync cursor and revocation timestamp
- opaque device identifier; no unnecessary device fingerprinting

### abook_mutation_receipts and abook_sync_events
- idempotency key unique per owner/device
- mutation ID, server sequence/cursor, entity ID, entity version, operation type and timestamp
- tombstones for deletions
- cursor pagination and bounded payload sizes

Indexes:
- (owner_user_id, updated_at DESC)
- (owner_user_id, notebook_id, updated_at DESC)
- owner-scoped title lookup
- GIN full-text search index over normalized plain_text/title
- all relationship foreign keys indexed

Enable row-level security on every A book table, following enV's existing database security convention. Keep all reads/writes behind authenticated server routes and enforce owner_user_id in every query. Never trust an owner ID supplied by a client. Add foreign keys and composite constraints that prevent attaching a note or tag from another owner.

## 8. API contracts

Use the existing enV server/API boundary. Suggested route family:

- GET /api/a-book/bootstrap — current user notebooks, tags, recent notes and sync metadata.
- GET /api/a-book/notes — paginated, filtered list.
- POST /api/a-book/notes — create note.
- GET /api/a-book/notes/:id — fetch note and version metadata.
- PATCH /api/a-book/notes/:id — optimistic update with baseVersion.
- DELETE /api/a-book/notes/:id — soft delete/tombstone.
- POST /api/a-book/sync/push — idempotent batch of local mutations.
- GET /api/a-book/sync/pull?cursor=... — ordered changes and tombstones.
- GET /api/a-book/notes/:id/revisions — revision list.
- POST /api/a-book/notes/:id/restore — restore a revision.
- POST /api/a-book/attachments/upload-token — authorize a private upload.
- POST /api/a-book/attachments/complete — verify upload, size, MIME and checksum.
- GET /api/a-book/attachments/:id/download — authorize private attachment retrieval.
- POST /api/a-book/import/validate and POST /api/a-book/import/commit — staged import.
- POST /api/a-book/export — user-scoped export job or streamed export.

Every write validates authentication, owner access, payload schema, size limits, content type, rate limits and idempotency. Every list uses cursor pagination. Return stable error codes for unauthorized, forbidden, version conflict, storage quota, invalid document schema, oversized file, unsupported type and transient service failure.

Sync push payloads include device ID, mutation ID, idempotency key, entity ID, mutation type, base version, schema version and operation payload. A repeated idempotency key must return the original outcome, not create a duplicate note or revision. Pull responses include a next cursor and tombstones. Validate cursor ownership and reject malformed or excessively large batches.

Use authMiddleware/requireUserId and existing same-origin protections where appropriate. Use server-side parameterized SQL through the existing DB abstraction. Never put service-role, database or blob-write secrets into VITE_ variables or mobile build configuration.

## 9. Sync algorithm

1. Commit a local transaction containing the note change and outbox mutation.
2. Update the local UI immediately and show "Saved on this device" while the mutation is pending.
3. When online, submit a bounded batch with an idempotency key and the known base version.
4. Server validates the session, user ownership, schema and base version.
5. Server stores the accepted update, creates a revision/change event, increments the server version and returns the canonical record/version.
6. Client marks the mutation acknowledged and advances its durable cursor.
7. Pull subsequent server changes, apply them transactionally and preserve tombstones.
8. On conflict, preserve local and server versions; create a visible conflict copy or perform an explicitly tested block-aware merge.
9. Retry transient errors with exponential backoff and jitter. Do not retry permanent validation/permission errors indefinitely.
10. If a device is revoked, prevent further sync and retain user data locally until the user signs out or chooses to remove it.

Never clear the outbox before server acknowledgement. Never advance a cursor before the corresponding local changes commit. Sync must survive app termination, network changes, token expiry and duplicate requests.

## 10. Attachments and cloud backup

### Provider decision

**Primary attachment/object storage: Cloudflare R2 (private bucket, S3-compatible API).** This is the selected provider for A book's first production implementation, subject to account provisioning and a live integration test. Do not use Vercel Blob as the default A book attachment store.

Reasons:
- R2 implements an S3-compatible API, so the existing enV server can use standard AWS S3 SDK tooling and keep provider access behind one adapter.
- R2 buckets are private by default; public access requires an explicit enablement.
- R2 supports short-lived presigned GET/PUT/HEAD/DELETE URLs, allowing Web, Android and iOS to upload/download bytes directly without receiving storage credentials.
- R2 Standard currently has no internet egress charge and includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations monthly. Current published Standard storage price is $0.015/GB-month; operation charges apply beyond included amounts. Recheck pricing before launch.
- This suits a notes product with potentially frequent reads and large PDFs/audio attachments better than routing every private download through application functions.

Vercel Private Blob remains a possible alternative for smaller private assets, but private delivery runs through Vercel Functions; Vercel currently advises against serving files above 100 MB through private Blob unless traffic is low. A book's long-term audio/document workload makes R2 the preferred default.

### Bucket and environment layout

Provision distinct private buckets:
- `env-abook-dev` for development.
- `env-abook-preview` for preview/staging.
- `env-abook-prod` for production.

Do not enable R2 public bucket access or attach a public custom domain to these private user-content buckets. Configure exact-origin CORS for the approved enV Web production and preview origins, allowing only required methods and headers. Native clients use signed URLs and do not need browser CORS.

Required server-only environment configuration:
- `ABOOK_OBJECT_STORE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
- Optional region value `auto`

Use separate restricted credentials per environment. Credentials must never be prefixed with `VITE_`, included in Android BuildConfig, embedded in iOS bundles, returned by APIs or logged. Restrict the production token to the required bucket/object permissions.

### Object key contract

The server generates opaque keys; clients never choose arbitrary object paths:
`abook/v1/<opaque-owner-scope>/<attachment-id>/<random-object-version>`

Do not include email addresses, filenames, note titles or other personal data in object keys. Persist the object key, owner, note, declared/detected MIME, size, checksum, lifecycle state and object version in `abook_attachments`.

### Upload and download flow

1. Client requests upload authorization for a note and attachment metadata.
2. Server authenticates the enV session, verifies note ownership, validates quotas, file count, permitted file type and maximum size, then generates a random attachment ID and opaque object key.
3. Server returns a short-lived presigned PUT URL scoped to that exact object and operation. Use a short expiry (normally 5–15 minutes), required content-type/checksum headers and a single-use application upload intent.
4. Client uploads bytes directly to R2. Large files use S3 multipart upload with bounded part sizes/concurrency and resumable part retries; small files use a single PUT.
5. Client calls the completion endpoint. Server performs HEAD/object metadata validation and verifies size, checksum, content type and that the pending upload intent belongs to the authenticated user.
6. Only after successful verification does the server mark the attachment available and link it to the note.
7. For downloads, server re-checks owner/share permission and returns a short-lived presigned GET URL. Treat that URL as a bearer credential; do not place it in analytics, logs or long-lived note records.
8. For deletion, first tombstone the database record and preserve references needed by retained note revisions. Garbage-collect the object only after the recovery/retention window and after confirming no retained revision references it.

Presigned URLs expire and are not user identities. Anyone possessing one can perform its scoped operation until expiry. Browser CORS must be configured for the exact enV origins and request headers; CORS is not authorization. Cloudflare documents presigned URL support for PUT/GET/HEAD/DELETE and multipart uploads for large/resumable files.

Reject executable/untrusted content; enforce per-account quotas; normalize filenames for display only; inspect actual file signatures rather than trusting extensions or the client's MIME claim. Apply malware/content scanning where available and treat imported office/PDF content as untrusted.

### Backup and disaster recovery

- PostgreSQL: use the configured production provider's automated backups and point-in-time recovery, with documented retention and recovery objectives. Do not treat Neon replication/HA as backup.
- R2 attachments: implement copy-based backup replication to a separate backup destination with separate credentials and access policies. Prefer a separately controlled cloud account/provider to reduce correlated account-loss risk; do not count another prefix in the same bucket as an independent backup.
- Keep immutable note revisions and deletion tombstones in PostgreSQL.
- Preserve the attachment-to-note manifest, object checksums and restore order so metadata and bytes can be reconciled.
- Test restores of a single note, its attachments, a whole user's library and a full environment.
- Schedule restore drills and record measured recovery point and recovery time.
- Provide user-initiated full export so users retain portability independent of enV account continuity.

Local device cache is not a cloud backup. Sync is not a backup. R2 storage by itself is not a backup. A separate backup copy and tested restore process are required.

## 11. Search, privacy and security

Phase 1 search:
- Client-side local full-text index over notes available on the device.
- Server-side indexed search over authorized cloud notes.
- Search title, body, tags, notebook and supported extracted text.
- Index incrementally on create/update/import/delete.
- Search must not repeatedly scan every note on each query.
- OCR, handwriting and transcript indexing enter only when those processors exist.

Privacy:
- TLS in transit and private encrypted-at-rest storage.
- Device secrets in Keychain/Keystore; browser cryptographic keys use Web Crypto with a documented recovery model.
- No note content in analytics, logs, crash traces or URLs.
- Redact content from server logs and error reports.
- Explicit consent for optional transcription or AI processing.
- Clear account export/deletion behavior.
- Do not advertise end-to-end encryption until keys, multi-device pairing, recovery, sharing and server-side search implications have been solved and audited.

## 12. enV repository integration map

- src/data/catalog.ts — add A book catalog record (id a-book, slug a-book, category productivity, display name A book).
- src/lib/registry.ts — verify custom route discovery and aliases only if needed; do not duplicate catalog records.
- src/components/tools/tool-engine.tsx — dispatch A book to the Web ABook engine.
- src/routes/tools/$category/$slug.tsx — existing generic tool route should host the entry.
- src/components/engines/a-book/ — proposed Web UI/editor modules.
- src/lib/a-book/ — document schema, validation, local repository, search and sync client.
- server/routes/api/a-book/ — authenticated API routes.
- migrations/0018_a_book.sql — schema, indexes, RLS and constraints after checking actual migration head.
- apps/shared/catalog.json — regenerate using scripts/export-native-catalog.mjs; never hand-edit generated output.
- apps/android/.../ — Kotlin/Compose UI, Room database, sync worker, share and widget integrations.
- apps/ios/enV/ — SwiftUI UI, Core Data/SQLite repository, App Intents and Share Extension integration.
- apps/android/native-tool-coverage.txt and apps/ios/native-tool-coverage.txt — list a-book only when the corresponding native route is actually implemented and tested.
- tests/ — schema round-trip fixtures, sync protocol tests, migration tests, route authorization tests, import/export tests and cross-platform document fixtures.
- .github/workflows/ — add appropriate web, Android and iOS CI coverage without claiming simulator tests as real-device verification.

The generic tool route must not be used as an excuse to embed the web application in Android or iOS.

## 13. Testing and release gates

### Data integrity
- Create/edit/rename/delete/restore and reopen after process restart.
- Offline create/edit, reconnect and verify exact content on another device.
- Duplicate request and duplicate batch are idempotent.
- Concurrent edits from two devices do not silently lose content.
- Stale baseVersion returns a conflict and both versions remain recoverable.
- Deletion tombstone syncs and restore behaves correctly.
- Corrupt or unsupported schema is rejected without overwriting the last good note.
- Attachment upload interrupted/retried and checksum verified.
- Storage quota exceeded presents a recoverable message.

### Search and scale
- Search while editing and after reindex.
- Test 10,000+ notes, large documents, many tags and attachment metadata.
- Pagination and search filters never leak other users' notes.
- Index rebuild and incremental index paths produce equivalent results.

### Security
- Unauthenticated requests rejected.
- User A cannot read, mutate, delete, export or download User B's note/attachment.
- Forged owner IDs ignored.
- Revoked sessions/devices cannot sync.
- Expired upload authorization rejected.
- Private object URL cannot be used by an unauthorized user.
- Rate limits and request-size limits enforced.
- No credentials or note content in client bundles/logs.

### Platform
- Web browser storage quota/eviction and cleared-site-data recovery messaging.
- Android process death, WorkManager restart, Doze/network constraints and low storage.
- iOS foreground recovery, background execution limits, share extension and app-group correctness.
- Keyboard, screen-reader, dynamic type, RTL and small-screen usability.
- Separate web build/typecheck/tests, Android unit/instrumentation tests and iOS XCTest/UI tests.
- Real devices required before declaring camera, microphone, widget, background and stylus behavior production-ready.

### Release criteria
Do not mark the tool active or production-ready until all three platform entry points work, all core mutations are backed by persistence, sync/recovery/security tests pass, attachment storage is provisioned, migrations are applied, and production smoke tests confirm real cloud behavior. A passing catalog check alone is not feature verification.

## 14. Readiness blockers to resolve before implementation

1. Confirm the current production database provider and verify migrations are applied through the current head.
2. Select/provision private object storage and configure its server-only credentials.
3. Confirm Vercel/production routing and payload constraints for authenticated A book endpoints.
4. Decide Phase 1 supported attachment types and size quotas.
5. Decide the exact document AST schema and audit all editor extension licenses.
6. Check browser storage persistence behavior and design a user-visible recovery/export warning.
7. Add Room/SQLite and Core Data/SQLite persistence with migrations.
8. Verify native catalog dispatch and route behavior on both mobile platforms.
9. Define revision retention, deleted-note retention, backup retention and restore objectives.
10. Add the complete test suite and run it on actual supported platform environments.

## 15. Non-goals for Phase 1

- No separate A book login/account.
- No WebView-based native implementation.
- No server-only editing that makes offline drafts impossible.
- No localStorage as the primary notes database.
- No public attachment URLs.
- No silent last-write-wins note body overwrites.
- No mandatory AI or hosted model.
- No claim of end-to-end encryption without a real audited protocol.
- No live collaboration until cross-platform merge semantics are selected and tested.
- No catalog status of active merely because a route or card exists.

---

## Architecture decision summary

A book is an enV-owned, independently implemented Web/Android/iOS tool. It is online-first for account, cloud authority and synchronization, but local-capable for low-latency editing, search, capture and supported media operations. Every edit is durably stored on the device and queued; the cloud receives it promptly when online. PostgreSQL owns canonical metadata and revision history, Cloudflare R2 private storage owns attachment bytes, and an independent backup destination plus tested restores provide recovery. The shared document AST and API contracts keep the three implementations interoperable without sharing their user interfaces.

**Implementation status:** This document establishes the architecture baseline only. It does not represent an implemented editor, database migration, object store, sync service, or production deployment.
