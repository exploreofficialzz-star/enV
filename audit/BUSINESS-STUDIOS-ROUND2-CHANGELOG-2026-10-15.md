# Business Studios Round 2 Changelog — 2026-10-15

## Web — TypeScript / React
- Added optional target-profit input to break-even mode.
- Break-even output now includes contribution margin per unit, rounded-up break-even units/revenue, and units required for target profit.
- Added metric-specific input labels for ROI, pricing/markup, profit/margin, discount, recurring revenue, expense, and inventory.
- Added meeting title, date/time, location/link, attendees, prep notes, discussion notes, decisions, action items, and next meeting fields.
- Added local inline-style HTML email signature output and copy action; no remote image dependencies.
- Escapes user content before HTML output and only makes links clickable for HTTP(S) URLs.
- Clarified naming-generation limitations.

## Android — Kotlin
- Added target-profit break-even output and non-negative input validation.
- Added richer meeting minutes fields in the native output contract.
- Added inline-style HTML email signature output; HTML-escapes user values and restricts clickable website URLs to HTTP(S).
- Added target-profit native unit test.

## iOS — Swift
- Added target-profit break-even output and non-negative input validation.
- Added richer meeting minutes fields in the native output contract.
- Added inline-style HTML email signature output; HTML-escapes user values and restricts clickable website URLs to HTTP(S).
- Added target-profit XCTest.

## Research and QA
- Added `audit/BUSINESS-STUDIOS-COMPETITIVE-RESEARCH-AND-ENHANCEMENT-ROUND2-2026-10-15.md` with current source links, positive and negative themes, research caveats, decisions, and backlog.
- Updated `scripts/check-business-studios.mjs` with additional parity and formula guards.
- Verification: source audit passed; TSX transpilation syntax check passed; Swift parser checks passed. Full production build and device/browser verification not run.
