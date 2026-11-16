import SwiftUI
import UIKit

struct NativeSocialMediaPostRecorderView: View {
    @Environment(\.openURL) private var openURL
    @State private var postLink = ""
    @State private var provider = ""
    @State private var status = "Paste a public social-media post link to begin."
    @State private var failure: String?

    private let providerDomains: [(String, [String])] = [
        ("TikTok", ["tiktok.com"]),
        ("Instagram", ["instagram.com"]),
        ("Facebook", ["facebook.com", "fb.watch"]),
        ("YouTube", ["youtube.com", "youtu.be"]),
        ("X", ["x.com", "twitter.com"]),
        ("Snapchat", ["snapchat.com"]),
        ("Threads", ["threads.net"]),
        ("LinkedIn", ["linkedin.com"]),
        ("Reddit", ["reddit.com"]),
        ("Twitch", ["twitch.tv"]),
        ("Vimeo", ["vimeo.com"]),
        ("Dailymotion", ["dailymotion.com"])
    ]

    private func validatedPost() -> (URL, String)? {
        let value = postLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: value),
              components.scheme?.lowercased() == "https",
              components.user == nil,
              components.password == nil,
              (components.port == nil || components.port == 443),
              let host = components.host?.lowercased() else {
            failure = "Paste a valid HTTPS social-media post link."
            return nil
        }
        guard let match = providerDomains.first(where: { _, domains in
            domains.contains(where: { host == $0 || host.hasSuffix("." + $0) })
        }), let url = components.url else {
            failure = "This platform is not supported yet."
            return nil
        }
        provider = match.0
        failure = nil
        return (url, match.0)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Social Media Post Recorder", systemImage: "record.circle")
                        .font(.envScaled(size: 18, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    Text("Open a post link, then use iOS Screen Recording to capture the real screen. The video, post details and visible controls stay exactly as they appeared while recording.")
                        .font(.envScaled(size: 13, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Post link")
                        .font(.envScaled(size: 13, weight: .medium))
                        .foregroundStyle(Color.envInk)
                    TextField("Paste a TikTok, Instagram, Facebook or other link", text: $postLink)
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
                    guard let (url, _) = validatedPost() else { return }
                    openURL(url) { accepted in
                        status = accepted
                            ? "Post opened. Return to the post after starting iOS Screen Recording."
                            : "iOS could not open this link."
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
                    Text("Record the full screen")
                        .font(.envScaled(size: 15, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    instructionRow("1", "Open Control Center. Swipe down from the top-right corner on Face ID iPhones, or swipe up from the bottom on Home button models.")
                    instructionRow("2", "Tap and hold the Screen Recording control, then choose the microphone option only if you need to add microphone audio.")
                    instructionRow("3", "Start recording, return to the social-media post, play the video and scroll through any comments or details you want included.")
                    instructionRow("4", "Stop recording from the red recording indicator or Control Center. iOS saves the screen recording to Photos.")
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))

                Text("This uses Apple's system screen recorder. enV does not redraw the interface or invent engagement counts. Protected screens and source-app audio restrictions are controlled by iOS and the social app.")
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
