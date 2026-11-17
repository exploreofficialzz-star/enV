import AVKit
import Foundation
import Photos
import SwiftUI
import UniformTypeIdentifiers

// Link validation mirrors the web and Android clients.
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
        guard !trimmed.isEmpty else { return .rejected("Paste a video link first.") }
        let candidate = trimmed.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) == nil
            ? "https://" + trimmed : trimmed
        guard let components = URLComponents(string: candidate),
              let scheme = components.scheme?.lowercased(),
              scheme == "https",
              components.user == nil,
              components.password == nil,
              let url = components.url else {
            return .rejected("Enter a valid secure HTTPS video link.")
        }
        var host = (components.host ?? "").lowercased()
        if host.hasPrefix("www.") { host = String(host.dropFirst(4)) }
        let isIPv4 = host.range(of: "^\\d{1,3}(\\.\\d{1,3}){3}$", options: .regularExpression) != nil
        let isLocal = host.isEmpty || host.contains(":") || isIPv4 || host == "localhost" ||
            host.hasSuffix(".localhost") || host.hasSuffix(".local") || host.hasSuffix(".internal") ||
            !host.contains(".")
        guard !isLocal else { return .rejected("Local, private-network and IP-address links are not accepted.") }
        if let blocked = protectedPlatforms.first(where: { hostMatches(host, $0.domains) }) {
            return .rejected(blocked.label + " protects its video with DRM. enV cannot export protected streams.")
        }
        let label = knownPlatforms.first(where: { hostMatches(host, $0.domains) })?.label ?? host
        return .accepted(url: url, host: host, platformLabel: label)
    }

    static func provider(for host: String) -> String {
        if hostMatches(host, ["youtube.com", "youtu.be", "youtube-nocookie.com"]) { return "youtube" }
        if hostMatches(host, ["tiktok.com"]) { return "tiktok" }
        if hostMatches(host, ["facebook.com", "fb.watch", "fb.com"]) { return "facebook" }
        if hostMatches(host, ["instagram.com"]) { return "instagram" }
        if hostMatches(host, ["x.com", "twitter.com"]) { return "x" }
        return "generic"
    }
}

private let nativeVideoLinkMaxBytes: Int64 = 500 * 1024 * 1024

private enum NativeVideoLinkService {
    static func download(_ source: URL, host: String) async throws -> URL {
        guard let rawBase = Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String,
              let base = URL(string: rawBase.trimmingCharacters(in: .whitespacesAndNewlines)),
              base.scheme?.lowercased() == "https",
              base.host != nil else {
            throw NSError(domain: "enVVideoLink", code: 1, userInfo: [NSLocalizedDescriptionKey: "The enV media service is not configured in this app build."])
        }

        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw URLError(.badURL)
        }
        let prefix = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = prefix + "/api/backend/url-media/download"
        guard let endpoint = components.url else { throw URLError(.badURL) }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 300
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("video/mp4, video/*, application/octet-stream", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "url": source.absoluteString,
            "provider": NativeVideoLinkPolicy.provider(for: host),
            "format": "mp4",
            "audioOnly": false,
            "maxBytes": nativeVideoLinkMaxBytes,
        ])

        let (temporaryURL, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200...299).contains(http.statusCode) else {
            let body = (try? Data(contentsOf: temporaryURL)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let payload = (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [String: Any]
            let message = (payload?["error"] as? String) ?? (payload?["message"] as? String)
            let displayMessage = message.flatMap { $0.isEmpty ? nil : $0 }
                ?? ("The enV media service returned HTTP " + String(http.statusCode) + ". Please try again.")
            throw NSError(domain: "enVVideoLink", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: displayMessage
            ])
        }

        let mime = http.value(forHTTPHeaderField: "Content-Type")?.components(separatedBy: ";").first?.lowercased() ?? ""
        guard mime.hasPrefix("video/") || mime == "application/octet-stream" || mime == "binary/octet-stream" else {
            throw NSError(domain: "enVVideoLink", code: 2, userInfo: [NSLocalizedDescriptionKey: "The media service response was not a video file."])
        }
        let values = try temporaryURL.resourceValues(forKeys: [.fileSizeKey])
        guard let size = values.fileSize, size > 0, Int64(size) <= nativeVideoLinkMaxBytes else {
            throw NSError(domain: "enVVideoLink", code: 3, userInfo: [NSLocalizedDescriptionKey: "The returned video is empty or larger than the 500 MB limit."])
        }
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("enV-video-" + UUID().uuidString)
            .appendingPathExtension("mp4")
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        return destination
    }
}

struct NativeVideoLinkRecorderView: View {
    @State private var linkText = ""
    @State private var rightsConfirmed = false
    @State private var busy = false
    @State private var statusText = ""
    @State private var errorText = ""
    @State private var outputURL: URL?
    @State private var outputPlayer: AVPlayer?
    @State private var showingFilePicker = false
    @State private var savingToPhotos = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Video Link Screen Recording").font(.headline)
                    Text("Submit a video link or choose a video file. enV prepares the video and shows the result here.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 8) {
                    Text("Video link").font(.subheadline.weight(.medium))
                    TextField("Paste a public video link", text: $linkText)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(busy)
                        .onChange(of: linkText) { _ in
                            errorText = ""
                            statusText = ""
                            outputPlayer?.pause()
                            if let previous = outputURL { try? FileManager.default.removeItem(at: previous) }
                            outputURL = nil
                            outputPlayer = nil
                        }
                        .onSubmit { Task { await processLink() } }

                    Toggle("I own this video or have permission to save and use it.", isOn: $rightsConfirmed)
                        .font(.footnote)
                        .disabled(busy)

                    Button {
                        Task { await processLink() }
                    } label: {
                        HStack {
                            Spacer()
                            if busy { ProgressView().tint(.white) }
                            Text(busy ? "Processing video…" : "Process video")
                            Spacer()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || linkText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !rightsConfirmed)
                }

                HStack(spacing: 10) {
                    Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 1)
                    Text("OR").font(.caption).foregroundStyle(.secondary)
                    Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 1)
                }

                Button {
                    showingFilePicker = true
                } label: {
                    Label("Choose a video from this device", systemImage: "video.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(busy)
                Text("On-device processing. Selected files stay on this device and are not uploaded.")
                    .font(.footnote).foregroundStyle(.secondary)

                if busy {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(statusText.isEmpty ? "Preparing your video…" : statusText).font(.subheadline)
                    }
                }

                if let outputURL, let outputPlayer {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Your video").font(.subheadline.weight(.semibold))
                        VideoPlayer(player: outputPlayer)
                            .frame(height: 230)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Text(outputURL.lastPathComponent)
                            .font(.footnote).foregroundStyle(.secondary)
                            .lineLimit(2)
                        Button {
                            saveToPhotos(outputURL)
                        } label: {
                            HStack {
                                Spacer()
                                Text(savingToPhotos ? "Saving…" : "Save to Photos")
                                Spacer()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(savingToPhotos)
                        ShareLink(item: outputURL) {
                            Label("Share or save to Files", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        Button(role: .destructive) {
                            outputPlayer.pause()
                            try? FileManager.default.removeItem(at: outputURL)
                            self.outputURL = nil
                            self.outputPlayer = nil
                        } label: {
                            Text("Discard video").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(14)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }

                if !statusText.isEmpty && !busy {
                    Text(statusText).font(.footnote).foregroundStyle(.secondary)
                }
                if !errorText.isEmpty {
                    Text(errorText).font(.footnote).foregroundStyle(.red)
                }
            }
            .padding(16)
        }
        .fileImporter(
            isPresented: $showingFilePicker,
            allowedContentTypes: [.movie, .video],
            allowsMultipleSelection: false,
            onCompletion: handleFileImport
        )
    }

    @MainActor
    private func processLink() async {
        errorText = ""
        statusText = ""
        guard rightsConfirmed else {
            errorText = "Confirm that you own this video or have permission to save and use it."
            return
        }
        let parsed: (url: URL, host: String)
        switch NativeVideoLinkPolicy.parse(linkText) {
        case .accepted(let url, let host, _): parsed = (url, host)
        case .rejected(let reason): errorText = reason; return
        }
        outputPlayer?.pause()
        if let previous = outputURL { try? FileManager.default.removeItem(at: previous) }
        outputURL = nil
        outputPlayer = nil
        busy = true
        statusText = "Retrieving the original video…"
        do {
            let downloaded = try await NativeVideoLinkService.download(parsed.url, host: parsed.host)
            replaceOutput(with: downloaded)
            statusText = "Your video is ready."
        } catch {
            errorText = error.localizedDescription
            statusText = ""
        }
        busy = false
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            errorText = error.localizedDescription
        case .success(let urls):
            guard let selected = urls.first else { return }
            let hasAccess = selected.startAccessingSecurityScopedResource()
            defer { if hasAccess { selected.stopAccessingSecurityScopedResource() } }
            do {
                let values = try selected.resourceValues(forKeys: [.fileSizeKey])
                guard let size = values.fileSize, size > 0, Int64(size) <= nativeVideoLinkMaxBytes else {
                    throw NSError(domain: "enVVideoLink", code: 4, userInfo: [NSLocalizedDescriptionKey: "Choose a non-empty video file smaller than 500 MB."])
                }
                let ext = selected.pathExtension.isEmpty ? "mp4" : selected.pathExtension
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent("enV-local-video-" + UUID().uuidString)
                    .appendingPathExtension(ext)
                try FileManager.default.copyItem(at: selected, to: destination)
                replaceOutput(with: destination)
                errorText = ""
                statusText = "Your video is ready."
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func replaceOutput(with url: URL) {
        outputPlayer?.pause()
        if let previous = outputURL { try? FileManager.default.removeItem(at: previous) }
        outputURL = url
        outputPlayer = AVPlayer(url: url)
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
                    if success {
                        statusText = "Saved to your Photos library."
                    } else {
                        errorText = error?.localizedDescription ?? "The video could not be saved to Photos."
                    }
                }
            })
        }
    }
}
