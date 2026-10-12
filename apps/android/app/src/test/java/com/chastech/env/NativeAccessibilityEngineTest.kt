package com.chastech.env

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAccessibilityEngineTest {
    @Test fun colorVisionStudioProvidesFourLabeledApproximationPairs() {
        val pairs = NativeAccessibilityEngine.colorVisionPreviewPairs("#cc3322", "#ffffff")
        assertEquals(4, pairs.size)
        assertTrue(pairs.any { it.label.contains("Protanopia") })
        assertTrue(pairs.any { it.label.contains("Achromatopsia") })
        assertTrue(pairs.all { it.foreground.startsWith("#") && it.background.startsWith("#") })
    }

    @Test fun detectsMissingImageAlternativeAndFilenameAlt() {
        val report = NativeAccessibilityEngine.analyze("alt-text-checker", "<img src=\"hero.jpg\"><img src=\"logo.png\" alt=\"logo.png\">")
        assertTrue(report.contains("image-alt"))
        assertTrue(report.contains("filename-alt"))
    }

    @Test fun detectsAriaAndKeyboardIssues() {
        val aria = NativeAccessibilityEngine.analyze("aria-checker", "<button role=\"pushbutton\" aria-labelledby=\"missing\"></button>")
        assertTrue(aria.contains("aria-valid-role"))
        assertTrue(aria.contains("aria-labelledby"))
        val keyboard = NativeAccessibilityEngine.analyze("keyboard-navigation-checker", "<div tabindex=\"3\"></div><div tabindex=\"0\" onclick=\"go()\"></div><div onclick=\"go()\"></div>")
        assertTrue(keyboard.contains("tabindex"))
        assertTrue(keyboard.contains("keyboard-operable"))
    }

    @Test fun catchesInvalidAriaNamesReferencesAndStateValues() {
        val report = NativeAccessibilityEngine.analyze(
            "aria-checker",
            "<div aria-label='Loading'></div><button aria-expanded='yes' aria-controls='missing' aria-invalid=''>Open</button>"
        )
        assertTrue(report.contains("aria-prohibited-attr"))
        assertTrue(report.contains("aria-value-expanded"))
        assertTrue(report.contains("aria-reference"))
        assertTrue(report.contains("aria-value-invalid"))
    }

    @Test fun catchesBrokenFormLabelsAndCustomButtonKeyboardActivation() {
        val form = NativeAccessibilityEngine.analyze(
            "form-checker",
            "<label for='missing'>Email</label><input id='email' aria-invalid='true' aria-describedby='error-missing'>"
        )
        assertTrue(form.contains("label-reference"))
        assertTrue(form.contains("error-description-reference"))
        val keyboard = NativeAccessibilityEngine.analyze(
            "keyboard-navigation-checker",
            "<div role='button' tabindex='0' onclick='save()'>Save</div>"
        )
        assertTrue(keyboard.contains("custom-button-keyboard-activation"))
    }


    @Test fun keyboardStudioFlagsExplicitlyUndersizedTargetsAsReviewLeads() {
        val inline = NativeAccessibilityEngine.analyze("keyboard-navigation-checker", "<button id='tiny' style='width:18px;height:20px'>X</button>")
        assertTrue(inline.contains("target-size-risk"))
        assertTrue(inline.contains("2.5.8 Target Size (Minimum)"))
        val css = NativeAccessibilityEngine.analyze("keyboard-navigation-checker", "<style>.icon-button { width: 20px; }</style><button class='icon-button'>Open</button>")
        assertTrue(css.contains("target-size-risk"))
    }

    @Test fun detectsFormFocusAndMotionFindings() {
        assertTrue(NativeAccessibilityEngine.analyze("form-checker", "<input id=\"email\">").contains("label"))
        assertTrue(NativeAccessibilityEngine.analyze("focus-state-checker", "button:focus { outline: none; }").contains("focus-not-hidden"))
        assertTrue(NativeAccessibilityEngine.analyze("motion-checker", ".a { animation: spin 2s infinite; }").contains("reduced-motion"))
    }

    @Test fun motionCheckerDoesNotTrustMediaQueryPresenceAlone() {
        val css = """
            html { scroll-behavior: smooth; }
            .ticker { animation: move 5s linear infinite; animation-play-state: running; }
            @keyframes move { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
            @media (prefers-reduced-motion: reduce) { .other { color: inherit; } }
        """.trimIndent()
        val report = NativeAccessibilityEngine.analyze("motion-checker", css)
        assertTrue(report.contains("reduced-motion-incomplete"))
        assertTrue(report.contains("smooth-scroll-not-reduced"))
        assertTrue(report.contains("auto-moving-content"))
        assertTrue(report.contains("loop-without-pause"))
    }

    @Test fun motionCheckerFlagsFlashingAndScriptDrivenMotionIndependently() {
        val source = """
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
        """.trimIndent()
        val report = NativeAccessibilityEngine.analyze("motion-checker", source)
        assertTrue(report.contains("rapid-contrast-flash"))
        assertTrue(report.contains("auto-moving-content"))
        assertTrue(report.contains("loop-without-pause"))
        assertTrue(report.contains("script-driven-motion"))
        assertTrue(report.contains("script-motion-not-preference-aware"))
        assertTrue(report.contains("competing-transform-animations"))
    }

    @Test fun suppliesContrastReadabilityAndKeepsAllVariantsLocal() {
        assertTrue(NativeAccessibilityEngine.analyze("contrast-checker", "", "#000000", "#ffffff").contains("21.00:1"))
        assertTrue(NativeAccessibilityEngine.analyze("text-readability-checker", "This is a short sentence.").contains("Flesch Reading Ease"))
        assertTrue(NativeAccessibilityEngine.analyze("color-blindness-simulator", "", "#ff0000", "#00ff00").contains("Protanopia approximation"))
        assertTrue(NativeAccessibilityEngine.analyze("color-blindness-simulator", "", "#ff0000", "#00ff00").contains("#"))
        assertTrue(NativeAccessibilityEngine.analyze("accessible-color-generator", "", "#777777", "#ffffff").contains("Foreground alternatives"))
        assertTrue(NativeAccessibilityEngine.analyze("line-height-checker", "", fontSize = "16px", lineHeight = "24px").contains("Ratio: 1.50"))
        assertTrue(NativeAccessibilityEngine.analyze("font-size-generator", "").contains("--type-body: clamp"))
        assertTrue(NativeAccessibilityEngine.supports("aria-simulator", "accessibility"))
        assertFalse(NativeAccessibilityEngine.supports("aria-simulator", "developer"))
    }

    @Test fun accessibilityActionsHaveDistinctJobs() {
        val markup = "<img src=\"hero.jpg\" alt=\"A person using a laptop\"><img src=\"logo.png\">"
        val helper = NativeAccessibilityEngine.analyze("alt-text-helper", "Volunteer registers visitors at an event")
        val preview = NativeAccessibilityEngine.analyze("alt-text-preview", markup)
        val simulator = NativeAccessibilityEngine.analyze("alt-text-simulator", markup)
        assertTrue(helper.contains("WRITING COACH"))
        assertTrue(preview.contains("SCREEN-READER ANNOUNCEMENT PREVIEW"))
        assertTrue(preview.contains("Image: A person using a laptop"))
        assertTrue(simulator.contains("BULK ALT-TEXT TRIAGE"))
        assertTrue(simulator.contains("SERIOUS · Missing alt"))
        assertFalse(helper == preview || preview == simulator || helper == simulator)
        assertTrue(NativeAccessibilityEngine.analyze("aria-simulator", "<button aria-label=\"Save\">Save</button>").contains("KEYBOARD + ASSISTIVE-TECHNOLOGY WALKTHROUGH"))
    }

    @Test fun focusGeneratorUsesUserOptionsAndModernModes() {
        val css = NativeAccessibilityEngine.analyze("focus-state-generator", "", "#005fcc", "#ffd54f", focusWidth = "4px", focusOffset = "5px")
        assertTrue(css.contains("outline: 4px solid #005fcc"))
        assertTrue(css.contains("outline-offset: 5px"))
        assertTrue(css.contains("forced-colors: active"))
        assertTrue(css.contains("prefers-color-scheme: dark"))
    }

    @Test fun ariaGeneratorProducesSelectedPattern() {
        assertTrue(NativeAccessibilityEngine.analyze("aria-generator", "disclosure").contains("aria-expanded=\"false\""))
        assertTrue(NativeAccessibilityEngine.analyze("aria-generator", "tabs").contains("role=\"tablist\""))
    }

    @Test fun readabilityActionsProduceQualifiedSimplificationDrafts() {
        val source = "We will utilize this assistance in order to make a decision."
        val generated = NativeAccessibilityEngine.analyze("text-readability-generator", source)
        val helper = NativeAccessibilityEngine.analyze("text-readability-helper", source)
        assertTrue(generated.contains("Suggested wording:"))
        assertTrue(generated.contains("use this help to decide"))
        assertTrue(helper.contains("READABILITY COACH"))
        assertTrue(helper.contains("Flesch Reading Ease"))
    }
}


    @Test fun ariaStudioDetectsMissingNamesButAcceptsCommonNamedControls() {
        val bad = NativeAccessibilityEngine.analyze(
            "aria-checker",
            "<button id=\"empty-button\"></button>\n<a id=\"empty-link\" href=\"/help\"></a>\n<div id=\"custom-switch\" role=\"switch\" tabindex=\"0\"></div>"
        )
        assertTrue(bad.contains("button-name"))
        assertTrue(bad.contains("link-name"))
        assertTrue(bad.contains("custom-control-name"))
        assertTrue(bad.contains("Finding ID: env-a11y:aria/button-name/button#empty-button"))
        assertTrue(bad.contains("Finding ID: env-a11y:aria/link-name/a#empty-link"))
        assertTrue(bad.contains("Finding ID: env-a11y:aria/custom-control-name/div#custom-switch"))

        val good = NativeAccessibilityEngine.analyze(
            "aria-checker",
            "<button id=\"save\">Save changes</button><a href=\"/help\">Help center</a><div role=\"switch\" aria-label=\"Dark mode\" tabindex=\"0\"></div><button><img src=\"save.svg\" alt=\"Save\"></button><input type=\"submit\" value=\"Submit form\">"
        )
        assertFalse(Regex("button-name|link-name|custom-control-name").containsMatchIn(good))
        val emptyReference = NativeAccessibilityEngine.analyze("aria-checker", "<span id=\"empty-label\"></span><button aria-labelledby=\"empty-label\"></button>")
        assertTrue(emptyReference.contains("button-name"))
        val validReference = NativeAccessibilityEngine.analyze("aria-checker", "<span id=\"label\">Launch search</span><button aria-labelledby=\"label\"></button>")
        assertFalse(validReference.contains("button-name"))
    }

    @Test fun accessibilityReportsIncludeStableFindingIdsAndEvidence() {
        val markup = "<main>\n  <img src=\"banner.png\">\n  <button id=\"primary-toggle\" aria-expanded=\"yes\">Open</button>\n</main>"
        val first = NativeAccessibilityEngine.analyze("aria-checker", markup)
        val second = NativeAccessibilityEngine.analyze("aria-checker", markup)
        assertTrue(first.contains("Finding ID: env-a11y:aria/"))
        assertTrue(first.contains("Source line: 3"))
        assertTrue(first.contains("Evidence:"))
        assertTrue(first.contains("Related WCAG criteria (review hints, not a failure verdict)"))
        assertTrue(first.substringAfter("Finding ID:").substringBefore("\n") == second.substringAfter("Finding ID:").substringBefore("\n"))
    }
