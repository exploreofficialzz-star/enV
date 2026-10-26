# UX/UI Studio toolkit and selection redesign

The Studio now lets a person inspect an asset, insert it, and edit its appearance beneath the movement controls. The 26 October follow-up makes the interface monochrome in the effective user theme and puts visual editing before exact values. New projects open fullscreen; the old web implementation hid selection styling in that mode. The background and device frame are selectable and expose canvas settings. The implementations are React/TypeScript, Kotlin/Compose, and Swift/SwiftUI.

## Toolkit review

All 26 entries have a visual specimen and a relevant editing, insertion, import, review, or export action. Shared libraries remain accessible from their dedicated category pages.

| Toolkit | Available workflow |
| --- | --- |
| Icons | Browse/search verified local vectors, inspect previews, insert or import an SVG |
| Typography | Watch animated specimens in the actual typeface, try custom words, pause/play, then tap to apply |
| Colors | Edit palette/token values and apply foreground or fill colors |
| Backgrounds | Select the canvas, set its color, or add a background asset |
| Effects | Preview and apply shadow, opacity, outline, corner and surface treatments |
| Illustrations | Import a vector/image illustration and style its layer |
| Images & media | Import/replace an image with a visible sample before insertion |
| Brand kit | Maintain color and typography tokens and reusable assets |
| Motion | Edit rotation and supported transition/interaction properties |
| UI components | Inspect miniature control samples and insert editable layers |
| Device mockups | Switch between mobile, tablet and desktop frames |
| Responsive layout | Adjust viewport size, visibility and layout constraints |
| Projects | Open drafts, use starters, or import a project file |
| Layers | Select, duplicate, reorder and delete layers |
| Interactive flows | Link a layer to another screen and preview navigation |
| Design system | Manage saved color, type and spacing values |
| Accessibility | Run the advisory contrast/text/target review |
| Content | Insert headings, body copy and action labels |
| Data visualization | Insert a chart whose preview reads saved numeric data |
| Patterns & textures | Preview grids/decorative treatments and add applicable layers |
| Transform & alignment | Center, position and rotate selected layers |
| Platform kits | Review target visibility and platform sizing conventions |
| Assets | Import, retain and replace supported design assets |
| Export & handoff | Download editable JSON and visual/source handoffs |
| References | Import reference images for comparison |
| Design QA | Review saved geometry, missing assets and basic readiness |

The toolkit is a bounded scrolling dialog with spaced cards, wrapping labels, touch targets, and keyboard focus handling on the web. Selection properties use their own scrollable area so they remain reachable on small screens. Native views use their platform's scrolling and presentation controls.

## Reliable preview assets

- **676 verified icon vectors from 12 collections**, including **55 additional design/layout icons**. Thirteen nonexistent identifiers from the previous curated list are recorded in the manifest and excluded from local choices.
- **Five actual bundled font families:** Inter, Lora, JetBrains Mono, Bebas Neue, and Caveat. Each includes its SIL Open Font License. These specimens render before any download/apply action; unavailable remote fonts have an explicit preview status.
- The same icon snapshot is shipped at `public/uxui/icons.json`, `apps/shared/uxui-icons.json` (Android's existing asset source), and `apps/ios/enV/Resources/uxui-icons.json`. Font files and attribution manifests accompany each copy.
- Refresh these generated assets from upstream with `python scripts/bundle-ux-ui-studio-assets.py`. This is a maintenance command; app runtime does not need it or its network access.
- Android renders SVGs with AndroidSVG rather than the previous path-only approximation. iOS handles SVG primitives, inherited group presentation and elliptical arcs. Web/native source handoff also preserves group paint; SwiftUI source generation converts arcs to cubic curves rather than straight segments.

## Effects research and implementation scope

Sources consulted on 25 October 2026:

1. [W3C CSS Backgrounds and Borders — drop shadows](https://www.w3.org/TR/css-backgrounds-3/#box-shadow): shadows have explicit geometry and paint, and are separate from layout. The effect previews apply real saved shadow/outline/opacity/radius values rather than showing empty labels.
2. [Apple Human Interface Guidelines — Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md): depth and translucency should establish hierarchy while retaining legibility. The catalog distinguishes supported surface treatments; it does not label a flat opacity treatment as a live blur or Liquid Glass simulation.
3. [MDN — FontFace.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/load): font loading resolves before the preview is presented as that typeface. Bundled families work when font CDNs are blocked; remote failures remain visible.
4. [WCAG 2.2 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): minimum target size and spacing informed the toolkit card/control layout. This change does not certify the complete application as WCAG conformant.
5. [SVG elliptical arc implementation notes](https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes) informed the endpoint-to-center conversion used for curved icon export.
6. [Iconify collection data](https://github.com/iconify/icon-sets/tree/master/json) and the original collection licenses are retained in `uxui-icon-licenses.json`; font provenance is in `uxui-fonts.json` and the adjacent OFL files.

The effects page offers concrete supported treatments. It is not a complete implementation of every possible image filter, blend mode, backdrop blur, or 3D renderer. Native gradients/pattern samples are embedded image layers, keeping existing project files portable without interpreting CSS gradient strings as native colors.

## Verification

- `npm run check:ux-ui-studio` — existing responsive/source guards plus icon/effect handoff regressions, including all 676 bundled vectors and identical native/web snapshots.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run audit:ux-ui-studio:browser` — against a running dev server or production preview, exercises all 26 tools, insertion, actual font loads, persisted styling, canvas selection and downloaded JSON at 320, 375, 390, 430, 768 and 1440 pixels in both themes with external icon/font CDNs blocked. Separate short-screen cases cover 320×568, 568×320 and 390×430.
- `npm run typecheck`, `npm run build`, focused ESLint, and `npm run check:native-no-web` are the relevant integration checks.

### Final verification — 26 October 2026

- **Browser: PASS, 18 configurations.** Normal layouts at 320×740, 375×667, 390×844, 430×932, 768×1024 and 1440×1000, each in light and dark mode, plus short-screen cases at 320×568, 568×320 and 390×430 in both themes. External font/icon CDNs were blocked. Each run visited all 26 tool pages, checked visible samples/actions, verified genuine bundled font rendering and icon insertion, edited persisted properties, selected the canvas and downloaded project JSON. No browser exceptions or horizontal document overflow were observed in the passing runs. One 30-second startup wait expired during concurrent local audits; the isolated rerun passed with a 60-second startup budget. Both the initial failure and successful rerun are retained in the report.
- The phone runs additionally exercised real pointer drags on the size slider and canvas resize handle, single-step resize undo, animated font cards, custom specimen words, pause/play, reduced motion, and one-tap font selection that creates text and embeds the actual TTF. A live system-theme change preserved the authored artwork. A rendered pixel check confirmed monochrome toolkit chrome and specimens.
- **Android/Kotlin: PASS**, actual `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug` using JDK 21, Gradle 8.9 and Android SDK 36. All 195 unit tests passed, lint passed, and the debug APK was packaged. Device/emulator checks run in the authoritative Android CI workflow.
- **Web production build and TypeScript: PASS.** Focused ESLint has zero errors; the shared asset/preview module has six development Fast Refresh warnings about mixed component/helper exports. The source guards and five handoff regressions pass, including all 676 vectors, inherited SVG paint, curved Swift arcs, preserved effects, identical asset snapshots, and JVM-safe chunks for large embedded font/image strings.
- **iOS/Swift: syntax check PASS.** The native implementation includes animated font cards, reduced-motion support, live sliders, native color pickers, local fonts/SVGs and asset exports. Xcode/iOS simulator compilation and device rendering are not available in this Linux environment and remain unverified.
- **Production preview: PASS.** The release build now copies the PGLite filesystem/WASM assets beside the relocated server module that loads them. Two packaging regressions pass, and the built server responds with HTTP 200 and hydrates Studio successfully. The expanded browser audit runs against that production preview. GitHub Production Check now repeats the Studio visual audit and retains its report/screenshots as an artifact.

The complete functional report is [the browser report](ux-ui-studio-browser-report-2026-10-26.json). Review the [light toolkit](../screenshots/ux-ui-studio-toolkit-light.png), [dark toolkit](../screenshots/ux-ui-studio-toolkit-dark.png), [animated-font specimen frame](../screenshots/ux-ui-studio-fonts-dark.png) and [visual style controls](../screenshots/ux-ui-studio-selected-styling-dark.png), and [short landscape layout](../screenshots/ux-ui-studio-landscape-dark.png).

### Visual editing for everyday users

Font cards preview the real family before it is selected, animate their specimens, accept the user's own words and provide pause/play controls. System reduced-motion preferences disable motion. Choosing a bundled font returns to the canvas with its bytes already retained; picking a font while an image/icon is selected adds visible text.

Size, rotation, corner roundness, border, opacity and text size use live drag sliders on React, Compose and SwiftUI. The web canvas also has a touch-sized corner resize handle with keyboard controls and a single undo step per resize gesture. Editor handles are removed from exported artboard images. Exact measurements, font asset details and advanced settings remain behind **More options**.

### Final visual adjustments

Square, Soft and Round choices now show the resulting shape before applying it on all three platforms. Common style controls use short labels, color swatches and live sliders. On short screens, the canvas and controls scroll together and the toolkit uses a compact horizontal tab strip. The toolkit stays inside the viewport in portrait, landscape and keyboard-sized layouts.

The complete web test suite passed locally (829 tests), as did TypeScript, the release build, full ESLint (zero errors; existing warnings remain), the native no-web guard and the five Studio handoff regressions. Dependency audit reported zero vulnerabilities. Swift grammar validation passed locally; actual Xcode compilation, simulator tests, Android release builds and the broader production checks are provided by the repository's authoritative CI workflows after pushing main.
