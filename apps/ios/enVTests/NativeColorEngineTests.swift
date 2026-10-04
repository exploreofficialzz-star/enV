import XCTest
@testable import enV

final class NativeColorEngineTests: XCTestCase {
    private let allIDs: Set<String> = [
        "cmyk-converter", "color-blindness-simulator", "color-builder", "color-css-generator", "color-generator", "palette-generator",
        "color-picker", "color-preset-maker", "color-preview", "color-svg-generator", "color-token-generator", "contrast-checker",
        "hsl-converter", "hsv-converter", "rgb-converter", "wcag-checker"
    ]

    func testCanonicalActiveColorIDsHaveLocalOperations() {
        XCTAssertEqual(Set(NativeColorEngine.supportedToolIDs), allIDs)
        XCTAssertEqual(NativeColorEngine.operation(forToolID: "rgb-converter"), "picker")
        XCTAssertEqual(NativeColorEngine.operation(forToolID: "palette-generator"), "palette")
        XCTAssertEqual(NativeColorEngine.operation(forToolID: "wcag-checker"), "contrast")
        for id in allIDs { let result = try? NativeColorEngine.run(toolID: id); XCTAssertFalse(result?.output.isEmpty ?? true) }
    }

    func testPickerMatchesWebHexRGBHSLHSVAndCMYKSemantics() throws {
        let result = try NativeColorEngine.run(toolID: "rgb-converter", input: "#0d9f8a")
        XCTAssertEqual(result.hex, "#0d9f8a")
        XCTAssertEqual(result.rgb, NativeColorRGB(r: 13, g: 159, b: 138))
        XCTAssertEqual(result.output, "HEX: #0d9f8a\nRGB: 13, 159, 138\nHSL: 171°, 85%, 34%\nHSV/HSB: 171°, 85%, 62%\nCMYK: 92 / 0 / 13 / 38")
    }

    func testThreeDigitHexAndPaletteAreLocalAndDeterministic() throws {
        let result = try NativeColorEngine.run(toolID: "color-generator", input: "#abc")
        XCTAssertEqual(result.hex, "#aabbcc")
        XCTAssertEqual(result.palette.count, 8)
        XCTAssertEqual(result.palette.first, "#aabbcc")
        XCTAssertTrue(result.output.contains("PALETTE: #aabbcc"))
    }

    func testContrastUsesWcagRelativeLuminanceAndThresholds() throws {
        let result = try NativeColorEngine.run(toolID: "contrast-checker", foreground: "#000000", background: "#ffffff")
        XCTAssertEqual(result.contrastRatio ?? 0, 21, accuracy: 0.0001)
        XCTAssertEqual(result.passesAA, true); XCTAssertEqual(result.passesAAA, true)
        XCTAssertEqual(result.output, "Contrast ratio 21.00:1\nAA pass · AAA pass")
    }

    func testInvalidColorIsNotSilentlyAccepted() {
        XCTAssertThrowsError(try NativeColorEngine.run(toolID: "color-picker", input: "#12xz89"))
    }
}
