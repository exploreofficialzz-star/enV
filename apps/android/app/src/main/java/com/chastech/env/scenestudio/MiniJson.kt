package com.chastech.env.scenestudio

/**
 * A small, strict JSON reader with no dependencies, so the Scene Studio reader behaves the same on every device
 * and in plain JVM unit tests (Android's own org.json is only a stub there).
 *
 * Values come back as: null, Boolean, Double (every number), String, List<Any?> and Map<String, Any?>
 * (keys keep their file order). The grammar is JSON exactly: no comments, no trailing commas, no single quotes.
 */
class JsonException(message: String) : Exception(message)

object MiniJson {
    /** Deeper nesting than any scene needs; stops hostile files from exhausting the stack. */
    private const val MAX_DEPTH = 100

    fun parse(text: String): Any? {
        val p = Parser(text)
        p.skipSpace()
        val value = p.readValue(0)
        p.skipSpace()
        if (!p.atEnd()) throw p.fail("Unexpected text after the end of the value")
        return value
    }

    private class Parser(private val s: String) {
        private var i = if (s.startsWith("\uFEFF")) 1 else 0

        fun atEnd() = i >= s.length

        fun fail(message: String) = JsonException("$message at position $i")

        fun skipSpace() {
            while (i < s.length) {
                val c = s[i]
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++ else break
            }
        }

        fun readValue(depth: Int): Any? {
            if (depth > MAX_DEPTH) throw fail("Nesting is too deep")
            if (atEnd()) throw fail("Unexpected end of text")
            return when (val c = s[i]) {
                '{' -> readObject(depth)
                '[' -> readArray(depth)
                '"' -> readString()
                't' -> literal("true", true)
                'f' -> literal("false", false)
                'n' -> literal("null", null)
                else -> if (c == '-' || c in '0'..'9') readNumber() else throw fail("Unexpected character '$c'")
            }
        }

        private fun literal(word: String, value: Any?): Any? {
            if (!s.startsWith(word, i)) throw fail("Unexpected character '${s[i]}'")
            i += word.length
            return value
        }

        private fun readObject(depth: Int): Map<String, Any?> {
            val out = LinkedHashMap<String, Any?>()
            i++ // {
            skipSpace()
            if (!atEnd() && s[i] == '}') {
                i++
                return out
            }
            while (true) {
                skipSpace()
                if (atEnd() || s[i] != '"') throw fail("Expected a quoted name")
                val key = readString()
                skipSpace()
                if (atEnd() || s[i] != ':') throw fail("Expected ':'")
                i++
                skipSpace()
                out[key] = readValue(depth + 1)
                skipSpace()
                if (atEnd()) throw fail("Unexpected end of text")
                when (s[i]) {
                    ',' -> i++
                    '}' -> {
                        i++
                        return out
                    }
                    else -> throw fail("Expected ',' or '}'")
                }
            }
        }

        private fun readArray(depth: Int): List<Any?> {
            val out = ArrayList<Any?>()
            i++ // [
            skipSpace()
            if (!atEnd() && s[i] == ']') {
                i++
                return out
            }
            while (true) {
                skipSpace()
                out.add(readValue(depth + 1))
                skipSpace()
                if (atEnd()) throw fail("Unexpected end of text")
                when (s[i]) {
                    ',' -> i++
                    ']' -> {
                        i++
                        return out
                    }
                    else -> throw fail("Expected ',' or ']'")
                }
            }
        }

        private fun readString(): String {
            i++ // opening quote
            val sb = StringBuilder()
            while (true) {
                if (atEnd()) throw fail("Unterminated text")
                val c = s[i++]
                when {
                    c == '"' -> return sb.toString()
                    c == '\\' -> {
                        if (atEnd()) throw fail("Unterminated text")
                        when (val e = s[i++]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                if (i + 4 > s.length) throw fail("Bad \\u escape")
                                var code = 0
                                for (k in 0 until 4) {
                                    val d = Character.digit(s[i + k], 16)
                                    if (d < 0) throw fail("Bad \\u escape")
                                    code = code * 16 + d
                                }
                                i += 4
                                sb.append(code.toChar())
                            }
                            else -> throw fail("Bad escape '\\$e'")
                        }
                    }
                    c < ' ' -> throw fail("A line break or control character inside text")
                    else -> sb.append(c)
                }
            }
        }

        private fun readNumber(): Double {
            val start = i
            if (s[i] == '-') i++
            if (atEnd()) throw fail("Bad number")
            if (s[i] == '0') i++
            else if (s[i] in '1'..'9') while (!atEnd() && s[i] in '0'..'9') i++
            else throw fail("Bad number")
            if (!atEnd() && s[i] == '.') {
                i++
                val digits = i
                while (!atEnd() && s[i] in '0'..'9') i++
                if (i == digits) throw fail("Bad number")
            }
            if (!atEnd() && (s[i] == 'e' || s[i] == 'E')) {
                i++
                if (!atEnd() && (s[i] == '+' || s[i] == '-')) i++
                val digits = i
                while (!atEnd() && s[i] in '0'..'9') i++
                if (i == digits) throw fail("Bad number")
            }
            return s.substring(start, i).toDouble()
        }
    }
}
