package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeUtilityEngine
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

    @Test fun exactLocalDeveloperOperationsBypassCategoryBackendWithoutBroadeningFallback() {
        val operations = listOf(
            "cron-generator", "cron-parser", "data-uri-generator", "http-status-lookup",
            "json-beautifier", "json-formatter", "json-minifier", "json-validator",
            "jwt-decoder", "jwt-expiration-checker", "markdown-preview", "markdown-to-html",
            "query-string-parser", "regex-replace", "regex-tester", "url-parser",
            "user-agent-parser", "uuid-generator", "uuid-validator",
        )
        operations.forEach { op ->
            val candidate = tool(op)
            assertTrue("$op needs its exact local engine", NativeUtilityEngine.supports(candidate))
            assertFalse("$op must not be sent to the generic backend", NativeBackendEngine.supports(candidate))
        }
        assertTrue("unimplemented Developer tools keep the backend fallback", NativeBackendEngine.supports(tool("not-yet-native")))
        assertFalse(NativeBackendEngine.supports(tool("unrelated", engineType = "custom", category = "misc")))
    }

    @Test fun developerFormOnlyShowsWebConditionalFields() {
        assertFalse(NativeDeveloperToolFormPolicy.needsSecondInput("json-formatter"))
        assertTrue(NativeDeveloperToolFormPolicy.needsSecondInput("regex-tester"))
        assertTrue(NativeDeveloperToolFormPolicy.needsRegexFlags("regex-tester"))
        assertFalse(NativeDeveloperToolFormPolicy.needsRegexFlags("json-formatter"))
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

    @Test fun regexFieldsFlagsAndReplaceToolFollowTheWebMatchReport() {
        val options = JSONObject().put("secondary", "Cat cat").put("flags", "gi").toString()
        val expected = "Pattern: /cat/\nMatches: 2\n\n1. Cat at index 0\n2. cat at index 4"
        assertEquals(expected, NativeUtilityEngine.run(tool("regex-tester"), "cat", options).text)
        assertEquals(expected, NativeUtilityEngine.run(tool("regex-replace"), "cat", options).text)
    }

    @Test fun urlParserReturnsTheBrowserJsonContractAndLastDuplicateQueryValue() {
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

    @Test fun developerFallbacksAndValidatorsMatchTheWebOutput() {
        // Match the live web regex exactly: it rejects a standard 36-character UUID and accepts this 38-character shape.
        assertEquals("Invalid UUID", NativeUtilityEngine.run(tool("uuid-validator"), "550e8400-e29b-41d4-a716-446655440000").text)
        assertEquals("Valid UUID v4", NativeUtilityEngine.run(tool("uuid-validator"), "550e8400-e29b-48d4a-a7164-446655440000").text)
        assertEquals("Invalid UUID", NativeUtilityEngine.run(tool("uuid-validator"), "not-a-uuid").text)
        assertEquals("404 Not Found", NativeUtilityEngine.run(tool("http-status-lookup"), "404").text)
        assertTrue(NativeUtilityEngine.run(tool("http-status-lookup"), "418").text.contains("504 Gateway Timeout"))
        assertEquals("a=1&b=2", NativeUtilityEngine.run(tool("query-string-parser"), "a=1&b=2").text)
        assertEquals("Mozilla/5.0", NativeUtilityEngine.run(tool("user-agent-parser"), "Mozilla/5.0").text)
        assertEquals("Cron: \nFive-field format: minute hour day-of-month month day-of-week", NativeUtilityEngine.run(tool("cron-parser"), "").text)
        assertEquals("<div>\n  <p>\n    Hello\n  </p>\n</div>", NativeUtilityEngine.run(tool("markdown-preview"), "<div><p>Hello</p></div>").text)
    }
}
