import Foundation
import Security

private struct OfflineWalletAPIEnvelope: Decodable {
    let ok: Bool
    let data: [String: AnyCodable]?
    let error: String?
    let message: String?
}

/// Minimal Decodable wrapper so the shared wallet envelope can be read without logging bodies.
private struct AnyCodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) { self.value = value }
        else if let value = try? container.decode(Bool.self) { self.value = value }
        else if let value = try? container.decode(Int64.self) { self.value = value }
        else if let value = try? container.decode(Double.self) { self.value = value }
        else if let value = try? container.decode([String: AnyCodable].self) { self.value = value.mapValues(\.value) }
        else if let value = try? container.decode([AnyCodable].self) { self.value = value.map(\.value) }
        else if container.decodeNil() { self.value = NSNull() }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported response value") }
    }
}

private enum OfflineWalletNativeAPIError: LocalizedError {
    case missingServer
    case unavailable(String)
    case invalidReply
    var errorDescription: String? {
        switch self {
        case .missingServer: return "The enV API base URL is not configured in this app build."
        case .unavailable(let message): return message
        case .invalidReply: return "The offline wallet returned an invalid response. Local records were preserved."
        }
    }
}

/// Native offline wallet: single-use pairing, Keychain bearer storage, allowance issuance and retry-safe non-final sync.
enum OfflineWalletNativeAPI {
    private static let service = Bundle.main.bundleIdentifier ?? "com.chastech.env.offline-wallet"
    private static let account = "native-session-token-v1"
    private static let idempotencyKey = "env.offline.pendingIssueIdempotency.v1"
    private static let deviceKeyIDKey = "env.offline.deviceKeyID.v1"

    private static var baseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String,
              let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), ["https", "http"].contains(scheme), url.host != nil else { return nil }
        #if !DEBUG
        guard scheme == "https" else { return nil }
        #endif
        return url
    }

    static func deviceKeyID() -> String {
        if let existing = UserDefaults.standard.string(forKey: deviceKeyIDKey), !existing.isEmpty { return existing }
        let created = "native-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        UserDefaults.standard.set(created, forKey: deviceKeyIDKey)
        return created
    }

    static var isPaired: Bool { loadSessionToken() != nil }

    private static func loadSessionToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data, let token = String(data: data, encoding: .utf8),
              token.range(of: "^envnative1_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { return nil }
        return token
    }

    private static func saveSessionToken(_ token: String) throws {
        guard token.range(of: "^envnative1_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            throw OfflineWalletNativeAPIError.invalidReply
        }
        let data = Data(token.utf8)
        let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: account]
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let update = SecItemUpdate(key as CFDictionary, attributes as CFDictionary)
        if update == errSecItemNotFound {
            var insert = key; attributes.forEach { insert[$0.key] = $0.value }
            let status = SecItemAdd(insert as CFDictionary, nil)
            guard status == errSecSuccess else { throw OfflineWalletNativeAPIError.unavailable("The paired session could not be saved securely in Keychain (\(status)).") }
        } else if update != errSecSuccess {
            throw OfflineWalletNativeAPIError.unavailable("The paired session could not be saved securely in Keychain (\(update)).")
        }
    }

    private static func makeRequest(path: String, method: String, body: Data? = nil, bearer: String? = nil) async throws -> (Int, [String: Any]) {
        guard var url = baseURL else { throw OfflineWalletNativeAPIError.missingServer }
        for component in path.split(separator: "/") { url.appendPathComponent(String(component)) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            guard body.count <= 256_000 else { throw OfflineWalletNativeAPIError.unavailable("The offline wallet request exceeds the size limit.") }
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard data.count <= 512_000, let http = response as? HTTPURLResponse,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw OfflineWalletNativeAPIError.invalidReply }
        return (http.statusCode, object)
    }

    private static func responseData(_ result: (Int, [String: Any])) throws -> [String: Any] {
        let (status, object) = result
        guard (200...299).contains(status), object["ok"] as? Bool == true,
              let data = object["data"] as? [String: Any] else {
            let message = object["message"] as? String ?? "The offline wallet request failed (HTTP \(status))."
            let code = object["error"] as? String
            throw OfflineWalletNativeAPIError.unavailable(code.map { "\(message) [\($0)]" } ?? message)
        }
        return data
    }

    static func fetchWalletDashboard() async throws -> [String: Any] {
        guard let bearer = loadSessionToken() else {
            throw OfflineWalletNativeAPIError.unavailable("Pair this iOS device from your signed-in enV web Wallet first.")
        }
        return try responseData(await makeRequest(path: "api/billing/native-wallet", method: "GET", bearer: bearer))
    }

    static func checkAvailability() async -> (enabled: Bool, code: String, message: String) {
        do {
            let data = try responseData(await makeRequest(path: "api/billing/offline/status", method: "GET"))
            return (data["enabled"] as? Bool == true, data["code"] as? String ?? "", data["message"] as? String ?? "Offline token spending is paused.")
        } catch { return (false, "UNAVAILABLE", error.localizedDescription) }
    }

    static func pair(code: String) async throws {
        let journal = try OfflineWalletJournal()
        let keyID = deviceKeyID()
        let key = try journal.publicDeviceKey(deviceKeyID: keyID)
        let keyData = try JSONEncoder().encode(key)
        guard let publicJWK = try JSONSerialization.jsonObject(with: keyData) as? [String: Any] else { throw OfflineWalletNativeAPIError.invalidReply }
        let body = try JSONSerialization.data(withJSONObject: ["pairingCode": code.trimmingCharacters(in: .whitespacesAndNewlines),
            "platform": "ios", "publicKeyJwk": publicJWK])
        let data = try responseData(await makeRequest(path: "api/billing/offline/pairing/redeem", method: "POST", body: body))
        guard let token = data["sessionToken"] as? String else { throw OfflineWalletNativeAPIError.invalidReply }
        try saveSessionToken(token)
    }

    static func reserveAllowance(journal: OfflineWalletJournal) async throws -> String {
        guard let bearer = loadSessionToken() else { throw OfflineWalletNativeAPIError.unavailable("Pair this iOS device from your signed-in enV web wallet first.") }
        let keyID = deviceKeyID()
        let publicKey = try journal.publicDeviceKey(deviceKeyID: keyID)
        let keyData = try JSONEncoder().encode(publicKey)
        guard let publicJWK = try JSONSerialization.jsonObject(with: keyData) as? [String: Any] else { throw OfflineWalletNativeAPIError.invalidReply }
        let defaults = UserDefaults.standard
        let issueKey = defaults.string(forKey: idempotencyKey) ?? "native-offline-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        defaults.set(issueKey, forKey: idempotencyKey)
        let body = try JSONSerialization.data(withJSONObject: ["requestedSubunits": 5000, "idempotencyKey": issueKey,
            "platform": "ios", "publicKeyJwk": publicJWK])
        let data = try responseData(await makeRequest(path: "api/billing/offline/allowances", method: "POST", body: body, bearer: bearer))
        guard let allowance = data["allowance"] as? [String: Any], let token = data["allowanceToken"] as? String,
              let allowanceID = allowance["allowanceId"] as? String,
              let amount = allowance["allowanceSubunits"] as? NSNumber,
              let pricingVersion = allowance["pricingVersion"] as? String,
              let issuedAt = allowance["issuedAt"] as? String, let expiresAt = allowance["expiresAt"] as? String else {
            throw OfflineWalletNativeAPIError.invalidReply
        }
        try journal.installAllowance(.init(allowanceID: allowanceID, deviceKeyID: keyID, token: token,
            allowanceSubunits: amount.int64Value, pricingVersion: pricingVersion, issuedAt: issuedAt, expiresAt: expiresAt))
        defaults.removeObject(forKey: idempotencyKey)
        return allowanceID
    }

    static func synchronize(journal: OfflineWalletJournal, allowanceID: String, finalize: Bool = false) async throws -> String {
        if finalize {
            let availability = await checkAvailability()
            guard availability.enabled && availability.code == "LOCAL_TEST_ONLY" else {
                throw OfflineWalletNativeAPIError.unavailable("Finalization is available only in the isolated local-test environment. Independent app-integrity verification is required before production can release unused reservations.")
            }
        }
        guard let bearer = loadSessionToken() else { throw OfflineWalletNativeAPIError.unavailable("This device is not paired. Local records were not removed.") }
        let repair = try journal.repairFinishingOperations(allowanceID: allowanceID)
        guard repair.unresolvedPreparing == 0 else { throw OfflineWalletJournalError.unresolvedOperation }
        if try journal.pendingTransactionCount(allowanceID: allowanceID) == 0 && !finalize { return "No pending offline operations need synchronization." }
        let batch = try journal.buildSyncBatch(allowanceID: allowanceID, finalize: finalize)
        let body = try JSONEncoder().encode(batch)
        let result = try await makeRequest(path: "api/billing/offline/sync", method: "POST", body: body, bearer: bearer)
        let (status, object) = result
        if (200...299).contains(status), object["ok"] as? Bool == true,
           let data = object["data"] as? [String: Any], let resultStatus = data["status"] as? String {
            try journal.acknowledgeSyncBatch(allowanceID: allowanceID, batchID: batch.batchId, resultStatus: resultStatus)
            if resultStatus == "reconciled" {
                let accepted = (data["acceptedSubunits"] as? NSNumber)?.doubleValue ?? 0
                let released = (data["releasedSubunits"] as? NSNumber)?.doubleValue ?? 0
                return "Local-test allowance finalized. Accepted usage: \(accepted / 1000) tokens; unused test reservation returned: \(released / 1000) tokens."
            }
            if finalize { return "The next bounded sync batch was accepted. Review remaining records and finalize again to close this local-test allowance." }
            return "Offline records synchronized. Reserved funds remain protected until verified finalization."
        }
        let code = object["error"] as? String ?? ""
        if status == 409 && ["SEQUENCE_GAP", "CHECKPOINT_SEQUENCE_MISMATCH"].contains(code) {
            try journal.prepareRetryAfterRecoverableRejection(allowanceID: allowanceID, batchID: batch.batchId, reasonCode: code)
            return "The server requested a safe retry; local transaction records and spending counters were preserved."
        }
        if (status == 409 && ((object["data"] as? [String: Any])?["status"] as? String) == "needs_recovery") ||
            ["INVALID_DEVICE_SIGNATURE", "DEVICE_BINDING_MISMATCH", "INVALID_ALLOWANCE_TOKEN", "IDEMPOTENCY_CONFLICT", "OFFLINE_NEEDS_RECOVERY"].contains(code) {
            try journal.markNeedsRecovery(allowanceID: allowanceID)
        }
        throw OfflineWalletNativeAPIError.unavailable(object["message"] as? String ?? "Synchronization failed (HTTP \(status)); local records were preserved.")
    }
}
