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
    case fade = "Fade"
    case sunset = "Sunset"
    case glow = "Glow"

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
    @Published private(set) var manualISORange: ClosedRange<Double>?
    @Published private(set) var manualShutterRange: ClosedRange<Double>?
    @Published private(set) var manualISO = 100.0
    @Published private(set) var manualShutterDuration = 1.0 / 60.0
    @Published private(set) var supportsManualExposure = false
    @Published private(set) var supportsFocusLock = false
    @Published private(set) var focusLocked = false
    @Published private(set) var whiteBalanceSelection = "Auto"
    @Published private(set) var recentCaptures: [URL] = []
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
                if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
                device.unlockForConfiguration()
                Task { @MainActor in
                    self.focusLocked = false
                    self.message = "Focus and exposure metering updated."
                }
            } catch {
                Task { @MainActor in self.error = "Tap-to-focus is unavailable on this camera." }
            }
        }
    }

    func setFocusLocked(_ locked: Bool) {
        guard let device = videoInput?.device, device.isFocusModeSupported(.locked), !recording else { return }
        do {
            try device.lockForConfiguration()
            device.focusMode = locked ? .locked : .continuousAutoFocus
            device.unlockForConfiguration()
            focusLocked = locked
            message = locked ? "Focus locked." : "Continuous autofocus restored."
        } catch {
            self.error = "Focus lock is unavailable on this camera."
        }
    }

    func setWhiteBalance(_ preset: String) {
        guard let device = videoInput?.device, !recording else { return }
        do {
            try device.lockForConfiguration()
            if preset == "Auto" {
                guard device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) else {
                    device.unlockForConfiguration()
                    message = "Automatic white balance is unavailable on this camera."
                    return
                }
                device.whiteBalanceMode = .continuousAutoWhiteBalance
            } else {
                guard device.isWhiteBalanceModeSupported(.locked) else {
                    device.unlockForConfiguration()
                    message = "White balance presets are unavailable on this camera."
                    return
                }
                let temperature: Float
                switch preset {
                case "Daylight": temperature = 5_500
                case "Cloudy": temperature = 6_500
                case "Warm": temperature = 3_200
                default: temperature = 5_000
                }
                let values = AVCaptureWhiteBalanceTemperatureAndTintValues(temperature: temperature, tint: 0)
                var gains = device.deviceWhiteBalanceGains(for: values)
                let maximum = device.maxWhiteBalanceGain
                gains.redGain = min(max(1, gains.redGain), maximum)
                gains.greenGain = min(max(1, gains.greenGain), maximum)
                gains.blueGain = min(max(1, gains.blueGain), maximum)
                device.setWhiteBalanceModeLocked(with: gains, completionHandler: nil)
            }
            device.unlockForConfiguration()
            whiteBalanceSelection = preset
            message = preset == "Auto" ? "Automatic white balance restored." : "\(preset) white balance selected."
        } catch {
            self.error = "White balance could not be changed on this camera."
        }
    }

    func setManualExposure(iso: Double, shutterDuration: Double) {
        guard let device = videoInput?.device, device.isExposureModeSupported(.custom), !recording else { return }
        let format = device.activeFormat
        let boundedISO = min(max(Float(iso), format.minISO), format.maxISO)
        let minimumDuration = CMTimeGetSeconds(format.minExposureDuration)
        let maximumDuration = CMTimeGetSeconds(format.maxExposureDuration)
        let boundedDuration = min(max(shutterDuration, minimumDuration), maximumDuration)
        do {
            try device.lockForConfiguration()
            let duration = CMTimeMakeWithSeconds(boundedDuration, preferredTimescale: 1_000_000_000)
            device.setExposureModeCustom(duration: duration, iso: boundedISO, completionHandler: nil)
            device.unlockForConfiguration()
            manualISO = Double(boundedISO)
            manualShutterDuration = boundedDuration
            exposureBias = 0
        } catch {
            self.error = "Manual ISO and shutter controls are unavailable at those settings."
        }
    }

    func resetToAuto() {
        guard let device = videoInput?.device, !recording else { return }
        do {
            try device.lockForConfiguration()
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) { device.whiteBalanceMode = .continuousAutoWhiteBalance }
            device.unlockForConfiguration()
            focusLocked = false
            whiteBalanceSelection = "Auto"
            exposureBias = 0
            manualISO = Double(device.iso)
            manualShutterDuration = CMTimeGetSeconds(device.exposureDuration)
            message = "Focus, exposure and white balance reset to automatic."
        } catch {
            self.error = "Automatic camera settings could not be restored."
        }
    }

    @MainActor
    private func rememberCapture(_ url: URL) {
        recentCaptures.removeAll { $0 == url }
        recentCaptures.insert(url, at: 0)
        if recentCaptures.count > 8 {
            let expired = Array(recentCaptures.dropFirst(8))
            if let latestPhotoURL, expired.contains(latestPhotoURL) { self.latestPhotoURL = nil }
            if let latestVideoURL, expired.contains(latestVideoURL) { self.latestVideoURL = nil }
            expired.forEach { try? FileManager.default.removeItem(at: $0) }
            recentCaptures = Array(recentCaptures.prefix(8))
        }
    }

    func deleteCapture(_ url: URL) {
        recentCaptures.removeAll { $0 == url }
        if latestPhotoURL == url { latestPhotoURL = nil }
        if latestVideoURL == url { latestVideoURL = nil }
        try? FileManager.default.removeItem(at: url)
    }

    func capturePhoto(look: NativeCameraLook) {
        guard ready, !recording else { return }
        let settings = AVCapturePhotoSettings()
        let device = videoInput?.device
        if let device, device.hasFlash {
            settings.flashMode = flashEnabled ? .on : .off
        }
        if device?.exposureMode == .custom {
            settings.photoQualityPrioritization = .speed
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
        supportsFocusLock = device.isFocusModeSupported(.locked)
        supportsManualExposure = device.isExposureModeSupported(.custom)
        if supportsManualExposure {
            let minimumISO = Double(device.activeFormat.minISO)
            let maximumISO = Double(device.activeFormat.maxISO)
            let minimumShutter = CMTimeGetSeconds(device.activeFormat.minExposureDuration)
            let maximumShutter = CMTimeGetSeconds(device.activeFormat.maxExposureDuration)
            manualISORange = maximumISO > minimumISO ? minimumISO...maximumISO : nil
            manualShutterRange = maximumShutter > minimumShutter && minimumShutter > 0 ? minimumShutter...maximumShutter : nil
            manualISO = Double(device.iso)
            manualShutterDuration = max(minimumShutter, CMTimeGetSeconds(device.exposureDuration))
        } else {
            manualISORange = nil
            manualShutterRange = nil
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
                    owner.rememberCapture(url)
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
        case .fade: filtered = source.applyingFilter("CIPhotoEffectFade")
        case .sunset:
            let warm = source.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.18])
            filtered = warm.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.22, kCIInputContrastKey: 1.02, kCIInputBrightnessKey: 0.02])
        case .glow:
            let bright = source.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: 0.25])
            filtered = bright.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.12, kCIInputContrastKey: 0.96, kCIInputBrightnessKey: 0.01])
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
                rememberCapture(outputFileURL)
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
    @Environment(\.openURL) private var openURL
    @StateObject private var capture = NativeCameraCapture()
    @State private var mode = "Photo"
    @State private var look = NativeCameraLook.natural
    @State private var delaySeconds = 0
    @State private var torchOn = false
    @State private var zoom = 1.0
    @State private var countdown: Int?
    @State private var gridEnabled = false
    @State private var showAdvancedControls = false

    private var latestURL: URL? { mode == "Photo" ? capture.latestPhotoURL : capture.latestVideoURL }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Camera Studio").font(.envScaled(size: 20, weight: .semibold)).foregroundStyle(Color.envInk)
                Spacer()
                Text(capture.ready ? "Camera ready" : "Camera off")
                    .font(.envScaled(size: 10, weight: .medium))
                    .foregroundStyle(capture.ready ? Color.envAccent : Color.envMuted)
            }

            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(Color.black)
                if capture.ready {
                    NativeCameraPreview(session: capture.session, onFocus: { capture.focus(at: $0) })
                    if gridEnabled {
                        GeometryReader { geometry in
                            Path { path in
                                let thirdX = geometry.size.width / 3
                                let thirdY = geometry.size.height / 3
                                for index in 1...2 {
                                    path.move(to: CGPoint(x: thirdX * CGFloat(index), y: 0))
                                    path.addLine(to: CGPoint(x: thirdX * CGFloat(index), y: geometry.size.height))
                                    path.move(to: CGPoint(x: 0, y: thirdY * CGFloat(index)))
                                    path.addLine(to: CGPoint(x: geometry.size.width, y: thirdY * CGFloat(index)))
                                }
                            }
                            .stroke(Color.white.opacity(0.55), lineWidth: 1)
                        }
                        .allowsHitTesting(false)
                    }
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
                Button { gridEnabled.toggle() } label: { Image(systemName: "grid") }
                    .buttonStyle(.bordered).tint(gridEnabled ? Color.envAccent : Color.envSurface2)
                    .accessibilityLabel(gridEnabled ? "Hide framing grid" : "Show framing grid")
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

            DisclosureGroup("Advanced controls", isExpanded: $showAdvancedControls) {
                VStack(alignment: .leading, spacing: 12) {
                    if capture.supportsFocusLock {
                        Toggle("Lock focus", isOn: Binding(get: { capture.focusLocked }, set: { capture.setFocusLocked($0) }))
                            .font(.envScaled(size: 12, weight: .medium))
                    }
                    HStack {
                        Text("White balance").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                        Spacer()
                        Picker("White balance", selection: Binding(get: { capture.whiteBalanceSelection }, set: { capture.setWhiteBalance($0) })) {
                            Text("Auto").tag("Auto")
                            Text("Daylight").tag("Daylight")
                            Text("Cloudy").tag("Cloudy")
                            Text("Warm").tag("Warm")
                        }.pickerStyle(.menu)
                    }
                    if capture.supportsManualExposure, let isoRange = capture.manualISORange, let shutterRange = capture.manualShutterRange {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("ISO").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                                Spacer()
                                Text("\(capture.manualISO, specifier: "%.0f")").font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.envMuted)
                            }
                            Slider(value: Binding(get: { capture.manualISO }, set: { capture.setManualExposure(iso: $0, shutterDuration: capture.manualShutterDuration) }), in: isoRange)
                            HStack {
                                Text("Shutter").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                                Spacer()
                                Text("1/\(max(1, Int((1 / capture.manualShutterDuration).rounded()))) s").font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.envMuted)
                            }
                            Slider(value: Binding(get: { capture.manualShutterDuration }, set: { capture.setManualExposure(iso: capture.manualISO, shutterDuration: $0) }), in: shutterRange)
                        }
                    } else {
                        Text("Manual ISO and shutter are not available on this camera.").font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted)
                    }
                    Button("Reset to auto") { capture.resetToAuto() }.buttonStyle(.bordered)
                }
                .padding(.top, 8)
            }
            .font(.envScaled(size: 12, weight: .medium))

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
            if let message = capture.message {
                Text(message).font(.envScaled(size: 11, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            if let error = capture.error {
                HStack(alignment: .center, spacing: 10) {
                    Text(error).font(.envScaled(size: 11, weight: .medium)).foregroundStyle(Color.red)
                    Spacer(minLength: 0)
                    if AVCaptureDevice.authorizationStatus(for: .video) == .denied {
                        Button("Settings") {
                            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                                openURL(settingsURL)
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            HStack {
                if let photo = capture.latestPhotoURL {
                    ShareLink(item: photo) { Label("Share photo", systemImage: "square.and.arrow.up") }
                }
                if let video = capture.latestVideoURL {
                    ShareLink(item: video) { Label("Share video", systemImage: "square.and.arrow.up") }
                }
                Spacer()
            }
            if !capture.recentCaptures.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent captures").font(.envScaled(size: 12, weight: .semibold)).foregroundStyle(Color.envInk)
                    ForEach(capture.recentCaptures, id: \.self) { url in
                        HStack {
                            Text(url.lastPathComponent).font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted).lineLimit(1)
                            Spacer(minLength: 4)
                            ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                                .accessibilityLabel("Share \(url.lastPathComponent)")
                            Button(role: .destructive) { capture.deleteCapture(url) } label: { Image(systemName: "trash") }
                                .accessibilityLabel("Remove \(url.lastPathComponent) from recent captures")
                        }
                    }
                }
            }
        }
        .onAppear { capture.start() }
        .onDisappear { capture.stop() }
    }
}
