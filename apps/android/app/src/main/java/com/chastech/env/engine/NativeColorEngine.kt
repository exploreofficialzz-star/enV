package com.chastech.env.engine

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Pure Kotlin implementation of the canonical color engine operations. */
object NativeColorEngine {
    private val idToOperation = linkedMapOf(
        "cmyk-converter" to "picker",
        "color-blindness-simulator" to "picker",
        "color-builder" to "palette",
        "color-css-generator" to "picker",
        "color-generator" to "palette",
        "palette-generator" to "palette",
        "color-picker" to "picker",
        "color-preset-maker" to "picker",
        "color-preview" to "picker",
        "color-svg-generator" to "picker",
        "color-token-generator" to "picker",
        "contrast-checker" to "contrast",
        "hsl-converter" to "picker",
        "hsv-converter" to "picker",
        "rgb-converter" to "picker",
        "wcag-checker" to "contrast"
    )

    data class Rgb(val r: Int, val g: Int, val b: Int)
    data class Hsl(val h: Double, val s: Double, val l: Double)
    data class Cmyk(val c: Double, val m: Double, val y: Double, val k: Double)
    data class ColorResult(
        val output: String,
        val hex: String? = null,
        val rgb: Rgb? = null,
        val hsl: Hsl? = null,
        val hsv: Hsl? = null,
        val cmyk: Cmyk? = null,
        val palette: List<String> = emptyList(),
        val contrastRatio: Double? = null,
        val passesAA: Boolean? = null,
        val passesAAA: Boolean? = null
    )

    val supportedToolIds: Set<String> get() = idToOperation.keys
    fun operationForTool(id: String): String? = idToOperation[id]

    /**
     * Runs the operation selected by a canonical tool ID. Picker/palette input is a
     * six- or three-digit hexadecimal color. Contrast uses foreground/background.
     */
    fun run(
        toolId: String,
        input: String = "#0d9f8a",
        foreground: String = "#16181d",
        background: String = "#ffffff"
    ): ColorResult {
        val operation = idToOperation[toolId] ?: throw IllegalArgumentException("Unknown color tool: $toolId")
        return when (operation) {
            "contrast" -> contrastResult(foreground, background)
            "picker", "palette" -> pickerResult(input, includePalette = operation == "palette")
            else -> error("Unknown color operation: $operation")
        }
    }

    fun parseHex(value: String): Rgb {
        val raw = value.trim().removePrefix("#")
        val expanded = when (raw.length) {
            3 -> raw.map { "$it$it" }.joinToString("")
            6 -> raw
            else -> throw IllegalArgumentException("Enter a 3- or 6-digit hex color.")
        }
        if (!expanded.matches(Regex("[0-9a-fA-F]{6}"))) {
            throw IllegalArgumentException("Enter a 3- or 6-digit hex color.")
        }
        return Rgb(expanded.substring(0, 2).toInt(16), expanded.substring(2, 4).toInt(16), expanded.substring(4, 6).toInt(16))
    }

    fun toHex(rgb: Rgb): String = "#${hexByte(rgb.r)}${hexByte(rgb.g)}${hexByte(rgb.b)}"

    fun rgbToHsl(rgb: Rgb): Hsl {
        val r = rgb.r / 255.0; val g = rgb.g / 255.0; val b = rgb.b / 255.0
        val hi = max(r, max(g, b)); val lo = min(r, min(g, b)); val d = hi - lo
        val l = (hi + lo) / 2.0
        if (d == 0.0) return Hsl(0.0, 0.0, l * 100.0)
        val s = d / if (l > 0.5) 2.0 - hi - lo else hi + lo
        val h = when (hi) {
            r -> (g - b) / d + if (g < b) 6.0 else 0.0
            g -> (b - r) / d + 2.0
            else -> (r - g) / d + 4.0
        } / 6.0
        return Hsl(h * 360.0, s * 100.0, l * 100.0)
    }

    fun hslToRgb(hsl: Hsl): Rgb {
        var h = (hsl.h % 360.0) / 360.0
        if (h < 0) h += 1.0
        val s = hsl.s / 100.0; val l = hsl.l / 100.0
        if (s == 0.0) { val v = roundByte(l * 255.0); return Rgb(v, v, v) }
        val q = if (l < 0.5) l * (1 + s) else l + s - l * s
        val p = 2 * l - q
        fun hue(t0: Double): Double {
            var t = t0
            if (t < 0) t += 1
            if (t > 1) t -= 1
            return when {
                t < 1.0 / 6.0 -> p + (q - p) * 6 * t
                t < 1.0 / 2.0 -> q
                t < 2.0 / 3.0 -> p + (q - p) * (2.0 / 3.0 - t) * 6
                else -> p
            }
        }
        return Rgb(roundByte(hue(h + 1.0 / 3.0) * 255), roundByte(hue(h) * 255), roundByte(hue(h - 1.0 / 3.0) * 255))
    }

    fun cmyk(rgb: Rgb): Cmyk {
        val r = rgb.r / 255.0; val g = rgb.g / 255.0; val b = rgb.b / 255.0
        val k = 1.0 - max(r, max(g, b))
        if (k == 1.0) return Cmyk(0.0, 0.0, 0.0, 100.0)
        return Cmyk((1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100)
    }

    fun contrastRatio(foreground: Rgb, background: Rgb): Double {
        val a = luminance(foreground); val b = luminance(background)
        val hi = max(a, b); val lo = min(a, b)
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun pickerResult(value: String, includePalette: Boolean): ColorResult {
        val rgb = parseHex(value); val hsl = rgbToHsl(rgb); val hsv = Hsl(hsl.h, hsl.s, max(rgb.r, max(rgb.g, rgb.b)) / 255.0 * 100.0); val cmyk = cmyk(rgb)
        val palette = if (includePalette) palette(hsl) else emptyList()
        val lines = mutableListOf(
            "HEX: ${toHex(rgb)}",
            "RGB: ${rgb.r}, ${rgb.g}, ${rgb.b}",
            "HSL: ${rounded(hsl.h)}°, ${rounded(hsl.s)}%, ${rounded(hsl.l)}%",
            "HSV/HSB: ${rounded(hsv.h)}°, ${rounded(hsv.s)}%, ${rounded(hsv.l)}%",
            "CMYK: ${rounded(cmyk.c)} / ${rounded(cmyk.m)} / ${rounded(cmyk.y)} / ${rounded(cmyk.k)}"
        )
        if (includePalette) lines += "PALETTE: ${palette.joinToString(", ")}"
        return ColorResult(lines.joinToString("\n"), toHex(rgb), rgb, hsl, hsv, cmyk, palette)
    }

    private fun contrastResult(foreground: String, background: String): ColorResult {
        val fg = parseHex(foreground); val bg = parseHex(background); val ratio = contrastRatio(fg, bg); val aa = ratio >= 4.5; val aaa = ratio >= 7.0
        return ColorResult("Contrast ratio ${"%.2f".format(java.util.Locale.ROOT, ratio)}:1\nAA ${if (aa) "pass" else "fail"} · AAA ${if (aaa) "pass" else "fail"}", contrastRatio = ratio, passesAA = aa, passesAAA = aaa)
    }

    private fun palette(base: Hsl): List<String> = listOf(0.0, 30.0, 60.0, 120.0, 180.0, 210.0, 240.0, 300.0).map { offset -> toHex(hslToRgb(Hsl((base.h + offset) % 360.0, base.s, base.l))) }
    private fun luminance(rgb: Rgb): Double {
        fun linear(v: Int): Double { val x = v / 255.0; return if (x <= 0.03928) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4) }
        return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
    }
    private fun roundByte(value: Double): Int = min(255, max(0, kotlin.math.floor(value + 0.5).toInt()))
    private fun rounded(value: Double): String = kotlin.math.floor(value + 0.5).toInt().toString()
    private fun hexByte(value: Int): String = roundByte(value.toDouble()).toString(16).padStart(2, '0')
}
