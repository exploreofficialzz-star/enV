package com.chastech.env.data

private data class AccessibilityStudioSpec(
    val id: String,
    val sourceId: String,
    val slug: String,
    val name: String,
    val description: String,
    val aliases: List<String>,
    val keywords: List<String>,
)

private val accessibilityStudios = listOf(
    AccessibilityStudioSpec("contrast-checker", "contrast-checker", "color-contrast-studio", "Color Contrast Studio", "Evaluate WCAG 2.2 contrast, correct color pairs, preview color-vision differences, and export tokens locally.", listOf("contrast", "accessible-color", "color-blindness"), listOf("wcag", "wcag 2.2", "apca", "contrast ratio", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "tailwind", "css variables", "color blindness")),
    AccessibilityStudioSpec("alt-text-checker", "alt-text-checker", "alt-text-studio", "Alt Text Studio", "Review image alternatives, draft concise descriptions, preview announcements, and triage batches on-device.", listOf("alt-text"), listOf("image description", "alternative text", "screen reader", "decorative image", "bulk images")),
    AccessibilityStudioSpec("focus-state-checker", "focus-state-checker", "focus-state-studio", "Focus State Studio", "Build and test visible keyboard focus styles, dark themes, and forced-colors behavior.", listOf("focus-state"), listOf("focus visible", "focus ring", "keyboard focus", "forced colors", "dark mode")),
    AccessibilityStudioSpec("text-readability-checker", "text-readability-checker", "text-readability-studio", "Text & Readability Studio", "Estimate reading difficulty, create reviewable plain-language drafts, and test type scale and spacing.", listOf("text-readability", "font-size", "line-height"), listOf("plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom")),
    AccessibilityStudioSpec("aria-checker", "aria-checker", "aria-studio", "ARIA Studio", "Inspect ARIA names and states, generate common patterns, and preview a local approximation of the accessibility tree.", listOf("aria"), listOf("accessible name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs")),
    AccessibilityStudioSpec("motion-checker", "motion-checker", "motion-reduced-motion-studio", "Motion & Reduced Motion Studio", "Review motion CSS and exercise reduced-motion alternatives without leaving your device.", listOf("motion"), listOf("animation", "transition", "prefers-reduced-motion", "vestibular", "flash")),
    AccessibilityStudioSpec("keyboard-navigation-checker", "keyboard-navigation-checker", "keyboard-navigation-studio", "Keyboard Navigation Studio", "Find keyboard-operability risks and practice logical, visible, trap-free navigation.", listOf("keyboard-navigation"), listOf("tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape")),
    AccessibilityStudioSpec("form-checker", "form-checker", "form-accessibility-studio", "Form Accessibility Studio", "Review field labels and error descriptions, then practice an accessible local validation flow.", listOf("form"), listOf("form labels", "validation", "error message", "aria-invalid", "aria-describedby", "input")),
)

private fun accessibilityKind(id: String): String = id.replace(Regex("-(checker|generator|helper|preview|simulator)$"), "")

private fun Catalog.makeAccessibilityStudio(spec: AccessibilityStudioSpec): ToolRecord? {
    val source = (tools + relatedReferenceTools).firstOrNull { it.id == spec.sourceId } ?: return null
    return source.copy(
        category = "accessibility",
        slug = spec.slug,
        name = spec.name,
        description = NativeCopy.text(spec.description),
        keywords = (source.keywords + spec.keywords + spec.aliases).distinct(),
        tags = listOf("accessibility", "studio") + spec.aliases,
        related = accessibilityStudios.filterNot { it.id == spec.id }.map { it.id },
    )
}

/** Category/search projection for one Studio per workflow. Original records stay intact for old IDs/favorites. */
fun Catalog.accessibilityDiscoveryTools(): List<ToolRecord> =
    (tools + relatedReferenceTools).filter { it.category != "accessibility" } + accessibilityStudios.mapNotNull(::makeAccessibilityStudio)

/** Resolve canonical studio aliases and all historical action-suffixed IDs. */
fun Catalog.accessibilityStudioForId(toolId: String): ToolRecord? {
    val kind = accessibilityKind(toolId)
    val spec = accessibilityStudios.firstOrNull { kind in it.aliases } ?: return null
    return makeAccessibilityStudio(spec)
}

fun Catalog.displayTool(toolId: String): ToolRecord? =
    accessibilityStudioForId(toolId) ?: tools.firstOrNull { it.id == toolId } ?: relatedReferenceTools.firstOrNull { it.id == toolId }
