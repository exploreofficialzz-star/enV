import Foundation
import SwiftUI
import SafariServices
import ScreenCaptureKit
import Photos
import AVFoundation

private struct NativeVideoPostBrowserTarget: Identifiable {
    let id = UUID()
    let url: URL
}

private struct NativeVideoPostBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}


/// iOS 27+ system screen capture. The system picker grants full-display access;
/// enV does not attempt to capture another app without explicit user approval.
@available(iOS 27.0, *)
@MainActor
private final class NativePostInterfaceCaptureController: NSObject, ObservableObject, SCContentSharingPickerObserver, SCStreamDelegate, SCRecordingOutputDelegate {
    @Published private(set) var isPreparing = false
    @Published private(set) var isRecording = false
    @Published private(set) var isStopping = false
    @Published private(set) var message = ""
    @Published var failure: String?

    private let picker = SCContentSharingPicker.shared
    private var stream: SCStream?
    private var recordingOutput: SCRecordingOutput?
    private var recordingURL: URL?
    private var finishContinuation: CheckedContinuation<Void, Error>?

    func start() {
        guard !isPreparing, !isRecording, !isStopping else { return }
        failure = nil
        message = "Choose the full display to begin recording."
        isPreparing = true

        var configuration = SCContentSharingPickerConfiguration()
        configuration.allowedPickerModes = .singleDisplay
        configuration.showsMicrophoneControl = false
        picker.defaultConfiguration = configuration
        picker.add(self)
        picker.present()
    }

    func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
        Task { @MainActor in
            await beginRecording(with: filter)
        }
    }

    func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {
        Task { @MainActor in
            picker.remove(self)
            isPreparing = false
            message = ""
        }
    }

    func contentSharingPickerStartDidFailWithError(_ error: Error) {
        Task { @MainActor in
            picker.remove(self)
            isPreparing = false
            failure = error.localizedDescription
        }
    }

    private func beginRecording(with filter: SCContentFilter) async {
        picker.remove(self)
        guard stream == nil else {
            isPreparing = false
            failure = "A screen recording is already active."
            return
        }

        do {
            let streamConfiguration = SCStreamConfiguration()
            let screen = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first?.screen ?? UIScreen.main
            let pixelSize = screen.nativeBounds.size
            streamConfiguration.width = max(2, Int(pixelSize.width))
            streamConfiguration.height = max(2, Int(pixelSize.height))
            streamConfiguration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
            streamConfiguration.queueDepth = 5
            streamConfiguration.capturesAudio = true
            streamConfiguration.excludesCurrentProcessAudio = false

            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("enV-Post-Interface-\(UUID().uuidString).mp4")
            let outputConfiguration = SCRecordingOutputConfiguration()
            outputConfiguration.outputURL = outputURL
            let output = SCRecordingOutput(configuration: outputConfiguration, delegate: self)
            let newStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
            try newStream.addRecordingOutput(output)
            stream = newStream
            recordingOutput = output
            recordingURL = outputURL
            try await newStream.startCapture()
            isPreparing = false
            isRecording = true
            message = "Recording the full display."
        } catch {
            isPreparing = false
            isRecording = false
            failure = error.localizedDescription
            await tearDownStream()
        }
    }

    func stop() {
        guard isRecording, !isStopping else { return }
        isStopping = true
        message = "Finalizing the recording."
        Task { @MainActor in
            await finishRecording()
        }
    }

    private func finishRecording() async {
        guard let activeStream = stream, let output = recordingOutput, let url = recordingURL else {
            isStopping = false
            isRecording = false
            failure = "There is no active screen recording to finish."
            return
        }

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                finishContinuation = continuation
                do {
                    try activeStream.removeRecordingOutput(output)
                } catch {
                    finishContinuation = nil
                    continuation.resume(throwing: error)
                }
            }
            try await activeStream.stopCapture()
            try await saveRecordingToPhotos(url)
            try? FileManager.default.removeItem(at: url)
            message = "Recording saved to Photos."
            failure = nil
        } catch {
            failure = error.localizedDescription
            message = "The recording could not be saved."
        }

        await tearDownStream()
        isRecording = false
        isStopping = false
    }

    private func saveRecordingToPhotos(_ url: URL) async throws {
        let authorization = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard authorization == .authorized || authorization == .limited else {
            throw NSError(
                domain: "enV.VideoLinkCapture",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Allow enV to add recordings to Photos, then try again."]
            )
        }
        try await PHPhotoLibrary.shared().performChanges {
            let options = PHAssetResourceCreationOptions()
            options.shouldMoveFile = false
            let request = PHAssetCreationRequest.forAsset()
            request.addResource(with: .video, fileURL: url, options: options)
        }
    }

    private func tearDownStream() async {
        if let activeStream = stream, activeStream.isCapturing {
            try? await activeStream.stopCapture()
        }
        stream = nil
        recordingOutput = nil
        recordingURL = nil
    }

    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {}

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        Task { @MainActor in
            guard let continuation = finishContinuation else { return }
            finishContinuation = nil
            continuation.resume()
        }
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        Task { @MainActor in
            if let continuation = finishContinuation {
                finishContinuation = nil
                continuation.resume(throwing: error)
            }
            failure = error.localizedDescription
            isPreparing = false
            isRecording = false
            isStopping = false
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in
            guard isRecording || isPreparing else { return }
            if isStopping { return }
            failure = error.localizedDescription
            message = "Screen capture stopped unexpectedly."
            isPreparing = false
            isRecording = false
            isStopping = false
            await tearDownStream()
        }
    }
}

@available(iOS 27.0, *)
private struct NativePostCaptureControls: View {
    let onRecordingStarted: () -> Void

    @StateObject private var capture = NativePostInterfaceCaptureController()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                capture.start()
            } label: {
                Label(
                    capture.isPreparing ? "Waiting for permission" : "Start recording",
                    systemImage: "record.circle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.envInk)
            .foregroundStyle(Color.envSurface)
            .disabled(capture.isPreparing || capture.isRecording || capture.isStopping)

            if capture.isRecording {
                Button {
                    capture.stop()
                } label: {
                    Label(capture.isStopping ? "Saving recording" : "Stop and save", systemImage: "stop.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(capture.isStopping)
            }

            if !capture.message.isEmpty {
                Text(capture.message)
                    .font(.envScaled(size: 12, weight: .regular))
                    .foregroundStyle(Color.envMuted)
            }
            if let failure = capture.failure {
                Text(failure)
                    .font(.envScaled(size: 12, weight: .medium))
                    .foregroundStyle(.red)
            }
        }
        .onChange(of: capture.isRecording) { recording in
            if recording { onRecordingStarted() }
        }
    }
}

/// iOS uses the OS screen-sharing picker on iOS 27+; earlier versions retain manual Control Center capture.
struct NativeVideoLinkRecorderView: View {
    @State private var postLink = ""
    @State private var provider = ""
    @State private var failure: String?
    @State private var browserTarget: NativeVideoPostBrowserTarget?

    private let providerDomains: [(String, [String])] = [
        ("TikTok", ["tiktok.com"]),
        ("Instagram", ["instagram.com"]),
        ("Facebook", ["facebook.com", "fb.watch", "fb.com"]),
        ("YouTube", ["youtube.com", "youtu.be", "youtube-nocookie.com"]),
        ("X", ["x.com", "twitter.com"]),
        ("Snapchat", ["snapchat.com"]),
        ("Threads", ["threads.net"]),
        ("LinkedIn", ["linkedin.com"]),
        ("Reddit", ["reddit.com", "redd.it"]),
        ("Twitch", ["twitch.tv"]),
        ("Vimeo", ["vimeo.com"]),
        ("Dailymotion", ["dailymotion.com", "dai.ly"])
    ]

    private func hostMatches(_ host: String, _ domain: String) -> Bool {
        host == domain || host.hasSuffix("." + domain)
    }

    private func validatedPost() -> URL? {
        let value = postLink.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = value.lowercased().hasPrefix("https://") ? value : "https://" + value
        guard let components = URLComponents(string: normalized),
              components.scheme?.lowercased() == "https",
              components.user == nil,
              components.password == nil,
              components.port == nil || components.port == 443,
              let hostValue = components.host?.lowercased(),
              let url = components.url else {
            failure = "Paste a valid secure HTTPS social-media post link."
            return nil
        }
        let host = hostValue.hasPrefix("www.") ? String(hostValue.dropFirst(4)) : hostValue
        let fileExtension = url.pathExtension.lowercased()
        guard !["mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi", "3gp"].contains(fileExtension) else {
            failure = "Paste the original platform post URL, not a direct video-file URL."
            return nil
        }
        guard let match = providerDomains.first(where: { _, domains in
            domains.contains(where: { hostMatches(host, $0) })
        }) else {
            failure = "This platform is not supported yet. Use TikTok, Instagram, Facebook, YouTube, X, Snapchat, Threads, LinkedIn, Reddit, Twitch, Vimeo or Dailymotion."
            return nil
        }
        provider = match.0
        failure = nil
        return url
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Post link")
                        .font(.envScaled(size: 13, weight: .medium))
                        .foregroundStyle(Color.envInk)
                    TextField("Paste a TikTok, Instagram, Facebook, YouTube, X or other link", text: $postLink)
                        .font(.envScaled(size: 14, weight: .regular))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .padding(12)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                        .onChange(of: postLink) { _ in
                            provider = ""
                            failure = nil
                        }
                    if !provider.isEmpty {
                        Text("Platform: \(provider)")
                            .font(.envScaled(size: 12, weight: .medium))
                            .foregroundStyle(Color.envMuted)
                    }
                }

                Button {
                    guard let url = validatedPost() else { return }
                    browserTarget = NativeVideoPostBrowserTarget(url: url)
                } label: {
                    Label("Open post", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.envInk)
                .foregroundStyle(Color.envSurface)
                .disabled(postLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if #available(iOS 27.0, *) {
                    NativePostCaptureControls {
                        guard let url = validatedPost() else { return }
                        browserTarget = NativeVideoPostBrowserTarget(url: url)
                    }
                } else {
                    Button {
                        failure = "Automatic full-display recording requires iOS 27 or later. On this iOS version, use Control Center Screen Recording."
                    } label: {
                        Label("Start recording", systemImage: "record.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(postLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if let failure {
                    Text(failure)
                        .font(.envScaled(size: 12, weight: .medium))
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .padding(16)
        }
        .fullScreenCover(item: $browserTarget) { target in
            NativeVideoPostBrowser(url: target.url)
                .ignoresSafeArea()
        }
    }
}
