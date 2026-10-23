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
        let keyboard = NativeAccessibilityEngine.analyze(toolID: "keyboard-navigation-checker", input: "<div tabindex=\"3\"></div><div tabindex=\"0\" onclick=\"go()\"></div><div onclick=\"go()\"></div>")
        XCTAssertTrue(keyboard.contains("tabindex"))
        XCTAssertTrue(keyboard.contains("keyboard-operable"))
    }

    func testAriaReferenceAndStateValueProblemsAreDetected() {
        let report = NativeAccessibilityEngine.analyze(
            toolID: "aria-checker",
            input: "<div aria-label='Loading'></div><button aria-expanded='yes' aria-controls='missing' aria-invalid=''>Open</button>"
        )
        XCTAssertTrue(report.contains("aria-prohibited-attr"))
        XCTAssertTrue(report.contains("aria-value-expanded"))
        XCTAssertTrue(report.contains("aria-reference"))
        XCTAssertTrue(report.contains("aria-value-invalid"))
    }

    func testBrokenFormReferencesAndCustomKeyboardActivationAreDetected() {
        let form = NativeAccessibilityEngine.analyze(
            toolID: "form-checker",
            input: "<label for='missing'>Email</label><input id='email' aria-invalid='true' aria-describedby='error-missing'>"
        )
        XCTAssertTrue(form.contains("label-reference"))
        XCTAssertTrue(form.contains("error-description-reference"))
        let keyboard = NativeAccessibilityEngine.analyze(
            toolID: "keyboard-navigation-checker",
            input: "<div role='button' tabindex='0' onclick='save()'>Save</div>"
        )
        XCTAssertTrue(keyboard.contains("custom-button-keyboard-activation"))
    }


    func testKeyboardStudioFlagsExplicitlyUndersizedTargetsAsReviewLeads() {
        let inline = NativeAccessibilityEngine.analyze(toolID: "keyboard-navigation-checker", input: "<button id='tiny' style='width:18px;height:20px'>X</button>")
        XCTAssertTrue(inline.contains("target-size-risk"))
        XCTAssertTrue(inline.contains("2.5.8 Target Size (Minimum)"))
        let css = NativeAccessibilityEngine.analyze(toolID: "keyboard-navigation-checker", input: "<style>.icon-button { width: 20px; }</style><button class='icon-button'>Open</button>")
        XCTAssertTrue(css.contains("target-size-risk"))
    }

    func testFormsFocusAndMotionAreCheckedLocally() {
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "form-checker", input: "<input id=\"email\">").contains("label"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "focus-state-checker", input: "button:focus { outline: none; }").contains("focus-not-hidden"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "motion-checker", input: ".x { animation: spin 2s infinite; }").contains("reduced-motion"))
    }

    func testMotionCheckerInspectsReducedMotionDeclarationsNotJustMediaQueryPresence() {
        let css = """
            html { scroll-behavior: smooth; }
            .ticker { animation: move 5s linear infinite; animation-play-state: running; }
            @keyframes move { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
            @media (prefers-reduced-motion: reduce) { .other { color: inherit; } }
        """
        let report = NativeAccessibilityEngine.analyze(toolID: "motion-checker", input: css)
        XCTAssertTrue(report.contains("reduced-motion-incomplete"))
        XCTAssertTrue(report.contains("smooth-scroll-not-reduced"))
        XCTAssertTrue(report.contains("auto-moving-content"))
        XCTAssertTrue(report.contains("loop-without-pause"))
    }

    func testMotionCheckerFlagsFlashAndScriptMotionEvenWhenReducedMotionBlockExists() {
        let source = """
            <style>
              .orb { animation: spin 2s infinite, pulse 800ms infinite alternate; }
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes pulse { to { transform: scale(1.5); } }
              .ticker { animation: move 5s infinite; }
              @keyframes move { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
              .flash { animation-name: flash; animation-duration: 300ms; animation-iteration-count: infinite; }
              @keyframes flash { 0% { background: #ff0000; } 50% { background: #000000; } 100% { background: #ff0000; } }
              @media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
            </style>
            <script>window.addEventListener('scroll', () => { document.querySelector('.orb').style.transform = 'rotate(5deg)'; });</script>
        """
        let report = NativeAccessibilityEngine.analyze(toolID: "motion-checker", input: source)
        XCTAssertTrue(report.contains("rapid-contrast-flash"))
        XCTAssertTrue(report.contains("auto-moving-content"))
        XCTAssertTrue(report.contains("loop-without-pause"))
        XCTAssertTrue(report.contains("script-driven-motion"))
        XCTAssertTrue(report.contains("script-motion-not-preference-aware"))
        XCTAssertTrue(report.contains("competing-transform-animations"))
    }

    func testContrastAndReadabilityReturnUsefulMetrics() {
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "contrast-checker", input: "", foreground: "#000000", background: "#ffffff").contains("21.00:1"))
        XCTAssertEqual(NativeAccessibilityEngine.contrastRatio(foreground: "#000000", background: "#FFFFFF")!, 21.0, accuracy: 0.0001)
        XCTAssertEqual(NativeAccessibilityEngine.contrastRatio(foreground: "#777777", background: "#FFFFFF")!, 4.48, accuracy: 0.02)
        XCTAssertNil(NativeAccessibilityEngine.contrastRatio(foreground: "#12", background: "#FFFFFF"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "text-readability-checker", input: "This is a short sentence.").contains("Flesch Reading Ease"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "color-blindness-simulator", input: "", foreground: "#ff0000", background: "#00ff00").contains("Protanopia approximation"))
        XCTAssertTrue(NativeAccessibilityEngine.analyze(toolID: "accessible-color-generator", input: "", foreground: "#777777", background: "#ffffff").contains("Suggested foreground alternatives"))
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


    func testAriaStudioDetectsMissingNamesButAcceptsCommonNamedControls() {
        let bad = NativeAccessibilityEngine.analyze(
            toolID: "aria-checker",
            input: "<button id=\"empty-button\"></button>\n<a id=\"empty-link\" href=\"/help\"></a>\n<div id=\"custom-switch\" role=\"switch\" tabindex=\"0\"></div>"
        )
        XCTAssertTrue(bad.contains("button-name"))
        XCTAssertTrue(bad.contains("link-name"))
        XCTAssertTrue(bad.contains("custom-control-name"))
        XCTAssertTrue(bad.contains("Finding ID: env-a11y:aria/button-name/button#empty-button"))
        XCTAssertTrue(bad.contains("Finding ID: env-a11y:aria/link-name/a#empty-link"))
        XCTAssertTrue(bad.contains("Finding ID: env-a11y:aria/custom-control-name/div#custom-switch"))

        let good = NativeAccessibilityEngine.analyze(
            toolID: "aria-checker",
            input: "<button id=\"save\">Save changes</button><a href=\"/help\">Help center</a><div role=\"switch\" aria-label=\"Dark mode\" tabindex=\"0\"></div><button><img src=\"save.svg\" alt=\"Save\"></button><input type=\"submit\" value=\"Submit form\">"
        )
        XCTAssertFalse(good.contains("button-name"))
        XCTAssertFalse(good.contains("link-name"))
        XCTAssertFalse(good.contains("custom-control-name"))
        let emptyReference = NativeAccessibilityEngine.analyze(toolID: "aria-checker", input: "<span id=\"empty-label\"></span><button aria-labelledby=\"empty-label\"></button>")
        XCTAssertTrue(emptyReference.contains("button-name"))
        let validReference = NativeAccessibilityEngine.analyze(toolID: "aria-checker", input: "<span id=\"label\">Launch search</span><button aria-labelledby=\"label\"></button>")
        XCTAssertFalse(validReference.contains("button-name"))
    }

    func testAccessibilityReportsIncludeFindingIDsSourceEvidenceAndQualifiedCriteria() {
        let markup = "<main>\n  <img src=\"banner.png\">\n  <button id=\"primary-toggle\" aria-expanded=\"yes\">Open</button>\n</main>"
        let first = NativeAccessibilityEngine.analyze(toolID: "aria-checker", input: markup)
        let second = NativeAccessibilityEngine.analyze(toolID: "aria-checker", input: markup)
        XCTAssertTrue(first.contains("Finding ID: env-a11y:aria/"))
        XCTAssertTrue(first.contains("Source line: 3"))
        XCTAssertTrue(first.contains("Evidence:"))
        XCTAssertTrue(first.contains("Related WCAG criteria (review hints, not a failure verdict)"))
        XCTAssertEqual(first.components(separatedBy: "Finding ID:").dropFirst().first?.components(separatedBy: "\n").first, second.components(separatedBy: "Finding ID:").dropFirst().first?.components(separatedBy: "\n").first)
    }
