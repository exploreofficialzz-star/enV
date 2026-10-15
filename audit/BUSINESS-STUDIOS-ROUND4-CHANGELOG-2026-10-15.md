# Business Studios Round 4 Changelog

- Added real client-side PDF generation using the project's existing `pdf-lib` dependency.
- Added adjacent Print and Download PDF buttons to document and payslip modes.
- Added Print results and Download results PDF to finance calculator modes.
- Export includes multi-line item detail, totals, tax, discount, document metadata, and optional local logo embedding.
- Added multi-page text wrapping and safe output filenames.
- Isolated document/payslip/calculator content during browser printing.
- Renamed native Android and iOS text export actions to `Download output (.txt)` while preserving their platform-native save dialogs.
- Expanded the Business Studios source audit to guard PDF-download and print functionality.
- Recorded research sources, validation results, and unverified release checks in `BUSINESS-STUDIOS-ROUND4-DOWNLOAD-AND-PRINT-ENHANCEMENT-2026-10-15.md`.

## Follow-up note — Round 5

Native Android/iOS PDF export and editable meeting-form fields were added in Round 5. See `BUSINESS-STUDIOS-ROUND5-CHANGELOG-2026-10-15.md` and `BUSINESS-STUDIOS-ROUND5-IMPLEMENTATION-AND-VERIFICATION-2026-10-15.md`; native PDF layout is still text-first and full platform runtime verification remains blocked.
