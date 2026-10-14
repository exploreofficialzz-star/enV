import Foundation
import CryptoKit

/// Native Swift recipe runner. A fixed operation allow-list prevents arbitrary code execution.
enum NativeDeveloperRecipe {
    private static let maxInputBytes = 1_048_576
    private static let maxOutputBytes = 2_097_152
    private static let maxConfigBytes = 7 * 1_048_576
    private static let maxSteps = 16
    private static let previewCodePoints = 1_200
    private static let supported = [
        "trim", "strip-bom", "normalize-newlines", "ensure-final-newline", "remove-final-newline", "collapse-whitespace", "remove-blank-lines", "sort-lines", "unique-lines", "reverse-lines",
        "unicode-normalize-nfc", "unicode-normalize-nfd", "unicode-normalize-nfkc", "unicode-normalize-nfkd", "replace-literal", "url-encode-component", "url-decode-component", "base64-encode", "base64-decode",
        "base64url-encode", "base64url-decode", "hex-encode", "hex-decode", "html-escape", "html-unescape",
        "json-format", "json-minify", "json-sort-keys", "json-validate", "json-pointer-get", "csv-to-json", "json-to-csv", "sha256-hex"
    ]
    static var supportedOperations: [String] { supported }

    private enum JSONValue {
        case object([(String, JSONValue)])
        case array([JSONValue])
        case string(String)
        case number(String)
        case literal(String)
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "enV.NativeDeveloperRecipe", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func member(_ entries: [(String, JSONValue)], _ key: String) -> JSONValue? {
        entries.first(where: { $0.0 == key })?.1
    }

    private static func stringMember(_ entries: [(String, JSONValue)], _ key: String) -> String? {
        guard let value = member(entries, key), case .string(let string) = value else { return nil }
        return string
    }

    private final class JSONSourceParser {
        private let source: String
        private var index: String.Index
        private(set) var duplicatePaths: [String] = []
        init(_ source: String) { self.source = source; self.index = source.startIndex }

        func parse() throws -> JSONValue {
            skipWhitespace()
            let value = try parseValue(path: "$")
            skipWhitespace()
            guard index == source.endIndex else { throw NativeDeveloperRecipe.failure("Unexpected content after JSON value at character \(offset + 1).") }
            return value
        }

        private var offset: Int { source.distance(from: source.startIndex, to: index) }
        private func skipWhitespace() { while index < source.endIndex, [" ", "\t", "\r", "\n"].contains(source[index]) { index = source.index(after: index) } }
        private func take(_ token: Character) -> Bool {
            guard index < source.endIndex, source[index] == token else { return false }
            index = source.index(after: index); return true
        }
        private func expect(_ token: Character) throws {
            guard take(token) else { throw NativeDeveloperRecipe.failure("Expected '\(token)' at character \(offset + 1).") }
        }
        private func parseValue(path: String) throws -> JSONValue {
            skipWhitespace()
            guard index < source.endIndex else { throw NativeDeveloperRecipe.failure("Expected a JSON value at character \(offset + 1).") }
            switch source[index] {
            case "{": return try parseObject(path: path)
            case "[": return try parseArray(path: path)
            case "\"": return .string(try parseString())
            case "t": return try parseLiteral("true")
            case "f": return try parseLiteral("false")
            case "n": return try parseLiteral("null")
            case "-", "0"..."9": return try parseNumber()
            default: throw NativeDeveloperRecipe.failure("Unexpected JSON token at character \(offset + 1).")
            }
        }
        private func parseObject(path: String) throws -> JSONValue {
            try expect("{"); skipWhitespace()
            var entries: [(String, JSONValue)] = []
            if take("}") { return .object(entries) }
            var seen = Set<String>()
            while true {
                skipWhitespace()
                guard index < source.endIndex, source[index] == "\"" else { throw NativeDeveloperRecipe.failure("Expected a JSON object key at character \(offset + 1).") }
                let key = try parseString()
                let childPath = "\(path).\(key)"
                if !seen.insert(key).inserted { duplicatePaths.append(childPath) }
                skipWhitespace(); try expect(":")
                entries.append((key, try parseValue(path: childPath)))
                skipWhitespace()
                if take("}") { return .object(entries) }
                try expect(","); skipWhitespace()
                guard index < source.endIndex, source[index] == "\"" else { throw NativeDeveloperRecipe.failure("Expected an object key after comma at character \(offset + 1); trailing commas are invalid.") }
            }
        }
        private func parseArray(path: String) throws -> JSONValue {
            try expect("["); skipWhitespace()
            var values: [JSONValue] = []
            if take("]") { return .array(values) }
            while true {
                values.append(try parseValue(path: "\(path)[\(values.count)]")); skipWhitespace()
                if take("]") { return .array(values) }
                try expect(","); skipWhitespace()
                guard index < source.endIndex, source[index] != "]" else { throw NativeDeveloperRecipe.failure("Trailing comma in JSON array at character \(offset + 1).") }
            }
        }
        private func parseString() throws -> String {
            let start = index
            try expect("\"")
            var result = ""
            while index < source.endIndex {
                let character = source[index]
                index = source.index(after: index)
                if character == "\"" { return result }
                if character == "\\" {
                    guard index < source.endIndex else { throw failure("Unterminated JSON escape at character \(offset + 1).") }
                    let escape = source[index]
                    index = source.index(after: index)
                    switch escape {
                    case "\"": result.append("\"")
                    case "\\": result.append("\\")
                    case "/": result.append("/")
                    case "b": result.append("\u{0008}")
                    case "f": result.append("\u{000C}")
                    case "n": result.append("\n")
                    case "r": result.append("\r")
                    case "t": result.append("\t")
                    case "u":
                        let first = try parseHexCodeUnit()
                        let scalarValue: UInt32
                        if (0xD800...0xDBFF).contains(first) {
                            guard index < source.endIndex, source[index] == "\\" else { throw failure("High surrogate must be followed by a low-surrogate \\u escape at character \(offset + 1).") }
                            index = source.index(after: index)
                            guard index < source.endIndex, source[index] == "u" else { throw failure("High surrogate must be followed by a low-surrogate \\u escape at character \(offset + 1).") }
                            index = source.index(after: index)
                            let second = try parseHexCodeUnit()
                            guard (0xDC00...0xDFFF).contains(second) else { throw failure("Invalid low surrogate in JSON string at character \(offset + 1).") }
                            scalarValue = 0x10000 + (UInt32(first - 0xD800) << 10) + UInt32(second - 0xDC00)
                        } else {
                            guard !(0xDC00...0xDFFF).contains(first) else { throw failure("Unexpected low surrogate in JSON string at character \(offset + 1).") }
                            scalarValue = UInt32(first)
                        }
                        guard let scalar = UnicodeScalar(scalarValue) else { throw failure("Invalid Unicode scalar in JSON string at character \(offset + 1).") }
                        result.unicodeScalars.append(scalar)
                    default: throw failure("Invalid JSON string escape at character \(offset).")
                    }
                } else {
                    guard !character.unicodeScalars.contains(where: { $0.value < 0x20 }) else { throw failure("Unescaped control character in JSON string at character \(offset).") }
                    result.unicodeScalars.append(contentsOf: character.unicodeScalars)
                }
            }
            throw failure("Unterminated JSON string beginning at character \(source.distance(from: source.startIndex, to: start) + 1).")
        }

        private func parseHexCodeUnit() throws -> UInt16 {
            let start = index
            for _ in 0..<4 {
                guard index < source.endIndex, UInt16(String(source[index]), radix: 16) != nil else {
                    throw failure("Unicode escape must contain four hexadecimal digits at character \(offset + 1).")
                }
                index = source.index(after: index)
            }
            guard let value = UInt16(String(source[start..<index]), radix: 16) else {
                throw failure("Unicode escape must contain four hexadecimal digits at character \(offset + 1).")
            }
            return value
        }

        private func parseNumber() throws -> JSONValue {
            let start = index
            _ = take("-")
            guard index < source.endIndex else { throw NativeDeveloperRecipe.failure("Invalid JSON number at character \(offset + 1).") }
            if take("0") {
                if index < source.endIndex, source[index] >= "0", source[index] <= "9" { throw NativeDeveloperRecipe.failure("Leading zero in JSON number at character \(offset + 1).") }
            } else {
                guard index < source.endIndex, source[index] >= "1", source[index] <= "9" else { throw NativeDeveloperRecipe.failure("Invalid JSON number at character \(offset + 1).") }
                while index < source.endIndex, source[index] >= "0", source[index] <= "9" { index = source.index(after: index) }
            }
            if take(".") {
                guard index < source.endIndex, source[index] >= "0", source[index] <= "9" else { throw NativeDeveloperRecipe.failure("Invalid JSON fraction at character \(offset + 1).") }
                while index < source.endIndex, source[index] >= "0", source[index] <= "9" { index = source.index(after: index) }
            }
            if index < source.endIndex, source[index] == "e" || source[index] == "E" {
                index = source.index(after: index)
                if index < source.endIndex, source[index] == "+" || source[index] == "-" { index = source.index(after: index) }
                guard index < source.endIndex, source[index] >= "0", source[index] <= "9" else { throw NativeDeveloperRecipe.failure("Invalid JSON exponent at character \(offset + 1).") }
                while index < source.endIndex, source[index] >= "0", source[index] <= "9" { index = source.index(after: index) }
            }
            return .number(String(source[start..<index]))
        }
        private func parseLiteral(_ expected: String) throws -> JSONValue {
            guard source[index...].hasPrefix(expected) else { throw NativeDeveloperRecipe.failure("Invalid JSON literal at character \(offset + 1).") }
            index = source.index(index, offsetBy: expected.count); return .literal(expected)
        }
        private static func encodeString(_ value: String) -> String { NativeDeveloperRecipe.encodeJSONString(value) }
    }

    private static func encodeJSONString(_ value: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])) ?? Data("\"\"".utf8)
        return String(data: data, encoding: .utf8) ?? "\"\""
    }
    private static func utf8(_ value: String) -> Data { Data(value.utf8) }

    private static func assertRecipeJSONDepth(_ source: String) throws {
        var depth = 0; var inString = false; var escaped = false
        for scalar in source.unicodeScalars {
            if inString {
                if escaped { escaped = false } else if scalar == "\\" { escaped = true } else if scalar == "\"" { inString = false }
                continue
            }
            if scalar == "\"" { inString = true }
            else if scalar == "{" || scalar == "[" {
                depth += 1
                guard depth <= 128 else { throw failure("JSON nesting exceeds the safety depth of 128; split or simplify the document before processing.") }
            } else if scalar == "}" || scalar == "]" { depth = max(0, depth - 1) }
        }
    }

    private static func assertRecipePrettyJSONFits(_ source: String) throws {
        let scalars = Array(source.unicodeScalars)
        var retainedBytes = utf8(source).count; var extraBytes = 0; var inString = false; var escaped = false
        var stack: [(kind: UnicodeScalar, hasItems: Bool)] = []
        func whitespace(_ scalar: UnicodeScalar) -> Bool { scalar == " " || scalar == "\t" || scalar == "\r" || scalar == "\n" }
        func markParent() { if !stack.isEmpty { stack[stack.count - 1].hasItems = true } }
        var index = 0
        while index < scalars.count {
            let scalar = scalars[index]
            if inString {
                if escaped { escaped = false } else if scalar == "\\" { escaped = true } else if scalar == "\"" { inString = false }
                index += 1; continue
            }
            if scalar == "\"" { markParent(); inString = true }
            else if whitespace(scalar) { retainedBytes -= 1 }
            else if scalar == "{" || scalar == "[" {
                markParent(); stack.append((scalar, false))
                var lookahead = index + 1
                while lookahead < scalars.count && whitespace(scalars[lookahead]) { lookahead += 1 }
                if lookahead < scalars.count && scalars[lookahead] != (scalar == "{" ? "}" : "]") { extraBytes += 1 + 2 * stack.count }
            } else if scalar == "}" || scalar == "]" {
                let frame = stack.popLast()
                if frame?.hasItems == true { extraBytes += 1 + 2 * stack.count }
            } else if scalar == "," { extraBytes += 1 + 2 * stack.count }
            else if scalar == ":" { extraBytes += 1 }
            else { markParent() }
            index += 1
        }
        guard retainedBytes + extraBytes <= maxOutputBytes else { throw failure("JSON formatting would exceed \(maxOutputBytes) UTF-8 bytes; minify it first or reduce the input structure.") }
    }

    private static func assertLiteralReplacementFits(_ current: String, find: String, replacement: String) throws {
        let currentBytes = utf8(current).count
        let growthPerMatch = utf8(replacement).count - utf8(find).count
        guard growthPerMatch > 0 else { return }
        let allowedMatches = max(0, (maxOutputBytes - currentBytes) / growthPerMatch)
        let source = current as NSString
        let needle = find as NSString
        var searchOffset = 0
        var matches = 0
        while searchOffset <= source.length - needle.length {
            let range = source.range(of: find, options: [.literal], range: NSRange(location: searchOffset, length: source.length - searchOffset))
            if range.location == NSNotFound { return }
            matches += 1
            guard matches <= allowedMatches else { throw failure("Literal replacement would exceed \(maxOutputBytes) UTF-8 bytes; reduce the match count or replacement size before running.") }
            searchOffset = range.location + range.length
        }
    }
    private static func codePoints(_ value: String) -> Int { value.unicodeScalars.count }
    private static func preview(_ value: String) -> String {
        let count = codePoints(value)
        if count <= previewCodePoints { return value }
        let end = value.unicodeScalars.index(value.unicodeScalars.startIndex, offsetBy: previewCodePoints)
        return String(value.unicodeScalars[..<end]) + "… [preview truncated; \(count) code points total]"
    }
    private static func compareCodePoints(_ left: String, _ right: String) -> Bool {
        let a = left.unicodeScalars.map(\.value), b = right.unicodeScalars.map(\.value)
        for index in 0..<min(a.count, b.count) where a[index] != b[index] { return a[index] < b[index] }
        return a.count < b.count
    }
    private static func mapLines(_ input: String, _ transform: ([String]) -> [String]) -> String {
        let normalized = input.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let trailing = normalized.hasSuffix("\n")
        var lines = normalized.components(separatedBy: "\n")
        if trailing, !lines.isEmpty { lines.removeLast() }
        return transform(lines).joined(separator: "\n") + (trailing ? "\n" : "")
    }
    private static func encodeBase64(_ input: String, urlSafe: Bool = false) -> String {
        let value = Data(input.utf8).base64EncodedString()
        return urlSafe ? value.replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") : value
    }
    private static func decodeUTF8(_ data: Data) throws -> String {
        guard let value = String(data: data, encoding: .utf8) else { throw failure("Decoded bytes are not valid UTF-8 text; use a binary-aware workflow for arbitrary bytes.") }
        return value
    }
    private static func decodeBase64(_ input: String, urlSafe: Bool = false) throws -> String {
        let source = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = urlSafe ? "^[A-Za-z0-9_-]*={0,2}$" : "^[A-Za-z0-9+/]*={0,2}$"
        guard source.range(of: pattern, options: .regularExpression) != nil, source.count % 4 != 1, (!source.contains("=") || source.count % 4 == 0) else {
            throw failure("Invalid \(urlSafe ? "Base64URL" : "Base64"): check its alphabet, padding, and length.")
        }
        let unpadded = source.trimmingCharacters(in: CharacterSet(charactersIn: "="))
        let standard = urlSafe ? unpadded.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") : unpadded
        let padded = standard + String(repeating: "=", count: (4 - standard.count % 4) % 4)
        guard let data = Data(base64Encoded: padded) else { throw failure("Base64 input could not be decoded.") }
        let canonical = data.base64EncodedString().replacingOccurrences(of: "=", with: "")
        guard canonical == standard else { throw failure("Base64 padding bits are not canonical; re-encode the value at its source.") }
        return try decodeUTF8(data)
    }
    private static func encodeURL(_ input: String) -> String {
        let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".utf8)
        return Data(input.utf8).map { byte in unreserved.contains(byte) ? String(UnicodeScalar(byte)) : String(format: "%%%02X", byte) }.joined()
    }
    private static func decodeURL(_ input: String) throws -> String {
        var bytes = Data(); var index = input.startIndex
        while index < input.endIndex {
            if input[index] == "%" {
                let first = input.index(after: index)
                guard first < input.endIndex, let second = input.index(first, offsetBy: 2, limitedBy: input.endIndex), second <= input.endIndex else {
                    throw failure("Invalid percent escape at character \(input.distance(from: input.startIndex, to: index) + 1); expected % followed by two hexadecimal digits.")
                }
                let hex = String(input[first..<second])
                guard hex.count == 2, hex.allSatisfy(\.isHexDigit), let byte = UInt8(hex, radix: 16) else {
                    throw failure("Invalid percent escape at character \(input.distance(from: input.startIndex, to: index) + 1); expected % followed by two hexadecimal digits.")
                }
                bytes.append(byte); index = second
            } else {
                let next = input.index(after: index); bytes.append(contentsOf: input[index..<next].utf8); index = next
            }
        }
        return try decodeUTF8(bytes)
    }
    private static func decodeHex(_ input: String) throws -> String {
        let value = input.replacingOccurrences(of: "[ \\t\\r\\n]", with: "", options: .regularExpression)
        guard value.count % 2 == 0, value.range(of: "^[a-fA-F0-9]*$", options: .regularExpression) != nil else {
            throw failure("Hex decode expects an even number of hexadecimal digits; spaces and line breaks are allowed.")
        }
        var data = Data(); var cursor = value.startIndex
        while cursor < value.endIndex {
            let end = value.index(cursor, offsetBy: 2); data.append(UInt8(value[cursor..<end], radix: 16)!); cursor = end
        }
        return try decodeUTF8(data)
    }
    private static func htmlEscape(_ input: String) -> String {
        input.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&#39;")
    }
    private static func htmlUnescape(_ input: String) throws -> String {
        let regex = try NSRegularExpression(pattern: "&(amp|lt|gt|quot|apos|#39|#\\d+|#x[0-9a-f]+);", options: [.caseInsensitive])
        let ns = input as NSString; let matches = regex.matches(in: input, range: NSRange(location: 0, length: ns.length))
        var output = ""; var cursor = 0
        for match in matches {
            output += ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            let entity = ns.substring(with: match.range); let token = ns.substring(with: match.range(at: 1)).lowercased()
            let named = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "#39": "'"]
            if let replacement = named[token] { output += replacement }
            else {
                let number = token.hasPrefix("#x") ? UInt32(token.dropFirst(2), radix: 16) : UInt32(token.dropFirst(1))
                guard let value = number, value <= 0x10FFFF, !(0xD800...0xDFFF).contains(value), let scalar = UnicodeScalar(value) else { throw failure("Invalid numeric HTML character reference: \(entity)") }
                output.unicodeScalars.append(scalar)
            }
            cursor = match.range.location + match.range.length
        }
        output += ns.substring(from: cursor)
        return output
    }
    private struct UnsafeJsonToken { let token: String; let line: Int; let column: Int }

    private static func scanUnsafeJSONIntegers(_ input: String) -> [UnsafeJsonToken] {
        let units = Array(input.utf16)
        var found: [UnsafeJsonToken] = []
        var index = 0
        func digit(_ unit: UInt16) -> Bool { unit >= 48 && unit <= 57 }
        while index < units.count {
            if units[index] == 34 {
                index += 1
                while index < units.count {
                    if units[index] == 92 { index += 2; continue }
                    if units[index] == 34 { index += 1; break }
                    index += 1
                }
                continue
            }
            if units[index] == 45 || digit(units[index]) {
                let start = index
                if units[index] == 45 { index += 1 }
                guard index < units.count else { break }
                if units[index] == 48 { index += 1 }
                else if units[index] >= 49 && units[index] <= 57 { while index < units.count && digit(units[index]) { index += 1 } }
                else { index = start + 1; continue }
                var isInteger = true
                if index < units.count && units[index] == 46 {
                    isInteger = false; index += 1
                    while index < units.count && digit(units[index]) { index += 1 }
                }
                if index < units.count && (units[index] == 101 || units[index] == 69) {
                    isInteger = false; index += 1
                    if index < units.count && (units[index] == 43 || units[index] == 45) { index += 1 }
                    while index < units.count && digit(units[index]) { index += 1 }
                }
                let token = String(decoding: units[start..<index], as: UTF16.self)
                if isInteger && token.filter({ $0 >= "0" && $0 <= "9" }).count > 15 {
                    let before = units[..<start]
                    let line = before.filter { $0 == 10 }.count + 1
                    let lastBreak = before.lastIndex(of: 10).map { $0 } ?? -1
                    found.append(UnsafeJsonToken(token: token, line: line, column: start - lastBreak))
                }
                continue
            }
            index += 1
        }
        return found
    }

    private static func uniquePreservingOrder(_ values: [String]) -> [String] {
        var output: [String] = []
        for value in values where !output.contains(value) { output.append(value) }
        return output
    }

    private static func recipeJSONFormatterWarnings(_ input: String, duplicatePaths: [String]) -> [String] {
        let unsafe = scanUnsafeJSONIntegers(input)
        var warnings: [String] = []
        if !unsafe.isEmpty {
            let examples = unsafe.prefix(5).map { "\($0.token) (line \($0.line), column \($0.column))" }.joined(separator: ", ")
            warnings.append("WARNING: JavaScript Number cannot safely represent this integer; value may be rounded. The formatter preserved the raw numeric token text. Detected: \(examples)\(unsafe.count > 5 ? ", …" : "")")
        }
        let duplicates = uniquePreservingOrder(duplicatePaths)
        if !duplicates.isEmpty {
            warnings.append("NOTE: Duplicate object keys detected at \(duplicates.prefix(20).joined(separator: ", "))\(duplicates.count > 20 ? ", …" : ""). Duplicate-key JSON is ambiguous; many parsers including JSON.parse keep only the last value. The formatter preserves the source keys.")
        }
        return warnings
    }

    private static func unsafeIntegers(_ value: JSONValue, into result: inout [String]) {
        switch value {
        case .number(let raw):
            guard !raw.contains("."), raw.range(of: "[eE]", options: .regularExpression) == nil else { return }
            let digits = String(raw.drop(while: { $0 == "-" }))
            let maxSafe = "9007199254740991"
            if digits.count > maxSafe.count || (digits.count == maxSafe.count && digits > maxSafe) { result.append(raw) }
        case .object(let items): items.forEach { unsafeIntegers($0.1, into: &result) }
        case .array(let items): items.forEach { unsafeIntegers($0, into: &result) }
        default: break
        }
    }
    private static func stringify(_ value: JSONValue, pretty: Bool, depth: Int = 0, sortKeys: Bool = false) -> String {
        let pad = pretty ? String(repeating: "  ", count: depth) : ""
        switch value {
        case .string(let string): return encodeJSONString(string)
        case .number(let raw), .literal(let raw): return raw
        case .array(let values):
            guard !values.isEmpty else { return "[]" }
            if pretty { let rows = values.map { String(repeating: "  ", count: depth + 1) + stringify($0, pretty: true, depth: depth + 1, sortKeys: sortKeys) }; return "[\n" + rows.joined(separator: ",\n") + "\n\(pad)]" }
            return "[" + values.map { stringify($0, pretty: false, depth: depth + 1, sortKeys: sortKeys) }.joined(separator: ",") + "]"
        case .object(let values):
            let entries = sortKeys ? values.sorted { compareCodePoints($0.0, $1.0) } : values
            guard !entries.isEmpty else { return "{}" }
            if pretty { let rows = entries.map { String(repeating: "  ", count: depth + 1) + encodeJSONString($0.0) + ": " + stringify($0.1, pretty: true, depth: depth + 1, sortKeys: sortKeys) }; return "{\n" + rows.joined(separator: ",\n") + "\n\(pad)}" }
            return "{" + entries.map { encodeJSONString($0.0) + ":" + stringify($0.1, pretty: false, depth: depth + 1, sortKeys: sortKeys) }.joined(separator: ",") + "}"
        }
    }

    private static func parseRecipeCSV(_ input: String) throws -> [[String]] {
        let characters = Array(input.unicodeScalars); var rows: [[String]] = []; var row: [String] = []; var field = ""
        var inQuotes = false; var afterQuote = false; var fieldStarted = false; var index = 0
        while index < characters.count {
            let character = characters[index]
            if inQuotes {
                if character == "\"" {
                    if index + 1 < characters.count && characters[index + 1] == "\"" { field.append("\""); index += 2 }
                    else { inQuotes = false; afterQuote = true; index += 1 }
                } else { field.unicodeScalars.append(character); index += 1 }
                continue
            }
            if afterQuote {
                if character == "," { row.append(field); field = ""; fieldStarted = false; afterQuote = false; index += 1; continue }
                if character == "\r" || character == "\n" {
                    row.append(field); rows.append(row); row = []; field = ""; fieldStarted = false; afterQuote = false
                    index += character == "\r" && index + 1 < characters.count && characters[index + 1] == "\n" ? 2 : 1; continue
                }
                throw failure("Unexpected character after a closing CSV quote at character \(index + 1). Only a comma, record ending, or end of input is valid.")
            }
            if character == "\"" {
                guard !fieldStarted && field.isEmpty else { throw failure("Unexpected quote inside an unquoted CSV field at character \(index + 1).") }
                inQuotes = true; fieldStarted = true; index += 1
            } else if character == "," { row.append(field); field = ""; fieldStarted = false; index += 1 }
            else if character == "\r" || character == "\n" {
                row.append(field); rows.append(row); row = []; field = ""; fieldStarted = false
                index += character == "\r" && index + 1 < characters.count && characters[index + 1] == "\n" ? 2 : 1
            } else { field.unicodeScalars.append(character); fieldStarted = true; index += 1 }
        }
        guard !inQuotes else { throw failure("CSV ends inside a quoted field; add its closing double quote.") }
        if !row.isEmpty || !field.isEmpty || fieldStarted || afterQuote { row.append(field); rows.append(row) }
        return rows
    }

    private static func escapeRecipeCSV(_ value: String) -> String {
        if value.unicodeScalars.contains(where: { $0 == "," || $0 == "\"" || $0 == "\r" || $0 == "\n" }) || value.first?.isWhitespace == true || value.last?.isWhitespace == true {
            return "\"" + value.replacingOccurrences(of: "\"", with: "\"\"" ) + "\""
        }
        return value
    }

    private static func csvToRecipeJSON(_ input: String) throws -> String {
        let rows = try parseRecipeCSV(input)
        guard let headers = rows.first else { throw failure("CSV input is empty; include a header row.") }
        guard !headers.isEmpty && headers.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else { throw failure("CSV header cells must be non-empty; rename blank columns before conversion.") }
        guard Set(headers).count == headers.count else { throw failure("CSV headers must be unique; duplicate column names would overwrite data in JSON objects.") }
        var objects: [JSONValue] = []
        for (rowIndex, values) in rows.dropFirst().enumerated() {
            guard values.count == headers.count else { throw failure("CSV row \(rowIndex + 2) has \(values.count) fields but the header has \(headers.count).") }
            objects.append(.object(Array(zip(headers, values).map { ($0.0, JSONValue.string($0.1)) })))
        }
        return stringify(.array(objects), pretty: true)
    }

    private static func jsonToRecipeCSV(_ input: String) throws -> String {
        let parser = JSONSourceParser(input); let parsed = try parser.parse()
        guard parser.duplicatePaths.isEmpty else { throw failure("JSON-to-CSV refuses ambiguous duplicate object keys at \(Array(Set(parser.duplicatePaths)).sorted().prefix(10).joined(separator: ", ")).") }
        guard case .array(let rows) = parsed, !rows.isEmpty else { throw failure("JSON-to-CSV expects a non-empty array of objects so it can determine column headers.") }
        let objects: [[(String, JSONValue)]] = try rows.map { value in
            guard case .object(let entries) = value else { throw failure("JSON-to-CSV expects every array item to be an object; nested arrays should be converted separately.") }
            return entries
        }
        let headers = objects[0].map(\.0)
        guard !headers.isEmpty && headers.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else { throw failure("JSON-to-CSV needs non-empty object keys to use as column headers.") }
        for index in 1..<objects.count {
            let keys = objects[index].map(\.0)
            guard keys.count == headers.count && headers.allSatisfy({ keys.contains($0) }) else { throw failure("JSON row \(index + 1) has a different set of keys than the first row; normalize the objects before converting.") }
        }
        func cell(_ value: JSONValue) -> String {
            if case .string(let string) = value { return escapeRecipeCSV(string) }
            return escapeRecipeCSV(stringify(value, pretty: false))
        }
        let headerRow = headers.map(escapeRecipeCSV).joined(separator: ",")
        let dataRows = objects.map { object in headers.map { key in cell(object.first(where: { $0.0 == key })!.1) }.joined(separator: ",") }
        return ([headerRow] + dataRows).joined(separator: "\n") + "\n"
    }

    private static func jsonPointerGet(_ input: String, pointer: String, warnings: inout [String]) throws -> String {
        guard pointer.isEmpty || pointer.hasPrefix("/") else { throw failure("json-pointer-get needs an RFC 6901 pointer: empty string for root or a path such as /user/id.") }
        let parser = JSONSourceParser(input); let root = try parser.parse()
        guard parser.duplicatePaths.isEmpty else { throw failure("JSON Pointer extraction refuses ambiguous duplicate object keys at \(Array(Set(parser.duplicatePaths)).sorted().prefix(10).joined(separator: ", ")).") }
        var selected = root
        let tokens: [String] = pointer.isEmpty ? [] : try pointer.dropFirst().components(separatedBy: "/").map { segment in
            guard segment.range(of: "~(?![01])", options: .regularExpression) == nil else { throw failure("Invalid JSON Pointer escape in segment '\(segment)'. Use ~0 for '~' and ~1 for '/'.") }
            return segment.replacingOccurrences(of: "~1", with: "/").replacingOccurrences(of: "~0", with: "~")
        }
        for token in tokens {
            switch selected {
            case .array(let values):
                guard token.range(of: "^(?:0|[1-9][0-9]*)$", options: .regularExpression) != nil, let itemIndex = Int(token), values.indices.contains(itemIndex) else { throw failure("JSON Pointer segment '\(token)' is not an existing canonical array index.") }
                selected = values[itemIndex]
            case .object(let entries):
                guard let item = entries.first(where: { $0.0 == token })?.1 else { throw failure("JSON Pointer property '\(token)' does not exist.") }
                selected = item
            default: throw failure("JSON Pointer cannot traverse into a scalar at segment '\(token)'.")
            }
        }
        let output = stringify(selected, pretty: true)
        warnings.append(contentsOf: recipeJSONFormatterWarnings(output, duplicatePaths: []).filter { $0.hasPrefix("WARNING:") })
        return output
    }

    static func run(_ raw: String) throws -> String {
        guard utf8(raw).count <= maxConfigBytes else { throw failure("Recipe configuration exceeds the 7 MiB safety limit. Reduce the input or split this workflow into smaller recipes.") }
        let configParser = JSONSourceParser(raw)
        let configValue = try configParser.parse()
        guard configParser.duplicatePaths.isEmpty else {
            throw failure("Recipe configuration contains duplicate object keys and is ambiguous: \(configParser.duplicatePaths.joined(separator: ", ")).")
        }
        guard case .object(let configEntries) = configValue else { throw failure("Recipe configuration must be a JSON object with 'input' and 'steps' fields.") }
        guard let initial = stringMember(configEntries, "input") else { throw failure("Recipe configuration needs a string 'input' field.") }
        guard utf8(initial).count <= maxInputBytes else { throw failure("Recipe input exceeds the 1 MiB UTF-8 safety limit.") }
        guard let stepsValue = member(configEntries, "steps"), case .array(let steps) = stepsValue, (1...maxSteps).contains(steps.count) else { throw failure("Recipe must contain between 1 and \(maxSteps) steps.") }
        var current = initial; var rows: [[String: Any]] = []; var allWarnings: [String] = []
        for (index, stepValue) in steps.enumerated() {
            guard case .object(let step) = stepValue else { throw failure("Recipe step \(index + 1) must be an object.") }
            guard let op = stringMember(step, "op"), supported.contains(op) else { throw failure("Recipe step \(index + 1) has an unsupported operation. Supported operations: \(supported.joined(separator: ", ")).") }
            let trimmedName = stringMember(step, "name")?.trimmingCharacters(in: .whitespacesAndNewlines)
            let name = trimmedName.map { $0.isEmpty ? op : String($0.prefix(100)) } ?? op
            let before = current; var warnings: [String] = []
            do {
                if op.hasPrefix("json-") || op == "json-to-csv" { try assertRecipeJSONDepth(current) }
                if op == "json-format" || op == "json-sort-keys" { try assertRecipePrettyJSONFits(current) }
                switch op {
                case "trim": current = current.trimmingCharacters(in: .whitespacesAndNewlines)
                case "strip-bom": if current.hasPrefix("\u{FEFF}") { current = String(current.dropFirst()) }
                case "normalize-newlines": current = current.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
                case "ensure-final-newline": if !current.hasSuffix("\n") && !current.hasSuffix("\r") { current += "\n" }
                case "remove-final-newline": if current.hasSuffix("\r\n") { current.removeLast(2) } else if current.hasSuffix("\r") || current.hasSuffix("\n") { current.removeLast() }
                case "collapse-whitespace": current = current.replacingOccurrences(of: "[ \\t\\r\\n\\f\\u{000B}]+", with: " ", options: .regularExpression)
                case "remove-blank-lines": current = mapLines(current) { $0.filter { $0.range(of: "^[ \\t]*$", options: .regularExpression) == nil } }
                case "sort-lines": current = mapLines(current) { $0.sorted(by: compareCodePoints) }
                case "unique-lines": current = mapLines(current) { lines in var seen = Set<Data>(); return lines.filter { seen.insert(Data($0.utf8)).inserted } }
                case "reverse-lines": current = mapLines(current) { Array($0.reversed()) }
                case "unicode-normalize-nfc": current = current.precomposedStringWithCanonicalMapping
                case "unicode-normalize-nfd": current = current.decomposedStringWithCanonicalMapping
                case "unicode-normalize-nfkc": current = current.precomposedStringWithCompatibilityMapping; if current != before { warnings.append("NFKC compatibility normalization changed one or more code points; review identifier/security-sensitive text before use.") }
                case "unicode-normalize-nfkd": current = current.decomposedStringWithCompatibilityMapping; if current != before { warnings.append("NFKD compatibility normalization changed one or more code points; review identifier/security-sensitive text before use.") }
                case "replace-literal":
                    guard let find = stringMember(step, "find"), !find.isEmpty else { throw failure("replace-literal needs a non-empty 'find' string.") }
                    let replace = stringMember(step, "replacement") ?? stringMember(step, "replace") ?? ""
                    guard find.count <= 10_000, replace.count <= 100_000 else { throw failure("Literal search must be at most 10,000 characters and replacement at most 100,000 characters.") }
                    try assertLiteralReplacementFits(current, find: find, replacement: replace)
                    current = current.replacingOccurrences(of: find, with: replace, options: [.literal], range: nil)
                case "url-encode-component": current = encodeURL(current)
                case "url-decode-component": current = try decodeURL(current)
                case "base64-encode": current = Data(current.utf8).base64EncodedString()
                case "base64-decode": current = try decodeBase64(current)
                case "base64url-encode": current = encodeBase64(current, urlSafe: true)
                case "base64url-decode": current = try decodeBase64(current, urlSafe: true)
                case "hex-encode": current = Data(current.utf8).map { String(format: "%02x", $0) }.joined()
                case "hex-decode": current = try decodeHex(current)
                case "html-escape": current = htmlEscape(current)
                case "html-unescape": current = try htmlUnescape(current)
                case "json-pointer-get":
                    guard let pointer = stringMember(step, "pointer") else { throw failure("json-pointer-get needs a string 'pointer' field (empty string selects the root).") }
                    current = try jsonPointerGet(current, pointer: pointer, warnings: &warnings)
                case "csv-to-json": current = try csvToRecipeJSON(current)
                case "json-to-csv": current = try jsonToRecipeCSV(current)
                case "json-format", "json-minify", "json-sort-keys", "json-validate":
                    let parser = JSONSourceParser(current); let tree = try parser.parse()
                    let jsonWarnings = recipeJSONFormatterWarnings(current, duplicatePaths: parser.duplicatePaths)
                    switch op {
                    case "json-format": warnings.append(contentsOf: jsonWarnings); current = stringify(tree, pretty: true)
                    case "json-minify": warnings.append(contentsOf: jsonWarnings); current = stringify(tree, pretty: false)
                    case "json-sort-keys":
                        guard parser.duplicatePaths.isEmpty else { throw failure("Cannot sort keys without ambiguity: duplicate object keys were found at \(uniquePreservingOrder(parser.duplicatePaths).prefix(10).joined(separator: ", ")). Use json-format to preserve the source instead.") }
                        warnings.append(contentsOf: jsonWarnings)
                        current = stringify(tree, pretty: true, sortKeys: true)
                    default:
                        let duplicates = uniquePreservingOrder(parser.duplicatePaths)
                        if !duplicates.isEmpty { warnings.append("Duplicate object keys are syntactically accepted but ambiguous: \(duplicates.prefix(10).joined(separator: ", ")).") }
                        warnings.append(contentsOf: jsonWarnings.filter { $0.hasPrefix("WARNING:") })
                        let duplicateNote = duplicates.isEmpty ? "" : " Duplicate object keys detected at \(duplicates.prefix(20).joined(separator: ", "))\(duplicates.count > 20 ? ", …" : ""); JSON.parse retains only the last value for each duplicate key."
                        warnings.append("Valid JSON (RFC 8259).\(duplicateNote) Large integers may exceed JavaScript's exact integer range.")
                    }
                case "sha256-hex": current = SHA256.hash(data: Data(current.utf8)).map { String(format: "%02x", $0) }.joined()
                default: throw failure("Unsupported recipe operation.")
                }
                let outputBytes = utf8(current).count
                guard outputBytes <= maxOutputBytes else { throw failure("Step output exceeds the \(maxOutputBytes) byte safety limit.") }
                for warning in warnings where !allWarnings.contains(warning) { allWarnings.append(warning) }
                rows.append(["index": index + 1, "name": name, "operation": op, "status": "ok", "inputCharacters": codePoints(before), "outputCharacters": codePoints(current), "inputUtf8Bytes": utf8(before).count, "outputUtf8Bytes": outputBytes, "preview": preview(current), "warnings": warnings])
            } catch {
                throw failure("Recipe step \(index + 1) (‘\(name)’, \(op)) failed: \(error.localizedDescription). No partial output is being presented as a completed recipe.")
            }
        }
        let report: [String: Any] = [
            "schemaVersion": 1, "mode": "recipe", "engine": "enV iOS Swift recipe engine", "status": "completed",
            "stepsCompleted": rows.count, "steps": rows, "finalOutput": current, "finalOutputCharacters": codePoints(current), "finalOutputUtf8Bytes": utf8(current).count,
            "warnings": allWarnings, "supportedOperations": supported,
            "semantics": [
                "Operations are explicitly allow-listed; no eval, shell, network request, or arbitrary code execution.",
                "URL component decoding preserves '+' literally (unlike application/x-www-form-urlencoded parsing).",
                "Base64 operations accept strict standard or URL-safe alphabets, validate canonical padding bits, and decode UTF-8 text only.",
                "JSON formatting/minification preserve source numeric tokens and duplicate keys; key sorting and JSON Pointer extraction refuse ambiguous duplicate-key documents instead of silently discarding values.",
                "json-pointer-get follows RFC 6901 escaping, including ~0 for tilde and ~1 for slash, and requires canonical array indexes.",
                "SHA-256 is one-way and must not be used as password hashing.",
            "NFKC/NFKD may change compatibility distinctions; normalization is not a universal security policy."
            ],
            "privacy": "Processed in memory on this device by this engine; this engine does not upload or persist recipe input."
        ]
        guard let outputData = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), let output = String(data: outputData, encoding: .utf8) else { throw failure("Could not serialize the recipe result.") }
        return output
    }
}
