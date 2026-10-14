package com.chastech.env.engine

import java.text.Normalizer
import java.text.BreakIterator
import java.util.LinkedHashMap
import java.util.Locale
import java.io.StringReader
import java.io.StringWriter
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import org.xml.sax.InputSource
import org.xml.sax.SAXParseException
import org.xml.sax.helpers.DefaultHandler
import kotlin.math.ceil
import kotlin.math.max

/** Pure Kotlin counterpart of src/lib/engines/transforms.ts and TextEngine statistics. */
object NativeTextEngine {
    data class Options(
        val find: String = "", val replace: String = "", val width: String = "80",
        val style: String = "bullets", val keyword: String = "", val limit: String = "280",
        val wpm: String = "200", val dialect: String = "postgresql"
    )
    data class Stats(val words: Int, val characters: Int, val charactersNoSpaces: Int, val sentences: Int, val paragraphs: Int, val lines: Int, val readingSeconds: Int) {
        val readingMinutes: Int get() = if (readingSeconds == 0) 0 else max(1, ceil(readingSeconds / 60.0).toInt())
        fun report(): String = "Words: $words\nCharacters: $characters\nCharacters without spaces: $charactersNoSpaces\nSentences: $sentences\nParagraphs: $paragraphs\nLines: $lines\nReading time: ${if (readingMinutes == 0) "0 min" else "$readingMinutes min"}"
    }

    private val idToOp = mapOf(
        "css-formatter" to "css-format", "css-minifier" to "css-minify", "html-formatter" to "html-format",
        "html-minifier" to "html-minify", "javascript-formatter" to "js-format", "javascript-minifier" to "js-minify",
        "sql-formatter" to "sql-format", "xml-formatter" to "xml-format", "yaml-formatter" to "yaml-format",
        "css-minifier-advanced" to "json-to-csv", "json-to-xml" to "json-to-xml", "json-to-yaml" to "json-to-yaml",
        "xml-to-json" to "xml-to-json", "yaml-to-json" to "yaml-to-json", "keyword-density-calculator" to "keyword-density",
        "camel-case-converter" to "camel-case", "character-counter" to "character-counter", "extract-emails" to "extract-emails",
        "extract-urls" to "extract-urls", "find-and-replace" to "find-replace", "kebab-case-converter" to "kebab-case",
        "list-generator" to "list", "lowercase-converter" to "lowercase", "paragraph-counter" to "paragraph-counter",
        "reading-time-calculator" to "reading-time-calculator", "remove-duplicate-lines" to "dedupe-lines", "remove-spaces" to "trim-spaces",
        "remove-line-breaks" to "unwrap", "reverse-text" to "reverse", "sentence-case-converter" to "sentence-case",
        "sentence-counter" to "sentence-counter", "slug-generator" to "slug", "snake-case-converter" to "snake-case",
        "sort-lines" to "sort-lines", "text-diff" to "text-diff", "title-case-converter" to "title-case",
        "uppercase-converter" to "uppercase", "word-counter" to "word-counter", "word-frequency" to "word-freq", "wrap-text" to "wrap"
    )
    val supportedToolIds: Set<String> get() = idToOp.keys
    fun operationForTool(id: String): String? = idToOp[id]

    fun stats(input: String, wpmText: String = "200"): Stats {
        val words = segmentWords(input)
        val chars = input.codePointCount(0, input.length)
        val noSpaces = input.replace(Regex("\\s"), "").codePointCount(0, input.replace(Regex("\\s"), "").length)
        val sentences = Regex("[^.!?。！？]+[.!?。！？]+(?=\\s|$)|[^.!?。！？]+$", RegexOption.MULTILINE).findAll(input).count { it.value.trim().isNotEmpty() }
        val paragraphs = input.split(Regex("(?:\\r?\n){2,}")).count { it.trim().isNotEmpty() }
        val lines = if (input.isEmpty()) 0 else input.split(Regex("\\r?\n")).size
        val wpm = max(1, wpmText.toIntOrNull() ?: 200)
        return Stats(words.size, chars, noSpaces, sentences, paragraphs, lines, if (words.isEmpty()) 0 else ceil(words.size / wpm.toDouble() * 60).toInt())
    }

    private fun segmentWords(input: String): List<String> {
        val iterator = BreakIterator.getWordInstance(Locale.getDefault())
        iterator.setText(input)
        val words = mutableListOf<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            val token = input.substring(start, end)
            if (token.any { it.isLetterOrDigit() }) words += token
            start = end
            end = iterator.next()
        }
        return words
    }

    fun run(toolId: String, input: String, compare: String = "", options: Options = Options()): String {
        val op = idToOp[toolId] ?: toolId
        return when (op) {
            "word-counter", "character-counter", "sentence-counter", "paragraph-counter", "reading-time-calculator" -> if (input.isEmpty()) "" else stats(input, options.wpm).report()
            "text-diff" -> diff(input, compare).lines
            "uppercase" -> input.uppercase(Locale.ROOT)
            "lowercase" -> input.lowercase(Locale.ROOT)
            "title-case" -> titleCase(input)
            "sentence-case" -> sentenceCase(input)
            "camel-case" -> splitWords(input).mapIndexed { i, w -> if (i == 0) w.lowercase(Locale.ROOT) else capitalize(w) }.joinToString("")
            "snake-case" -> splitWords(input).joinToString("_") { it.lowercase(Locale.ROOT) }
            "kebab-case" -> splitWords(input).joinToString("-") { it.lowercase(Locale.ROOT) }
            "slug" -> slug(input)
            "reverse" -> input.codePoints().toArray().reversed().joinToString("") { String(Character.toChars(it)) }
            "trim-spaces" -> input.replace(Regex("[ \t]+"), " ").replace(Regex(" *\n *"), "\n").trim()
            "unwrap" -> input.replace(Regex("[ \t]*\n[ \t]*"), " ").replace(Regex(" +"), " ").trim()
            "sort-lines" -> sortLines(input)
            "dedupe-lines" -> dedupeLines(input)
            "find-replace" -> findReplace(input, options)
            "wrap" -> wrap(input, options)
            "word-freq" -> wordFreq(input)
            "extract-emails" -> uniqueMatches(input, Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"))
            "extract-urls" -> uniqueMatches(input, Regex("https?://[^\\s<>\"'`]+", RegexOption.IGNORE_CASE))
            "list" -> listify(input, options)
            "sql-format" -> formatSQL(input, options.dialect)
            "html-format" -> indentMarkup(input)
            "xml-format" -> formatXml(input)
            "css-format" -> cssFormat(input)
            "js-format" -> jsFormat(input)
            "yaml-format" -> input.replace("\t", "  ").split(Regex("\\r?\n")).joinToString("\n") { it.trimEnd() }.replace(Regex("\n{3,}"), "\n\n").trim()
            "html-minify" -> input.replace(Regex("<!--[\\s\\S]*?-->"), "").replace(Regex(">\\s+<"), "><").replace(Regex("\\s+"), " ").trim()
            "css-minify" -> cssMinify(input)
            "js-minify" -> jsMinify(input)
            "json-to-csv" -> jsonToCsv(input)
            "csv-to-json" -> csvToJson(input)
            "json-to-yaml" -> toYaml(parseJson(input)).trim()
            "yaml-to-json" -> jsonStringify(parseSimpleYaml(input), pretty = true)
            "json-to-xml" -> "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n${indentMarkup(emitXml(parseJson(input)))}"
            "xml-to-json" -> jsonStringify(parseXml(input), pretty = true)
            "keyword-density" -> keywordDensity(input, options)
            else -> throw IllegalArgumentException("Unknown text operation: $toolId")
        }
    }

    private fun splitWords(s: String) = s.replace(Regex("['’]"), "").split(Regex("[^A-Za-z0-9]+" )).filter { it.isNotEmpty() }
    private fun capitalize(s: String) = if (s.isEmpty()) s else s.substring(0, 1).uppercase(Locale.ROOT) + s.substring(1).lowercase(Locale.ROOT)
    private val smallWords = setOf("a", "an", "the", "and", "or", "of", "in", "on", "to")
    private fun titleCase(input: String): String {
        val chunks = Regex("\\s+").split(input, 0).let { input.split(Regex("(?=\\s)|(?<=\\s)")) }
        val tokens = chunks.filterNot { it.matches(Regex("\\s+")) }; var index = 0
        return chunks.joinToString("") { chunk -> if (chunk.matches(Regex("\\s+"))) chunk else { val low = chunk.lowercase(Locale.ROOT); val bare = low.replace(Regex("[^a-z0-9]"), ""); val edge = index == 0 || index == tokens.lastIndex; index++; if (!edge && bare in smallWords) chunk.replace(Regex("[A-Za-z]+")) { it.value.lowercase(Locale.ROOT) } else chunk.replace(Regex("[A-Za-z0-9]+")) { capitalize(it.value) } } }
    }
    private fun sentenceCase(input: String): String { val lower = input.lowercase(Locale.ROOT); return lower.replace(Regex("(^\\s*[a-z])|([.!?]\\s+[a-z])")) { it.value.uppercase(Locale.ROOT) } }
    private fun slug(input: String): String = Normalizer.normalize(input, Normalizer.Form.NFKD).replace(Regex("[\\u0300-\\u036f]"), "").lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]+"), "-").trim('-').take(120)
    private fun sortLines(input: String): String { val lines = input.split(Regex("\\r?\n")).toMutableList(); val trailing = lines.lastOrNull() == ""; if (trailing) lines.removeAt(lines.lastIndex); lines.sortWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it }); return lines.joinToString("\n") + if (trailing) "\n" else "" }
    private fun dedupeLines(input: String): String { val seen = LinkedHashSet<String>(); input.split(Regex("\\r?\n")).forEach { seen.add(it) }; return seen.joinToString("\n") }
    private fun findReplace(input: String, o: Options): String { if (o.find.isEmpty()) return input; return try { Regex(o.find).replace(input, o.replace) } catch (_: Exception) { input.replace(o.find, o.replace) } }
    private fun wrap(input: String, o: Options): String { val width = max(8, o.width.toIntOrNull() ?: 80); return input.split(Regex("\\r?\n"), limit = Int.MAX_VALUE).joinToString("\n") { para -> if (para.trim().isEmpty()) para else { val out = mutableListOf<String>(); var cur = ""; para.trim().split(Regex("\\s+")).forEach { word -> if (cur.isEmpty()) cur = word else if (cur.length + 1 + word.length <= width) cur += " $word" else { out += cur; cur = word } }; if (cur.isNotEmpty()) out += cur; out.joinToString("\n") } } }
    private fun wordFreq(input: String): String { val c = mutableMapOf<String, Int>(); Regex("[a-z0-9]+(?:'[a-z0-9]+)?", RegexOption.IGNORE_CASE).findAll(input).forEach { c[it.value.lowercase(Locale.ROOT)] = (c[it.value.lowercase(Locale.ROOT)] ?: 0) + 1 }; return c.entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key }).joinToString("\n") { "${it.key}\t${it.value}" } }
    private fun uniqueMatches(input: String, regex: Regex): String { val seen = LinkedHashSet<String>(); regex.findAll(input).forEach { seen.add(it.value.trimEnd(',', ')', '.', ';')) }; return seen.joinToString("\n") }
    private fun listify(input: String, o: Options): String { val items = input.split(Regex("\\r?\n|,")).map { it.trim() }.filter { it.isNotEmpty() }; return when (o.style) { "numbered" -> items.mapIndexed { i, x -> "${i + 1}. $x" }.joinToString("\n"); "comma" -> items.joinToString(", "); else -> items.joinToString("\n") { "- $it" } } }
    /** Conservative dialect-aware lexical SQL formatter. It preserves quoted/comment tokens;
     * it is intentionally not represented as a full SQL parser or syntax validator. */
    internal fun formatSQL(input: String, dialectRaw: String = "postgresql"): String {
        val dialect = dialectRaw.lowercase(Locale.ROOT)
        val supported = setOf("sql", "postgresql", "postgres", "mysql", "mariadb", "sqlite", "transactsql", "tsql", "bigquery", "snowflake", "oracle", "redshift", "duckdb")
        require(dialect in supported) { "Unsupported SQL dialect '$dialectRaw'. Supported: ${supported.sorted().joinToString(", ")}." }
        val protected = LinkedHashMap<String, String>()
        val chars = input.toCharArray(); val masked = StringBuilder(); var i = 0
        fun token(): String = "\uE000SQL${protected.size}\uE001"
        while (i < chars.size) {
            val c = chars[i]
            if ((c == '-' && i + 1 < chars.size && chars[i + 1] == '-') ||
                (c == '/' && i + 1 < chars.size && chars[i + 1] == '*') ||
                ((dialect == "mysql" || dialect == "mariadb") && c == '#')) {
                val start = i
                when {
                    c == '-' -> { i += 2; while (i < chars.size && chars[i] != '\n') i++; if (i < chars.size) i++ }
                    c == '/' -> { i += 2; var closed = false; while (i + 1 < chars.size) { if (chars[i] == '*' && chars[i + 1] == '/') { i += 2; closed = true; break }; i++ }; require(closed) { "SQL formatter found an unterminated block comment." } }
                    else -> { while (i < chars.size && chars[i] != '\n') i++; if (i < chars.size) i++ }
                }
                val key = token(); protected[key] = String(chars, start, i - start); masked.append(key); continue
            }
            if ((dialect in setOf("postgresql", "postgres", "redshift", "duckdb")) && c == '$') {
                var tagEnd = i + 1; while (tagEnd < chars.size && (chars[tagEnd].isLetterOrDigit() || chars[tagEnd] == '_')) tagEnd++
                if (tagEnd < chars.size && chars[tagEnd] == '$') {
                    val tag = String(chars, i, tagEnd - i + 1); val start = i; i = tagEnd + 1; var close = -1; var j = i
                    while (j + tag.length <= chars.size) { if (String(chars, j, tag.length) == tag) { close = j; break }; j++ }
                    require(close >= 0) { "SQL formatter found an unterminated PostgreSQL dollar-quoted string." }
                    i = close + tag.length; val key = token(); protected[key] = String(chars, start, i - start); masked.append(key); continue
                }
            }
            if (c == '\'' || c == '"' || c == '`' || c == '[') {
                val start = i; val close = if (c == '[') ']' else c; i++; var closed = false
                while (i < chars.size) { if (chars[i] == close) { if (close != ']' && i + 1 < chars.size && chars[i + 1] == close) { i += 2; continue }; i++; closed = true; break }; if (c == '\'' && chars[i] == '\\' && i + 1 < chars.size) i++; i++ }
                require(closed) { "SQL formatter found an unterminated quoted value or identifier." }
                val key = token(); protected[key] = String(chars, start, i - start); masked.append(key); continue
            }
            masked.append(c); i++
        }
        val tokens = Regex("[A-Za-z_][A-Za-z0-9_$]*|\\uE000SQL\\d+\\uE001|(?:<=|>=|<>|!=|==|::|->>|->|\\|\\||&&|\\?\\?|:=)|[^\\s]").findAll(masked.toString()).map { it.value }.toList()
        val major = setOf("SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "INSERT INTO", "UPDATE", "DELETE FROM", "VALUES", "RETURNING", "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "UNION")
        val joins = setOf("JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL JOIN", "CROSS JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN")
        val out = mutableListOf<String>(); var depth = 0; val line = StringBuilder(); var previous = ""
        fun emit() { val value = line.toString().trim(); if (value.isNotEmpty()) out += "  ".repeat(depth.coerceAtLeast(0)) + value; line.setLength(0) }
        fun append(value: String, space: Boolean = true) { if (space && line.isNotEmpty() && !line.last().isWhitespace() && line.last() !in "(." && (value.isNotEmpty() && value.first() !in ",;).") ) line.append(' '); line.append(value) }
        var index = 0
        while (index < tokens.size) {
            val current = tokens[index]; val upper = current.uppercase(Locale.ROOT); var phrase = upper; var consumed = 1
            if (index + 1 < tokens.size) { val two = "$upper ${tokens[index + 1].uppercase(Locale.ROOT)}"; if (two in major || two in joins) { phrase = two; consumed = 2 } else if (index + 2 < tokens.size && "$two ${tokens[index + 2].uppercase(Locale.ROOT)}" in joins) { phrase = "$two ${tokens[index + 2].uppercase(Locale.ROOT)}"; consumed = 3 } }
            val isReservedToken = current.startsWith("\uE000SQL")
            if (!isReservedToken && (phrase in major || phrase in joins || upper in setOf("ON", "AND", "OR"))) {
                emit(); if (phrase in joins || upper in setOf("ON", "AND", "OR")) depth = max(1, depth) else depth = 0
                line.append(phrase); index += consumed; previous = phrase; continue
            }
            when (current) {
                "(" -> { append(current, previous.uppercase(Locale.ROOT) in setOf("IN", "VALUES", "EXISTS", "NOT")); depth++ }
                ")" -> { depth = max(0, depth - 1); line.append(")") }
                "," -> { line.append(",") }
                "." -> { line.append(".") }
                ";" -> { line.append(";"); emit(); depth = 0 }
                else -> { append(current); if (protected[current]?.let { it.startsWith("--") || it.startsWith("#") } == true) emit() }
            }
            previous = current; index++
        }
        emit()
        return out.joinToString("\n").replace(Regex(",\\s*"), ",\n  ").replace(Regex("\\uE000SQL(\\d+)\\uE001")) { protected["\uE000SQL${it.groupValues[1]}\uE001"] ?: it.value }.trim()
    }

    private fun indentMarkup(input: String): String { val voidish = Regex("^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$", RegexOption.IGNORE_CASE); val tokens = input.replace(Regex(">\\s+<"), "><").replace(Regex("(<[^>]+>)"), "\n$1\n").split("\n").map { it.trim() }.filter { it.isNotEmpty() }; var depth = 0; val out = mutableListOf<String>(); tokens.forEach { token -> val close = token.startsWith("</"); val open = Regex("^<[^/!?]").containsMatchIn(token) && !token.endsWith("/>"); val name = token.replace(Regex("^</?([^\\s>/]+).*$"), "$1"); if (close) depth = max(0, depth - 1); out += "  ".repeat(depth) + token; if (open && !voidish.matches(name)) depth++ }; return out.joinToString("\n") }
    /** Secure native XML parse + serializer. DOCTYPE is intentionally rejected to prevent XXE and network resolution. */
    private fun formatXml(input: String): String {
        require(input.isNotBlank()) { "Paste XML input before formatting." }
        require(input.length <= 1_000_000) { "XML input exceeds the 1 MB local formatting limit." }
        require(!Regex("<!DOCTYPE\\b", RegexOption.IGNORE_CASE).containsMatchIn(input)) {
            "XML DOCTYPE declarations are disabled in the local formatter to prevent external entity access. Remove the DOCTYPE and retry."
        }
        try {
            val factory = DocumentBuilderFactory.newInstance()
            factory.isNamespaceAware = true
            factory.isXIncludeAware = false
            factory.isExpandEntityReferences = false
            runCatching { factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true) }
            runCatching { factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "") }
            runCatching { factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "") }
            runCatching { factory.setFeature("http://xml.org/sax/features/external-general-entities", false) }
            runCatching { factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
            runCatching { factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false) }
            val builder = factory.newDocumentBuilder()
            builder.setEntityResolver { _, _ -> InputSource(StringReader("")) }
            builder.setErrorHandler(object : DefaultHandler() {
                override fun error(exception: SAXParseException) { throw exception }
                override fun fatalError(exception: SAXParseException) { throw exception }
            })
            val document = builder.parse(InputSource(StringReader(input)))
            val transformerFactory = TransformerFactory.newInstance()
            runCatching { transformerFactory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true) }
            runCatching { transformerFactory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "") }
            runCatching { transformerFactory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "") }
            val transformer = transformerFactory.newTransformer()
            transformer.setOutputProperty(OutputKeys.INDENT, "yes")
            runCatching { transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2") }
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, if (input.trimStart().startsWith("<?xml", ignoreCase = true)) "no" else "yes")
            val writer = StringWriter()
            transformer.transform(DOMSource(document), StreamResult(writer))
            val result = writer.toString().trimEnd()
            check(result.isNotBlank()) { "The native XML serializer returned empty output." }
            return result
        } catch (error: Exception) {
            val detail = error.message?.replace(Regex("\\s+"), " ")?.take(240).orEmpty()
            throw IllegalArgumentException("Native XML parser/formatter could not process this input locally${if (detail.isNotBlank()) ": $detail" else ""}. No document was uploaded.", error)
        }
    }

    private fun cssFormat(input: String): String { var indent = 0; val out = mutableListOf<String>(); val src = input.replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("\\s+"), " ").trim(); var buf = ""; fun flush(line: String) { if (line.trim().isNotEmpty()) out += "  ".repeat(max(0, indent)) + line.trim() }; src.forEach { ch -> when(ch) { '{' -> { flush("$buf {"); buf = ""; indent++ }; '}' -> { if (buf.trim().isNotEmpty()) flush(if (buf.trim().endsWith(';')) buf else "${buf};"); buf = ""; indent = max(0, indent - 1); out += "  ".repeat(indent) + "}" }; ';' -> { flush("${buf.trim()};"); buf = "" }; else -> buf += ch } }; if (buf.trim().isNotEmpty()) flush(buf); return out.joinToString("\n") }
    private fun jsFormat(input: String): String {
        data class Token(val text: String, val kind: String)
        val tokens = mutableListOf<Token>(); var i = 0
        val operators = listOf("===", "!==", ">>>", "=>", "??=", "??", "?.", "&&", "||", "**", "==", "!=", "<=", ">=", "++", "--", "+=", "-=", "*=", "/=", "...", "**=", "<<", ">>")
        while (i < input.length) {
            val ch = input[i]
            if (ch.isWhitespace()) { i++; continue }
            if (ch == '/' && input.getOrNull(i + 1) == '/') { val start=i; i+=2; while(i<input.length && input[i]!='\n') i++; tokens += Token(input.substring(start,i),"comment"); continue }
            if (ch == '/' && input.getOrNull(i + 1) == '*') { val start=i; val end=input.indexOf("*/",i+2); require(end>=0) { "JavaScript formatter found an unterminated block comment." }; i=end+2; tokens += Token(input.substring(start,i),"comment"); continue }
            if (ch == '\'' || ch == '"' || ch == '`') { val start=i++; var closed=false; while(i<input.length) { if(input[i]=='\\') {i=(i+2).coerceAtMost(input.length);continue}; if(input[i++]==ch){closed=true;break} }; require(closed) { "JavaScript formatter found an unterminated string or template literal." }; tokens += Token(input.substring(start,i),"literal"); continue }
            val word = Regex("^(?:[A-Za-z_$][\\w$]*|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)").find(input.substring(i))
            if (word != null) { tokens += Token(word.value,"word");i+=word.value.length;continue }
            val operator=operators.firstOrNull{input.startsWith(it,i)}
            if(operator!=null){tokens+=Token(operator,"operator");i+=operator.length;continue}
            tokens+=Token(ch.toString(),"punct");i++
        }
        require(tokens.isNotEmpty()) { "Paste JavaScript or TypeScript code to format." }
        val lines=mutableListOf<String>();var line="";var depth=0;var parenDepth=0;var lineDepth=0
        fun emit(){val value=line.trim();if(value.isNotEmpty())lines += "  ".repeat(lineDepth.coerceAtLeast(0))+value;line="";lineDepth=depth}
        fun append(value:String,space:Boolean=false){if(line.isEmpty()&&value.isNotEmpty())lineDepth=depth;if(space&&line.isNotEmpty()&&!line.last().isWhitespace()&&line.last() !in ".(["&&value.firstOrNull() !in listOf(',', ';', ')', ']', '}'))line+=" ";line+=value}
        fun prev(index:Int)=tokens.getOrNull(index-1)?.text ?: ""
        fun next(index:Int)=tokens.getOrNull(index+1)?.text ?: ""
        for(index in tokens.indices){val token=tokens[index];val value=token.text;val before=prev(index);val after=next(index)
            when {
                token.kind=="comment"->{if(line.isNotBlank())emit();append(value);emit()}
                value=="{"->{append("{",line.isNotBlank()&&line.last() !in ".([" );depth++;emit()}
                value=="}"->{if(line.isNotBlank())emit();depth=(depth-1).coerceAtLeast(0);append("}");if(after !in setOf(";",",",")","]",".","(","["))emit()}
                value=="("->{append("(",before in setOf("if","for","while","switch","catch","with","function"));parenDepth++}
                value==")"->{line=line.trimEnd()+")";parenDepth=(parenDepth-1).coerceAtLeast(0)}
                value=="["->append("[")
                value=="]"->line=line.trimEnd()+"]"
                value=="."||value=="?."->line=line.trimEnd()+value
                value==","->{line=line.trimEnd()+",";emit()}
                value==";"->{line=line.trimEnd()+";";if(parenDepth==0)emit()}
                value==":"->{line=line.trimEnd()+":";append("",true)}
                token.kind=="operator"||value in setOf("=","+","-","*","/","%","<",">","!","&","|","?")->if(value in setOf("++","--","!","~","..."))append(value)else{append(value,true);append("",true)}
                else->{val wordLike=token.kind=="word"||token.kind=="literal";val prior=tokens.getOrNull(index-1);val priorWord=prior!=null&&(prior.kind=="word"||prior.kind=="literal");append(value,line.isNotEmpty()&&(priorWord||before in setOf("return","throw","new","await","yield","typeof","delete","void","instanceof","in","of","else","async")||(before==")"&&wordLike)))}
            }
        }
        emit();val result=lines.joinToString("\n").trim();require(result.isNotEmpty()){"Formatter produced no output. Check that the source is not empty."}
        return result+"\n\nNote: conservative local formatter. It preserves strings/comments and formats common blocks, calls, literals, and operators; it is not a full ECMAScript parser."
    }
    private fun cssMinify(input: String) = input.replace(Regex("/\\*[\\s\\S]*?\\*/"), "").replace(Regex("\\s+"), " ").replace(Regex("\\s*([{};:,>~+])\\s*"), "$1").replace(";}", "}").trim()
    private fun jsMinify(input: String): String { var out = StringBuilder(); var i = 0; var quote: Char? = null; var line = false; var block = false; while (i < input.length) { val ch = input[i]; val n = input.getOrNull(i + 1); when { line -> { if (ch == '\n') line = false; i++ }; block -> { if (ch == '*' && n == '/') { block = false; i += 2 } else i++ }; quote != null -> { out.append(ch); if (ch == '\\' && i + 1 < input.length) { out.append(input[i + 1]); i += 2 } else { if (ch == quote) quote = null; i++ } }; ch == '/' && n == '/' -> { line = true; i += 2 }; ch == '/' && n == '*' -> { block = true; i += 2 }; ch == '\'' || ch == '"' || ch == '`' -> { quote = ch; out.append(ch); i++ }; ch.isWhitespace() -> { val p = out.lastOrNull() ?: ' '; val q = input.getOrNull(i + 1) ?: ' '; if ((p.isLetterOrDigit() || p == '_' || p == '$') && (q.isLetterOrDigit() || q == '_' || q == '$')) out.append(' '); i++ }; else -> { out.append(ch); i++ } } }; return out.toString().trim() }

    data class Diff(val added: Int, val removed: Int, val unchanged: Int, val lines: String)
    fun diff(a: String, b: String): Diff { val l = a.split(Regex("\\r?\n")); val r = b.split(Regex("\\r?\n")); val dp = Array(l.size + 1) { IntArray(r.size + 1) }; for (i in l.lastIndex downTo 0) for (j in r.lastIndex downTo 0) dp[i][j] = if (l[i] == r[j]) dp[i + 1][j + 1] + 1 else max(dp[i + 1][j], dp[i][j + 1]); var i = 0; var j = 0; var add = 0; var rem = 0; var same = 0; val out = mutableListOf<String>(); while (i < l.size && j < r.size) { if (l[i] == r[j]) { out += "  ${l[i]}"; same++; i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) { out += "- ${l[i]}"; rem++; i++ } else { out += "+ ${r[j]}"; add++; j++ } }; while (i < l.size) { out += "- ${l[i++]}"; rem++ }; while (j < r.size) { out += "+ ${r[j++]}"; add++ }; return Diff(add, rem, same, out.joinToString("\n")) }

    // Small dependency-free JSON value parser/stringifier, matching the web tool's supported data shapes.
    private class JsonParser(private val s: String) { var i = 0; fun parse(): Any? { skip(); val v = value(); skip(); if (i != s.length) error("Invalid JSON"); return v }; private fun skip() { while (i < s.length && s[i].isWhitespace()) i++ }; private fun value(): Any? { skip(); if (i >= s.length) error("Invalid JSON"); return when (s[i]) { '{' -> obj(); '[' -> arr(); '"' -> str(); 't' -> lit("true", true); 'f' -> lit("false", false); 'n' -> lit("null", null); else -> num() } }; private fun lit(x: String, v: Any?): Any? { if (!s.startsWith(x, i)) error("Invalid JSON"); i += x.length; return v }; private fun str(): String { i++; val b = StringBuilder(); while (i < s.length) { val c = s[i++]; if (c == '"') return b.toString(); if (c == '\\') { if (i >= s.length) error("Invalid JSON"); when (val e = s[i++]) { '"','\\','/' -> b.append(e); 'b' -> b.append('\b'); 'f' -> b.append('\u000c'); 'n' -> b.append('\n'); 'r' -> b.append('\r'); 't' -> b.append('\t'); 'u' -> { val h = s.substring(i, i + 4); b.append(h.toInt(16).toChar()); i += 4 }; else -> error("Invalid JSON") } } else b.append(c) }; error("Invalid JSON") }; private fun num(): Any { val start = i; while (i < s.length && s[i] !in " \t\r\n,]}" ) i++; val raw = s.substring(start, i); return raw.toDoubleOrNull()?.let { if (it % 1 == 0.0) it.toLong() else it } ?: error("Invalid JSON") }; private fun arr(): List<Any?> { i++; val a = mutableListOf<Any?>(); skip(); if (i < s.length && s[i] == ']') { i++; return a }; while (true) { a += value(); skip(); when (s.getOrNull(i++)) { ',' -> continue; ']' -> return a; else -> error("Invalid JSON") } } }; private fun obj(): LinkedHashMap<String, Any?> { i++; val o = LinkedHashMap<String, Any?>(); skip(); if (i < s.length && s[i] == '}') { i++; return o }; while (true) { skip(); if (s.getOrNull(i) != '"') error("Invalid JSON"); val k = str(); skip(); if (s.getOrNull(i++) != ':') error("Invalid JSON"); o[k] = value(); skip(); when (s.getOrNull(i++)) { ',' -> continue; '}' -> return o; else -> error("Invalid JSON") } } } }
    private fun parseJson(input: String): Any? { if (input.trim().isEmpty()) error("Invalid JSON"); return try { JsonParser(input.trim()).parse() } catch (_: Exception) { error("Invalid JSON") } }
    private fun jsonStringify(v: Any?, pretty: Boolean = false, depth: Int = 0): String { val ind = if (pretty) "  ".repeat(depth) else ""; val next = if (pretty) "  ".repeat(depth + 1) else ""; return when(v) { null -> "null"; is String -> quote(v); is Boolean -> v.toString(); is Number -> v.toString(); is List<*> -> if (v.isEmpty()) "[]" else v.joinToString(if (pretty) ",\n" else ",", prefix = "[${if (pretty) "\n" else ""}$next", postfix = "${if (pretty) "\n$ind" else ""}]") { jsonStringify(it, pretty, depth + 1) }; is Map<*,*> -> if (v.isEmpty()) "{}" else v.entries.joinToString(if (pretty) ",\n" else ",", prefix = "{${if (pretty) "\n" else ""}$next", postfix = "${if (pretty) "\n$ind" else ""}}") { "${quote(it.key.toString())}:${if (pretty) " " else ""}${jsonStringify(it.value, pretty, depth + 1)}" }; else -> quote(v.toString()) } }
    private fun quote(s: String) = buildString {
        append('"')
        s.forEach { c ->
            when (c) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                '\b' -> append("\\b")
                '\u000c' -> append("\\f")
                else -> if (c.code < 0x20) append("\\u${c.code.toString(16).padStart(4, '0')}") else append(c)
            }
        }
        append('"')
    }
    private fun csvEscape(v: String) = if (v.contains(',') || v.contains('"') || v.contains('\n') || v.contains('\r')) "\"${v.replace("\"", "\"\"")}\"" else v
    private fun scalarString(v: Any?): String = when(v) { null -> ""; is Map<*,*>, is List<*> -> jsonStringify(v); else -> v.toString() }
    private fun jsonToCsv(input: String): String { val data = parseJson(input); val rows = if (data is List<*>) data else listOf(data); if (rows.isEmpty()) error("Empty CSV"); val objects = rows.map { if (it is Map<*,*>) it else linkedMapOf("value" to it) }; val keys = LinkedHashSet<String>(); objects.forEach { it.keys.forEach { k -> keys += k.toString() } }; return (keys.joinToString(",") { csvEscape(it) } + "\n" + objects.joinToString("\n") { o -> keys.joinToString(",") { k -> csvEscape(scalarString(o[k])) } }).trimEnd('\n') }
    private fun parseCsv(input: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var quoted = false
        var i = 0
        while (i < input.length) {
            val c = input[i]
            if (quoted) {
                when {
                    c == '"' && input.getOrNull(i + 1) == '"' -> { cell.append('"'); i += 2 }
                    c == '"' -> { quoted = false; i++ }
                    else -> { cell.append(c); i++ }
                }
            } else when (c) {
                '"' -> { quoted = true; i++ }
                ',' -> { row += cell.toString(); cell.clear(); i++ }
                '\n' -> { row += cell.toString(); if (row.any { it.isNotBlank() }) rows += row; row = mutableListOf(); cell.clear(); i++ }
                '\r' -> { if (input.getOrNull(i + 1) == '\n') { row += cell.toString(); if (row.any { it.isNotBlank() }) rows += row; row = mutableListOf(); cell.clear(); i += 2 } else { cell.append(c); i++ } }
                else -> { cell.append(c); i++ }
            }
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) { row += cell.toString(); if (row.any { it.isNotBlank() }) rows += row }
        return rows
    }

    private fun csvToJson(input: String): String {
        val raw = input.removePrefix("\uFEFF").trim()
        if (raw.isEmpty()) error("Empty CSV")
        val rows = parseCsv(raw)
        if (rows.size < 2) error("Empty CSV")
        val headers = rows.first().map { it.trim() }
        if (headers.all { it.isEmpty() }) error("Empty CSV")
        val objects = rows.drop(1).map { cells ->
            linkedMapOf<String, Any?>().apply {
                headers.forEachIndexed { index, header -> put(if (header.isEmpty()) "col${index + 1}" else header, cells.getOrElse(index) { "" }) }
            }
        }
        return jsonStringify(objects, true)
    }
    private fun toYaml(v: Any?, indent: Int = 0): String { val pad = "  ".repeat(indent); return when(v) { null -> "null"; is String -> if(v.isEmpty() || Regex("[:#\n&*?|>!%@`'\"{}\\[\\],]").containsMatchIn(v) || v != v.trim()) quote(v) else v; is Number, is Boolean -> v.toString(); is List<*> -> if(v.isEmpty()) "[]" else v.joinToString("\n") { item -> if(item is Map<*,*> || item is List<*>) { val inner=toYaml(item,indent+1); val ls=inner.split("\n"); "$pad- ${ls.first()}" + if(ls.size>1) "\n"+ls.drop(1).joinToString("\n") else "" } else "$pad- ${toYaml(item)}" }; is Map<*,*> -> if(v.isEmpty()) "{}" else v.entries.joinToString("\n") { (k,value) -> val key=k.toString(); val safe=if(Regex("^[A-Za-z_][\\w-]*$").matches(key)) key else quote(key); if(value is Map<*,*> || value is List<*>) { val inner=toYaml(value,indent+1); if(inner=="{}"||inner=="[]") "$pad$safe: $inner" else "$pad$safe:\n$inner" } else "$pad$safe: ${toYaml(value)}" }; else -> quote(v.toString()) } }
    private fun parseSimpleYaml(text: String): Any? { val root = LinkedHashMap<String,Any?>(); val stack = mutableListOf<Pair<Int,Any?>>(Pair(-2,root)); fun scalar(raw:String):Any? { val s=raw.trim(); return when { s.isEmpty()||s=="~"||s=="null" -> null; s=="true" -> true; s=="false" -> false; Regex("^-?\\d+(\\.\\d+)?$").matches(s) -> s.toDoubleOrNull()?.let{if(it%1==0.0)it.toLong() else it}; (s.startsWith("\"")&&s.endsWith("\""))||(s.startsWith("'")&&s.endsWith("'")) -> s.substring(1,s.length-1); else -> s } }; text.replace("\t","  ").split(Regex("\\r?\n")).forEach { raw -> if(raw.trim().isEmpty()||raw.trim().startsWith("#")) return@forEach; val ind=raw.takeWhile{it==' '}.length; val line=raw.trim(); while(stack.size>1&&ind<=stack.last().first) stack.removeAt(stack.lastIndex); val parent=stack.last().second; if(line.startsWith("- ")) { val item=line.substring(2); val list=parent as? MutableList<Any?> ?: return@forEach; val colon=item.indexOf(':'); if(colon>0){val o=LinkedHashMap<String,Any?>(); list+=o; val k=item.substring(0,colon).trim(); val v=item.substring(colon+1).trim(); if(v.isNotEmpty())o[k]=scalar(v); else {val child=LinkedHashMap<String,Any?>();o[k]=child;stack+=Pair(ind,child)}} else list+=scalar(item) } else { val colon=line.indexOf(':'); if(colon<0)return@forEach; val k=line.substring(0,colon).trim(); val rawValue=line.substring(colon+1).trim(); if(rawValue.isEmpty()){ val child:Any=if(text.replace("\t","  ").split(Regex("\\r?\n")).dropWhile{it!=raw}.firstOrNull{it.trim().isNotEmpty()}?.trim()?.startsWith("-")==true) mutableListOf<Any?>() else LinkedHashMap<String,Any?>(); (parent as MutableMap<String,Any?>)[k]=child; stack+=Pair(ind,child) } else (parent as MutableMap<String,Any?>)[k]=scalar(rawValue) } }; return root }
    private fun emitXml(v: Any?, tag: String = "root"): String { return when(v) { null -> "<$tag />"; is List<*> -> v.joinToString("") { emitXml(it, if(tag=="root")"item" else tag) }; is Map<*,*> -> "<$tag>${v.entries.joinToString(""){(k,x)->emitXml(x,k.toString().replace(Regex("[^\\w:-]"),"_"))}}</$tag>"; else -> "<$tag>${v.toString().replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}</$tag>" } }
    private fun parseXml(input: String): Any? { val cleaned=input.trim().replace(Regex("<\\?xml[\\s\\S]*?\\?>"),""); fun elem(xml:String):Any? { val map=LinkedHashMap<String,Any?>(); val re=Regex("<([A-Za-z_][\\w:.-]*)([^>]*)>([\\s\\S]*?)</\\1>|<([A-Za-z_][\\w:.-]*)[^>]*/>"); var found=false; re.findAll(xml).forEach { m->found=true; val name=m.groupValues[1].ifEmpty{m.groupValues[4]}; val inner=m.groups[3]?.value; val value=if(inner==null)null else elem(inner); if(map.containsKey(name)){val old=map[name];map[name]=if(old is List<*>) old+value else listOf(old,value)} else map[name]=value }; return if(found)map else cleaned.replace(Regex("<[^>]+>"),"").trim() }; if(cleaned.isEmpty()) error("Invalid XML"); return elem(cleaned) }
    private fun keywordDensity(input:String,o:Options):String { val keyword=o.keyword.trim().lowercase(Locale.ROOT); val words=Regex("[a-z0-9']+",RegexOption.IGNORE_CASE).findAll(input).map{it.value.lowercase(Locale.ROOT)}.toList(); val total=words.size; if(keyword.isEmpty()){return words.groupingBy{it}.eachCount().entries.sortedByDescending{it.value}.take(40).joinToString("\n"){ "${it.key}\t${it.value}\t${if(total==0)"0.00" else "%.2f".format(Locale.ROOT,it.value*100.0/total)}%" }}; val parts=keyword.split(Regex("\\s+")).filter{it.isNotEmpty()}; var count=0; if(parts.size<=1)count=words.count{it==keyword}else{val hay=words.joinToString(" ");val needle=parts.joinToString(" ");var at=0;while(at<=hay.length){val n=hay.indexOf(needle,at);if(n<0)break;count++;at=n+needle.length}}; return "keyword\t$keyword\ncount\t$count\nwords\t$total\ndensity\t${"%.3f".format(Locale.ROOT,if(total==0)0.0 else count*100.0/total)}%" }
}
