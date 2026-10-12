package com.chastech.env

import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Local, deterministic WCAG-oriented accessibility checks for Android. Static snippets are not conformance certification. */
object NativeAccessibilityEngine {
    private val actions = listOf("checker", "generator", "helper", "preview", "simulator")
    private val roles = setOf("alert", "alertdialog", "application", "article", "banner", "button", "checkbox", "combobox", "complementary", "contentinfo", "dialog", "form", "grid", "heading", "img", "link", "list", "listbox", "main", "menu", "navigation", "option", "progressbar", "radio", "region", "search", "slider", "status", "switch", "tab", "tabpanel", "textbox", "toolbar", "tree", "treeitem")
    private val tagPattern = Regex("<([a-zA-Z][\\w:-]*)\\b([^<>]*)>")
    private val attrPattern = Regex("([^\\s=/>]+)(?:\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+)))?")

    data class Element(val tag: String, val attrs: Map<String, String>, val source: String, val innerMarkup: String = "", val textContent: String = "")
    data class Finding(
        val severity: String,
        val rule: String,
        val message: String,
        val target: String,
        val fix: String,
        val id: String = "",
        val line: Int? = null,
        val evidence: String = "",
        val relatedCriteria: List<String> = emptyList(),
        val review: String = "manual-review"
    )
    data class ColorVisionPreview(val label: String, val foreground: String, val background: String)

    fun supports(toolId: String, category: String): Boolean = category == "accessibility" && toolId.isNotBlank()
    fun kind(toolId: String): String = actions.firstOrNull { toolId.endsWith("-$it") }?.let { toolId.removeSuffix("-$it") } ?: toolId

    fun analyze(toolId: String, markup: String, foreground: String = "#000000", background: String = "#ffffff", fontSize: String = "16px", lineHeight: String = "1.5", focusWidth: String = "3px", focusOffset: String = "3px"): String {
        val kind = kind(toolId)
        val action = actions.firstOrNull { toolId.endsWith("-$it") } ?: "checker"
        if (toolId.endsWith("-generator")) return generator(kind, foreground, background, focusWidth, focusOffset, markup)
        if (action == "helper" && kind == "alt-text") return altTextCoach(markup)
        if (action == "helper" && kind in setOf("contrast", "accessible-color")) return "${helperGuide(kind)}\n\n${contrastReport(kind, foreground, background, true)}"
        if (action == "helper" && kind == "text-readability" && markup.isNotBlank()) return "READABILITY COACH · Heuristic draft for review\n\nOriginal:\n$markup\n\nSimpler wording draft:\n${plainLanguageDraft(markup)}\n\nReview each substitution for meaning and tone with intended readers.\n\n${analyze(kind + "-checker", markup)}"
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
                // Document-level source checks only run when an HTML root/document is supplied.
                val htmlRoot = elements.firstOrNull { it.tag == "html" }
                if (htmlRoot != null && htmlRoot.attrs["lang"].isNullOrBlank()) add("SERIOUS", "document-language", "The HTML root has no detectable language declaration.", "<html>", "Set a valid BCP 47 language tag such as lang=\"en\" and verify the actual page language.")
                if (Regex("<html\\b|<head\\b", RegexOption.IGNORE_CASE).containsMatchIn(markup)) {
                    val title = elements.firstOrNull { it.tag == "title" }
                    if (title == null || title.textContent.isBlank()) add("MODERATE", "document-title", "A non-empty document title was not detected in this document-like snippet.", "<head>", "Provide a concise, descriptive <title>; usefulness still needs human review.")
                }
                var previousHeadingLevel = 0
                elements.filter { Regex("h[1-6]").matches(it.tag) }.forEach { heading ->
                    val level = heading.tag.drop(1).toInt()
                    if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) add("MODERATE", "heading-order", "Heading level jumps from h$previousHeadingLevel to h$level; verify the heading hierarchy.", target(heading), "Use heading levels that reflect the content structure. A skipped level is a review lead, not automatically a WCAG failure.")
                    previousHeadingLevel = level
                }
                elements.forEach { e ->
                    val role = e.attrs["role"]?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.lowercase()
                    if (role != null && role !in roles) add("SERIOUS", "aria-valid-role", "Unknown ARIA role '$role'.", target(e), "Use a valid WAI-ARIA role or native HTML semantics.")
                    if (e.attrs.containsKey("aria-label") && e.attrs["aria-label"].isNullOrBlank()) add("MODERATE", "aria-label", "aria-label is empty.", target(e), "Give the control a name or remove the empty attribute.")
                    if (e.attrs.containsKey("aria-label") && e.tag in setOf("div", "span", "p", "li") && (role == null || role in setOf("generic", "none", "presentation")) && e.attrs["aria-labelledby"].isNullOrBlank()) add("SERIOUS", "aria-prohibited-attr", "aria-label is used on a generic container without a role that supports an accessible name.", target(e), "Prefer a native semantic element or an accurate role that supports naming; do not add a role just to silence the checker.")
                    e.attrs["aria-labelledby"]?.split(Regex("\\s+"))?.filter(String::isNotBlank)?.filterNot(idSet::contains)?.forEach { missing -> add("SERIOUS", "aria-labelledby", "aria-labelledby references missing id '$missing'.", target(e), "Reference an existing, unique id.") }
                    listOf("aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-errormessage", "aria-flowto").forEach { attribute ->
                        e.attrs[attribute]?.split(Regex("\\s+"))?.filter(String::isNotBlank)?.filterNot(idSet::contains)?.forEach { missing -> add("MODERATE", "aria-reference", "$attribute references missing id '$missing'. Dynamic content may create this target later, so verify the rendered state.", target(e), "Ensure $attribute points to an existing element in each relevant state, or remove the stale reference.") }
                    }
                    if (e.attrs["aria-hidden"] == "true" && (e.tag in setOf("a", "button", "input", "select", "textarea") || e.attrs.containsKey("tabindex"))) add("SERIOUS", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", target(e), "Remove aria-hidden or make the entire hidden subtree non-interactive.")
                    val validTokens = mapOf(
                        "aria-checked" to setOf("true", "false", "mixed"), "aria-pressed" to setOf("true", "false", "mixed"),
                        "aria-selected" to setOf("true", "false"), "aria-expanded" to setOf("true", "false"), "aria-hidden" to setOf("true", "false"),
                        "aria-disabled" to setOf("true", "false"), "aria-required" to setOf("true", "false"), "aria-readonly" to setOf("true", "false"), "aria-busy" to setOf("true", "false"),
                        "aria-invalid" to setOf("true", "false", "grammar", "spelling")
                    )
                    validTokens.forEach { (attribute, allowed) ->
                        val value = e.attrs[attribute]?.lowercase()
                        if (value != null && value !in allowed) add("MODERATE", "aria-value-${attribute.removePrefix("aria-")}", "$attribute has invalid value '$value'.", target(e), "Use one of ${allowed.joinToString(", ")} and only use the attribute when supported by the element's role.")
                    }
                    val live = e.attrs["aria-live"]?.lowercase()
                    if (live != null && live !in setOf("off", "polite", "assertive")) add("MODERATE", "aria-value-live", "aria-live has invalid value '$live'.", target(e), "Use off, polite, or assertive and avoid unnecessarily interrupting assistive technology.")
                    val controlRoles = setOf("button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option")
                    val inputType = e.attrs["type"]?.lowercase().orEmpty()
                    when {
                        e.tag == "button" || (e.tag == "input" && inputType in setOf("button", "submit", "reset")) -> if (!hasAccessibleName(e, elements)) add("SERIOUS", "button-name", "Button has no detectable accessible name in the supplied markup.", target(e), "Give the button meaningful visible text, a valid aria-label/aria-labelledby, or a meaningful value for input buttons.")
                        e.tag == "a" && e.attrs.containsKey("href") -> if (!hasAccessibleName(e, elements)) add("SERIOUS", "link-name", "Link has no detectable accessible name in the supplied markup.", target(e), "Provide meaningful link text or an accessible name that communicates the link purpose in context.")
                        role != null && role in controlRoles && e.tag !in setOf("a", "button", "input", "select", "textarea", "summary") -> if (!hasAccessibleName(e, elements)) add("SERIOUS", "custom-control-name", "Custom role=$role has no detectable accessible name.", target(e), "Prefer a native interactive element or give the custom control a meaningful accessible name and validate its computed name in a browser.")
                    }
                }
                duplicates.forEach { add("SERIOUS", "duplicate-id", "The id '$it' is duplicated.", "#$it", "Make ids unique so accessible-name references resolve correctly.") }
            }
            "form" -> {
                val labels = elements.filter { it.tag == "label" }.mapNotNull { it.attrs["for"] }.toSet()
                elements.filter { it.tag in setOf("input", "select", "textarea") && it.attrs["type"] !in setOf("hidden", "submit", "button", "reset") }.forEach { e ->
                    val id = e.attrs["id"]
                    if (e.attrs["aria-label"].isNullOrBlank() && e.attrs["aria-labelledby"].isNullOrBlank() && (id == null || id !in labels)) add("SERIOUS", "label", "Form control has no detectable explicit label.", target(e), "Associate a visible label using for/id, or provide aria-label/aria-labelledby.")
                    if (e.attrs["aria-invalid"] == "true" && e.attrs["aria-describedby"].isNullOrBlank()) add("MODERATE", "error-description", "Invalid control has no error-description reference.", target(e), "Connect readable error text with aria-describedby.")
                    if (e.attrs["aria-invalid"] == "true" && e.attrs["aria-describedby"]?.split(Regex("\\s+"))?.filter(String::isNotBlank)?.orEmpty()?.any { it !in idSet } == true) add("MODERATE", "error-description-reference", "Invalid control references an error description missing from this snippet.", target(e), "Ensure the error element exists in the rendered state and explains how to correct the issue.")
                }
                elements.filter { it.tag == "label" && !it.attrs["for"].isNullOrBlank() }.forEach { label ->
                    if (label.attrs["for"] !in idSet) add("MODERATE", "label-reference", "Label references a missing form-control id '${label.attrs["for"]}'.", target(label), "Match the label's for value to a unique control id, or wrap the control inside the label.")
                }
            }
            "keyboard-navigation" -> {
                elements.forEach { e ->
                    val tab = e.attrs["tabindex"]?.toIntOrNull()
                    if (tab != null && tab > 0) add("MODERATE", "tabindex", "Positive tabindex can create a confusing focus order.", target(e), "Use natural DOM order and avoid tabindex values above zero.")
                    val role = e.attrs["role"]?.lowercase()
                    val hasClick = e.attrs.containsKey("onclick") || Regex("onClick\\s*=", RegexOption.IGNORE_CASE).containsMatchIn(e.source)
                    val hasKeyboard = Regex("on(?:key(?:down|up|press))\\s*=", RegexOption.IGNORE_CASE).containsMatchIn(e.source)
                    if (e.tag in setOf("div", "span", "li") && hasClick && role !in setOf("button", "link") && !hasKeyboard) add("SERIOUS", "keyboard-operable", if (e.attrs.containsKey("tabindex")) "Focusable custom content has a click handler but no detectable keyboard activation handler." else "Click handler on a non-interactive element may not be focusable or keyboard operable.", target(e), "Prefer a native button/link. If custom behavior is essential, expose the correct role, provide sequential focus, and implement expected Enter/Space activation.")
                    if (role in setOf("button", "link") && e.tag !in setOf("a", "button", "input", "select", "textarea", "summary") && !e.attrs.containsKey("tabindex")) add("SERIOUS", "custom-control-focus", "Custom role=$role is not in the sequential keyboard order.", target(e), "Use a native button/link, or add tabindex=0 and implement expected keyboard behavior.")
                    if (role in setOf("button", "link", "checkbox", "radio", "switch", "tab") && e.tag !in setOf("a", "button", "input", "select", "textarea", "summary") && hasClick && !hasKeyboard) add("SERIOUS", if (role == "button") "custom-button-keyboard-activation" else "custom-control-keyboard-activation", "Custom role=$role has a click handler but no detectable keyboard handler in its opening tag.", target(e), "Prefer a native semantic control. Otherwise, implement the role's expected keyboard interaction and test with keyboard and assistive technology.")

                    val interactive = (e.tag in setOf("a", "button", "input", "select", "textarea", "summary") && (e.tag != "a" || e.attrs.containsKey("href"))) || role in setOf("button", "link", "checkbox", "radio", "switch", "tab", "slider", "combobox")
                    if (interactive) {
                        val classes = e.attrs["class"].orEmpty().split(Regex("\\s+")).filter(String::isNotBlank).toSet()
                        val styles = mutableListOf(e.attrs["style"].orEmpty())
                        Regex("([^{}]+)\\{([^{}]*)\\}").findAll(markup.replace(Regex("<script\\b[\\s\\S]*?<\\/script>", RegexOption.IGNORE_CASE), "")).forEach { rule ->
                            val selectors = rule.groupValues[1].split(",").map { it.trim().split(Regex("\\s+|>|\\+|~")).last().replace(Regex(":.*$"), "") }
                            if (selectors.any { selector ->
                                val tag = Regex("^[a-z][\\w-]*", RegexOption.IGNORE_CASE).find(selector)?.value
                                val id = Regex("#([\\w-]+)").find(selector)?.groupValues?.getOrNull(1)
                                val ruleClasses = Regex("\\.([\\w-]+)").findAll(selector).map { it.groupValues[1] }.toList()
                                (tag == null || tag.equals(e.tag, true)) && (id == null || id == e.attrs["id"]) && ruleClasses.all(classes::contains) && !selector.contains("[") && !selector.contains("*")
                            }) styles += rule.groupValues[2]
                        }
                        val declarations = styles.joinToString(";")
                        fun dimension(vararg properties: String): Double? = properties.firstNotNullOfOrNull { property -> Regex("(?:^|[;{\\s])${Regex.escape(property)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px\\b", RegexOption.IGNORE_CASE).find(declarations)?.groupValues?.getOrNull(1)?.toDoubleOrNull() }
                        val width = dimension("width", "inline-size")
                        val height = dimension("height", "block-size")
                        val minWidth = dimension("min-width", "min-inline-size")
                        val minHeight = dimension("min-height", "min-block-size")
                        if ((width != null && width < 24 && (minWidth == null || minWidth < 24)) || (height != null && height < 24 && (minHeight == null || minHeight < 24))) add("MODERATE", "target-size-risk", "Explicit target dimensions (${width?.toString() ?: "auto"} × ${height?.toString() ?: "auto"} CSS px) may fall below 24 × 24 CSS px. Spacing or other WCAG exceptions may apply.", target(e), "Check rendered size and spacing. Meet 24 × 24 CSS px or document an applicable WCAG 2.2 SC 2.5.8 exception; test touch and pointer use.")
                    }
                }
                if (!Regex(":focus(?:-visible)?", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("MODERATE", "visible-focus", "No focus indicator rule was found in this snippet.", "CSS", "Provide a clearly visible :focus-visible indicator and test it in context.")
            }
            "focus-state" -> {
                val focusRules = Regex("[^{}]*:focus(?:-visible)?[^{}]*\\{[^}]*\\}", RegexOption.IGNORE_CASE).findAll(markup).map { it.value }.toList()
                if (focusRules.isEmpty()) add("SERIOUS", "focus-visible", "No :focus or :focus-visible rule was found.", "CSS", "Add a visible :focus-visible indicator with sufficient contrast and offset.")
                focusRules.filter { Regex("outline\\s*:\\s*(none|0)", RegexOption.IGNORE_CASE).containsMatchIn(it) && !Regex("(box-shadow|border)\\s*:\\s*(?!none|0)", RegexOption.IGNORE_CASE).containsMatchIn(it) }.forEach { add("SERIOUS", "focus-not-hidden", "Focus outline is removed without a replacement.", it.substringBefore("{").trim(), "Keep the outline or add a clearly visible replacement indicator.") }
            }
            "motion" -> {
                findings += inspectMotion(markup)
                if (Regex("<marquee\\b|blink\\s*\\(", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("SERIOUS", "flashing-motion", "Legacy marquee/blink content was detected; its visual and timing behavior needs manual review.", "animated content", "Remove legacy marquee/blink behavior, or provide user controls and verify the actual flash rate/area.")
            }
            else -> {
                add("MINOR", "scope", "Use a focused checker for markup findings.", kind, "Choose the corresponding checker and paste the relevant source snippet.")
            }
        }
        val ordered = findings.sortedWith(compareBy<Finding> { severityOrder(it.severity) }.thenBy { it.rule })
        val occurrences = mutableMapOf<String, Int>()
        val enriched = ordered.map { finding ->
            val targetSlug = finding.target.lowercase(Locale.US).replace(Regex("[^a-z0-9._#@-]+"), "-").trim('-').take(64).ifBlank { "snippet" }
            val identity = "$kind/${finding.rule}/$targetSlug"
            val occurrence = (occurrences[identity] ?: 0) + 1
            occurrences[identity] = occurrence
            val (line, evidence) = sourceLocation(markup, finding)
            finding.copy(
                id = "env-a11y:$identity${if (occurrence > 1) ":$occurrence" else ""}",
                line = line,
                evidence = evidence,
                relatedCriteria = relatedCriteria(finding.rule),
                review = if (finding.rule in setOf("image-alt", "aria-valid-role", "duplicate-id", "label-reference", "aria-value-expanded", "aria-value-live", "aria-value-invalid")) "verify-in-context" else "manual-review"
            )
        }
        val details = if (enriched.isEmpty()) "No matching issues were detected in the supplied snippet. A clean snippet is not proof of conformance." else enriched.mapIndexed { i, f ->
            "${i + 1}. [${f.severity}] ${f.rule}: ${f.message}\n   Finding ID: ${f.id}\n   Target: ${f.target} · Source line: ${f.line ?: "unresolved"}\n   Evidence: ${f.evidence}\n   Related WCAG criteria (review hints, not a failure verdict): ${f.relatedCriteria.joinToString().ifBlank { "No specific mapping assigned" }}\n   Review: ${f.review}\n   Fix: ${f.fix}"
        }.joinToString("\n")
        return "${kind.uppercase(Locale.US)} LOCAL REVIEW\nElements inspected: ${elements.size}\nFindings: ${enriched.size} (critical: 0 · serious: ${enriched.count { it.severity == "SERIOUS" }} · moderate: ${enriched.count { it.severity == "MODERATE" }} · minor: ${enriched.count { it.severity == "MINOR" }})\n\n$details\n\nScope: Static snippet checks only. This does not inspect a live page or accessibility tree, test assistive technology, or certify WCAG conformance. Related criteria are review guidance, not proof of failure. Manually verify keyboard and screen-reader behavior."
    }

    private fun relatedCriteria(rule: String): List<String> = when {
        rule in setOf("image-alt", "decorative-image", "filename-alt") -> listOf("1.1.1 Non-text Content")
        rule == "svg-name" -> listOf("1.1.1 Non-text Content", "4.1.2 Name, Role, Value")
        rule.startsWith("aria-") || rule in setOf("duplicate-id", "button-name", "custom-control-name") -> listOf("4.1.2 Name, Role, Value")
        rule == "link-name" -> listOf("2.4.4 Link Purpose (In Context)", "4.1.2 Name, Role, Value")
        rule in setOf("label", "label-reference") -> listOf("3.3.2 Labels or Instructions", "4.1.2 Name, Role, Value")
        rule.startsWith("error-description") -> listOf("3.3.1 Error Identification", "3.3.3 Error Suggestion")
        rule.contains("keyboard") || rule == "custom-control-focus" -> listOf("2.1.1 Keyboard", "4.1.2 Name, Role, Value")
        rule == "tabindex" -> listOf("2.4.3 Focus Order")
        rule == "target-size-risk" -> listOf("2.5.8 Target Size (Minimum)")
        rule == "document-language" -> listOf("3.1.1 Language of Page")
        rule == "document-title" -> listOf("2.4.2 Page Titled")
        rule == "heading-order" -> listOf("1.3.1 Info and Relationships")
        rule.contains("focus") -> listOf("2.4.7 Focus Visible")
        rule in setOf("reduced-motion", "reduced-motion-incomplete", "script-driven-motion", "script-motion-not-preference-aware") -> listOf("2.3.3 Animation from Interactions", "2.2.2 Pause, Stop, Hide")
        rule == "smooth-scroll-not-reduced" -> listOf("2.3.3 Animation from Interactions")
        rule == "rapid-contrast-flash" || rule == "flashing-motion" -> listOf("2.3.1 Three Flashes or Below Threshold")
        rule == "auto-moving-content" || rule == "loop-without-pause" -> listOf("2.2.2 Pause, Stop, Hide")
        else -> emptyList()
    }

    private fun sourceLocation(markup: String, finding: Finding): Pair<Int?, String> {
        val lines = markup.split(Regex("\\r?\\n"))
        val target = finding.target.trim()
        val id = Regex("^<[^>]+#([^>]+)>$").find(target)?.groupValues?.getOrNull(1)
            ?: Regex("^#([\\w:.-]+)$").find(target)?.groupValues?.getOrNull(1)
        val tag = Regex("^<([a-z][\\w:-]*)", RegexOption.IGNORE_CASE).find(target)?.groupValues?.getOrNull(1)
        var index = -1
        if (id != null) {
            val escaped = Regex.escape(id)
            index = lines.indexOfFirst { Regex("\\bid\\s*=\\s*['\"]$escaped['\"]", RegexOption.IGNORE_CASE).containsMatchIn(it) }
        }
        if (index < 0 && target.startsWith("@keyframes")) index = lines.indexOfFirst { it.contains(target, ignoreCase = true) }
        if (index < 0 && target.length < 100 && !target.startsWith("<") && target != "CSS") index = lines.indexOfFirst { it.contains(target) }
        if (index < 0 && tag != null) index = lines.indexOfFirst { Regex("<$tag(?:\\s|>|/)", RegexOption.IGNORE_CASE).containsMatchIn(it) }
        if (index < 0) {
            val property = when (finding.rule) {
                "rapid-contrast-flash" -> Regex("@(?:-webkit-)?keyframes|background(?:-color)?\\s*:", RegexOption.IGNORE_CASE)
                "auto-moving-content" -> Regex("@(?:-webkit-)?keyframes|translateX\\s*\\(", RegexOption.IGNORE_CASE)
                "loop-without-pause" -> Regex("animation(?:-iteration-count)?\\s*:[^;]*infinite", RegexOption.IGNORE_CASE)
                "smooth-scroll-not-reduced" -> Regex("scroll-behavior\\s*:\\s*smooth", RegexOption.IGNORE_CASE)
                "script-driven-motion", "script-motion-not-preference-aware" -> Regex("addEventListener|requestAnimationFrame|setInterval|\\.style\\.(?:transform|translate|rotate|scale)\\s*=|\\.animate\\s*\\(", RegexOption.IGNORE_CASE)
                "reduced-motion" -> Regex("animation\\s*:|transition\\s*:|@(?:-webkit-)?keyframes", RegexOption.IGNORE_CASE)
                "reduced-motion-incomplete" -> Regex("@media[^\\n]*prefers-reduced-motion", RegexOption.IGNORE_CASE)
                "transition-all" -> Regex("transition\\s*:\\s*all", RegexOption.IGNORE_CASE)
                else -> null
            }
            if (property != null) index = lines.indexOfFirst(property::containsMatchIn)
        }
        if (index < 0) return null to "Source location could not be resolved; inspect the target manually."
        val evidence = lines.drop(index).take(3).joinToString("\n").trim().take(500)
        return (index + 1) to evidence
    }

    private fun cssBlock(source: String, pattern: Regex): Pair<String, String>? {
        val match = pattern.find(source) ?: return null
        val open = source.indexOf('{', match.range.last + 1)
        if (open < 0) return null
        var depth = 0
        var quote: Char? = null
        var escaped = false
        for (index in open until source.length) {
            val ch = source[index]
            if (escaped) { escaped = false; continue }
            if (ch == '\\') { escaped = true; continue }
            if (quote != null) { if (ch == quote) quote = null; continue }
            if (ch == '\'' || ch == '"') { quote = ch; continue }
            if (ch == '{') depth++
            if (ch == '}') {
                depth--
                if (depth == 0) return (match.groupValues.getOrNull(1) ?: match.value) to source.substring(open + 1, index)
            }
        }
        return null
    }

    /** Deterministic on-device motion heuristics. These produce review leads, not WCAG certification. */
    private fun inspectMotion(markup: String): List<Finding> {
        val findings = mutableListOf<Finding>()
        fun add(severity: String, rule: String, message: String, target: String, fix: String) {
            findings += Finding(severity, rule, message, target, fix)
        }
        val css = markup.replace(Regex("/\\*[\\s\\S]*?\\*/"), "")
        val animated = Regex("animation(?:-name)?\\s*:|@(?:-webkit-)?keyframes|transition(?:-property)?\\s*:", RegexOption.IGNORE_CASE).containsMatchIn(css)
        val reduced = cssBlock(css, Regex("@media\\s*\\([^)]*prefers-reduced-motion\\s*:\\s*reduce[^)]*\\)", RegexOption.IGNORE_CASE))?.second.orEmpty()
        val hasReducedBlock = reduced.isNotEmpty() || Regex("@media\\s*\\([^)]*prefers-reduced-motion\\s*:\\s*reduce", RegexOption.IGNORE_CASE).containsMatchIn(css)
        val jsMotion = Regex("(?:addEventListener\\s*\\(\\s*['\"](?:scroll|wheel|pointermove|mousemove|touchmove)['\"]|requestAnimationFrame\\s*\\(|setInterval\\s*\\()[\\s\\S]{0,500}(?:transform|translate|rotate|scale|animation|style\\.)", RegexOption.IGNORE_CASE).containsMatchIn(markup) ||
            Regex("\\.style\\.(?:transform|translate|rotate|scale)\\s*=|\\.animate\\s*\\(", RegexOption.IGNORE_CASE).containsMatchIn(markup)

        if (animated && !hasReducedBlock) {
            add("SERIOUS", "reduced-motion", "Motion CSS is present but no prefers-reduced-motion: reduce block was found.", "CSS animation/transition", "Provide a reduced-motion alternative that removes non-essential movement, disables smooth scrolling, and preserves essential information.")
        } else if (animated && hasReducedBlock) {
            val animationOverride = Regex("animation\\s*:\\s*none\\b|animation-name\\s*:\\s*none\\b|animation-duration\\s*:\\s*(?:0(?:\\.0+)?(?:ms|s)|0?\\.0*1ms|1ms)\\b|animation-iteration-count\\s*:\\s*1\\b", RegexOption.IGNORE_CASE).containsMatchIn(reduced)
            val transitionOverride = Regex("transition\\s*:\\s*none\\b|transition-property\\s*:\\s*none\\b|transition-duration\\s*:\\s*(?:0(?:\\.0+)?(?:ms|s)|0?\\.0*1ms|1ms)\\b", RegexOption.IGNORE_CASE).containsMatchIn(reduced)
            val hasAnimation = Regex("animation(?:-name)?\\s*:|@(?:-webkit-)?keyframes", RegexOption.IGNORE_CASE).containsMatchIn(css)
            val hasTransition = Regex("transition(?:-property)?\\s*:", RegexOption.IGNORE_CASE).containsMatchIn(css)
            if ((hasAnimation && !animationOverride) || (hasTransition && !transitionOverride)) add("MODERATE", "reduced-motion-incomplete", "A reduced-motion media query exists, but it does not visibly override every animation/transition type used by this snippet.", "@media (prefers-reduced-motion: reduce)", "Inspect the media block and disable or materially reduce the motion types actually used.")
        }
        if (Regex("scroll-behavior\\s*:\\s*smooth\\b", RegexOption.IGNORE_CASE).containsMatchIn(css) && !Regex("scroll-behavior\\s*:\\s*auto\\b", RegexOption.IGNORE_CASE).containsMatchIn(reduced)) {
            add("MODERATE", "smooth-scroll-not-reduced", "Smooth scrolling is enabled but the reduced-motion block does not switch it to auto.", "CSS scroll behavior", "Set scroll-behavior: auto in the reduced-motion block and also verify script-driven scrolling.")
        }
        if (Regex("transition\\s*:\\s*all\\b", RegexOption.IGNORE_CASE).containsMatchIn(css)) add("MINOR", "transition-all", "A broad transition: all declaration may animate properties that were not intended to move.", "CSS transition declaration", "List only properties that need transitions and respect reduced-motion preferences.")

        val keyframes = Regex("@(?:-webkit-)?keyframes\\s+([\\w-]+)", RegexOption.IGNORE_CASE).findAll(css).mapNotNull { match ->
            cssBlock(css.substring(match.range.first), Regex("^@(?:-webkit-)?keyframes\\s+([\\w-]+)", RegexOption.IGNORE_CASE))
        }.toList()
        keyframes.forEach { (name, body) ->
            val escapedName = Regex.escape(name)
            val namePattern = Regex("\\b$escapedName\\b", RegexOption.IGNORE_CASE)
            val matchingRule = Regex("([^{}]+)\\{([^{}]*)\\}").findAll(css).firstOrNull { rule ->
                val declarations = rule.groupValues[2]
                val values = listOfNotNull(
                    Regex("animation\\s*:\\s*([^;]+)", RegexOption.IGNORE_CASE).find(declarations)?.groupValues?.get(1),
                    Regex("animation-name\\s*:\\s*([^;]+)", RegexOption.IGNORE_CASE).find(declarations)?.groupValues?.get(1)
                )
                values.any { value -> value.split(",").any { part -> namePattern.containsMatchIn(part) } }
            }?.groupValues?.get(2).orEmpty()
            val shorthand = Regex("animation\\s*:\\s*([^;]+)", RegexOption.IGNORE_CASE).find(matchingRule)?.groupValues?.get(1).orEmpty()
            val animationItem = shorthand.split(",").firstOrNull { namePattern.containsMatchIn(it) }
            val duration = Regex("(?:^|\\s)(\\d*\\.?\\d+)(ms|s)\\b", RegexOption.IGNORE_CASE).find(animationItem ?: matchingRule)
                ?: Regex("animation-duration\\s*:\\s*(\\d*\\.?\\d+)(ms|s)\\b", RegexOption.IGNORE_CASE).find(matchingRule)
            val millis = duration?.let { (it.groupValues[1].toDoubleOrNull() ?: return@let null) * if (it.groupValues[2].equals("s", true)) 1000 else 1 }
            val repeats = Regex("\\binfinite\\b", RegexOption.IGNORE_CASE).containsMatchIn(animationItem.orEmpty()) || Regex("animation-iteration-count\\s*:\\s*(?:infinite|[2-9]|[1-9]\\d+)\\b", RegexOption.IGNORE_CASE).containsMatchIn(matchingRule)
            val backgroundChanges = Regex("background(?:-color)?\\s*:", RegexOption.IGNORE_CASE).findAll(body).count() >= 2
            val highContrastColors = Regex("\\b(red|black|white|yellow|lime|fuchsia)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body) || Regex("#(?:f00|000|fff|ff0|0f0|f0f|ff0000|000000|ffffff|ffff00|00ff00|ff00ff)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
            if (backgroundChanges && highContrastColors && repeats && millis != null && millis <= 500) add("SERIOUS", "rapid-contrast-flash", "Keyframes '$name' rapidly alternate high-contrast background colors (${millis.toInt()}ms per cycle). This is a risk signal, not a measured WCAG flash test.", "@keyframes $name", "Remove the flashing effect or measure it against WCAG flash thresholds; reduced duration alone does not prove safety.")
            if (Regex("translateX\\s*\\(", RegexOption.IGNORE_CASE).containsMatchIn(body) && repeats) add("MODERATE", "auto-moving-content", "Keyframes '$name' move content horizontally in a repeating animation.", "@keyframes $name", "Provide a user-operable pause/stop mechanism and disable non-essential movement for reduced-motion users.")
        }
        if (Regex("(?:animation\\s*:[^;{}]*\\binfinite\\b|animation-iteration-count\\s*:\\s*infinite\\b)", RegexOption.IGNORE_CASE).containsMatchIn(css) && !Regex("animation-play-state\\s*:\\s*paused", RegexOption.IGNORE_CASE).containsMatchIn(css) && !Regex("classList\\.(add|remove|toggle)\\s*\\([^)]*(pause|paused|motion-off|animation-off)", RegexOption.IGNORE_CASE).containsMatchIn(markup)) {
            add("MODERATE", "loop-without-pause", "One or more animations loop indefinitely, and no clear animation pause/resume mechanism was detected.", "CSS infinite animation", "Add a user-operable pause/stop control that actually stops each affected animation.")
        }
        if (jsMotion) {
            add("MODERATE", "script-driven-motion", "JavaScript appears to change transform/animation state; CSS media-query overrides do not automatically stop this code path.", "JavaScript motion handler", "Guard non-essential script-driven movement with matchMedia('(prefers-reduced-motion: reduce)') and listen for preference changes.")
            if (!Regex("matchMedia\\s*\\([^)]*prefers-reduced-motion", RegexOption.IGNORE_CASE).containsMatchIn(markup)) add("MODERATE", "script-motion-not-preference-aware", "No JavaScript check for prefers-reduced-motion was detected alongside script-driven movement.", "JavaScript motion handler", "Check matchMedia('(prefers-reduced-motion: reduce)') before starting script-driven motion and respond when the preference changes.")
        }
        for (rule in Regex("([^{}]+)\\{([^{}]*)\\}").findAll(css)) {
            val animation = Regex("animation\\s*:\\s*([^;]+)", RegexOption.IGNORE_CASE).find(rule.groupValues[2])?.groupValues?.get(1) ?: continue
            val writers = keyframes.filter { (name, body) -> Regex("\\b${Regex.escape(name)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(animation) && Regex("transform\\s*:", RegexOption.IGNORE_CASE).containsMatchIn(body) }.map { it.first }
            if (writers.size > 1) add("MODERATE", "competing-transform-animations", "Concurrent keyframes (${writers.joinToString(", ")}) both write to transform and may override each other.", rule.groupValues[1].trim(), "Combine transform operations into one keyframe animation or use separate nested elements.")
        }
        return findings
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
        "alt-text" -> bulkAltText(input)
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

    private fun parse(markup: String): List<Element> {
        val clean = markup.replace(Regex("<!--[\\s\\S]*?-->"), "")
        val voidTags = setOf("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr")
        return tagPattern.findAll(clean).map { match ->
            val tag = match.groupValues[1].lowercase()
            val attrs = attrPattern.findAll(match.groupValues[2]).associate { a ->
                a.groupValues[1].lowercase() to (a.groupValues[2].ifEmpty { a.groupValues[3].ifEmpty { a.groupValues[4] } })
            }
            val start = match.range.last + 1
            val close = if (tag in voidTags || match.value.endsWith("/>")) null else Regex("</\\s*${Regex.escape(tag)}\\s*>", RegexOption.IGNORE_CASE).find(clean, start)
            val inner = if (close != null && close.range.first >= start) clean.substring(start, close.range.first) else ""
            Element(tag, attrs, match.value, inner, inner.replace(Regex("<[^>]*>"), " ").trim())
        }.toList()
    }

    private fun hasAccessibleName(element: Element, elements: List<Element>): Boolean {
        val attrs = element.attrs
        if (!attrs["aria-label"].isNullOrBlank()) return true
        val byId = elements.mapNotNull { candidate -> candidate.attrs["id"]?.let { it to candidate } }.toMap()
        val labelledBy = attrs["aria-labelledby"].orEmpty().split(Regex("\\s+")).filter(String::isNotBlank)
        if (labelledBy.isNotEmpty() && labelledBy.all(byId::containsKey)) {
            val referencedText = labelledBy.mapNotNull { byId[it] }.joinToString(" ") { candidate ->
                (candidate.textContent.ifBlank { candidate.attrs["aria-label"] ?: candidate.attrs["title"] ?: candidate.attrs["alt"] ?: candidate.attrs["value"].orEmpty() }).trim()
            }.trim()
            if (referencedText.isNotEmpty()) return true
        }
        if (!attrs["title"].isNullOrBlank() || !attrs["alt"].isNullOrBlank()) return true
        val type = attrs["type"]?.lowercase().orEmpty()
        if (element.tag == "input" && type in setOf("button", "submit", "reset") && !attrs["value"].isNullOrBlank()) return true
        if (element.tag in setOf("button", "a") && element.textContent.isNotBlank()) return true
        if (Regex("<img\\b[^>]*\\balt\\s*=\\s*(['\"])[^'\"]+['\"]", RegexOption.IGNORE_CASE).containsMatchIn(element.innerMarkup)) return true
        if (Regex("<svg\\b[\\s\\S]*?<title\\b[^>]*>[^<]+</title>", RegexOption.IGNORE_CASE).containsMatchIn(element.innerMarkup)) return true
        return attrs["role"] != null && element.textContent.isNotBlank()
    }

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
        return "$kind CONTRAST REVIEW\nForeground: $fg\nBackground: $bg\nWCAG 2.2 ratio: ${String.format(Locale.US, "%.2f:1", ratio)}\nWCAG AA normal text (4.5:1): ${if (ratio >= 4.5) "PASS" else "FAIL"}\nWCAG AA large text (3:1): ${if (ratio >= 3) "PASS" else "FAIL"}\nWCAG AAA normal text (7:1): ${if (ratio >= 7) "PASS" else "FAIL"}${if (suggestions) "\n\nForeground alternatives on this background (WCAG AA normal text):\n$alternatives" else ""}\n\nA color pair alone cannot establish full-page WCAG conformance or check use of color."
    }

    fun passingForegroundColors(background: String, minimumRatio: Double = 4.5): List<String> {
        val base = rgb(background) ?: return emptyList()
        val baseLuminance = luminance(base)
        return listOf("#000000", "#ffffff", "#1f2937", "#334155", "#0f766e", "#7f1d1d", "#1d4ed8")
            .filter { candidate -> rgb(candidate)?.let { (max(luminance(it), baseLuminance) + 0.05) / (min(luminance(it), baseLuminance) + 0.05) >= minimumRatio } == true }
            .distinct().take(5)
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

    fun colorVisionPreviewPairs(foreground: String, background: String): List<ColorVisionPreview> {
        val matrices = listOf(
            "Protanopia approximation" to arrayOf(doubleArrayOf(.567,.433,0.0), doubleArrayOf(.558,.442,0.0), doubleArrayOf(0.0,.242,.758)),
            "Deuteranopia approximation" to arrayOf(doubleArrayOf(.625,.375,0.0), doubleArrayOf(.7,.3,0.0), doubleArrayOf(0.0,.3,.7)),
            "Tritanopia approximation" to arrayOf(doubleArrayOf(.95,.05,0.0), doubleArrayOf(0.0,.433,.567), doubleArrayOf(0.0,.475,.525)),
        )
        val rows = matrices.map { (name, matrix) -> ColorVisionPreview(name, transformColor(foreground, matrix), transformColor(background, matrix)) }.toMutableList()
        fun gray(color: String): String {
            val channels = rgb(color) ?: return "invalid color"
            val value = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]).roundToInt().coerceIn(0, 255)
            return "#%02X%02X%02X".format(Locale.US, value, value, value)
        }
        rows += ColorVisionPreview("Achromatopsia · grayscale approximation", gray(foreground), gray(background))
        return rows
    }

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

    private fun altTextCoach(input: String): String {
        val description = input.trim()
        if (description.isEmpty()) return "ALT-TEXT WRITING COACH\nDescribe the image and its purpose in the surrounding content. Drafts stay on this device.\n\nUse the shortest accurate wording; use alt=\"\" only when decorative."
        val phrase = description.trimEnd('.', '!', '?', ' ')
        val options = listOf("$phrase.", "$phrase; it helps the reader understand the page content.", "$phrase. The image adds relevant context for this section.")
        return "ALT-TEXT WRITING COACH · Drafts, not automatic truth\n\n${options.mapIndexed { i, value -> "${listOf("Short", "Medium", "Detailed")[i]} (${value.length} characters)\n$value" }.joinToString("\n\n")}\n\nChoose the shortest accurate option. Verify against the actual image and nearby content."
    }

    private fun bulkAltText(input: String): String {
        val images = parse(input).filter { it.tag == "img" || (it.tag == "input" && it.attrs["type"]?.equals("image", true) == true) }
        if (images.isEmpty()) return "BULK ALT-TEXT TRIAGE\nPaste multiple <img> tags to scan. This static check cannot inspect image pixels or judge meaning."
        val rows = images.mapIndexed { index, element ->
            val alt = element.attrs["alt"]
            when {
                alt == null -> "${index + 1}. SERIOUS · Missing alt\n   ${element.source}\n   Fix: add concise contextual alt, or alt=\"\" if decorative."
                alt.matches(Regex("(?i).*\\.(png|jpe?g|gif|webp|svg)$")) -> "${index + 1}. MODERATE · Filename used as alt\n   ${element.source}\n   Fix: describe purpose, not the file name."
                alt.isBlank() -> "${index + 1}. REVIEW · Empty alt (decorative)\n   ${element.source}"
                else -> "${index + 1}. REVIEW · Alt present\n   ${element.source}"
            }
        }
        return "BULK ALT-TEXT TRIAGE · Local scan\nImages found: ${images.size}\n\n${rows.joinToString("\n\n")}\n\nReview every fix in context. Valid alt text depends on the image and nearby content."
    }

    private fun plainLanguageDraft(input: String): String {
        val changes = listOf("at this point in time" to "now", "in order to" to "to", "in the event that" to "if", "is able to" to "can", "make a decision" to "decide", "approximately" to "about", "utilize" to "use", "assistance" to "help", "commence" to "start", "demonstrate" to "show", "purchase" to "buy", "prior to" to "before", "subsequently" to "then", "determine" to "decide", "requirement" to "need", "sufficient" to "enough", "numerous" to "many", "obtain" to "get", "regarding" to "about", "additional" to "more")
        var result = input
        changes.forEach { (wordy, simple) -> result = result.replace(Regex("\\b${Regex.escape(wordy)}\\b", RegexOption.IGNORE_CASE), simple) }
        return result
    }

    private fun generator(kind: String, foreground: String, background: String, focusWidth: String, focusOffset: String, pattern: String): String = when (kind) {
        "aria" -> {
            val snippet = when (pattern.trim().lowercase()) {
                "dialog" -> "<button type=\"button\" aria-haspopup=\"dialog\" aria-controls=\"settings\">Settings</button>\n<dialog id=\"settings\" aria-labelledby=\"settings-title\">\n  <h2 id=\"settings-title\">Settings</h2>\n  <button type=\"button\">Close</button>\n</dialog>"
                "disclosure" -> "<button type=\"button\" aria-expanded=\"false\" aria-controls=\"details\">More details</button>\n<div id=\"details\" hidden>Additional details</div>"
                "tabs" -> "<div role=\"tablist\" aria-label=\"Account sections\">\n  <button role=\"tab\" id=\"profile-tab\" aria-selected=\"true\" aria-controls=\"profile-panel\" tabindex=\"0\">Profile</button>\n</div>\n<section role=\"tabpanel\" id=\"profile-panel\" aria-labelledby=\"profile-tab\">Profile settings</section>"
                "checkbox" -> "<label><input type=\"checkbox\" name=\"updates\"> Email me updates</label>"
                "link" -> "<a href=\"/account/settings\">Account settings</a>"
                else -> "<button type=\"button\">Save changes</button>"
            }
            "ARIA PATTERN STARTER · ${pattern.ifBlank { "button" }}\n\n$snippet\n\nPrefer native semantics. Custom widgets also need full keyboard behavior and accurate state updates; test the completed component."
        }
        "alt-text" -> "ALT TEXT GUIDE\n\nDescribe an informative image's purpose in context. Use alt=\"\" only when decorative. Avoid filenames and nearby-text repetition."
        "form" -> "ACCESSIBLE FORM STARTER\n\n<label for=\"email\">Email address</label>\n<input id=\"email\" name=\"email\" autocomplete=\"email\">\n\nAssociate error text with aria-describedby; never rely on color alone."
        "focus-state" -> {
            val width = focusWidth.trim().takeIf { it.matches(Regex("[2-8](?:\\.\\d+)?px")) } ?: "3px"
            val offset = focusOffset.trim().takeIf { it.matches(Regex("(?:[1-9]|10)(?:\\.\\d+)?px")) } ?: "3px"
            val ring = foreground.trim().takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) } ?: "currentColor"
            val darkRing = background.trim().takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) } ?: "#ffd54f"
            "FOCUS-VISIBLE CSS STARTER\n:focus-visible {\n  outline: $width solid $ring;\n  outline-offset: $offset;\n}\n\n@media (prefers-color-scheme: dark) {\n  :focus-visible { outline-color: $darkRing; }\n}\n\n@media (forced-colors: active) {\n  :focus-visible { outline: 3px solid Highlight; outline-offset: 3px; }\n}\n\nKeep the indicator visible and unclipped; verify contrast against adjacent surfaces."
        }
        "keyboard-navigation" -> "KEYBOARD REVIEW\n\nTab / Shift+Tab: logical order\nEnter / Space: expected activation\nEscape: closes dismissible overlays\nNo keyboard trap; visible focus remains present."
        "motion" -> "REDUCED MOTION CSS\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    scroll-behavior: auto !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n  }\n}\n\nPreserve essential feedback when reducing motion."
        "color-blindness" -> colorVisionReport(foreground, background)
        "font-size" -> "FLUID TYPE SCALE CSS STARTER\n\n:root {\n  --type-body: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);\n  --type-lead: clamp(1.125rem, 1rem + 0.6vw, 1.375rem);\n  --type-heading: clamp(1.75rem, 1.35rem + 1.8vw, 2.5rem);\n}\n\nTest 200% text resizing, 400% zoom, and narrow screens. These are starting values, not conformance thresholds."
        "line-height" -> "LINE-HEIGHT SCALE CSS STARTER\n\n:root {\n  --leading-tight: 1.2;\n  --leading-heading: 1.3;\n  --leading-body: 1.5;\n  --leading-relaxed: 1.75;\n}\nbody { line-height: var(--leading-body); }\n\nVerify user text-spacing overrides and ensure content is not clipped."
        "text-readability" -> if (pattern.isBlank()) "READABILITY STARTER\nPaste English text to create a reviewable plain-language draft. The local substitutions are limited and do not certify a reading level.\n\nUse clear headings, short sentences, concrete words, and one idea per paragraph." else "PLAIN-LANGUAGE DRAFT · Heuristic, not an automatic rewrite\n\nOriginal:\n$pattern\n\nSuggested wording:\n${plainLanguageDraft(pattern)}\n\nReview carefully: substitutions can change nuance or technical meaning. Test with intended readers."
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
