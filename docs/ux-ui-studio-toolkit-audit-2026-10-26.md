# UX/UI Studio: toolkit and interaction audit

Reviewed 26 October 2026. Starting point: `2257be13` on `main`. This is a source audit and a review of official design-tool documentation. The starting-state findings below are not a claim that every feature has been exercised on a device. Changes made during this work should be recorded separately with their validation evidence.

## What the Studio should make easy

The immediate product goal is to design an app or website once, adapt it to mobile/tablet/desktop, and export an accurate prompt and specification for a builder or AI agent. The requested improvements are practical editing requirements, not a request to present a count of toolkit categories as proof of completeness.

| Requested workflow | Starting state and code evidence | Acceptance criterion |
| --- | --- | --- |
| Add text as a main tool | `COMPONENTS` contains text, while the always-visible bottom toolbar exposes Add, layers and fullscreen. The contextual Text action only appears on a selected text-bearing layer. | A labelled Add text action is available from the editor without opening a category or selecting an existing layer. It inserts a text layer and opens its content controls. |
| Chroma key | `editStudioImage` accepts cutout/icon/resize only. It automatically chooses a border color. | Choose or sample a key color, control similarity/softness, inspect the result, and remove that color throughout the image when appropriate. Preserve transparency and provide Undo. |
| Reliable background removal | Studio calls `autoMask` with one median border color and edge-only removal. Strength is the only exposed setting. | Plain-background fixtures visibly lose their background without losing the foreground. Provide a way to choose the background color, distinguish edge-only from global removal, inspect the result, and recover from excessive removal. Report no-op or empty-foreground results instead of claiming success. |
| Merge icons into one | `groupSelectedLayers` assigns a `groupId`; children remain separate layers. | A visible multi-selection workflow and Merge icons action produce one selectable, scalable vector asset with the selected artwork preserved. One Undo restores all original layers. Explain if the operation combines vector content rather than performing a geometric boolean union. |
| Shared responsive design | `changeTarget` proportionally rewrites the same layer array and its reference dimensions. | Device switching does not progressively round or mutate the shared design. Shared edits propagate between mobile/tablet/desktop. A separate device-only scope stores explicit overrides, survives switching/save/reload/export, and can be reset. |
| UI bars and more shapes | The component catalog already contains search, input, navigation, tabs, progress and other UI elements, but the Shapes tab explicitly filters to nine geometric kinds. | Shapes exposes both geometric primitives and useful UI building blocks, with searchable names and a rendered preview. Search bars, navigation bars, fields, cards and controls are discoverable there. |
| Edge and shape styling | Global radius, fill, border color/width, opacity, padding, rotation and a shadow toggle exist. One `radius` value cannot express separate corner values. | Styling controls visibly change supported geometry. Uniform and independent corner values are retained in project data and reflected in preview/handoff. Unsupported styles are identified rather than silently ignored. |
| Comprehensive toolkit review | Twenty-six named toolkit categories already exist, with uneven depth. | Keep a capability/gap record, distinguish working controls from future features, and attach evidence to changes. |

## Defects and architectural risks at the starting point

**Device switching changes the design.** In `changeTarget`, x/y/width/height are multiplied by the next/current viewport ratios, rounded, and written back. Returning to the original device is therefore another edit rather than another view of the same design. There is no per-target override map in `SavedProject`, `DesignScreen` or `DesignLayer`. Shared edits and device-specific fixes cannot be distinguished.

**Grouping is not merging.** Group IDs support moving layers together, but selecting, exporting and reusing a single combined icon requires an actual combined asset. A combined SVG can preserve the separate path geometry and paints inside one layer. That is a useful merge, but it should not be described as union/subtract/intersect/exclude unless a path boolean engine actually calculates those operations. Figma documents those four operations separately from flattening. [Boolean operations](https://help.figma.com/hc/en-us/articles/360039957534-Boolean-operations), [flatten layers](https://help.figma.com/hc/en-us/articles/30101373312279-Flatten-layers).

**Automatic cutout makes a narrow assumption.** `borderColor` computes independent channel medians around the image border. On a multicolor border, that sample can be a color that barely exists in the image. Edge-connected removal intentionally keeps enclosed matching areas. The Studio also processes the already-processed source when the user repeats an operation; it exposes no before/after or manual correction workflow. These are different issues from a decoding failure. Raising Strength cannot reliably solve all of them.

**A stronger masking workbench already exists elsewhere.** `src/components/engines/image/mask-studio.tsx` offers picked colors, edge/global removal, feather/edge shift, Erase/Restore, original/mask/result views, and busy-background warnings. The Studio currently reuses its mask math but not those repair controls. Reusing these capabilities is preferable to maintaining two unrelated definitions of background removal.

**Visible styling and saved CSS can diverge.** A single rounded SVG rectangle is not sufficient for independent corners; updating a JSON or CSS property alone is insufficient if the canvas/PDF still renders the old geometry. Every new style needs a preview path, serialization path and handoff representation. Native source generators need an explicit fidelity decision as well.

**Undo scope is narrower than the project.** The starting `checkpoint` snapshots only `elements`, while the project also has screens, viewport, tokens, assets and reusable components. New device overrides must be part of the relevant undo snapshot. Switching between views should not consume the user's design Undo history.

## Toolkit coverage and remaining gaps

“Present” below means an implementation exists in the scanned source, not full parity with a professional design application. “Partial” means a useful foundation exists but a materially different capability is still missing.

| Capability area | Starting coverage | Important remaining requirement |
| --- | --- | --- |
| Projects and persistence | Local drafts, project metadata, import/export, named app screens | Explicit storage/quota failure recovery; durable recovery/version history beyond the current tab/device |
| Canvas and devices | Mobile/tablet/desktop frames, fit/zoom/grid, fullscreen | Shared responsive source with reversible per-device overrides; viewport resize must not mutate source geometry |
| Main creation tools | Add chooser, text/image/icon/component insertion | Primary labelled Add text; easy creation without reopening nested categories |
| Selection and layers | Layer list, multi-select, grouping, locking, visibility, ordering, duplication, clipboard | Touch-friendly multi-select; nested groups/frames; clear selection count and merge eligibility |
| Positioning | Drag/resize, numeric bounds, hold-to-nudge, alignment/distribution | Smart snapping, rulers/guides, nested coordinate spaces, aspect-ratio locking |
| Primitive shapes | Rectangle, ellipse, triangle, diamond, hexagon, star, line, pill, divider | More editable polygons/arrows/arcs and point/path editing; decorative geometry should remain distinguishable from functional UI components |
| UI shape library | About forty component kinds including search and navigation in the broader catalog | Consistent discovery from Shapes; richer field, toolbar, sheet, snackbar and control presets |
| Typography | Text content, real font previews/import, font size/weight, line-height, tracking, alignment | Inline canvas text editing, rich text spans, decoration, auto-height/auto-width and RTL/bidirectional checks |
| Colors and tokens | Foreground/fill/border colors, palettes, named color/type/spacing tokens | Linked token references, variable modes, reusable style inheritance, consistent gradient editing |
| Fills, strokes and effects | One border, fill, global radius, opacity, simple shadow/effect presets | Independent corners, dash/cap/join controls, multiple fills/strokes, shadow parameters, clipping/masks and blending |
| Images | Import/replace/resize, edge-color cutout, silhouette conversion | Chroma key controls, non-destructive source/reset, visible preview, mask refinement and actionable failures |
| Vector composition | SVG imports and recolorable vector icons; group movement | Actual one-layer icon merge; separate future boolean/path-editing tools |
| Components and reuse | Saved layer templates and component keys | Source/instance relationship, propagation rules, instance override/reset and variant sets |
| Layout systems | Anchors, min/max width, visibility flags; CSS values in handoff | Nested flex/grid containers, gap/wrap, hug/fill sizing and content-driven reflow in the editor |
| Responsive authoring | Device selection and proportional resizing | Canonical design + explicit override scope; stable switching; responsive export across all three targets |
| Prototyping | Multiple screens, layer tap destinations, preview and Back | Overlays, hover/press/toggle triggers, scroll regions, fixed elements, richer transition behavior |
| Accessibility and QA | Solid-color text contrast, bounds/assets/overlap checks, size/readability warnings | Semantic labels/roles/focus order, keyboard and screen-reader checks, non-text contrast and state checks; manual review of layered images/gradients |
| Export and builder handoff | Visual PDF, implementation prompt, complete JSON, HTML/CSS/React/Kotlin/Swift generators | Verify responsive overrides and new styles in exports; generated code requires target-project integration and platform build checks |
| Asset governance | Bundled icons/fonts and some license/source metadata | Preserve attribution across merge/export; per-project asset registry and deduplication; clear external-asset failures |
| Collaboration and review | Local design workflow | Shared editing, comments, branch/version review, team libraries and permissions are separate product work |
| Performance and robustness | Bundled assets, limited image resolutions, local processing | Measured large-project budgets, cancellable processing, source deduplication, storage limits and recovery tests |

The source's twenty-six categories are Icons, Typography, Colors, Backgrounds, Effects, Illustrations, Images & media, Brand kit, Motion, UI components, Device mockups, Responsive layout, Projects, Layers, Interactive flows, Design system, Accessibility, Content, Data visualization, Patterns & textures, Transform & alignment, Platform kits, Assets, Export & handoff, References, and Design QA. These are navigation categories; their count is not a completeness score.

## Research-informed priorities

**Current work:** repair the requested editing paths first: Add text, image color removal, merge icons, responsive shared/override behavior, discoverable UI shapes, and corner styling. Favor explicit controls and preserved originals over silent transformations.

**Next structural work:** add real layout containers and reusable source/instance components. Figma's auto layout responds to content and child changes; Penpot uses flex/grid container concepts with direction, sizing, gap, padding, alignment and wrapping. That is more capable than multiplying coordinates by viewport ratios. [Figma auto layout](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma), [Penpot flexible layouts](https://help.penpot.app/user-guide/designing/flexible-layouts/).

Shared propagation should coexist with local changes. Sketch separates source edits from instance overrides, and Penpot explains how connected layers preserve overrides when changing variants. The recommendation to apply that principle to device layouts is an architectural inference, not a claim that these products expose the same device-scope control. [Sketch Symbols](https://www.sketch.com/docs/symbols-and-styles/symbols/), [Sketch overrides](https://www.sketch.com/docs/symbols-and-styles/overrides/), [Penpot variants](https://help.penpot.app/user-guide/design-systems/variants/).

**Then deepen styling and content authoring:** independent corners, richer strokes/fills, image mask refinement, inline text editing, reusable typography styles and better path editing. Figma distinguishes whole-shape radius, independent rectangle corners and smoothing. Penpot documents multiple fills/strokes, stroke positions/styles/caps and text sizing/direction as distinct controls. [Figma corners](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing), [Penpot color/strokes](https://help.penpot.app/user-guide/designing/color-stroke/), [Penpot text](https://help.penpot.app/user-guide/designing/text-typo/).

**Then expand prototype/review depth:** overlays, scrolling, interaction states, source inspection and versioned review. Sketch's documented prototype features include more than screen-to-screen navigation; developer handoff also includes inspection access and asset export. [Sketch prototyping](https://www.sketch.com/docs/prototyping/), [Sketch handoff](https://www.sketch.com/docs/developer-handoff/).

Chroma key should expose key color, similarity, smoothness and spill reduction, with a clear explanation that higher similarity may remove wanted foreground colors. These are established color-key controls; they do not imply semantic subject detection. Complex hair, translucent foregrounds, matching clothing/backgrounds and textured scenes need manual masking or a separate segmentation capability. [OBS chroma key](https://obsproject.com/kb/chroma-key-filter).

Accessibility findings must retain their context. A 44 px comfort warning is not the WCAG 2.2 AA minimum target-size rule: SC 2.5.8 uses 24 CSS pixels and exceptions. The existing solid-color contrast check is useful but cannot certify a rendered design with image backgrounds, alpha stacking, focus order or all interactive states. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Required evidence for this implementation

1. Add text directly from a blank editor on narrow and wide screens; edit actual content and undo insertion.
2. Use generated pixel fixtures for plain white/green/blue/custom keys, anti-aliased edges, an enclosed matching hole, partial transparency, a multicolor border, a key-colored subject and a no-match result. Check removed background alpha, retained foreground alpha and undo/reset. Do not evaluate only whether a button says “completed.”
3. Merge overlapping and separated icons with different colors, strokes, rotations and opacity. Check a single resulting layer, visual bounds, retained attribution where available, save/reload/export and one-step Undo. Test touch selection without Shift.
4. Change shared content/geometry from each device. Apply a tablet-only override, change the shared design again, and prove the override remains local while unoverridden properties update. Repeated switching must be stable. Save/reload/JSON round-trip and reset an override. Include multi-screen projects and Undo.
5. Insert UI bars through Shapes, style corners and borders, and inspect both the visible artwork and serialized values. New geometry must render consistently in SVG/PDF and be represented in handoff. Explicitly record any native-export limitations.
6. Retain the existing sideways-scroll protection, one-gesture Undo, compact embedded logo, theme, short-screen, keyboard and overflow checks. New controls must not reintroduce the prior scrolling defect.

Prior browser reports in this repository establish earlier behavior. They do not validate these new workflows. Final implementation results belong in a new change record or an appended, evidence-backed section after the changes and checks finish. Browser success does not establish Android/iOS runtime success.

## Source pointers

- `src/components/engines/ux-ui-studio-engine.tsx`: layer/project schemas, toolkit definitions, element catalog, device switching, grouping, styles, editing UI and handoff.
- `src/components/engines/ux-ui-studio-image.ts`: original Studio cutout/resize/vector conversion wrapper.
- `src/lib/image/cutout.ts`: border sampling, automatic edge/global masks and manual mask composition helpers.
- `src/components/engines/image/mask-studio.tsx`: existing image masking and repair workbench.
- `src/lib/engines/ux-ui-studio-codegen.ts`: web/native code-generation fidelity boundary.
- `src/lib/engines/ux-ui-studio-qa.ts`: scope of current contrast checks.
- `scripts/audit-ux-ui-studio-browser.mjs`: existing functional browser audit.

## Implementation in this continuation

The browser Studio now has the following implemented paths. The accompanying browser reports distinguish executed checks from remaining product gaps.

| User requirement | Result and boundary |
| --- | --- |
| Primary text tool | Text is a main tool above the canvas. The design-screen insertion control remains a round **+ only**, following the latest placement request. |
| Bigger, bolder and tighter text | Visible size, weight/Bold, tracking, line-height and alignment controls update painted SVG and saved data. Font files are inspected for their actual weight ranges; static files permit synthetic bold. Wrapping measures real text width and tracking. |
| More shapes and styles | 48 insertion presets cover geometry, search fields, inputs, navigation, cards, arrows and other UI controls. Individual corners and solid/dashed/dotted borders are editable. |
| Merge icons | Selected loaded icons and supported primitive vectors become one compound SVG, retaining transforms, colors and opacity. This is a compound-vector merge, not Boolean union/subtraction. Unsupported effects are rejected explicitly. |
| Background removal and chroma key | Local border/global color removal, selected key color, tolerance, soft alpha edges and spill suppression. Reprocessing uses the retained original; manual Erase/Restore repairs difficult regions. It remains color masking and manual repair, not AI subject segmentation. |
| Linked device views | A canonical design and field-level device overrides replace cumulative resizing. Shared changes propagate; explicit device fixes survive switching, saving, cloning and import/export. Geometry follows anchors/stretch constraints rather than stretching type or icons. |
| Responsive handoff | HTML/React preserve all device variants. The Studio can export one PDF containing mobile/tablet/desktop artboards, a builder brief and a complete editable JSON attachment with the AI prompt. |
| Screenshot reconstruction | Local English OCR plus pixel-region analysis creates editable text and flat shapes; complex/unrecognized artwork is retained as positioned image crops. The import previews actual results and warnings and adds a new logical screen. Original source layers, original fonts and semantic component structure are not contained in screenshot pixels. |

### Screenshot research and implementation boundary

Corel's [bitmap tracing documentation](https://product.corel.com/help/CorelDRAW/Documentation-Windows/CorelDRAW-en/CorelDRAW-Trace-bitmaps.html) distinguishes stroke tracing and outline tracing. That is reconstruction from pixels, rather than recovery of an original layered document. Studio combines OCR with region detection because screenshots need editable wording as well as surfaces and artwork. Its OCR uses the pinned [Tesseract.js project](https://github.com/naptha/tesseract.js) locally, with vendored worker/core/English data and license/provenance files under `public/uxui/ocr`; no screenshot upload is involved. Recognition quality depends on resolution, contrast, language and decorative typography, so the importer retains difficult detail and asks the user to review spelling and geometry.

### Remaining full-toolkit gaps

The new work does not turn the Studio into a complete Figma/Corel replacement. The audit's larger gaps still include constraint-driven flex/grid auto layout, live component-instance inheritance, Boolean path operations, node-level vector editing, richer masks/gradients/effects, collaborative editing/version history and full native UI parity for these new browser workflows. These should remain explicit roadmap items rather than claims hidden behind toolkit names.

### Executed verification, 27 October 2026

- 73 focused tests pass, covering responsive overrides and prototype-link cloning, vector/native export geometry, fonts, text-safe screenshot reconstruction, color masking, shape styling, embedded asset storage and canvas-consistent web text/icon insets. TypeScript and the production build pass. Targeted ESLint has no errors; six existing mixed-export Fast Refresh warnings remain in the asset component module.
- The production browser audit passed all 18 configurations: six browser widths in light/dark themes plus three short/landscape sizes in both themes. It exercises all 26 toolkit pages, bundled icons/fonts with asset CDNs blocked, touch fader direction/Undo, image cutout/resize/silhouette, JSON/PDF downloads, theme changes and compact logos. See `ux-ui-studio-browser-report-2026-10-27.json`.
- The merged narrow-landscape toolbar was separately rechecked in both themes. See `ux-ui-studio-landscape-report-2026-10-27.json`.
- Screenshot import was exercised with real local OCR and every external origin blocked. Five text lines, two shapes and two artwork crops were reconstructed; the recognized heading was edited and saved. Worker/core/model requests were local GETs. See `ux-ui-studio-reconstruction-report-2026-10-27.json`.
- The larger-asset check exposed repeated font/image bytes across linked views. Local drafts now retain one inline copy and resolve duplicate references before editing/export. A real 876,576-byte Inter font project exceeds 5 MiB when duplicated in the old representation; both active/draft-list copies now fit below 3 MiB before other project content. The browser check reopens the actual font-and-image design and verifies full restored bytes in its exported shared source.
- The final production toolkit run passed four phone/desktop configurations and 16 workflow checks, including real three-device PDF images, primary Text placement, the circular icon-only insertion control, typography, image repair, merged icons, shared/device overrides and embedded-asset persistence. See `ux-ui-studio-toolkit-report-2026-10-27.json`.
- Export review found text/icon layers incorrectly inheriting control padding in HTML/React. Web exports now use the canvas's text bounds and vector insets; plain text remains top aligned without clipping larger type to the old box height. Embedded font families no longer request duplicate remote font stylesheets.

These checks validate the browser Studio workflows described above. They do not establish a native app build or complete professional-tool parity.
