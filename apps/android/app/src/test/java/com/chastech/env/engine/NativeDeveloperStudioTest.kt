package com.chastech.env.engine

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.json.JSONArray
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

    @Test fun generatedGraphQLAndNginxTemplatesKeepLiteralVariables() {
        assertTrue(run("graphql-query-builder", "").contains("query GetExample(\$id: ID!)"))
        assertTrue(run("nginx-config-generator", "").contains("try_files \$uri \$uri/ =404;"))
    }

    @Test fun uuidInspectionSupportsNilAndWebhookOutputRemainsValidJson() {
        assertTrue(run("uuid-validator", "00000000-0000-0000-0000-000000000000").startsWith("Valid Nil UUID"))
        assertEquals(List(16) { "00000000" }.joinToString(" "), run("uuid-encoder", "00000000-0000-0000-0000-000000000000"))
        assertEquals("00000000-0000-0000-0000-000000000000", run("uuid-decoder", "0".repeat(128)))
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
        assertEquals("test", batch.getString("mode"))
        assertEquals(3, batch.getInt("sampleCount"))
        assertEquals(3, batch.getInt("matchCount"))
        assertEquals(2, batch.getJSONArray("results").getJSONObject(2).getInt("matchCount"))
        val riskySamples = """["${"a".repeat(40)}!","safe"]"""
        val risk = JSONObject(run("regex-tester", "(a+)+$", riskySamples))
        assertTrue(risk.getJSONArray("results").getJSONObject(0).getBoolean("executionSkipped"))
    }

    @Test fun sharedGoldenRegexBatchAndPipelineFixturesExerciseNativeStudio() {
        val batch = JSONObject(NativeRegexStudio.run(
            DeveloperStudioGoldenFixtures.REGEX_PATTERN,
            DeveloperStudioGoldenFixtures.REGEX_SAMPLES_JSON,
            DeveloperStudioGoldenFixtures.REGEX_FLAGS,
            "",
            "test",
        ))
        assertEquals(3, batch.getInt("sampleCount"))
        val rows = batch.getJSONArray("results")
        assertEquals(true, rows.getJSONObject(0).getBoolean("assertionPassed"))
        val firstMatch = rows.getJSONObject(0).getJSONArray("matches").getJSONObject(0)
        assertEquals("ORD", firstMatch.getJSONArray("groups").getString(0))
        assertEquals("ORD", firstMatch.getJSONObject("namedGroups").getString("kind"))
        assertEquals("0187", firstMatch.getJSONObject("namedGroups").getString("id"))
        val pipeline = JSONObject(NativeRegexStudio.run(
            "<[^>]+>", DeveloperStudioGoldenFixtures.REGEX_PIPELINE_JSON, "g", "", "pipeline",
        ))
        assertTrue(pipeline.getString("finalOutputPreview").contains("Hello, world! 42"))
    }

    @Test fun sharedGoldenSqlUsesDialectAwareSharedFormatter() {
        val output = NativeTextEngine.formatSQL(DeveloperStudioGoldenFixtures.SQL_INPUT, DeveloperStudioGoldenFixtures.SQL_DIALECT)
        assertTrue(output.contains("LEFT JOIN"))
        assertTrue(output.contains("GROUP BY"))
        assertTrue(output.contains("'a FROM b'"))
        assertTrue(output.contains("\$body\$WHERE SELECT GROUP BY\$body\$"))
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


    @Test fun jsonFormatterPreservesUnsafeIntegerTokensWithoutSerializationRounding() {
        val raw = """{"z":9007199254740993,"nested":{"id":9223372036854775807},"memo":"9007199254740993"}"""
        val formatted = run("json-formatter", raw)
        assertTrue(formatted.contains("WARNING: JavaScript Number cannot safely represent this integer"))
        assertTrue(formatted.contains("9007199254740993"))
        assertTrue(formatted.contains("9223372036854775807"))
        assertTrue(formatted.contains("\"memo\": \"9007199254740993\""))
        val minified = run("json-minifier", raw)
        assertTrue(minified.contains("9007199254740993"))
        assertTrue(minified.contains("9223372036854775807"))
    }

    @Test fun jwtDecoderKeepsRawHeaderAndPayloadForUnsafeIntegerReview() {
        val token = "eyJhbGciOiJub25lIiwiaWQiOjkwMDcxOTkyNTQ3NDA5OTN9.eyJzdWIiOiJKYW5lIERvZSIsImlkIjo5MDA3MTk5MjU0NzQwOTkzfQ."
        val report = JSONObject(run("jwt-decoder", token))
        assertFalse(report.getBoolean("signatureVerified"))
        assertTrue(report.getString("headerRawJson").contains("9007199254740993"))
        assertTrue(report.getString("payloadRawJson").contains("9007199254740993"))
        assertTrue(report.getString("largeIntegerPrecisionWarning").contains("original digits"))
    }


    @Test fun corsAndCspGeneratorsValidateSecuritySensitiveConfiguration() {
        val config = """{"origins":["https://app.example.com","https://admin.example.com"],"methods":["GET","POST"],"headers":["Content-Type","Authorization"],"credentials":true,"maxAge":300}"""
        val cors = run("developer-cors-generator", config)
        assertTrue(cors.contains("""allowedOrigins = ["https://app.example.com","https://admin.example.com"]"""))
        assertTrue(cors.contains("not directly executable middleware"))
        val unsafeCors = """{"origins":["*"],"credentials":true}"""
        assertTrue(runCatching { run("developer-cors-generator", unsafeCors) }.exceptionOrNull()?.message.orEmpty().contains("forbids Access-Control-Allow-Origin: *"))
        val csp = run("developer-csp-generator", """{"default-src":["'self'"],"script-src":["'self'","'unsafe-inline'"]}""")
        assertTrue(csp.contains("script-src 'self' 'unsafe-inline'"))
        assertTrue(csp.contains("Review broad/unsafe source expressions"))
    }

    @Test fun strictCodecAndHashComparisonSemanticsMatchWebContract() {
        assertEquals("a+b+c", run("url-decoder", "a+b%2Bc"))
        assertEquals("M", run("base64-decoder", "TQ"))
        for (bad in listOf("/w==", "Zh==", "TQ=")) {
            assertTrue("Expected strict Base64 rejection for $bad", runCatching { run("base64-decoder", bad) }.isFailure)
        }
        val hex = JSONObject(run("hash-compare", "5D41402ABC4B2A76B9719D911017C592", "5d41402abc4b2a76b9719d911017c592"))
        assertTrue(hex.getBoolean("equal"))
        assertEquals("hex-digest-case-insensitive", hex.getString("comparison"))
        val b64 = JSONObject(run("hash-compare", "AbCd+/==", "abcd+/=="))
        assertFalse(b64.getBoolean("equal"))
        assertEquals("exact-string", b64.getString("comparison"))
    }

    @Test fun httpRegistryIncludesRecentAndReservedStatusNuance() {
        val reference = run("http-status-reference", "")
        assertTrue(reference.contains("104: Upload Resumption Supported"))
        assertTrue(reference.contains("305: Use Proxy"))
        assertTrue(reference.contains("306: (Unused)"))
        val teapot = run("http-status-lookup", "418")
        assertTrue(teapot.contains("I'm a teapot"))
        assertTrue(teapot.contains("historical/application-specific"))
        assertTrue(run("http-status-lookup", "104").contains("temporary IANA registration"))
    }



    @Test fun crossPlatformRecipePipelineIsBoundedInspectableAndPreservesUnicode() {
        val input = "  enV 🚀\r\nline two\rline two  "
        val config = JSONObject().put("input", input).put("steps", JSONArray()
            .put(JSONObject().put("op", "normalize-newlines").put("name", "Normalize newlines"))
            .put(JSONObject().put("op", "trim"))
            .put(JSONObject().put("op", "unique-lines")))
        val report = JSONObject(NativeDeveloperRecipe.run(config.toString()))
        assertEquals("completed", report.getString("status"))
        assertEquals(3, report.getInt("stepsCompleted"))
        assertEquals("enV 🚀\nline two\nline two", report.getString("finalOutput"))
        assertEquals("ok", report.getJSONArray("steps").getJSONObject(0).getString("status"))
        assertTrue(report.getString("privacy").contains("does not upload"))
    }

    @Test fun recipeJsonOperationsPreserveRawLargeIntegersAndRefuseAmbiguousSort() {
        val raw = """{"id":9007199254740993,"message":"hello"}"""
        val config = JSONObject().put("input", raw).put("steps", JSONArray().put(JSONObject().put("op", "json-format")))
        val report = JSONObject(NativeDeveloperRecipe.run(config.toString()))
        assertTrue(report.getString("finalOutput").contains("9007199254740993"))
        assertTrue(report.getJSONArray("warnings").toString().contains("cannot safely represent"))
        val duplicate = JSONObject().put("input", """{"a":1,"a":2}""").put("steps", JSONArray().put(JSONObject().put("op", "json-sort-keys")))
        val message = runCatching { NativeDeveloperRecipe.run(duplicate.toString()) }.exceptionOrNull()?.message.orEmpty()
        assertTrue(message.contains("duplicate object keys"))
    }

    @Test fun recipeJsonPointerUsesRfc6901EscapesAndPreservesLargeNumbers() {
        val config = JSONObject().put("input", DeveloperStudioGoldenFixtures.RECIPE_POINTER_INPUT).put("steps", JSONArray().put(JSONObject().put("op", "json-pointer-get").put("pointer", DeveloperStudioGoldenFixtures.RECIPE_POINTER_PATH)))
        val report = JSONObject(NativeDeveloperRecipe.run(config.toString()))
        assertEquals(DeveloperStudioGoldenFixtures.RECIPE_POINTER_OUTPUT, report.getString("finalOutput"))
        assertTrue(report.getJSONArray("warnings").toString().contains("cannot safely represent"))
        val duplicate = JSONObject().put("input", """{"a":1,"a":2}""").put("steps", JSONArray().put(JSONObject().put("op", "json-pointer-get").put("pointer", "/a")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(duplicate.toString()) }.exceptionOrNull()?.message.orEmpty().contains("ambiguous duplicate object keys"))
        val badIndex = JSONObject().put("input", """{"items":[1,2]}""").put("steps", JSONArray().put(JSONObject().put("op", "json-pointer-get").put("pointer", "/items/01")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(badIndex.toString()) }.exceptionOrNull()?.message.orEmpty().contains("canonical array index"))
    }

    @Test fun recipeCsvTransformsRoundTripQuotedFieldsAndFailOnAmbiguousRecords() {
        val csvToJson = JSONObject(NativeDeveloperRecipe.run(JSONObject().put("input", DeveloperStudioGoldenFixtures.RECIPE_CSV_INPUT).put("steps", JSONArray().put(JSONObject().put("op", "csv-to-json"))).toString()))
        assertEquals(DeveloperStudioGoldenFixtures.RECIPE_CSV_EXPECTED_JSON, csvToJson.getString("finalOutput"))
        val jsonToCsv = JSONObject(NativeDeveloperRecipe.run(JSONObject().put("input", csvToJson.getString("finalOutput")).put("steps", JSONArray().put(JSONObject().put("op", "json-to-csv"))).toString()))
        assertEquals(DeveloperStudioGoldenFixtures.RECIPE_CSV_EXPECTED_CSV, jsonToCsv.getString("finalOutput"))
        val duplicateHeaders = JSONObject().put("input", "name,name\na,b").put("steps", JSONArray().put(JSONObject().put("op", "csv-to-json")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(duplicateHeaders.toString()) }.exceptionOrNull()?.message.orEmpty().contains("headers must be unique"))
        val malformed = JSONObject().put("input", "name,note\nAda,\"unfinished").put("steps", JSONArray().put(JSONObject().put("op", "csv-to-json")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(malformed.toString()) }.exceptionOrNull()?.message.orEmpty().contains("ends inside a quoted field"))
    }

    @Test fun recipeStrictCodecsRoundTripUnicodeAndRejectNonCanonicalBase64() {
        val config = JSONObject().put("input", "enV 🚀") .put("steps", JSONArray().put(JSONObject().put("op", "base64-encode")).put(JSONObject().put("op", "base64-decode")))
        assertEquals("enV 🚀", JSONObject(NativeDeveloperRecipe.run(config.toString())).getString("finalOutput"))
        val invalid = JSONObject().put("input", "Zh==").put("steps", JSONArray().put(JSONObject().put("op", "base64-decode")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(invalid.toString()) }.exceptionOrNull()?.message.orEmpty().contains("canonical"))
    }

    @Test fun recipeLimitsAndUnknownOperationsFailClosed() {
        val tooMany = JSONArray(); repeat(17) { tooMany.put(JSONObject().put("op", "trim")) }
        val limit = JSONObject().put("input", "x").put("steps", tooMany)
        assertTrue(runCatching { NativeDeveloperRecipe.run(limit.toString()) }.exceptionOrNull()?.message.orEmpty().contains("between 1 and 16"))
        val unknown = JSONObject().put("input", "x").put("steps", JSONArray().put(JSONObject().put("op", "eval")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(unknown.toString()) }.exceptionOrNull()?.message.orEmpty().contains("unsupported operation"))
    }

    @Test fun recipeLinesAndUnicodeNormalizationUsePortableSemantics() {
        val reverse = JSONObject().put("input", "🚀 first\nsecond\nthird\n").put("steps", JSONArray().put(JSONObject().put("op", "reverse-lines")))
        assertEquals("third\nsecond\n🚀 first\n", JSONObject(NativeDeveloperRecipe.run(reverse.toString())).getString("finalOutput"))
        val unicode = JSONObject().put("input", "\uFEFFCafe\u0301\n\n").put("steps", JSONArray().put(JSONObject().put("op", "strip-bom")).put(JSONObject().put("op", "unicode-normalize-nfc")).put(JSONObject().put("op", "remove-final-newline")))
        assertEquals("Café\n", JSONObject(NativeDeveloperRecipe.run(unicode.toString())).getString("finalOutput"))
        val compat = JSONObject().put("input", "①").put("steps", JSONArray().put(JSONObject().put("op", "unicode-normalize-nfkc")))
        val report = JSONObject(NativeDeveloperRecipe.run(compat.toString()))
        assertEquals("1", report.getString("finalOutput"))
        assertTrue(report.getJSONArray("warnings").toString().contains("compatibility normalization"))
    }

    @Test fun recipeConfigurationRejectsDuplicateTopLevelKeys() {
        val duplicate = """{"input":"first","input":"second","steps":[{"op":"trim"}]}"""
        assertTrue(runCatching { NativeDeveloperRecipe.run(duplicate) }.exceptionOrNull()?.message.orEmpty().contains("Recipe configuration contains duplicate object keys and is ambiguous"))
    }

    @Test fun recipeLiteralReplacementPreflightsOversizedExpansion() {
        val step = JSONObject().put("op", "replace-literal").put("find", "x").put("replacement", "a".repeat(100_000))
        val recipe = JSONObject().put("input", "x".repeat(30)).put("steps", JSONArray().put(step))
        val message = runCatching { NativeDeveloperRecipe.run(recipe.toString()) }.exceptionOrNull()?.message.orEmpty()
        assertTrue(message.contains("Literal replacement would exceed 2097152 UTF-8 bytes"))
    }

    @Test fun recipeCsvRoundTripQuotesCRLFInsideField() {
        val source = "name,note\r\nAda,\"line one\r\nline two\"\r\n"
        val toJson = JSONObject(NativeDeveloperRecipe.run(JSONObject().put("input", source).put("steps", JSONArray().put(JSONObject().put("op", "csv-to-json"))).toString()))
        val toCsv = JSONObject(NativeDeveloperRecipe.run(JSONObject().put("input", toJson.getString("finalOutput")).put("steps", JSONArray().put(JSONObject().put("op", "json-to-csv"))).toString()))
        assertEquals("name,note\nAda,\"line one\r\nline two\"\n", toCsv.getString("finalOutput"))
    }

    @Test fun recipeJsonDepthAndPrettyOutputBudgetsRejectHostileInputs() {
        val tooDeep = "[".repeat(2_000) + "0" + "]".repeat(2_000)
        val depthRecipe = JSONObject().put("input", tooDeep).put("steps", JSONArray().put(JSONObject().put("op", "json-validate")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(depthRecipe.toString()) }.exceptionOrNull()?.message.orEmpty().contains("JSON nesting exceeds the safety depth of 128"))
        val amplifier = "[".repeat(80) + List(13_500) { "0" }.joinToString(",") + "]".repeat(80)
        val formatRecipe = JSONObject().put("input", amplifier).put("steps", JSONArray().put(JSONObject().put("op", "json-format")))
        assertTrue(runCatching { NativeDeveloperRecipe.run(formatRecipe.toString()) }.exceptionOrNull()?.message.orEmpty().contains("JSON formatting would exceed 2097152 UTF-8 bytes"))
    }

    @Test fun recipeFinalNewlineAndCodePointSortingAreDeterministic() {
        val add = JSONObject().put("input", "line").put("steps", JSONArray().put(JSONObject().put("op", "ensure-final-newline")))
        assertEquals("line\n", JSONObject(NativeDeveloperRecipe.run(add.toString())).getString("finalOutput"))
        val sorted = JSONObject().put("input", "z\nA\na\n🚀").put("steps", JSONArray().put(JSONObject().put("op", "sort-lines")))
        assertEquals("A\na\nz\n🚀", JSONObject(NativeDeveloperRecipe.run(sorted.toString())).getString("finalOutput"))
    }

}
