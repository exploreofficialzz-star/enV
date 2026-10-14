package com.chastech.env.engine

/**
 * Pure Kotlin, on-device heuristics for suggesting a Developer Studio from pasted text.
 * This type performs no clipboard read, persistence, or network activity.
 */
data class DeveloperInputHint(
    val kind: String,
    val confidence: String,
    val studioSlug: String,
    val modeKey: String,
    val reason: String,
)

object NativeDeveloperSmartDetect {
    private val jwt = Regex("""^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$""")
    private val uuid = Regex("""^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89a-fA-F][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$""")
    private val ts10 = Regex("""^\d{10}$""")
    private val ts13 = Regex("""^\d{13}$""")
    private val md5 = Regex("""^[0-9a-fA-F]{32}$""")
    private val sha1 = Regex("""^[0-9a-fA-F]{40}$""")
    private val sha256 = Regex("""^[0-9a-fA-F]{64}$""")
    private val sha384 = Regex("""^[0-9a-fA-F]{96}$""")
    private val sha512 = Regex("""^[0-9a-fA-F]{128}$""")
    private val percentEscape = Regex("""%[0-9a-fA-F]{2}""")
    private val base64 = Regex("""^[A-Za-z0-9+/]+=*$""")

    fun detect(raw: String): DeveloperInputHint? {
        val input = raw.trim()
        if (input.isEmpty()) return null
        if (jwt.matches(input) && input.split('.').size == 3) {
            return DeveloperInputHint("jwt", "high", "jwt-studio", "decode", "Looks like a JWT (three base64url segments).")
        }
        if (uuid.matches(input) || input.equals("00000000-0000-0000-0000-000000000000", true) || input.equals("ffffffff-ffff-ffff-ffff-ffffffffffff", true)) {
            return DeveloperInputHint("uuid", "high", "uuid-studio", "validate", "Looks like a canonical UUID.")
        }
        if (ts10.matches(input) || ts13.matches(input)) {
            return DeveloperInputHint("timestamp", "medium", "time-cron-studio", "timestamp", "Looks like a Unix timestamp (seconds or milliseconds).")
        }
        val parts = input.split(Regex("\\s+"))
        if (parts.size == 5 && input.length < 120 && input.any { it == '*' || it == '/' || it == ',' || it == '-' }) {
            return DeveloperInputHint("cron", "medium", "time-cron-studio", "explain", "Looks like a 5-field cron expression.")
        }
        if ((input.startsWith("{") && input.endsWith("}")) || (input.startsWith("[") && input.endsWith("]"))) {
            return DeveloperInputHint("json", "high", "json-studio", "format", "Looks like JSON object or array text.")
        }
        val digest = when {
            md5.matches(input) -> "md5-hex"
            sha1.matches(input) -> "sha1-hex"
            sha256.matches(input) -> "sha256-hex"
            sha384.matches(input) -> "sha384-hex"
            sha512.matches(input) -> "sha512-hex"
            else -> null
        }
        if (digest != null) return DeveloperInputHint(digest, "medium", "hash-studio", "compare", "Looks like a ${input.length}-char hexadecimal digest.")
        val compact = input.replace(Regex("\\s+"), "")
        if (compact.length >= 16 && compact.length % 4 == 0 && base64.matches(compact)) {
            return DeveloperInputHint("base64", "medium", "encoding-studio", "base64", "Looks like Base64 text.")
        }
        if (input.startsWith("http://", true) || input.startsWith("https://", true) || percentEscape.containsMatchIn(input)) {
            return DeveloperInputHint("url", "medium", "encoding-studio", "url", "Looks like a URL or percent-encoded text.")
        }
        return null
    }
}
