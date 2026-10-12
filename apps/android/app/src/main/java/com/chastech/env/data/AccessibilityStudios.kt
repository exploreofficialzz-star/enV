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
    AccessibilityStudioSpec("contrast-checker", "contrast-checker", "color-contrast-studio", "Color Contrast Studio", "WCAG 2.2 contrast with clear PASS/FAIL, suggested fixes, full color-vision simulation, and on-device processing — no upload, no account.", listOf("contrast", "accessible-color", "color-blindness"), listOf("wcag", "wcag 2.2", "contrast ratio", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "color blindness", "local", "privacy")),
    AccessibilityStudioSpec("alt-text-checker", "alt-text-checker", "alt-text-studio", "Alt Text Studio", "Severity-based alt checks, writing coach drafts, and batch triage on-device with export-ready findings.", listOf("alt-text"), listOf("image description", "alternative text", "screen reader", "decorative image", "bulk images", "local")),
    AccessibilityStudioSpec("focus-state-checker", "focus-state-checker", "focus-state-studio", "Focus State Studio", "Production :focus-visible CSS with dark and forced-colors rules, plus a clear verification checklist — features others often paywall.", listOf("focus-state"), listOf("focus visible", "focus ring", "keyboard focus", "forced colors", "dark mode", "local")),
    AccessibilityStudioSpec("text-readability-checker", "text-readability-checker", "text-readability-studio", "Text & Readability Studio", "Readability scores, plain-language simplify drafts, and type-scale checks — private and instant on your device.", listOf("text-readability", "font-size", "line-height"), listOf("plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom", "local")),
    AccessibilityStudioSpec("aria-checker", "aria-checker", "aria-studio", "ARIA Studio", "Name and state inspection, common pattern snippets, and a local accessibility-tree style preview.", listOf("aria"), listOf("accessible name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs")),
    AccessibilityStudioSpec("motion-checker", "motion-checker", "motion-reduced-motion-studio", "Motion & Reduced Motion Studio", "Motion CSS review and reduced-motion alternatives on-device; findings stay on your device.", listOf("motion"), listOf("animation", "transition", "prefers-reduced-motion", "vestibular", "flash", "local")),
    AccessibilityStudioSpec("keyboard-navigation-checker", "keyboard-navigation-checker", "keyboard-navigation-studio", "Keyboard Navigation Studio", "Keyboard-operability risks, logical focus order practice, and trap detection with clear fix guidance.", listOf("keyboard-navigation"), listOf("tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape")),
    AccessibilityStudioSpec("form-checker", "form-checker", "form-accessibility-studio", "Form Accessibility Studio", "Label and error-description review plus accessible validation flow practice — all on-device.", listOf("form"), listOf("form labels", "validation", "error message", "aria-invalid", "aria-describedby", "input")),
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
