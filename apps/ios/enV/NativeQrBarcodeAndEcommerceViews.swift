import AVFoundation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import Vision

struct NativeBarcodeReadRecord: Identifiable, Equatable, Codable, Sendable {
    let id: UUID
    let value: String
    let format: String
    let scannedAt: Date

    init(value: String, format: String, scannedAt: Date = .now) {
        self.id = UUID()
        self.value = value
        self.format = format
        self.scannedAt = scannedAt
    }

    var safeHTTPURL: URL? {
        guard let url = URL(string: value),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil else { return nil }
        return url
    }
}

@MainActor
final class NativeBarcodeCameraScanner: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    static let historyDefaultsKey = "env.barcodeReader.history.v1"

    @Published private(set) var isRunning = false
    @Published private(set) var status = "Camera is off."
    @Published private(set) var error: String?
    @Published private(set) var results: [NativeBarcodeReadRecord] = []

    override init() {
        super.init()
        guard let data = UserDefaults.standard.data(forKey: Self.historyDefaultsKey),
              let stored = try? JSONDecoder().decode([NativeBarcodeReadRecord].self, from: data) else { return }
        results = Array(stored.prefix(50))
        for record in results {
            lastScanAtBySignature[record.format + "\u{0}" + record.value] = record.scannedAt
        }
    }

    private func persistResults() {
        guard let data = try? JSONEncoder().encode(results) else { return }
        UserDefaults.standard.set(data, forKey: Self.historyDefaultsKey)
    }

    // AVCaptureSession is mutated only on sessionQueue. The preview reads this stable
    // session reference on MainActor; all capture lifecycle operations stay serialized.
    nonisolated(unsafe) let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.chastech.env.barcode-camera")
    nonisolated(unsafe) private var configured = false
    private var lastScanAtBySignature: [String: Date] = [:]

    func start() {
        error = nil
        status = "Starting camera…"
        sessionQueue.async { [weak self] in
            guard let self else { return }
            do {
                if !configured {
                    guard let device = AVCaptureDevice.default(for: .video) else {
                        throw NativeBarcodeReaderError.cameraUnavailable
                    }
                    let input = try AVCaptureDeviceInput(device: device)
                    let output = AVCaptureMetadataOutput()
                    session.beginConfiguration()
                    session.sessionPreset = .high
                    do {
                        guard session.canAddInput(input) else {
                            throw NativeBarcodeReaderError.cameraUnavailable
                        }
                        session.addInput(input)
                        guard session.canAddOutput(output) else {
                            throw NativeBarcodeReaderError.cameraUnavailable
                        }
                        session.addOutput(output)
                        output.setMetadataObjectsDelegate(self, queue: .main)
                        let supported: [AVMetadataObject.ObjectType] = [
                            .qr, .ean13, .ean8, .upce, .code128, .code39, .code93,
                            .pdf417, .aztec, .dataMatrix, .interleaved2of5, .itf14
                        ]
                        output.metadataObjectTypes = supported.filter { output.availableMetadataObjectTypes.contains($0) }
                        session.commitConfiguration()
                        configured = true
                    } catch {
                        if session.inputs.contains(input) { session.removeInput(input) }
                        if session.outputs.contains(output) { session.removeOutput(output) }
                        session.commitConfiguration()
                        throw error
                    }
                }
                if !session.isRunning { session.startRunning() }
                let running = session.isRunning
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    isRunning = running
                    status = running ? "Scanner ready. Hold a code inside the camera frame." : "Camera did not start."
                }
            } catch {
                let message = error.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    isRunning = false
                    self.error = message
                    status = "Camera scanner unavailable."
                }
            }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if session.isRunning { session.stopRunning() }
            Task { @MainActor [weak self] in
                guard let self else { return }
                isRunning = false
                status = "Camera stopped."
            }
        }
    }

    func setStatus(_ message: String) {
        status = message
    }

    func setFailure(_ message: String) {
        error = message
        status = message
    }

    func addResult(value: String, format: String) {
        guard !value.isEmpty else { return }
        let signature = format + "\u{0}" + value
        let now = Date()
        if let previousScanAt = lastScanAtBySignature[signature],
           now.timeIntervalSince(previousScanAt) < 1.8 { return }
        lastScanAtBySignature[signature] = now
        if lastScanAtBySignature.count > 200 {
            lastScanAtBySignature = lastScanAtBySignature.filter { now.timeIntervalSince($0.value) < 10 }
        }
        results.insert(NativeBarcodeReadRecord(value: value, format: format, scannedAt: now), at: 0)
        if results.count > 50 { results = Array(results.prefix(50)) }
        persistResults()
        status = "\(format) detected."
        error = nil
    }

    func clearResults() {
        results.removeAll()
        lastScanAtBySignature.removeAll()
        persistResults()
        status = "Scan history cleared."
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput,
                                    didOutput metadataObjects: [AVMetadataObject],
                                    from connection: AVCaptureConnection) {
        let decoded = metadataObjects.compactMap { object -> (value: String, format: String)? in
            guard let code = object as? AVMetadataMachineReadableCodeObject,
                  let value = code.stringValue, !value.isEmpty else { return nil }
            return (value, code.type.rawValue)
        }
        guard !decoded.isEmpty else { return }
        Task { @MainActor [weak self] in
            for item in decoded {
                self?.addResult(value: item.value, format: item.format)
            }
        }
    }
}
enum NativeBarcodeImageDecoder {
    static func decode(_ data: Data) throws -> [NativeBarcodeReadRecord] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            throw NativeBarcodeReaderError.imageUnreadable
        }
        let thumbnailOptions: CFDictionary = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2800,
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else {
            throw NativeBarcodeReaderError.imageUnreadable
        }
        // Cropped images and programmatically generated QR codes may have no
        // surrounding quiet zone. Add a clean white border before Vision analysis;
        // keep the source pixels crisp so narrow barcode modules are not blurred.
        let border = max(32, max(image.width, image.height) / 10)
        let canvasWidth = image.width + border * 2
        let canvasHeight = image.height + border * 2
        guard let context = CGContext(
            data: nil,
            width: canvasWidth,
            height: canvasHeight,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw NativeBarcodeReaderError.imageUnreadable
        }
        context.setFillColor(UIColor.white.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight))
        context.interpolationQuality = .none
        context.draw(image, in: CGRect(x: border, y: border, width: image.width, height: image.height))
        guard let scanImage = context.makeImage() else {
            throw NativeBarcodeReaderError.imageUnreadable
        }

        let request = VNDetectBarcodesRequest()
        #if targetEnvironment(simulator)
        // Vision revision 3 uses an on-device ML network that may not compile inside
        // hosted iOS simulator VMs. Revision 2 keeps deterministic barcode decoding
        // available in CI simulators; physical devices retain the latest Vision revision.
        request.revision = VNDetectBarcodesRequestRevision2
        #endif
        request.symbologies = try request.supportedSymbologies()
        try VNImageRequestHandler(cgImage: scanImage, orientation: .up).perform([request])
        let results = (request.results ?? []).compactMap { observation -> NativeBarcodeReadRecord? in
            guard let payload = observation.payloadStringValue, !payload.isEmpty else { return nil }
            return NativeBarcodeReadRecord(value: payload, format: observation.symbology.rawValue)
        }
        guard !results.isEmpty else { throw NativeBarcodeReaderError.imageUnreadable }
        return results
    }
}

private enum NativeBarcodeReaderError: LocalizedError {
    case cameraUnavailable
    case permissionDenied
    case imageUnreadable
    case imageTooLarge

    var errorDescription: String? {
        switch self {
        case .cameraUnavailable: return "No compatible camera is available."
        case .permissionDenied: return "Camera permission is denied. Allow access in Settings or read an image instead."
        case .imageUnreadable: return "No supported QR code or barcode was detected in this image."
        case .imageTooLarge: return "This image is larger than 20 MB. Resize it and try again."
        }
    }
}

private final class NativeBarcodePreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

private struct NativeBarcodeCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> NativeBarcodePreviewView {
        let view = NativeBarcodePreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: NativeBarcodePreviewView, context: Context) {
        if view.previewLayer.session !== session { view.previewLayer.session = session }
    }
}

private struct NativeBarcodeCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    let text: String

    init(records: [NativeBarcodeReadRecord]) {
        let formatter = ISO8601DateFormatter()
        func cell(_ value: String) -> String {
            "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        let rows = records.map { record in
            [
                cell(formatter.string(from: record.scannedAt)),
                cell(record.format),
                cell(record.value)
            ].joined(separator: ",")
        }
        text = (["scanned_at,format,payload"] + rows).joined(separator: "\r\n") + "\r\n"
    }

    init(configuration: ReadConfiguration) throws {
        text = configuration.file.regularFileContents.map { String(decoding: $0, as: UTF8.self) } ?? ""
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

struct NativeBarcodeReaderView: View {
    @StateObject private var scanner = NativeBarcodeCameraScanner()
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var readingImage = false
    @State private var isExportingCSV = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("QR & barcode reader").font(.headline)
                    Text("Scan with the camera or read an image stored on this device.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Text("QR · 1D · 2D")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 9).padding(.vertical, 6)
                    .background(Color.envSurface2, in: Capsule())
            }

            HStack(spacing: 10) {
                Button(scanner.isRunning ? "Scanning…" : "Start camera", action: startCamera)
                    .buttonStyle(.borderedProminent)
                    .disabled(scanner.isRunning)
                Button("Stop") { scanner.stop() }
                    .buttonStyle(.bordered)
                    .disabled(!scanner.isRunning)
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(readingImage ? "Reading…" : "Read image", systemImage: "photo")
                }
                .buttonStyle(.bordered)
                .disabled(readingImage)
            }

            if scanner.isRunning {
                NativeBarcodeCameraPreview(session: scanner.session)
                    .frame(maxWidth: .infinity)
                    .frame(height: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .center) {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(.white.opacity(0.8), lineWidth: 2)
                            .frame(width: 230, height: 112)
                            .allowsHitTesting(false)
                    }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "qrcode.viewfinder").font(.system(size: 34))
                    Text("Camera is off").font(.subheadline.weight(.semibold))
                    Text("Camera access is requested only after you tap Start camera. Scans are decoded on this iPhone or iPad.")
                        .font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 28)
                .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 14))
            }

            Text(scanner.status).font(.caption).foregroundStyle(.secondary)
            if let error = scanner.error {
                Text(error).font(.caption).foregroundStyle(.red)
            }

            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Scan results").font(.subheadline.weight(.semibold))
                    Text("\(scanner.results.count) result(s) in this session").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                if !scanner.results.isEmpty {
                    HStack(spacing: 10) {
                        Button("Export CSV") { isExportingCSV = true }
                            .font(.caption.weight(.semibold))
                        Button("Clear") { scanner.clearResults() }
                            .font(.caption.weight(.semibold))
                    }
                }
            }

            if scanner.results.isEmpty {
                Text("Decoded content, format and scan time will appear here. Links are shown for review and never opened automatically.")
                    .font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            } else {
                ForEach(scanner.results) { result in
                    NativeBarcodeResultCard(result: result)
                }
            }
        }
        .onChange(of: selectedPhoto) { item in
            guard let item else { return }
            Task { await readImage(item) }
        }
        .fileExporter(
            isPresented: $isExportingCSV,
            document: NativeBarcodeCSVDocument(records: scanner.results),
            contentType: .commaSeparatedText,
            defaultFilename: "env-scan-history.csv"
        ) { result in
            if case .failure(let failure) = result {
                scanner.setFailure(failure.localizedDescription)
            }
        }
        .onDisappear { scanner.stop() }
    }

    private func startCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            scanner.start()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted { scanner.start() }
                    else { scanner.setFailure("Camera permission was denied.") }
                }
            }
        case .denied, .restricted:
            scanner.setFailure(NativeBarcodeReaderError.permissionDenied.localizedDescription)
        @unknown default:
            scanner.setFailure("Camera access is unavailable on this device.")
        }
    }

    @MainActor
    private func readImage(_ item: PhotosPickerItem) async {
        readingImage = true
        defer { readingImage = false; selectedPhoto = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw NativeBarcodeReaderError.imageUnreadable
            }
            guard data.count <= 20 * 1024 * 1024 else { throw NativeBarcodeReaderError.imageTooLarge }
            let records = try await Task.detached(priority: .userInitiated) {
                try NativeBarcodeImageDecoder.decode(data)
            }.value
            for record in records {
                scanner.addResult(value: record.value, format: record.format)
            }
        } catch {
            scanner.setFailure(error.localizedDescription)
        }
    }
}

private struct NativeBarcodeResultCard: View {
    let result: NativeBarcodeReadRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(result.format.uppercased()).font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Color.envSurface2, in: Capsule())
                Spacer()
                Text(result.scannedAt.formatted(date: .omitted, time: .standard))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Text(result.value)
                .font(.system(.subheadline, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack {
                Button {
                    UIPasteboard.general.string = result.value
                } label: {
                    Label("Copy result", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                if let url = result.safeHTTPURL {
                    Link(destination: url) { Label("Open link", systemImage: "arrow.up.right") }
                        .font(.caption.weight(.semibold))
                }
            }
        }
        .padding(12)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
    }
}

private struct NativeEcommerceTextDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText] }
    let text: String

    init(text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws {
        text = configuration.file.regularFileContents.map { String(decoding: $0, as: UTF8.self) } ?? ""
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

struct NativeEcommerceToolView: View {
    let tool: Tool
    @State private var values: [String: String]
    @State private var output = ""
    @State private var error: String?
    @State private var isExporting = false

    init(tool: Tool) {
        self.tool = tool
        _values = State(initialValue: NativeEcommerceEngine.initialValues(for: tool))
    }

    private var fields: [NativeEcommerceEngine.Field] { NativeEcommerceEngine.fields(for: tool) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Runs locally on this Apple device. Store synchronisation, live carrier rates and payment processing require separate authorised integrations.")
                .font(.caption).foregroundStyle(.secondary)

            ForEach(fields) { field in
                VStack(alignment: .leading, spacing: 5) {
                    Text(field.label).font(.caption).foregroundStyle(.secondary)
                    if field.multiline {
                        TextEditor(text: binding(for: field))
                            .frame(minHeight: 78)
                            .padding(4)
                            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 9))
                    } else {
                        TextField(field.label, text: binding(for: field))
                            .textFieldStyle(.roundedBorder)
                    }
                }
            }

            HStack(spacing: 8) {
                Button("Run", action: run).buttonStyle(.borderedProminent)
                Button("Reset", action: reset).buttonStyle(.bordered)
                if !output.isEmpty {
                    Button("Copy") { UIPasteboard.general.string = output }.buttonStyle(.bordered)
                    Button("Export") { isExporting = true }.buttonStyle(.bordered)
                }
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            if !output.isEmpty {
                Text("Result").font(.subheadline.weight(.semibold))
                TextEditor(text: .constant(output))
                    .font(.system(.caption, design: .monospaced))
                    .frame(minHeight: 150, maxHeight: 360)
                    .textSelection(.enabled)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
            }
        }
        .fileExporter(
            isPresented: $isExporting,
            document: NativeEcommerceTextDocument(text: output),
            contentType: .plainText,
            defaultFilename: "env-\(tool.id).txt"
        ) { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
        }
    }

    private func binding(for field: NativeEcommerceEngine.Field) -> Binding<String> {
        Binding(get: { values[field.key] ?? field.defaultValue }, set: { values[field.key] = $0 })
    }

    private func run() {
        do {
            output = try NativeEcommerceEngine.run(tool, values: values)
            error = nil
        } catch {
            output = ""
            self.error = error.localizedDescription
        }
    }

    private func reset() {
        values = NativeEcommerceEngine.initialValues(for: tool)
        output = ""
        error = nil
    }
}
