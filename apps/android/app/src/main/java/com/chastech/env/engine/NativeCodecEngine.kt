package com.chastech.env.engine

import java.math.BigInteger
import java.net.URLDecoder
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.Base64
import java.util.Locale

/** Pure Kotlin counterpart of src/lib/engines/codecs.ts. It never uses a backend. */
object NativeCodecEngine {
    data class Result(val output: String)

    private val idToOperation = mapOf(
        "ascii-converter" to "ascii",
        "base64-decoder" to "base64-decode",
        "base64-encoder" to "base64-encode",
        "binary-converter" to "binary",
        "hash-compare" to "hash-compare",
        "hex-converter" to "hex",
        "html-decoder" to "html-decode",
        "html-encoder" to "html-encode",
        "md5-hash" to "md5",
        "sha1-hash" to "sha1",
        "sha256-hash" to "sha256",
        "sha512-hash" to "sha512",
        "unicode-converter" to "unicode",
        "url-decoder" to "url-decode",
        "url-encoder" to "url-encode",
        "hash-generator" to "multi-hash",
        "number-base-converter" to "base-convert"
    )

    val canonicalToolIds: Set<String> get() = idToOperation.keys
    val supportedToolIds: Set<String> get() = idToOperation.keys
    fun operationForTool(id: String): String? = idToOperation[id]

    fun run(toolId: String, input: String = "", options: Map<String, String> = emptyMap()): Result {
        val operation = idToOperation[toolId] ?: throw IllegalArgumentException("Unknown codec: $toolId")
        return Result(when (operation) {
            "base64-encode" -> Base64.getEncoder().encodeToString(input.toByteArray(Charsets.UTF_8))
            "base64-decode" -> decodeBase64(input)
            "url-encode" -> encodeUrl(input)
            "url-decode" -> decodeUrl(input)
            "html-encode" -> htmlEncode(input)
            "html-decode" -> htmlDecode(input)
            "unicode" -> unicodeDump(input)
            "ascii" -> asciiDump(input)
            "binary" -> input.toByteArray(Charsets.UTF_8).joinToString(" ") { (it.toInt() and 0xff).toString(2).padStart(8, '0') }
            "hex" -> input.toByteArray(Charsets.UTF_8).joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
            "md5" -> digest("MD5", input)
            "sha1" -> digest("SHA-1", input)
            "sha256" -> digest("SHA-256", input)
            "sha512" -> digest("SHA-512", input)
            "multi-hash" -> listOf(
                "MD5\t${digest("MD5", input)}",
                "SHA-1\t${digest("SHA-1", input)}",
                "SHA-256\t${digest("SHA-256", input)}",
                "SHA-512\t${digest("SHA-512", input)}"
            ).joinToString("\n")
            "hash-compare" -> {
                val a = (options["a"] ?: input).trim().lowercase(Locale.ROOT)
                val b = (options["b"] ?: "").trim().lowercase(Locale.ROOT)
                if (timingSafeEqual(a, b)) "match" else "different"
            }
            "base-convert" -> baseConvert(input, options)
            else -> throw IllegalArgumentException("Unknown codec: $operation")
        })
    }

    private fun digest(algorithm: String, input: String): String = MessageDigest.getInstance(algorithm)
        .digest(input.toByteArray(Charsets.UTF_8))
        .joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }

    private fun htmlEncode(input: String): String = input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

    private fun htmlDecode(input: String): String {
        var value = input
            .replace(Regex("&lt;", RegexOption.IGNORE_CASE), "<")
            .replace(Regex("&gt;", RegexOption.IGNORE_CASE), ">")
            // The web implementation intentionally does not decode &quot; here.
            .replace(Regex("&#39;|'", setOf(RegexOption.IGNORE_CASE)), "'")
        value = Regex("&#(\\d+);").replace(value) { match -> codePoint(match.groupValues[1].toLongOrNull(10)) }
        value = Regex("&#x([0-9a-f]+);", RegexOption.IGNORE_CASE).replace(value) { match -> codePoint(match.groupValues[1].toLongOrNull(16)) }
        return value.replace(Regex("&amp;", RegexOption.IGNORE_CASE), "&")
    }

    private fun codePoint(value: Long?): String {
        require(value != null && value in 0..0x10ffff && value !in 0xd800..0xdfff) { "Invalid HTML entity" }
        return String(Character.toChars(value.toInt()))
    }

    private fun unicodeDump(input: String): String {
        val bytes = input.toByteArray(Charsets.UTF_8)
        val hex = bytes.joinToString(" ") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
        val points = StringBuilder()
        var index = 0
        while (index < input.length) {
            val cp = input.codePointAt(index)
            if (points.isNotEmpty()) points.append('\n')
            points.append("U+").append(cp.toString(16).uppercase().padStart(4, '0')).append(' ')
                .append(String(Character.toChars(cp)))
            index += Character.charCount(cp)
        }
        return "UTF-8: ${if (hex.isEmpty()) "(empty)" else hex}\n$points"
    }

    private fun asciiDump(input: String): String {
        val rows = mutableListOf<String>()
        var index = 0
        while (index < input.length) {
            val cp = input.codePointAt(index)
            rows += "${String(Character.toChars(cp))}\t$cp"
            index += Character.charCount(cp)
        }
        return rows.joinToString("\n")
    }

    private fun encodeUrl(input: String): String {
        val allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
        return input.toByteArray(Charsets.UTF_8).joinToString("") { byte ->
            val n = byte.toInt() and 0xff
            val c = n.toChar()
            if (c in allowed) c.toString() else "%${n.toString(16).uppercase().padStart(2, '0')}"
        }
    }

    private fun decodeUrl(input: String): String {
        val value = input.replace("+", "%20")
        val out = StringBuilder()
        var i = 0
        while (i < value.length) {
            if (value[i] != '%') {
                val cp = value.codePointAt(i)
                out.appendCodePoint(cp)
                i += Character.charCount(cp)
                continue
            }
            val bytes = ArrayList<Byte>()
            while (i < value.length && value[i] == '%') {
                require(i + 2 < value.length) { "Invalid URL encoding" }
                val hi = Character.digit(value[i + 1], 16)
                val lo = Character.digit(value[i + 2], 16)
                require(hi >= 0 && lo >= 0) { "Invalid URL encoding" }
                bytes += ((hi shl 4) or lo).toByte()
                i += 3
            }
            try {
                val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                out.append(decoder.decode(ByteBuffer.wrap(bytes.toByteArray())).toString())
            } catch (_: Exception) {
                throw IllegalArgumentException("Invalid URL encoding")
            }
        }
        return out.toString()
    }

    private fun decodeBase64(input: String): String {
        val cleaned = input.replace(Regex("\\s+"), "")
        require(cleaned.matches(Regex("[A-Za-z0-9+/]*={0,2}")) && cleaned.length % 4 != 1) { "Invalid Base64" }
        return try {
            val bytes = Base64.getDecoder().decode(cleaned)
            val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPLACE).onUnmappableCharacter(CodingErrorAction.REPLACE)
            decoder.decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: Exception) {
            throw IllegalArgumentException("Invalid Base64")
        }
    }

    private fun timingSafeEqual(a: String, b: String): Boolean {
        val max = maxOf(a.length, b.length)
        var diff = if (a.length == b.length) 0 else 1
        for (i in 0 until max) diff = diff or ((a.getOrNull(i)?.code ?: 0) xor (b.getOrNull(i)?.code ?: 0))
        return diff == 0
    }

    private fun baseConvert(input: String, options: Map<String, String>): String {
        val fromBase = options["fromBase"]?.toIntOrNull() ?: if (options.containsKey("fromBase")) 0 else 10
        val toBase = options["toBase"]?.toIntOrNull() ?: if (options.containsKey("toBase")) 0 else 16
        val raw = (options["value"] ?: input).trim()
        require(fromBase in 2..36) { "fromBase must be 2–36" }
        require(toBase in 2..36) { "toBase must be 2–36" }
        require(raw.isNotEmpty()) { "Missing value" }
        val negative = raw.startsWith('-')
        val body = if (raw.first() == '+' || raw.first() == '-') raw.substring(1) else raw
        require(body.isNotEmpty()) { "Invalid number" }
        var value = BigInteger.ZERO
        for (character in body.lowercase(Locale.ROOT)) {
            val digit = Character.digit(character, 36)
            require(digit >= 0 && digit < fromBase) { "Invalid number" }
            value = value.multiply(BigInteger.valueOf(fromBase.toLong())).add(BigInteger.valueOf(digit.toLong()))
        }
        val converted = value.toString(toBase)
        return if (negative && value != BigInteger.ZERO) "-$converted" else converted
    }
}
