import Foundation
import SwiftUI

/// iOS opens the original post and hands full-display recording to the system Control Center.
/// This preserves the real source-app UI. iOS owns the recording permission and save destination.
struct NativeVideoLinkRecorderView: View {
    @Environment(\.openURL) private var openURL
    @State private var postLink = ""
    @State private var provider = ""
    @State private var status = "Paste a public social-media post link to begin."
    @State private var failure: String?

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
                VStack(alignment: .leading, spacing: 6) {
                    Text("Video Link Screen Recording")
                        .font(.envScaled(size: 18, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    Text("Paste a post link and open the original platform. enV records the real screen — including the video, creator information, likes, comments, captions and visible controls — not a recreated interface.")
                        .font(.envScaled(size: 13, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))

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
                            status = "Paste a public social-media post link to begin."
                        }
                    if !provider.isEmpty {
                        Text("Platform: \(provider)")
                            .font(.envScaled(size: 12, weight: .medium))
                            .foregroundStyle(Color.envMuted)
                    }
                }

                Button {
                    guard let url = validatedPost() else { return }
                    openURL(url) { accepted in
                        status = accepted
                            ? "Original post opened. Start Screen Recording from Control Center, return to the post, and play it."
                            : "iOS could not open this post link. Check that the post is public and try again."
                    }
                } label: {
                    Label("Open original post", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.envInk)
                .foregroundStyle(Color.envSurface)
                .disabled(postLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Record the original platform screen")
                        .font(.envScaled(size: 15, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    instructionRow("1", "Open Control Center. On Face ID iPhones, swipe down from the top-right corner. On Home button iPhones, swipe up from the bottom.")
                    instructionRow("2", "Tap Screen Recording. Wait for the countdown, then return to the original post.")
                    instructionRow("3", "Play the video. Keep the post on screen and scroll through likes, comments or other details you want included.")
                    instructionRow("4", "Stop Screen Recording from the red status indicator or Control Center. iOS saves the finished recording to Photos.")
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))

                Text("iOS controls full-screen recording and its permission prompt. enV cannot start or stop Apple's system recorder from inside the app on the currently supported iOS deployment target. Protected screens or audio may be excluded by iOS or the source platform.")
                    .font(.envScaled(size: 12, weight: .regular))
                    .foregroundStyle(Color.envMuted)
                    .fixedSize(horizontal: false, vertical: true)

                if let failure {
                    Text(failure)
                        .font(.envScaled(size: 12, weight: .medium))
                        .foregroundStyle(.red)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                Text(status)
                    .font(.envScaled(size: 12, weight: .regular))
                    .foregroundStyle(Color.envMuted)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            .padding(16)
        }
    }

    private func instructionRow(_ number: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(number)
                .font(.envScaled(size: 12, weight: .semibold))
                .foregroundStyle(Color.envSurface)
                .frame(width: 24, height: 24)
                .background(Color.envInk, in: Circle())
            Text(text)
                .font(.envScaled(size: 12, weight: .regular))
                .foregroundStyle(Color.envMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
