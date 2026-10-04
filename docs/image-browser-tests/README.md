# Images — browser tests

Real-Chromium tests for the Images studios (Playwright for Python + Pillow). Each test opens a tool, drives the UI, **downloads the exported file and verifies the pixels/bytes with Pillow** (sizes, exact crops, alpha, EXIF/GPS removal, ICO frames, ZIP contents…).

These were written for a sandbox without `node_modules`, so `build.sh` bundles `src/components/engines/image-engine.tsx` with esbuild and shims the few UI packages (`lucide-react`, `clsx`, `tailwind-merge`, `cva`, router). They run **unstyled** — they prove behaviour, not visual design.

```bash
pip install playwright pillow numpy && playwright install chromium
cp -r docs/image-browser-tests /tmp/h && cd /tmp/h          # tests expect the folder at /tmp/h (or set IMG_TEST_DIR)
python3 make_fixtures.py && ./build.sh                      # set ESBUILD / REACT_DIR if esbuild or react are not on the default path
python3 test_effects.py                                     # …or any test_*.py
```

Suites: effects, resize, compress, platform, meta, crop, fav, analysis, calc, wm, mask, compose, annot, robust (large/odd/corrupt files + legacy fallback).
