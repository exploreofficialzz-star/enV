# enV Accessibility — Phase 10: Challenging the full systems

**Date:** 12 October 2026
**Target:** Compete with the *whole* axe / Stark / WAVE product systems on the daily jobs developers actually do — not only their free tiers.

## Strategy

We do not copy enterprise crawling, Figma plugins, or CI governance.
We become the tool teams still open **even when they already pay for axe or Stark**, by winning on:

1. Depth on daily single-purpose work
2. Privacy (nothing uploaded)
3. Zero extension / zero account friction
4. Free access to features they lock behind paid plans

## Implemented in this package

### Color Contrast Studio (core weapon)
- WCAG 2.2 + APCA side-by-side in the primary result panel
- Color-vision quick check always visible in Check mode
- Full side-by-side vision simulation in Test mode
- One-click fixes surface automatically when the selected target fails
- Richer token export: CSS variables + Tailwind + JSON
- Competitive/privacy messaging in-product

### Focus State Studio (production-ready CSS)
- Production-grade `:focus-visible` CSS generator including:
  - Dark mode outline color
  - Forced-colors / Windows High Contrast rules
  - `:focus:not(:focus-visible)` fallback
  - Large-control variant
  - Verification checklist in the output
- Live keyboard playground that applies the current ring width/offset/color
- Dark surface + forced-colors toggle
- Playground available in more modes (check/generate/preview)

### Mobile / UX
- Mode tabs with snap scrolling, min touch width, clearer active state
- Mobile hint for horizontal swipe
- Full-width Apply buttons on small screens

### Positioning copy
- Studio descriptions emphasize APCA, one-click fixes, full vision simulation, local-only, free access to paid-elsewhere features

## How this challenges the full systems

| Full-system strength | How enV responds |
|----------------------|------------------|
| Stark paid vision sims | Free full simulation + always-on quick check |
| axe extension friction | No extension ever |
| Enterprise upload / cloud | 100% local by design |
| Paid “advanced” contrast workflows | Free APCA + apply-in-place + token export |
| Focus guidance buried in docs | Live playground + copy-ready production CSS |

## Still out of scope (by design)
- Full-site continuous monitoring
- Native Figma plugin
- Enterprise SSO / seat management
- Claiming automated WCAG certification

## Files changed
- `src/components/engines/accessibility-engine.tsx`
- `src/lib/accessibility-studios.ts`
- `docs/accessibility-phase9-competitive-enhancements.md`
- `docs/accessibility-phase10-system-challenge.md`

## Deploy checklist
1. Merge / copy these files into the main project
2. Build and open Color Contrast Studio — verify APCA side-by-side + vision strip + one-click fix
3. Open Focus State Studio → Generate — copy CSS and Tab through the playground
4. Test mode tabs on a ~375px viewport
5. Confirm privacy lines remain visible

## Success criterion
A developer who already has axe Pro or Stark Team should still prefer enV for:
- fixing a contrast pair in under 30 seconds
- generating focus CSS they can paste today
- checking color-blind safety without uploading anything
