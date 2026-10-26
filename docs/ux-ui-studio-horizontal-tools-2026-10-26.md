# Horizontal Studio editing

The editor now uses one horizontally scrolling action row. Color, Shape, Effects, Adjust, Text, Resize and Cutout take the movement controller's place in a bounded editing tray. Done returns to movement. Exact settings remain in More. Tool choices, color options, fonts, icons and image actions scroll sideways rather than wrapping into extra rows.

The main Add button always starts on All 26. Selecting a category closes that popup and opens its controls beside the artboard; selecting an actual component, font or icon returns to editing with the asset applied. Look closer shows enlarged selected artwork and a strip of selectable layers. New images preserve their proportions when fitted into a mockup.

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
