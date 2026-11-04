import AVFoundation
import CoreImage
import Photos
import SwiftUI
import UIKit

private enum NativeCameraLook: String, CaseIterable, Identifiable {
    case natural = "Natural"
    case warm = "Warm"
    case cool = "Cool"
    case mono = "Mono"
    case vivid = "Vivid"

    var id: String { rawValue }
}

private final class NativeCameraCapture: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate, AVCaptureFileOutputRecordingDelegate {
    let session = AVCaptureSession()
    @Published private(set) var ready = false
    @Published private(set) var recording = false
    @Published private(set) var cameraPosition: AVCaptureDevice.Position = .back
    @Published private(set) var hasTorch = false
    @Published private(set) var zoomMaximum: CGFloat = 1
    @Published private(set) var exposureBias = 0.0
    @Published private(set) var exposureBiasRange: ClosedRange<Double>?
    @Published private(set) var actualQuality = "Camera starting…"
    @Published private(set) var latestPhotoURL: URL?
    @Published private(set) var latestVideoURL: URL?
    @Published var message: String?
    @Published var error: String?

    private let queue = DispatchQueue(label: "com.chastech.env.camera-studio.capture", qos: .userInitiated)
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var activePhotoDelegates: [Int64: PhotoDelegate] = [:]
    private var configured = false
    private var flashEnabled = false
    private var stopSessionAfterRecording = false
    private var sessionObservers: [NSObjectProtocol] = []
    private let context = CIContext()

    func start() {
        installSessionObservers()
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    guard let self else { return }
                    if granted { self.startSession() }
                    else { self.error = "Camera access was declined. Enable camera permission in iOS Settings to continue." }
                }
            }
        case .denied, .restricted:
            error = "Camera access is unavailable. Enable camera permission in iOS Settings to use Camera Studio."
        @unknown default:
            error = "This device could not confirm camera permission."
        }
    }

    private func installSessionObservers() {
        guard sessionObservers.isEmpty else { return }
        let center = NotificationCenter.default
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionWasInterrupted,
            object: session,
            queue: .main
        ) { [weak self] notification in
            let reason = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
            Task { @MainActor in
                guard let self else { return }
                self.ready = false
                if self.recording {
                    self.error = "Recording was interrupted by the system. Camera Studio is finalizing the take where possible."
                } else {
                    self.message = reason.map { "Camera temporarily unavailable (system interruption \($0)). Waiting to reconnect." }
                        ?? "Camera temporarily unavailable. Waiting to reconnect."
                }
            }
        })
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionInterruptionEnded,
            object: session,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.recording else { return }
                self.message = "Camera access restored. Reconnecting…"
                self.startSession()
            }
        })
        sessionObservers.append(center.addObserver(
            forName: .AVCaptureSessionRuntimeError,
            object: session,
            queue: .main
        ) { [weak self] notification in
            let captureError = notification.userInfo?[AVCaptureSessionErrorKey] as? AVError
            Task { @MainActor in
                guard let self else { return }
                self.ready = false
                self.error = captureError?.localizedDescription ?? "The camera session stopped unexpectedly. Restart Camera Studio to continue."
                if captureError?.code == .mediaServicesWereReset, !self.recording {
                    self.message = "Camera services restarted. Reconnecting…"
                    self.startSession()
                }
            }
        })
    }

    deinit {
        sessionObservers.forEach(NotificationCenter.default.removeObserver)
    }

    private func startSession() {
        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.configureIfNeeded()
                if !self.session.isRunning { self.session.startRunning() }
                Task { @MainActor in
                    self.ready = true
                    self.error = nil
                    self.refreshDeviceCapabilities()
                }
            } catch {
                Task { @MainActor in self.error = error.localizedDescription }
            }
        }
    }

    private func configureIfNeeded() throws {
        guard !configured else { return }
        session.beginConfiguration()
        let preset: AVCaptureSession.Preset
        if session.canSetSessionPreset(.hd4K3840x2160) { preset = .hd4K3840x2160 }
        else if session.canSetSessionPreset(.hd1920x1080) { preset = .hd1920x1080 }
        else if session.canSetSessionPreset(.hd1280x720) { preset = .hd1280x720 }
        else { preset = .high }
        session.sessionPreset = preset

        do {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: cameraPosition)
                    ?? AVCaptureDevice.default(for: .video) else {
                throw NativeCameraError.message("No compatible camera was found on this device.")
            }
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else {
                throw NativeCameraError.message("The camera input could not be added to the capture session.")
            }
            session.addInput(input)
            videoInput = input

            guard session.canAddOutput(photoOutput) else {
                throw NativeCameraError.message("Photo capture is unavailable on this camera.")
            }
            session.addOutput(photoOutput)
            photoOutput.isHighResolutionCaptureEnabled = true

            guard session.canAddOutput(movieOutput) else {
                throw NativeCameraError.message("Video recording is unavailable on this camera.")
            }
            session.addOutput(movieOutput)
            configured = true
            session.commitConfiguration()
            Task { @MainActor in
                actualQuality = "\(preset.rawValue)"
                refreshDeviceCapabilities(device: device)
            }
        } catch {
            session.commitConfiguration()
            throw error
        }
    }

    func stop() {
        queue.async { [weak self] in
            guard let self else { return }
            if self.movieOutput.isRecording {
                self.stopSessionAfterRecording = true
                self.movieOutput.stopRecording()
            } else {
                if self.session.isRunning { self.session.stopRunning() }
                Task { @MainActor in self.ready = false }
            }
        }
    }

    func switchCamera() {
        guard ready, !recording else { return }
        let nextPosition: AVCaptureDevice.Position = cameraPosition == .back ? .front : .back
        queue.async { [weak self] in
            guard let self else { return }
            do {
                guard let nextDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: nextPosition) else {
                    throw NativeCameraError.message("The selected front or rear camera is not available.")
                }
                let nextInput = try AVCaptureDeviceInput(device: nextDevice)
                self.session.beginConfiguration()
                if let oldInput = self.videoInput { self.session.removeInput(oldInput) }
                guard self.session.canAddInput(nextInput) else {
                    if let oldInput = self.videoInput, self.session.canAddInput(oldInput) { self.session.addInput(oldInput) }
                    self.session.commitConfiguration()
                    throw NativeCameraError.message("This camera could not be selected.")
                }
                self.session.addInput(nextInput)
                self.videoInput = nextInput
                self.session.commitConfiguration()
                Task { @MainActor in
                    self.cameraPosition = nextPosition
                    self.refreshDeviceCapabilities(device: nextDevice)
                    self.message = nextPosition == .front ? "Front camera selected." : "Rear camera selected."
                }
            } catch {
                Task { @MainActor in self.error = error.localizedDescription }
            }
        }
    }

    func focus(at point: CGPoint) {
        guard ready, !recording else { return }
        queue.async { [weak self] in
            guard let self, let device = self.videoInput?.device else { return }
            do {
                try device.lockForConfiguration()
                if device.isFocusPointOfInterestSupported {
                    device.focusPointOfInterest = point
                    if device.isFocusModeSupported(.continuousAutoFocus) {
                        device.focusMode = .continuousAutoFocus
                    } else if device.isFocusModeSupported(.autoFocus) {
                        device.focusMode = .autoFocus
                    }
                }
                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = point
                    if device.isExposureModeSupported(.continuousAutoExposure) {
                        device.exposureMode = .continuousAutoExposure
                    }
                }
                device.unlockForConfiguration()
                Task { @MainActor in self.message = "Focus and exposure metering updated." }
            } catch {
                Task { @MainActor in self.error = "Tap-to-focus is unavailable on this camera." }
            }
        }
    }

    func capturePhoto(look: NativeCameraLook) {
        guard ready, !recording else { return }
        let settings = AVCapturePhotoSettings()
        if let device = videoInput?.device, device.hasFlash {
            settings.flashMode = flashEnabled ? .on : .off
        }
        settings.isHighResolutionPhotoEnabled = true
        let delegate = PhotoDelegate(owner: self, look: look, uniqueID: settings.uniqueID)
        activePhotoDelegates[settings.uniqueID] = delegate
        photoOutput.capturePhoto(with: settings, delegate: delegate)
    }

    @MainActor
    private func releasePhotoDelegate(_ uniqueID: Int64) {
        activePhotoDelegates.removeValue(forKey: uniqueID)
    }

    func toggleFlash() {
        guard let device = videoInput?.device, device.hasTorch, !recording else { return }
        do {
            try device.lockForConfiguration()
            if device.torchMode == .on {
                device.torchMode = .off
                flashEnabled = false
            } else {
                try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
                flashEnabled = true
            }
            device.unlockForConfiguration()
            hasTorch = device.hasTorch
            message = flashEnabled ? "Torch on." : "Torch off."
        } catch {
            self.error = "The camera light could not be changed on this device."
        }
    }

    func setZoom(_ value: Double) {
        guard let device = videoInput?.device, !recording else { return }
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = min(max(CGFloat(value), 1), min(device.activeFormat.videoMaxZoomFactor, 6))
            device.unlockForConfiguration()
        } catch {
            message = "Zoom is unavailable on this camera."
        }
    }

    func setExposureBias(_ value: Double) {
        guard let device = videoInput?.device,
              device.isExposureModeSupported(.continuousAutoExposure) else { return }
        let clamped = min(max(value, Double(device.minExposureTargetBias)), Double(device.maxExposureTargetBias))
        do {
            try device.lockForConfiguration()
            device.setExposureTargetBias(Float(clamped), completionHandler: nil)
            device.unlockForConfiguration()
            exposureBias = clamped
        } catch {
            self.error = "Exposure adjustment is unavailable on this camera."
        }
    }

    func startVideo() {
        guard ready, !recording else { return }
        let startWithAudio: (Bool) -> Void = { [weak self] audioAllowed in
            guard let self else { return }
            self.queue.async {
                do {
                    if audioAllowed, self.audioInput == nil, let microphone = AVCaptureDevice.default(for: .audio) {
                        let input = try AVCaptureDeviceInput(device: microphone)
                        self.session.beginConfiguration()
                        if self.session.canAddInput(input) {
                            self.session.addInput(input)
                            self.audioInput = input
                        }
                        self.session.commitConfiguration()
                    }
                    let url = FileManager.default.temporaryDirectory
                        .appendingPathComponent("env-camera-\(UUID().uuidString).mov")
                    self.movieOutput.startRecording(to: url, recordingDelegate: self)
                    Task { @MainActor in
                        self.recording = true
                        self.error = nil
                        self.message = audioAllowed ? "Recording video with microphone audio." : "Recording video without microphone audio."
                    }
                } catch {
                    Task { @MainActor in self.error = error.localizedDescription }
                }
            }
        }

        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            startWithAudio(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in startWithAudio(granted) }
        case .denied, .restricted:
            startWithAudio(false)
        @unknown default:
            startWithAudio(false)
        }
    }

    func stopVideo() {
        guard recording else { return }
        queue.async { [weak self] in
            guard let self, self.movieOutput.isRecording else { return }
            self.movieOutput.stopRecording()
        }
    }

    private func refreshDeviceCapabilities(device: AVCaptureDevice? = nil) {
        guard let device = device ?? videoInput?.device else { return }
        hasTorch = device.hasTorch
        zoomMaximum = min(device.activeFormat.videoMaxZoomFactor, 6)
        let minimumBias = Double(device.minExposureTargetBias)
        let maximumBias = Double(device.maxExposureTargetBias)
        if device.isExposureModeSupported(.continuousAutoExposure), maximumBias > minimumBias {
            exposureBiasRange = minimumBias...maximumBias
            exposureBias = Double(device.exposureTargetBias)
        } else {
            exposureBiasRange = nil
            exposureBias = 0
        }
        let dimensions = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        let fps = device.activeFormat.videoSupportedFrameRateRanges.map { Int($0.maxFrameRate) }.max() ?? 30
        actualQuality = "\(dimensions.width) × \(dimensions.height) · up to \(fps) fps"
    }

    private func savePhotoToLibrary(_ imageData: Data) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard status == .authorized else {
                Task { @MainActor in self?.message = "Photo captured. Use Share to save or send a copy." }
                return
            }
            guard let image = UIImage(data: imageData) else { return }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }) { saved, error in
                Task { @MainActor in
                    if saved { self?.message = "Photo saved to Photos." }
                    else { self?.message = error?.localizedDescription ?? "Photo captured. Use Share to save a copy." }
                }
            }
        }
    }

    private func saveVideoToLibrary(_ url: URL) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard status == .authorized else {
                Task { @MainActor in self?.message = "Video recorded. Use Share to save or send a copy." }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { saved, error in
                Task { @MainActor in
                    if saved { self?.message = "Video saved to Photos." }
                    else { self?.message = error?.localizedDescription ?? "Video recorded. Use Share to save a copy." }
                }
            }
        }
    }

    private final class PhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate {
        weak var owner: NativeCameraCapture?
        let look: NativeCameraLook
        let uniqueID: Int64
        init(owner: NativeCameraCapture, look: NativeCameraLook, uniqueID: Int64) {
            self.owner = owner
            self.look = look
            self.uniqueID = uniqueID
            super.init()
        }

        func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
            guard let owner, error == nil, let original = photo.fileDataRepresentation() else {
                Task { @MainActor in
                    self.owner?.error = error?.localizedDescription ?? "The photo could not be processed."
                    self.owner?.releasePhotoDelegate(self.uniqueID)
                }
                return
            }
            let data = owner.applyLook(original, look: look)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("env-photo-\(UUID().uuidString).jpg")
            do {
                try data.write(to: url, options: .atomic)
                Task { @MainActor in
                    owner.latestPhotoURL = url
                    owner.message = "Photo captured."
                    owner.releasePhotoDelegate(self.uniqueID)
                }
                owner.savePhotoToLibrary(data)
            } catch {
                Task { @MainActor in owner.error = error.localizedDescription }
            }
        }
    }

    private func applyLook(_ data: Data, look: NativeCameraLook) -> Data {
        guard look != .natural, let source = CIImage(data: data) else { return data }
        let filtered: CIImage
        switch look {
        case .natural: return data
        case .mono: filtered = source.applyingFilter("CIPhotoEffectMono")
        case .warm: filtered = source.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.22])
        case .cool: filtered = source.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0.92, kCIInputContrastKey: 1.04, kCIInputBrightnessKey: 0.01])
        case .vivid: filtered = source.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.25, kCIInputContrastKey: 1.08, kCIInputBrightnessKey: 0.0])
        }
        guard let cgImage = context.createCGImage(filtered, from: filtered.extent),
              let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.94) else { return data }
        return jpeg
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            recording = false
            if let error {
                self.error = error.localizedDescription
                latestVideoURL = nil
            } else {
                latestVideoURL = outputFileURL
                message = "Video recording complete."
                saveVideoToLibrary(outputFileURL)
            }
            if stopSessionAfterRecording {
                stopSessionAfterRecording = false
                queue.async { [weak self] in
                    guard let self else { return }
                    if self.session.isRunning { self.session.stopRunning() }
                    Task { @MainActor in self.ready = false }
                }
            }
        }
    }
}

private enum NativeCameraError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let value): return value }
    }
}

private struct NativeCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    let onFocus: (CGPoint) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFocus: onFocus) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        context.coordinator.previewLayer = preview
        context.coordinator.container = view
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onFocus = onFocus
        let preview = context.coordinator.previewLayer
            ?? uiView.layer.sublayers?.compactMap { $0 as? AVCaptureVideoPreviewLayer }.first
        preview?.frame = uiView.bounds
        context.coordinator.previewLayer = preview
        context.coordinator.container = uiView
    }

    final class Coordinator: NSObject {
        var onFocus: (CGPoint) -> Void
        weak var previewLayer: AVCaptureVideoPreviewLayer?
        weak var container: UIView?

        init(onFocus: @escaping (CGPoint) -> Void) {
            self.onFocus = onFocus
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let container, let previewLayer else { return }
            let viewPoint = gesture.location(in: container)
            onFocus(previewLayer.captureDevicePointConverted(fromLayerPoint: viewPoint))
        }
    }
}

struct NativeCameraStudioView: View {
    @StateObject private var capture = NativeCameraCapture()
    @State private var mode = "Photo"
    @State private var look = NativeCameraLook.natural
    @State private var delaySeconds = 0
    @State private var torchOn = false
    @State private var zoom = 1.0
    @State private var countdown: Int?

    private var latestURL: URL? { mode == "Photo" ? capture.latestPhotoURL : capture.latestVideoURL }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Camera Studio").font(.envScaled(size: 20, weight: .semibold)).foregroundStyle(Color.envInk)
                    Text("A simple camera for everyday photos and videos.").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted)
                }
                Spacer()
                Text(capture.ready ? "Camera ready" : "Camera off")
                    .font(.envScaled(size: 10, weight: .medium))
                    .foregroundStyle(capture.ready ? Color.envAccent : Color.envMuted)
            }

            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(Color.black)
                if capture.ready {
                    NativeCameraPreview(session: capture.session, onFocus: { capture.focus(at: $0) })
                    if let countdown {
                        Text("\(countdown)")
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    if capture.recording {
                        VStack {
                            HStack { Text("● REC").font(.caption.weight(.semibold)).foregroundStyle(.white).padding(8).background(Color.red.opacity(0.85), in: Capsule()); Spacer() }
                            Spacer()
                        }.padding(12)
                    }
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "camera").font(.system(size: 30)).foregroundStyle(.white.opacity(0.8))
                        Text(capture.error ?? "Allow camera access to start.")
                            .font(.envScaled(size: 13, weight: .medium)).foregroundStyle(.white).multilineTextAlignment(.center)
                        Button("Start camera") { capture.start() }.buttonStyle(.borderedProminent)
                    }.padding(20)
                }
            }
            .aspectRatio(4.0 / 3.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            HStack(spacing: 8) {
                Button("Photo") { mode = "Photo" }.buttonStyle(.borderedProminent).tint(mode == "Photo" ? Color.envAccent : Color.envSurface2)
                Button("Video") { mode = "Video" }.buttonStyle(.borderedProminent).tint(mode == "Video" ? Color.envAccent : Color.envSurface2)
                Spacer()
                Button { capture.switchCamera() } label: { Image(systemName: "camera.rotate") }
                    .buttonStyle(.bordered).disabled(!capture.ready || capture.recording)
                if capture.hasTorch {
                    Button { capture.toggleFlash(); torchOn.toggle() } label: { Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill") }
                        .buttonStyle(.bordered).disabled(capture.recording)
                }
            }

            HStack(spacing: 14) {
                Button {
                    if mode == "Photo" {
                        Task {
                            if delaySeconds > 0 {
                                for remaining in stride(from: delaySeconds, through: 1, by: -1) {
                                    countdown = remaining
                                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                                }
                            }
                            countdown = nil
                            capture.capturePhoto(look: look)
                        }
                    } else if capture.recording { capture.stopVideo() }
                    else { capture.startVideo() }
                } label: {
                    ZStack {
                        Circle().strokeBorder(Color.envInk, lineWidth: 5).frame(width: 66, height: 66)
                        if mode == "Photo" {
                            Circle().fill(Color.envInk).frame(width: 48, height: 48)
                        } else {
                            RoundedRectangle(cornerRadius: capture.recording ? 6 : 24)
                                .fill(Color.red).frame(width: capture.recording ? 24 : 48, height: capture.recording ? 24 : 48)
                        }
                    }
                }
                .disabled(!capture.ready || countdown != nil)
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(capture.actualQuality).font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.envInk)
                    if capture.zoomMaximum > 1 {
                        Slider(value: $zoom, in: 1...Double(capture.zoomMaximum), onEditingChanged: { editing in if !editing { capture.setZoom(zoom) } })
                            .frame(width: 132)
                    }
                }
            }

            if let exposureRange = capture.exposureBiasRange {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Exposure compensation").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                        Spacer()
                        Text("\(capture.exposureBias, specifier: "%+.1f") EV").font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.envMuted)
                    }
                    Slider(
                        value: Binding(
                            get: { capture.exposureBias },
                            set: { capture.setExposureBias($0) }
                        ),
                        in: exposureRange
                    )
                }
            }

            HStack {
                Text("Photo timer").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                Spacer()
                Picker("Timer", selection: $delaySeconds) {
                    Text("Off").tag(0); Text("3 sec").tag(3); Text("10 sec").tag(10)
                }.pickerStyle(.menu)
            }

            HStack {
                Text("Photo look").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                Spacer()
                Picker("Photo look", selection: $look) {
                    ForEach(NativeCameraLook.allCases) { item in Text(item.rawValue).tag(item) }
                }.pickerStyle(.menu)
            }
            Text("Color looks are applied to saved photos. Native video is recorded clean in this first release.")
                .font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted)

            if let message = capture.message {
                Text(message).font(.envScaled(size: 11, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            if let error = capture.error {
                Text(error).font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.red)
            }
            HStack {
                if let photo = capture.latestPhotoURL {
                    ShareLink(item: photo) { Label("Share photo", systemImage: "square.and.arrow.up") }
                }
                if let video = capture.latestVideoURL {
                    ShareLink(item: video) { Label("Share video", systemImage: "square.and.arrow.up") }
                }
                Spacer()
                Text("Captures stay on this device unless you choose to share them.")
                    .font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            Text("Simultaneous front/rear capture and face-tracking AR masks are not included in this release; both require separate device capability checks.")
                .font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted)
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }
}
