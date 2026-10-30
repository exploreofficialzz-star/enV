import AVFoundation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import Vision

struct NativeBarcodeReadRecord: Identifiable, Equatable {
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
    @Published private(set) var isRunning = false
    @Published private(set) var status = "Camera is off."
    @Published private(set) var error: String?
    @Published private(set) var results: [NativeBarcodeReadRecord] = []

    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.chastech.env.barcode-camera")
    private var configured = false
    private var lastSignature = ""
    private var lastScanAt = Date.distantPast

    func start() {
        error = nil
        status = "Starting camera…"
        sessionQueue.async { [weak self] in
            guard let self else { return }
            do {
                if !self.configured {
                    self.session.beginConfiguration()
                    self.session.sessionPreset = .high
                    guard let device = AVCaptureDevice.default(for: .video) else {
                        throw NativeBarcodeReaderError.cameraUnavailable
                    }
                    let input = try AVCaptureDeviceInput(device: device)
                    guard self.session.canAddInput(input) else {
                        throw NativeBarcodeReaderError.cameraUnavailable
                    }
                    self.session.addInput(input)

                    let output = AVCaptureMetadataOutput()
                    guard self.session.canAddOutput(output) else {
                        throw NativeBarcodeReaderError.cameraUnavailable
                    }
                    self.session.addOutput(output)
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    let supported: [AVMetadataObject.ObjectType] = [
                        .qr, .ean13, .ean8, .upce, .code128, .code39, .code93,
                        .pdf417, .aztec, .dataMatrix, .interleaved2of5, .itf14
                    ]
                    output.metadataObjectTypes = supported.filter { output.availableMetadataObjectTypes.contains($0) }
                    self.session.commitConfiguration()
                    self.configured = true
                }
                if !self.session.isRunning { self.session.startRunning() }
                DispatchQueue.main.async {
                    self.isRunning = self.session.isRunning
                    self.status = self.isRunning ? "Scanner ready. Hold a code inside the camera frame." : "Camera did not start."
                }
            } catch {
                DispatchQueue.main.async {
                    self.isRunning = false
                    self.error = error.localizedDescription
                    self.status = "Camera scanner unavailable."
                }
            }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.session.isRunning { self.session.stopRunning() }
            DispatchQueue.main.async {
                self.isRunning = false
                self.status = "Camera stopped."
            }
        }
    }

    func addResult(value: String, format: String) {
        guard !value.isEmpty else { return }
        let signature = format + "\u{0}" + value
        let now = Date()
        guard signature != lastSignature || now.timeIntervalSince(lastScanAt) > 1.8 else { return }
        lastSignature = signature
        lastScanAt = now
        results.insert(NativeBarcodeReadRecord(value: value, format: format, scannedAt: now), at: 0)
        if results.count > 50 { results = Array(results.prefix(50)) }
        status = "\(format) detected."
        error = nil
    }

    func clearResults() {
        results.removeAll()
        status = "Scan history cleared."
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard let object = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let value = object.stringValue else { return }
        addResult(value: value, format: object.type.rawValue)
    }
}

private enum NativeBarcodeReaderError: LocalizedError {
    case cameraUnavailable
    case permissionDenied
    case imageUnreadable

    var errorDescription: String? {
        switch self {
        case .cameraUnavailable: return "No compatible camera is available."
        case .permissionDenied: return "Camera permission is denied. Allow access in Settings or read an image instead."
        case .imageUnreadable: return "No supported QR code or barcode was detected in this image."
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

struct NativeBarcodeReaderView: View {
    @StateObject private var scanner = NativeBarcodeCameraScanner()
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var readingImage = false

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
                    Button("Clear") { scanner.clearResults() }.font(.caption.weight(.semibold))
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
                    else { scanner.status = "Camera permission was denied."; }
                }
            }
        case .denied, .restricted:
            scanner.status = NativeBarcodeReaderError.permissionDenied.localizedDescription
        @unknown default:
            scanner.status = "Camera access is unavailable on this device."
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
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.qr, .ean13, .ean8, .upce, .code128, .code39, .pdf417, .aztec, .dataMatrix, .i2of5]
            try VNImageRequestHandler(data: data).perform([request])
            let observations = request.results ?? []
            guard !observations.isEmpty else { throw NativeBarcodeReaderError.imageUnreadable }
            for observation in observations {
                guard let payload = observation.payloadStringValue, !payload.isEmpty else { continue }
                scanner.addResult(value: payload, format: observation.symbology.rawValue)
            }
            if observations.isEmpty { throw NativeBarcodeReaderError.imageUnreadable }
        } catch {
            scanner.status = error.localizedDescription
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
