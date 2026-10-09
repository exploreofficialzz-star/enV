# Native backend-form parity audit

**Scope:** generic custom-backend forms and all catalog `document-backend` operations; checked against web UI, shared catalog, document API route, and Python processor. This is a source-level audit; platform compilation/runtime checks are recorded separately in GitHub Actions.

## Shared form contract

### Generic custom backend

| Property | Web source of truth | Android/iOS parity |
|---|---|---|
| Input | One freeform text area; label is absent, placeholder `Enter the input required by this tool…`; no extra Options JSON editor | Android/iOS use the same placeholder; custom requests serialize `options: {}` |
| Run | `Run tool`; button shows `Running…` while request is in flight | Same visible labels and busy state |
| Results | Text output with Copy and Download (`env-${toolId}.txt`) | Android and iOS now provide both actions and use the same filename |
| Reset | No generic reset action in the web custom form | Android's extra Reset control is hidden for non-document backend forms; iOS has no custom Reset |
| Error/cancel | Error shown by the shared result UI; no cancel action | Native error surfaces remain platform-native; no cancel control is exposed |

### Document forms (applies to every operation in the matrix below)

| Property | Verified behavior |
|---|---|
| File input | Required at Run time (web throws `Choose the document or file required by this tool.`); file control is not HTML-`required`. Accepted extensions: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.xls`, `.png`, `.jpg`, `.jpeg`. Android and iOS pickers use corresponding MIME/UTType filters. |
| Count | UI enables multi-select when the operation name matches `merger`, `comparison`, or `splitter`; otherwise single-select. API requires at least one file; processor rejects comparisons with fewer than two. No generic maximum count is imposed. |
| Size/MIME validation | No client-side size limit or MIME sniff/size cap is present in the web form or route. The route buffers each file and has no explicit per-file size check. Unsupported operation/extension/tool-library constraints surface as processor/API errors. |
| Visible fields, order | File picker first; `Pages / range` second when the op contains `page-` or `splitter` (placeholder `1,3-5`, initial value `1`); `Watermark text` last when the op contains `watermark` (initial value `enV`). No select choices or numeric bounds exist in this generic UI. |
| Request parameters | The form always posts JSON `{pages, text}` plus the operation and `outputName=${op}-output`, even if a field is hidden. Page parsing and operation-specific behavior reside in `scripts/document/process.py`. |
| Run/loading | Button label is `Run ${label(op)}`; while busy it reads `Processing…` and is disabled. No cancel action exists. |
| Success/output | The response is automatically downloaded by web as `${op}-output` (server sanitizes the supplied name); status is `${label(op)} completed · N.N KB`. Native forms show the same status and expose a Save action for the response bytes. The result MIME/name come from the processor/route, with an operation-based fallback name. |
| Failure | API/processor messages are displayed; route converts caught failures to HTTP 400 JSON. There is no operation-specific client validation beyond file presence; processor errors are authoritative. |
| Reset | Web Reset clears files, output and error only; it preserves `pages`/`text` and remains enabled during processing. Android/iOS now match: document-only Reset, clears files/output/error/bytes but preserves field values and stays enabled while processing. |
| Layout | Web document fields are stacked in source order, with controls in a wrapping/row action group; native controls are vertically presented with native spacing. This remains a platform-native layout rather than pixel-identical responsive wrapping. |

## Operation matrix (82 catalog operations)

`Files` column uses the web rule above. `Pages` means the `Pages / range` field is shown; `Watermark` means the `Watermark text` field is shown. All labels/defaults/requiredness/limits/loading/errors/download actions follow the shared document contract above unless the notes column records processor-specific behavior.

| Operation ID | Catalog name | Multi-select | Pages | Watermark | Processor/output contract or note |
|---|---|---:|---:|---:|---|
| `document-comparison-tool` | Document Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `document-compressor` | Document Compressor | No | No | No | Original input format, compressed when supported (octet-stream MIME). |
| `document-image-extractor` | Document Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `document-merger` | Document Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `document-metadata-tool` | Document Metadata Tool | No | No | No | JSON metadata. |
| `document-page-extractor` | Document Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `document-page-numbering-tool` | Document Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `document-page-reorder-tool` | Document Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `document-print-layout-helper` | Document Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `document-screenshot-tool` | Document Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `document-splitter` | Document Splitter | Yes | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `document-text-extractor` | Document Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `document-watermark-tool` | Document Watermark Tool | No | No | Yes | Format-dependent result; unsupported format yields a processor error. |
| `docx-comparison-tool` | DOCX Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `docx-compressor` | DOCX Compressor | No | No | No | Original input format, compressed when supported (octet-stream MIME). |
| `docx-image-extractor` | DOCX Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `docx-merger` | DOCX Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `docx-metadata-tool` | DOCX Metadata Tool | No | No | No | JSON metadata. |
| `docx-page-extractor` | DOCX Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `docx-page-numbering-tool` | DOCX Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `docx-page-reorder-tool` | DOCX Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `docx-print-layout-helper` | DOCX Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `docx-screenshot-tool` | DOCX Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `docx-splitter` | DOCX Splitter | Yes | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `docx-text-extractor` | DOCX Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `docx-watermark-tool` | DOCX Watermark Tool | No | No | Yes | DOCX with watermark paragraph. |
| `image-comparison-tool` | Image Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `image-image-extractor` | Image Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `image-merger` | Image Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `image-metadata-tool` | Image Metadata Tool | No | No | No | JSON metadata. |
| `image-page-extractor` | Image Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `image-page-numbering-tool` | Image Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `image-page-reorder-tool` | Image Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `image-print-layout-helper` | Image Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `image-screenshot-tool` | Image Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `image-splitter` | Image Splitter | Yes | Yes | No | ZIP of image tiles; processor uses first file and hidden rows/columns defaults (2×2). |
| `image-text-extractor` | Image Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `image-watermark-tool` | Image Watermark Tool | No | No | Yes | Format-dependent result; unsupported format yields a processor error. |
| `images-to-pdf` | Images to PDF | No | No | No | Format-dependent result; unsupported format yields a processor error. |
| `ocr-tool` | OCR | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `pdf-comparison-tool` | PDF Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `pdf-compressor` | PDF Compressor | No | No | No | Original input format, compressed when supported (octet-stream MIME). |
| `pdf-image-extractor` | PDF Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `pdf-merger` | PDF Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `pdf-metadata-tool` | PDF Metadata Tool | No | No | No | JSON metadata. |
| `pdf-metadata-viewer` | PDF Metadata Viewer | No | No | No | JSON metadata. |
| `pdf-page-extractor` | PDF Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `pdf-page-numbering-tool` | PDF Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `pdf-page-reorder-tool` | PDF Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `pdf-print-layout-helper` | PDF Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `pdf-rotator` | PDF Rotator | No | No | No | Format-dependent result; unsupported format yields a processor error. |
| `pdf-screenshot-tool` | PDF Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `pdf-splitter` | PDF Splitter | Yes | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `pdf-text-extractor` | PDF Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `pdf-to-word` | PDF to Word | No | No | No | DOCX (PDF-to-Word conversion). |
| `pdf-watermark-tool` | PDF Watermark Tool | No | No | Yes | Format-dependent result; unsupported format yields a processor error. |
| `presentation-comparison-tool` | Presentation Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `presentation-compressor` | Presentation Compressor | No | No | No | Original input format, compressed when supported (octet-stream MIME). |
| `presentation-image-extractor` | Presentation Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `presentation-merger` | Presentation Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `presentation-metadata-tool` | Presentation Metadata Tool | No | No | No | JSON metadata. |
| `presentation-page-extractor` | Presentation Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `presentation-page-numbering-tool` | Presentation Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `presentation-page-reorder-tool` | Presentation Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `presentation-print-layout-helper` | Presentation Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `presentation-screenshot-tool` | Presentation Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `presentation-splitter` | Presentation Splitter | Yes | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `presentation-text-extractor` | Presentation Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `presentation-watermark-tool` | Presentation Watermark Tool | No | No | Yes | PPTX output (processor copy unless a specialized branch applies). |
| `spreadsheet-comparison-tool` | Spreadsheet Comparison Tool | Yes | No | No | TXT unified diff; processor requires at least two files. |
| `spreadsheet-compressor` | Spreadsheet Compressor | No | No | No | Original input format, compressed when supported (octet-stream MIME). |
| `spreadsheet-image-extractor` | Spreadsheet Image Extractor | No | No | No | ZIP of extracted embedded images. |
| `spreadsheet-merger` | Spreadsheet Merger | Yes | No | No | Merged DOCX/PPTX/XLSX when supported; otherwise follows format-specific copy/fallback. |
| `spreadsheet-metadata-tool` | Spreadsheet Metadata Tool | No | No | No | JSON metadata. |
| `spreadsheet-page-extractor` | Spreadsheet Page Extractor | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `spreadsheet-page-numbering-tool` | Spreadsheet Page Numbering Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). Page-numbering IDs currently enter this page-selection branch; behavior is extraction, not numbering. |
| `spreadsheet-page-reorder-tool` | Spreadsheet Page Reorder Tool | No | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `spreadsheet-print-layout-helper` | Spreadsheet Print Layout Helper | No | No | No | DOCX print-layout returns PDF; other inputs follow format-specific processor branches. |
| `spreadsheet-screenshot-tool` | Spreadsheet Screenshot Tool | No | No | No | ZIP of rendered PNG screenshots. |
| `spreadsheet-splitter` | Spreadsheet Splitter | Yes | Yes | No | PDF page selection/extraction (non-PDF inputs attempt conversion to PDF). |
| `spreadsheet-text-extractor` | Spreadsheet Text Extractor | No | No | No | TXT (text extraction/OCR); OCR defaults to hidden language=eng. |
| `spreadsheet-watermark-tool` | Spreadsheet Watermark Tool | No | No | Yes | XLSX output (legacy .xls unsupported by this processing path). |

## Confirmed edge cases to keep visible

1. `image-splitter` matches the generic UI's `splitter` rule, so the chooser permits multiple files and shows `Pages / range`; the processor's earlier image-splitter branch consumes only the first file and reads hidden `rows`/`columns` params with defaults 2×2, not `pages`. This is a **web/backend contract inconsistency shared by the current native clients**, not a native-only regression. It should be resolved as a separate product behavior choice before changing the shared form contract.
2. OCR processors read `params.language` with default `eng`, but no language selector is exposed by the web UI (or native forms). Current result is English-default OCR.
3. There is no cancellation/abort path for long document-processing requests in the web contract; native parity currently preserves that behavior.
4. Although the UI accepts `.xls`, the Python processor's spreadsheet path is implemented for `.xlsx`; legacy `.xls` may fail in processing and should return a visible backend error. No frontend-only MIME/size restriction is inferred from this.
5. The request's `${op}-output` filename has no guaranteed extension; clients should rely on the response MIME/type/name or platform Save dialog rather than inventing a suffix.

## Regression checks

- `npm run check:native-backend-forms` guards custom fields/request payload, all 82 document operation IDs, chooser multiplicity, visible conditional fields, output affordances, and Reset semantics.
- `npm run check:native-ui-parity` guards the current Android detail stack/home-search model and shared native width/typography decisions.
- `npm run check:native-backend-dispatch` protects specialized backend dispatch precedence.

## Source references

- Web forms: `src/components/engines/backend-tool-engine.tsx`, `src/components/engines/document-tools-engine.tsx`
- Catalog: `apps/shared/catalog.json`
- API validation/response headers: `server/routes/api/backend/documents.post.ts`
- Processor operation dispatch, field use, MIME/output decisions: `scripts/document/process.py`
- Native forms/dispatch: `apps/android/app/src/main/java/com/chastech/env/NativeBackendToolForm.kt`, `apps/ios/enV/ToolViews.swift`

## Allowlist remediation update (2026-10-09)

- **Fixed:** `server/routes/api/backend/documents.post.ts` previously allowed only 53 operation IDs while the catalog advertised 82 `document-backend` operations. The API now allowlists the exact 82 catalog operations, so catalogued operations reach the processor instead of being rejected immediately as “Unsupported document operation.”
- The processor remains authoritative for operation/file-format-specific support. An allowed operation can still return a clear processor error for an unsupported input format or a missing processing dependency; this change does not claim every operation succeeds for every accepted file type.
- **Regression guard:** `scripts/check-native-backend-forms.mjs` now compares the route allowlist against the catalog operation set, checking exact coverage and duplicates.
- **Validation status:** Run `npm run check:native-backend-forms` before merge/push; platform integration/runtime processing still requires CI/deployed-backend validation.
