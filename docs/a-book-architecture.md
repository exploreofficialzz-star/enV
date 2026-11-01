# A book — enV Toolkit Architecture

**Status:** Cross-platform implementation in progress — not production-ready or merged  
**Tool ID:** a-book  
**Route slug:** a-book  
**Catalog category:** productivity  
**Display name:** A book  
**Platforms:** Web, Android, iOS  
**Architecture mode:** Local-only user content; no cloud storage or sync

## 0. Verified implementation snapshot — 2026-11-01

This section records code that exists in the current implementation branch. It is not a release certification. The native and Web CI pipelines, device tests, accessibility checks and privacy verification must pass before the tool can be called production-ready.

| Platform | Implemented in the branch | Not yet implemented or not yet verified |
|---|---|---|
| Web | React tool route; IndexedDB notes, attachments and revision stores; local autosave, search/filter, pin/archive/trash/restore, revision restore; local backup export/import; PDF.js local page rendering, page navigation/zoom, per-page selectable text and local extracted-text search/batch `.txt` ZIP export; local PDF inspect, rotate, page extraction, merge, split, and multi-file batch rotate/extract/split using pdf-lib/fflate. | OPFS storage, verified offline PWA startup, rich-text AST editor, scanned-PDF OCR, PDF annotations and library-wide indexed PDF search are not currently implemented. |
| Android | Native Kotlin/Jetpack Compose screen; SQLiteOpenHelper persistence, app-private attachment files, note/revision/trash/restore, local ZIP backup/restore; PDFBox text extraction, rotation, merge, split, and multi-file batch rotation/extract/split; bundled ML Kit Latin-script OCR (up to 100 pages per operation); cancellable coroutine-backed PDF tasks with note/attachment switching and disposal cancellation. The A Book database, SQLite WAL/SHM/journal sidecars and attachment directory are excluded from cloud backup and device transfer. | The store is SQLiteOpenHelper rather than Room and still needs stronger migration/persistence tests. Rich-text parity, PDF annotation and production real-device coverage are not currently implemented or verified. |
| iOS | Native SwiftUI screen; Core Data/SQLite persistence, app-support attachment files, note/revision/trash/restore, local ZIP backup/restore; PDFKit text extraction/rotation/merge/split, and multi-file batch rotation/extract/split plus Vision on-device OCR. The A Book Application Support directory is excluded from OS backup. | Rich-text parity, PDF annotation, broader document editing and production real-device coverage are not currently implemented or verified. |

**Data boundary:** notes, attachments, archives and processing remain local. No A book content API, hosted file store, cloud sync or cloud backup is part of this release.

**Important implementation details:**
- Web PDF inspection, extraction, batch extraction, splitting, batch splitting, rotation and merging execute in a dedicated same-origin module Web Worker. Worker requests have a bounded execution deadline, explicit error handling, cancellation and termination. Node tests use the same operation functions through a direct local fallback; a browser without Web Workers fails closed rather than blocking the UI thread.
- Web local PDF text extraction uses pinned `pdfjs-dist` 6.4.299 and its same-origin PDF.js worker. Each PDF is bounded to 200 MB, 250 pages, 150,000 extracted characters and a two-minute processing deadline; text batches are bounded to 25 files, 300 MB and 5,000 source pages (counting full source page counts) and are processed sequentially. Blank or scanned image-only pages return no fabricated selectable text; Web OCR is not enabled.
- The reader/viewer use PDF.js's bundled `legacy/build` ESM entry and matching worker to include runtime compatibility helpers where `Promise.try` is unavailable; no global Promise shim is installed.
- The Web PDF reader renders one page at a time to a local canvas, with previous/next navigation, zoom, per-page text display, a 45-second page-render deadline and a two-minute document-load deadline. Canvas backing memory is capped at 12 million pixels and each edge is kept within 8,192 pixels; pure scale calculations have regression tests.
- The Web local database currently uses IndexedDB. OPFS is a planned enhancement, not a claimed dependency.
- Android currently uses a SQLiteOpenHelper-backed store. Do not describe it as Room until the migration is implemented and tested.
- Android A book PDF batch and single-document processing runs in cancellable Compose-scope jobs, uses the IO dispatcher, cancels when the note or active attachment changes or the screen leaves, and re-checks cancellation before publishing OCR results.
- The shared env.abook.archive.v1 ZIP format is used for portable local backup/restore. Import paths validate archive limits and remap imported IDs to avoid collisions.
- PDF capabilities differ by platform. A platform must not display an action as available unless its native/local implementation and tests support that action.
- The product catalogue/native execution matrix records platform availability; catalogue presence is not proof of runtime correctness.

**Release gate:** Web typecheck/tests/build, Android unit/lint/emulator build and launch, iOS simulator build/tests, backup interoperability, malformed-archive tests, local-only network inspection and accessibility verification must pass on the final PR head. The external Vercel build check is subject to the connected Vercel account's build quota and must be green or explicitly resolved before merging.

## 1. Product boundary

A book is an enV Toolkit tool. It is not a separate product, account system, cloud workspace or embedded web page inside the native apps.

It uses enV's product catalog, visual design language and platform shell. It owns its note domain, editor, local persistence, local search, document-processing engines, import/export and recovery behavior.

**Data boundary for the initial release: A book content stays on the user's device.** No A book notes, PDFs, images, audio, attachments, OCR text, search queries, filenames, document metadata or revision contents are uploaded to enV servers or third-party storage. No remote notes database, cloud file bucket, cloud sync, remote collaboration or cloud backup is part of this scope.

The three platforms are independently implemented:
- Web: React/TanStack UI and browser storage/processing APIs.
- Android: Kotlin/Jetpack Compose and Android storage/document APIs.
- iOS: SwiftUI and Apple storage/document APIs.

Shared document contracts, schemas and test fixtures are allowed. Cross-platform UI/runtime embedding is not.

The existing enV account may still be used by the surrounding enV platform for its ordinary account and catalog functions. A book's local note content must not depend on a login request or be sent through the account system. Signing out must not silently delete the local library.

## 2. Local-only operating model

For A book, local execution and local persistence are the product architecture—not a fallback mode.

- The editor saves changes to the device's durable local database.
- PDF rendering, text extraction, annotation, page operations, image processing, scanning and OCR run on the device using the platform's available local engines.
- Search indexes and filters are local.
- Attachments remain in app-managed device storage or a user-selected local folder.
- The user can export a library or selected notes to a local file/location they control.
- The product does not call a server to create, edit, search, render, annotate, import or export a note.
- No remote synchronization, cloud backup, cloud attachment store or server-side document processor is included.

“Online-first” for the wider enV platform means the enV shell/catalog can be online when available. It must not make A book's local content workflows online-dependent. After the Web tool's assets have been loaded/cached, the supported A book functionality must continue offline. Native apps must support local workflows without a network connection.

Local data durability is not the same as cloud backup. Browser data can be cleared or evicted, and a device can be lost or damaged. Therefore:
- Maintain local revisions and a trash/recovery area.
- Provide user-controlled full export and restore from a local archive.
- Let users choose a local destination such as Downloads, Files, a removable drive or another device.
- Clearly warn when browser storage is unavailable, nearing quota or not persistent.
- Do not claim that local revisions protect against device loss.
- Do not silently copy user content into OS/cloud backup services under an enV-controlled claim. Explain that device backup behavior is governed by the operating system and user settings.

No silent last-write-wins logic is required for cross-device sync because cross-device sync is out of scope. Local edit history still protects against accidental changes.

## 3. High-level topology

A book runs as a self-contained local data plane inside each enV platform client:

Platform client
  - Platform-native/responsive UI
  - Editor adapter
  - Local database and schema migrations
  - App-managed attachment/document files
  - Local full-text index
  - Local revision history and trash
  - On-device PDF/document/image processing engines
  - Local import/export and recovery tools
  - Platform capture and permission adapters

No A book content API or cloud storage service sits behind this topology. Network access is not required for local note, document or PDF operations. If future product requirements add optional sync or remote sharing, that must be designed as a separate, explicitly opt-in feature and must not change the local-only default.

## 4. Platform implementation

### 4.1 Web

- React/TanStack route at \`/tools/productivity/a-book\`.
- IndexedDB for notes, notebooks, tags, revisions, settings and document metadata.
- OPFS for larger binary files and working files where supported; use an IndexedDB Blob fallback for browsers without adequate OPFS support.
- Request persistent browser storage when supported. Detect quota errors and show a clear warning; browsers may evict data or users may clear site data.
- Cache the application shell and versioned static assets using a service worker/PWA so the tool can reopen offline after its first successful load. Never treat the service-worker cache as the user's data backup.
- Use Tiptap/ProseMirror for the Web rich-text editor with a pinned, license-audited extension set.
- Use PDF.js for local PDF rendering, navigation, text selection and text extraction. Use a local PDF manipulation library/worker such as pdf-lib for supported page operations and writing/flattening supported annotations. Keep the processing worker local; do not call a hosted PDF API.
- Use local OCR (for example, a bundled WebAssembly OCR engine) only after verifying bundle size, language packs, licensing, worker isolation and performance on low-memory devices. No OCR service upload.
- Use browser file picker, drag-and-drop, File System Access API when supported, camera capture where available and ordinary downloads for import/export. Do not require optional browser APIs for core editing.
- Web Crypto may support optional local-vault encryption, but key derivation, recovery and compatibility must be designed and tested before making an encryption claim.
- Process large PDFs in workers and bounded chunks. Do not load unbounded archives or huge document bitmaps into the main UI thread.

### 4.2 Android

- Native Kotlin/Jetpack Compose screens and editor; no WebView.
- Room/SQLite as the durable local store, with explicit schema migrations.
- App-private files for attachments, PDF working copies, thumbnails, OCR output and temporary exports.
- Android Keystore for device-protected cryptographic keys if local database/file encryption is implemented.
- Use Android document picker/Storage Access Framework for user-selected import and export destinations.
- Use the existing PDFBox Android dependency for compatible local PDF text/page processing; validate support and performance for every operation before exposing it. Use Android PdfRenderer for page previews where appropriate.
- Use CameraX/native camera flows for capture. Use on-device OCR such as ML Kit Text Recognition only when the required model is available locally; do not silently fall back to a network processor.
- WorkManager is not needed for cloud synchronization in this release. It may run clearly identified local maintenance tasks, such as thumbnail generation or local index rebuilds, with appropriate constraints.
- Widgets and share targets are native enhancements; core note creation must not require permissions beyond the app's normal sandbox.

### 4.3 iOS

- Native SwiftUI screens and editor; no WebView.
- The current project deployment target is iOS 16.4. Do not make SwiftData (iOS 17+) a Phase 1 dependency unless the minimum supported OS is deliberately raised. Use Core Data or SQLite behind a repository interface.
- App-private files for attachments, PDF working copies, thumbnails and exports; Keychain for local-vault keys where applicable.
- Use PDFKit for local PDF viewing, selection, annotation and supported page manipulation.
- Use Vision for on-device text recognition/OCR and image analysis; use VisionKit document scanning where appropriate.
- Use FileDocument, document pickers and Files integration for user-controlled import/export.
- Use App Groups only for data intentionally shared with an approved Share Extension or widget.
- WidgetKit, App Intents/Shortcuts and Share Extension provide local quick capture.
- No BGTaskScheduler or background URLSession sync pipeline is needed for A book in this local-only release.
- Request Photos, Camera or Microphone permission only when the corresponding local feature is invoked.

### Local-processing rule

Every operation exposed in A book must declare its execution mode: \`local\`, \`local-with-optional-model-download\`, or \`unsupported\`. For this release, do not offer server-processing fallback. If a device/browser cannot process a format locally, explain the limitation and offer export/open-with-compatible-app rather than uploading the user's file.

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

### Phase 1 — Local notes and durable device data
- Create, edit, rename, duplicate, pin, archive, restore and delete notes.
- Plain text and rich text with headings, lists, checklists, quotes, links, code blocks and tables.
- Notebooks, nested folders, tags, favorites, Inbox and saved views.
- Quick capture with automatic local draft persistence.
- Search titles and full text; filter by notebook, tag, updated date and status.
- Attach images and supported documents in local app storage.
- Local read/create/edit/search without internet access.
- Local revision snapshots, trash/tombstones and restore.
- Markdown, TXT, JSON and full-workspace ZIP export/import.
- Restore a previously exported local archive.
- Responsive Web and native Android/iOS navigation.
- Accessible keyboard/screen-reader behavior and RTL-safe document rendering.

### Phase 2 — Local document and study studio
- PDF rendering, text extraction and search.
- PDF highlights, underlines, freehand annotations, comments and text boxes.
- Local PDF rotate, reorder, merge, split, extract and supported compression.
- Scanned-document capture, crop/deskew and on-device OCR.
- DOCX/text extraction for supported formats and local export to supported output formats.
- Local audio recording and playback.
- Handwriting and drawing with platform-native stylus support.
- Local reminders, daily notes and calendar entry points.
- Widgets, browser capture and expanded native quick-capture integrations.

### Phase 3 — Local knowledge and visual workspace
- Backlinks, related notes, graph view and block references.
- Whiteboard, mind maps and visual boards.
- Local templates, custom collections and advanced views.
- Flashcards and spaced-repetition schedules stored on-device.

### Phase 4 — Optional on-device intelligence
- On-device summaries, rewriting, translation, task extraction, flashcards and semantic search only when a genuinely local engine is available and the user opts in.
- Downloadable local language/OCR models must clearly show size, supported languages, device requirements and whether the model works offline.
- No mandatory AI, hosted model or remote transcription provider.
- If no supported local model exists, hide or disable the capability rather than faking a result.

Real-time collaboration, server sharing, team workspaces and cloud synchronization are not part of the initial or implied scope.

## 7. Local data model

**No A book PostgreSQL migration is required for this release.** Notes and their relationships are stored in platform-local databases. Do not add A book content tables to the enV server database.

The logical local schema must have platform-equivalent entities:

### Notebook
- id (stable UUID)
- parent_id (nullable)
- title, icon, color, sort_order
- archived_at, created_at, updated_at

### Note
- id (stable UUID)
- notebook_id (nullable)
- title
- document_schema_version
- content_json
- plain_text (locally derived search/index field)
- excerpt
- local_revision_number
- pinned_at, archived_at, deleted_at
- created_at, updated_at

### Tag and NoteTag
- stable tag ID, normalized name and display name
- many-to-many note relationship with uniqueness constraints

### Revision
- stable revision ID, note ID, revision number, content snapshot, content hash, source and created_at
- immutable snapshots sufficient to restore an earlier note locally

### Attachment
- stable attachment ID, note ID, relative local object path, original display filename, detected MIME, byte size, checksum, processing state and creation time
- never store arbitrary remote URLs as attachment identity

### LocalIndex
- note ID, indexed title/body/tags and last indexed revision
- rebuildable from canonical local note content

### ImportJob / ExportJob
- local job state, manifest path, progress and error details
- temporary files must be cleaned up safely after completion or cancellation

Platform storage:
- Web: IndexedDB object stores with versioned migrations; OPFS for larger binary files when supported.
- Android: Room entities/DAOs and app-private files.
- iOS: Core Data or SQLite repositories and app-private files.

Use stable identifiers and the same logical constraints on every platform. Add cross-platform document and archive fixtures to prove that export from one platform can be imported by another.

Do not require user_id on local note records. Partition libraries locally by enV profile/account context when multiple accounts can use one device, but retain access to the local library after sign-out and make the user explicitly choose whether to keep or erase it. Local data must never be shown to a different signed-in profile by accident.

## 8. Network and API boundary

There are **no A book content APIs in this release**.

Do not create server routes for note CRUD, PDF processing, OCR, attachment upload/download, search, import/export, revision history, sharing or sync. Do not send note bodies, attachments, filenames, OCR output, document metadata or search queries to the enV backend.

The surrounding enV platform may continue using its existing authentication, catalog and consented aggregate analytics. Those services must not become an indirect path for sending A book content. Do not include note titles, document names, excerpts or content-derived metadata in analytics.

If a future release proposes optional sync or remote sharing, it requires a separate product decision, explicit user opt-in, a new threat model and an architecture amendment. It must not silently activate.

## 9. Local save and recovery algorithm

1. User edits a note.
2. The platform repository commits the content and an edit/revision record in one local transaction.
3. The UI reports \`Saved on this device\` only after the durable local commit succeeds.
4. The local search index is updated incrementally or queued for local rebuild.
5. Attachments are written to app-managed local storage using temporary files and atomic rename/commit where supported.
6. A checksum and byte size are recorded after the file is fully written.
7. Autosave failures, disk-full conditions, permission failures and quota errors remain visible; never show a false saved state.
8. A local trash and immutable revision snapshots allow recovery from accidental edits/deletes.
9. User-triggered export writes a manifest, note schema version, notebooks, tags, revisions and attachments into a portable archive.
10. Restore validates archive paths, schema, checksums, size limits and supported content types before writing data to the local library.

There is no sync queue, server cursor, remote conflict resolver or background network sync in this release. For moving data between devices, use explicit export/import or the operating system's user-controlled file transfer.

## 10. Local files, PDF processing and recovery

### Local attachment lifecycle

- Imported files are copied into app-managed local storage by default so notes do not break when the original download is moved or deleted.
- Where supported, users may link to an externally managed file, but the interface must explain that moving/deleting that source can break the link.
- Generate opaque local filenames and retain the original filename only as display metadata.
- Verify file size, checksum and detected media type before linking it to a note.
- Use atomic writes, temporary files and safe cleanup after interrupted imports.
- Never upload user files to an enV server, Vercel Blob, Cloudflare R2 or another remote storage provider.
- Large-file processing must use streaming/chunking and bounded memory.

### PDF feature plan

Implement locally, subject to per-platform acceptance tests:
- PDF open/render, page thumbnails and navigation.
- Text selection, text extraction and in-document search for text-based PDFs.
- Scanned PDF OCR with on-device OCR engines and locally available language packs.
- Highlights, underline, freehand ink, comments, sticky notes and text annotations.
- Page rotation, extraction, reordering, duplication, deletion and merge/split.
- Local image extraction where supported.
- Local compression and optimization where quality can be measured.
- Fill supported forms and add signatures/initials locally.
- Export/share the annotated or modified PDF to a user-selected destination.

Suggested implementation engines:
- Web: PDF.js for rendering/text extraction; a bundled local PDF manipulation engine such as pdf-lib for specifically supported structural edits and annotation export; optional local WASM OCR after performance/license audit.
- Android: existing PDFBox Android dependency for supported PDF operations; Android PdfRenderer for previews; on-device ML Kit text recognition or a verified fully local alternative for OCR.
- iOS: PDFKit for local reading and annotation; Vision/VisionKit for on-device OCR and document scanning.

Do not promise full PDF editor parity based solely on PDF rendering support. Test annotation round-tripping, fonts, forms, page geometry, embedded images, encryption/password-protected files, large files and malformed documents. If a feature cannot be completed locally on a platform, show it as unsupported on that platform until implemented.

### Other local document processing

- Images: decode, resize, rotate, crop, deskew and produce previews on-device.
- DOCX: locally extract supported text/structure and create a portable export; do not imply full-fidelity editing unless a genuine local editor exists.
- TXT/Markdown/HTML/RTF: parse and export locally with safe HTML sanitization.
- CSV: locally preview, search and export; preserve original data.
- Audio: locally record, play and trim where supported. Transcription is available only through a verified on-device engine/model.
- ZIP import/export: validate paths against traversal, enforce uncompressed-size/file-count limits and process entries safely.

### Local backup and restore

There is no cloud backup in this release.

- Maintain local note revisions and trash.
- Provide user-controlled full-library and per-notebook exports.
- Use a versioned archive manifest with per-file checksums and schema version.
- Allow restore from a selected local archive.
- Support Android Storage Access Framework, iOS Files/document picker and Web downloads/File System Access where available.
- Explain browser-data clearing, device loss and OS backup behavior honestly. Do not label an OS-managed backup as enV cloud backup.
- Run archive corruption, interrupted export, partial restore and duplicate-import tests.

Local revision history is not a backup against device loss. An exported archive copied to a separately controlled location is the user's recovery copy.

## 11. Search, privacy and security

### Local search

- Search title, full text, tags and notebooks with a local index.
- Incrementally update the index after edits, imports, restores and deletes.
- Index extracted text from PDFs and supported documents only after local processing succeeds.
- Keep OCR text local and associate it with the source attachment.
- Provide exact phrase, keyword, tag, notebook and updated-date filters.
- Rebuild the index from the canonical local database if it becomes corrupt.
- Do not send search queries or note content to a server.

### Local privacy

- Store content in the platform's app sandbox and protect local files using available OS file-protection mechanisms.
- Keep encryption keys in Android Keystore or iOS Keychain when local encryption is implemented.
- For Web local-vault encryption, define passphrase/key derivation, recovery and cross-browser portability before release.
- Do not claim end-to-end encryption or encrypted database protection unless the implementation and recovery behavior are tested.
- No note content, attachment bytes, filenames, OCR text, document metadata or search terms in analytics, logs or crash reports.
- Do not use remote AI, hosted OCR, hosted transcription or server-side PDF processors.
- Explain local data deletion, profile separation, export and storage limits clearly.
- Permissions for camera, microphone, photos and file access are requested only when the matching local action is invoked.

## 12. enV repository integration map

- \`src/data/catalog.ts\` — add A book catalog record (id \`a-book\`, slug \`a-book\`, category \`productivity\`, display name \`A book\`).
- \`src/lib/registry.ts\` — verify route discovery and aliases; do not duplicate catalog records.
- \`src/components/tools/tool-engine.tsx\` — dispatch A book to the Web ABook engine.
- \`src/routes/tools/$category/$slug.tsx\` — existing generic tool route hosts the Web entry point.
- \`src/components/engines/a-book/\` — proposed Web UI/editor modules.
- \`src/lib/a-book/\` — document schema, local repository, search, PDF/document processing and archive import/export.
- \`apps/shared/catalog.json\` — regenerate using \`scripts/export-native-catalog.mjs\`; never hand-edit generated output.
- \`apps/android/...\` — Kotlin/Compose UI, Room database, app-private file repository, PDFBox integration, local OCR and Android document picker integration.
- \`apps/android/native-tool-coverage.txt\` — list \`a-book\` only when the native route is actually implemented and tested.
- \`apps/ios/enV/\` — SwiftUI UI, Core Data/SQLite repository, PDFKit/Vision integration and Files/Share Extension entry points.
- \`apps/ios/native-tool-coverage.txt\` — list \`a-book\` only when the native route is actually implemented and tested.
- \`tests/\` — shared document fixtures, archive import/export fixtures, local repository tests and PDF golden fixtures.

No A book backend routes, PostgreSQL migrations, object-storage credentials, cloud sync workflows or cloud backup jobs should be added for this release.

The generic tool route must not be used as an excuse to embed the Web application in Android or iOS.

## 13. Testing and release gates

### Local data integrity
- Create/edit/rename/delete/restore and reopen after process restart.
- Local transaction interruption never leaves a partially committed note.
- Disk-full/quota exceeded presents a recoverable message and never reports a false save.
- Duplicate import handling is deterministic and user-visible.
- Corrupt or unsupported schema is rejected without overwriting the last good note.
- Revision restore returns exact prior content.
- Attachment interruption/retry and checksum verification.
- Trash retention and permanent deletion behave correctly.

### PDF and document processing
- Text PDF render, select, extract and search.
- Scanned PDF local OCR with supported language packs.
- Annotation persistence and exported-PDF round-trip.
- Merge/split/reorder/rotate/extract page operations.
- Large PDFs and memory pressure.
- Encrypted/password-protected and malformed PDFs.
- Font substitution and embedded media behavior.
- DOCX/HTML/RTF/CSV import/export fidelity within documented support.
- Malformed ZIP, path traversal, decompression bomb and archive size limits.
- No unexpected network requests while processing any local file.

### Search and scale
- Search while editing and immediately after index update.
- Test 10,000+ notes, large documents, many tags and attachment metadata.
- Search index rebuild and incremental paths produce equivalent results.
- Search remains responsive on lower-end phones and modest browsers.

### Privacy and security
- Verify by network inspection that note CRUD, PDF processing, OCR, search, import and export generate no content-bearing network requests.
- No note titles, filenames, excerpts or contents in analytics/logs.
- Separate local libraries across signed-in enV profiles.
- Sign-out does not silently erase a local library.
- Export archives validate checksums and reject malicious paths/content.

### Platform
- Web browser storage quota/eviction, cleared-site-data warning and offline PWA reopening.
- Android process death, app upgrade migration, low storage, SAF import/export and camera permission denial.
- iOS app termination, Core Data/SQLite migration, file protection, document picker, Share Extension and camera denial.
- Keyboard, screen-reader, dynamic type, RTL and small-screen usability.
- Separate web build/typecheck/tests, Android unit/instrumentation tests and iOS XCTest/UI tests.
- Real devices required before declaring camera, microphone, widget, stylus and large-PDF performance production-ready.

### Release criteria
Do not mark the tool active or production-ready until all three platform entry points work, core mutations have durable local persistence, import/export and recovery tests pass, PDF/document processing is genuinely local on each claimed platform, privacy/network tests confirm no content upload, and Web/Android/iOS platform tests pass. A passing catalog check alone is not feature verification.

## 14. Remaining implementation and release blockers

The following are actual gaps after the current cross-platform implementation. They must be closed or explicitly scoped out before production release.

1. **Shared document contract:** the versioned document schema exists, but the three editors still store/render their current note representation rather than a canonical rich-text AST. Implement safe block/mark round-tripping and shared Web/Android/iOS fixtures before enabling rich-text blocks.
2. **Web document processing:** the local PDF.js reader now renders one page at a time with bounded canvas memory, navigation and zoom; it exposes per-page text and the local text extractor supports whole-document search after extraction and batch `.txt` ZIP export. PDF OCR for scanned/image-only pages, PDF annotations, text-selection overlay on the canvas and library-wide full-text indexing are still not implemented. Keep OCR local and optional; do not upload scans.
3. **Rich-text parity:** Web, Android and iOS currently provide Markdown-capable/plain-text editing rather than the planned block editor. Implement and test headings, lists, checklists, quotes, links, code blocks and tables as structured content, or keep those capabilities visibly out of scope on all platforms.
4. **Browser durability:** IndexedDB is implemented, but OPFS-backed large-file storage, verified offline PWA reopening, quota/eviction handling and persistence prompts still need implementation and browser testing.
5. **Native persistence hardening:** Android currently uses SQLiteOpenHelper (not Room) and iOS uses a programmatically defined Core Data model. Add explicit upgrade/migration, process-death, reopen, transaction rollback, low-storage and attachment-orphan recovery tests on both platforms.
6. **Archive interoperability:** Web, Android and iOS implement the same `env.abook.archive.v1` ZIP manifest shape. Add automated cross-platform fixtures that export on each platform and import on the other two, including attachments, revision history, trash state, malformed records and interrupted/failed imports.
7. **PDF/OCR verification:** maintain the real platform capability gates. Validate password-protected, malformed, image-heavy and large files; page geometry and rotations; text extraction correctness; OCR model availability and supported languages. Android's bundled ML Kit OCR currently supports Latin script, while iOS uses Vision. Web PDF OCR is not available yet.
8. **Data integrity and recovery:** add persistence tests for account/profile isolation, autosave during rapid edits, app termination, attachment deletion, revision pruning, quota failure and backup restoration. Browser data may be evicted or cleared; the user-controlled archive remains the recovery mechanism.
9. **Release validation:** final-head Web build/typecheck/tests, Android unit/lint/emulator launch, iOS simulator build/XCTest, rendered accessibility audits and local-only network inspection must all pass. Real-device tests remain necessary for native document pickers, OCR availability, large PDFs and storage behavior.
10. **External deployment:** the connected Vercel status has reported an account build-rate-limit failure. Resolve the provider quota or explicitly restore a successful deployment check before merging; do not hide this external gate as a code success.

Already implemented in this branch: local notes and attachments, autosave, search/filter, pin/archive/trash/restore, revision history, full-library `.abook` backup/restore, Markdown and legacy JSON export/import, guarded ZIP parsing/import quotas, platform routes, local PDF inspect/rotate/merge/split/page extraction, multi-file batch rotation/extraction/splitting across Web/Android/iOS, Web PDF.js selectable-text extraction/search and batch text export, native Android/iOS PDF text/OCR where documented above, and local-only backup exclusions. These features still require the final-head release tests listed here.

No cloud provider, cloud bucket, database credential, upload token, cloud backup subscription or server-side A book infrastructure needs to be provisioned.

## 15. Non-goals for Phase 1

- No Cloudflare R2, Vercel Blob, S3, cloud bucket or other remote user-content storage.
- No cloud notes database or A book PostgreSQL migration.
- No note-content API routes.
- No cloud synchronization or cross-device automatic sync.
- No cloud backup or server-side recovery.
- No attachment upload/download service.
- No hosted OCR, transcription, PDF conversion or document-processing backend.
- No mandatory hosted AI/model.
- No real-time collaboration or server sharing.
- No WebView-based native implementation.
- No localStorage as the primary Web notes database.
- No false success messages when local persistence or processing fails.
- No catalog status of active merely because a route or card exists.

Users move data between devices through explicit local export/import or file transfer until a separately approved future sync feature is designed.

## Architecture decision summary

A book is an enV Toolkit tool with independent Web, native Android and native iOS implementations. User content is local-only: notes, documents, PDFs, attachments, revisions and processing outputs remain on-device. The current Web implementation uses IndexedDB; Android uses a SQLiteOpenHelper-backed database and app-private files; iOS uses Core Data/SQLite and app-support files. The three platforms have local backup/restore and different levels of PDF functionality. On-device Vision OCR exists on iOS, and bundled ML Kit Latin-script OCR now exists on Android; Web OCR is not yet implemented. OPFS, Room, rich-text parity, broad PDF annotations and several document-studio features remain planned work, not completed features.

There is no cloud storage provider, server-side content database, upload API, synchronization service, remote processing or cloud backup in this release.

**Implementation status:** Functional code exists across all three platforms, but this branch remains under implementation and verification. Do not declare A book production-ready or merge it until the release gates in Section 0 are satisfied.

