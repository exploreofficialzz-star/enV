# Local screenshot OCR assets

These files are loaded only after the user requests screenshot reconstruction.
Screenshot pixels are sent to a local browser worker, never an external OCR API.

Pinned source packages:

- `tesseract.js` **7.0.0**, Apache-2.0: https://github.com/naptha/tesseract.js
- `tesseract.js-core` **7.0.0**, Apache-2.0: https://github.com/naptha/tesseract.js-core
- English LSTM model `4.0.0_best_int` from `@tesseract.js-data/eng` **1.0.0**:
  https://github.com/naptha/tessdata . The npm packaging declares MIT; the
  underlying Tesseract trained data is distributed under Apache-2.0:
  https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE .

The Apache license texts and the worker's bundled third-party notices are kept
beside these assets. `LICENSE-traineddata.txt` was retrieved from the upstream
trained-data repository's `LICENSE` file. The core `.wasm.js` files include their
WASM bytes and do not fetch a runtime CDN. Scalar, SIMD and relaxed-SIMD LSTM
builds are included so browsers can select an appropriate local core.

Refresh package-owned assets with `node scripts/vendor-studio-ocr.mjs` after
`npm ci`. Keep the trained-data license and this provenance notice. The generated
`manifest.json` records every vendored package-owned file's SHA-256 and byte size.
The small client speaks the pinned Tesseract.js worker's job protocol to permit
immediate termination during model initialization; changes to the pinned worker
must be checked against the real screenshot reconstruction browser audit.
