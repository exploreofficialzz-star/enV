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

    @Test fun hardJavaScriptAndSqlFixturesFormatToReadableMultilineOutput() {
        val js = NativeTextEngine.run("javascript-formatter", "const load=async(url)=>{const response=await fetch(url);return {ok:response.ok,data:await response.json()};};")
        assertTrue(js.contains("\n"))
        assertTrue(js.contains("async"))
        assertTrue(js.contains("await fetch"))
        assertTrue(js.contains("Note: conservative local formatter"))
        val sql = NativeTextEngine.run("sql-formatter", "SELECT u.id,u.name,'group by or order by' AS note FROM users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.active=1 GROUP BY u.id,u.name HAVING COUNT(*)>0 ORDER BY u.name;")
        assertTrue(sql.contains("\nFROM"))
        assertTrue(sql.contains("\nGROUP BY"))
        assertTrue(sql.contains("WHERE u.active = 1"))
        assertTrue(sql.contains("'group by or order by'"))
        assertTrue(!sql.contains("'\ngroup by"))
        val emptyJsMessage = runCatching { NativeTextEngine.run("javascript-formatter", "") }.exceptionOrNull()?.message.orEmpty()
        assertTrue(emptyJsMessage.contains("Paste JavaScript"))
    }

    @Test fun sharedGoldenSqlDialectProtectsDollarQuotedLiterals() {
        val output = NativeTextEngine.run("sql-formatter", DeveloperStudioGoldenFixtures.SQL_INPUT, options = NativeTextEngine.Options(dialect = DeveloperStudioGoldenFixtures.SQL_DIALECT))
        assertTrue(output.contains("LEFT JOIN"))
        assertTrue(output.contains("GROUP BY"))
        assertTrue(output.contains("'a FROM b'"))
        assertTrue(output.contains("\$body\$WHERE SELECT GROUP BY\$body\$"))
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

    @Test fun sharedGoldenFormatterCorpusExercisesNativeRoutesAndSqlDialects() {
        val css = NativeTextEngine.run("css-formatter", DeveloperStudioGoldenFixtures.CSS_INPUT)
        assertTrue(css.contains("@media")); assertTrue(css.contains(".card")); assertTrue(css.contains("\n"))
        val html = NativeTextEngine.run("html-formatter", DeveloperStudioGoldenFixtures.HTML_INPUT)
        assertTrue(html.contains("<main>")); assertTrue(html.contains("<strong>")); assertTrue(html.contains("safe"))
        val xml = NativeTextEngine.run("xml-formatter", DeveloperStudioGoldenFixtures.XML_INPUT)
        assertTrue(xml.contains("<root")); assertTrue(xml.contains("<value>")); assertTrue(xml.contains("hello"))
        val yaml = NativeTextEngine.run("yaml-formatter", DeveloperStudioGoldenFixtures.YAML_INPUT)
        assertTrue(yaml.contains("name:") && yaml.contains("maxBytes:"))

        val dialectFixtures = listOf(
            "mysql" to DeveloperStudioGoldenFixtures.SQL_MYSQL_INPUT,
            "sqlite" to DeveloperStudioGoldenFixtures.SQL_SQLITE_INPUT,
            "bigquery" to DeveloperStudioGoldenFixtures.SQL_BIGQUERY_INPUT,
            "snowflake" to DeveloperStudioGoldenFixtures.SQL_SNOWFLAKE_INPUT
        )
        dialectFixtures.forEach { (dialect, input) ->
            val output = NativeTextEngine.run("sql-formatter", input, options = NativeTextEngine.Options(dialect = dialect))
            assertTrue("$dialect formatter output must be non-empty", output.isNotBlank())
            assertTrue("$dialect formatter must provide multi-line output", output.contains("\n"))
            assertTrue("$dialect formatter must preserve SELECT", output.contains("SELECT"))
        }
    }

    @Test fun nativeXmlFormatterParsesAndRejectsUnsafeOrMalformedDocuments() {
        val formatted = NativeTextEngine.run("xml-formatter", "<root><item id=\"1\">value &amp; more</item><empty/></root>")
        assertTrue(formatted.contains("<root"))
        assertTrue(formatted.contains("<item"))
        assertTrue(formatted.contains("value &amp; more"))
        assertTrue(formatted.contains("\n"))
        listOf("<root><child></root>", "<!DOCTYPE root [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><root>&x;</root>").forEach { source ->
            try { NativeTextEngine.run("xml-formatter", source); assertTrue("invalid or unsafe XML must fail", false) }
            catch (error: IllegalArgumentException) { assertTrue(error.message.orEmpty().contains("XML", ignoreCase = true)) }
        }
    }

}
