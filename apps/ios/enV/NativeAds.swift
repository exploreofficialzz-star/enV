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

    static func isHybridTool(_ toolID: String) -> Bool {
        adDisplayConfigured && allowlistedToolIDs.contains(toolID) && crossPlatformMeteredIDs.contains(toolID)
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

struct NativeToolAdSlot: View {
    let tool: Tool
    @StateObject private var consent = NativeAdsPrivacyManager.shared
    @StateObject private var reachability = NativeAdsReachability()
    @State private var originReachable = false

    var body: some View {
        Group {
            if NativeAdsPolicy.isHybridTool(tool.id) && originReachable &&
                consent.canRequestAds && consent.sdkReady {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Advertisement")
                        .font(.caption2)
                        .foregroundStyle(Color.envMuted)
                    let width = max(320, Int(UIScreen.main.bounds.width - 32))
                    let size = largeAnchoredAdaptiveBanner(width: width)
                    NativeBannerAdView(adUnitID: NativeAdsPolicy.bannerUnitID, adSize: size)
                        .frame(width: size.size.width, height: size.size.height)
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .task(id: reachability.hasNetwork) {
            if reachability.hasNetwork {
            originReachable = await NativeAdsPolicy.isApplicationOnline()
        } else {
            originReachable = false
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
