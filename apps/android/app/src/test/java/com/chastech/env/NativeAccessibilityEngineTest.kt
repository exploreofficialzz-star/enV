package com.chastech.env

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAccessibilityEngineTest {
    @Test fun detectsMissingImageAlternativeAndFilenameAlt() {
        val report = NativeAccessibilityEngine.analyze("alt-text-checker", "<img src=\"hero.jpg\"><img src=\"logo.png\" alt=\"logo.png\">")
        assertTrue(report.contains("image-alt"))
        assertTrue(report.contains("filename-alt"))
    }

    @Test fun detectsAriaAndKeyboardIssues() {
        val aria = NativeAccessibilityEngine.analyze("aria-checker", "<button role=\"pushbutton\" aria-labelledby=\"missing\"></button>")
        assertTrue(aria.contains("aria-valid-role"))
        assertTrue(aria.contains("aria-labelledby"))
        val keyboard = NativeAccessibilityEngine.analyze("keyboard-navigation-checker", "<div tabindex=\"3\" onclick=\"go()\"></div>")
        assertTrue(keyboard.contains("tabindex"))
        assertTrue(keyboard.contains("keyboard-operable"))
    }

    @Test fun detectsFormFocusAndMotionFindings() {
        assertTrue(NativeAccessibilityEngine.analyze("form-checker", "<input id=\"email\">").contains("label"))
        assertTrue(NativeAccessibilityEngine.analyze("focus-state-checker", "button:focus { outline: none; }").contains("focus-not-hidden"))
        assertTrue(NativeAccessibilityEngine.analyze("motion-checker", ".a { animation: spin 2s infinite; }").contains("reduced-motion"))
    }

    @Test fun suppliesContrastReadabilityAndKeepsAllVariantsLocal() {
        assertTrue(NativeAccessibilityEngine.analyze("contrast-checker", "", "#000000", "#ffffff").contains("21.00:1"))
        assertTrue(NativeAccessibilityEngine.analyze("text-readability-checker", "This is a short sentence.").contains("Flesch Reading Ease"))
        assertTrue(NativeAccessibilityEngine.analyze("color-blindness-simulator", "", "#ff0000", "#00ff00").contains("Protanopia approximation"))
        assertTrue(NativeAccessibilityEngine.analyze("color-blindness-simulator", "", "#ff0000", "#00ff00").contains("#"))
        assertTrue(NativeAccessibilityEngine.analyze("accessible-color-generator", "", "#777777", "#ffffff").contains("Foreground alternatives"))
        assertTrue(NativeAccessibilityEngine.analyze("line-height-checker", "", fontSize = "16px", lineHeight = "24px").contains("Ratio: 1.50"))
        assertTrue(NativeAccessibilityEngine.analyze("font-size-generator", "").contains("font-size: 1rem"))
        assertTrue(NativeAccessibilityEngine.supports("aria-simulator", "accessibility"))
        assertFalse(NativeAccessibilityEngine.supports("aria-simulator", "developer"))
    }
}
