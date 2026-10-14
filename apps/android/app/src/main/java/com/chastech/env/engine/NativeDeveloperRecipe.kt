package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.Normalizer

/**
 * Native Kotlin recipe implementation. It is deliberately an allow-list of deterministic text
 * transformations: no eval, shell, reflection-driven dispatch, network calls, or persisted input.
 */
internal object NativeDeveloperRecipe {
    private const val MAX_INPUT_BYTES = 1_048_576
    private const val MAX_OUTPUT_BYTES = 2_097_152
    private const val MAX_CONFIG_BYTES = 7 * 1_048_576
    private const val MAX_STEPS = 16
    private const val PREVIEW_CODE_POINTS = 1_200
    private val supported = listOf(
        "trim", "strip-bom", "normalize-newlines", "ensure-final-newline", "remove-final-newline", "collapse-whitespace", "remove-blank-lines", "sort-lines", "unique-lines", "reverse-lines",
        "unicode-normalize-nfc", "unicode-normalize-nfd", "unicode-normalize-nfkc", "unicode-normalize-nfkd", "replace-literal", "url-encode-component", "url-decode-component", "base64-encode", "base64-decode",
        "base64url-encode", "base64url-decode", "hex-encode", "hex-decode", "html-escape", "html-unescape",
        "json-format", "json-minify", "json-sort-keys", "json-validate", "json-pointer-get", "csv-to-json", "json-to-csv", "sha256-hex"
    )
    internal val supportedOperations: List<String> get() = supported

    private sealed interface JsonValue
    private data class JsonObject(val entries: MutableList<Pair<String, JsonValue>>) : JsonValue
    private data class JsonArray(val entries: List<JsonValue>) : JsonValue
    private data class JsonString(val value: String) : JsonValue
    private data class JsonNumber(val raw: String) : JsonValue
    private data class JsonLiteral(val raw: String) : JsonValue

    private class JsonSourceParser(private val source: String) {
        private var index = 0
        val duplicatePaths = mutableListOf<String>()
        fun parse(): JsonValue {
            whitespace(); val value = parseValue("$"); whitespace()
            require(index == source.length) { "Unexpected content after JSON value at character ${index + 1}." }
            return value
        }
        private fun whitespace() { while (index < source.length && source[index] in charArrayOf(' ', '\t', '\r', '\n')) index++ }
        private fun parseValue(path: String): JsonValue {
            whitespace(); require(index < source.length) { "Expected a JSON value at character ${index + 1}." }
            return when (source[index]) {
                '{' -> parseObject(path)
                '[' -> parseArray(path)
                '"' -> JsonString(parseString())
                't' -> literal("true")
                'f' -> literal("false")
                'n' -> literal("null")
                '-', in '0'..'9' -> parseNumber()
                else -> throw IllegalArgumentException("Unexpected JSON token at character ${index + 1}.")
            }
        }
        private fun parseObject(path: String): JsonObject {
            index++; whitespace(); val entries = mutableListOf<Pair<String, JsonValue>>()
            if (take('}')) return JsonObject(entries)
            val keys = mutableSetOf<String>()
            while (true) {
                whitespace(); require(index < source.length && source[index] == '"') { "Expected a JSON object key at character ${index + 1}." }
                val key = parseString(); val childPath = "$path.$key"
                if (!keys.add(key)) duplicatePaths += childPath
                whitespace(); expect(':'); val child = parseValue(childPath); entries += key to child; whitespace()
                if (take('}')) return JsonObject(entries)
                expect(','); whitespace()
                require(index < source.length && source[index] == '"') { "Expected an object key after comma at character ${index + 1}; trailing commas are invalid." }
            }
        }
        private fun parseArray(path: String): JsonArray {
            index++; whitespace(); val entries = mutableListOf<JsonValue>()
            if (take(']')) return JsonArray(entries)
            while (true) {
                entries += parseValue("$path[${entries.size}]"); whitespace()
                if (take(']')) return JsonArray(entries)
                expect(','); whitespace()
                require(index < source.length && source[index] != ']') { "Trailing comma in JSON array at character ${index + 1}." }
            }
        }
        private fun parseString(): String {
            val start = index; expect('"')
            while (index < source.length) {
                val char = source[index++]
                when {
                    char == '"' -> {
                        val raw = source.substring(start, index)
                        return try { JSONTokener(raw).nextValue() as String } catch (error: Exception) { throw IllegalArgumentException("Invalid JSON string at character ${start + 1}: ${error.message}") }
                    }
                    char == '\\' -> {
                        require(index < source.length) { "Unterminated JSON escape at character ${index + 1}." }
                        when (source[index++]) {
                            '"', '\\', '/', 'b', 'f', 'n', 'r', 't' -> Unit
                            'u' -> repeat(4) {
                                require(index < source.length && source[index].digitToIntOrNull(16) != null) { "Unicode escape must contain four hexadecimal digits at character ${index + 1}." }
                                index++
                            }
                            else -> throw IllegalArgumentException("Invalid JSON string escape at character ${index}.")
                        }
                    }
                    char.code < 0x20 -> throw IllegalArgumentException("Unescaped control character in JSON string at character ${index}.")
                }
            }
            throw IllegalArgumentException("Unterminated JSON string beginning at character ${start + 1}.")
        }
        private fun parseNumber(): JsonNumber {
            val start = index
            take('-')
            require(index < source.length) { "Invalid JSON number at character ${start + 1}." }
            if (take('0')) require(index >= source.length || source[index] !in '0'..'9') { "Leading zero in JSON number at character ${start + 1}." }
            else {
                require(index < source.length && source[index] in '1'..'9') { "Invalid JSON number at character ${start + 1}." }
                while (index < source.length && source[index] in '0'..'9') index++
            }
            if (take('.')) { require(index < source.length && source[index] in '0'..'9') { "Invalid JSON fraction at character ${index + 1}." }; while (index < source.length && source[index] in '0'..'9') index++ }
            if (index < source.length && (source[index] == 'e' || source[index] == 'E')) {
                index++; if (index < source.length && (source[index] == '+' || source[index] == '-')) index++
                require(index < source.length && source[index] in '0'..'9') { "Invalid JSON exponent at character ${index + 1}." }
                while (index < source.length && source[index] in '0'..'9') index++
            }
            return JsonNumber(source.substring(start, index))
        }
        private fun literal(raw: String): JsonLiteral {
            require(source.regionMatches(index, raw, 0, raw.length)) { "Invalid JSON literal at character ${index + 1}." }
            index += raw.length; return JsonLiteral(raw)
        }
        private fun take(char: Char): Boolean { if (index < source.length && source[index] == char) { index++; return true }; return false }
        private fun expect(char: Char) { require(take(char)) { "Expected '$char' at character ${index + 1}." } }
    }

    private fun utf8(value: String) = value.toByteArray(StandardCharsets.UTF_8)

    private fun assertRecipeJsonDepth(source: String) {
        var depth = 0; var inString = false; var escaped = false
        for (char in source) {
            if (inString) {
                if (escaped) escaped = false else if (char == '\\') escaped = true else if (char == '"') inString = false
                continue
            }
            when (char) {
                '"' -> inString = true
                '{', '[' -> {
                    depth++
                    require(depth <= 128) { "JSON nesting exceeds the safety depth of 128; split or simplify the document before processing." }
                }
                '}', ']' -> depth = (depth - 1).coerceAtLeast(0)
            }
        }
    }

    private fun assertRecipePrettyJsonFits(source: String) {
        var retainedBytes = utf8(source).size; var extraBytes = 0; var inString = false; var escaped = false
        data class Frame(val kind: Char, var hasItems: Boolean)
        val stack = mutableListOf<Frame>()
        fun markParent() { if (stack.isNotEmpty()) stack.last().hasItems = true }
        var index = 0
        while (index < source.length) {
            val char = source[index]
            if (inString) {
                if (escaped) escaped = false else if (char == '\\') escaped = true else if (char == '"') inString = false
                index++; continue
            }
            when (char) {
                '"' -> { markParent(); inString = true }
                ' ', '\t', '\r', '\n' -> retainedBytes--
                '{', '[' -> {
                    markParent(); stack += Frame(char, false)
                    var lookahead = index + 1
                    while (lookahead < source.length && source[lookahead] in charArrayOf(' ', '\t', '\r', '\n')) lookahead++
                    if (lookahead < source.length && source[lookahead] != if (char == '{') '}' else ']') extraBytes += 1 + 2 * stack.size
                }
                '}', ']' -> {
                    val frame = stack.removeLastOrNull()
                    if (frame?.hasItems == true) extraBytes += 1 + 2 * stack.size
                }
                ',' -> extraBytes += 1 + 2 * stack.size
                ':' -> extraBytes += 1
                else -> markParent()
            }
            index++
        }
        require(retainedBytes + extraBytes <= MAX_OUTPUT_BYTES) { "JSON formatting would exceed $MAX_OUTPUT_BYTES UTF-8 bytes; minify it first or reduce the input structure." }
    }

    private fun assertLiteralReplacementFits(current: String, find: String, replacement: String) {
        val currentBytes = utf8(current).size.toLong()
        val growthPerMatch = utf8(replacement).size.toLong() - utf8(find).size.toLong()
        if (growthPerMatch <= 0L) return
        val allowedMatches = (MAX_OUTPUT_BYTES.toLong() - currentBytes) / growthPerMatch
        var matches = 0L
        var searchFrom = 0
        while (true) {
            val at = current.indexOf(find, searchFrom)
            if (at < 0) return
            matches += 1
            require(matches <= allowedMatches) { "Literal replacement would exceed $MAX_OUTPUT_BYTES UTF-8 bytes; reduce the match count or replacement size before running." }
            searchFrom = at + find.length
        }
    }
    private fun codePoints(value: String) = value.codePointCount(0, value.length)
    private fun preview(value: String): String {
        val count = codePoints(value)
        if (count <= PREVIEW_CODE_POINTS) return value
        val end = value.offsetByCodePoints(0, PREVIEW_CODE_POINTS)
        return value.substring(0, end) + "… [preview truncated; $count code points total]"
    }
    private fun decodeUtf8(bytes: ByteArray): String = try {
        StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
    } catch (_: Exception) { throw IllegalArgumentException("Decoded bytes are not valid UTF-8 text; use a binary-aware workflow for arbitrary bytes.") }
    private fun compareCodePoints(left: String, right: String): Int {
        val a = left.codePoints().toArray(); val b = right.codePoints().toArray()
        for (index in 0 until minOf(a.size, b.size)) if (a[index] != b[index]) return a[index] - b[index]
        return a.size - b.size
    }
    private fun mapLines(input: String, action: (List<String>) -> List<String>): String {
        val normalized = input.replace("\r\n", "\n").replace('\r', '\n')
        val trailing = normalized.endsWith('\n')
        val lines = normalized.split('\n').toMutableList()
        if (trailing && lines.isNotEmpty()) lines.removeAt(lines.lastIndex)
        return action(lines).joinToString("\n") + if (trailing) "\n" else ""
    }
    private fun encodeBase64(input: String, urlSafe: Boolean = false): String {
        val encoder = if (urlSafe) java.util.Base64.getUrlEncoder() else java.util.Base64.getEncoder()
        return if (urlSafe) encoder.withoutPadding().encodeToString(utf8(input)) else encoder.encodeToString(utf8(input))
    }
    private fun decodeBase64(input: String, urlSafe: Boolean = false): String {
        val source = input.trim()
        val pattern = if (urlSafe) Regex("^[A-Za-z0-9_-]*={0,2}$") else Regex("^[A-Za-z0-9+/]*={0,2}$")
        require(pattern.matches(source) && source.length % 4 != 1 && (!source.contains('=') || source.length % 4 == 0)) { "Invalid ${if (urlSafe) "Base64URL" else "Base64"}: check its alphabet, padding, and length." }
        val unpadded = source.trimEnd('=')
        val normalized = if (urlSafe) unpadded.replace('-', '+').replace('_', '/') else unpadded
        val padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
        val decoder = if (urlSafe) java.util.Base64.getUrlDecoder() else java.util.Base64.getDecoder()
        val bytes = try { decoder.decode(padded) } catch (_: Exception) { throw IllegalArgumentException("Base64 input could not be decoded.") }
        val encoder = if (urlSafe) java.util.Base64.getUrlEncoder() else java.util.Base64.getEncoder()
        val canonical = encoder.withoutPadding().encodeToString(bytes)
        val canonicalStandard = if (urlSafe) canonical.replace('+', '-').replace('/', '_') else canonical
        require(canonicalStandard == unpadded) { "Base64 padding bits are not canonical; re-encode the value at its source." }
        return decodeUtf8(bytes)
    }
    private fun encodeUrl(input: String): String {
        val allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".toSet()
        return buildString { for (byte in utf8(input)) { val value = byte.toInt() and 0xff; val char = value.toChar(); if (char.code < 128 && char in allowed) append(char) else append("%${value.toString(16).uppercase().padStart(2, '0')}") } }
    }
    private fun decodeUrl(input: String): String {
        val bytes = ByteArrayOutputStream(); var index = 0
        while (index < input.length) {
            if (input[index] == '%') {
                require(index + 2 < input.length && input.substring(index + 1, index + 3).matches(Regex("[0-9a-fA-F]{2}"))) { "Invalid percent escape at character ${index + 1}; expected % followed by two hexadecimal digits." }
                bytes.write(input.substring(index + 1, index + 3).toInt(16)); index += 3
            } else {
                val cp = input.codePointAt(index); bytes.write(String(Character.toChars(cp)).toByteArray(StandardCharsets.UTF_8)); index += Character.charCount(cp)
            }
        }
        return decodeUtf8(bytes.toByteArray())
    }
    private fun encodeHex(input: String) = utf8(input).joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
    private fun decodeHex(input: String): String {
        val value = input.replace(Regex("[ \\t\\r\\n]"), "")
        require(value.length % 2 == 0 && value.matches(Regex("[a-fA-F0-9]*"))) { "Hex decode expects an even number of hexadecimal digits; spaces and line breaks are allowed." }
        return decodeUtf8(ByteArray(value.length / 2) { index -> value.substring(index * 2, index * 2 + 2).toInt(16).toByte() })
    }
    private fun htmlEscape(input: String) = input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
    private fun htmlUnescape(input: String): String = Regex("&(amp|lt|gt|quot|apos|#39|#\\d+|#x[0-9a-f]+);", RegexOption.IGNORE_CASE).replace(input) { match ->
        val raw = match.groupValues[1].lowercase()
        val named = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "#39" to "'")
        named[raw] ?: run {
            val number = if (raw.startsWith("#x")) raw.drop(2).toLongOrNull(16) else raw.drop(1).toLongOrNull()
            require(number != null && number in 0..0x10ffff && number !in 0xd800..0xdfff) { "Invalid numeric HTML character reference: ${match.value}" }
            String(Character.toChars(number.toInt()))
        }
    }
    private data class UnsafeJsonToken(val token: String, val line: Int, val column: Int)

    private fun scanUnsafeJsonIntegers(input: String): List<UnsafeJsonToken> {
        val found = mutableListOf<UnsafeJsonToken>()
        var index = 0
        while (index < input.length) {
            if (input[index] == '"') {
                index++
                while (index < input.length) {
                    if (input[index] == '\\') { index += 2; continue }
                    if (input[index++] == '"') break
                }
                continue
            }
            if (input[index] == '-' || input[index] in '0'..'9') {
                val match = Regex("^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?").find(input.substring(index))
                if (match != null) {
                    val token = match.value
                    if (!token.contains('.') && !token.contains('e', true) && token.dropWhile { it == '-' }.length > 15) {
                        val before = input.substring(0, index)
                        val line = before.count { it == '\n' } + 1
                        val lastLineBreak = before.lastIndexOf('\n')
                        val column = index - lastLineBreak
                        found += UnsafeJsonToken(token, line, column)
                    }
                    index += token.length
                    continue
                }
            }
            index++
        }
        return found
    }

    private fun recipeJsonFormatterWarnings(input: String, duplicatePaths: List<String>): List<String> {
        val unsafe = scanUnsafeJsonIntegers(input)
        val warnings = mutableListOf<String>()
        if (unsafe.isNotEmpty()) {
            val examples = unsafe.take(5).joinToString(", ") { "${it.token} (line ${it.line}, column ${it.column})" }
            warnings += "WARNING: JavaScript Number cannot safely represent this integer; value may be rounded. The formatter preserved the raw numeric token text. Detected: $examples${if (unsafe.size > 5) ", …" else ""}"
        }
        val duplicates = duplicatePaths.distinct()
        if (duplicates.isNotEmpty()) warnings += "NOTE: Duplicate object keys detected at ${duplicates.take(20).joinToString(", ")}${if (duplicates.size > 20) ", …" else ""}. Duplicate-key JSON is ambiguous; many parsers including JSON.parse keep only the last value. The formatter preserves the source keys."
        return warnings
    }

    private fun hasUnsafeIntegers(value: JsonValue, result: MutableList<String>) {
        when (value) {
            is JsonNumber -> if (!value.raw.contains('.') && !value.raw.contains('e', true)) {
                val number = value.raw.removePrefix("-")
                val max = "9007199254740991"
                if (number.length > max.length || (number.length == max.length && number > max)) result += value.raw
            }
            is JsonObject -> value.entries.forEach { hasUnsafeIntegers(it.second, result) }
            is JsonArray -> value.entries.forEach { hasUnsafeIntegers(it, result) }
            else -> Unit
        }
    }
    private fun stringify(value: JsonValue, pretty: Boolean, depth: Int = 0, sortKeys: Boolean = false): String {
        val pad = if (pretty) "  ".repeat(depth) else ""
        return when (value) {
            is JsonString -> JSONObject.quote(value.value)
            is JsonNumber -> value.raw
            is JsonLiteral -> value.raw
            is JsonArray -> if (value.entries.isEmpty()) "[]" else if (pretty) value.entries.joinToString(",\n${"  ".repeat(depth + 1)}", "[\n${"  ".repeat(depth + 1)}", "\n$pad]") { stringify(it, true, depth + 1, sortKeys) } else value.entries.joinToString(",", "[", "]") { stringify(it, false, depth + 1, sortKeys) }
            is JsonObject -> {
                val entries = if (sortKeys) value.entries.sortedWith(compareByCodePoint { it.first }) else value.entries
                if (entries.isEmpty()) "{}" else if (pretty) entries.joinToString(",\n${"  ".repeat(depth + 1)}", "{\n${"  ".repeat(depth + 1)}", "\n$pad}") { (key, item) -> "${JSONObject.quote(key)}: ${stringify(item, true, depth + 1, sortKeys)}" }
                else entries.joinToString(",", "{", "}") { (key, item) -> "${JSONObject.quote(key)}:${stringify(item, false, depth + 1, sortKeys)}" }
            }
        }
    }
    private fun compareByCodePoint(selector: (Pair<String, JsonValue>) -> String): Comparator<Pair<String, JsonValue>> = Comparator { a, b -> compareCodePoints(selector(a), selector(b)) }

    private fun parseRecipeCsv(input: String): List<List<String>> {
        val rows = mutableListOf<List<String>>(); var row = mutableListOf<String>(); val field = StringBuilder()
        var inQuotes = false; var afterQuote = false; var fieldStarted = false; var index = 0
        while (index < input.length) {
            val char = input[index]
            if (inQuotes) {
                if (char == '"') {
                    if (index + 1 < input.length && input[index + 1] == '"') { field.append('"'); index += 2 }
                    else { inQuotes = false; afterQuote = true; index++ }
                } else { field.append(char); index++ }
                continue
            }
            if (afterQuote) {
                when (char) {
                    ',' -> { row += field.toString(); field.setLength(0); fieldStarted = false; afterQuote = false; index++ }
                    '\r', '\n' -> { row += field.toString(); rows += row; row = mutableListOf(); field.setLength(0); fieldStarted = false; afterQuote = false; index += if (char == '\r' && index + 1 < input.length && input[index + 1] == '\n') 2 else 1 }
                    else -> throw IllegalArgumentException("Unexpected character after a closing CSV quote at character ${index + 1}. Only a comma, record ending, or end of input is valid.")
                }
                continue
            }
            when (char) {
                '"' -> { require(!fieldStarted && field.isEmpty()) { "Unexpected quote inside an unquoted CSV field at character ${index + 1}." }; inQuotes = true; fieldStarted = true; index++ }
                ',' -> { row += field.toString(); field.setLength(0); fieldStarted = false; index++ }
                '\r', '\n' -> { row += field.toString(); rows += row; row = mutableListOf(); field.setLength(0); fieldStarted = false; index += if (char == '\r' && index + 1 < input.length && input[index + 1] == '\n') 2 else 1 }
                else -> { field.append(char); fieldStarted = true; index++ }
            }
        }
        require(!inQuotes) { "CSV ends inside a quoted field; add its closing double quote." }
        if (row.isNotEmpty() || field.isNotEmpty() || fieldStarted || afterQuote) { row += field.toString(); rows += row }
        return rows
    }

    private fun escapeRecipeCsv(value: String): String {
        val needsQuotes = value.any { it == ',' || it == '"' || it == '\r' || it == '\n' } ||
            value.firstOrNull()?.isWhitespace() == true || value.lastOrNull()?.isWhitespace() == true
        return if (needsQuotes) "\"" + value.replace("\"", "\"\"") + "\"" else value
    }

    private fun csvToRecipeJson(input: String): String {
        val rows = parseRecipeCsv(input)
        require(rows.isNotEmpty()) { "CSV input is empty; include a header row." }
        val headers = rows.first()
        require(headers.isNotEmpty() && headers.none { it.isBlank() }) { "CSV header cells must be non-empty; rename blank columns before conversion." }
        require(headers.toSet().size == headers.size) { "CSV headers must be unique; duplicate column names would overwrite data in JSON objects." }
        val objects = rows.drop(1).mapIndexed { rowIndex, values ->
            require(values.size == headers.size) { "CSV row ${rowIndex + 2} has ${values.size} fields but the header has ${headers.size}." }
            JsonObject(headers.mapIndexed { index, header -> header to JsonString(values[index]) }.toMutableList())
        }
        return stringify(JsonArray(objects), true)
    }

    private fun jsonToRecipeCsv(input: String): String {
        val parser = JsonSourceParser(input); val parsed = parser.parse()
        require(parser.duplicatePaths.isEmpty()) { "JSON-to-CSV refuses ambiguous duplicate object keys at ${parser.duplicatePaths.distinct().take(10).joinToString(", ")}." }
        val records = (parsed as? JsonArray)?.entries ?: throw IllegalArgumentException("JSON-to-CSV expects a non-empty array of objects so it can determine column headers.")
        require(records.isNotEmpty()) { "JSON-to-CSV expects a non-empty array of objects so it can determine column headers." }
        require(records.all { it is JsonObject }) { "JSON-to-CSV expects every array item to be an object; nested arrays should be converted separately." }
        val objects = records.map { it as JsonObject }; val headers = objects.first().entries.map { it.first }
        require(headers.isNotEmpty() && headers.none { it.isBlank() }) { "JSON-to-CSV needs non-empty object keys to use as column headers." }
        for (index in 1 until objects.size) {
            val keys = objects[index].entries.map { it.first }
            require(keys.size == headers.size && headers.all { it in keys }) { "JSON row ${index + 1} has a different set of keys than the first row; normalize the objects before converting." }
        }
        fun cell(value: JsonValue): String = escapeRecipeCsv(if (value is JsonString) value.value else stringify(value, false))
        return (listOf(headers.joinToString(",", transform = ::escapeRecipeCsv)) + objects.map { obj -> headers.joinToString(",") { key -> cell(obj.entries.first { it.first == key }.second) } }).joinToString("\n") + "\n"
    }

    private fun jsonPointerGet(input: String, pointer: String, warnings: MutableList<String>): String {
        require(pointer.isEmpty() || pointer.startsWith("/")) { "json-pointer-get needs an RFC 6901 pointer: empty string for root or a path such as /user/id." }
        val parser = JsonSourceParser(input); val root = parser.parse()
        require(parser.duplicatePaths.isEmpty()) { "JSON Pointer extraction refuses ambiguous duplicate object keys at ${parser.duplicatePaths.distinct().take(10).joinToString(", ")}." }
        var selected: JsonValue = root
        val tokens = if (pointer.isEmpty()) emptyList() else pointer.substring(1).split("/").map { segment ->
            require(!Regex("~(?![01])").containsMatchIn(segment)) { "Invalid JSON Pointer escape in segment '$segment'. Use ~0 for '~' and ~1 for '/'." }
            segment.replace("~1", "/").replace("~0", "~")
        }
        for (token in tokens) {
            selected = when (val value = selected) {
                is JsonArray -> {
                    require(token.matches(Regex("(?:0|[1-9]\\d*)"))) { "JSON Pointer segment '$token' is not a canonical array index." }
                    val itemIndex = token.toIntOrNull()
                    require(itemIndex != null && itemIndex in value.entries.indices) { "JSON Pointer segment '$token' does not exist in the current array." }
                    value.entries[itemIndex]
                }
                is JsonObject -> value.entries.firstOrNull { it.first == token }?.second ?: throw IllegalArgumentException("JSON Pointer property '$token' does not exist.")
                else -> throw IllegalArgumentException("JSON Pointer cannot traverse into a scalar at segment '$token'.")
            }
        }
        val output = stringify(selected, true)
        warnings += recipeJsonFormatterWarnings(output, emptyList()).filter { it.startsWith("WARNING:") }
        return output
    }

    fun run(raw: String): String {
        require(utf8(raw).size <= MAX_CONFIG_BYTES) { "Recipe configuration exceeds the 7 MiB safety limit. Reduce the input or split this workflow into smaller recipes." }
        assertRecipeJsonDepth(raw)
        val configParser = JsonSourceParser(raw)
        try { configParser.parse() } catch (error: Exception) { throw IllegalArgumentException("Recipe configuration must be valid JSON: ${error.message ?: "parse error"}") }
        require(configParser.duplicatePaths.isEmpty()) { "Recipe configuration contains duplicate object keys and is ambiguous: ${configParser.duplicatePaths.distinct().take(10).joinToString(", ")}." }
        val config = try { JSONObject(raw) } catch (error: Exception) { throw IllegalArgumentException("Recipe configuration must be valid JSON: ${error.message ?: "parse error"}") }
        require(config.has("input") && config.opt("input") is String) { "Recipe configuration needs a string 'input' field." }
        var current = config.getString("input")
        require(utf8(current).size <= MAX_INPUT_BYTES) { "Recipe input exceeds the 1 MiB UTF-8 safety limit." }
        val steps = config.optJSONArray("steps") ?: throw IllegalArgumentException("Recipe configuration needs a 'steps' array.")
        require(steps.length() in 1..MAX_STEPS) { "Recipe must contain between 1 and $MAX_STEPS steps." }
        val rows = JSONArray(); val allWarnings = linkedSetOf<String>()
        for (index in 0 until steps.length()) {
            val step = steps.optJSONObject(index) ?: throw IllegalArgumentException("Recipe step ${index + 1} must be an object.")
            val op = step.optString("op", "")
            require(op in supported) { "Recipe step ${index + 1} has unsupported operation '$op'. Supported operations: ${supported.joinToString(", ")}." }
            val name = step.optString("name", "").trim().takeIf { it.isNotEmpty() }?.take(100) ?: op
            val before = current; val warnings = mutableListOf<String>()
            try {
                if (op.startsWith("json-") || op == "json-to-csv") assertRecipeJsonDepth(current)
                if (op == "json-format" || op == "json-sort-keys") assertRecipePrettyJsonFits(current)
                current = when (op) {
                    "trim" -> current.trim()
                    "strip-bom" -> current.removePrefix("\uFEFF")
                    "normalize-newlines" -> current.replace("\r\n", "\n").replace('\r', '\n')
                    "ensure-final-newline" -> if (current.endsWith('\n') || current.endsWith('\r')) current else current + "\n"
                    "remove-final-newline" -> when { current.endsWith("\r\n") -> current.dropLast(2); current.endsWith('\r') || current.endsWith('\n') -> current.dropLast(1); else -> current }
                    "collapse-whitespace" -> current.replace(Regex("[ \\t\\r\\n\\f\\u000b]+"), " ")
                    "remove-blank-lines" -> mapLines(current) { lines -> lines.filterNot { it.matches(Regex("[ \\t]*")) } }
                    "sort-lines" -> mapLines(current) { lines -> lines.sortedWith(Comparator(::compareCodePoints)) }
                    "unique-lines" -> mapLines(current) { lines -> val seen = linkedSetOf<String>(); lines.filter { seen.add(it) } }
                    "reverse-lines" -> mapLines(current) { lines -> lines.asReversed() }
                    "unicode-normalize-nfc" -> Normalizer.normalize(current, Normalizer.Form.NFC)
                    "unicode-normalize-nfd" -> Normalizer.normalize(current, Normalizer.Form.NFD)
                    "unicode-normalize-nfkc" -> Normalizer.normalize(current, Normalizer.Form.NFKC).also { if (it != before) warnings += "NFKC compatibility normalization changed one or more code points; review identifier/security-sensitive text before use." }
                    "unicode-normalize-nfkd" -> Normalizer.normalize(current, Normalizer.Form.NFKD).also { if (it != before) warnings += "NFKD compatibility normalization changed one or more code points; review identifier/security-sensitive text before use." }
                    "replace-literal" -> {
                        val find = step.opt("find") as? String ?: throw IllegalArgumentException("replace-literal needs a non-empty 'find' string.")
                        val replacement = (step.opt("replacement") as? String) ?: (step.opt("replace") as? String) ?: ""
                        require(find.isNotEmpty()) { "replace-literal needs a non-empty 'find' string." }
                        require(find.length <= 10_000 && replacement.length <= 100_000) { "Literal search must be at most 10,000 characters and replacement at most 100,000 characters." }
                        assertLiteralReplacementFits(current, find, replacement)
                        current.replace(find, replacement)
                    }
                    "url-encode-component" -> encodeUrl(current)
                    "url-decode-component" -> decodeUrl(current)
                    "base64-encode" -> java.util.Base64.getEncoder().encodeToString(utf8(current))
                    "base64-decode" -> decodeBase64(current)
                    "base64url-encode" -> encodeBase64(current, true)
                    "base64url-decode" -> decodeBase64(current, true)
                    "hex-encode" -> encodeHex(current)
                    "hex-decode" -> decodeHex(current)
                    "html-escape" -> htmlEscape(current)
                    "html-unescape" -> htmlUnescape(current)
                    "json-pointer-get" -> {
                        val pointer = step.opt("pointer") as? String ?: throw IllegalArgumentException("json-pointer-get needs a string 'pointer' field (empty string selects the root).")
                        jsonPointerGet(current, pointer, warnings)
                    }
                    "csv-to-json" -> csvToRecipeJson(current)
                    "json-to-csv" -> jsonToRecipeCsv(current)
                    "json-format", "json-minify", "json-sort-keys", "json-validate" -> {
                        val parser = JsonSourceParser(current); val tree = parser.parse()
                        val jsonWarnings = recipeJsonFormatterWarnings(current, parser.duplicatePaths)
                        when (op) {
                            "json-format" -> { warnings += jsonWarnings; stringify(tree, true) }
                            "json-minify" -> { warnings += jsonWarnings; stringify(tree, false) }
                            "json-sort-keys" -> {
                                require(parser.duplicatePaths.isEmpty()) { "Cannot sort keys without ambiguity: duplicate object keys were found at ${parser.duplicatePaths.distinct().take(10).joinToString(", ")}. Use json-format to preserve the source instead." }
                                warnings += jsonWarnings
                                stringify(tree, true, sortKeys = true)
                            }
                            else -> {
                                val duplicates = parser.duplicatePaths.distinct()
                                if (duplicates.isNotEmpty()) warnings += "Duplicate object keys are syntactically accepted but ambiguous: ${duplicates.take(10).joinToString(", ")}."
                                warnings += jsonWarnings.filter { it.startsWith("WARNING:") }
                                val duplicateNote = if (duplicates.isNotEmpty()) " Duplicate object keys detected at ${duplicates.take(20).joinToString(", ")}${if (duplicates.size > 20) ", …" else ""}; JSON.parse retains only the last value for each duplicate key." else ""
                                warnings += "Valid JSON (RFC 8259).$duplicateNote Large integers may exceed JavaScript's exact integer range."
                                current
                            }
                        }
                    }
                    "sha256-hex" -> MessageDigest.getInstance("SHA-256").digest(utf8(current)).joinToString("") { "%02x".format(it.toInt() and 0xff) }
                    else -> throw IllegalArgumentException("Unsupported recipe operation.")
                }
                val outputBytes = utf8(current).size
                require(outputBytes <= MAX_OUTPUT_BYTES) { "Step output exceeds the $MAX_OUTPUT_BYTES byte safety limit." }
                warnings.forEach { allWarnings.add(it) }
                rows.put(JSONObject().put("index", index + 1).put("name", name).put("operation", op).put("status", "ok")
                    .put("inputCharacters", codePoints(before)).put("outputCharacters", codePoints(current))
                    .put("inputUtf8Bytes", utf8(before).size).put("outputUtf8Bytes", outputBytes)
                    .put("preview", preview(current)).put("warnings", JSONArray(warnings)))
            } catch (error: Exception) {
                throw IllegalArgumentException("Recipe step ${index + 1} (‘$name’, $op) failed: ${error.message ?: error.javaClass.simpleName}. No partial output is being presented as a completed recipe.")
            }
        }
        return JSONObject().put("schemaVersion", 1).put("mode", "recipe").put("engine", "enV Android Kotlin recipe engine").put("status", "completed")
            .put("stepsCompleted", rows.length()).put("steps", rows).put("finalOutput", current).put("finalOutputCharacters", codePoints(current)).put("finalOutputUtf8Bytes", utf8(current).size)
            .put("warnings", JSONArray(allWarnings)).put("supportedOperations", JSONArray(supported))
            .put("semantics", JSONArray(listOf(
                "Operations are explicitly allow-listed; no eval, shell, network request, or arbitrary code execution.",
                "URL component decoding preserves '+' literally (unlike application/x-www-form-urlencoded parsing).",
                "Base64 operations accept strict standard or URL-safe alphabets, validate canonical padding bits, and decode UTF-8 text only.",
                "JSON formatting/minification preserve source numeric tokens and duplicate keys; key sorting and JSON Pointer extraction refuse ambiguous duplicate-key documents instead of silently discarding values.",
                "json-pointer-get follows RFC 6901 escaping, including ~0 for tilde and ~1 for slash, and requires canonical array indexes.",
                "SHA-256 is one-way and must not be used as password hashing.",
                "NFKC/NFKD may change compatibility distinctions; normalization is not a universal security policy."
            ))).put("privacy", "Processed in memory on this device by this engine; this engine does not upload or persist recipe input.").toString(2)
    }
}
