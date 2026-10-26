# Horizontal Studio editing

Numeric styling now uses vertical faders in the horizontal tool strip. Values change only after a clearly vertical gesture; sideways touch gestures browse the strip. Keyboard and assistive controls remain adjustable, with one undo checkpoint for a drag. Text size changes the actual type size, while Box width controls wrapping separately. Visual scale controls and the corner handle scale the letters with the text frame. The brand lockup is bounded in both embedded and full-screen modes. Short editing windows scroll newly opened shelves into view.

The editor now uses one horizontally scrolling action row. Color, Shape, Effects, Adjust, Text, Resize and Cutout take the movement controller's place in a bounded editing tray. Close returns to movement. Exact settings remain in More. Tool choices, color options, fonts, icons and image actions scroll sideways rather than wrapping into extra rows.

The main Add button always starts on All 26. Selecting a category closes that popup and opens its controls beside the artboard; selecting an actual component, font or icon returns to editing with the asset applied. Look closer shows enlarged selected artwork and a strip of selectable layers. New images preserve their proportions when fitted into a mockup.

The main insert button visibly says **+ Add**. A selection bar keeps **Delete** and **Done** available above the controllers. Done keeps the item and clears its selection so users can add the next item; Delete clears selection and supports Undo. The toolkit's labelled Cancel closes the chooser without adding anything. These actions are implemented in React, Compose and SwiftUI.

Movement, scaling and rotation support press-and-hold, with a short initial delay and repeat until release. A gesture creates one undo checkpoint. Cancellation, selection changes and unmount stop the repeat. The implementations use React pointer/keyboard events, Compose pointer gestures/coroutines, and SwiftUI gestures/tasks.

Image actions run on-device: replace, visual resize, pixel-size reduction, adjustable plain-background cutout, and vector silhouette conversion. Cutout removes matching areas connected to the image edge; it is not AI subject segmentation. Make icon creates an SVG path that can be recolored and exported. Undo retains the original. Native processing downsamples before allocating full editing buffers.

Web PDF handoff includes the rendered artboard, AI implementation prompt, a readable specification and the complete project JSON as a PDF attachment. Large font/image data is retained in the attachment instead of printed across hundreds of pages. Embedded typefaces accompany the rasterized SVG. Native PDFs keep their readable appendix and separate editable JSON exports.

Editable JSON retains the design, assets and AI prompt without duplicating embedded fonts/images inside generated source strings. HTML, React, Kotlin and Swift source downloads remain separate. This keeps the sample export within the importer limit and lets it round-trip back into Studio. PDF text normalizes typographic punctuation for the built-in document font.

## Verification

- Expanded browser regression checks all 26 toolkits and 18 screen/theme configurations, including narrow phones, landscape and keyboard-sized screens.
- Real pointer holds verify continuous movement, release cancellation and one-step undo.
- A generated image fixture verifies proportionate resize, transparent background, retained foreground and real vector conversion.
- PDF download is parsed to check its page count and recover the actual font and SVG from its complete JSON attachment.
- Developer Studios integration retains export/prototype, privacy, overflow and axe checks.
- Kotlin unit tests, lint, APK packaging and Swift grammar checks run locally; authoritative CI runs Android release/emulator and Xcode simulator/signing/tests.
- `scripts/create-ux-ui-studio-demo.mjs` builds a thirteen-layer Focus daily planner entirely through the visible Studio tools, then downloads the PDF, editable JSON and AI prompt and imports the real JSON into a clean browser. Set `EN_V_BROWSER_AUDIT_BASE_URL` and `ENV_STUDIO_DEMO_DIR` to choose the deployment and output directory.

## Interaction references

[Video.Guru's official listing](https://play.google.com/store/apps/details?id=videoeditor.videomaker.videoeditorforyoutube) describes its layered photo, audio, text and effect workflow. [InShot's official tools page](https://inshotapp.com/download/) provides related examples of grouped editing tools. The single sideways action row and replacement controller panel follow the requested interaction and supplied screenshot.

Local result: 18 passing screen/theme configurations after retrying the initial preview-listener startup race; the original error is retained in the [browser report](ux-ui-studio-horizontal-browser-report-2026-10-26.json). The real pointer/image/PDF checks pass, the four-route Developer audit has zero errors or serious/critical axe findings, and the web test suite, release build, TypeScript and ESLint (zero errors) pass. Android unit tests/lint/APK packaging and a forced clean Kotlin compilation pass. Xcode verification runs in authoritative CI.

## Resumed touch and logo verification

The continuation resumed from `e7e8cd99`, which already implements vertical, direction-aware faders and a bounded 62 × 28 px Studio logo. The same behavior was verified on [the live Studio](https://envtools.store/tools/developer/ux-ui-studio).

The browser audit now starts real touch swipes on each numeric styling control: Text size, Box width, Turn, Roundness, Border and Visibility. Sideways gestures must move the strip while preserving every saved layer property. Vertical touch drags must change a saved value, and one Undo must restore all layer properties. Mouse adjustment and keyboard text-size checks remain covered.

Logo checks measure both fullscreen states and all three embedded device previews. The 390 px phone run also resizes the embedded editor through 320, 768 and 1440 px widths before returning to fullscreen.

Results on 26 October 2026:

- Local browser audit: 18 viewport/theme configurations passed, including short phones, landscape and a keyboard-sized viewport; zero runtime exceptions.
- Live browser audit: 390 × 844 and 390 × 430, each in light and dark themes, passed; zero runtime exceptions.
- Studio responsive/code-generation checks, TypeScript, production build and ESLint for the changed audit script passed.
- This continuation verified the browser application. Android/iOS builds and device execution were not run.

Evidence: [local report](ux-ui-studio-horizontal-browser-report-2026-10-26.json), [live report](ux-ui-studio-touch-logo-live-report-2026-10-26.json), [vertical controls](../screenshots/ux-ui-studio-selected-styling-light.png), and [embedded logo](../screenshots/ux-ui-studio-embedded-brand-light.png).
