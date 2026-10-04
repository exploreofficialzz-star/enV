import Foundation

/// Numeric rules mirrored from the web calculator numeric layer.
enum NativeNumberParser {
    static func parse(_ raw: String?, label: String = "value") throws -> Double {
        let original = raw ?? ""
        var text = original.trimmingCharacters(in: .whitespacesAndNewlines)
        text = text.replacingOccurrences(of: "−", with: "-")
            .replacingOccurrences(of: "–", with: "-")
            .replacingOccurrences(of: "—", with: "-")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .replacingOccurrences(of: "\u{2009}", with: " ")
            .replacingOccurrences(of: "\u{202F}", with: " ")
        guard !text.isEmpty else { throw error("Enter a value for \(label).") }
        let pattern = "^(.*?)([eE][+-]?\\d+)?$"
        guard let regex = try? NSRegularExpression(pattern: pattern), let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { throw error("Enter a valid number for \(label).") }
        func group(_ index: Int) -> String {
            guard let range = Range(match.range(at: index), in: text) else { return "" }
            return String(text[range])
        }
        guard let mantissa = normalize(group(1)) else { throw error("Enter a valid number for \(label).") }
        let value = Double(mantissa + group(2))
        guard let value, value.isFinite else { throw error("\(label) is too large to calculate with.") }
        return value == 0 ? 0 : value
    }

    private static func normalize(_ input: String) -> String? {
        var sign = "", body = input
        if body.first == "+" || body.first == "-" { if body.first == "-" { sign = "-" }; body.removeFirst() }
        guard !body.isEmpty else { return nil }
        let comma = body.contains(","), dot = body.contains("."), space = body.contains(" ")
        if !comma && !space { return sign + body }
        var decimal: Character?
        if comma && dot { decimal = body.lastIndex(of: ",")! > body.lastIndex(of: ".")! ? "," : "." }
        else if dot { decimal = "." }
        else if comma && !space {
            let p = body.split(separator: ",", omittingEmptySubsequences: false)
            if p.count == 2 {
                let before = String(p[0]), after = String(p[1])
                let loneThousands = after.count == 3 && after.first != "0" && before.count > 0
                if before.range(of: "^\\d*$", options: .regularExpression) != nil && after.range(of: "^\\d+$", options: .regularExpression) != nil && !loneThousands { decimal = "," }
                else { decimal = nil }
            } else { decimal = nil }
        } else { decimal = "," }
        var integer = body, fraction = ""
        if let decimal {
            guard let at = integer.lastIndex(of: decimal) else { return nil }
            fraction = String(integer[integer.index(after: at)...]); integer = String(integer[..<at])
            guard fraction.range(of: "^\\d+$", options: .regularExpression) != nil else { return nil }
        }
        let digits: String
        if integer.range(of: "^\\d+$", options: .regularExpression) != nil { digits = integer }
        else if integer.range(of: "^\\d{1,3}(?: \\d{3})+$", options: .regularExpression) != nil { digits = integer.replacingOccurrences(of: " ", with: "") }
        else if decimal != "," && integer.range(of: "^\\d{1,3}(?:,\\d{3})+$", options: .regularExpression) != nil { digits = integer.replacingOccurrences(of: ",", with: "") }
        else if decimal != "," && integer.range(of: "^\\d{1,2}(?:,\\d{2})+,\\d{3}$", options: .regularExpression) != nil { digits = integer.replacingOccurrences(of: ",", with: "") }
        else if decimal == "," && integer.range(of: "^\\d{1,3}(?:\\.\\d{3})+$", options: .regularExpression) != nil { digits = integer.replacingOccurrences(of: ".", with: "") }
        else if integer.isEmpty && decimal != nil { digits = "0" }
        else { return nil }
        return sign + digits + (fraction.isEmpty ? "" : ".\(fraction)")
    }

    static func format(_ value: Double) -> String {
        guard value.isFinite else { return "—" }
        if value == 0 { return "0" }
        let a = abs(value)
        if a >= 1e15 || a < 1e-6 {
            let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.numberStyle = .scientific; formatter.maximumFractionDigits = 11
            return formatter.string(from: NSNumber(value: value)) ?? String(value)
        }
        let formatter = NumberFormatter(); formatter.locale = .current; formatter.numberStyle = .decimal; formatter.maximumFractionDigits = 12; formatter.usesGroupingSeparator = true
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private static func error(_ message: String) -> NSError { NSError(domain: "NativeNumber", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
