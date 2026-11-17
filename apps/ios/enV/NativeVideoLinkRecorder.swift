import AVFoundation
import AVKit
import Photos
import ReplayKit
import SwiftUI
import UIKit
import WebKit

// MARK: - Link rules
// These mirror src/lib/media/video-link-recording.ts. Keep the protected-platform list aligned with it;
// scripts/check-video-link-recorder.mjs verifies that.

enum NativeVideoLinkParseResult {
    case accepted(url: URL, host: String, platformLabel: String)
    case rejected(String)
}

enum NativeVideoLinkPolicy {
    static let protectedPlatforms: [(label: String, domains: [String])] = [
        ("Netflix", ["netflix.com"]),
        ("Disney+", ["disneyplus.com", "hotstar.com"]),
        ("Prime Video", ["primevideo.com"]),
        ("Max", ["max.com", "hbomax.com"]),
        ("Hulu", ["hulu.com"]),
        ("Apple TV", ["tv.apple.com"]),
        ("Peacock", ["peacocktv.com"]),
        ("Paramount+", ["paramountplus.com"]),
        ("Crunchyroll", ["crunchyroll.com"]),
    ]

    static let knownPlatforms: [(label: String, domains: [String])] = [
        ("YouTube", ["youtube.com", "youtu.be", "youtube-nocookie.com"]),
        ("Vimeo", ["vimeo.com"]),
        ("Dailymotion", ["dailymotion.com", "dai.ly"]),
        ("TikTok", ["tiktok.com"]),
        ("Instagram", ["instagram.com"]),
        ("Facebook", ["facebook.com", "fb.watch", "fb.com"]),
        ("X", ["x.com", "twitter.com"]),
        ("Twitch", ["twitch.tv"]),
        ("Reddit", ["reddit.com", "redd.it"]),
        ("LinkedIn", ["linkedin.com"]),
    ]

    private static func hostMatches(_ host: String, _ domains: [String]) -> Bool {
        domains.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func parse(_ raw: String) -> NativeVideoLinkParseResult {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .rejected("Paste the link of the video you want to view and record.") }
        let hasScheme = trimmed.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) != nil
        guard let components = URLComponents(string: hasScheme ? trimmed : "https://" + trimmed),
              let scheme = components.scheme?.lowercased() else {
            return .rejected("That does not look like a complete web link.")
        }
        guard scheme == "https" else {
            return .rejected("Use an HTTPS link. Insecure HTTP and app-specific links are not opened.")
        }
        if components.user != nil || components.password != nil {
            return .rejected("Links containing a username or password are not accepted.")
        }
        var host = (components.host ?? "").lowercased()
        if host.hasPrefix("[") { host.removeFirst() }
        if host.hasSuffix("]") { host.removeLast() }
        if host.hasPrefix("www.") { host = String(host.dropFirst(4)) }
        guard !host.isEmpty, let url = components.url else {
            return .rejected("That does not look like a complete web link.")
        }

        if let blocked = protectedPlatforms.first(where: { hostMatches(host, $0.domains) }) {
            return .rejected("\(blocked.label) protects its video with DRM and does not allow screen recording, so the capture would be blank. Use the service's own offline or download feature instead.")
        }
        let isIPv4 = host.range(of: "^\\d{1,3}(\\.\\d{1,3}){3}$", options: .regularExpression) != nil
        let isLocal = host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local") ||
            host.hasSuffix(".internal") || host == "0.0.0.0" || host.contains(":") || isIPv4 || !host.contains(".")
        if isLocal { return .rejected("Local, private-network and IP-address links are not accepted.") }

        let label = knownPlatforms.first(where: { hostMatches(host, $0.domains) })?.label ?? host
        return .accepted(url: url, host: host, platformLabel: label)
    }
}

// MARK: - Writer

/// Writes ReplayKit sample buffers to an MP4. All state is confined to one serial queue.
final class NativeVideoLinkScreenWriter {
    let outputURL: URL
    private let includeAudio: Bool
    private let queue = DispatchQueue(label: "com.chastech.env.video-link-writer")
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var sessionStart: CMTime?
    private var lastVideoTime: CMTime?
    private var failure: Error?

    init(outputURL: URL, includeAudio: Bool) {
        self.outputURL = outputURL
        self.includeAudio = includeAudio
    }

    func append(_ sample: CMSampleBuffer, type: RPSampleBufferType) {
        queue.async { [self] in
            guard CMSampleBufferDataIsReady(sample), failure == nil else { return }
            if writer == nil {
                guard type == .video else { return }
                configureWriter(from: sample)
            }
            guard let writer, writer.status == .writing else {
                if let writer, writer.status == .failed { failure = writer.error }
                return
            }
            let time = CMSampleBufferGetPresentationTimeStamp(sample)
            switch type {
            case .video:
                guard CMSampleBufferGetImageBuffer(sample) != nil else { return }
                if sessionStart == nil {
                    writer.startSession(atSourceTime: time)
                    sessionStart = time
                }
                if let videoInput, videoInput.isReadyForMoreMediaData {
                    if videoInput.append(sample) { lastVideoTime = time }
                }
            case .audioApp:
                guard includeAudio, let start = sessionStart, time >= start else { return }
                if let audioInput, audioInput.isReadyForMoreMediaData { _ = audioInput.append(sample) }
            default:
                break // Microphone audio is not recorded.
            }
        }
    }

    private func configureWriter(from sample: CMSampleBuffer) {
        guard let format = CMSampleBufferGetFormatDescription(sample) else { return }
        let dimensions = CMVideoFormatDescriptionGetDimensions(format)
        let width = Int(dimensions.width)
        let height = Int(dimensions.height)
        guard width > 0, height > 0 else { return }
        try? FileManager.default.removeItem(at: outputURL)
        do {
            let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
            let bitRate = min(max(width * height * 4, 2_000_000), 12_000_000)
            let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: bitRate,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    AVVideoExpectedSourceFrameRateKey: 30,
                ],
            ])
            video.expectsMediaDataInRealTime = true
            guard writer.canAdd(video) else { failure = NSError(domain: "enV", code: 1, userInfo: [NSLocalizedDescriptionKey: "The video format could not be recorded."]); return }
            writer.add(video)
            videoInput = video
            if includeAudio {
                let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVNumberOfChannelsKey: 2,
                    AVSampleRateKey: 44_100,
                    AVEncoderBitRateKey: 128_000,
                ])
                audio.expectsMediaDataInRealTime = true
                if writer.canAdd(audio) {
                    writer.add(audio)
                    audioInput = audio
                }
            }
            guard writer.startWriting() else {
                failure = writer.error
                return
            }
            self.writer = writer
        } catch {
            failure = error
        }
    }

    /// Finishes the file. The result is the recorded duration in seconds.
    func finish(completion: @escaping (Result<TimeInterval, Error>) -> Void) {
        queue.async { [self] in
            guard let writer else {
                completion(.failure(failure ?? NSError(domain: "enV", code: 2, userInfo: [NSLocalizedDescriptionKey: "Nothing was recorded. Keep the video on screen while recording."])))
                return
            }
            guard writer.status == .writing, sessionStart != nil else {
                writer.cancelWriting()
                completion(.failure(writer.error ?? failure ?? NSError(domain: "enV", code: 3, userInfo: [NSLocalizedDescriptionKey: "Nothing was recorded. Keep the video on screen while recording."])))
                return
            }
            videoInput?.markAsFinished()
            audioInput?.markAsFinished()
            let duration: TimeInterval
            if let start = sessionStart, let end = lastVideoTime { duration = max(0, CMTimeGetSeconds(CMTimeSubtract(end, start))) } else { duration = 0 }
            writer.finishWriting {
                if writer.status == .completed {
                    completion(.success(duration))
                } else {
                    completion(.failure(writer.error ?? NSError(domain: "enV", code: 4, userInfo: [NSLocalizedDescriptionKey: "The recording could not be saved."])))
                }
            }
        }
    }
}

// MARK: - Model

@MainActor
final class NativeVideoLinkRecorderModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case countdown(Int)
        case recording
        case finishing
        case finished(URL, TimeInterval)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var elapsed: TimeInterval = 0
    private var writer: NativeVideoLinkScreenWriter?
    private var timer: Timer?
    private var startDate: Date?
    private var countdownTask: Task<Void, Never>?
    private let maxSeconds: TimeInterval = 60 * 60

    var isBusy: Bool {
        switch phase {
        case .countdown, .recording, .finishing: return true
        default: return false
        }
    }

    func start(includeAudio: Bool) {
        guard !isBusy else { return }
        let recorder = RPScreenRecorder.shared()
        guard recorder.isAvailable else {
            phase = .failed("Screen recording is not available right now. Close other recordings or check Screen Time restrictions, then try again.")
            return
        }
        discardResult()
        countdownTask = Task { [weak self] in
            for second in stride(from: 3, through: 1, by: -1) {
                guard let self else { return }
                self.phase = .countdown(second)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
            }
            self?.beginCapture(includeAudio: includeAudio)
        }
    }

    private func beginCapture(includeAudio: Bool) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("enV-video-link-\(Int(Date().timeIntervalSince1970)).mp4")
        let writer = NativeVideoLinkScreenWriter(outputURL: url, includeAudio: includeAudio)
        self.writer = writer
        let recorder = RPScreenRecorder.shared()
        recorder.isMicrophoneEnabled = false
        recorder.startCapture(handler: { sample, type, error in
            guard error == nil else { return }
            writer.append(sample, type: type)
        }, completionHandler: { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                if let error {
                    self.writer = nil
                    // Error code -5801 is the person declining the system prompt.
                    let declined = (error as NSError).code == -5801
                    self.phase = .failed(declined ? "Screen recording was not allowed, so nothing was recorded." : error.localizedDescription)
                    return
                }
                self.startDate = Date()
                self.elapsed = 0
                self.phase = .recording
                self.timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                    Task { @MainActor in
                        guard let self, let started = self.startDate else { return }
                        self.elapsed = Date().timeIntervalSince(started)
                        if self.elapsed >= self.maxSeconds { self.stop() }
                    }
                }
            }
        })
    }

    func cancelCountdown() {
        countdownTask?.cancel()
        countdownTask = nil
        phase = .idle
    }

    func stop() {
        guard case .recording = phase else { return }
        timer?.invalidate()
        timer = nil
        phase = .finishing
        RPScreenRecorder.shared().stopCapture { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                guard let writer = self.writer else {
                    self.phase = .failed(error?.localizedDescription ?? "Nothing was recorded.")
                    return
                }
                writer.finish { result in
                    Task { @MainActor in
                        self.writer = nil
                        switch result {
                        case .success(let duration): self.phase = .finished(writer.outputURL, duration)
                        case .failure(let failure): self.phase = .failed(failure.localizedDescription)
                        }
                    }
                }
            }
        }
    }

    func discardResult() {
        if case .finished(let url, _) = phase { try? FileManager.default.removeItem(at: url) }
        phase = .idle
    }

    /// Called when the person leaves the tool: nothing keeps recording in the background.
    func stopForExit() {
        countdownTask?.cancel()
        timer?.invalidate()
        timer = nil
        if RPScreenRecorder.shared().isRecording {
            RPScreenRecorder.shared().stopCapture { _ in }
        }
        if case .finished(let url, _) = phase { try? FileManager.default.removeItem(at: url) }
        writer = nil
    }
}

// MARK: - Web view

private struct NativeVideoLinkWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.isOpaque = false
        context.coordinator.loadedURL = url
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.loadedURL != url else { return }
        context.coordinator.loadedURL = url
        view.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedURL: URL?

        // Only HTTPS pages are shown; app links, file: and other schemes are ignored.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let target = navigationAction.request.url else { decisionHandler(.cancel); return }
            if target.scheme?.lowercased() == "https" || target.absoluteString == "about:blank" {
                if navigationAction.targetFrame == nil { webView.load(navigationAction.request); decisionHandler(.cancel); return }
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}

// MARK: - Screen

/// Video Link Screen Recording (iOS). The link opens in an in-app web view that shows the page the way the
/// platform presents it. ReplayKit records enV's own screen and the sound the app plays; the MP4 stays in
/// temporary storage until the person saves or shares it. Nothing is uploaded.
struct NativeVideoLinkRecorderView: View {
    @StateObject private var model = NativeVideoLinkRecorderModel()
    @State private var linkText = ""
    @State private var loaded: (url: URL, host: String, label: String)?
    @State private var errorText = ""
    @State private var notice = ""
    @State private var rightsConfirmed = false
    @State private var includeAudio = true
    @State private var savingToPhotos = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Video Link Screen Recording").font(.headline)
                    Text("Open a video link as it appears on its platform, then record what you see, including likes, comments and controls.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 8) {
                    Text("Video link").font(.subheadline.weight(.medium))
                    TextField("https://www.youtube.com/watch?v=…", text: $linkText)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(model.isBusy)
                        .onChange(of: linkText) { _ in errorText = "" }
                        .onSubmit(loadLink)
                    Button(action: loadLink) {
                        Text("Load link").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isBusy || linkText.trimmingCharacters(in: .whitespaces).isEmpty)
                    Text("Public HTTPS pages only. Subscription services that use DRM cannot be recorded.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                if let loaded {
                    Text("\(loaded.label) · \(loaded.host)").font(.subheadline.weight(.medium))
                    NativeVideoLinkWebView(url: loaded.url)
                        .frame(height: UIScreen.main.bounds.height * 0.6)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
                    Text("Sign in inside this view if the platform requires it. Everything visible on screen, including names and comments, is recorded.")
                        .font(.footnote).foregroundStyle(.secondary)
                    recordingControls
                }

                resultCard

                if case .failed(let message) = model.phase {
                    Text(message).foregroundStyle(.red).font(.subheadline)
                }
                if !errorText.isEmpty { Text(errorText).foregroundStyle(.red).font(.subheadline) }
                if !notice.isEmpty { Text(notice).font(.subheadline) }
            }
            .padding(16)
        }
        .onDisappear { model.stopForExit() }
    }

    @ViewBuilder
    private var recordingControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recording").font(.subheadline.weight(.semibold))
            Toggle("Include the video's sound", isOn: $includeAudio).disabled(model.isBusy)
            Toggle("I own this video or have permission to record it, and will only use the recording as allowed.", isOn: $rightsConfirmed)
                .disabled(model.isBusy)
            switch model.phase {
            case .countdown(let second):
                Text("Recording starts in \(second)… Settle on the part you want to capture.").font(.subheadline.weight(.semibold))
                Button("Cancel") { model.cancelCountdown() }.buttonStyle(.bordered)
            case .recording:
                Text("● Recording \(clock(model.elapsed))").font(.subheadline.weight(.semibold)).foregroundStyle(.red)
                Button(role: .destructive) { model.stop() } label: { Text("Stop recording").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
            case .finishing:
                Text("Finishing your recording…").font(.subheadline.weight(.semibold))
            default:
                Button {
                    errorText = ""
                    notice = ""
                    model.start(includeAudio: includeAudio)
                } label: {
                    Text(startLabel).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!rightsConfirmed)
            }
            Text("iOS asks for permission before every recording and shows a red indicator while it runs. Nothing is uploaded.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private var resultCard: some View {
        if case .finished(let url, let duration) = model.phase {
            VStack(alignment: .leading, spacing: 10) {
                Text("Your recording").font(.subheadline.weight(.semibold))
                Text("\(clock(duration)) · \(sizeString(url)) · MP4").font(.footnote).foregroundStyle(.secondary)
                VideoPlayer(player: AVPlayer(url: url))
                    .frame(height: UIScreen.main.bounds.height * 0.4)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button { saveToPhotos(url) } label: {
                    Text(savingToPhotos ? "Saving…" : "Save to Photos").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(savingToPhotos)
                ShareLink(item: url) { Label("Share or save to Files", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                Button(role: .destructive) { model.discardResult() } label: { Text("Discard").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
            .padding(16)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private var startLabel: String {
        if case .finished = model.phase { return "Record again" }
        return "Start recording"
    }

    private func loadLink() {
        errorText = ""
        notice = ""
        switch NativeVideoLinkPolicy.parse(linkText) {
        case .accepted(let url, let host, let label):
            loaded = (url, host, label)
            linkText = url.absoluteString
        case .rejected(let reason):
            loaded = nil
            errorText = reason
        }
    }

    private func saveToPhotos(_ url: URL) {
        savingToPhotos = true
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async {
                    savingToPhotos = false
                    errorText = "Photos access was not allowed. Use Share to save the video to Files instead."
                }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }, completionHandler: { success, error in
                DispatchQueue.main.async {
                    savingToPhotos = false
                    if success { notice = "Saved to your Photos library." } else { errorText = error?.localizedDescription ?? "The video could not be saved to Photos." }
                }
            })
        }
    }

    private func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0 ? String(format: "%d:%02d:%02d", hours, minutes, secs) : String(format: "%02d:%02d", minutes, secs)
    }

    private func sizeString(_ url: URL) -> String {
        let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
