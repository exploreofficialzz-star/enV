import Foundation
import SwiftUI
import SafariServices

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

/// iOS opens the original post and hands full-display recording to the system Control Center.
/// This preserves the real source-app UI. iOS owns the recording permission and save destination.
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

                if let failure {
                    Text(failure)
                        .font(.envScaled(size: 12, weight: .medium))
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .padding(16)
        }
        .sheet(item: $browserTarget) { target in
            NativeVideoPostBrowser(url: target.url)
                .ignoresSafeArea()
        }
    }
}
