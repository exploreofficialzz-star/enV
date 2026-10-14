package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern
import java.util.regex.PatternSyntaxException

/**
 * Bounded, local regex preview data for the native Android Regex Studio.
 * Offsets use java.util.regex UTF-16 character indexes and the engine is not JavaScript RegExp.
 */
internal object NativeRegexHighlight {
    private const val MAX_PATTERN = 2_048
    private const val MAX_SAMPLE = 32_768
    private const val MAX_MATCHES = 100
    private val risky = Regex("(?:\\([^)]*[+*][^)]*\\)[+*{]|(?:\\.\\*|\\.\\+).*(?:\\.\\*|\\.\\+)|\\([^)]*\\|[^)]*\\)[+*{]|\\\\[1-9][+*{])")

    fun build(pattern: String, sample: String, flags: String = ""): String {
        require(pattern.length <= MAX_PATTERN) { "Pattern exceeds $MAX_PATTERN characters." }
        require(sample.length <= MAX_SAMPLE) { "Live highlight supports up to $MAX_SAMPLE UTF-16 code units." }
        require(flags.all { it in "gimsu" }) { "Supported UI flags are g, i, m, s, u; this preview uses java.util.regex semantics." }
        require(flags.toSet().size == flags.length) { "Duplicate regex flags are not allowed." }
        require(!(isRisky(pattern) && sample.length > 24)) {
            "Live preview skipped: this pattern resembles catastrophic backtracking and the sample exceeds 24 characters. Simplify the pattern or shorten the sample."
        }
        var bit = 0
        if (flags.contains('i')) bit = bit or Pattern.CASE_INSENSITIVE
        if (flags.contains('m')) bit = bit or Pattern.MULTILINE
        if (flags.contains('s')) bit = bit or Pattern.DOTALL
        if (flags.contains('u')) bit = bit or Pattern.UNICODE_CHARACTER_CLASS
        val compiled = try {
            Pattern.compile(pattern, bit)
        } catch (e: PatternSyntaxException) {
            throw IllegalArgumentException("Invalid regex: ${e.description}")
        }
        val namedGroups = namedCaptureGroups(pattern)
        val matcher = compiled.matcher(sample)
        val matches = JSONArray()
        val starts = ArrayList<Int>()
        val ends = ArrayList<Int>()
        var total = 0
        while (matcher.find()) {
            total++
            if (total > MAX_MATCHES) break
            starts += matcher.start()
            ends += matcher.end()
            val groups = JSONArray()
            for (groupIndex in 1..matcher.groupCount()) {
                val start = matcher.start(groupIndex)
                val end = matcher.end(groupIndex)
                groups.put(JSONObject()
                    .put("groupIndex", groupIndex)
                    .put("groupName", namedGroups[groupIndex] ?: JSONObject.NULL)
                    .put("start", if (start >= 0) start else JSONObject.NULL)
                    .put("end", if (end >= 0) end else JSONObject.NULL)
                    .put("text", matcher.group(groupIndex)?.let { it } ?: JSONObject.NULL))
            }
            matches.put(JSONObject()
                .put("matchIndex", total - 1)
                .put("start", matcher.start())
                .put("end", matcher.end())
                .put("text", matcher.group())
                .put("groups", groups))
        }
        val segments = JSONArray()
        var cursor = 0
        for (i in starts.indices) {
            val start = starts[i]
            val end = ends[i]
            if (start > cursor) {
                segments.put(JSONObject().put("text", sample.substring(cursor, start)).put("isMatch", false).put("matchIndex", JSONObject.NULL))
            }
            if (end > start) segments.put(JSONObject().put("text", sample.substring(start, end)).put("isMatch", true).put("matchIndex", i))
            cursor = maxOf(cursor, end)
        }
        if (cursor < sample.length) {
            segments.put(JSONObject().put("text", sample.substring(cursor)).put("isMatch", false).put("matchIndex", JSONObject.NULL))
        }
        if (segments.length() == 0 && sample.isNotEmpty()) {
            segments.put(JSONObject().put("text", sample).put("isMatch", false).put("matchIndex", JSONObject.NULL))
        }
        return JSONObject()
            .put("engine", "java.util.regex")
            .put("matchCount", minOf(total, MAX_MATCHES))
            .put("truncated", total > MAX_MATCHES)
            .put("matches", matches)
            .put("segments", segments)
            .toString(2)
    }

    private fun isRisky(pattern: String): Boolean = risky.containsMatchIn(pattern)

    /** Count true capture groups while ignoring escapes, character classes and lookarounds. */
    private fun namedCaptureGroups(pattern: String): Map<Int, String> {
        val result = mutableMapOf<Int, String>()
        var groupNumber = 0
        var index = 0
        var escaped = false
        var inClass = false
        while (index < pattern.length) {
            val ch = pattern[index]
            if (escaped) { escaped = false; index++; continue }
            if (ch == '\\') { escaped = true; index++; continue }
            if (inClass) { if (ch == ']') inClass = false; index++; continue }
            if (ch == '[') { inClass = true; index++; continue }
            if (ch != '(') { index++; continue }
            if (index + 1 >= pattern.length || pattern[index + 1] != '?') {
                groupNumber++; index++; continue
            }
            if (index + 3 < pattern.length && pattern[index + 2] == '<' && pattern[index + 3] != '=' && pattern[index + 3] != '!') {
                val close = pattern.indexOf('>', index + 3)
                if (close > index + 3) {
                    groupNumber++
                    result[groupNumber] = pattern.substring(index + 3, close)
                    index = close + 1
                    continue
                }
            }
            index++
        }
        return result
    }
}
