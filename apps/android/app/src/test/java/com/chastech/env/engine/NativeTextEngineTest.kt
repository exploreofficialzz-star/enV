package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeTextEngineTest {
    private val ids = listOf(
        "css-formatter", "css-minifier", "html-formatter", "html-minifier", "javascript-formatter", "javascript-minifier",
        "sql-formatter", "xml-formatter", "yaml-formatter", "css-minifier-advanced", "json-to-xml", "json-to-yaml",
        "xml-to-json", "yaml-to-json", "keyword-density-calculator", "camel-case-converter", "character-counter",
        "extract-emails", "extract-urls", "find-and-replace", "kebab-case-converter", "list-generator", "lowercase-converter",
        "paragraph-counter", "reading-time-calculator", "remove-duplicate-lines", "remove-spaces", "remove-line-breaks",
        "reverse-text", "sentence-case-converter", "sentence-counter", "slug-generator", "snake-case-converter", "sort-lines",
        "text-diff", "title-case-converter", "uppercase-converter", "word-counter", "word-frequency", "wrap-text"
    )

    @Test fun manifestSetIsExactlyFortyActiveTextIds() {
        assertEquals(40, ids.size)
        assertEquals(ids.toSet(), NativeTextEngine.supportedToolIds)
        ids.forEach { assertTrue("missing operation for $it", NativeTextEngine.operationForTool(it) != null) }
        assertEquals("json-to-csv", NativeTextEngine.operationForTool("css-minifier-advanced"))
    }

    @Test fun transformationsMatchCanonicalExamples() {
        assertEquals("HELLO", NativeTextEngine.run("uppercase-converter", "Hello"))
        assertEquals("helloWorld", NativeTextEngine.run("camel-case-converter", "Hello, world"))
        assertEquals("hello-world", NativeTextEngine.run("slug-generator", " Héllo, world! "))
        assertEquals("one\ntwo\n", NativeTextEngine.run("sort-lines", "two\none\n"))
        assertEquals("a\nb", NativeTextEngine.run("remove-duplicate-lines", "a\na\nb"))
        assertEquals("a b", NativeTextEngine.run("remove-spaces", "  a   b  "))
        assertEquals("a b", NativeTextEngine.run("remove-line-breaks", " a\n b "))
        assertEquals("CBA😀", NativeTextEngine.run("reverse-text", "😀ABC"))
    }

    @Test fun unicodeAndLiveStatisticsUseCodePoints() {
        val text = "😀 café.\n\nsecond paragraph."
        val stats = NativeTextEngine.stats(text, "120")
        assertEquals(text.codePointCount(0, text.length), stats.characters)
        assertEquals(3, stats.words)
        assertEquals(2, stats.sentences)
        assertEquals(2, stats.paragraphs)
        assertEquals(3, stats.lines)
        assertEquals(1, stats.readingMinutes)
    }

    @Test fun wordBoundariesAndBlankCountersAreStable() {
        assertEquals(2, NativeTextEngine.stats("alpha, beta!!!").words)
        assertEquals("", NativeTextEngine.run("word-counter", ""))
    }

    @Test fun configurableOptionsAndDiffAreDeterministic() {
        assertEquals("x y x", NativeTextEngine.run("find-and-replace", "a y a", options = NativeTextEngine.Options(find = "a", replace = "x")))
        assertEquals("hello\nworld", NativeTextEngine.run("wrap-text", "hello world", options = NativeTextEngine.Options(width = "8")))
        assertEquals("- one\n+ two", NativeTextEngine.run("list-generator", "one\ntwo", options = NativeTextEngine.Options(style = "numbered")).replace("1. ", "- ").replace("2. ", "+ "))
        assertTrue(NativeTextEngine.run("keyword-density-calculator", "cat cat dog", options = NativeTextEngine.Options(keyword = "cat")).contains("density\t66.667%"))
        val d = NativeTextEngine.diff("same\nold", "same\nnew")
        assertEquals(1, d.added); assertEquals(1, d.removed); assertEquals(1, d.unchanged)
        assertEquals("  same\n- old\n+ new", d.lines)
    }

    @Test fun extractionFormattingAndMinifyingHandleBlanks() {
        assertEquals("a@example.com", NativeTextEngine.run("extract-emails", "a@example.com a@example.com"))
        assertEquals("https://example.com", NativeTextEngine.run("extract-urls", "https://example.com)."))
        assertEquals("- a\n- b", NativeTextEngine.run("list-generator", "a\nb"))
        assertEquals("<div><span>x</span></div>", NativeTextEngine.run("html-minifier", "<div>\n <span>x</span>\n</div>"))
        assertEquals("", NativeTextEngine.run("css-minifier", "/* c */  "))
    }

    @Test fun conversionRoundTripsAndMalformedInputsAreReported() {
        val csv = NativeTextEngine.run("json-to-csv", "[{\"name\":\"Ada\",\"age\":3},{\"name\":\"Lin\"}]")
        assertEquals("name,age\nAda,3\nLin,", csv)
        assertTrue(NativeTextEngine.run("csv-to-json", csv).contains("\"name\": \"Ada\""))
        assertTrue(NativeTextEngine.run("json-to-yaml", "{\"name\":\"Ada\",\"ok\":true}").contains("name: Ada"))
        assertTrue(NativeTextEngine.run("json-to-xml", "{\"name\":\"Ada\"}").contains("<name>"))
        assertTrue(NativeTextEngine.run("xml-to-json", "<root><x>1</x></root>").contains("\"root\""))
        try { NativeTextEngine.run("json-to-csv", "not json"); assertTrue(false) } catch (e: IllegalStateException) { assertEquals("Invalid JSON", e.message) }
        try { NativeTextEngine.run("csv-to-json", "header"); assertTrue(false) } catch (e: IllegalStateException) { assertEquals("Empty CSV", e.message) }
    }

    @Test fun csvPreservesMultilineCellsAndEscapedQuotesAsValidJson() {
        val csv = NativeTextEngine.run("json-to-csv", """[{"name":"first\nsecond","quote":"a\"b"}]""")
        val json = NativeTextEngine.run("csv-to-json", csv)
        assertTrue(csv.contains("first\nsecond"))
        assertTrue(json.contains("first\\nsecond"))
        assertTrue(json.contains("a\\\"b"))
    }
}
