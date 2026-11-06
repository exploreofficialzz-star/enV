import AVFoundation
import CoreImage
import Photos
import SwiftUI
import UIKit
import Vision

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

private struct NativeCameraLensOption: Identifiable, Hashable {
    let id: String
    let title: String
}

private func applyNativeCameraLook(_ source: CIImage, look: NativeCameraLook) -> CIImage {
    guard look != .natural else { return source }
    switch look {
    case .natural: return source
    case .mono: return source.applyingFilter("CIPhotoEffectMono")
    case .warm: return source.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.22])
    case .cool: return source.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0.92, kCIInputContrastKey: 1.04, kCIInputBrightnessKey: 0.01])
    case .vivid: return source.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.25, kCIInputContrastKey: 1.08, kCIInputBrightnessKey: 0.0])
    case .fade: return source.applyingFilter("CIPhotoEffectFade")
    case .sunset:
        let warm = source.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.18])
        return warm.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.22, kCIInputContrastKey: 1.02, kCIInputBrightnessKey: 0.02])
    case .glow:
        let bright = source.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: 0.25])
        return bright.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.12, kCIInputContrastKey: 0.96, kCIInputBrightnessKey: 0.01])
    }
}

private final class NativeCameraCapture: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
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
    @Published private(set) var lensOptions: [NativeCameraLensOption] = []
    @Published private(set) var selectedLensID = ""
    @Published private(set) var recentCaptures: [URL] = []
    @Published private(set) var actualQuality = "Camera starting…"
    @Published private(set) var latestPhotoURL: URL?
    @Published private(set) var latestVideoURL: URL?
    @Published var message: String?
    @Published var error: String?

    private let queue = DispatchQueue(label: "com.chastech.env.camera-studio.capture", qos: .userInitiated)
    private let photoOutput = AVCapturePhotoOutput()
    private let videoDataOutput = AVCaptureVideoDataOutput()
    private let audioDataOutput = AVCaptureAudioDataOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var activePhotoDelegates: [Int64: PhotoDelegate] = [:]
    private var configured = false
    private var flashEnabled = false
    private var sessionObservers: [NSObjectProtocol] = []
    private let context = CIContext()
    private weak var previewSink: CALayer?
    private var assetWriter: AVAssetWriter?
    private var writerVideoInput: AVAssetWriterInput?
    private var writerAudioInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var activeVideoURL: URL?
    private var activeLook: NativeCameraLook = .natural
    private var activeFaceEffect = "Off"
    private let faceSequenceHandler = VNSequenceRequestHandler()
    private var faceRequest = VNDetectFaceLandmarksRequest()
    private var cachedFaceObservations: [VNFaceObservation] = []
    private var lastFaceDetectionTime = CMTime.invalid
    private var recordingRequested = false
    private var writerSessionStarted = false
    private var writerStartTime = CMTime.invalid

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
                    self.error = "Recording was interrupted by the system. Finalizing the saved portion where possible."
                    self.queue.async { [weak self] in self?.finishVideoRecording(stopSession: false) }
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
                if self.recording {
                    self.queue.async { [weak self] in self?.finishVideoRecording(stopSession: false) }
                }
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

            videoDataOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            ]
            videoDataOutput.alwaysDiscardsLateVideoFrames = true
            guard session.canAddOutput(videoDataOutput) else {
                throw NativeCameraError.message("Filtered video capture is unavailable on this camera.")
            }
            session.addOutput(videoDataOutput)
            videoDataOutput.setSampleBufferDelegate(self, queue: queue)
            if let connection = videoDataOutput.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
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
            if self.recordingRequested {
                self.finishVideoRecording(stopSession: true)
            } else {
                if self.session.isRunning { self.session.stopRunning() }
                Task { @MainActor in
                    self.ready = false
                    self.previewSink?.contents = nil
                }
            }
        }
    }

    func switchCamera() {
        guard ready, !recording, !recordingRequested else { return }
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

    func selectLens(uniqueID: String) {
        guard ready, !recording, !recordingRequested else { return }
        queue.async { [weak self] in
            guard let self else { return }
            let discovery = AVCaptureDevice.DiscoverySession(
                deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera],
                mediaType: .video,
                position: self.cameraPosition
            )
            guard let nextDevice = discovery.devices.first(where: { $0.uniqueID == uniqueID }) else {
                Task { @MainActor in self.error = "That lens is no longer available on this device." }
                return
            }
            do {
                let nextInput = try AVCaptureDeviceInput(device: nextDevice)
                self.session.beginConfiguration()
                let previousInput = self.videoInput
                if let previousInput { self.session.removeInput(previousInput) }
                guard self.session.canAddInput(nextInput) else {
                    if let previousInput, self.session.canAddInput(previousInput) { self.session.addInput(previousInput) }
                    self.session.commitConfiguration()
                    throw NativeCameraError.message("This lens cannot be selected while the current capture session is active.")
                }
                self.session.addInput(nextInput)
                self.videoInput = nextInput
                self.session.commitConfiguration()
                Task { @MainActor in
                    self.selectedLensID = nextDevice.uniqueID
                    self.refreshDeviceCapabilities(device: nextDevice)
                    self.message = "Selected \(self.lensTitle(for: nextDevice))."
                    self.error = nil
                }
            } catch {
                Task { @MainActor in self.error = error.localizedDescription }
            }
        }
    }

    private func lensTitle(for device: AVCaptureDevice) -> String {
        switch device.deviceType {
        case .builtInUltraWideCamera: return "Ultra-wide"
        case .builtInTelephotoCamera: return "Telephoto"
        default: return "Wide"
        }
    }

    func setLook(_ look: NativeCameraLook) {
        activeLook = look
    }

    func setFaceEffect(_ effect: String) {
        queue.async { [weak self] in
            guard let self else { return }
            self.activeFaceEffect = effect
            self.cachedFaceObservations.removeAll(keepingCapacity: true)
            self.lastFaceDetectionTime = .invalid
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
                let values = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(temperature: temperature, tint: 0)
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

    @MainActor
    func registerExternalVideo(_ url: URL) {
        latestVideoURL = url
        rememberCapture(url)
        message = "Front and rear video recorded."
        saveVideoToLibrary(url)
    }

    func pauseForMultiCamera(completion: @escaping () -> Void) {
        queue.async { [weak self] in
            guard let self, !self.recordingRequested else { return }
            if self.session.isRunning { self.session.stopRunning() }
            Task { @MainActor in
                self.ready = false
                completion()
            }
        }
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

    func startVideo(look: NativeCameraLook) {
        guard ready, !recording, !recordingRequested else { return }
        let startWithAudio: (Bool) -> Void = { [weak self] audioAllowed in
            guard let self else { return }
            self.queue.async {
                guard !self.recordingRequested else { return }
                var outputURL: URL?
                do {
                    var useAudio = false
                    self.session.beginConfiguration()
                    if audioAllowed {
                        if self.audioInput == nil, let microphone = AVCaptureDevice.default(for: .audio) {
                            let input = try AVCaptureDeviceInput(device: microphone)
                            if self.session.canAddInput(input) {
                                self.session.addInput(input)
                                self.audioInput = input
                            }
                        }
                        if self.audioInput != nil {
                            if !self.session.outputs.contains(where: { $0 === self.audioDataOutput }),
                               self.session.canAddOutput(self.audioDataOutput) {
                                self.session.addOutput(self.audioDataOutput)
                            }
                            useAudio = self.session.outputs.contains(where: { $0 === self.audioDataOutput })
                            if useAudio {
                                self.audioDataOutput.setSampleBufferDelegate(self, queue: self.queue)
                            }
                        }
                    } else {
                        if self.session.outputs.contains(where: { $0 === self.audioDataOutput }) {
                            self.audioDataOutput.setSampleBufferDelegate(nil, queue: nil)
                            self.session.removeOutput(self.audioDataOutput)
                        }
                        if let existingAudioInput = self.audioInput {
                            self.session.removeInput(existingAudioInput)
                            self.audioInput = nil
                        }
                    }
                    self.session.commitConfiguration()

                    guard let device = self.videoInput?.device else {
                        throw NativeCameraError.message("The camera is no longer available.")
                    }
                    let dimensions = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
                    let width = max(2, Int(dimensions.width))
                    let height = max(2, Int(dimensions.height))
                    let url = FileManager.default.temporaryDirectory
                        .appendingPathComponent("env-camera-\(UUID().uuidString).mov")
                    outputURL = url
                    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
                    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                        AVVideoCodecKey: AVVideoCodecType.h264,
                        AVVideoWidthKey: width,
                        AVVideoHeightKey: height
                    ])
                    videoInput.expectsMediaDataInRealTime = true
                    guard writer.canAdd(videoInput) else {
                        throw NativeCameraError.message("The video encoder cannot create this recording.")
                    }
                    writer.add(videoInput)

                    var audioWriterInput: AVAssetWriterInput?
                    if useAudio {
                        let candidate = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                            AVFormatIDKey: kAudioFormatMPEG4AAC,
                            AVSampleRateKey: 44_100,
                            AVNumberOfChannelsKey: 1,
                            AVEncoderBitRateKey: 96_000
                        ])
                        candidate.expectsMediaDataInRealTime = true
                        if writer.canAdd(candidate) {
                            writer.add(candidate)
                            audioWriterInput = candidate
                        }
                    }

                    let pixelAttributes: [String: Any] = [
                        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                        kCVPixelBufferWidthKey as String: width,
                        kCVPixelBufferHeightKey as String: height,
                        kCVPixelBufferCGImageCompatibilityKey as String: true,
                        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
                    ]
                    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                        assetWriterInput: videoInput,
                        sourcePixelBufferAttributes: pixelAttributes
                    )
                    guard writer.startWriting() else {
                        throw writer.error ?? NativeCameraError.message("The video encoder could not start.")
                    }

                    self.assetWriter = writer
                    self.writerVideoInput = videoInput
                    self.writerAudioInput = audioWriterInput
                    self.pixelBufferAdaptor = adaptor
                    self.activeVideoURL = url
                    self.activeLook = look
                    self.recordingRequested = true
                    self.writerSessionStarted = false
                    self.writerStartTime = .invalid
                    Task { @MainActor in
                        self.recording = true
                        self.error = nil
                        self.message = useAudio
                            ? "Recording with the selected filter and microphone audio."
                            : "Recording with the selected filter and no microphone audio."
                    }
                } catch {
                    if let outputURL { try? FileManager.default.removeItem(at: outputURL) }
                    Task { @MainActor in
                        self.recording = false
                        self.error = error.localizedDescription
                    }
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
            self?.finishVideoRecording(stopSession: false)
        }
    }

    private func finishVideoRecording(stopSession: Bool) {
        guard recordingRequested, let writer = assetWriter else {
            if stopSession, session.isRunning { session.stopRunning() }
            if stopSession {
                Task { @MainActor in self.ready = false }
            }
            return
        }
        recordingRequested = false
        writerVideoInput?.markAsFinished()
        writerAudioInput?.markAsFinished()

        guard writerSessionStarted else {
            writer.cancelWriting()
            if let activeVideoURL { try? FileManager.default.removeItem(at: activeVideoURL) }
            clearWriterState()
            Task { @MainActor in
                self.recording = false
                self.error = "No video frames were received. Check camera access and try again."
                if stopSession {
                    if self.session.isRunning { self.session.stopRunning() }
                    self.ready = false
                }
            }
            return
        }

        writer.finishWriting { [weak self] in
            guard let self else { return }
            self.queue.async {
                let completedURL = writer.status == .completed ? writer.outputURL : nil
                let failure = writer.error?.localizedDescription ?? "The filtered video could not be finalized."
                if completedURL == nil { try? FileManager.default.removeItem(at: writer.outputURL) }
                if stopSession, self.session.isRunning { self.session.stopRunning() }
                self.clearWriterState()
                Task { @MainActor in
                    self.recording = false
                    if let completedURL {
                        self.latestVideoURL = completedURL
                        self.rememberCapture(completedURL)
                        self.message = "Filtered video recording complete."
                        self.saveVideoToLibrary(completedURL)
                    } else {
                        self.latestVideoURL = nil
                        self.error = failure
                    }
                    if stopSession { self.ready = false }
                }
            }
        }
    }

    private func clearWriterState() {
        assetWriter = nil
        writerVideoInput = nil
        writerAudioInput = nil
        pixelBufferAdaptor = nil
        activeVideoURL = nil
        writerSessionStarted = false
        writerStartTime = .invalid
    }

    private func detectFacesIfNeeded(in pixelBuffer: CVPixelBuffer, at timestamp: CMTime) {
        guard activeFaceEffect != "Off" else {
            cachedFaceObservations.removeAll(keepingCapacity: true)
            return
        }
        let shouldDetect = !lastFaceDetectionTime.isValid ||
            CMTimeGetSeconds(CMTimeSubtract(timestamp, lastFaceDetectionTime)) >= (1.0 / 15.0)
        guard shouldDetect else { return }
        lastFaceDetectionTime = timestamp
        do {
            faceRequest = VNDetectFaceLandmarksRequest()
            try faceSequenceHandler.perform([faceRequest], on: pixelBuffer, orientation: .up)
            cachedFaceObservations = (faceRequest.results ?? []).filter { $0.confidence >= 0.35 }
        } catch {
            cachedFaceObservations.removeAll(keepingCapacity: true)
        }
    }

    private func faceImagePoint(_ point: CGPoint, in face: VNFaceObservation, extent: CGRect) -> CGPoint {
        CGPoint(
            x: extent.minX + (face.boundingBox.minX + point.x * face.boundingBox.width) * extent.width,
            y: extent.minY + (face.boundingBox.minY + point.y * face.boundingBox.height) * extent.height
        )
    }

    private func applyFaceEffect(_ source: CIImage, pixelBuffer: CVPixelBuffer, timestamp: CMTime) -> CIImage {
        guard activeFaceEffect != "Off" else { return source }
        detectFacesIfNeeded(in: pixelBuffer, at: timestamp)
        guard !cachedFaceObservations.isEmpty else { return source }

        let width = max(1, Int(source.extent.width.rounded()))
        let height = max(1, Int(source.extent.height.rounded()))
        let bytesPerRow = width * 4
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        guard let overlayContext = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return source }
        overlayContext.clear(CGRect(x: 0, y: 0, width: width, height: height))
        overlayContext.setShouldAntialias(true)

        if activeFaceEffect == "Beauty" {
            overlayContext.setFillColor(UIColor.white.withAlphaComponent(0.28).cgColor)
            for face in cachedFaceObservations {
                let bounds = face.boundingBox
                let rect = CGRect(
                    x: bounds.minX * CGFloat(width),
                    y: bounds.minY * CGFloat(height),
                    width: bounds.width * CGFloat(width),
                    height: bounds.height * CGFloat(height)
                ).insetBy(dx: CGFloat(width) * 0.006, dy: CGFloat(height) * 0.008)
                overlayContext.fillEllipse(in: rect)

                // Keep eye detail outside the softening mask so the effect
                // does not wash out the user's expression.
                overlayContext.setBlendMode(.clear)
                if let leftEye = face.landmarks?.leftEye, let rightEye = face.landmarks?.rightEye {
                    for region in [leftEye, rightEye] {
                        let points = region.normalizedPoints.map { faceImagePoint(CGPoint(x: CGFloat($0.x), y: CGFloat($0.y)), in: face, extent: source.extent) }
                        if !points.isEmpty {
                            let minX = points.map(\.x).min() ?? 0
                            let maxX = points.map(\.x).max() ?? 0
                            let minY = points.map(\.y).min() ?? 0
                            let maxY = points.map(\.y).max() ?? 0
                            overlayContext.fillEllipse(in: CGRect(x: minX, y: minY, width: max(1, maxX - minX), height: max(1, maxY - minY)).insetBy(dx: -CGFloat(width) * 0.012, dy: -CGFloat(height) * 0.012))
                        }
                    }
                }
                overlayContext.setBlendMode(.normal)
            }
            guard let maskCGImage = overlayContext.makeImage() else { return source }
            let mask = CIImage(cgImage: maskCGImage)
            let softened = source.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 2.2]).cropped(to: source.extent)
            return softened.applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: source,
                kCIInputMaskImageKey: mask
            ]).cropped(to: source.extent)
        }

        for face in cachedFaceObservations {
            let bounds = face.boundingBox
            let faceRect = CGRect(
                x: bounds.minX * CGFloat(width),
                y: bounds.minY * CGFloat(height),
                width: bounds.width * CGFloat(width),
                height: bounds.height * CGFloat(height)
            )
            if activeFaceEffect == "Glasses" {
                let leftPoints = face.landmarks?.leftEye?.normalizedPoints ?? []
                let rightPoints = face.landmarks?.rightEye?.normalizedPoints ?? []
                func centerOfEye(_ points: [vector_float2]) -> CGPoint? {
                    guard !points.isEmpty else { return nil }
                    let total = points.reduce(CGPoint.zero) { partial, point in
                        CGPoint(x: partial.x + CGFloat(point.x), y: partial.y + CGFloat(point.y))
                    }
                    return CGPoint(
                        x: total.x / CGFloat(points.count),
                        y: total.y / CGFloat(points.count)
                    )
                }
                guard let leftCenter = centerOfEye(leftPoints),
                      let rightCenter = centerOfEye(rightPoints) else { continue }
                let leftEye = faceImagePoint(leftCenter, in: face, extent: source.extent)
                let rightEye = faceImagePoint(rightCenter, in: face, extent: source.extent)
                let eyeDistance = hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
                let lensWidth = max(eyeDistance * 0.82, faceRect.width * 0.14)
                let lensHeight = lensWidth * 0.52
                let leftLens = CGRect(x: leftEye.x - lensWidth / 2, y: leftEye.y - lensHeight / 2, width: lensWidth, height: lensHeight)
                let rightLens = CGRect(x: rightEye.x - lensWidth / 2, y: rightEye.y - lensHeight / 2, width: lensWidth, height: lensHeight)
                overlayContext.setFillColor(UIColor(red: 0.035, green: 0.11, blue: 0.16, alpha: 0.72).cgColor)
                overlayContext.fillEllipse(in: leftLens)
                overlayContext.fillEllipse(in: rightLens)
                overlayContext.setStrokeColor(UIColor(red: 0.24, green: 0.88, blue: 0.92, alpha: 0.95).cgColor)
                overlayContext.setLineWidth(max(2, CGFloat(width) * 0.003))
                overlayContext.strokeEllipse(in: leftLens)
                overlayContext.strokeEllipse(in: rightLens)
                overlayContext.move(to: CGPoint(x: leftLens.maxX, y: leftEye.y))
                overlayContext.addLine(to: CGPoint(x: rightLens.minX, y: rightEye.y))
                overlayContext.strokePath()
            } else if activeFaceEffect == "Crown" {
                let crownWidth = faceRect.width * 0.68
                let baseY = faceRect.maxY + faceRect.height * 0.035
                let crownHeight = faceRect.height * 0.24
                let left = faceRect.midX - crownWidth / 2
                let right = faceRect.midX + crownWidth / 2
                let path = CGMutablePath()
                path.move(to: CGPoint(x: left, y: baseY))
                path.addLine(to: CGPoint(x: left + crownWidth * 0.08, y: baseY + crownHeight * 0.82))
                path.addLine(to: CGPoint(x: left + crownWidth * 0.34, y: baseY + crownHeight * 0.34))
                path.addLine(to: CGPoint(x: faceRect.midX, y: baseY + crownHeight))
                path.addLine(to: CGPoint(x: left + crownWidth * 0.66, y: baseY + crownHeight * 0.34))
                path.addLine(to: CGPoint(x: right - crownWidth * 0.08, y: baseY + crownHeight * 0.82))
                path.addLine(to: CGPoint(x: right, y: baseY))
                path.closeSubpath()
                overlayContext.addPath(path)
                overlayContext.setFillColor(UIColor(red: 1, green: 0.77, blue: 0.18, alpha: 0.94).cgColor)
                overlayContext.fillPath()
                overlayContext.setStrokeColor(UIColor(red: 1, green: 0.93, blue: 0.62, alpha: 1).cgColor)
                overlayContext.setLineWidth(max(2, CGFloat(width) * 0.003))
                overlayContext.strokePath()
            }
        }

        guard let overlayCGImage = overlayContext.makeImage() else { return source }
        let overlay = CIImage(cgImage: overlayCGImage).cropped(to: source.extent)
        return overlay.composited(over: source).cropped(to: source.extent)
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === audioDataOutput {
            guard recordingRequested, writerSessionStarted,
                  let writerAudioInput, writerAudioInput.isReadyForMoreMediaData else { return }
            let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            guard CMTimeCompare(timestamp, writerStartTime) >= 0 else { return }
            writerAudioInput.append(sampleBuffer)
            return
        }
        guard output === videoDataOutput, let sourceBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let sourceImage = CIImage(cvPixelBuffer: sourceBuffer)
        let faceProcessedImage = applyFaceEffect(sourceImage, pixelBuffer: sourceBuffer, timestamp: timestamp)
        let filteredImage = applyLook(faceProcessedImage, look: activeLook)
        var previewImage = filteredImage

        if recordingRequested, let writerVideoInput, let pixelBufferAdaptor,
           writerVideoInput.isReadyForMoreMediaData,
           let pool = pixelBufferAdaptor.pixelBufferPool {
            var renderedBuffer: CVPixelBuffer?
            if CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &renderedBuffer) == kCVReturnSuccess,
               let outputBuffer = renderedBuffer {
                context.render(filteredImage, to: outputBuffer, bounds: filteredImage.extent, colorSpace: CGColorSpaceCreateDeviceRGB())
                if !writerSessionStarted, let assetWriter, assetWriter.status == .writing {
                    assetWriter.startSession(atSourceTime: timestamp)
                    writerSessionStarted = true
                    writerStartTime = timestamp
                }
                if writerSessionStarted, pixelBufferAdaptor.append(outputBuffer, withPresentationTime: timestamp) {
                    previewImage = CIImage(cvPixelBuffer: outputBuffer)
                } else if let writerError = assetWriter?.error {
                    DispatchQueue.main.async { [weak self] in self?.error = writerError.localizedDescription }
                }
            }
        }

        if let cgImage = context.createCGImage(previewImage, from: previewImage.extent) {
            DispatchQueue.main.async { [weak self] in self?.previewSink?.contents = cgImage }
        }
    }

    func setPreviewSink(_ layer: CALayer?) {
        previewSink = layer
    }

    @MainActor
    private func refreshDeviceCapabilities(device: AVCaptureDevice? = nil) {
        guard let device = device ?? videoInput?.device else { return }
        hasTorch = device.hasTorch
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera],
            mediaType: .video,
            position: device.position
        )
        lensOptions = discovery.devices.map { NativeCameraLensOption(id: $0.uniqueID, title: lensTitle(for: $0)) }
        selectedLensID = device.uniqueID
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
            let originalImage = CIImage(data: original) ?? CIImage(color: .black)
            let filteredImage = owner.applyLook(originalImage, look: look)
            guard let cgImage = owner.context.createCGImage(filteredImage, from: filteredImage.extent),
                  let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.94) else {
                Task { @MainActor in owner.error = "The selected photo filter could not be rendered." }
                return
            }
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

    private func applyLook(_ source: CIImage, look: NativeCameraLook) -> CIImage {
        applyNativeCameraLook(source, look: look)
    }
}


private final class NativeDualCameraCapture: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    let session = AVCaptureMultiCamSession()

    @Published private(set) var ready = false
    @Published private(set) var recording = false
    @Published private(set) var error: String?
    @Published private(set) var message = "Checking multi-camera support…"

    private let queue = DispatchQueue(label: "com.chastech.env.camera-studio.multi-camera", qos: .userInitiated)
    private let backOutput = AVCaptureVideoDataOutput()
    private let frontOutput = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    private let imageContext = CIContext()
    private var activeLook: NativeCameraLook = .natural
    private var backInput: AVCaptureDeviceInput?
    private var frontInput: AVCaptureDeviceInput?
    private var microphoneInput: AVCaptureDeviceInput?
    private var previewConnections: [AVCaptureConnection] = []

    private var latestBackBuffer: CVPixelBuffer?
    private var latestFrontBuffer: CVPixelBuffer?
    private var latestBackTime = CMTime.invalid
    private var latestFrontTime = CMTime.invalid
    private var lastAppendedTime = CMTime.invalid
    private var writerStartTime = CMTime.invalid

    private var writer: AVAssetWriter?
    private var videoWriterInput: AVAssetWriterInput?
    private var audioWriterInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var writerSessionStarted = false
    private var recordingRequested = false
    private var recordingCompletion: ((URL?, String?) -> Void)?

    private let outputWidth = 720
    private let outputHeight = 1280

    var backCameraInput: AVCaptureDeviceInput? { backInput }
    var frontCameraInput: AVCaptureDeviceInput? { frontInput }
    static var isSupported: Bool { AVCaptureMultiCamSession.isMultiCamSupported }

    func start() {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            error = "Camera access is required for front and rear recording."
            return
        }
        guard Self.isSupported else {
            error = "This iPhone does not support simultaneous front and rear camera capture."
            message = "Return to the normal camera to continue."
            return
        }

        queue.async { [weak self] in
            guard let self else { return }
            do {
                try self.configureSession()
                guard self.session.hardwareCost <= 1.0 else {
                    throw NativeCameraError.message("This device cannot safely run both cameras at the selected quality.")
                }
                guard self.session.systemPressureCost <= 1.0 else {
                    throw NativeCameraError.message("The camera system is under too much pressure for dual-camera recording.")
                }
                if !self.session.isRunning { self.session.startRunning() }
                Task { @MainActor in
                    self.ready = self.session.isRunning
                    self.error = nil
                    self.message = self.ready
                        ? "Both cameras are ready. Start recording when you are set."
                        : "The cameras could not start. Return to the normal camera."
                }
            } catch {
                self.resetSessionAfterFailure()
                Task { @MainActor in
                    self.ready = false
                    self.error = error.localizedDescription
                    self.message = "Your normal camera is still available."
                }
            }
        }
    }

    private func configureSession() throws {
        guard backInput == nil, frontInput == nil else { return }
        session.beginConfiguration()
        do {
            guard let backDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let frontDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else {
                throw NativeCameraError.message("Both a front and rear camera are required for this mode.")
            }

            try configureModerateFormat(backDevice)
            try configureModerateFormat(frontDevice)

            let back = try AVCaptureDeviceInput(device: backDevice)
            let front = try AVCaptureDeviceInput(device: frontDevice)
            guard session.canAddInput(back), session.canAddInput(front) else {
                throw NativeCameraError.message("This device cannot open both camera inputs together.")
            }
            session.addInputWithNoConnections(back)
            session.addInputWithNoConnections(front)
            backInput = back
            frontInput = front

            try configureVideoOutput(backOutput, from: back)
            try configureVideoOutput(frontOutput, from: front)
            session.commitConfiguration()
        } catch {
            session.commitConfiguration()
            throw error
        }
    }

    private func resetSessionAfterFailure() {
        if session.isRunning { session.stopRunning() }
        session.beginConfiguration()
        for connection in session.connections { session.removeConnection(connection) }
        for output in session.outputs { session.removeOutput(output) }
        for input in session.inputs { session.removeInput(input) }
        session.commitConfiguration()
        backOutput.setSampleBufferDelegate(nil, queue: nil)
        frontOutput.setSampleBufferDelegate(nil, queue: nil)
        audioOutput.setSampleBufferDelegate(nil, queue: nil)
        backInput = nil
        frontInput = nil
        microphoneInput = nil
        previewConnections.removeAll()
    }

    private func configureModerateFormat(_ device: AVCaptureDevice) throws {
        let formats = device.formats.filter { format in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return format.isMultiCamSupported && dimensions.width <= 1920 &&
                dimensions.height <= 1080 &&
                format.videoSupportedFrameRateRanges.contains {
                    $0.minFrameRate <= 30 && $0.maxFrameRate >= 30
                }
        }
        guard let selected = formats.max(by: { lhs, rhs in
            let left = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
            let right = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
            return Int(left.width) * Int(left.height) < Int(right.width) * Int(right.height)
        }) else {
            throw NativeCameraError.message("A stable 1080p-or-lower, 30 fps camera format is not available.")
        }

        try device.lockForConfiguration()
        device.activeFormat = selected
        device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 30)
        device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 30)
        device.unlockForConfiguration()
    }

    private func configureVideoOutput(_ output: AVCaptureVideoDataOutput, from input: AVCaptureDeviceInput) throws {
        guard let port = input.ports.first(where: { $0.mediaType == .video }) else {
            throw NativeCameraError.message("A camera video input could not be connected.")
        }
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        guard session.canAddOutput(output) else {
            throw NativeCameraError.message("The device cannot provide both camera video feeds.")
        }
        session.addOutputWithNoConnections(output)
        let connection = AVCaptureConnection(inputPorts: [port], output: output)
        guard session.canAddConnection(connection) else {
            throw NativeCameraError.message("A camera video connection could not be created.")
        }
        session.addConnection(connection)
        if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
        if input.device.position == .front && connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
        output.setSampleBufferDelegate(self, queue: queue)
    }

    func connectPreviewLayers(back: AVCaptureVideoPreviewLayer, front: AVCaptureVideoPreviewLayer) {
        queue.async { [weak self] in
            guard let self,
                  let backPort = self.backInput?.ports.first(where: { $0.mediaType == .video }),
                  let frontPort = self.frontInput?.ports.first(where: { $0.mediaType == .video }) else { return }

            self.session.beginConfiguration()
            self.previewConnections.forEach { self.session.removeConnection($0) }
            self.previewConnections.removeAll()

            let backConnection = AVCaptureConnection(inputPort: backPort, videoPreviewLayer: back)
            let frontConnection = AVCaptureConnection(inputPort: frontPort, videoPreviewLayer: front)
            if self.session.canAddConnection(backConnection), self.session.canAddConnection(frontConnection) {
                self.session.addConnection(backConnection)
                self.session.addConnection(frontConnection)
                if backConnection.isVideoOrientationSupported { backConnection.videoOrientation = .portrait }
                if frontConnection.isVideoOrientationSupported { frontConnection.videoOrientation = .portrait }
                if frontConnection.isVideoMirroringSupported {
                    frontConnection.automaticallyAdjustsVideoMirroring = false
                    frontConnection.isVideoMirrored = true
                }
                self.previewConnections = [backConnection, frontConnection]
            }
            self.session.commitConfiguration()
        }
    }

    func startRecording(look: NativeCameraLook, completion: @escaping (URL?, String?) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            beginRecording(includeAudio: true, look: look, completion: completion)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                self?.beginRecording(includeAudio: granted, look: look, completion: completion)
            }
        case .denied, .restricted:
            beginRecording(includeAudio: false, look: look, completion: completion)
        @unknown default:
            beginRecording(includeAudio: false, look: look, completion: completion)
        }
    }

    private func beginRecording(includeAudio: Bool, look: NativeCameraLook, completion: @escaping (URL?, String?) -> Void) {
        queue.async { [weak self] in
            guard let self, self.ready, !self.recordingRequested else { return }
            do {
                var useAudio = false
                if includeAudio {
                    self.session.beginConfiguration()
                    do {
                        try self.configureAudioInput()
                        useAudio = self.microphoneInput != nil
                        self.session.commitConfiguration()
                    } catch {
                        self.session.commitConfiguration()
                        useAudio = false
                    }
                }

                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("env-camera-dual-\(UUID().uuidString).mov")
                let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
                let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                    AVVideoCodecKey: AVVideoCodecType.h264,
                    AVVideoWidthKey: self.outputWidth,
                    AVVideoHeightKey: self.outputHeight
                ])
                videoInput.expectsMediaDataInRealTime = true
                guard writer.canAdd(videoInput) else {
                    throw NativeCameraError.message("The video encoder cannot create a combined camera recording.")
                }
                writer.add(videoInput)

                let pixelAttributes: [String: Any] = [
                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                    kCVPixelBufferWidthKey as String: self.outputWidth,
                    kCVPixelBufferHeightKey as String: self.outputHeight,
                    kCVPixelBufferCGImageCompatibilityKey as String: true,
                    kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
                ]
                let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                    assetWriterInput: videoInput,
                    sourcePixelBufferAttributes: pixelAttributes
                )

                var audioInput: AVAssetWriterInput?
                if useAudio {
                    let candidate = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                        AVFormatIDKey: kAudioFormatMPEG4AAC,
                        AVSampleRateKey: 44_100,
                        AVNumberOfChannelsKey: 1,
                        AVEncoderBitRateKey: 96_000
                    ])
                    candidate.expectsMediaDataInRealTime = true
                    if writer.canAdd(candidate) {
                        writer.add(candidate)
                        audioInput = candidate
                    }
                }

                guard writer.startWriting() else {
                    throw writer.error ?? NativeCameraError.message("The combined video encoder could not start.")
                }

                self.writer = writer
                self.videoWriterInput = videoInput
                self.audioWriterInput = audioInput
                self.pixelBufferAdaptor = adaptor
                self.writerSessionStarted = false
                self.activeLook = look
                self.recordingRequested = true
                self.recordingCompletion = completion
                self.latestBackBuffer = nil
                self.latestFrontBuffer = nil
                self.latestBackTime = .invalid
                self.latestFrontTime = .invalid
                self.lastAppendedTime = .invalid
                self.writerStartTime = .invalid

                Task { @MainActor in
                    self.recording = true
                    self.error = nil
                    self.message = audioInput == nil
                        ? "Recording both cameras without microphone audio."
                        : "Recording both cameras with microphone audio."
                }
            } catch {
                Task { @MainActor in
                    self.recording = false
                    self.error = error.localizedDescription
                }
            }
        }
    }

    private func configureAudioInput() throws {
        guard microphoneInput == nil else { return }
        guard let microphone = AVCaptureDevice.default(for: .audio) else {
            throw NativeCameraError.message("The microphone is not available. You can still record silent video.")
        }
        let input = try AVCaptureDeviceInput(device: microphone)
        guard session.canAddInput(input) else {
            throw NativeCameraError.message("The microphone cannot be added. You can still record silent video.")
        }
        session.addInputWithNoConnections(input)
        guard let port = input.ports.first(where: { $0.mediaType == .audio }),
              session.canAddOutput(audioOutput) else {
            session.removeInput(input)
            throw NativeCameraError.message("The microphone audio connection is unavailable.")
        }
        session.addOutputWithNoConnections(audioOutput)
        let connection = AVCaptureConnection(inputPorts: [port], output: audioOutput)
        guard session.canAddConnection(connection) else {
            session.removeOutput(audioOutput)
            session.removeInput(input)
            throw NativeCameraError.message("The microphone audio stream could not be connected.")
        }
        session.addConnection(connection)
        microphoneInput = input
        audioOutput.setSampleBufferDelegate(self, queue: queue)
    }

    func stopRecording() {
        queue.async { [weak self] in
            guard let self else { return }
            self.finishRecordingLocked(stopSession: false, stopCompletion: nil)
        }
    }

    func stop(completion: (() -> Void)? = nil) {
        queue.async { [weak self] in
            guard let self else { return }
            if self.recordingRequested {
                self.finishRecordingLocked(stopSession: true, stopCompletion: completion)
            } else {
                if self.session.isRunning { self.session.stopRunning() }
                Task { @MainActor in
                    self.ready = false
                    completion?()
                }
            }
        }
    }

    private func finishRecordingLocked(stopSession: Bool, stopCompletion: (() -> Void)?) {
        guard recordingRequested, let writer else {
            if stopSession, session.isRunning { session.stopRunning() }
            if stopSession {
                Task { @MainActor in
                    self.ready = false
                    stopCompletion?()
                }
            }
            return
        }

        recordingRequested = false
        videoWriterInput?.markAsFinished()
        audioWriterInput?.markAsFinished()

        guard writerSessionStarted else {
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: writer.outputURL)
            let callback = recordingCompletion
            recordingCompletion = nil
            clearWriterState()
            Task { @MainActor in
                self.recording = false
                callback?(nil, "No synchronized front and rear frames were received.")
                if stopSession {
                    if self.session.isRunning { self.session.stopRunning() }
                    self.ready = false
                    stopCompletion?()
                }
            }
            return
        }

        let callback = recordingCompletion
        recordingCompletion = nil
        writer.finishWriting { [weak self] in
            guard let self else { return }
            let completedURL = writer.status == .completed ? writer.outputURL : nil
            let failure = writer.error?.localizedDescription ?? "The combined video could not be finalized."
            if completedURL == nil { try? FileManager.default.removeItem(at: writer.outputURL) }
            if stopSession, self.session.isRunning { self.session.stopRunning() }
            self.clearWriterState()
            Task { @MainActor in
                self.recording = false
                callback?(completedURL, completedURL == nil ? failure : nil)
                if stopSession {
                    self.ready = false
                    stopCompletion?()
                }
            }
        }
    }

    private func clearWriterState() {
        writer = nil
        videoWriterInput = nil
        audioWriterInput = nil
        pixelBufferAdaptor = nil
        writerSessionStarted = false
        writerStartTime = .invalid
        lastAppendedTime = .invalid
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === audioOutput {
            appendAudio(sampleBuffer)
            return
        }
        guard recordingRequested, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if output === backOutput {
            latestBackBuffer = pixelBuffer
            latestBackTime = timestamp
        } else if output === frontOutput {
            latestFrontBuffer = pixelBuffer
            latestFrontTime = timestamp
        } else {
            return
        }
        appendSynchronizedFrame()
    }

    private func appendAudio(_ sampleBuffer: CMSampleBuffer) {
        guard recordingRequested, writerSessionStarted,
              let audioWriterInput,
              audioWriterInput.isReadyForMoreMediaData else { return }
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard CMTimeCompare(timestamp, writerStartTime) >= 0 else { return }
        audioWriterInput.append(sampleBuffer)
    }

    private func appendSynchronizedFrame() {
        guard recordingRequested,
              let backBuffer = latestBackBuffer,
              let frontBuffer = latestFrontBuffer,
              let videoWriterInput,
              let pixelBufferAdaptor else { return }

        let difference = abs(CMTimeGetSeconds(CMTimeSubtract(latestBackTime, latestFrontTime)))
        guard difference.isFinite, difference <= 0.15 else { return }
        let timestamp = CMTimeCompare(latestBackTime, latestFrontTime) >= 0 ? latestBackTime : latestFrontTime
        if lastAppendedTime.isValid && CMTimeCompare(timestamp, lastAppendedTime) <= 0 { return }
        guard videoWriterInput.isReadyForMoreMediaData,
              let outputBuffer = makeCompositeBuffer(back: backBuffer, front: frontBuffer, adaptor: pixelBufferAdaptor) else { return }

        if !writerSessionStarted {
            guard let writer, writer.status == .writing else { return }
            writer.startSession(atSourceTime: timestamp)
            writerSessionStarted = true
            writerStartTime = timestamp
        }
        if pixelBufferAdaptor.append(outputBuffer, withPresentationTime: timestamp) {
            lastAppendedTime = timestamp
        } else if let writerError = writer?.error {
            Task { @MainActor in self.error = writerError.localizedDescription }
        }
    }

    private func makeCompositeBuffer(
        back: CVPixelBuffer,
        front: CVPixelBuffer,
        adaptor: AVAssetWriterInputPixelBufferAdaptor
    ) -> CVPixelBuffer? {
        guard let pool = adaptor.pixelBufferPool else { return nil }
        var renderedBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &renderedBuffer) == kCVReturnSuccess,
              let output = renderedBuffer else { return nil }

        let canvas = CGRect(x: 0, y: 0, width: outputWidth, height: outputHeight)
        let background = aspectFill(CIImage(cvPixelBuffer: back), into: canvas)
        let pipRect = CGRect(x: outputWidth - 232 - 24, y: 24, width: 232, height: 330)
        let inset = aspectFill(CIImage(cvPixelBuffer: front), into: CGRect(origin: .zero, size: pipRect.size))
            .transformed(by: CGAffineTransform(translationX: pipRect.minX, y: pipRect.minY))
        let composite = inset.composited(over: background).cropped(to: canvas)
        let filteredComposite = applyNativeCameraLook(composite, look: activeLook)
        imageContext.render(filteredComposite, to: output, bounds: canvas, colorSpace: CGColorSpaceCreateDeviceRGB())
        return output
    }

    private func aspectFill(_ image: CIImage, into bounds: CGRect) -> CIImage {
        let scale = max(bounds.width / image.extent.width, bounds.height / image.extent.height)
        let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let cropX = scaled.extent.midX - bounds.width / 2
        let cropY = scaled.extent.midY - bounds.height / 2
        return scaled
            .cropped(to: CGRect(x: cropX, y: cropY, width: bounds.width, height: bounds.height))
            .transformed(by: CGAffineTransform(translationX: -cropX, y: -cropY))
    }
}

private struct NativeMultiCamPreview: UIViewRepresentable {
    let capture: NativeDualCameraCapture

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let back = AVCaptureVideoPreviewLayer(sessionWithNoConnection: capture.session)
        let front = AVCaptureVideoPreviewLayer(sessionWithNoConnection: capture.session)
        back.videoGravity = .resizeAspectFill
        front.videoGravity = .resizeAspectFill
        front.cornerRadius = 10
        front.masksToBounds = true
        front.borderWidth = 2
        front.borderColor = UIColor.white.cgColor
        view.layer.addSublayer(back)
        view.layer.addSublayer(front)
        context.coordinator.backLayer = back
        context.coordinator.frontLayer = front
        capture.connectPreviewLayers(back: back, front: front)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        guard let back = context.coordinator.backLayer, let front = context.coordinator.frontLayer else { return }
        back.frame = uiView.bounds
        let width = uiView.bounds.width * 0.32
        let height = width * 4.0 / 3.0
        front.frame = CGRect(x: uiView.bounds.width - width - 12, y: 12, width: width, height: height)
    }

    final class Coordinator {
        weak var backLayer: AVCaptureVideoPreviewLayer?
        weak var frontLayer: AVCaptureVideoPreviewLayer?
    }
}

private enum NativeCameraError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let value): return value }
    }
}

private struct NativeCameraPreview: UIViewRepresentable {
    let capture: NativeCameraCapture
    let onFocus: (CGPoint) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFocus: onFocus) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.clipsToBounds = true
        let imageView = UIImageView(frame: view.bounds)
        imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        view.addSubview(imageView)

        // This transparent preview layer only converts view taps into camera sensor
        // coordinates. The visible image comes from the same filtered frames that
        // are sent to AVAssetWriter, so preview and saved video stay in sync.
        let preview = AVCaptureVideoPreviewLayer(session: capture.session)
        preview.videoGravity = .resizeAspectFill
        preview.opacity = 0.001
        view.layer.addSublayer(preview)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        capture.setPreviewSink(imageView.layer)
        context.coordinator.previewLayer = preview
        context.coordinator.imageView = imageView
        context.coordinator.capture = capture
        context.coordinator.container = view
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onFocus = onFocus
        let preview = context.coordinator.previewLayer
            ?? uiView.layer.sublayers?.compactMap { $0 as? AVCaptureVideoPreviewLayer }.first
        preview?.frame = uiView.bounds
        context.coordinator.imageView?.frame = uiView.bounds
        context.coordinator.capture?.setPreviewSink(context.coordinator.imageView?.layer)
        context.coordinator.previewLayer = preview
        context.coordinator.container = uiView
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.capture?.setPreviewSink(nil)
    }

    final class Coordinator: NSObject {
        var onFocus: (CGPoint) -> Void
        weak var previewLayer: AVCaptureVideoPreviewLayer?
        weak var imageView: UIImageView?
        weak var capture: NativeCameraCapture?
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
    @StateObject private var dualCapture = NativeDualCameraCapture()
    @State private var dualCameraMode = false
    @State private var mode = "Photo"
    @State private var look = NativeCameraLook.natural
    @State private var delaySeconds = 0
    @State private var torchOn = false
    @State private var zoom = 1.0
    @State private var countdown: Int?
    @State private var gridEnabled = false
    @State private var showAdvancedControls = false
    @State private var faceEffect = "Off"

    private var latestURL: URL? { mode == "Photo" ? capture.latestPhotoURL : capture.latestVideoURL }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Camera Studio").font(.envScaled(size: 20, weight: .semibold)).foregroundStyle(Color.envInk)
                Spacer()
                Text(dualCameraMode ? (dualCapture.ready ? "Both cameras ready" : "Dual camera") : (capture.ready ? "Camera ready" : "Camera off"))
                    .font(.envScaled(size: 10, weight: .medium))
                    .foregroundStyle((dualCameraMode ? dualCapture.ready : capture.ready) ? Color.envAccent : Color.envMuted)
            }

            ZStack {
                RoundedRectangle(cornerRadius: 12).fill(Color.black)
                if dualCameraMode {
                    if dualCapture.ready {
                        NativeMultiCamPreview(capture: dualCapture)
                    } else {
                        Text(dualCapture.error ?? "Preparing both cameras…")
                            .font(.envScaled(size: 12, weight: .medium))
                            .foregroundStyle(.white)
                            .padding()
                    }
                    if dualCapture.recording {
                        VStack {
                            HStack { Text("● REC").font(.caption.weight(.semibold)).foregroundStyle(.white).padding(8).background(Color.red.opacity(0.85), in: Capsule()); Spacer() }
                            Spacer()
                        }.padding(12)
                    }
                } else if capture.ready {
                    NativeCameraPreview(capture: capture, onFocus: { capture.focus(at: $0) })
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

            if dualCameraMode {
                HStack {
                    Text("Front + rear recording").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                    Spacer()
                    Button("Back to camera") {
                        dualCapture.stop {
                            dualCameraMode = false
                            capture.start()
                        }
                    }.buttonStyle(.bordered)
                }
            } else {
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
            }

            HStack(spacing: 14) {
                Button {
                    if dualCameraMode {
                        if dualCapture.recording {
                            dualCapture.stopRecording()
                        } else {
                            dualCapture.startRecording(look: look) { url, failure in
                                if let url { capture.registerExternalVideo(url) }
                                if let failure { capture.error = failure }
                            }
                        }
                    } else if mode == "Photo" {
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
                    else { capture.startVideo(look: look) }
                } label: {
                    ZStack {
                        Circle().strokeBorder(Color.envInk, lineWidth: 5).frame(width: 66, height: 66)
                        if mode == "Photo" {
                            Circle().fill(Color.envInk).frame(width: 48, height: 48)
                        } else {
                            RoundedRectangle(cornerRadius: (dualCameraMode ? dualCapture.recording : capture.recording) ? 6 : 24)
                                .fill(Color.red).frame(width: (dualCameraMode ? dualCapture.recording : capture.recording) ? 24 : 48, height: (dualCameraMode ? dualCapture.recording : capture.recording) ? 24 : 48)
                        }
                    }
                }
                .disabled(!(dualCameraMode ? dualCapture.ready : capture.ready) || countdown != nil)
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

            if mode == "Video" && !dualCameraMode {
                if NativeDualCameraCapture.isSupported {
                    Button("Record with front + rear cameras") {
                        capture.pauseForMultiCamera {
                            dualCameraMode = true
                            dualCapture.start()
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!capture.ready || capture.recording)
                } else {
                    Text("Front + rear recording is not supported on this device.")
                        .font(.envScaled(size: 11, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }
            }

            DisclosureGroup("Advanced controls", isExpanded: $showAdvancedControls) {
                VStack(alignment: .leading, spacing: 12) {
                    if capture.lensOptions.count > 1 {
                        HStack {
                            Text("Lens").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                            Spacer()
                            Picker("Lens", selection: Binding(
                                get: { capture.selectedLensID },
                                set: { capture.selectLens(uniqueID: $0) }
                            )) {
                                ForEach(capture.lensOptions) { lens in
                                    Text(lens.title).tag(lens.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .disabled(capture.recording)
                        }
                    }
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
            if !dualCameraMode && mode == "Video" {
                HStack {
                    Text("Face effects").font(.envScaled(size: 12, weight: .medium)).foregroundStyle(Color.envInk)
                    Spacer()
                    Picker("Face effects", selection: $faceEffect) {
                        Text("Off").tag("Off")
                        Text("Beauty").tag("Beauty")
                        Text("Glasses").tag("Glasses")
                        Text("Crown").tag("Crown")
                    }.pickerStyle(.menu).disabled(capture.recording)
                }
                Text(faceEffect == "Off" ? "Face effects are off." : faceEffect == "Beauty" ? "Adds subtle face-only softening. Original face effects are processed on this device and included in recorded video." : "Face tracking anchors this original effect to your face. Processing stays on this device and is included in recorded video.")
                    .font(.envScaled(size: 10, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            if let message = (dualCameraMode ? dualCapture.message : capture.message) {
                Text(message).font(.envScaled(size: 11, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            if let error = (dualCameraMode ? dualCapture.error : capture.error) {
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
        .onAppear {
            capture.setLook(look)
            capture.setFaceEffect(faceEffect)
            capture.start()
        }
        .onChange(of: look) { nextLook in capture.setLook(nextLook) }
        .onChange(of: faceEffect) { nextEffect in capture.setFaceEffect(nextEffect) }
        .onChange(of: mode) { nextMode in
            if nextMode == "Photo" {
                faceEffect = "Off"
                capture.setFaceEffect("Off")
            }
        }
        .onDisappear {
            dualCapture.stop()
            capture.stop()
        }
    }
}
