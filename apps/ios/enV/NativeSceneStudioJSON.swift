// UNVERIFIED: written on a Linux machine that has no Swift compiler, so this file has never been compiled or run.
// It mirrors the Kotlin reader in apps/android/.../scenestudio/, which HAS been compiled and run against the shared
// test numbers. It is not listed in enV.xcodeproj yet: see apps/ios/NATIVE_SCENE_STUDIO.md for the steps to add it
// and run the tests on a Mac.
import Foundation

/// A parsed JSON value. Every number is a Double.
public enum SceneStudioJSON: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([SceneStudioJSON])
    case object([String: SceneStudioJSON])

    public subscript(key: String) -> SceneStudioJSON? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public var objectValue: [String: SceneStudioJSON]? {
        if case .object(let o) = self { return o }
        return nil
    }

    public var arrayValue: [SceneStudioJSON]? {
        if case .array(let a) = self { return a }
        return nil
    }

    public var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    public var numberValue: Double? {
        if case .number(let n) = self { return n }
        return nil
    }

    public var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }
}

public struct SceneStudioJSONError: Error, Equatable {
    public let message: String
}

/// A small, strict JSON reader with no dependencies, so the Scene Studio reader behaves exactly like the Kotlin one.
/// The grammar is JSON exactly: no comments, no trailing commas, no single quotes.
public enum SceneStudioJSONParser {
    private static let maxDepth = 100

    public static func parse(_ text: String) throws -> SceneStudioJSON {
        var parser = Parser(text)
        parser.skipSpace()
        let value = try parser.readValue(0)
        parser.skipSpace()
        if !parser.atEnd { throw parser.fail("Unexpected text after the end of the value") }
        return value
    }

    private struct Parser {
        let s: [Unicode.Scalar]
        var i = 0

        init(_ text: String) {
            var scalars = Array(text.unicodeScalars)
            if let first = scalars.first, first.value == 0xFEFF { scalars.removeFirst() }
            s = scalars
        }

        var atEnd: Bool { return i >= s.count }

        func fail(_ message: String) -> SceneStudioJSONError {
            return SceneStudioJSONError(message: "\(message) at position \(i)")
        }

        mutating func skipSpace() {
            while i < s.count {
                let c = s[i]
                if c == " " || c == "\t" || c == "\n" || c == "\r" { i += 1 } else { break }
            }
        }

        func isDigit(_ c: Unicode.Scalar) -> Bool { return c.value >= 48 && c.value <= 57 }

        mutating func readValue(_ depth: Int) throws -> SceneStudioJSON {
            if depth > SceneStudioJSONParser.maxDepth { throw fail("Nesting is too deep") }
            if atEnd { throw fail("Unexpected end of text") }
            let c = s[i]
            if c == "{" { return try readObject(depth) }
            if c == "[" { return try readArray(depth) }
            if c == "\"" { return .string(try readString()) }
            if c == "t" { try literal("true"); return .bool(true) }
            if c == "f" { try literal("false"); return .bool(false) }
            if c == "n" { try literal("null"); return .null }
            if c == "-" || isDigit(c) { return .number(try readNumber()) }
            throw fail("Unexpected character")
        }

        mutating func literal(_ word: String) throws {
            let w = Array(word.unicodeScalars)
            if i + w.count > s.count { throw fail("Unexpected character") }
            for k in 0..<w.count where s[i + k] != w[k] { throw fail("Unexpected character") }
            i += w.count
        }

        mutating func readObject(_ depth: Int) throws -> SceneStudioJSON {
            var out: [String: SceneStudioJSON] = [:]
            i += 1 // {
            skipSpace()
            if !atEnd && s[i] == "}" {
                i += 1
                return .object(out)
            }
            while true {
                skipSpace()
                if atEnd || s[i] != "\"" { throw fail("Expected a quoted name") }
                let key = try readString()
                skipSpace()
                if atEnd || s[i] != ":" { throw fail("Expected ':'") }
                i += 1
                skipSpace()
                out[key] = try readValue(depth + 1)
                skipSpace()
                if atEnd { throw fail("Unexpected end of text") }
                if s[i] == "," {
                    i += 1
                } else if s[i] == "}" {
                    i += 1
                    return .object(out)
                } else {
                    throw fail("Expected ',' or '}'")
                }
            }
        }

        mutating func readArray(_ depth: Int) throws -> SceneStudioJSON {
            var out: [SceneStudioJSON] = []
            i += 1 // [
            skipSpace()
            if !atEnd && s[i] == "]" {
                i += 1
                return .array(out)
            }
            while true {
                skipSpace()
                out.append(try readValue(depth + 1))
                skipSpace()
                if atEnd { throw fail("Unexpected end of text") }
                if s[i] == "," {
                    i += 1
                } else if s[i] == "]" {
                    i += 1
                    return .array(out)
                } else {
                    throw fail("Expected ',' or ']'")
                }
            }
        }

        mutating func readHex4() throws -> UInt32 {
            if i + 4 > s.count { throw fail("Bad \\u escape") }
            var code: UInt32 = 0
            for k in 0..<4 {
                let v = s[i + k].value
                let digit: UInt32
                if v >= 48 && v <= 57 { digit = v - 48 }
                else if v >= 65 && v <= 70 { digit = v - 55 }
                else if v >= 97 && v <= 102 { digit = v - 87 }
                else { throw fail("Bad \\u escape") }
                code = code * 16 + digit
            }
            i += 4
            return code
        }

        mutating func readString() throws -> String {
            i += 1 // opening quote
            var out = String.UnicodeScalarView()
            while true {
                if atEnd { throw fail("Unterminated text") }
                let c = s[i]
                i += 1
                if c == "\"" { return String(out) }
                if c == "\\" {
                    if atEnd { throw fail("Unterminated text") }
                    let e = s[i]
                    i += 1
                    if e == "\"" { out.append("\"") }
                    else if e == "\\" { out.append("\\") }
                    else if e == "/" { out.append("/") }
                    else if e == "b" { out.append(Unicode.Scalar(UInt8(8))) }
                    else if e == "f" { out.append(Unicode.Scalar(UInt8(12))) }
                    else if e == "n" { out.append("\n") }
                    else if e == "r" { out.append("\r") }
                    else if e == "t" { out.append("\t") }
                    else if e == "u" {
                        let unit = try readHex4()
                        var appended = false
                        if unit >= 0xD800 && unit <= 0xDBFF && i + 1 < s.count && s[i] == "\\" && s[i + 1] == "u" {
                            let save = i
                            i += 2
                            let low = try readHex4()
                            if low >= 0xDC00 && low <= 0xDFFF {
                                let combined = 0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00)
                                out.append(Unicode.Scalar(combined) ?? Unicode.Scalar(UInt8(63)))
                                appended = true
                            } else {
                                i = save
                            }
                        }
                        if !appended {
                            // A lone surrogate cannot be stored in a Swift String; it becomes "?" (the Kotlin reader keeps it).
                            out.append(Unicode.Scalar(unit) ?? Unicode.Scalar(UInt8(63)))
                        }
                    } else {
                        throw fail("Bad escape")
                    }
                } else if c.value < 0x20 {
                    throw fail("A line break or control character inside text")
                } else {
                    out.append(c)
                }
            }
        }

        mutating func readNumber() throws -> Double {
            let start = i
            if s[i] == "-" { i += 1 }
            if atEnd { throw fail("Bad number") }
            if s[i] == "0" {
                i += 1
            } else if s[i].value >= 49 && s[i].value <= 57 {
                while !atEnd && isDigit(s[i]) { i += 1 }
            } else {
                throw fail("Bad number")
            }
            if !atEnd && s[i] == "." {
                i += 1
                let digits = i
                while !atEnd && isDigit(s[i]) { i += 1 }
                if i == digits { throw fail("Bad number") }
            }
            if !atEnd && (s[i] == "e" || s[i] == "E") {
                i += 1
                if !atEnd && (s[i] == "+" || s[i] == "-") { i += 1 }
                let digits = i
                while !atEnd && isDigit(s[i]) { i += 1 }
                if i == digits { throw fail("Bad number") }
            }
            var text = ""
            for k in start..<i { text.unicodeScalars.append(s[k]) }
            guard let value = Double(text) else { throw fail("Bad number") }
            return value
        }
    }
}
