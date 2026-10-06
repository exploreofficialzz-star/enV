package com.chastech.env.data

/**
 * Rewrites catalog copy that was written for the website so native Android
 * screens never show in-browser language. Names, keywords, and tags are left
 * unchanged so product names like "Chrome Browser Frame" and user-agent search
 * terms keep working.
 */
object NativeCopy {
    val webRuntimeOnlyToolIds: Set<String> = setOf(
        "connection-info",
        "media-capability-checker",
        "media-runtime-inspector",
        "mediarecorder-support-checker",
        "video-audio-track-checker",
        "video-codec-support-checker",
        "webcodecs-audio-checker",
        "webcodecs-video-checker",
    )

    fun isWebRuntimeOnly(toolId: String): Boolean = toolId in webRuntimeOnlyToolIds

    fun text(value: String): String {
        if (value.isEmpty()) return value
        val placeholders = mutableListOf<String>()
        var out = value
        fun protect(pattern: Regex) {
            out = pattern.replace(out) { match ->
                placeholders += match.value
                "\u0000${placeholders.lastIndex}\u0000"
            }
        }
        protect(Regex("headless browser", RegexOption.IGNORE_CASE))
        protect(Regex("(Chrome|Firefox|Safari) Browser", RegexOption.IGNORE_CASE))
        protect(Regex("into browser,\\s*OS", RegexOption.IGNORE_CASE))
        protect(Regex("Browser frames", RegexOption.IGNORE_CASE))

        val replacements = listOf(
            "locally in your browser" to "locally on this device",
            "locally in the browser" to "locally on this device",
            "entirely in your browser" to "entirely on this device",
            "entirely in the browser" to "entirely on this device",
            "computed in the browser" to "computed on this device",
            "Data stays in the browser" to "Data stays on this device",
            "without leaving the browser" to "without leaving the app",
            "all in the browser" to "all on this device",
            "in your browser" to "on this device",
            "in the current browser" to "on this device",
            "in the browser" to "on this device",
            "in-browser" to "on-device",
            "browser-supported" to "supported",
            "browser interpolation" to "interpolation",
            "your browser provides native" to "this device provides native",
            "the browser supports it" to "this device supports it",
            "where the browser supports it" to "where this device supports it",
            "using browser media capture" to "using on-device media capture",
            "browser media APIs" to "on-device media APIs",
            "Inspect browser, native" to "Inspect native",
            "whether the browser exposes" to "whether this device exposes",
            "Inspect browser support for common browser-recordable" to "Inspect support for common recordable",
            "the browser processing pipeline" to "the on-device processing pipeline",
            "browser processing" to "on-device processing",
            "browser-readable" to "readable",
            "browser-native WebM" to "WebM",
            "browser-exposed" to "on-device",
            "where the browser allows it" to "where this device allows it",
            "Client-side PDF utilities" to "On-device PDF utilities",
        )
        for ((from, to) in replacements) {
            val pattern = Regex(Regex.escape(from), RegexOption.IGNORE_CASE)
            out = pattern.replace(out) { match ->
                if (match.value.firstOrNull()?.isUpperCase() == true) to.replaceFirstChar { it.uppercaseChar() } else to
            }
        }
        placeholders.forEachIndexed { index, original ->
            out = out.replace("\u0000$index\u0000", original)
        }
        return out
    }
}
