# Local-first execution architecture

## Decision

The three products remain independently implemented:

- **Web:** TypeScript in the browser.
- **Android:** Kotlin and Android platform APIs.
- **iOS:** Swift and Apple platform APIs.

The products share **declarative contracts, catalog metadata, test vectors, and route policy only**. They do not share executable processing code, a WebView runtime, or a cross-platform JavaScript bridge.

Render is a narrow boundary for operations that genuinely need server-side access: remote URL acquisition, provider-held secrets, hosted AI, unsupported codecs or formats, and fidelity-sensitive conversions that have no acceptable on-device implementation. A local failure must not silently upload the input.

## What the research found

Browser workers can move CPU-heavy JavaScript away from the UI thread. Transferable `ArrayBuffer`, `ImageBitmap`, and `OffscreenCanvas` values avoid unnecessary copies, but workers cannot access the DOM and OffscreenCanvas must be feature-detected. WebCodecs is local and powerful, but it does not demux or mux containers and codec availability varies by browser and device. Shared-memory WebAssembly also requires cross-origin isolation. [1] [2] [3] [4]

Android's recommended pattern is a main-safe repository or processor API. Coroutines use `Dispatchers.Default` for CPU work and `Dispatchers.IO` for blocking file access. WorkManager is for work that must survive process exit or reboot, not every button click. Storage Access Framework URIs should be streamed or staged only when a library requires seeking. ML Kit barcode scanning, PdfRenderer, Media3 Transformer, and Android graphics APIs provide local building blocks. [5] [6] [7] [8] [9]

iOS has equivalent local capabilities in Vision, VisionKit, Core Image, ImageIO, PDFKit, AVFoundation, AVFAudio, and Swift structured concurrency. PhotosPicker and security-scoped file URLs are privacy-preserving input boundaries. BackgroundTasks are system-managed and do not provide an always-on worker. Heavy work must be cancellable and isolated from MainActor UI updates. [10] [11] [12] [13] [14]

The current repository already performs browser-local image processing, QR/barcode generation, screenshot composition, mockup rendering, file conversion, and parts of audio/video processing. However, native Android and iOS route many image, barcode, screenshot, mockup, document, and media operations to Render. The native matrix also infers backend coverage from broad categories and engine types, which is not proof of a working handler.

## Target execution model

Every operation has one deterministic policy:

1. Use an implemented local handler for the current product.
2. If the operation is explicitly remote-required, show the remote mode and the data boundary before sending anything.
3. If no approved implementation exists, report **unsupported/Web-only** rather than showing a misleading online or local status.
4. Never retry a local error by uploading the same file without an explicit user choice.

Each handler will eventually expose the same semantic contract in its native language:

```text
input -> validate -> execute(progress, cancellation) -> result(mime, name, bytes/text, mode)
```

The contract is behavioral, not executable shared code. Each platform owns its implementation and tests.

## Platform plan

### Web TypeScript

Keep the current local screenshot and mockup scene renderers. Add dedicated workers for image pixel transforms, audio decode/analysis, and other measured CPU bottlenecks. Use transferables and release ImageBitmap resources promptly. Retain the main-thread canvas fallback. Use PDF.js or another licensed local engine for visible-page rendering and text operations, with strict page, pixel, archive, and time limits. Keep FFmpeg/WASM optional and capability-gated rather than a default dependency. Keep Render conversion isolated to unsupported containers and explicit server jobs.

### Android Kotlin

Create processing boundaries around URI-based input and file-backed output. Replace full `readBytes()` conversion flows with suspend processors using `ContentResolver`, injected dispatchers, bounded dimensions, cancellation, and progress. Add local image operations with Android graphics, barcode scan/generation with CameraX plus bundled ML Kit and a vetted encoder, PDF page rendering with PdfRenderer, and supported media transforms with Media3 Transformer. Use WorkManager only for restartable batches. Keep Office conversion and remote URL work explicitly remote until a tested native implementation exists.

### iOS Swift

Refactor file handling around security-scoped URLs, file coordination, temporary files, and async cancellation. Add ImageIO/Core Image for images, Vision/VisionKit for OCR and barcode recognition, Core Image for QR generation, PDFKit for PDF viewing/text/page operations, and AVFoundation/AVFAudio for supported media work. Use Swift Package Manager boundaries after the first contracts stabilize. Keep high-fidelity Office conversion, remote URL work, hosted AI, and unavailable codecs remote-required with visible consent.

## Phases

1. **Execution truth:** replace inferred native coverage with explicit per-operation capability records and make CI reject phantom handlers.
2. **Contracts and routing:** version input/output schemas, execution modes, limits, permissions, progress, cancellation, and consent behavior.
3. **File/concurrency foundations:** workers on Web, URI/dispatcher processing on Android, coordinated file access and async processing on iOS.
4. **Local image and barcode:** native resize/crop/metadata and offline barcode capabilities; preserve Web local generation.
5. **Screenshots, mockups, documents:** native composition/PDF/OCR where platform APIs are adequate; keep browser renderers local and deterministic.
6. **Media expansion:** add platform-supported transforms one operation at a time; keep unsupported codecs and remote acquisition on Render.
7. **Scale:** shard and lazily load registry metadata, digest manifests, generate typed bindings, and run cross-client fixtures without sharing executable engines.

## Current implementation slice

This change adds the versioned execution-policy contract and CI validator. It does not claim that Android or iOS already implement every local-capable operation. That distinction is intentional: the next native feature work will add a real handler and test before changing the policy from unsupported/remote to local.

## References

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API "MDN Web Workers API"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects "MDN Transferable objects"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas "MDN OffscreenCanvas"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API "MDN WebCodecs API"
[5]: https://developer.android.com/kotlin/coroutines "Android coroutines"
[6]: https://developer.android.com/training/data-storage/shared/documents-files "Android Storage Access Framework"
[7]: https://developers.google.com/ml-kit/vision/barcode-scanning/android "ML Kit barcode scanning on Android"
[8]: https://developer.android.com/reference/android/graphics/pdf/PdfRenderer "Android PdfRenderer"
[9]: https://developer.android.com/media/media3/transformer "Android Media3 Transformer"
[10]: https://developer.apple.com/documentation/vision "Apple Vision"
[11]: https://developer.apple.com/documentation/photokit/bringing-photos-picker-to-your-swiftui-app "Apple PhotosPicker"
[12]: https://developer.apple.com/documentation/pdfkit "Apple PDFKit"
[13]: https://developer.apple.com/documentation/avfoundation "Apple AVFoundation"
[14]: https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html "The Swift Programming Language — Concurrency"
