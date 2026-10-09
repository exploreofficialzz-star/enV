# Native Document-Backend Inventory

Generated from `apps/shared/catalog.json`; 82 active records in 82 family/operation groups.

## Verified web/backend contract

- Web UI: `src/components/engines/document-tools-engine.tsx`.
- Server route: `server/routes/api/backend/documents.post.ts`; processor: `scripts/document/process.py`.
- Web request: multipart POST to `/api/backend/documents`; append each input under `files`, and include `operation`, `params` (`{ pages, text }`), and `outputName` (`<operation>-output`).
- Web defaults: `pages` is `1`; watermark `text` is `enV`. The file chooser accepts `.pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg`; it allows multiple files for merger, comparison, and splitter operations.
- Successful responses are files. The server returns the processor MIME type and a `Content-Disposition` filename; the web downloads the file and displays `<Operation Label> completed · <size to 1 decimal> KB`.
- Errors: no selected file yields `Choose the document or file required by this tool.`; non-2xx JSON server messages surface from `{ error }`, otherwise web uses `Document service returned HTTP <status>.`.
- Both native dispatchers already target this explicit backend route. This inventory does not imply offline execution.

## Catalog inventory

| Family | Operation | Active tool ID(s) | Count |
|---|---|---|---:|
| document | `document-comparison-tool` | `document-comparison-tool` | 1 |
| document | `document-compressor` | `document-compressor` | 1 |
| document | `document-image-extractor` | `document-image-extractor` | 1 |
| document | `document-merger` | `document-merger` | 1 |
| document | `document-metadata-tool` | `document-metadata-tool` | 1 |
| document | `document-page-extractor` | `document-page-extractor` | 1 |
| document | `document-page-numbering-tool` | `document-page-numbering-tool` | 1 |
| document | `document-page-reorder-tool` | `document-page-reorder-tool` | 1 |
| document | `document-print-layout-helper` | `document-print-layout-helper` | 1 |
| document | `document-screenshot-tool` | `document-screenshot-tool` | 1 |
| document | `document-splitter` | `document-splitter` | 1 |
| document | `document-text-extractor` | `document-text-extractor` | 1 |
| document | `document-watermark-tool` | `document-watermark-tool` | 1 |
| document | `images-to-pdf` | `images-to-pdf` | 1 |
| document | `ocr-tool` | `ocr-tool` | 1 |
| docx | `docx-comparison-tool` | `docx-comparison-tool` | 1 |
| docx | `docx-compressor` | `docx-compressor` | 1 |
| docx | `docx-image-extractor` | `docx-image-extractor` | 1 |
| docx | `docx-merger` | `docx-merger` | 1 |
| docx | `docx-metadata-tool` | `docx-metadata-tool` | 1 |
| docx | `docx-page-extractor` | `docx-page-extractor` | 1 |
| docx | `docx-page-numbering-tool` | `docx-page-numbering-tool` | 1 |
| docx | `docx-page-reorder-tool` | `docx-page-reorder-tool` | 1 |
| docx | `docx-print-layout-helper` | `docx-print-layout-helper` | 1 |
| docx | `docx-screenshot-tool` | `docx-screenshot-tool` | 1 |
| docx | `docx-splitter` | `docx-splitter` | 1 |
| docx | `docx-text-extractor` | `docx-text-extractor` | 1 |
| docx | `docx-watermark-tool` | `docx-watermark-tool` | 1 |
| image | `image-comparison-tool` | `image-comparison-tool` | 1 |
| image | `image-image-extractor` | `image-image-extractor` | 1 |
| image | `image-merger` | `image-merger` | 1 |
| image | `image-metadata-tool` | `image-metadata-tool` | 1 |
| image | `image-page-extractor` | `image-page-extractor` | 1 |
| image | `image-page-numbering-tool` | `image-page-numbering-tool` | 1 |
| image | `image-page-reorder-tool` | `image-page-reorder-tool` | 1 |
| image | `image-print-layout-helper` | `image-print-layout-helper` | 1 |
| image | `image-screenshot-tool` | `image-screenshot-tool` | 1 |
| image | `image-splitter` | `image-splitter` | 1 |
| image | `image-text-extractor` | `image-text-extractor` | 1 |
| image | `image-watermark-tool` | `image-watermark-tool` | 1 |
| pdf | `pdf-comparison-tool` | `pdf-comparison-tool` | 1 |
| pdf | `pdf-compressor` | `pdf-compressor` | 1 |
| pdf | `pdf-image-extractor` | `pdf-image-extractor` | 1 |
| pdf | `pdf-merger` | `pdf-merger` | 1 |
| pdf | `pdf-metadata-tool` | `pdf-metadata-tool` | 1 |
| pdf | `pdf-metadata-viewer` | `pdf-metadata-viewer` | 1 |
| pdf | `pdf-page-extractor` | `pdf-page-extractor` | 1 |
| pdf | `pdf-page-numbering-tool` | `pdf-page-numbering-tool` | 1 |
| pdf | `pdf-page-reorder-tool` | `pdf-page-reorder-tool` | 1 |
| pdf | `pdf-print-layout-helper` | `pdf-print-layout-helper` | 1 |
| pdf | `pdf-rotator` | `pdf-rotator` | 1 |
| pdf | `pdf-screenshot-tool` | `pdf-screenshot-tool` | 1 |
| pdf | `pdf-splitter` | `pdf-splitter` | 1 |
| pdf | `pdf-text-extractor` | `pdf-text-extractor` | 1 |
| pdf | `pdf-to-word` | `pdf-to-word` | 1 |
| pdf | `pdf-watermark-tool` | `pdf-watermark-tool` | 1 |
| presentation | `presentation-comparison-tool` | `presentation-comparison-tool` | 1 |
| presentation | `presentation-compressor` | `presentation-compressor` | 1 |
| presentation | `presentation-image-extractor` | `presentation-image-extractor` | 1 |
| presentation | `presentation-merger` | `presentation-merger` | 1 |
| presentation | `presentation-metadata-tool` | `presentation-metadata-tool` | 1 |
| presentation | `presentation-page-extractor` | `presentation-page-extractor` | 1 |
| presentation | `presentation-page-numbering-tool` | `presentation-page-numbering-tool` | 1 |
| presentation | `presentation-page-reorder-tool` | `presentation-page-reorder-tool` | 1 |
| presentation | `presentation-print-layout-helper` | `presentation-print-layout-helper` | 1 |
| presentation | `presentation-screenshot-tool` | `presentation-screenshot-tool` | 1 |
| presentation | `presentation-splitter` | `presentation-splitter` | 1 |
| presentation | `presentation-text-extractor` | `presentation-text-extractor` | 1 |
| presentation | `presentation-watermark-tool` | `presentation-watermark-tool` | 1 |
| spreadsheet | `spreadsheet-comparison-tool` | `spreadsheet-comparison-tool` | 1 |
| spreadsheet | `spreadsheet-compressor` | `spreadsheet-compressor` | 1 |
| spreadsheet | `spreadsheet-image-extractor` | `spreadsheet-image-extractor` | 1 |
| spreadsheet | `spreadsheet-merger` | `spreadsheet-merger` | 1 |
| spreadsheet | `spreadsheet-metadata-tool` | `spreadsheet-metadata-tool` | 1 |
| spreadsheet | `spreadsheet-page-extractor` | `spreadsheet-page-extractor` | 1 |
| spreadsheet | `spreadsheet-page-numbering-tool` | `spreadsheet-page-numbering-tool` | 1 |
| spreadsheet | `spreadsheet-page-reorder-tool` | `spreadsheet-page-reorder-tool` | 1 |
| spreadsheet | `spreadsheet-print-layout-helper` | `spreadsheet-print-layout-helper` | 1 |
| spreadsheet | `spreadsheet-screenshot-tool` | `spreadsheet-screenshot-tool` | 1 |
| spreadsheet | `spreadsheet-splitter` | `spreadsheet-splitter` | 1 |
| spreadsheet | `spreadsheet-text-extractor` | `spreadsheet-text-extractor` | 1 |
| spreadsheet | `spreadsheet-watermark-tool` | `spreadsheet-watermark-tool` | 1 |

## Source audit notes

- The SVG→PNG converter remains separate from this inventory and Web-only: its web engine uses browser image decoding/canvas, and native coverage must remain excluded until both platforms have a real native rasterizer.
- A document operation should be marked native/backend-executable only while both platforms preserve the multipart request fields, file requirements, response bytes/MIME/filename, and observable errors.
