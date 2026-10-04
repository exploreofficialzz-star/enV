# Images category — enhancement report

All **185** Images tools now open on purpose-built studios that share one local image library. Nothing is uploaded; there are no external APIs, keys or AI services. The other categories were not modified (tools in other categories that reuse `ImageEngine` keep the original engine, preserved as `image-engine-legacy.tsx`).

## Architecture
- `src/lib/image/*` — pure, unit-tested building blocks: `geometry` (units, ratios, placement, crop handles), `pixels` (tone, levels, curves, blur, unsharp, pixelate, alpha, histogram, k-means palette, detail centroid), `resample` (Lanczos-3 / bicubic / bilinear / nearest, alpha-aware), `exif` (JPEG/PNG/WebP metadata reader + lossless cleaner + EXIF carry-over + ICO writer), `export` (detected encoders, verified MIME, target-size search), `cutout`, `layout`, `calc`, `zip`, `history`, `handoff`, `platform-presets`.
- `src/components/engines/image/*` — one studio per tool family on a shared UI kit: effect, resize, compress/convert, metadata, platform, crop, favicon, analysis, calculators, watermark, mask, compose, annotate/meme. `tool-map.ts` maps every op to a studio; `scripts/image-185-audit.mjs` fails if any Images tool is unmapped.
- Shared behaviour: sensible/auto start → live preview → manual refinement → before/after (slider, side-by-side, hold-for-original, shared zoom/pan, 1:1) → verified export. Undo/redo + per-control reset, presets, keyboard/touch support, readable errors, tool-to-tool hand-off (`Send →`) without re-downloading.

## Verification run
- 59 unit tests (`npm test` now includes them and the audit) — geometry, pixels/resampling, metadata against Pillow-written JPEG/PNG/WebP, ZIP, history, calculators, cut-out maths, layout.
- 14 real-Chromium suites (`docs/image-browser-tests`, ~110 checks): exported files were downloaded and verified with Pillow — exact sizes, pixel-exact crop/rotate/flip, Lanczos vs Pillow, alpha, GPS/EXIF removal with pixels untouched, valid multi-size ICO, ZIP contents, 24 MP photo, 8000×400 / 400×8000 / 1×1 images, corrupt / empty / HEIC-undecodable input.
- Catalog: the 185 Images descriptions were regenerated through `scripts/gen-catalog.mjs` (only those `description` fields changed; `check-catalog` passes).

## Platform sizes
12 platforms, 113 placements: 2 *official* (YouTube channel banner, …), 65 *documented* (platform figures as quoted consistently by current guides), 46 *approximate* (no spec / no such placement — shown as such, never as a requirement). Checked 2026-09-30 by web search; several platforms' own help pages could not be opened directly, so "documented" is not "confirmed on the official page". Re-verify before relying on a limit.

## Not done / known limits (honest list)
- **Not run here:** the full Vite/TanStack build, project-wide `tsc` with real `@types/react`, ESLint, and any visual check under the real Tailwind theme or on a phone — the sandbox had no `node_modules`/network. New files were type-checked with shims, bundled with esbuild and exercised in Chromium unstyled. **Run `npm run build`, `npm run lint` and a visual pass on mobile first.**
- **Not implemented from the brief:** curves editor UI (the curve maths exists in `pixels.ts` but is not exposed), clone/heal/retouch, perspective/skew/warp, layers and non-destructive stacks, localized adjustment regions for blur/sharpen (only the background-blur/redaction mask tools are local), batch mode for compress/resize/platform tools (batch exists for watermark, metadata cleaning and the splitter ZIP), per-image overrides in batch.
- **Browser-dependent:** HEIC decoding (Safari), AVIF encoding — the UI detects support and says so instead of faking it. Lossless metadata removal covers JPEG/PNG/WebP; other formats offer an explicit PNG re-encode.
- **Performance:** heavy work runs on the main thread (preview uses a downscaled proxy, export is full resolution, UI yields before long jobs). A 24 MP photo resizes/exports in seconds on a desktop but a Web Worker would be better on phones.
- Background removal is a **colour-key cut-out with manual refinement, not AI**; upscaling is **Lanczos interpolation, not learned super-resolution** — both say so in the UI. "Auto-position" in platform tools is a local detail-centroid heuristic.
