import Foundation

/// Bounded, local regex preview data for the native iOS Regex Studio.
/// All ranges are UTF-16 offsets from NSRegularExpression / ICU.
enum NativeRegexHighlight {
    private static let maxPattern = 2_048
    private static let maxSample = 32_768
    private static let maxMatches = 100
    private static let risky = #"(?:\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+).*(?:\.\*|\.\+)|\([^)]*\|[^)]*\)[+*{]|\\[1-9][+*{])"#

    static func build(pattern: String, sample: String, flags: String = "") throws -> String {
        guard pattern.count <= maxPattern else { throw err("Pattern exceeds \(maxPattern) characters.") }
        let nsSample = sample as NSString
        guard nsSample.length <= maxSample else { throw err("Live highlight supports up to \(maxSample) UTF-16 code units.") }
        let allowed = Set("gimsu")
        guard Set(flags).isSubset(of: allowed) else { throw err("Supported UI flags are g, i, m, s, u; this preview uses Foundation ICU semantics.") }
        guard Set(flags).count == flags.count else { throw err("Duplicate regex flags are not allowed.") }
        if pattern.range(of: risky, options: .regularExpression) != nil && nsSample.length > 24 {
            throw err("Live preview skipped: this pattern resembles catastrophic backtracking and the sample exceeds 24 characters. Simplify the pattern or shorten the sample.")
        }
        var options: NSRegularExpression.Options = []
        if flags.contains("i") { options.insert(.caseInsensitive) }
        if flags.contains("m") { options.insert(.anchorsMatchLines) }
        if flags.contains("s") { options.insert(.dotMatchesLineSeparators) }
        let expression: NSRegularExpression
        do { expression = try NSRegularExpression(pattern: pattern, options: options) }
        catch { throw err("Invalid regex: \(error.localizedDescription)") }
        let namedGroups = namedCaptureGroups(pattern)
        let fullRange = NSRange(location: 0, length: nsSample.length)
        let found = expression.matches(in: sample, options: [], range: fullRange)
        let limited = Array(found.prefix(maxMatches))
        var segments: [[String: Any]] = []
        var matches: [[String: Any]] = []
        var cursor = 0
        for (index, match) in limited.enumerated() {
            let start = match.range.location
            let end = NSMaxRange(match.range)
            if start > cursor {
                segments.append(["text": nsSample.substring(with: NSRange(location: cursor, length: start - cursor)), "isMatch": false, "matchIndex": NSNull()])
            }
            if end > start {
                segments.append(["text": nsSample.substring(with: match.range), "isMatch": true, "matchIndex": index])
            }
            cursor = max(cursor, end)
            var groups: [[String: Any]] = []
            if match.numberOfRanges > 1 {
                for groupIndex in 1..<match.numberOfRanges {
                    let range = match.range(at: groupIndex)
                    groups.append([
                        "groupIndex": groupIndex,
                        "groupName": namedGroups[groupIndex] as Any? ?? NSNull(),
                        "start": range.location >= 0 ? range.location as Any : NSNull(),
                        "end": range.location >= 0 ? NSMaxRange(range) as Any : NSNull(),
                        "text": range.location >= 0 ? nsSample.substring(with: range) as Any : NSNull()
                    ])
                }
            }
            matches.append(["matchIndex": index, "start": start, "end": end, "text": nsSample.substring(with: match.range), "groups": groups])
        }
        if cursor < nsSample.length {
            segments.append(["text": nsSample.substring(from: cursor), "isMatch": false, "matchIndex": NSNull()])
        }
        if segments.isEmpty && !sample.isEmpty {
            segments.append(["text": sample, "isMatch": false, "matchIndex": NSNull()])
        }
        let object: [String: Any] = [
            "engine": "NSRegularExpression (ICU)",
            "matchCount": limited.count,
            "truncated": found.count > maxMatches,
            "matches": matches,
            "segments": segments
        ]
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    private static func namedCaptureGroups(_ pattern: String) -> [Int: String] {
        let chars = Array(pattern)
        var result: [Int: String] = [:]
        var groupNumber = 0
        var index = 0
        var escaped = false
        var inClass = false
        while index < chars.count {
            let char = chars[index]
            if escaped { escaped = false; index += 1; continue }
            if char == "\\" { escaped = true; index += 1; continue }
            if inClass { if char == "]" { inClass = false }; index += 1; continue }
            if char == "[" { inClass = true; index += 1; continue }
            guard char == "(" else { index += 1; continue }
            if index + 1 >= chars.count || chars[index + 1] != "?" {
                groupNumber += 1; index += 1; continue
            }
            if index + 3 < chars.count, chars[index + 2] == "<", chars[index + 3] != "=", chars[index + 3] != "!", let close = chars[(index + 3)...].firstIndex(of: ">"), close > index + 3 {
                groupNumber += 1
                result[groupNumber] = String(chars[(index + 3)..<close])
                index = close + 1
                continue
            }
            index += 1
        }
        return result
    }

    private static func err(_ message: String) -> NSError {
        NSError(domain: "enV.NativeRegexHighlight", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
