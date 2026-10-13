package com.chastech.env.engine

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.json.JSONObject
import org.junit.Test

class NativeDeveloperStudioTest {
    private fun tool(id: String) = ToolRecord(
        id = id, name = id, slug = id, description = "", category = "developer",
        keywords = emptyList(), tags = emptyList(), icon = "Code", popularity = 0,
        featured = false, clientSide = true, requiresBackend = false, requiresAuth = false,
        status = "active", related = emptyList(), engine = EngineInfo("developer", id, mapOf("op" to id)),
    )

    private fun run(id: String, input: String, secondary: String = ""): String =
        NativeUtilityEngine.run(tool(id), input, """{"secondary":${JSONObject.quote(secondary)}}""").text

    @Test fun cronEncoderDecoderAndHumanReportStayLocal() {
        assertEquals("Ki8xNSAqICogKiAq", run("cron-encoder", "*/15 * * * *"))
        val decoded = run("cron-decoder", "Ki8xNSAqICogKiAq")
        assertTrue(decoded.startsWith("*/15 * * * *"))
        assertTrue(decoded.contains("nextRuns"))
        assertTrue(decoded.contains("utc"))
    }

    @Test fun jsonDecoderAndBase64InspectorPerformEncodingWork() {
        assertEquals("{\"name\":\"Ada\",\"items\":[1,2]}", run("json-decoder", "eyJuYW1lIjoiQWRhIiwiaXRlbXMiOlsxLDJdfQ=="))
        val inspected = JSONObject(run("base64-inspector", "SGk="))
        assertTrue(inspected.getBoolean("valid"))
        assertEquals("Hi", inspected.getString("preview"))
    }

    @Test fun jsonSchemaGeneratorInfersPropertiesAndNumericTypes() {
        val schema = JSONObject(run("developer-json-schema-generator", "{\"name\":\"Ada\",\"count\":2,\"ratio\":1.5}"))
        assertEquals("https://json-schema.org/draft/2020-12/schema", schema.getString("\$schema"))
        val properties = schema.getJSONObject("properties")
        assertEquals("string", properties.getJSONObject("name").getString("type"))
        assertEquals("integer", properties.getJSONObject("count").getString("type"))
        assertEquals("number", properties.getJSONObject("ratio").getString("type"))
    }

    @Test fun markupEncodingAndSqlCssFormattingAreDomainSpecific() {
        assertEquals("<root>Hi</root>", run("html-decoder", "&lt;root&gt;Hi&lt;/root&gt;"))
        assertTrue(run("sql-formatter", "SELECT id,name FROM users WHERE active=true;").contains("FROM users"))
        assertTrue(run("css-formatter", ".card{color:red;padding:4px}").contains("color:red;"))
        assertTrue(run("markdown-to-html", "# Hello\n\nA **bold** note").contains("<h1>Hello</h1>"))
    }

    @Test fun httpStudioParsesRepeatedQueryValuesAndBuildsSafeHeaders() {
        val parsed = JSONObject(run("query-string-parser", "q=one&q=two&space=hello+world"))
        assertEquals(3, parsed.getInt("count"))
        assertEquals("hello world", parsed.getJSONObject("grouped").getJSONArray("space").getString(0))
        assertEquals("q=hello+world&tag=a&tag=b", run("query-string-builder", "{\"q\":\"hello world\",\"tag\":[\"a\",\"b\"]}"))
        assertTrue(run("http-header-builder", "{\"Accept\":\"application/json\",\"X-Example\":\"enV\"}").contains("Accept: application/json"))
        assertTrue(run("user-agent-parser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36").contains("Windows"))
    }

    @Test fun uuidInspectionSupportsNilAndWebhookOutputRemainsValidJson() {
        assertTrue(run("uuid-validator", "00000000-0000-0000-0000-000000000000").startsWith("Valid Nil UUID"))
        val payload = JSONObject(run("webhook-payload-generator", "order.paid"))
        assertEquals("order.paid", payload.getString("type"))
        assertTrue(payload.getJSONObject("meta").getBoolean("generatedLocally"))
    }

    @Test fun hashDecoderDoesNotPretendHashesCanBeReversed() {
        val message = runCatching { run("hash-decoder", "aabbcc") }.exceptionOrNull()?.message.orEmpty()
        assertTrue(message.contains("one-way"))
    }
    @Test fun regexBatchRunsEachSampleIndependentlyWithSafetyMetadata() {
        val batch = JSONObject(run("regex-tester", "\\d+", """["one 12","no digits","34 and 56"]"""))
        assertEquals("batch", batch.getString("mode"))
        assertEquals(3, batch.getInt("sampleCount"))
        assertEquals(3, batch.getInt("matchCount"))
        assertEquals(2, batch.getJSONArray("results").getJSONObject(2).getInt("matchCount"))
        val riskySamples = """["${"a".repeat(40)}!","safe"]"""
        val risk = JSONObject(run("regex-tester", "(a+)+$", riskySamples))
        assertTrue(risk.getJSONArray("results").getJSONObject(0).getBoolean("executionSkipped"))
    }

    @Test fun schemaGeneratorMergesHeterogeneousArrayRecords() {
        val schema = JSONObject(run("developer-json-schema-generator", """[{"id":1,"name":"Ada"},{"id":2,"active":true},{"id":3.5,"name":null}]"""))
        val items = schema.getJSONObject("items")
        assertEquals("object", items.getString("type"))
        assertEquals(listOf("id"), (0 until items.getJSONArray("required").length()).map { items.getJSONArray("required").getString(it) })
        assertEquals("number", items.getJSONObject("properties").getJSONObject("id").getString("type"))
        assertEquals(listOf("null", "string"), (0 until items.getJSONObject("properties").getJSONObject("name").getJSONArray("type").length()).map { items.getJSONObject("properties").getJSONObject("name").getJSONArray("type").getString(it) })
    }

    @Test fun jsonDiffIgnoresKeyOrderAndReturnsStructuralPaths() {
        val same = JSONObject(run("json-diff", """{"a":1,"b":{"x":2}}""", """{"b":{"x":2},"a":1}"""))
        assertTrue(same.getBoolean("equal"))
        val changed = JSONObject(run("json-diff", """{"items":[{"id":1}]}""", """{"items":[{"id":2},{"id":3}]}"""))
        assertFalse(changed.getBoolean("equal"))
        val expectedPath = "\u0024" + "[\"items\"][0][\"id\"]"
        assertTrue((0 until changed.getJSONArray("changes").length()).any { changed.getJSONArray("changes").getJSONObject(it).optString("path") == expectedPath })
    }

    @Test fun cronWildcardStepsAreDocumentedAndJsonInspectorScansNumbersOutsideStrings() {
        val cron = JSONObject(run("cron-parser", "0 0 */2 * MON"))
        assertTrue(cron.getString("explanation").contains("Vixie-style semantics"))
        assertTrue(cron.getJSONArray("nextRuns").length() > 0)
        val report = JSONObject(run("json-inspector", """{"id":9007199254740993,"memo":"9007199254740993","items":[1,{"flag":true}],"name":"a","name":"b"}"""))
        assertEquals("object", report.getString("rootType"))
        assertTrue(report.getInt("nodeCount") >= 6)
        val tokens = report.getJSONArray("unsafeIntegerTokens")
        assertEquals(1, tokens.length())
        assertEquals("9007199254740993", tokens.getJSONObject(0).getString("token"))
        val duplicateKeys = report.getJSONArray("duplicateKeys")
        assertTrue((0 until duplicateKeys.length()).any { duplicateKeys.optString(it) == "\u0024[\"name\"]" })
    }

    @Test fun jwtDecoderReturnsExplicitDecodeOnlyWarningAndSafeClaimStates() {
        val token = "eyJhbGciOiJub25lIn0.eyJleHAiOjFlKzEwMCwiaWF0Ijo5OTk5OTk5OTk5fQ."
        val report = JSONObject(run("jwt-decoder", token))
        assertFalse(report.getBoolean("signatureVerified"))
        assertTrue(report.getString("warning").contains("DECODE ONLY"))
        assertEquals("out-of-range", report.getJSONObject("claims").getJSONObject("exp").getString("status"))
        assertEquals("issued-in-the-future", report.getJSONObject("claims").getJSONObject("iat").getString("status"))
    }

}
