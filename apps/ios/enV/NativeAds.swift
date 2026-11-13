import Foundation
import Network
import SwiftUI
import UIKit
import GoogleMobileAds
import UserMessagingPlatform

enum NativeAdsPolicy {
    private static let info = Bundle.main.infoDictionary ?? [:]
    private static func flag(_ key: String) -> Bool {
        let value = (info[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return value == "yes" || value == "true" || value == "1"
    }

    static var adsEnabled: Bool { flag("ENV_ADS_ENABLED") }
    static var privacyConfigured: Bool { flag("ENV_ADS_PRIVACY_CONFIGURED") }
    static var publisherAppID: String { info["GADApplicationIdentifier"] as? String ?? "" }
    static var bannerUnitID: String { info["ENV_ADMOB_BANNER_AD_UNIT_ID"] as? String ?? "" }
    static var allowlistedToolIDs: Set<String> {
        Set((info["ENV_AD_SUPPORTED_TOOL_IDS"] as? String ?? "")
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.range(of: "^[a-z0-9][a-z0-9-]{0,119}$", options: .regularExpression) != nil })
    }

    static var adDisplayConfigured: Bool {
        adsEnabled && privacyConfigured &&
        publisherAppID.range(of: "^ca-app-pub-[0-9]{16}~[0-9]{10}$", options: .regularExpression) != nil &&
        bannerUnitID.range(of: "^ca-app-pub-[0-9]{16}/[0-9]{10}$", options: .regularExpression) != nil
    }

    private struct PricingIndex: Decodable {
        struct Profile: Decodable {
            let toolId: String
            let billingKey: String
            let platforms: [String]
        }
        let profiles: [Profile]
    }

    private static let crossPlatformMeteredIDs: Set<String> = {
        guard let url = Bundle.main.url(forResource: "offline-eligible-tools", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let registry = try? JSONDecoder().decode(PricingIndex.self, from: data) else { return [] }
        return Set(registry.profiles.filter {
            $0.billingKey.hasPrefix("local.") &&
            ["web", "android", "ios"].allSatisfy($0.platforms.contains)
        }.map(\.toolId))
    }()

    static func isHybridTool(_ tool: Tool) -> Bool {
        let restrictedDisclaimers: Set<String> = ["health", "finance", "earnings"]
        let restrictedCategories: Set<String> = ["fitness", "personal"]
        return allowlistedToolIDs.contains(tool.id) &&
            crossPlatformMeteredIDs.contains(tool.id) &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            !restrictedCategories.contains(tool.category) &&
            !tool.id.hasPrefix("finance-") &&
            (tool.disclaimer.map { !restrictedDisclaimers.contains($0) } ?? true)
    }

    /// Native ad eligibility is separate from offline-wallet qualification.
    /// This decides only whether an online banner may appear; it never grants
    /// offline tool execution or token-allowance access.
    static func isAdEligibleTool(_ tool: Tool) -> Bool {
        let restrictedDisclaimers: Set<String> = ["health", "finance", "earnings"]
        let restrictedCategories: Set<String> = [
            "health", "finance", "earnings", "fitness", "personal",
            "ai", "lab", "labs"
        ]
        let localEngineTypes: Set<String> = [
            "calculator", "converter", "datetime", "text", "codec", "color", "qr",
            "barcode", "generator", "image", "cssgen", "mockup", "post", "device",
            "seo", "file-converter", "developer", "pdf", "mime", "security",
            "creator", "business", "audio", "network", "video", "document"
        ]
        let localCustomCategories: Set<String> = [
            "career", "celebrations", "communication", "ecommerce", "events", "food",
            "gaming", "interactive", "marketing", "mockups", "photography",
            "productivity", "relationships", "screenshots", "social", "streaming", "files",
            "travel", "webdesign"
        ]
        let localDocumentIDs: Set<String> = [
            "pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor",
            "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx",
            "txt-to-docx", "markdown-to-docx"
        ]
        let remoteAudioOperations: Set<String> = [
            "server-mp3", "server-wav", "server-ogg", "server-flac", "server-volume",
            "server-bitrate", "server-sample-rate", "server-channels", "server-merge"
        ]
        let remoteVideoOperations: Set<String> = [
            "video-merge", "video-replace-audio", "video-to-mp4", "video-to-mp3",
            "video-to-gif", "video-to-webm", "video-to-mov", "video-to-avi",
            "video-resize", "video-crop", "video-rotate", "video-mute", "video-fps",
            "video-bitrate", "video-resolution-presets", "video-audio-volume"
        ]
        let remoteToolIDs: Set<String> = [
            "audio-to-mp3-server", "audio-to-wav-server", "audio-to-ogg-server",
            "audio-to-flac-server", "audio-bitrate-converter", "audio-merger",
            "audio-to-text", "audio-to-subtitles", "video-merger", "video-audio-replacer",
            "video-to-mp4", "video-to-mp3", "video-to-gif", "video-to-webm", "video-to-mov",
            "video-to-avi", "video-resize", "video-crop", "video-rotate", "video-mute",
            "video-fps", "video-bitrate", "video-resolution-presets", "video-audio-volume",
            "video-cropper", "video-to-text", "video-to-subtitles", "youtube-audio-extractor",
            "url-media-inspector", "video-url-downloader", "youtube-video-downloader",
            "tiktok-video-downloader", "facebook-video-downloader", "instagram-video-downloader",
            "x-video-downloader", "whois-lookup", "dns-lookup", "website-screenshot",
            "media-backend-checker"
        ]

        let engineType = (tool.engine.type ?? "").lowercased()
        let operation = (tool.engine.op ?? "").lowercased()
        let identity = ([tool.id, tool.name, tool.subcategory ?? "", engineType, tool.engine.id ?? ""] +
                        tool.tags + tool.keywords)
            .joined(separator: " ")
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .lowercased()
        let excludedConcept = identity.range(
            of: #"\b(studio|studios|lab|labs|laboratory|laboratories|sandbox|ai|artificial intelligence)\b"#,
            options: .regularExpression
        ) != nil
        let localExecution = localEngineTypes.contains(engineType) ||
            (engineType == "custom" && localCustomCategories.contains(tool.category)) ||
            (engineType == "document-backend" && localDocumentIDs.contains(tool.id))
        let remoteExecution = ["url-media", "url-media-info"].contains(engineType) ||
            remoteAudioOperations.contains(operation) ||
            remoteVideoOperations.contains(operation) ||
            remoteToolIDs.contains(tool.id)

        return tool.id != "a-book" &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            !restrictedCategories.contains(tool.category.lowercased()) &&
            !tool.id.hasPrefix("finance-") &&
            !(tool.disclaimer.map { restrictedDisclaimers.contains($0.lowercased()) } ?? false) &&
            engineType != "ai" &&
            localExecution &&
            !remoteExecution &&
            !excludedConcept
    }

    static func isApplicationOnline() async -> Bool {
        guard let url = URL(string: "https://envtools.store/") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 3
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200..<400).contains(http.statusCode),
                  response.url?.host == url.host else { return false }
            return true
        } catch {
            return false
        }
    }
}

@MainActor
final class NativeAdsPrivacyManager: ObservableObject {
    static let shared = NativeAdsPrivacyManager()
    @Published private(set) var canRequestAds = false
    @Published private(set) var privacyOptionsRequired = false
    @Published private(set) var sdkReady = false
    private var refreshing = false
    private var sdkStarting = false

    private init() {}

    func refreshConsentAtLaunch() async {
        guard NativeAdsPolicy.adDisplayConfigured, !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
            try await ConsentForm.loadAndPresentIfRequired(from: nil)
        } catch {
            canRequestAds = false
            privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
            return
        }
        updateConsentState()
        await initializeSDKWhenAllowed()
    }

    func presentPrivacyOptions() async {
        guard privacyOptionsRequired else { return }
        do {
            try await ConsentForm.presentPrivacyOptionsForm(from: nil)
            updateConsentState()
            await initializeSDKWhenAllowed()
        } catch {
            canRequestAds = false
            privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        }
    }

    private func updateConsentState() {
        canRequestAds = ConsentInformation.shared.canRequestAds
        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
    }

    private func initializeSDKWhenAllowed() async {
        guard canRequestAds, !sdkReady, !sdkStarting else { return }
        sdkStarting = true
        MobileAds.shared.requestConfiguration.publisherPrivacyPersonalizationState = .disabled
        MobileAds.shared.requestConfiguration.coarseLocationCollectionEnabled = false
        await withCheckedContinuation { continuation in
            MobileAds.shared.start { _ in continuation.resume() }
        }
        sdkStarting = false
        sdkReady = true
    }
}

@MainActor
final class NativeAdsAvailability: ObservableObject {
    static let shared = NativeAdsAvailability()
    @Published private(set) var filledToolIDs: Set<String> = []

    private init() {}

    func isFilled(_ toolID: String) -> Bool {
        filledToolIDs.contains(toolID)
    }

    func setFilled(_ toolID: String, _ filled: Bool) {
        if filled { filledToolIDs.insert(toolID) }
        else { filledToolIDs.remove(toolID) }
    }
}

@MainActor
private final class NativeAdsReachability: ObservableObject {
    @Published private(set) var hasNetwork = false
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "store.env.ads-reachability", qos: .utility)

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.hasNetwork = path.status == .satisfied }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}

struct NativeToolAdSlot: View {
    let tool: Tool
    @StateObject private var consent = NativeAdsPrivacyManager.shared
    @StateObject private var reachability = NativeAdsReachability()
    @StateObject private var availability = NativeAdsAvailability.shared
    @State private var originReachable = false

    private var canRequestAd: Bool {
        NativeAdsPolicy.adDisplayConfigured &&
            NativeAdsPolicy.isAdEligibleTool(tool) &&
            originReachable && consent.canRequestAds && consent.sdkReady
    }

    var body: some View {
        Group {
            if canRequestAd {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Advertisement")
                        .font(.caption2)
                        .foregroundStyle(Color.envMuted)
                    let width = max(320, Int(UIScreen.main.bounds.width - 32))
                    let size = largeAnchoredAdaptiveBanner(width: CGFloat(width))
                    NativeBannerAdView(adUnitID: NativeAdsPolicy.bannerUnitID, adSize: size, toolID: tool.id)
                        .frame(width: size.size.width, height: size.size.height)
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .task(id: canRequestAd) {
            if !canRequestAd { availability.setFilled(tool.id, false) }
        }
        .task(id: reachability.hasNetwork) {
            guard reachability.hasNetwork else {
                originReachable = false
                return
            }
            while !Task.isCancelled {
                originReachable = await NativeAdsPolicy.isApplicationOnline()
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }
}

private struct NativeBannerAdView: UIViewRepresentable {
    let adUnitID: String
    let adSize: AdSize
    let toolID: String

    func makeCoordinator() -> Coordinator {
        Coordinator(toolID: toolID)
    }

    func makeUIView(context: Context) -> BannerView {
        let banner = BannerView(adSize: adSize)
        banner.adUnitID = adUnitID
        banner.delegate = context.coordinator
        banner.load(Request())
        return banner
    }

    func updateUIView(_ uiView: BannerView, context: Context) {}

    static func dismantleUIView(_ uiView: BannerView, coordinator: Coordinator) {
        uiView.delegate = nil
        NativeAdsAvailability.shared.setFilled(coordinator.toolID, false)
    }

    final class Coordinator: NSObject, BannerViewDelegate {
        let toolID: String
        init(toolID: String) { self.toolID = toolID }

        func bannerViewDidReceiveAd(_ bannerView: BannerView) {
            Task { @MainActor in NativeAdsAvailability.shared.setFilled(toolID, true) }
        }

        func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
            Task { @MainActor in NativeAdsAvailability.shared.setFilled(toolID, false) }
        }
    }
}

enum NativeHybridAccessError: LocalizedError {
    case offlineAllowanceRequired

    var errorDescription: String? {
        "Connect to use this tool online, or sign in and prepare an offline allowance in Wallet before disconnecting."
    }
}
