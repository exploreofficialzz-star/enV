# enV Business Studios — Round 4 Download & Print Enhancement

Date: 2026-10-15

## User-requested change

Place a clear **Download PDF** action beside Print on Business document and payslip outputs. Improve calculator results so users can export a standalone PDF without opening the browser print dialog.

## Implemented

### Web / TypeScript
- Added client-side PDF creation with the existing `pdf-lib` dependency; no PDF upload endpoint is used by the new action.
- Invoice, receipt, quotation, estimate, and purchase-order modes now show **Print** and **Download PDF** actions together.
- Document PDF contains business/client identity, document number/date, line descriptions, quantities, unit prices, line totals, subtotal, discount, tax, and grand total.
- Optional PNG/JPEG business logo is embedded locally when supported; invalid optional logo data does not block export.
- Payslip mode has adjacent Print and Download PDF actions and retains its DEMO-only disclaimer in the exported PDF.
- Finance metric modes have **Print results** and **Download results PDF** actions.
- Generated PDFs include title/creator metadata, wrap long lines, create additional pages as needed, and use sanitized filenames.
- Print CSS isolates the relevant document, payslip, or calculator result, rather than printing the entire editor and all form controls.
- Download actions report a fallback message if PDF generation fails, directing the user to Print.

### Android / Kotlin
- Renamed the native business output action to **Download output (.txt)**. It continues to use Android's native document picker and writes the result locally through the content resolver.

### iOS / Swift
- Renamed the native business output action to **Download output (.txt)**. It continues to use SwiftUI's native file exporter and a plain-text document.

## Competitive research translated into product requirements

Public competitor materials increasingly emphasize one-click PDF export, browser-local generation, no account, reusable local business details, and multiple export formats. Relevant sources:

- https://invoiceprivate.com/en/blog/best-private-invoice-generators — privacy and export comparison; the author identifies its own commercial interest, so claims about competitors are treated cautiously.
- https://invoiceprivate.com/en/blog/invoice-generators-without-signup — highlights that no-signup does not necessarily mean local-only PDF generation.
- https://freesimpleinvoicing.com/privacy — explains a browser-print-to-PDF approach and the privacy boundaries around hosting logs.
- https://billable.dev/blog/free-invoice-generator-no-signup — comparison of download friction, saved drafts, exportability, and data custody; the author is a competitor in the comparison.

These are useful directional signals, not independent proof that enV is superior. The Round 4 change focuses on a concrete friction point: a dedicated download action alongside Print.

## Verification

Passed:
- `node scripts/check-business-studios.mjs` — source audit now asserts local PDF export implementation and adjacent print/download actions, plus legacy route and formula fixtures.
- `node scripts/check-catalog.mjs` — 10,000 tool records, 10,000 unique IDs, 42 categories; passed.
- `node --check scripts/check-business-studios.mjs` — passed.

Not verified in this environment:
- Full TypeScript typecheck and production Web build. `npm ci` could not finish because dependency installation stalled; no `tsc` or Vite executable became available.
- Browser interaction tests for actual PDF bytes, logo embedding, download prompt, and print preview.
- Android Gradle/JUnit and iOS Xcode/XCTest execution.
- Visual rendering on physical mobile devices and multiple browsers.

## Honest gap status

| Area | Status |
|---|---|
| Web document PDF download button | Implemented; build/browser verification pending |
| Web payslip PDF download button | Implemented; build/browser verification pending |
| Web calculator result PDF download | Implemented; build/browser verification pending |
| Web print isolation | Implemented; browser verification pending |
| Android native download action | Clear native text export action; native PDF export remains a future parity item |
| iOS native download action | Clear native text export action; native PDF export remains a future parity item |
| Competitive superiority claim | Not claimed; requires reproducible task and output comparisons |
