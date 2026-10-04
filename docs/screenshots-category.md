# Screenshot category

The Screenshot category turns a user's own screenshot into a presentation: a device or browser frame, a mockup on a backdrop, a polished beautified image, a headline-and-device presentation, a multi-device collage, an annotated image, or a redacted image. Everything runs in the browser; nothing is uploaded.

## What changed

| | Before | After |
|---|---|---|
| Tools in the catalog | 115 (10 active, 105 planned) | 115 (115 active) |
| Active tools with real output | 0 of 10 (see findings) | 115 of 115 |
| Engines | one preview-only widget, one op that did not exist, one unreachable prototype | one shared studio, one typed registry |
| Export | none | PNG, JPEG, WebP, PDF, clipboard, share, download |

The live catalog has **115** Screenshot tools (15 families x 7 workflows = 105, plus 10 original ids), not the 114 quoted in the task brief. The registry (`src/lib/screenshots/tool-config.ts`) is the source of truth and `npm run check:screenshots` keeps it in step with the catalog.

### Findings on the starting state

1. **The 9 "active" frame tools were preview-only.** `DeviceEngine` showed a CSS box with a file input: no controls, no download, no copy, and an object URL that was never revoked. `lock-screen-mockup` reused the phone-shaped box and had no lock-screen UI at all.
2. **`screenshot-beautifier` could not beautify.** It pointed at an image-engine op named `beautify` that no code implemented. `describeImageOperation("beautify")` returns `{ mode: "quick", family: "edit" }`, i.e. the generic resize/re-encode path. There was no padding, background, radius or shadow code for it.
3. **The 105 planned tools were unreachable even in principle.** `ToolEngine` checks `status === "planned"` before the `custom` case, so the old `ScreenshotEngine` (which also drew a `• Demo` label into its canvas) could never run.
4. **Metadata disagreed with code.** Engine refs (`device`, `image/beautify`) described engines that did not do what the catalog implied.

Removed as obsolete: `DeviceEngine`, `screenshot-engine-utils.ts` and its test (a string-fragment dispatcher plus hard-coded frame sizes), and the old `ScreenshotEngine`. Their behaviour is covered by the registry and the new tests.

## Architecture

```
src/lib/screenshots/            pure TypeScript, unit-tested with node --test
  tool-config.ts                typed registry: id -> (family, workflow), panels, defaults, descriptions
  presets.ts                    versioned generic frame geometry (devices, browser windows)
  store-presets.ts              canvas sizes with source URL + verification date
  scene.ts                      composition model + layout engine (one scene model for every workflow)
  annotations.ts, pixel-ops.ts  object-based marks; deterministic blur / pixelate / solid fill
  backgrounds.ts, shadow.ts, geometry.ts, text-layout.ts, history.ts, export-plan.ts
  render.ts                     canvas renderer (shared by preview and export)
  export-runtime.ts             full-resolution compose, encode (PNG/JPEG/WebP/PDF), copy, share
src/components/screenshots/     React studio: result canvas, editor canvas, panels, controls, studio.css
src/components/engines/screenshot-engine.tsx   thin, code-split, client-only entry used by ToolEngine
scripts/check-screenshots.mjs   static audit
```

Preview and export use the **same renderer**. Preview content is capped at 2400 px on its long side for responsiveness; export always composes from the full-resolution source.

### Workflows

| Workflow | Opens with | Panels |
|---|---|---|
| Frame | transparent background, frame hugs the screenshot | crop, frame, inspect |
| Mockup | frame on a preset canvas with backdrop and shadow | + layout, background, shadow |
| Beautifier | padded, rounded, shadowed, gradient backdrop, optional frame | + corners and border |
| Presentation | device + headline/subtitle at custom or store-listing size | + headline |
| Collage | up to 12 screenshots, auto-arranged (row/column/grid/overlap), draggable | collage, frame, background, shadow |
| Annotation | Edit view; arrows, shapes, pen, marker, text, steps, callouts, spotlight, measure | annotate, crop, frame, inspect |
| Redaction | Edit view; solid, blur, pixelate | redact, crop, frame, inspect |
| Lock screen (legacy id) | phone frame, editable clock and notifications | frame, lock, layout, background, shadow |

Families: iPhone, Android, iPad, Tablet, MacBook, Laptop, Desktop, Apple Watch, Chrome, Safari, Firefox, Edge, Google Search, App Store, Google Play. A family selects frame presets and canvas presets; the workflow selects behaviour. The original ten ids (`iphone-frame`, `watch-frame`, `browser-chrome-frame`, `lock-screen-mockup`, `screenshot-beautifier`, ...) keep their ids and slugs and route through the same studio.

A "Simple" mode shows essentials; "Advanced" adds fine controls (offsets, spread, per-side padding, colours, opacity, filenames). Undo/redo covers every edit, with slider drags coalesced into one step.

## Truthfulness decisions

- **Frames are generic.** Every device body is an "iPhone-style", "MacBook-style" or similar generic shape. None claims to be a specific model, and no vendor artwork or proprietary icons are embedded. Presets record an `authoredOn` date, not a verification claim.
- **Browser windows are approximations** drawn with plain vector shapes (tab strip, toolbar, address pill, window controls). The address and tab title are display-only text; nothing is loaded or opened (checked: zero network requests). "Google Search" is a generic browser frame and draws no logo.
- **App Store and Google Play tools build store-listing screenshots** (device + headline + backdrop at store sizes). They do not imitate the store apps.
- **No status bar is drawn.** A real screenshot already carries its own; we never invent signal, battery or clock data. The lock-screen clock and notifications are editable presentation text and the tool keeps the mockup disclaimer.
- **Store sizes carry provenance.** iPhone sizes (6.9", 6.5", 6.3") were checked against Apple's published specification page; the 13" iPad sizes and Google Play's 320-3840 px / 2:1 rule come from secondary sources and are marked `secondary-sources` in the UI with the verification date. Store sizes are exact, locked, and opaque (transparency is flattened). Source pages: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/> and <https://support.google.com/googleplay/android-developer/answer/9866151>. Store rules change, so re-check before a release.
- **Mismatched proportions are never silently cropped.** "Auto" fits when proportions match (within 4%) and letterboxes otherwise, with a visible note; "Fill" and "Fit" are explicit choices.

## Privacy and safety

- Images are decoded and composed locally. Sources live in memory for the tab only and are closed on removal; there is no `localStorage`, history persistence or upload (enforced by the audit script).
- **Redaction** is non-destructive while editing and permanently flattened on export by deterministic pixel operations. Solid fill leaves one opaque colour in the covered area (verified on exported files); blur and pixelation carry a warning that they are not guaranteed to be unreadable. Marks apply in z-order, so a redaction above an arrow hides it.
- User text (address, headline, notifications) is drawn with `fillText` only, after stripping control and bidirectional-override characters. File names are sanitised. Colour inputs are validated before reaching canvas styles.
- QR results are shown as text. Links are never opened automatically; opening requires a click and a confirmation.
- Exports re-encode through canvas, so source EXIF/metadata is not carried over.
- Limits reuse the shared image limits (80 MP decode, output-pixel cap). The default "native" export scale is capped at 16 MP (below the ~16.7 MP iOS Safari canvas limit) so the default is always producible.

## Coverage against the task brief

**Implemented:** audit and honest status; one shared studio with all 115 tools; typed per-family/per-workflow config; frame, mockup, beautifier, presentation, collage, annotation, redaction and lock-screen workflows; browser windows with light/dark, controls, tabs and address text; backgrounds (preset, solid, gradient, local image), shadow (outer/inner, softness, offset, spread, colour), padding, rotation, scale, offsets, safe-area guides; crop (numeric, drag, aspect presets); annotation objects with handles, snapping, layers, z-order, duplicate, lock/hide; measure, colour picker with loupe, QR scan when the browser supports `BarcodeDetector`; upload, drag-and-drop, paste (event and button), screen capture with delay and cursor option; PNG/JPEG/WebP/PDF export, quality, native/1x/2x/custom size, transparency handling, store-exact sizes, copy, share; undo/redo, reset, keyboard shortcuts, before/after hold; mobile-first layout with a sticky action bar, 44 px touch targets, dark mode, reduced motion, labelled controls, ARIA roles; unit tests, static audit, catalog regeneration.

**Not implemented (deliberately or for scope):**
- Scrolling/long-page capture and stitching. Capture grabs one frame.
- Perspective or 3D device transforms (rotation and scale only).
- OCR (the repo has no local OCR engine; the UI says so rather than pretending).
- Saved presets, saved history, project files, or hand-off into other categories' tools. History is session-only by design.
- Pixel-exact or model-specific device and browser art; multi-page PDFs.

## Verification

Run here (no network, so no `npm ci`):

- `node --experimental-strip-types --test src/lib/screenshots/*.test.ts`: 59 tests, all passing (geometry, presets, colours, pixel ops, text safety, annotations, history, layout, registry, export planning).
- `npm run check:screenshots`: passes; negative-tested by injecting a demo string, a `fetch`, an external URL and a missing route guard (all four caught).
- Existing guards after catalog regeneration: `check-catalog`, `check-production` (screenshots added to its dispatcher allow-list), `coming-soon-audit`, `coming-soon-deep-audit`: all pass. The catalog diff touched only the 115 Screenshot entries.
- The real `ScreenshotEngine`, bundled with esbuild and driven in headless Chromium with React 19 in development mode:
  - **all 115 tools**: mount, upload through the real file input, add a mark where relevant, export with the real Download button; every downloaded PNG had exactly the dimensions the UI promised, with no error banner and no console errors or warnings;
  - 19 scenarios with pixel checks of the downloaded files: exact App Store size with opaque output, JPEG/WebP/PDF validity, redaction through real mouse drags (covered block collapses to one colour, surroundings untouched), annotation, crop, undo/redo/delete via keyboard, paste and drop, collage, clipboard copy, the colour picker against the source pixel, browser-frame address making zero network requests, lock screen, Simple/Advanced, an 18 MP image, an 81 MP and a non-image file rejected with clear messages, and an accessible-name audit;
  - a 390 px touch viewport (no horizontal overflow, sticky bar, 44 px targets) and dark mode.
- Strict typecheck of the pure library and, with typing shims for the packages that could not be installed, of the React code under the repo's compiler flags.

**Not run here, and worth running first:** `npm ci && npm run typecheck && npm run lint && npm run build && npm test`, and a live-route pass against the built app (the harness mounts the real component but not the TanStack router, Tailwind styles, or real `lucide-react`). Not exercised in a real browser: Safari and Firefox rendering, real `getDisplayMedia` capture (the code path exists and the button appears; the picker cannot be driven headlessly), and `BarcodeDetector` (absent in desktop Chromium; the UI hides QR scanning when it is missing). I could not run ESLint, so I audited by hand for the repo's rules (unused variables, `no-explicit-any`, unused expressions, hook dependencies).

## Operating notes

- Regenerate the catalog after changing the registry: `node scripts/gen-catalog.mjs` (Node 22.18+; older 22.x needs `--experimental-strip-types`). The generator now reads `tool-config.ts` to set status, engine and descriptions for the category.
- `npm run check:screenshots` fails if a registry tool is missing from the catalog (or vice versa), if a Screenshot tool is not active and routed, if descriptions drift or repeat, or if demo wording, network calls, external hosts, or browser storage appear in Screenshot code.
- To add a frame, add a preset to `presets.ts` and list it in the family map; geometry is data, not renderer code.

## Suggested follow-ups

1. Run the full toolchain and a live-route sweep (the scenario list above automates cleanly).
2. Manual pass in Safari and Firefox, and on a real phone, including screen capture.
3. Decide whether to add scroll-stitching, saved presets, and hand-off into the Image tools.
