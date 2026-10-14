import Foundation

/// Pure Swift, on-device heuristics for suggesting a Developer Studio from pasted text.
/// This type never accesses UIPasteboard itself; the UI must call clipboard helpers explicitly.
struct DeveloperInputHint {
    let kind: String
    let confidence: String
    let studioSlug: String
    let modeKey: String
    let reason: String
}

enum NativeDeveloperSmartDetect {
    static func detect(_ raw: String) -> DeveloperInputHint? {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return nil }
        if input.range(of: #"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$"#, options: .regularExpression) != nil {
            return DeveloperInputHint(kind: "jwt", confidence: "high", studioSlug: "jwt-studio", modeKey: "decode", reason: "Looks like a JWT (three base64url segments).")
        }
        let uuidPattern = #"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89a-fA-F][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"#
        if input.range(of: uuidPattern, options: .regularExpression) != nil || input.lowercased() == "00000000-0000-0000-0000-000000000000" || input.lowercased() == "ffffffff-ffff-ffff-ffff-ffffffffffff" {
            return DeveloperInputHint(kind: "uuid", confidence: "high", studioSlug: "uuid-studio", modeKey: "validate", reason: "Looks like a canonical UUID.")
        }
        if input.range(of: #"^\d{10}$"#, options: .regularExpression) != nil || input.range(of: #"^\d{13}$"#, options: .regularExpression) != nil {
            return DeveloperInputHint(kind: "timestamp", confidence: "medium", studioSlug: "time-cron-studio", modeKey: "timestamp", reason: "Looks like a Unix timestamp (seconds or milliseconds).")
        }
        let parts = input.split(whereSeparator: { $0.isWhitespace })
        if parts.count == 5, input.count < 120, input.contains(where: { "*/,-".contains($0) }) {
            return DeveloperInputHint(kind: "cron", confidence: "medium", studioSlug: "time-cron-studio", modeKey: "explain", reason: "Looks like a 5-field cron expression.")
        }
        if (input.hasPrefix("{") && input.hasSuffix("}")) || (input.hasPrefix("[") && input.hasSuffix("]")) {
            return DeveloperInputHint(kind: "json", confidence: "high", studioSlug: "json-studio", modeKey: "format", reason: "Looks like JSON object or array text.")
        }
        let digestLengths = [(32, "md5-hex"), (40, "sha1-hex"), (64, "sha256-hex"), (96, "sha384-hex"), (128, "sha512-hex")]
        if let match = digestLengths.first(where: { input.count == $0.0 }), input.range(of: #"^[0-9a-fA-F]+$"#, options: .regularExpression) != nil {
            return DeveloperInputHint(kind: match.1, confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a \(match.0)-char hexadecimal digest.")
        }
        let compact = input.replacingOccurrences(of: #"\s+"#, with: "", options: .regularExpression)
        if compact.count >= 16, compact.count % 4 == 0, compact.range(of: #"^[A-Za-z0-9+/]+=*$"#, options: .regularExpression) != nil {
            return DeveloperInputHint(kind: "base64", confidence: "medium", studioSlug: "encoding-studio", modeKey: "base64", reason: "Looks like Base64 text.")
        }
        if input.lowercased().hasPrefix("http://") || input.lowercased().hasPrefix("https://") || input.range(of: #"%[0-9A-Fa-f]{2}"#, options: .regularExpression) != nil {
            return DeveloperInputHint(kind: "url", confidence: "medium", studioSlug: "encoding-studio", modeKey: "url", reason: "Looks like a URL or percent-encoded text.")
        }
        return nil
    }
}
