import XCTest
@testable import enV

final class NativeCodecEngineTests: XCTestCase {
    private let allIDs: Set<String> = [
        "ascii-converter", "base64-decoder", "base64-encoder", "binary-converter", "hash-compare",
        "hex-converter", "html-decoder", "html-encoder", "md5-hash", "sha1-hash", "sha256-hash",
        "sha512-hash", "unicode-converter", "url-decoder", "url-encoder", "hash-generator", "number-base-converter"
    ]

    func testCanonicalCodecIDsAreFullyLocalAndMapped() {
        XCTAssertEqual(NativeCodecEngine.canonicalToolIDs, allIDs)
        XCTAssertEqual(NativeCodecEngine.supportedToolIDs, allIDs)
        for id in allIDs { XCTAssertNotNil(NativeCodecEngine.operation(forToolID: id)) }
    }

    func testEncodingsMatchWebSemanticsForUnicodeAndEntities() throws {
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "base64-encoder", input: "Hello 🌍").output, "SGVsbG8g8J+MjQ==")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "base64-decoder", input: "SGVsbG8g8J+MjQ==").output, "Hello 🌍")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "url-encoder", input: "a b:c!~*'()").output, "a%20b%3Ac!~*'()")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "url-decoder", input: "a+b%2Bc").output, "a b+c")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "html-encoder", input: "<x a='y'>&quot;").output, "&lt;x a=&#39;y&#39;&gt;&amp;quot;")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "html-decoder", input: "&lt;x a=&#39;y&#39;&gt;&amp;quot; &#x26; &#60;").output, "<x a='y'>&quot; & <")
    }

    func testDumpsAndHashesAreDeterministic() throws {
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "unicode-converter", input: "A🌍").output, "UTF-8: 41 f0 9f 8c 8d\nU+0041 A\nU+1F30D 🌍")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "ascii-converter", input: "A🌍").output, "A\t65\n🌍\t127757")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "binary-converter", input: "A🌍").output, "01000001 11110000 10011111 10001100 10001101")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "hex-converter", input: "A🌍").output, "41f09f8c8d")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "md5-hash", input: "abc").output, "900150983cd24fb0d6963f7d28e17f72")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "sha1-hash", input: "abc").output, "a9993e364706816aba3e25717850c26c9cd0d89d")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "hash-compare", options: ["a": " ABC ", "b": "abc"]).output, "match")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "hash-compare", options: ["a": "abc", "b": "abd"]).output, "different")
    }

    func testBaseConvertUsesArbitraryPrecisionAndRejectsInvalidInputs() throws {
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "number-base-converter", input: "255", options: ["fromBase": "10", "toBase": "16"]).output, "ff")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "number-base-converter", input: "-ff", options: ["fromBase": "16", "toBase": "2"]).output, "-11111111")
        XCTAssertEqual(try NativeCodecEngine.run(toolID: "number-base-converter", input: "123456789012345678901234567890", options: ["fromBase": "10", "toBase": "36"]).output, "byw97um9s91dlz68tsi")
        XCTAssertThrowsError(try NativeCodecEngine.run(toolID: "number-base-converter", input: "12z", options: ["fromBase": "10", "toBase": "16"])) { error in
            XCTAssertEqual(error as? NativeCodecError, .invalidNumber)
        }
        XCTAssertThrowsError(try NativeCodecEngine.run(toolID: "base64-decoder", input: "%%%")) { error in
            XCTAssertEqual(error as? NativeCodecError, .invalidBase64)
        }
    }
}
