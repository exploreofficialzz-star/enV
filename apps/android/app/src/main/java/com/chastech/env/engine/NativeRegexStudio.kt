package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import kotlin.math.ceil

/**
 * Native Android Regex Studio. This deliberately uses java.util.regex and labels its engine;
 * it does not pretend Kotlin/Java matching is identical to browser JavaScript RegExp.
 * Work is synchronous in the caller, so this class never promises a hard, killable timeout.
 * Instead, suspect nested-backtracking patterns are refused on non-trivial samples, input sizes
 * are bounded, and benchmark runs stop between iterations. The web Worker can be terminated;
 * Android's java.util.regex matcher cannot reliably be interrupted once inside Matcher.find().
 */
internal object NativeRegexStudio {
    private const val MAX_PATTERN = 2_048
    private const val MAX_SAMPLES = 100
    private const val MAX_SAMPLE_LENGTH = 32_768
    private const val MAX_TOTAL_BYTES = 1_000_000
    private const val MAX_MATCHES = 250
    private const val MAX_PIPELINE_INPUT = 100_000
    private const val MAX_PIPELINE_OUTPUT = 250_000
    private const val MAX_BENCHMARK_SAMPLE = 4_096
    private const val BENCHMARK_BUDGET_MS = 750L
    private val risky = Regex("(?:\\([^)]*[+*][^)]*\\)[+*{]|(?:\\.\\*|\\.\\+).*(?:\\.\\*|\\.\\+)|\\([^)]*\\|[^)]*\\)[+*{]|\\\\[1-9][+*{])")

    private data class Sample(val label: String, val text: String, val expectMatch: Boolean? = null, val expectMatches: Int? = null)
    private data class ParsedSamples(val rows: List<Sample>, val config: JSONObject?)

    fun run(pattern: String, rawSamples: String, flagsRaw: String, replacement: String, modeRaw: String): String {
        require(pattern.length <= MAX_PATTERN) { "Regex pattern exceeds $MAX_PATTERN characters on Android; shorten it before execution." }
        val mode = modeRaw.lowercase(Locale.ROOT).ifBlank { "test" }
        require(mode in setOf("test", "benchmark", "pipeline", "format", "flavors")) { "Unknown Regex Studio mode '$mode'." }
        if (mode == "format") return formatPattern(pattern)
        if (mode == "flavors") return analyzeFlavors(pattern)
        val flags = normalizeFlags(flagsRaw)
        if (mode == "pipeline") return runPipeline(pattern, rawSamples, flags, replacement)
        val parsed = parseSamples(rawSamples)
        require(parsed.rows.isNotEmpty()) { "Enter at least one test sample." }
        val totalBytes = parsed.rows.sumOf { it.text.toByteArray(Charsets.UTF_8).size }
        require(totalBytes <= MAX_TOTAL_BYTES) { "Regex sample inputs exceed the local 1 MB processing limit." }
        parsed.rows.forEachIndexed { index, sample ->
            require(sample.text.length <= MAX_SAMPLE_LENGTH) { "Sample ${index + 1} exceeds $MAX_SAMPLE_LENGTH UTF-16 code units on Android." }
        }
        val compiled = compile(pattern, flags)
        val namedCaptures = namedCaptureGroups(pattern)
        if (mode == "benchmark") return benchmark(compiled, pattern, parsed.rows, parsed.config)
        val rows = JSONArray()
        var aggregateMatches = 0
        for (sample in parsed.rows) {
            if (isRisky(pattern) && sample.text.length > 24) {
                rows.put(JSONObject().put("label", sample.label).put("matched", JSONObject.NULL)
                    .put("matchCount", JSONObject.NULL).put("executionSkipped", true)
                    .put("performanceRisk", "Pattern resembles catastrophic backtracking; native execution was skipped for this sample longer than 24 UTF-16 code units.")
                    .put("samplePreview", preview(sample.text)))
                continue
            }
            val started = System.nanoTime()
            val matcher = compiled.matcher(sample.text)
            val matches = JSONArray()
            var count = 0
            while (matcher.find()) {
                count++
                if (matches.length() < MAX_MATCHES) {
                    val groups = JSONArray()
                    for (group in 1..matcher.groupCount()) groups.put(matcher.group(group)?.let(::preview) ?: JSONObject.NULL)
                    val named = JSONObject()
                    val captures = JSONArray()
                    for ((groupIndex, name) in namedCaptures) {
                        val captured = matcher.group(groupIndex)?.let(::preview) ?: JSONObject.NULL
                        named.put(name, captured)
                        captures.put(JSONObject().put("name", name).put("group", groupIndex).put("value", captured))
                    }
                    matches.put(JSONObject().put("match", preview(matcher.group())).put("start", matcher.start())
                        .put("end", matcher.end()).put("groups", groups).put("namedGroups", named).put("captures", captures))
                }
                // Read one extra match to distinguish exactly-at-limit from a truncated result.
                if (count > MAX_MATCHES) break
            }
            val reportedCount = count.coerceAtMost(MAX_MATCHES)
            aggregateMatches += reportedCount
            val matched = count > 0
            val row = JSONObject().put("label", sample.label).put("matched", matched)
                .put("matchCount", reportedCount).put("matchCountLowerBound", if (count > MAX_MATCHES) MAX_MATCHES + 1 else reportedCount)
                .put("matches", matches).put("truncated", count > MAX_MATCHES)
                .put("samplePreview", preview(sample.text)).put("elapsedMs", (System.nanoTime() - started) / 1_000_000.0)
                .put("executionSkipped", false)
            if (sample.expectMatch != null || sample.expectMatches != null) {
                row.put("assertionPassed", (sample.expectMatch == null || sample.expectMatch == matched) && (sample.expectMatches == null || sample.expectMatches == count))
            }
            if (replacement.isNotEmpty()) {
                require(sample.text.length <= MAX_BENCHMARK_SAMPLE) { "Replacement previews are limited to $MAX_BENCHMARK_SAMPLE characters per sample." }
                row.put("replacementPreview", preview(compiled.matcher(sample.text).replaceAll(replacement), 1_000))
            }
            rows.put(row)
        }
        return JSONObject().put("mode", "test").put("engine", "Android java.util.regex / Pattern")
            .put("sampleCount", parsed.rows.size).put("matchCount", aggregateMatches).put("results", rows)
            .put("executionBudget", "No hard killable timeout: Java Matcher calls cannot be reliably interrupted. Risk heuristics and input bounds are applied; use simple patterns for large/untrusted text.")
            .put("privacy", "No input history is persisted by this engine. Results show bounded previews, not full source samples.").toString(2)
    }

    /** Maps Java-style (?<name>...) captures to numbered groups without counting escaped parens,
     * character classes, non-capturing groups, lookarounds, or inline flag groups. */
    private fun namedCaptureGroups(pattern: String): List<Pair<Int, String>> {
        val result = mutableListOf<Pair<Int, String>>()
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
                    result += groupNumber to pattern.substring(index + 3, close)
                    index = close + 1
                    continue
                }
            }
            index++
        }
        return result
    }

    private fun parseSamples(raw: String): ParsedSamples {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
            require(raw.isNotEmpty()) { "Enter a sample string, or a JSON array of strings/sample objects." }
            return ParsedSamples(listOf(Sample("Sample 1", raw)), null)
        }
        val parsed: Any = try {
            if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed)
        } catch (error: Exception) {
            throw IllegalArgumentException("Input begins like JSON but is invalid: ${error.message ?: "parse error"}")
        }
        var config: JSONObject? = null
        val items = when (parsed) {
            is JSONArray -> (0 until parsed.length()).map { parsed.get(it) }
            is JSONObject -> {
                config = parsed
                val samples = parsed.optJSONArray("samples") ?: throw IllegalArgumentException("JSON object needs a 'samples' array.")
                (0 until samples.length()).map { samples.get(it) }
            }
            else -> throw IllegalArgumentException("Use a JSON array or an object containing 'samples'.")
        }
        require(items.isNotEmpty() && items.size <= MAX_SAMPLES) { "Regex Studio accepts 1–$MAX_SAMPLES samples per run." }
        val rows = items.mapIndexed { index, item ->
            when (item) {
                is String -> Sample("Sample ${index + 1}", item)
                is JSONObject -> {
                    val text = item.opt("text").takeIf { it is String } as? String
                        ?: item.opt("sample").takeIf { it is String } as? String
                        ?: throw IllegalArgumentException("Sample ${index + 1} needs a string 'text' field.")
                    val expectMatch = if (item.has("expectMatch")) {
                        require(item.opt("expectMatch") is Boolean) { "Sample ${index + 1} expectMatch must be boolean." }
                        item.getBoolean("expectMatch")
                    } else null
                    val expectMatches = if (item.has("expectMatches")) {
                        val count = item.optInt("expectMatches", -1)
                        require(count >= 0 && item.opt("expectMatches") is Number) { "Sample ${index + 1} expectMatches must be a non-negative integer." }
                        count
                    } else null
                    Sample(item.optString("label", "Sample ${index + 1}").take(120), text, expectMatch, expectMatches)
                }
                else -> throw IllegalArgumentException("Regex sample ${index + 1} must be a string or object.")
            }
        }
        return ParsedSamples(rows, config)
    }

    private fun normalizeFlags(raw: String): String {
        val allowed = setOf('g', 'i', 'm', 's', 'u')
        val unknown = raw.filter { it !in allowed }.toSet().sorted()
        require(unknown.isEmpty()) { "Android uses java.util.regex; unsupported flags: ${unknown.joinToString("")}. Supported UI flags: g, i, m, s, u." }
        return raw.toSet().joinToString("")
    }

    private fun compile(pattern: String, flags: String): Pattern {
        var options = 0
        if ('i' in flags) options = options or Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
        if ('m' in flags) options = options or Pattern.MULTILINE
        if ('s' in flags) options = options or Pattern.DOTALL
        if ('u' in flags) options = options or Pattern.UNICODE_CHARACTER_CLASS
        return try { Pattern.compile(pattern, options) } catch (error: Exception) {
            throw IllegalArgumentException("Invalid Android java.util.regex pattern: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    private fun runPipeline(defaultPattern: String, raw: String, flags: String, defaultReplacement: String): String {
        require(raw.length <= MAX_PIPELINE_INPUT + 100_000) { "Pipeline configuration exceeds the JSON/input size limit." }
        val config = try { JSONObject(raw) } catch (error: Exception) { throw IllegalArgumentException("Pipeline input must be JSON with input and layers.") }
        require(config.has("input") && config.opt("input") is String) { "Pipeline needs a string 'input'." }
        var current = config.getString("input")
        require(current.length <= MAX_PIPELINE_INPUT) { "Pipeline input exceeds $MAX_PIPELINE_INPUT characters." }
        val layers = config.optJSONArray("layers") ?: throw IllegalArgumentException("Pipeline needs a 'layers' array.")
        require(layers.length() in 1..12) { "Pipeline must contain between 1 and 12 layers." }
        val reports = JSONArray()
        var blocked = false
        for (index in 0 until layers.length()) {
            val layer = layers.optJSONObject(index) ?: throw IllegalArgumentException("Pipeline layer ${index + 1} must be an object.")
            val layerPattern = layer.optString("pattern", if (index == 0) defaultPattern else "")
            val layerFlags = normalizeFlags(layer.optString("flags", flags))
            val replace = layer.optString("replacement", if (index == 0) defaultReplacement else "")
            require(layerPattern.isNotEmpty()) { "Pipeline layer ${index + 1} needs a pattern." }
            val row = JSONObject().put("index", index + 1).put("name", layer.optString("name", "Layer ${index + 1}"))
            if (blocked) {
                row.put("status", "blocked").put("note", "A previous layer was blocked; this layer was not executed.")
            } else if (isRisky(layerPattern) && current.length > 24) {
                blocked = true
                row.put("status", "blocked-risk").put("inputLength", current.length)
                    .put("note", "Risk heuristic blocked this backtracking-prone pattern on a non-trivial input.")
            } else {
                val compiled = compile(layerPattern, layerFlags)
                val stageInputLength = current.length
                val start = System.nanoTime()
                val matcher = compiled.matcher(current)
                var replacements = 0
                while (matcher.find()) { replacements++; if (replacements > 100_000) throw IllegalArgumentException("Layer ${index + 1} exceeds 100,000 matches.") }
                current = compiled.matcher(current).replaceAll(replace)
                require(current.length <= MAX_PIPELINE_OUTPUT) { "Pipeline layer ${index + 1} exceeds $MAX_PIPELINE_OUTPUT output characters." }
                row.put("status", "ok").put("replacements", replacements).put("inputLength", stageInputLength)
                    .put("outputLength", current.length).put("elapsedMs", (System.nanoTime() - start) / 1_000_000.0)
                    .put("outputPreview", preview(current, 2_000))
            }
            reports.put(row)
        }
        return JSONObject().put("mode", "pipeline").put("engine", "Android java.util.regex / Pattern")
            .put("layers", reports).put("blocked", blocked).put("finalOutputPreview", preview(current, 8_000))
            .put("finalOutputLength", current.length).put("executionBudget", "No single-call hard interrupt exists for java.util.regex; high-risk patterns are refused on non-trivial inputs.")
            .put("privacy", "Pipeline input is transient and is not persisted by this engine.").toString(2)
    }

    private fun benchmark(pattern: Pattern, source: String, samples: List<Sample>, config: JSONObject?): String {
        if (isRisky(source)) return JSONObject().put("mode", "benchmark").put("engine", "Android java.util.regex / Pattern")
            .put("executionSkipped", true).put("performanceRisk", "Benchmark skipped: static scan found a likely catastrophic-backtracking pattern. Static scans are not proof of safety.")
            .put("note", "No benchmark iterations executed.").toString(2)
        require(samples.all { it.text.length <= MAX_BENCHMARK_SAMPLE } && samples.sumOf { it.text.length } <= 16_384) {
            "Native benchmark inputs are limited to 4,096 characters per sample and 16,384 characters combined."
        }
        val requested = config?.optInt("iterations", 15) ?: 15
        val iterations = requested.coerceIn(5, 30)
        val timings = mutableListOf<Double>()
        val started = System.nanoTime()
        var completed = 0
        for (iteration in 0 until iterations) {
            val t0 = System.nanoTime()
            for (sample in samples) pattern.matcher(sample.text).find()
            timings += (System.nanoTime() - t0) / 1_000_000.0
            completed++
            if ((System.nanoTime() - started) / 1_000_000 > BENCHMARK_BUDGET_MS) break
        }
        val sorted = timings.sorted()
        fun percentile(p: Double): Double = sorted[(ceil(p * sorted.size).toInt() - 1).coerceIn(0, sorted.lastIndex)]
        val mean = timings.average()
        val jitter = kotlin.math.sqrt(timings.map { (it - mean) * (it - mean) }.average())
        return JSONObject().put("mode", "benchmark").put("engine", "Android java.util.regex / Pattern")
            .put("completedIterations", completed).put("requestedIterations", iterations).put("medianMs", percentile(0.5))
            .put("p95Ms", percentile(0.95)).put("minMs", sorted.first()).put("maxMs", sorted.last()).put("jitterStdDevMs", jitter)
            .put("samples", samples.size).put("sampleCharacters", samples.sumOf { it.text.length })
            .put("budgetMs", BENCHMARK_BUDGET_MS).put("budgetStoppedBetweenIterations", completed < iterations)
            .put("note", "Native microbenchmark only: not comparable across devices, and a single platform regex call cannot be forcefully interrupted. Pattern was screened by a heuristic, not proven safe.")
            .toString(2)
    }

    private fun formatPattern(pattern: String): String {
        val tokens = tokenize(pattern)
        return JSONObject().put("mode", "format").put("engine", "Android java.util.regex / Pattern")
            .put("original", pattern).put("tokens", JSONArray(tokens)).put("roundTripExact", tokens.joinToString("") == pattern)
            .put("formattedDisplay", tokens.joinToString("\n") { "  $it" })
            .put("note", "Readable token display only; it does not insert semantic free-spacing whitespace. Concatenating tokens reconstructs the exact pattern.").toString(2)
    }

    private fun analyzeFlavors(pattern: String): String {
        val findings = JSONArray()
        fun add(feature: String, detail: String, severity: String = "warning") { findings.put(JSONObject().put("feature", feature).put("detail", detail).put("severity", severity)) }
        if (Regex("\\(\\?P<").containsMatchIn(pattern)) add("Python named capture", "Python uses (?P<name>...), while Android Java regex uses (?<name>...) on supported runtimes.", "error")
        if (Regex("\\\\[AKzZ]").containsMatchIn(pattern)) add("Absolute anchors", "\\A, \\Z and \\z have flavor-specific behavior and are not JavaScript-portable.")
        if (pattern.contains("\\K")) add("Match reset", "PCRE2 \\K is not supported by Android java.util.regex.", "error")
        if (pattern.contains("(?<=" ) || pattern.contains("(?<!")) add("Lookbehind", "Lookbehind acceptance and fixed/variable-length rules differ among Android API levels and regex runtimes.")
        if (Regex("\\([^)]*[+*][^)]*\\)[+*{]").containsMatchIn(pattern)) add("Nested repetition", "Nested repetition may cause excessive backtracking; this is a risk signal, not proof of a vulnerability.")
        if (findings.length() == 0) add("No covered portability marker", "Static hints only; this does not compile the pattern under JavaScript, PCRE2, Python, .NET, Go, and every Android version.", "info")
        return JSONObject().put("mode", "flavors").put("nativeEngine", "Android java.util.regex / Pattern")
            .put("coveredComparisons", JSONArray(listOf("JavaScript RegExp", "PCRE2", "Python", "Java/.NET", "Go RE2")))
            .put("findings", findings).put("note", "Static compatibility hints only. No automatic flavor conversion or cross-engine equivalence is claimed.").toString(2)
    }

    private fun tokenize(pattern: String): List<String> {
        val tokens = mutableListOf<String>(); var i = 0
        while (i < pattern.length) {
            val start = i
            when (pattern[i]) {
                '\\' -> { i++; if (i < pattern.length && pattern[i] == 'k' && pattern.getOrNull(i + 1) == '<') { i += 2; while (i < pattern.length && pattern[i] != '>') i++; if (i < pattern.length) i++ } else if (i < pattern.length) i++ }
                '[' -> { i++; var escaped = false; while (i < pattern.length) { val c = pattern[i++]; if (escaped) escaped = false else if (c == '\\') escaped = true else if (c == ']') break } }
                '(' -> { i++; if (i < pattern.length && pattern[i] == '?') { i++; if (i < pattern.length && pattern[i] in setOf(':', '=', '!')) i++ else if (i < pattern.length && pattern[i] == '<') { i++; while (i < pattern.length && pattern[i] != '>') i++; if (i < pattern.length) i++ } } }
                '{' -> { val found = Regex("^\\{\\d+(?:,\\d*)?}").find(pattern.substring(i)); i += found?.value?.length ?: 1 }
                else -> i++
            }
            tokens += pattern.substring(start, i)
        }
        return tokens
    }

    private fun isRisky(pattern: String) = risky.containsMatchIn(pattern)
    private fun preview(value: String, max: Int = 500): String = if (value.length <= max) value else value.take(max) + "… [truncated; ${value.length} total chars]"
}
