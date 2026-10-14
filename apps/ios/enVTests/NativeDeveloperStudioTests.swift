import XCTest
@testable import enV

final class NativeDeveloperStudioTests: XCTestCase {
    private func tool(_ id: String) -> Tool {
        Tool(id: id, name: id, slug: id, description: "", category: "developer", subcategory: nil,
             keywords: [], tags: [], icon: "Code", popularity: 0, featured: false, clientSide: true,
             requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [],
             engine: ToolEngine(type: "developer", id: id, op: id))
    }

    private func run(_ id: String, _ input: String, secondary: String = "") throws -> String {
        let options = try XCTUnwrap(String(data: JSONSerialization.data(withJSONObject: ["secondary": secondary]), encoding: .utf8))
        return try NativeUtilityEngine.run(tool(id), input: input, optionsJSON: options).text
    }

    func testCronEncodeDecodeAndExplainStayLocal() throws {
        XCTAssertEqual(try run("cron-encoder", "*/15 * * * *"), "Ki8xNSAqICogKiAq")
        let decoded = try run("cron-decoder", "Ki8xNSAqICogKiAq")
        XCTAssertTrue(decoded.hasPrefix("*/15 * * * *"))
        XCTAssertTrue(decoded.contains("nextRuns"))
        XCTAssertTrue(decoded.contains("utc"))
    }

    func testJsonDecoderAndBase64InspectorPerformEncodingWork() throws {
        XCTAssertEqual(try run("json-decoder", "eyJuYW1lIjoiQWRhIiwiaXRlbXMiOlsxLDJdfQ=="), "{\"name\":\"Ada\",\"items\":[1,2]}")
        let result = try JSONSerialization.jsonObject(with: Data(try run("base64-inspector", "SGk=").utf8)) as? [String: Any]
        XCTAssertEqual(result?["valid"] as? Bool, true)
        XCTAssertEqual(result?["preview"] as? String, "Hi")
    }

    func testJsonSchemaGeneratorInfersPropertiesAndNumericTypes() throws {
        let schema = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(try run("developer-json-schema-generator", "{\"name\":\"Ada\",\"count\":2,\"ratio\":1.5}").utf8)) as? [String: Any])
        XCTAssertEqual(schema["$schema"] as? String, "https://json-schema.org/draft/2020-12/schema")
        let properties = try XCTUnwrap(schema["properties"] as? [String: Any])
        XCTAssertEqual((properties["name"] as? [String: Any])?["type"] as? String, "string")
        XCTAssertEqual((properties["count"] as? [String: Any])?["type"] as? String, "integer")
        XCTAssertEqual((properties["ratio"] as? [String: Any])?["type"] as? String, "number")
    }

    func testMarkupEncodingAndSqlCssFormattingAreDomainSpecific() throws {
        XCTAssertEqual(try run("html-decoder", "&lt;root&gt;Hi&lt;/root&gt;"), "<root>Hi</root>")
        XCTAssertTrue(try run("sql-formatter", "SELECT id,name FROM users WHERE active=true;").contains("FROM users"))
        XCTAssertTrue(try run("css-formatter", ".card{color:red;padding:4px}").contains("color:red;"))
        XCTAssertTrue(try run("markdown-to-html", "# Hello\n\nA **bold** note").contains("<h1>Hello</h1>"))
    }

    func testHttpStudioParsesRepeatedQueryValuesAndBuildsSafeHeaders() throws {
        let parsed = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(try run("query-string-parser", "q=one&q=two&space=hello+world").utf8)) as? [String: Any])
        XCTAssertEqual(parsed["count"] as? Int, 3)
        let grouped = try XCTUnwrap(parsed["grouped"] as? [String: [String]])
        XCTAssertEqual(grouped["space"]?.first, "hello world")
        XCTAssertEqual(try run("query-string-builder", "{\"q\":\"hello world\",\"tag\":[\"a\",\"b\"]}"), "q=hello+world&tag=a&tag=b")
        XCTAssertTrue(try run("http-header-builder", "{\"Accept\":\"application/json\",\"X-Example\":\"enV\"}").contains("Accept: application/json"))
        XCTAssertTrue(try run("user-agent-parser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36").contains("Windows"))
    }

    func testUuidInspectionSupportsNilAndWebhookOutputIsValidJson() throws {
        XCTAssertTrue(try run("uuid-validator", "00000000-0000-0000-0000-000000000000").hasPrefix("Valid Nil UUID"))
        let payload = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(try run("webhook-payload-generator", "order.paid").utf8)) as? [String: Any])
        XCTAssertEqual(payload["type"] as? String, "order.paid")
        XCTAssertEqual((payload["meta"] as? [String: Any])?["generatedLocally"] as? Bool, true)
    }

    func testJsonFormatterWarningsAndHttpStatusMeaningsAreVisible() throws {
        let raw = #"{"id":9007199254740993,"dup":1,"dup":2}"#
        let formatted = try run("json-formatter", raw)
        XCTAssertTrue(formatted.contains("JavaScript Number cannot safely represent this integer"))
        XCTAssertTrue(formatted.contains("9007199254740993"))
        XCTAssertTrue(formatted.contains("Duplicate object keys"))
        XCTAssertTrue(try run("http-status-lookup", "418").lowercased().contains("teapot"))
        XCTAssertTrue(try run("http-status-lookup", "422").contains("could not be processed"))
        XCTAssertTrue(try run("http-status-lookup", "429").contains("Too many requests"))
        XCTAssertTrue(try run("http-status-lookup", "503").contains("temporarily unable"))
        XCTAssertTrue(try run("http-status-reference", "").contains("207: Multi-Status"))
        XCTAssertTrue(try run("http-status-reference", "").contains("418: I'm a teapot"))
        XCTAssertTrue(try run("http-status-reference", "").contains("503: Service Unavailable"))
        XCTAssertTrue(try run("http-status-reference", "").contains("104: Upload Resumption Supported"))
        XCTAssertTrue(try run("http-status-reference", "").contains("305: Use Proxy"))
        XCTAssertTrue(try run("http-status-reference", "").contains("306: (Unused)"))
        XCTAssertTrue(try run("http-status-lookup", "418").lowercased().contains("historical/application-specific"))
        XCTAssertTrue(try run("http-status-lookup", "104").contains("temporary IANA registration"))
    }

    func testHashDecoderDoesNotPretendHashesCanBeReversed() {
        XCTAssertThrowsError(try run("hash-decoder", "aabbcc")) { error in
            XCTAssertTrue(error.localizedDescription.lowercased().contains("one-way"))
        }
    }
    func testRegexBatchRunsSamplesIndependentlyAndReportsSkippedRiskyInput() throws {
        let batchRaw = try run("regex-tester", #"\d+"#, secondary: #"["one 12","no digits","34 and 56"]"#)
        let batch = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(batchRaw.utf8)) as? [String: Any])
        XCTAssertEqual(batch["mode"] as? String, "test")
        XCTAssertEqual(batch["sampleCount"] as? Int, 3)
        XCTAssertEqual(batch["matchCount"] as? Int, 3)
        let riskySamples = try XCTUnwrap(String(data: JSONSerialization.data(withJSONObject: [String(repeating: "a", count: 40) + "!", "safe"]), encoding: .utf8))
        let riskyRaw = try run("regex-tester", #"(a+)+$"#, secondary: riskySamples)
        let risk = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(riskyRaw.utf8)) as? [String: Any])
        let results = try XCTUnwrap(risk["results"] as? [[String: Any]])
        XCTAssertEqual(results.first?["executionSkipped"] as? Bool, true)
    }

    func testSharedGoldenRegexSubstitutionPipelineReturnsLayerInspection() throws {
        let raw = try NativeRegexStudio.run(pattern:"<[^>]+>", rawSamples:DeveloperStudioGoldenFixtures.regexPipelineJSON,
                                            flags:"g", replacement:"", mode:"pipeline")
        let report = try XCTUnwrap(JSONSerialization.jsonObject(with:Data(raw.utf8)) as? [String:Any])
        XCTAssertEqual(report["mode"] as? String,"pipeline")
        XCTAssertEqual(report["blocked"] as? Bool,false)
        XCTAssertTrue((report["finalOutputPreview"] as? String ?? "").contains("Hello, world! 42"))
        XCTAssertEqual((report["layers"] as? [[String:Any]])?.count,2)
    }

    func testSchemaGeneratorMergesHeterogeneousArrayRecords() throws {
        let raw = try run("developer-json-schema-generator", #"[{"id":1,"name":"Ada"},{"id":2,"active":true},{"id":3.5,"name":null}]"#)
        let schema = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let items = try XCTUnwrap(schema["items"] as? [String: Any])
        XCTAssertEqual(items["type"] as? String, "object")
        XCTAssertEqual(items["required"] as? [String], ["id"])
        let properties = try XCTUnwrap(items["properties"] as? [String: Any])
        XCTAssertEqual((properties["id"] as? [String: Any])?["type"] as? String, "number")
        XCTAssertEqual((properties["name"] as? [String: Any])?["type"] as? [String], ["null", "string"])
    }

    func testJsonDiffIgnoresKeyOrderAndReturnsStructuralPaths() throws {
        let sameRaw = try run("json-diff", #"{"a":1,"b":{"x":2}}"#, secondary: #"{"b":{"x":2},"a":1}"#)
        let same = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(sameRaw.utf8)) as? [String: Any])
        XCTAssertEqual(same["equal"] as? Bool, true)
        let changedRaw = try run("json-diff", #"{"items":[{"id":1}]}"#, secondary: #"{"items":[{"id":2},{"id":3}]}"#)
        let changed = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(changedRaw.utf8)) as? [String: Any])
        XCTAssertEqual(changed["equal"] as? Bool, false)
        let changes = try XCTUnwrap(changed["changes"] as? [[String: Any]])
        XCTAssertTrue(changes.contains { ($0["path"] as? String) == "$[\"items\"][0][\"id\"]" })
    }

    func testCronWildcardStepsAreDocumentedAndJsonInspectorScansNumbersOutsideStrings() throws {
        let cronRaw = try run("cron-parser", "0 0 */2 * MON")
        let cron = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(cronRaw.utf8)) as? [String: Any])
        XCTAssertTrue((cron["explanation"] as? String ?? "").contains("Vixie-style semantics"))
        XCTAssertFalse((cron["nextRuns"] as? [[String: Any]] ?? []).isEmpty)
        let reportRaw = try run("json-inspector", #"{"id":9007199254740993,"memo":"9007199254740993","items":[1,{"flag":true}],"name":"a","name":"b"}"#)
        let report = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(reportRaw.utf8)) as? [String: Any])
        XCTAssertEqual(report["rootType"] as? String, "object")
        XCTAssertGreaterThanOrEqual(report["nodeCount"] as? Int ?? 0, 6)
        let tokens = report["unsafeIntegerTokens"] as? [[String: Any]] ?? []
        XCTAssertEqual(tokens.count, 1)
        XCTAssertEqual(tokens.first?["token"] as? String, "9007199254740993")
        XCTAssertTrue((report["duplicateKeys"] as? [String] ?? []).contains("$[\"name\"]"))
    }

    func testJWTDecoderReturnsExplicitDecodeOnlyWarningAndSafeClaimStates() throws {
        let token = "eyJhbGciOiJub25lIn0.eyJleHAiOjFlKzEwMCwiaWF0Ijo5OTk5OTk5OTk5fQ."
        let raw = try run("jwt-decoder", token)
        let report = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertEqual(report["signatureVerified"] as? Bool, false)
        XCTAssertTrue((report["warning"] as? String ?? "").contains("DECODE ONLY"))
        let claims = try XCTUnwrap(report["claims"] as? [String: Any])
        XCTAssertEqual((claims["exp"] as? [String: Any])?["status"] as? String, "out-of-range")
        XCTAssertEqual((claims["iat"] as? [String: Any])?["status"] as? String, "issued-in-the-future")
    }


    func testLosslessJSONFormatterPreservesUnsafeIntegerTokensAndDuplicateKeys() throws {
        let raw = #"{"z":9007199254740993,"nested":{"id":9223372036854775807},"dup":1,"dup":2,"memo":"9007199254740993"}"#
        let formatted = try run("json-formatter", raw)
        XCTAssertTrue(formatted.contains("JavaScript Number cannot safely represent this integer"))
        XCTAssertTrue(formatted.contains("9007199254740993"))
        XCTAssertTrue(formatted.contains("9223372036854775807"))
        XCTAssertTrue(formatted.contains("Duplicate object keys"))
        let minified = try run("json-minifier", raw)
        XCTAssertTrue(minified.contains("9007199254740993"))
        XCTAssertTrue(minified.contains("9223372036854775807"))
    }

    func testJWTDecoderExposesExactRawHeaderAndPayloadWithPrecisionWarning() throws {
        let token = "eyJhbGciOiJub25lIiwiaWQiOjkwMDcxOTkyNTQ3NDA5OTN9.eyJzdWIiOiJKYW5lIERvZSIsImlkIjo5MDA3MTk5MjU0NzQwOTkzfQ."
        let raw = try run("jwt-decoder", token)
        let report = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertEqual(report["signatureVerified"] as? Bool, false)
        XCTAssertTrue((report["headerRawJson"] as? String ?? "").contains("9007199254740993"))
        XCTAssertTrue((report["payloadRawJson"] as? String ?? "").contains("9007199254740993"))
        XCTAssertTrue((report["largeIntegerPrecisionWarning"] as? String ?? "").contains("original digits"))
    }


    func testCORSAndCSPGeneratorsValidateSecuritySensitiveConfiguration() throws {
        let corsConfig = #"{"origins":["https://app.example.com","https://admin.example.com"],"methods":["GET","POST"],"headers":["Content-Type","Authorization"],"credentials":true,"maxAge":300}"#
        let cors = try run("developer-cors-generator", corsConfig)
        XCTAssertTrue(cors.contains("https://app.example.com"))
        XCTAssertTrue(cors.contains("https://admin.example.com"))
        XCTAssertTrue(cors.contains("not drop-in middleware"))
        let unsafeCors = #"{"origins":["*"],"credentials":true}"#
        XCTAssertThrowsError(try run("developer-cors-generator", unsafeCors))
        let csp = try run("developer-csp-generator", #"{"default-src":["'self'"],"script-src":["'self'","'unsafe-inline'"]}"#)
        XCTAssertTrue(csp.contains("script-src 'self' 'unsafe-inline'"))
        XCTAssertTrue(csp.contains("Review broad/unsafe sources"))
    }

    func testStrictCodecAndHashComparisonSemanticsMatchWebContract() throws {
        XCTAssertEqual(try run("url-decoder", "a+b%2Bc"), "a+b+c")
        XCTAssertEqual(try run("base64-decoder", "TQ"), "M")
        for bad in ["/w==", "Zh==", "TQ="] {
            XCTAssertThrowsError(try run("base64-decoder", bad), "Expected strict Base64 rejection for \(bad)")
        }
        let hexRaw = try run("hash-compare", "5D41402ABC4B2A76B9719D911017C592", secondary: "5d41402abc4b2a76b9719d911017c592")
        let hex = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(hexRaw.utf8)) as? [String: Any])
        XCTAssertEqual(hex["equal"] as? Bool, true)
        XCTAssertEqual(hex["comparison"] as? String, "hex-digest-case-insensitive")
        let base64Raw = try run("hash-compare", "AbCd+/==", secondary: "abcd+/==")
        let base64 = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(base64Raw.utf8)) as? [String: Any])
        XCTAssertEqual(base64["equal"] as? Bool, false)
        XCTAssertEqual(base64["comparison"] as? String, "exact-string")
    }

    func testSecureTokenGeneratorUsesBoundedUrlSafeOutput() throws {
        let secureTool = Tool(id: "secure-token", name: "secure-token", slug: "secure-token", description: "", category: "utilities", subcategory: nil,
                              keywords: [], tags: [], icon: "Code", popularity: 0, featured: false, clientSide: true,
                              requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [],
                              engine: ToolEngine(type: "generator", id: "secure-token", op: "secure-token"))
        let output = try NativeUtilityEngine.run(secureTool, optionsJSON: "{\"length\":64}").text
        XCTAssertEqual(output.count, 64)
        XCTAssertTrue(output.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") })
        XCTAssertThrowsError(try NativeUtilityEngine.run(secureTool, optionsJSON: "{\"length\":0}"))
        XCTAssertThrowsError(try NativeUtilityEngine.run(secureTool, optionsJSON: "{\"length\":5000}"))
        XCTAssertThrowsError(try NativeUtilityEngine.run(secureTool, optionsJSON: "{\"length\":1.5}"))
        XCTAssertThrowsError(try NativeUtilityEngine.run(secureTool, optionsJSON: "{\"length\":\"oops\"}"))
    }
}
