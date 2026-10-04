package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeColorEngineTest {
    private val allIds = setOf(
        "cmyk-converter", "color-blindness-simulator", "color-builder", "color-css-generator",
        "color-generator", "palette-generator", "color-picker", "color-preset-maker", "color-preview",
        "color-svg-generator", "color-token-generator", "contrast-checker", "hsl-converter", "hsv-converter",
        "rgb-converter", "wcag-checker"
    )

    @Test fun canonicalActiveColorIdsHaveLocalOperations() {
        assertEquals(allIds, NativeColorEngine.supportedToolIds)
        assertEquals("picker", NativeColorEngine.operationForTool("rgb-converter"))
        assertEquals("palette", NativeColorEngine.operationForTool("palette-generator"))
        assertEquals("contrast", NativeColorEngine.operationForTool("wcag-checker"))
        allIds.forEach { id -> assertTrue(NativeColorEngine.run(id).output.isNotEmpty()) }
    }

    @Test fun pickerMatchesWebHexRgbHslHsvAndCmykSemantics() {
        val result = NativeColorEngine.run("rgb-converter", "#0d9f8a")
        assertEquals("#0d9f8a", result.hex)
        assertEquals(NativeColorEngine.Rgb(13, 159, 138), result.rgb)
        assertEquals("HEX: #0d9f8a\nRGB: 13, 159, 138\nHSL: 171°, 85%, 34%\nHSV/HSB: 171°, 85%, 62%\nCMYK: 92 / 0 / 13 / 38", result.output)
    }

    @Test fun threeDigitHexAndPaletteAreLocalAndDeterministic() {
        val result = NativeColorEngine.run("color-generator", "#abc")
        assertEquals("#aabbcc", result.hex)
        assertEquals(8, result.palette.size)
        assertEquals("#aabbcc", result.palette.first())
        assertTrue(result.output.contains("PALETTE: #aabbcc"))
    }

    @Test fun contrastUsesWcagRelativeLuminanceAndThresholds() {
        val result = NativeColorEngine.run("contrast-checker", foreground = "#000000", background = "#ffffff")
        assertEquals(21.0, result.contrastRatio!!, 0.0001)
        assertTrue(result.passesAA!!); assertTrue(result.passesAAA!!)
        assertEquals("Contrast ratio 21.00:1\nAA pass · AAA pass", result.output)
    }

    @Test(expected = IllegalArgumentException::class)
    fun invalidColorIsNotSilentlyAccepted() { NativeColorEngine.run("color-picker", "#12xz89") }
}
