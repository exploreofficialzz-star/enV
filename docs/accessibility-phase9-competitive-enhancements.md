# enV Accessibility — Phase 9 competitive enhancements

**Date:** 12 October 2026
**Goal:** Make the Accessibility Studios outperform free tools and challenge paid tiers of axe, Stark, and WAVE on the jobs developers do every day.

## What was already strong in Phase 8

- Real APCA-W3 implementation (not just marketing)
- Color-blindness matrix simulation (protanopia, deuteranopia, tritanopia, achromatopsia)
- One-click Apply corrections for failing contrast
- Multi-surface preview (button, link, card, input, dark/light)
- Focus playground with dark + forced-colors modes
- Studio architecture (8 focused studios, not 55 templates)
- JSON/CSV export with source evidence
- 100% local processing

## Phase 9 changes implemented in this package

### 1. Color Contrast Studio — competitive core

- **WCAG 2.2 + APCA side-by-side** in the main result panel (no longer buried)
- **Color-vision quick check** visible in Check mode (compact strip) so users do not need to switch tabs to see simulations
- Full side-by-side vision preview retained in Test mode, with clearer competitive messaging
- **One-click fixes** now surface automatically in Check mode when the selected target fails (not only in Coach / fix)
- Apply buttons are full-width on mobile for better touch targets
- Stronger privacy + competitive copy: free features others often paywall

### 2. Mobile / touch UX

- Studio mode tabs: larger min-width, snap scrolling, hidden scrollbars, clearer active state
- Mobile hint under tabs (“Swipe modes sideways if needed”)
- Touch targets kept at min-h-11 (44px+)

### 3. Positioning / copy

- Studio descriptions updated to call out APCA, one-click fixes, full vision simulation, local processing, and free access to features others lock
- In-UI messaging emphasizes: no upload, no account, no extension

## Why this helps against big players

| Big-player weakness | enV response |
|---------------------|--------------|
| Stark locks most vision simulations | Full simulation free + always visible quick check |
| axe / WAVE need extension or upload | 100% local, zero extension risk |
| Paid tiers for advanced workflows | Core daily jobs (contrast fix, focus CSS, alt coach) free |
| Cluttered overlays / hard-to-locate results | Clean studio UI, multi-surface preview, apply-in-place |
| APCA rare in free tools | Side-by-side with WCAG in the primary result |

## Intentionally not claimed

- Full-site crawling, CI governance, Figma plugins, or enterprise reporting (those remain axe/Stark strengths)
- Automated “WCAG certification” (no honest tool can claim that from color pairs alone)

## Files touched

- `src/components/engines/accessibility-engine.tsx` — UI, modes, vision, fixes, mobile tabs
- `src/lib/accessibility-studios.ts` — stronger studio descriptions and keywords

## Recommended next steps (for the agent / team)

1. Deploy and retest Color Contrast Studio on mobile + desktop
2. Mirror the same “show fixes when failing” pattern in other studios where applicable
3. Add a short “Why this is free & local” note on the Accessibility category landing page
4. Keep the Phase 8 trust/reproducibility work for the live audit scanner

## Success test

A user should be able to say:

> “I fixed a failing contrast pair, saw the color-blind simulations, got APCA + WCAG numbers, and exported CSS tokens — without installing an extension or creating an account.”
