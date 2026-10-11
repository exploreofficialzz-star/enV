package com.chastech.env

import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Local, deterministic WCAG-oriented checks for Android. Static snippets are not conformance certification. */
object NativeAccessibilityEngine {
    private val actions = listOf("checker", "generator", "helper", "preview", "simulator")
    private val roles = setOf("alert", "alertdialog", "application", "article", "banner", "button", "checkbox", "combobox", "complementary", "contentinfo", "dialog", "form", "grid", "heading", "img", "link", "list", "listbox", "main", "menu", "navigation", "option", "progressbar", "radio", "region", "search", "slider", "status", "switch", "tab", "tabpanel", "textbox", "toolbar", "tree", "treeitem")
    private val tagPattern = Regex("<([a-zA-Z][\\w:-]*)\\b([^<>]*)>")
    private val attrPattern = Regex("([^\\s=/>]+)(?:\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+)))?")

    data class Element(val tag: String, val attrs: Map<String, String>, val source: String)
    data class Finding(val severity: String, val rule: String, val message: String, val target: String, val fix: String)

    fun supports(toolId: String, category: String): Boolean = category == "accessibility" && toolId.isNotBlank()
    fun kind(toolId: String): String = actions.firstOrNull { toolId.endsWith("-$it") }?.let { toolId.removeSuffix("-$it") } ?: toolId

    fun analyze(toolId: String, markup: String, foreground: String = "#000000", background: String = "#ffffff", fontSize: String = "16px", lineHeight: String = "1.5"): String {
        val kind = kind(toolId)
        val action = actions.firstOrNull { toolId.endsWith("-$it") } ?: "checker"
        if (toolId.endsWith("-generator")) return generator(kind, foreground, background)
        if (action == "helper") return "${helperGuide(kind)}\n\n${analyze(toolId.removeSuffix("-helper") + "-checker", markup, foreground, background, fontSize, lineHeight)}"
        if (action == "preview") return preview(kind, markup, foreground, background, fontSize, lineHeight)
        if (action == "simulator") return simulator(kind, markup, foreground, background, fontSize, lineHeight)
        if (kind == "contrast" || kind == "accessible-color") return contrastReport(kind, foreground, background, toolId.endsWith("-generator"))
        if (kind == "color-blindness") return colorVisionReport(foreground, background)
        if (kind == "font-size") {
            val px = cssPixels(fontSize)
            if (toolId.endsWith("-generator")) return "FONT SIZE CSS STARTER\n\nbody {\n  font-size: 1rem; /* 16 CSS px starting point */\n  line-height: 1.5;\n}\n\nUse relative units where appropriate. Verify user resizing, 200% zoom, and reflow; 16px is guidance, not a WCAG conformance threshold."
            return "FONT SIZE REVIEW\nInput: $fontSize\nEquivalent: ${px?.let { String.format(Locale.US, "%.2fpx", it) } ?: "invalid unit"}\n\n${if (px != null && px >= 16) "At least 16 CSS px; still test 200% zoom and reflow." else "Consider a larger body-text size and verify text resizing to 200%."}"
        }
        if (kind == "line-height") {
            val size = cssPixels(fontSize)
            val raw = lineHeight.trim().removeSuffix("px").toDoubleOrNull()
            val ratio = if (lineHeight.trim().endsWith("px", true)) { if (size != null && raw != null) raw / size else null } else raw
            if (toolId.endsWith("-generator")) return "LINE HEIGHT CSS STARTER\n\nbody {\n  font-size: 1rem;\n  line-height: 1.5;\n}\n\nPrefer a unitless ratio that scales with the font. Test text-spacing overrides and 200% zoom."
            return "LINE HEIGHT REVIEW\nFont size: $fontSize\nLine height: $lineHeight\nRatio: ${ratio?.let { String.format(Locale.US, "%.2f", it) } ?: "invalid"}\n\n${if (ratio != null && ratio >= 1.5) "At least 1.5×; confirm users can override spacing without clipping." else "Consider line-height of 1.5× or greater and test text-spacing overrides."}"
        }
        if (kind == "text-readability") return readability(markup)
        val elements = parse(markup)
        val findings = mutableListOf<Finding>()
        val ids = elements.mapNotNull { it.attrs["id"]?.takeIf(String::isNotBlank) }
        val idSet = ids.toSet()
        val duplicates = ids.groupingBy { it }.eachCount().filterValues { it > 1 }.keys
        fun add(severity: String, rule: String, message: String, target: String, fix: String) { findings += Finding(severity, rule, message, target, fix) }
        when (kind) {
            "alt-text" -> {
                elements.filter { it.tag == "img" || (it.tag == "input" && it.attrs["type"]?.equals("image", true) == true) }.forEach { e ->
                    val alt = e.attrs["alt"]
                    if (alt == null) add("SERIOUS", "image-alt", "Image has no alt attribute.", target(e), "Add concise alt text, or alt=\"\" only when decorative.")
                    else if (alt.matches(Regex("(?i).*\\.(png|jpe?g|gif|webp|svg)$"))) add("MODERATE", "filename-alt", "Alt appears to be a filename.", target(e), "Describe the image's meaning or function in context.")
                    else if (alt.isBlank()) add("MINOR", "decorative-image", "Empty alt marks this image decorative; confirm that is correct.", target(e), "Keep empty alt only for decorative images.")
                }
            }
            "aria" -> {
                elements.forEach { e ->
                    val role = e.attrs["role"]?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.lowercase()
                    if (role != null && role !in roles) add("SERIOUS", "aria-valid-role", "Unknown ARIA role '$role'.", target(e), "Use a valid WAI-ARIA role or native HTML semantics.")
                    if (e.attrs.containsKey("aria-label") && e.attrs["aria-label"].isNullOrBlank()) add("MODERATE", "aria-label", "aria-label is empty.", target(e), "Give the control a name or remove the empty attribute.")
                    e.attrs["aria-labelledby"]?.split(Regex("\\s+"))?.filter(String::isNotBlank)?.filterNot(idSet::contains)?.forEach { missing -> add("SERIOUS", "aria-labelledby", "aria-labelledby references missing id '$missing'.", target(e), "Reference an existing, unique id.") }
                    if (e.attrs["aria-hidden"] == "true" && (e.tag in setOf("a", "button", "input", "select", "textarea") || e.attrs.containsKey("tabindex"))) add("SERIOUS", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", target(e), "Remove aria-hidden or make the entire hidden subtree non-interactive.")
                }
                duplicates.forEach { add("SERIOUS", "duplicate-id", "The id '$it' is duplicated.", "#$it", "Make ids unique so accessible-name references resolve correctly.") }
            }
            "form" -> {
                val labels = elements.filter { it.tag == "label" }.mapNotNull { it.attrs["for"] }.toSet()
                elements.filter { it.tag in setOf("input", "select", "textarea") && it.attrs["type"] !in setOf("hidden", "submit", "button", "reset") }.forEach { e ->
                    val id = e.attrs["id"]
                    if (e.attrs["aria-label"].isNullOrBlank() && e.attrs["aria-labelledby"].isNullOrBlank() && (id == null || id !in labels)) add("SERIOUS", "label", "Form control has no detectable explicit label.", target(e), "Associate a visible label using for/id, or provide aria-label/aria-labelledby.")
                    if (e.attrs["aria-invalid"] == "true" && e.attrs["aria-describedby"].isNullOrBlank()) add("MODERATE", "error-description", "Invalid control has no error-description reference.", target(e), "Connect readable error text with aria-describedby.")
                }
            }
            "keyboard-navigation" -> {
                elements.forEach { e ->
                    val tab = e.attrs["tabindex"]?.toIntOrNull()
                    if (tab != null && tab > 0) add("MODERATE", "tabindex", "Positive tabindex can create a confusing focus order.", target(e), "Use natural DOM order and avoid tabindex values above zero.")
                    if (e.tag in setOf("div", "span", "li") && e.attrs.containsKey("onclick") && e.attrs["role"].isNullOrBlank() && e.attrs["tabindex"].isNullOrBlank()) add("SERIOUS", "keyboard-operable", "Click-only non-interactive element may not be keyboard operable.", target(e), "Prefer a native button/link; otherwise provide keyboard support and focusability.")
                }
                if (!Regex(":focus(?:-visible)?", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("MODERATE", "visible-focus", "No focus indicator rule was found in this snippet.", "CSS", "Provide a clearly visible :focus-visible indicator and test it in context.")
            }
            "focus-state" -> {
                val focusRules = Regex("[^{}]*:focus(?:-visible)?[^{}]*\\{[^}]*\\}", RegexOption.IGNORE_CASE).findAll(markup).map { it.value }.toList()
                if (focusRules.isEmpty()) add("SERIOUS", "focus-visible", "No :focus or :focus-visible rule was found.", "CSS", "Add a visible :focus-visible indicator with sufficient contrast and offset.")
                focusRules.filter { Regex("outline\\s*:\\s*(none|0)", RegexOption.IGNORE_CASE).containsMatchIn(it) && !Regex("(box-shadow|border)\\s*:\\s*(?!none|0)", RegexOption.IGNORE_CASE).containsMatchIn(it) }.forEach { add("SERIOUS", "focus-not-hidden", "Focus outline is removed without a replacement.", it.substringBefore("{").trim(), "Keep the outline or add a clearly visible replacement indicator.") }
            }
            "motion" -> {
                val animated = Regex("animation(?:-name)?\\s*:|@keyframes|transition\\s*:", RegexOption.IGNORE_CASE).containsMatchIn(markup)
                if (animated && !Regex("prefers-reduced-motion\\s*:\\s*reduce", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("SERIOUS", "reduced-motion", "Motion CSS has no reduced-motion path.", "CSS motion", "Respect prefers-reduced-motion and remove non-essential animation.")
                if (Regex("<marquee|blink\\s*\\(", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("SERIOUS", "flashing-motion", "Blinking or marquee-style content was found.", "animated content", "Remove it or provide safe controls and ensure it cannot exceed safe flash thresholds.")
            }
            else -> {
                add("MINOR", "scope", "Use a focused checker for markup findings.", kind, "Choose the corresponding checker and paste the relevant source snippet.")
            }
        }
        val ordered = findings.sortedWith(compareBy<Finding> { severityOrder(it.severity) }.thenBy { it.rule })
        val details = if (ordered.isEmpty()) "No matching issues were detected in the supplied snippet. A clean snippet is not proof of conformance." else ordered.mapIndexed { i, f -> "${i + 1}. [${f.severity}] ${f.rule}: ${f.message}\n   Target: ${f.target}\n   Fix: ${f.fix}" }.joinToString("\n")
        return "${kind.uppercase(Locale.US)} LOCAL REVIEW\nElements inspected: ${elements.size}\nFindings: ${ordered.size} (critical: 0 · serious: ${ordered.count { it.severity == "SERIOUS" }} · moderate: ${ordered.count { it.severity == "MODERATE" }} · minor: ${ordered.count { it.severity == "MINOR" }})\n\n$details\n\nScope: Static snippet checks only. This does not inspect a live page or accessibility tree, test assistive technology, or certify WCAG conformance. Manually verify keyboard and screen-reader behavior."
    }

    private fun helperGuide(kind: String) = when (kind) {
        "alt-text" -> "WRITING COACH · Describe the image's purpose in context. Keep essential meaning, omit decorative detail, and use alt=\"\" only for decorative images."
        "aria" -> "ARIA MISTAKE FIXER · Prefer native HTML. Give each interactive control a name, keep referenced IDs unique, and expose accurate state; do not add redundant roles."
        "form" -> "FORM FIXER · Pair every field with a visible label, associate errors with the field, explain how to correct them, and preserve keyboard focus."
        "keyboard-navigation" -> "KEYBOARD FIXER · Use native controls, natural DOM order, visible focus, and no positive tabindex or keyboard traps."
        "focus-state" -> "FOCUS FIXER · Keep a high-contrast, unclipped focus indicator for keyboard users; check sticky content and forced-colors modes."
        "motion" -> "MOTION FIXER · Respect reduced-motion preferences, remove non-essential movement, and preserve essential status/feedback."
        "contrast", "accessible-color" -> "GUIDED COLOR FIXER · Change one color at a time, retain the intended hue where possible, then verify the target in its real text/UI context."
        "font-size", "line-height" -> "TYPE FIXER · Prefer scalable units; verify 200% text resize, 400% zoom/reflow, and user text-spacing overrides without clipping."
        "text-readability" -> "READABILITY COACH · Break up long sentences, explain specialist terms, use descriptive headings, and test wording with intended readers."
        else -> "ACCESSIBILITY FIXER · Apply one change at a time and verify with keyboard and assistive technology."
    }

    private fun preview(kind: String, input: String, foreground: String, background: String, fontSize: String, lineHeight: String): String = when (kind) {
        "alt-text" -> screenReaderPreview(input)
        "aria" -> "ACCESSIBILITY TREE PREVIEW\n${analyze("aria-checker", input)}\n\nInspect the actual browser accessibility tree and test with a screen reader; static markup cannot resolve every computed name/state."
        "contrast", "accessible-color" -> contrastReport(kind, foreground, background)
        "color-blindness" -> colorVisionReport(foreground, background)
        "font-size" -> "TEXT PREVIEW · 200% RESIZE\nInput size: $fontSize\nCompare line wrapping, clipping, and overlap at 200% and 400% zoom."
        "line-height" -> "TEXT SPACING PREVIEW\nFont size: $fontSize · line-height: $lineHeight\nAlso test WCAG text-spacing overrides: 1.5× line height, 2× paragraph spacing, 0.12× letter spacing, and 0.16× word spacing."
        "text-readability" -> "BEFORE / REVIEW\n${readability(input)}\n\nThis preview reports estimates; it does not automatically rewrite the text."
        else -> "INTERACTIVE PREVIEW\n${analyze("${kind}-checker", input, foreground, background, fontSize, lineHeight)}"
    }

    private fun simulator(kind: String, input: String, foreground: String, background: String, fontSize: String, lineHeight: String): String = when (kind) {
        "color-blindness" -> colorVisionReport(foreground, background)
        "contrast", "accessible-color" -> contrastReport(kind, foreground, background, true)
        "keyboard-navigation", "focus-state", "aria", "form" -> "KEYBOARD + ASSISTIVE-TECHNOLOGY WALKTHROUGH\n1. Tab forward and Shift+Tab backward through every control.\n2. Confirm focus is visible and order is logical.\n3. Activate with Enter/Space; close dismissible UI with Escape.\n4. Check names, roles, values, and errors with a screen reader.\n\n${analyze("${kind}-checker", input, foreground, background, fontSize, lineHeight)}"
        "font-size", "line-height" -> "ZOOM SIMULATION CHECKLIST\nAt 200% text resize and 400% viewport zoom, inspect clipping, overlap, horizontal scrolling, and control reachability.\n\n${preview(kind, input, foreground, background, fontSize, lineHeight)}"
        "motion" -> "REDUCED-MOTION SIMULATION\nEnable the operating-system reduced-motion setting. Confirm non-essential transitions stop while feedback, loading state, and meaning remain available.\n\n${analyze("motion-checker", input)}"
        else -> "SIMULATION GUIDE\nThis local static preview cannot reproduce an individual user's assistive technology. Test the supplied example with real devices and users.\n\n${analyze("${kind}-checker", input, foreground, background, fontSize, lineHeight)}"
    }

    private fun screenReaderPreview(input: String): String {
        val announcements = Regex("""<img\b[^>]*>""", RegexOption.IGNORE_CASE).findAll(input).map { match ->
            val tag = match.value
            val alt = Regex("""\balt\s*=\s*["']([^"']*)["']""", RegexOption.IGNORE_CASE).find(tag)?.groupValues?.get(1)
            when {
                alt == null -> "Image (missing alternative)"
                alt.isBlank() -> "Decorative image (not announced)"
                else -> "Image: $alt"
            }
        }.toList()
        val body = announcements.joinToString("\n").ifBlank { "Paste image markup to preview announcements." }
        return "SCREEN-READER ANNOUNCEMENT PREVIEW\n$body\n\nIllustrative text only; actual announcements vary by screen reader and context."
    }

    private fun parse(markup: String): List<Element> = tagPattern.findAll(markup.replace(Regex("<!--[\\s\\S]*?-->"), "")).map { match ->
        val attrs = attrPattern.findAll(match.groupValues[2]).associate { a ->
            a.groupValues[1].lowercase() to (a.groupValues[2].ifEmpty { a.groupValues[3].ifEmpty { a.groupValues[4] } })
        }
        Element(match.groupValues[1].lowercase(), attrs, match.value)
    }.toList()

    private fun target(element: Element) = "<${element.tag}${element.attrs["id"]?.let { "#$it" } ?: ""}>"
    private fun severityOrder(value: String) = when (value) { "CRITICAL" -> 0; "SERIOUS" -> 1; "MODERATE" -> 2; else -> 3 }
    private fun cssPixels(value: String): Double? = when { value.trim().endsWith("rem") -> value.trim().removeSuffix("rem").toDoubleOrNull()?.times(16); value.trim().endsWith("px") -> value.trim().removeSuffix("px").toDoubleOrNull(); else -> value.trim().toDoubleOrNull() }

    private fun contrastReport(kind: String, fg: String, bg: String, suggestions: Boolean = false): String {
        val a = rgb(fg) ?: return "Enter a valid #RRGGBB foreground color."
        val b = rgb(bg) ?: return "Enter a valid #RRGGBB background color."
        val la = luminance(a); val lb = luminance(b)
        val ratio = (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
        val alternatives = if (suggestions) listOf("#000000", "#ffffff", "#1f2937", "#334155", "#0f766e", "#7f1d1d", "#1d4ed8").mapNotNull { color ->
            val candidate = rgb(color) ?: return@mapNotNull null
            val candidateLum = luminance(candidate)
            val candidateRatio = (max(candidateLum, lb) + 0.05) / (min(candidateLum, lb) + 0.05)
            if (candidateRatio >= 4.5) "$color — ${String.format(Locale.US, "%.2f:1", candidateRatio)}" else null
        }.distinct().take(5).joinToString("\n").ifBlank { "No candidate in the built-in palette reached 4.5:1; adjust foreground or background." } else ""
        return "$kind CONTRAST REVIEW\nForeground: $fg\nBackground: $bg\nRatio: ${String.format(Locale.US, "%.2f:1", ratio)}\nWCAG AA normal text (4.5:1): ${if (ratio >= 4.5) "PASS" else "FAIL"}\nWCAG AA large text (3:1): ${if (ratio >= 3) "PASS" else "FAIL"}\nWCAG AAA normal text (7:1): ${if (ratio >= 7) "PASS" else "FAIL"}${if (suggestions) "\n\nForeground alternatives on this background (AA normal text):\n$alternatives" else ""}\n\nA color pair alone cannot establish full-page WCAG conformance or check use of color."
    }
    private fun rgb(value: String): IntArray? {
        val clean = value.trim().removePrefix("#")
        if (!clean.matches(Regex("[0-9a-fA-F]{6}"))) return null
        return intArrayOf(clean.substring(0, 2).toInt(16), clean.substring(2, 4).toInt(16), clean.substring(4, 6).toInt(16))
    }
    private fun luminance(rgb: IntArray): Double {
        val c = rgb.map { it / 255.0 }.map { if (it <= 0.04045) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    private fun Double.pow(exp: Double): Double = Math.pow(this, exp)

    private fun colorVisionReport(foreground: String, background: String): String {
        val matrices = listOf(
            "Protanopia approximation" to arrayOf(doubleArrayOf(.567,.433,0.0), doubleArrayOf(.558,.442,0.0), doubleArrayOf(0.0,.242,.758)),
            "Deuteranopia approximation" to arrayOf(doubleArrayOf(.625,.375,0.0), doubleArrayOf(.7,.3,0.0), doubleArrayOf(0.0,.3,.7)),
            "Tritanopia approximation" to arrayOf(doubleArrayOf(.95,.05,0.0), doubleArrayOf(0.0,.433,.567), doubleArrayOf(0.0,.475,.525)),
        )
        return buildString {
            append("COLOR-VISION PREVIEW (approximate)\nOriginal foreground: $foreground · background: $background\n\n")
            matrices.forEach { (name, matrix) ->
                append("$name\nForeground: ${transformColor(foreground, matrix)} · Background: ${transformColor(background, matrix)}\n\n")
            }
            append("This matrix preview is illustrative only, not a clinical simulation or substitute for testing with users. Never rely on color alone to communicate meaning.")
        }
    }

    private fun transformColor(color: String, matrix: Array<DoubleArray>): String {
        val channels = rgb(color) ?: return "invalid color"
        val transformed = (0..2).map { row -> (0..2).sumOf { col -> matrix[row][col] * channels[col] }.roundToInt().coerceIn(0, 255) }
        return "#" + transformed.joinToString("") { "%02X".format(Locale.US, it) }
    }

    private fun generator(kind: String, foreground: String, background: String): String = when (kind) {
        "aria" -> "ARIA STARTER\n\nPrefer native HTML semantics first. Example:\n<button type=\"button\">Save changes</button>\n\nAdd ARIA only when the name, role, or state cannot be expressed with native HTML."
        "alt-text" -> "ALT TEXT GUIDE\n\nDescribe an informative image's purpose in context. Use alt=\"\" only when decorative. Avoid filenames and nearby-text repetition."
        "form" -> "ACCESSIBLE FORM STARTER\n\n<label for=\"email\">Email address</label>\n<input id=\"email\" name=\"email\" autocomplete=\"email\">\n\nAssociate error text with aria-describedby; never rely on color alone."
        "focus-state" -> "VISIBLE FOCUS CSS\n:focus-visible {\n  outline: 3px solid currentColor;\n  outline-offset: 3px;\n}\n\nCheck contrast and ensure the focused control is not obscured."
        "keyboard-navigation" -> "KEYBOARD REVIEW\n\nTab / Shift+Tab: logical order\nEnter / Space: expected activation\nEscape: closes dismissible overlays\nNo keyboard trap; visible focus remains present."
        "motion" -> "REDUCED MOTION CSS\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    scroll-behavior: auto !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n  }\n}\n\nPreserve essential feedback when reducing motion."
        "color-blindness" -> colorVisionReport(foreground, background)
        "font-size" -> "FONT SIZE CSS STARTER\n\nbody {\n  font-size: 1rem;\n  line-height: 1.5;\n}\n\nVerify resizing and reflow; these are starting values, not conformance thresholds."
        "line-height" -> "LINE HEIGHT CSS STARTER\n\nbody {\n  font-size: 1rem;\n  line-height: 1.5;\n}\n\nPrefer a unitless ratio; verify text-spacing overrides."
        "text-readability" -> "READABILITY WRITING CHECKLIST\n\nUse clear headings, short sentences, concrete words, and one idea per paragraph. This English readability estimate is advisory; validate with readers."
        "contrast", "accessible-color" -> contrastReport(kind, foreground, background, true)
        else -> "ACCESSIBILITY CHECKLIST\n\nUse semantic HTML, meaningful names, keyboard operation, visible focus, zoom and text-spacing support, and assistive-technology testing."
    }

    private fun readability(text: String): String {
        val words = Regex("[A-Za-z]+(?:['-][A-Za-z]+)*").findAll(text).map { it.value }.toList()
        if (words.isEmpty()) return "Paste English text to calculate readability estimates."
        val sentences = max(1, Regex("[.!?]+(?=\\s|$)").findAll(text.trim()).count())
        val syllables = words.sumOf { word ->
            val cleaned = word.lowercase().replace(Regex("[^a-z]"), "")
            val groups = Regex("[aeiouy]{1,2}").findAll(cleaned.replace(Regex("(?:[^aeiouy]+$)|^y"), "")).count()
            max(1, groups)
        }
        val wps = words.size.toDouble() / sentences
        val spw = syllables.toDouble() / words.size
        val ease = 206.835 - 1.015 * wps - 84.6 * spw
        val grade = 0.39 * wps + 11.8 * spw - 15.59
        return "TEXT READABILITY (English estimate)\nWords: ${words.size}\nSentences: $sentences\nSyllables: $syllables\nFlesch Reading Ease: ${String.format(Locale.US, "%.1f", ease)}\nApproximate Flesch-Kincaid grade: ${String.format(Locale.US, "%.1f", grade)}\n\nThese formulas are language-specific and do not replace testing with readers."
    }
}
