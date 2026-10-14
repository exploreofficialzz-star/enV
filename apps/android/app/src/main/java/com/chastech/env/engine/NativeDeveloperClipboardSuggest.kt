package com.chastech.env.engine

/**
 * Optional clipboard smart-suggest for Developer Studios on Android.
 * Reads text only when the caller supplies clipboard content; does not register
 * a persistent clipboard listener (privacy: no background monitoring).
 */
object NativeDeveloperClipboardSuggest {
    /**
     * @param clipboardText text already read by the UI layer from ClipboardManager
     * @return JSON hint or null if nothing useful detected
     */
    fun suggest(clipboardText: String?): String? {
        if (clipboardText.isNullOrBlank()) return null
        val hint = NativeDeveloperSmartDetect.detect(clipboardText) ?: return null
        return """{"kind":"${hint.kind}","confidence":"${hint.confidence}","studioSlug":"${hint.studioSlug}","modeKey":"${hint.modeKey}","reason":${org.json.JSONObject.quote(hint.reason)}}"""
    }
}
