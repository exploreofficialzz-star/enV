# Studio interaction fixes

The toolkit search now returns insertable icons, elements, shapes, font families,
presets, color tokens and tools in one place. Queries use separate words and common
UI synonyms: “home page icons” finds bundled home/house vectors. Remote icon
search supplements the bundled results. Empty results, clearing and unavailable
online catalogs have explicit states. The mobile search input fits its pill and
uses a 16px font to avoid focus zoom.

Search inserts each icon as a new layer, even when another icon is selected.
Multi-select includes a touch-accessible checklist; tapping a selected layer in
this mode does not move it. Merged vectors retain their bounds without another
two-pixel inset and keep the top selected stacking level. The built-in home icon
can merge too. Unsupported or locked layers stay separate; Undo restores sources.
This is a compound vector merge, preserving the original paths and colors.

Chroma key opens color-picking mode for the selected image. Users can tap the
artboard or drag over an original-image preview with a pixel loupe, inspect the
swatch and apply the key. Sampling accounts for SVG rotation and centered image
cropping, reads original pixels after an earlier key, and avoids starting a drag.
The preview buffer is bounded while the sampled color remains at source resolution.
The mobile panel wraps and scrolls vertically so sampling controls stay reachable.

Screenshot reconstruction defaults to the current mockup dimensions and device.
Contain and cover use a uniform scale for geometry, text, outlines and artwork;
cover overflow is preserved through saved projects and JSON imports. Users can
choose source dimensions instead. Replacement text is measured in the actual
preview font against OCR bounds to reduce overflow and incorrect wrapping.
Recognized text can be corrected before import, and an original-image overlay
helps review alignment. Processing remains local and creates a new screen.

Validation: 79 focused tests, typecheck, changed-source ESLint, production build,
developer catalog/platform/privacy checks, and 448 executable developer route
smokes passed. The existing toolkit browser audit passed 12 checks across light
and dark mode. The new interaction audit passed at 390×844, 320×568, 1440×1000
and 390×430, including real offline OCR, pixel alpha checks, touch merge/Undo and
reopening cropped screenshot geometry. See the adjacent JSON report for results.

Run `npm run check:ux-ui-studio` and, with `npm run dev` running,
`node scripts/audit-ux-ui-studio-interactions.mjs` to repeat the focused checks.
The short viewport approximates keyboard-constrained space; native keyboard
behavior and exact recovery of original fonts/design layers are not claimed.
