# enV Mockups Implementation Audit — Phase 0/1/2 Progress

Date: 2026-09-29

## Source of truth

Implementation is based on `enV_Mockups_Master_Implementation_Prompt.txt` and the extracted enV repository.

## Repository audit

- Repository: `enV-current-clone`
- Files in archive: 349
- TypeScript/TSX source files: 175
- Tests/spec files: 38
- Catalog size: 10,000 tools
- Mockups catalog entries: 187
- Initial Mockups status: 27 active, 160 planned
- Mockup-specific tests before implementation: one utility test file
- Existing Mockups implementation was split between `mockup-engine.tsx` and `mockups-category-engine.tsx`.

## Existing architecture found

`src/components/tools/tool-engine.tsx` dispatched `mockup`, `post`, and `device` engine types to generic components. Category-level Mockups entries using `custom` engine IDs were routed through `MockupsCategoryEngine`, but planned tools were blocked before that dispatch.

The old Mockups renderer was based primarily on a small hard-coded color/theme map and a generic message list. Device rendering was generic frame selection rather than a first-class template registry. Export was `window.print()` / Save PDF rather than a Mockups render/export pipeline.

## Implemented foundation

New shared Mockups modules:

- `src/lib/mockups/schema.ts`
  - Project
  - Platform
  - Scene
  - DeviceTemplate
  - Theme
  - Profile
  - Message
  - MediaAsset
  - Reaction
  - Reply relationship
  - TimelineEvent
  - ExportSettings
- `src/lib/mockups/devices.ts`
  - multiple iPhone templates
  - multiple Android templates
  - iPad portrait/landscape
  - browser templates
  - custom viewport
  - cutout, safe-area, status/navigation metadata
- `src/lib/mockups/themes.ts`
  - centralized theme tokens
  - platform-specific overrides
- `src/lib/mockups/platforms/`
  - platform adapter contract
  - adapter registry
  - WhatsApp adapter as the first explicit platform adapter
- `src/lib/mockups/project.ts`
  - versioned project creation
  - local persistence
  - JSON validation/import support
- `src/lib/mockups/media.ts`
  - bounded user media ingestion
  - image dimension extraction
  - audio duration extraction
  - deterministic normalized waveform extraction
- `src/lib/mockups/export.ts`
  - deterministic SVG renderer
  - PNG/JPG/WebP raster export
  - SVG export
  - high-resolution scaling independent of editor display size
- `src/components/engines/mockups-category-engine.tsx`
  - structured editor
  - platform/scene/device/theme selectors
  - direct message editing
  - add/delete messages
  - delivery/read state
  - reactions
  - reply relationships
  - media upload
  - project save/load
  - JSON import/export
  - export controls

## Catalog routing change

All 187 Mockups catalog entries now resolve through the shared Mockups engine. The generator was updated so Mockups entries are active catalog entries rather than remaining blocked as Coming Soon.

The catalog audit passes after regeneration:

- 10,000 total tools
- 8,789 available
- 1,211 planned outside the Mockups category
- 187/187 Mockups active

## Research findings incorporated

Successful mockup tools consistently expose structured editing rather than static screenshots. Mockly documents a shared render pipeline for chats, AI chats, posts, comments, stories and email, with image and video outputs. Its WhatsApp generator exposes direct/group chats, names, avatars, timestamps, read/delivery states, wallpaper/theme controls, device framing and PNG/video export. ToolNova describes platform selection, profile/content/engagement controls and high-resolution export. ChatMock emphasizes browser-side rendering, platform-specific details, read receipts, timestamps and dark mode. MockUp Buddy exposes platform/device choices, layout variants, profile/media/caption/engagement controls and PNG batch export.

WhatsApp public documentation and Meta announcements establish current feature areas including dark mode/system theme behavior, message editing, reactions, voice-message waveform/playback behavior, group/call capabilities, and continued cross-device/web calling changes. These findings are being treated as behavioral references, not copied implementation assets.

## Verification performed

Passing:

- existing `mockups-category-engine-utils.test.ts`
- new `src/lib/mockups/project.test.ts`
- catalog audit
- catalog generator syntax check

Blocked at full repository typecheck because the extracted archive did not have a complete dependency installation. `npm ci` timed out in the execution environment; the resulting partial `node_modules` lacks the project's TypeScript/Vite type-definition setup. This is an environment/dependency-installation limitation, not a claimed clean typecheck.

## Remaining implementation phases

1. Deep WhatsApp renderer: actual platform-specific header/navigation/composer/media/reaction/reply/date-divider/status behavior across iOS/Android/Web/Desktop variants.
2. Expand platform adapters with researched feature matrices and compatibility rules.
3. Full device composition layer separating scene viewport from physical frame.
4. Timeline engine for deterministic typing, message appearance, state changes, scrolling, playback and calls.
5. Real animated export pipeline using the existing FFmpeg infrastructure where appropriate.
6. Project schema migrations and richer autosave/version handling.
7. Accessibility and security hardening for the Mockups editor/media pipeline.
8. Visual golden tests and browser-level Mockups regression tests.
9. Research records for every supported platform and licensed/original asset registry.
10. Final 187-tool audit against the prompt's quality gate.
