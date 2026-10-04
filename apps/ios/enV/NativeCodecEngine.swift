import Foundation
import CryptoKit

/// Pure Swift counterpart of src/lib/engines/codecs.ts. It never uses a backend.
public struct NativeCodecResult: Equatable {
    public let output: String
    public init(output: String) { self.output = output }
}

public enum NativeCodecError: LocalizedError, Equatable {
    case unknownCodec(String)
    case invalidBase64
    case invalidURL
    case invalidHTML
    case missingValue
    case invalidNumber
    case invalidFromBase
    case invalidToBase

    public var errorDescription: String? {
        switch self {
        case .unknownCodec(let id): return "Unknown codec: \(id)"
        case .invalidBase64: return "Invalid Base64"
        case .invalidURL: return "Invalid URL encoding"
        case .invalidHTML: return "Invalid HTML entity"
        case .missingValue: return "Missing value"
        case .invalidNumber: return "Invalid number"
        case .invalidFromBase: return "fromBase must be 2–36"
        case .invalidToBase: return "toBase must be 2–36"
        }
    }
}

public enum NativeCodecEngine {
    private static let idToOperation: [String: String] = [
        "ascii-converter": "ascii",
        "base64-decoder": "base64-decode",
        "base64-encoder": "base64-encode",
        "binary-converter": "binary",
        "hash-compare": "hash-compare",
        "hex-converter": "hex",
        "html-decoder": "html-decode",
        "html-encoder": "html-encode",
        "md5-hash": "md5",
        "sha1-hash": "sha1",
        "sha256-hash": "sha256",
        "sha512-hash": "sha512",
        "unicode-converter": "unicode",
        "url-decoder": "url-decode",
        "url-encoder": "url-encode",
        "hash-generator": "multi-hash",
        "number-base-converter": "base-convert"
    ]

    public static let canonicalToolIDs: Set<String> = Set(idToOperation.keys)
    public static let supportedToolIDs: Set<String> = Set(idToOperation.keys)
    public static func operation(forToolID id: String) -> String? { idToOperation[id] }

    public static func run(toolID: String, input: String = "", options: [String: String] = [:]) throws -> NativeCodecResult {
        guard let operation = idToOperation[toolID] else { throw NativeCodecError.unknownCodec(toolID) }
        let output: String
        switch operation {
        case "base64-encode": output = Data(input.utf8).base64EncodedString()
        case "base64-decode": output = try decodeBase64(input)
        case "url-encode": output = encodeURL(input)
        case "url-decode": output = try decodeURL(input)
        case "html-encode": output = htmlEncode(input)
        case "html-decode": output = try htmlDecode(input)
        case "unicode": output = unicodeDump(input)
        case "ascii": output = asciiDump(input)
        case "binary": output = input.utf8.map { String($0, radix: 2).leftPadded(to: 8, with: "0") }.joined(separator: " ")
        case "hex": output = input.utf8.map { String($0, radix: 16).leftPadded(to: 2, with: "0") }.joined()
        case "md5": output = digestMD5(input)
        case "sha1": output = digestSHA1(input)
        case "sha256": output = digestSHA256(input)
        case "sha512": output = digestSHA512(input)
        case "multi-hash": output = [
            "MD5\t\(digestMD5(input))",
            "SHA-1\t\(digestSHA1(input))",
            "SHA-256\t\(digestSHA256(input))",
            "SHA-512\t\(digestSHA512(input))"
        ].joined(separator: "\n")
        case "hash-compare":
            let a = (options["a"] ?? input).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let b = (options["b"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            output = timingSafeEqual(a, b) ? "match" : "different"
        case "base-convert": output = try baseConvert(input, options)
        default: throw NativeCodecError.unknownCodec(operation)
        }
        return NativeCodecResult(output: output)
    }

    private static func digestMD5(_ input: String) -> String { Insecure.MD5.hash(data: Data(input.utf8)).hexString }
    private static func digestSHA1(_ input: String) -> String { Insecure.SHA1.hash(data: Data(input.utf8)).hexString }
    private static func digestSHA256(_ input: String) -> String { SHA256.hash(data: Data(input.utf8)).hexString }
    private static func digestSHA512(_ input: String) -> String { SHA512.hash(data: Data(input.utf8)).hexString }

    private static func htmlEncode(_ input: String) -> String {
        input.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private static func htmlDecode(_ input: String) throws -> String {
        var value = input
        value = value.replacingOccurrences(of: "&lt;", with: "<", options: [.caseInsensitive])
        value = value.replacingOccurrences(of: "&gt;", with: ">", options: [.caseInsensitive])
        // The web implementation intentionally does not decode &quot; here.
        value = value.replacingOccurrences(of: "&#39;|'{1}", with: "'", options: [.regularExpression, .caseInsensitive])
        value = try replaceMatches(value, pattern: "&#([0-9]+);", transform: { match in
            guard let n = Int(match), let scalar = UnicodeScalar(n), n <= 0x10ffff else { throw NativeCodecError.invalidHTML }
            return String(scalar)
        })
        value = try replaceMatches(value, pattern: "&#x([0-9a-fA-F]+);", transform: { match in
            guard let n = Int(match, radix: 16), let scalar = UnicodeScalar(n), n <= 0x10ffff else { throw NativeCodecError.invalidHTML }
            return String(scalar)
        })
        return value.replacingOccurrences(of: "&amp;", with: "&", options: [.caseInsensitive])
    }

    private static func unicodeDump(_ input: String) -> String {
        let bytes = input.utf8.map { String($0, radix: 16).leftPadded(to: 2, with: "0") }.joined(separator: " ")
        let points = input.unicodeScalars.map { scalar in
            "U+\(String(scalar.value, radix: 16).uppercased().leftPadded(to: 4, with: "0")) \(String(scalar))"
        }
        return "UTF-8: \(bytes.isEmpty ? "(empty)" : bytes)\n\(points.joined(separator: "\n"))"
    }

    private static func asciiDump(_ input: String) -> String {
        input.unicodeScalars.map { "\(String($0))\t\($0.value)" }.joined(separator: "\n")
    }

    private static func encodeURL(_ input: String) -> String {
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".utf8)
        return input.utf8.map { byte in
            allowed.contains(byte) ? String(UnicodeScalar(byte)) : "%\(String(byte, radix: 16).uppercased().leftPadded(to: 2, with: "0"))"
        }.joined()
    }

    private static func decodeURL(_ input: String) throws -> String {
        let value = input.replacingOccurrences(of: "+", with: "%20")
        var output = ""
        var index = value.startIndex
        while index < value.endIndex {
            guard value[index] == "%" else {
                output.append(value[index])
                index = value.index(after: index)
                continue
            }
            var bytes: [UInt8] = []
            while index < value.endIndex && value[index] == "%" {
                let one = value.index(after: index)
                guard one < value.endIndex else { throw NativeCodecError.invalidURL }
                let two = value.index(after: one)
                guard two < value.endIndex, let hi = value[one].asciiValue?.hexDigit, let lo = value[two].asciiValue?.hexDigit else { throw NativeCodecError.invalidURL }
                bytes.append((hi << 4) | lo)
                index = value.index(after: two)
            }
            guard let decoded = String(data: Data(bytes), encoding: .utf8) else { throw NativeCodecError.invalidURL }
            output.append(decoded)
        }
        return output
    }

    private static func decodeBase64(_ input: String) throws -> String {
        let cleaned = input.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
        let valid = cleaned.range(of: "^[A-Za-z0-9+/]*={0,2}$", options: .regularExpression) != nil && cleaned.count % 4 != 1
        guard valid, let data = Data(base64Encoded: cleaned) ?? Data(base64Encoded: cleaned + String(repeating: "=", count: (4 - cleaned.count % 4) % 4)) else { throw NativeCodecError.invalidBase64 }
        return String(decoding: data, as: UTF8.self)
    }

    private static func timingSafeEqual(_ a: String, _ b: String) -> Bool {
        let left = Array(a.utf16), right = Array(b.utf16), count = max(left.count, right.count)
        var difference = left.count == right.count ? 0 : 1
        for i in 0..<count { difference |= Int(left[safe: i] ?? 0) ^ Int(right[safe: i] ?? 0) }
        return difference == 0
    }

    private static func baseConvert(_ input: String, _ options: [String: String]) throws -> String {
        let fromBase = options["fromBase"].flatMap(Int.init) ?? (options["fromBase"] == nil ? 10 : 0)
        let toBase = options["toBase"].flatMap(Int.init) ?? (options["toBase"] == nil ? 16 : 0)
        guard (2...36).contains(fromBase) else { throw NativeCodecError.invalidFromBase }
        guard (2...36).contains(toBase) else { throw NativeCodecError.invalidToBase }
        let raw = (options["value"] ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw NativeCodecError.missingValue }
        let negative = raw.first == "-"
        let body = (raw.first == "+" || raw.first == "-") ? String(raw.dropFirst()) : raw
        guard !body.isEmpty else { throw NativeCodecError.invalidNumber }
        var limbs: [Int64] = [0] // little-endian base 1,000,000,000
        for scalar in body.lowercased().unicodeScalars {
            let digit: Int? = scalar.value >= 48 && scalar.value <= 57 ? Int(scalar.value - 48) : (scalar.value >= 97 && scalar.value <= 122 ? Int(scalar.value - 87) : nil)
            guard let digit, digit < fromBase else { throw NativeCodecError.invalidNumber }
            var carry = Int64(digit)
            for i in limbs.indices {
                let value = limbs[i] * Int64(fromBase) + carry
                limbs[i] = value % 1_000_000_000
                carry = value / 1_000_000_000
            }
            if carry > 0 { limbs.append(carry) }
        }
        while limbs.count > 1 && limbs.last == 0 { limbs.removeLast() }
        if limbs.count == 1 && limbs[0] == 0 { return "0" }
        let digits = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        var parts: [String] = []
        while !(limbs.count == 1 && limbs[0] == 0) {
            var remainder: Int64 = 0
            for i in limbs.indices.reversed() {
                let current = remainder * 1_000_000_000 + limbs[i]
                limbs[i] = current / Int64(toBase)
                remainder = current % Int64(toBase)
            }
            parts.append(String(digits[Int(remainder)]))
            while limbs.count > 1 && limbs.last == 0 { limbs.removeLast() }
        }
        let converted = parts.reversed().joined()
        return negative ? "-\(converted)" : converted
    }

    private static func replaceMatches(_ input: String, pattern: String, transform: (String) throws -> String) throws -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return input }
        let range = NSRange(input.startIndex..<input.endIndex, in: input)
        let matches = regex.matches(in: input, range: range)
        var result = "", cursor = input.startIndex
        for match in matches {
            guard let matchRange = Range(match.range, in: input), let captureRange = Range(match.range(at: 1), in: input) else { continue }
            result += String(input[cursor..<matchRange.lowerBound])
            result += try transform(String(input[captureRange]))
            cursor = matchRange.upperBound
        }
        result += String(input[cursor...])
        return result
    }
}

private extension String {
    func leftPadded(to length: Int, with character: String) -> String {
        count >= length ? self : String(repeating: character, count: length - count) + self
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? { indices.contains(index) ? self[index] : nil }
}

private extension UInt8 {
    var hexDigit: UInt8? {
        switch self {
        case 48...57: return self - 48
        case 65...70: return self - 55
        case 97...102: return self - 87
        default: return nil
        }
    }
}

private extension Digest {
    var hexString: String { map { String($0, radix: 16).leftPadded(to: 2, with: "0") }.joined() }
}
