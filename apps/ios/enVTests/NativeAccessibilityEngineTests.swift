import XCTest
@testable import enV

final class NativeAccessibilityEngineTests: XCTestCase {
    func testMissingAndFilenameAltTextProduceActionableFindings() {
        let report = NativeAccessibilityEngine.analyze(toolID: "alt-text-checker", input: "<img src=\"hero.jpg\"><img src=\"logo.png\" alt=\"logo.png\">")
        XCTAssertTrue(report.contains("image-alt"))
        XCTAssertTrue(report.contains("filename-alt"))
        XCTAssertTrue(report.contains("decorative"))
    }

    func testAriaAndKeyboardIssuesAreReported() {
        let aria = NativeAccessibilityEngine.analyze(toolID: "aria-checker", input: "<button role=\"pushbutton\" aria-labelledby=\"missing\"></button>")
        XCTAssertTrue(aria.contains("aria-valid-role"))
        XCTAssertTrue(aria.contains("aria-labelledby"))
        let keyboard = NativeAccessibilityEngine.analyze(toolID: "keyboard-navigation-checker", input: "<div tabindex=\"3\" onclick=\"go()\"></div>")
        XCTAssertTrue(keyboard.contains("tabindex"))
        XCTAssertTrue(keyboard.contains("keyboard-operable"))
    }

    func testFormsFocusAndMotionAreCheckedLocally() {
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "form-checker", input: "<input id=\"email\">").contains("label"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "focus-state-checker", input: "button:focus { outline: none; }").contains("focus-not-hidden"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "motion-checker", input: ".x { animation: spin 2s infinite; }").contains("reduced-motion"))
    }

    func testContrastAndReadabilityReturnUsefulMetrics() {
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "contrast-checker", input: "", foreground: "#000000", background: "#ffffff").contains("21.00:1"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "text-readability-checker", input: "This is a short sentence.").contains("Flesch Reading Ease"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "color-blindness-simulator", input: "", foreground: "#ff0000", background: "#00ff00").contains("Protanopia approximation"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "accessible-color-generator", input: "", foreground: "#777777", background: "#ffffff").contains("Foreground alternatives"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "line-height-generator", input: "").contains("line-height: 1.5"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "font-size-generator", input: "").contains("font-size: 1rem"))
    }
}
