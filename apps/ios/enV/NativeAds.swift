import Foundation
import SwiftUI

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

/// Native hybrid-tool access policy for the existing signed offline-wallet boundary.
/// Native advertising is not shipped in this release.
enum NativeAdsPolicy {
    private static let info = Bundle.main.infoDictionary ?? [:]
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
        return crossPlatformMeteredIDs.contains(tool.id) &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            !restrictedCategories.contains(tool.category) &&
            !tool.id.hasPrefix("finance-") &&
            (tool.disclaimer.map { !restrictedDisclaimers.contains($0) } ?? true)
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


enum NativeHybridAccessError: LocalizedError {
    case offlineAllowanceRequired

    var errorDescription: String? {
        "Connect to use this tool online, or sign in and prepare an offline allowance in Wallet before disconnecting."
    }
}
