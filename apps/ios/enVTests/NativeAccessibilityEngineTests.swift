import XCTest
@testable import enV

final class NativeAccessibilityEngineTests: XCTestCase {
    func testColorVisionStudioProvidesFourLabeledApproximationPairs() {
        let pairs = NativeAccessibilityEngine.colorVisionPreviewPairs("#cc3322", "#ffffff")
        XCTAssertEqual(pairs.count, 4)
        XCTAssertTrue(pairs.contains { $0.label.contains("Protanopia") })
        XCTAssertTrue(pairs.contains { $0.label.contains("Achromatopsia") })
        XCTAssertTrue(pairs.allSatisfy { $0.foreground.hasPrefix("#") && $0.background.hasPrefix("#") })
    }
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
        let keyboard = NativeAccessibilityEngine.analyze(toolID: "keyboard-navigation-checker", input: "<div tabindex=\"3\"></div><div onclick=\"go()\"></div>")
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
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "line-height-generator", input: "").contains("--leading-body: 1.5"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "font-size-generator", input: "").contains("--type-body: clamp"))
    }

    func testAccessibilityActionsHaveDistinctJobs() {
        let markup = "<img src=\"hero.jpg\" alt=\"A person using a laptop\"><img src=\"logo.png\">"
        let helper = NativeAccessibilityEngine.analyze(toolID: "alt-text-helper", input: "Volunteer registers visitors at an event")
        let preview = NativeAccessibilityEngine.analyze(toolID: "alt-text-preview", input: markup)
        let simulator = NativeAccessibilityEngine.analyze(toolID: "alt-text-simulator", input: markup)
        XCTAssertTrue(helper.contains("WRITING COACH"))
        XCTAssertTrue(preview.contains("SCREEN-READER ANNOUNCEMENT PREVIEW"))
        XCTAssertTrue(preview.contains("Image: A person using a laptop"))
        XCTAssertTrue(simulator.contains("BULK ALT-TEXT TRIAGE"))
        XCTAssertTrue(simulator.contains("SERIOUS · Missing alt"))
        XCTAssertNotEqual(helper, preview)
        XCTAssertNotEqual(preview, simulator)
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "aria-simulator", input: "<button aria-label=\"Save\">Save</button>").contains("KEYBOARD + ASSISTIVE-TECHNOLOGY WALKTHROUGH"))
    }

    func testFocusGeneratorUsesSelectedOptionsAndModernModes() {
        let css = NativeAccessibilityEngine.analyze(toolID: "focus-state-generator", input: "", foreground: "#005fcc", background: "#ffd54f", focusWidth: "4px", focusOffset: "5px")
        XCTAssertTrue(css.contains("outline: 4px solid #005fcc"))
        XCTAssertTrue(css.contains("outline-offset: 5px"))
        XCTAssertTrue(css.contains("forced-colors: active"))
        XCTAssertTrue(css.contains("prefers-color-scheme: dark"))
    }

    func testAriaGeneratorUsesSelectedPattern() {
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "aria-generator", input: "disclosure").contains("aria-expanded=\"false\""))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "aria-generator", input: "tabs").contains("role=\"tablist\""))
    }

    func testReadabilityActionsProduceQualifiedSimplificationDrafts() {
        let source = "We will utilize this assistance in order to make a decision."
        let generated = NativeAccessibilityEngine.analyze(toolID: "text-readability-generator", input: source)
        let helper = NativeAccessibilityEngine.analyze(toolID: "text-readability-helper", input: source)
        XCTAssertTrue(generated.contains("Suggested wording:"))
        XCTAssertTrue(generated.contains("use this help to decide"))
        XCTAssertTrue(helper.contains("READABILITY COACH"))
        XCTAssertTrue(helper.contains("Flesch Reading Ease"))
    }
}
