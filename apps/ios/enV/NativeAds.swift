import Foundation
import Network
import SwiftUI
import UIKit
import GoogleMobileAds
import UserMessagingPlatform

typealias NativeToolAccessCompletion = @MainActor (Bool) -> Void

private struct NativeToolAccessCompletionKey: EnvironmentKey {
    static let defaultValue: NativeToolAccessCompletion = { _ in }
}

extension EnvironmentValues {
    var nativeToolAccessCompletion: NativeToolAccessCompletion {
        get { self[NativeToolAccessCompletionKey.self] }
        set { self[NativeToolAccessCompletionKey.self] = newValue }
    }
}

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
    static var rewardedUnitID: String { info["ENV_ADMOB_REWARDED_AD_UNIT_ID"] as? String ?? "" }
    static var rewardedAccessEnabled: Bool { flag("ENV_AD_ACCESS_GATE_ENABLED") }
    static var rewardedToolIDs: Set<String> {
        Set((info["ENV_AD_ACCESS_TOOL_IDS"] as? String ?? "")
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.range(of: "^[a-z0-9][a-z0-9-]{0,119}$", options: .regularExpression) != nil })
    }
    static var privacySetupConfigured: Bool {
        adsEnabled && privacyConfigured &&
        publisherAppID.range(of: "^ca-app-pub-[0-9]{16}~[0-9]{10}$", options: .regularExpression) != nil
    }
    static var rewardedAccessConfigured: Bool { rewardedAccessEnabled }
    static var rewardedAdsConfigured: Bool {
        rewardedAccessConfigured && privacySetupConfigured &&
        rewardedUnitID.range(of: "^/[A-Za-z0-9_./-]{3,180}$", options: .regularExpression) != nil
    }
    static func isRewardedAccessTool(_ tool: Tool) -> Bool {
        rewardedAccessConfigured && rewardedToolIDs.contains(tool.id) && isAdEligibleTool(tool)
    }
    static var allowlistedToolIDs: Set<String> {
        Set((info["ENV_AD_SUPPORTED_TOOL_IDS"] as? String ?? "")
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.range(of: "^[a-z0-9][a-z0-9-]{0,119}$", options: .regularExpression) != nil })
    }

    static var adDisplayConfigured: Bool {
        privacySetupConfigured &&
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
            "ai", "developer", "accessibility", "lab", "labs"
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

        return tool.status == "active" &&
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
        guard NativeAdsPolicy.privacySetupConfigured, !refreshing else { return }
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

private enum NativeRewardedAdProgress {
    private static let startKey = "env.rewardedAccess.periodStartedAt"
    private static let countKey = "env.rewardedAccess.completed"
    private static let offerShownKey = "env.rewardedAccess.offerShownAt"
    private static let period: TimeInterval = 30 * 24 * 60 * 60

    static func recordCompletion(now: Date = Date()) -> Bool {
        let defaults = UserDefaults.standard
        let storedStart = defaults.object(forKey: startKey) as? Date
        let expired = storedStart == nil || now < storedStart! || now.timeIntervalSince(storedStart!) >= period
        let start = expired ? now : storedStart!
        let count = (expired ? 0 : defaults.integer(forKey: countKey)) + 1
        let alreadyShown = expired ? false : defaults.object(forKey: offerShownKey) != nil
        let shouldShow = count >= 3 && !alreadyShown
        defaults.set(start, forKey: startKey)
        defaults.set(count, forKey: countKey)
        if shouldShow { defaults.set(now, forKey: offerShownKey) }
        return shouldShow
    }
}

private final class NativeRewardedAdDelegate: NSObject, FullScreenContentDelegate {
    var onDismiss: (() -> Void)?
    var onFailure: (() -> Void)?

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        onDismiss?()
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        onFailure?()
    }
}

struct NativeRewardedToolAccessGate<Content: View>: View {
    let tool: Tool
    let onOpenWallet: () -> Void
    @ViewBuilder let content: () -> Content
    @StateObject private var consent = NativeAdsPrivacyManager.shared
    @StateObject private var reachability = NativeAdsReachability()
    @State private var originReachable = false
    @State private var unlocked = false
    @State private var busy = false
    @State private var message = ""
    @State private var showAdFreeOffer = false
    @State private var showTokenConfirmation = false
    @State private var pendingReservation: OfflineWalletNativeAPI.ToolAccessReservation?
    @State private var activeReservation: OfflineWalletNativeAPI.ToolAccessReservation?
    @State private var adDelegate: NativeRewardedAdDelegate?

    private var isConfigured: Bool { NativeAdsPolicy.isRewardedAccessTool(tool) }
    private var canWatch: Bool {
        isConfigured && NativeAdsPolicy.rewardedAdsConfigured && reachability.hasNetwork && originReachable && consent.canRequestAds && consent.sdkReady && !busy
    }

    var body: some View {
        Group {
            // Offline/origin-unreachable execution stays under the existing
            // native signed allowance and journal checks.
            if !isConfigured || !reachability.hasNetwork || !originReachable || unlocked {
                content()
                    .environment(\.nativeToolAccessCompletion, completeTokenSession)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Continue to " + tool.name)
                        .font(.envScaled(size: 19, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    Text("Watch a complete rewarded video to use this tool for this visit, or use a reviewed enV token price for ad-free access.")
                        .font(.envScaled(size: 14, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: { Task { await watchRewardedAd() } }) {
                        HStack(spacing: 8) {
                            if busy { ProgressView().tint(.white) }
                            Text(busy ? "Loading rewarded ad…" : "Watch an ad to continue")
                        }
                        .font(.envScaled(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(Color.envInk, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(Color.envChrome)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canWatch)

                    Button(action: { Task { await reserveTokenAccess() } }) {
                        Text(busy ? "Checking reviewed token price…" : "Use enV tokens (ad-free)")
                            .font(.envScaled(size: 14, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy || !reachability.hasNetwork || !originReachable)

                    Button(action: onOpenWallet) {
                        Text("Open Wallet / sign in")
                            .font(.envScaled(size: 14, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)

                    if !consent.canRequestAds {
                        Text("Google advertising privacy settings must permit ads before a rewarded video can load.")
                            .font(.envScaled(size: 12, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                    } else if !reachability.hasNetwork || !originReachable {
                        Text("A verified connection to enV is required for online access.")
                            .font(.envScaled(size: 12, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                    }
                    if !message.isEmpty {
                        Text(message)
                            .font(.envScaled(size: 12, weight: .regular))
                            .foregroundStyle(Color.red)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.envBorder, lineWidth: 1))
            }
        }
        .task(id: reachability.hasNetwork) {
            guard reachability.hasNetwork else {
                originReachable = false
                return
            }
            originReachable = await NativeAdsPolicy.isApplicationOnline()
        }
        .confirmationDialog(
            "Confirm token access",
            isPresented: $showTokenConfirmation,
            titleVisibility: .visible
        ) {
            Button("Confirm and continue") {
                activeReservation = pendingReservation
                pendingReservation = nil
                unlocked = true
                message = ""
            }
            Button("Cancel without charge", role: .cancel) {
                guard let reservation = pendingReservation else { return }
                pendingReservation = nil
                Task { await releaseReservation(reservation) }
            }
        } message: {
            if let reservation = pendingReservation {
                Text("This tool costs \(reservation.reservedTokens.formatted()) enV tokens \(reservation.unitLabel). Tokens are deducted only after a successful tool result.")
            }
        }
        .alert("Ready to go ad-free?", isPresented: $showAdFreeOffer) {
            Button("Use enV tokens") { Task { await reserveTokenAccess() } }
            Button("Keep using ads", role: .cancel) { }
        } message: {
            Text("You completed three rewarded ads in the last 30 days. Use the reviewed token price for individual tools.")
        }
        .onDisappear {
            if let reservation = activeReservation {
                activeReservation = nil
                Task { await releaseReservation(reservation) }
            }
            if let reservation = pendingReservation {
                pendingReservation = nil
                Task { await releaseReservation(reservation) }
            }
        }
    }

    @MainActor
    private func reserveTokenAccess() async {
        guard !busy else { return }
        guard OfflineWalletNativeAPI.isPaired else {
            message = "Sign in to enV and pair this device from your Web Wallet before using tokens."
            onOpenWallet()
            return
        }
        guard reachability.hasNetwork && originReachable else {
            message = "Connect to enV to verify the reviewed price and reserve tokens. No tokens were charged."
            return
        }
        busy = true
        message = ""
        defer { busy = false }
        do {
            pendingReservation = try await OfflineWalletNativeAPI.reserveToolAccess(
                toolID: tool.id,
                sessionID: UUID().uuidString
            )
            showTokenConfirmation = true
        } catch {
            message = error.localizedDescription
        }
    }

    @MainActor
    private func releaseReservation(_ reservation: OfflineWalletNativeAPI.ToolAccessReservation) async {
        do {
            try await OfflineWalletNativeAPI.releaseToolAccess(toolID: tool.id, reservationID: reservation.reservationID)
        } catch {
            message = "The unused token reservation could not be released yet. Reconnect Wallet before starting another paid session."
        }
    }

    @MainActor
    private func completeTokenSession(success: Bool) {
        guard let reservation = activeReservation, !busy else { return }
        busy = true
        unlocked = false
        Task {
            do {
                if success {
                    try await OfflineWalletNativeAPI.settleToolAccess(toolID: tool.id, reservationID: reservation.reservationID)
                } else {
                    try await OfflineWalletNativeAPI.releaseToolAccess(toolID: tool.id, reservationID: reservation.reservationID)
                }
                activeReservation = nil
                message = ""
            } catch {
                message = "Token settlement could not be verified. Access is paused to prevent another charge. " + error.localizedDescription
            }
            busy = false
        }
    }

    @MainActor
    private func watchRewardedAd() async {
        guard canWatch else { return }
        busy = true
        message = ""
        do {
            let ad = try await RewardedAd.load(with: NativeAdsPolicy.rewardedUnitID, request: AdManagerRequest())
            let delegate = NativeRewardedAdDelegate()
            delegate.onDismiss = {
                Task { @MainActor in
                    self.busy = false
                    if !self.unlocked { self.message = "The rewarded ad was closed before completion. No access was unlocked." }
                    self.adDelegate = nil
                }
            }
            delegate.onFailure = {
                Task { @MainActor in
                    self.busy = false
                    self.message = "The rewarded ad could not be shown. Try again or use tokens."
                    self.adDelegate = nil
                }
            }
            adDelegate = delegate
            ad.fullScreenContentDelegate = delegate
            ad.present(from: nil) {
                Task { @MainActor in
                    self.unlocked = true
                    self.busy = false
                    self.showAdFreeOffer = NativeRewardedAdProgress.recordCompletion()
                }
            }
        } catch {
            busy = false
            message = "A rewarded ad is unavailable. Check your connection or advertising settings, then try again."
        }
    }
}

struct NativeToolAdSlot: View {
    let tool: Tool
    @StateObject private var consent = NativeAdsPrivacyManager.shared
    @StateObject private var reachability = NativeAdsReachability()
    @State private var originReachable = false

    var body: some View {
        Group {
            if NativeAdsPolicy.adDisplayConfigured && NativeAdsPolicy.isAdEligibleTool(tool) && originReachable &&
                consent.canRequestAds && consent.sdkReady {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Advertisement")
                        .font(.caption2)
                        .foregroundStyle(Color.envMuted)
                    let width = max(320, Int(UIScreen.main.bounds.width - 32))
                    let size = largeAnchoredAdaptiveBanner(width: CGFloat(width))
                    NativeBannerAdView(adUnitID: NativeAdsPolicy.bannerUnitID, adSize: size)
                        .frame(width: size.size.width, height: size.size.height)
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }
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

    func makeUIView(context: Context) -> BannerView {
        let banner = BannerView(adSize: adSize)
        banner.adUnitID = adUnitID
        banner.load(Request())
        return banner
    }

    func updateUIView(_ uiView: BannerView, context: Context) {}

    static func dismantleUIView(_ uiView: BannerView, coordinator: ()) {
        uiView.delegate = nil
    }
}

enum NativeHybridAccessError: LocalizedError {
    case offlineAllowanceRequired

    var errorDescription: String? {
        "Connect to use this tool online, or sign in and prepare an offline allowance in Wallet before disconnecting."
    }
}
