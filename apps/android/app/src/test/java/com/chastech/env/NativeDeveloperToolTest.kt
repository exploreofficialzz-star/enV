package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeUtilityEngine
import java.io.ByteArrayInputStream
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDeveloperToolTest {
    private fun tool(op: String, engineType: String = "developer", category: String = "developer") = ToolRecord(
        id = op, name = op, slug = op, description = "", category = category,
        keywords = emptyList(), tags = emptyList(), icon = "Code2", popularity = 0,
        featured = false, clientSide = true, requiresBackend = false, requiresAuth = false,
        status = "active", related = emptyList(), engine = EngineInfo(engineType, op, mapOf("op" to op)),
    )

    @Test fun allDeveloperOperationsRemainNativeLocalAndBypassCategoryBackend() {
        listOf("cron-generator", "json-formatter", "regex-tester", "url-parser", "uuid-validator", "ascii-encoder", "csv-formatter", "mime-validator", "xml-validator", "file-hash-calculator", "future-developer-operation").forEach { op ->
            val candidate = tool(op)
            assertTrue("$op needs its local Developer engine", NativeUtilityEngine.supports(candidate))
            assertFalse("$op must not be sent to generic backend", NativeBackendEngine.supports(candidate))
        }
        assertFalse(NativeBackendEngine.supports(tool("unrelated", engineType = "custom", category = "misc")))
    }

    @Test fun developerFormOnlyShowsWebConditionalFields() {
        assertFalse(NativeDeveloperToolFormPolicy.needsSecondInput("json-formatter"))
        assertTrue(NativeDeveloperToolFormPolicy.needsSecondInput("regex-tester"))
        assertTrue(NativeDeveloperToolFormPolicy.needsRegexFlags("regex-tester"))
        assertFalse(NativeDeveloperToolFormPolicy.needsRegexFlags("json-formatter"))
    }

    @Test fun implementedDatetimeRecordsDoNotUseTheRejectedDeveloperBackend() {
        assertFalse(NativeBackendEngine.supports(tool("unix-timestamp-converter", engineType = "datetime")))
    }

    @Test fun jsonToolsSupportObjectsArraysAndTopLevelScalarValues() {
        val formatter = tool("json-formatter")
        val objectOutput = NativeUtilityEngine.run(formatter, "{\"name\":\"enV\",\"count\":3}").text
        assertTrue(objectOutput.startsWith("{\n"))
        assertTrue(objectOutput.contains("\"name\": \"enV\""))
        assertTrue(objectOutput.contains("\"count\": 3"))
        assertTrue(NativeUtilityEngine.run(formatter, "[1,2]").text.startsWith("[\n"))
        assertEquals("\"enV\"", NativeUtilityEngine.run(formatter, "\"enV\"").text)
        assertEquals("[1,true,null]", NativeUtilityEngine.run(tool("json-minifier"), " [1, true, null] ").text)
        assertEquals("Valid JSON (RFC 8259-compatible parser).", NativeUtilityEngine.run(tool("json-validator"), "[1,true]").text)
        assertTrue(runCatching { NativeUtilityEngine.run(tool("json-validator"), "not-json") }.isFailure)
    }

    @Test fun jsonFormatterWarnsForUnsafeIntegerTokensAndDuplicateKeys() {
        val raw = "{\"id\":9007199254740993,\"dup\":1,\"dup\":2}"
        val output = NativeUtilityEngine.run(tool("json-formatter"), raw).text
        assertTrue(output.contains("JavaScript Number cannot safely represent this integer"))
        assertTrue(output.contains("9007199254740993"))
        assertTrue(output.contains("Duplicate object keys"))
        assertTrue(output.contains("last occurrence"))
    }

    @Test fun regexFieldsAndFlagsUseTheNativeStudioStructuredReport() {
        val options = JSONObject().put("secondary", "Cat cat").put("flags", "gi").put("replacement", "dog").toString()
        val matches = JSONObject(NativeUtilityEngine.run(tool("regex-tester"), "cat", options).text)
        assertEquals("test", matches.getString("mode"))
        val testRow = matches.getJSONArray("results").getJSONObject(0)
        assertEquals(2, testRow.getInt("matchCount"))
        assertEquals("Cat", testRow.getJSONArray("matches").getJSONObject(0).getString("match"))
        val replaced = JSONObject(NativeUtilityEngine.run(tool("regex-replace"), "cat", options).text)
        val replacementRow = replaced.getJSONArray("results").getJSONObject(0)
        assertEquals("dog dog", replacementRow.getString("replacementPreview"))
        assertEquals(2, replacementRow.getJSONArray("matches").length())
    }

    @Test fun urlParserReturnsBrowserJsonContractAndLastDuplicateQueryValue() {
        val output = NativeUtilityEngine.run(tool("url-parser"), "https://example.com:8080/path?q=1&q=2#top").text
        val json = JSONObject(output)
        assertEquals("https://example.com:8080/path?q=1&q=2#top", json.getString("href"))
        assertEquals("https:", json.getString("protocol"))
        assertEquals("example.com", json.getString("hostname"))
        assertEquals("8080", json.getString("port"))
        assertEquals("/path", json.getString("pathname"))
        assertEquals("?q=1&q=2", json.getString("search"))
        assertEquals("#top", json.getString("hash"))
        assertEquals("https://example.com:8080", json.getString("origin"))
        assertEquals("2", json.getJSONObject("params").getString("q"))
    }

    @Test fun browserVerifiedEncodingCsvMimeMarkupAndFallbacksMatch() {
        assertEquals("72 105", NativeUtilityEngine.run(tool("ascii-encoder"), "Hi").text)
        assertEquals("name,age\nAda,36\nGrace,40", NativeUtilityEngine.run(tool("csv-formatter"), "name,age\nAda,36\nGrace,40").text)
        assertEquals("application/pdf", NativeUtilityEngine.run(tool("mime-validator"), "pdf").text)
        assertEquals("Valid markup/XML.", NativeUtilityEngine.run(tool("xml-validator"), "<root><child>ok</child></root>").text)
        assertTrue(JSONObject(NativeUtilityEngine.run(tool("developer-api-mock-response-generator"), "{\"id\":1}").text).getJSONObject("meta").getBoolean("mock"))
        assertEquals("data:text/plain;base64,aGVsbG8=", NativeUtilityEngine.run(tool("data-uri-generator"), "hello").text)
        assertTrue(runCatching { NativeUtilityEngine.run(tool("file-hash-calculator"), "hello") }.exceptionOrNull()?.message?.contains("local file") == true)
        assertEquals("422 Unprocessable Content", NativeUtilityEngine.run(tool("http-status-lookup"), "422").text)
    }

    @Test fun webDocumentedValidatorsStatusAndFallbacksMatch() {
        assertEquals("Valid UUID v4", NativeUtilityEngine.run(tool("uuid-validator"), "550e8400-e29b-41d4-a716-446655440000").text)
        assertEquals("Invalid UUID", NativeUtilityEngine.run(tool("uuid-validator"), "550e8400-e29b-48d4a-a7164-446655440000").text)
        assertEquals("Invalid UUID", NativeUtilityEngine.run(tool("uuid-validator"), "not-a-uuid").text)
        assertEquals("404 Not Found", NativeUtilityEngine.run(tool("http-status-lookup"), "404").text)
        assertTrue(NativeUtilityEngine.run(tool("http-status-lookup"), "418").text.contains("teapot"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-lookup"), "422").text.contains("could not be processed"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-lookup"), "429").text.contains("Too many requests"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-lookup"), "503").text.contains("temporarily unable"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-reference"), "").text.contains("207: Multi-Status"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-reference"), "").text.contains("418: I'm a teapot"))
        assertTrue(NativeUtilityEngine.run(tool("http-status-reference"), "").text.contains("503: Service Unavailable"))
        assertEquals("a=1&b=2", NativeUtilityEngine.run(tool("query-string-parser"), "a=1&b=2").text)
        assertEquals("Mozilla/5.0", NativeUtilityEngine.run(tool("user-agent-parser"), "Mozilla/5.0").text)
        assertTrue(JSONObject(NativeUtilityEngine.run(tool("cron-parser"), "*/15 * * * *").text).has("nextRuns"))
        assertEquals("<div>\n  <p>\n    Hello\n  </p>\n</div>", NativeUtilityEngine.run(tool("markdown-preview"), "<div><p>Hello</p></div>").text)
    }

    @Test fun nativeFileHashUsesRawBytesAndMatchesSHA256GoldenVector() {
        val report = JSONObject(NativeUtilityEngine.hashDeveloperFileStream("sha256-hash", ByteArrayInputStream("hello".toByteArray())))
        assertEquals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", report.getJSONArray("hashes").getJSONObject(0).getString("digest"))
        assertTrue(report.getBoolean("localOnly"))
    }

    @Test fun nativeSQLQueryBuilderUsesBoundParametersAndRejectsUnsafeIdentifiers() {
        val spec = JSONObject().put("table", "users").put("columns", org.json.JSONArray(listOf("id", "email"))).put("filters", org.json.JSONArray().put(JSONObject().put("column", "active").put("operator", "=").put("value", true))).put("limit", 25)
        val result = JSONObject(NativeUtilityEngine.run(tool("developer-sql-query-builder"), spec.toString()).text)
        assertTrue(result.getString("sql").contains("WHERE \"active\" = ? LIMIT 25"))
        assertEquals(true, result.getJSONArray("parameters").get(0))
        val bad = runCatching { NativeUtilityEngine.run(tool("developer-sql-query-builder"), "{\"table\":\"users; DROP TABLE users\"}") }.exceptionOrNull()
        assertTrue(bad?.message?.contains("identifier", ignoreCase = true) == true)
    }

    @Test fun secureTokenGeneratorUsesBoundedUrlSafeOutput() {
        val secureTool = tool("secure-token", engineType = "generator", category = "utilities")
        val token = NativeUtilityEngine.run(secureTool, optionsJson = "{\"length\":64}").text
        assertEquals(64, token.length)
        assertTrue(token.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' })
        assertTrue(runCatching { NativeUtilityEngine.run(secureTool, optionsJson = "{\"length\":0}") }.isFailure)
        assertTrue(runCatching { NativeUtilityEngine.run(secureTool, optionsJson = "{\"length\":5000}") }.isFailure)
        assertTrue(runCatching { NativeUtilityEngine.run(secureTool, optionsJson = "{\"length\":1.5}") }.isFailure)
        assertTrue(runCatching { NativeUtilityEngine.run(secureTool, optionsJson = "{\"length\":\"oops\"}") }.isFailure)
    }
}
