import XCTest
@testable import enV

final class NativeTextEngineTests: XCTestCase {
    func testCatalogMappingIncludesAllFortyExactIDs() { XCTAssertEqual(NativeTextEngine.supportedToolIDs.count, 40); XCTAssertEqual(NativeTextEngine.operation(forToolID: "css-minifier-advanced"), "json-to-csv"); XCTAssertNil(NativeTextEngine.operation(forToolID: "future-tool")) }
    func testUnicodeCountersAndReversePreserveGraphemes() throws { let text="Hi 👩‍👩‍👧‍👦 世界!"; let s=NativeTextEngine.statistics(text); XCTAssertEqual(s.characters, text.unicodeScalars.count); XCTAssertEqual(NativeTextEngine.statistics("alpha, beta!!!").words, 2); XCTAssertEqual(try NativeTextEngine.run(toolID: "reverse-text", input: "A👩‍👩‍👧‍👦é").output, "é👩‍👩‍👧‍👦A") }
    func testBlankAndMalformedInputsMatchWebFallbacks() throws { XCTAssertEqual(try NativeTextEngine.run(toolID: "uppercase-converter", input: "").output, ""); XCTAssertThrowsError(try NativeTextEngine.run(toolID: "css-minifier-advanced", input: "{").output) { XCTAssertEqual(($0 as? NativeTextError)?.errorDescription, "Invalid JSON") } }
    func testConfigurableFindReplaceWrapListAndKeyword() throws { XCTAssertEqual(try NativeTextEngine.run(toolID: "find-and-replace", input: "Cat cat", options: ["find":"cat", "replace":"dog", "flags":"gi"]).output, "dog dog"); XCTAssertEqual(try NativeTextEngine.run(toolID: "wrap-text", input: "one two three", options: ["width":"8"]).output, "one two\nthree"); XCTAssertEqual(try NativeTextEngine.run(toolID: "list-generator", input: "a,b", options: ["style":"numbered"]).output, "1. a\n2. b"); XCTAssertTrue(try NativeTextEngine.run(toolID: "keyword-density-calculator", input: "Swift swift code", options: ["keyword":"swift"]).output.contains("density\t66.667%")) }
    func testConversionsFormattingAndDiff() throws { XCTAssertEqual(try NativeTextEngine.run(toolID: "css-minifier-advanced", input: "[{\"a\":1}]").output, "a\n1"); let xml = try NativeTextEngine.run(toolID: "json-to-xml", input: "{\"name\":\"Ada\"}").output; XCTAssertTrue(xml.contains("<name>") && xml.contains("Ada") && xml.contains("</name>")); let d=try NativeTextEngine.run(toolID: "text-diff", input: "same\nold", compare: "same\nnew"); XCTAssertEqual(d.added, 1); XCTAssertEqual(d.removed, 1); XCTAssertEqual(d.unchanged, 1) }
    func testJavaScriptMinifierPreservesCommentMarkersInsideStrings() throws { XCTAssertEqual(try NativeTextEngine.run(toolID: "javascript-minifier", input: "const url = 'https://a'; // trailing\n const x = 1;").output, "const url='https://a';const x=1;") }
    func testReadingSpeedOptionAndLimitsAreAccepted() throws { let r=try NativeTextEngine.run(toolID: "reading-time-calculator", input: "one two three", options: ["wpm":"60"]); XCTAssertEqual(r.statistics?.readingMinutes, 1); XCTAssertTrue(try NativeTextEngine.run(toolID: "word-counter", input: "a b", options: ["limit":"10"]).output.contains("Words: 2")) }
}


final class NativeDeveloperToolTests: XCTestCase {
    private func tool(_ op:String, category:String="developer", engineType:String?="developer", status:String="active") -> Tool {
        Tool(id:op,name:op,slug:op,description:"",category:category,keywords:[],tags:[],icon:"Code2",popularity:0,featured:false,clientSide:true,requiresBackend:false,requiresAuth:false,status:status,related:[],engine:ToolEngine(type:engineType,id:op,op:op))
    }

    func testExactNativeDeveloperOperationsPreferLocalExecutionAndKeepFallback() {
        let operations=["cron-generator","cron-parser","data-uri-generator","http-status-lookup","json-beautifier","json-formatter","json-minifier","json-validator","jwt-decoder","jwt-expiration-checker","markdown-preview","markdown-to-html","query-string-parser","regex-replace","regex-tester","url-parser","user-agent-parser","uuid-generator","uuid-validator"]
        for op in operations {
            let candidate=tool(op)
            XCTAssertTrue(NativeUtilityEngine.supports(candidate),op)
            XCTAssertFalse(NativeBackendEngine.supports(candidate),op)
            XCTAssertTrue(NativeCoverage.isLocallyExecutable(candidate),op)
        }
        XCTAssertTrue(NativeBackendEngine.supports(tool("not-yet-native")))
        XCTAssertFalse(NativeBackendEngine.supports(tool("unrelated",category:"misc",engineType:"custom")))
    }

    func testDeveloperFormOnlyShowsConditionalFieldsWhenTheWebDoes() {
        XCTAssertFalse(NativeDeveloperToolFormPolicy.needsSecondInput("json-formatter"))
        XCTAssertTrue(NativeDeveloperToolFormPolicy.needsSecondInput("regex-tester"))
        XCTAssertTrue(NativeDeveloperToolFormPolicy.needsRegexFlags("regex-tester"))
        XCTAssertFalse(NativeDeveloperToolFormPolicy.needsRegexFlags("json-formatter"))
    }

    func testJSONToolsAcceptObjectsArraysAndTopLevelScalarValues() throws {
        let formatter=tool("json-formatter")
        let object=try NativeUtilityEngine.run(formatter,input:"{\"name\":\"enV\",\"count\":3}").text
        XCTAssertTrue(object.hasPrefix("{\n")); XCTAssertTrue(object.contains("\"name\"")); XCTAssertTrue(object.contains("\"count\""))
        XCTAssertTrue(try NativeUtilityEngine.run(formatter,input:"[1,2]").text.hasPrefix("[\n"))
        XCTAssertEqual(try NativeUtilityEngine.run(formatter,input:"\"enV\"").text,"\"enV\"")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("json-minifier"),input:" [1, true, null] ").text,"[1,true,null]")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("json-validator"),input:"[1,true]").text,"Valid JSON (RFC 8259-compatible parser).")
    }

    func testRegexFlagsAndBothWebRegexOperationsReturnTheMatchReport() throws {
        let options="{\"secondary\":\"Cat cat\",\"flags\":\"gi\"}"
        let expected="Pattern: /cat/\nMatches: 2\n\n1. Cat at index 0\n2. cat at index 4"
        XCTAssertEqual(try NativeUtilityEngine.run(tool("regex-tester"),input:"cat",optionsJSON:options).text,expected)
        XCTAssertEqual(try NativeUtilityEngine.run(tool("regex-replace"),input:"cat",optionsJSON:options).text,expected)
    }

    func testURLParserReturnsBrowserJSONContractAndLastDuplicateQueryValue() throws {
        let output=try NativeUtilityEngine.run(tool("url-parser"),input:"https://example.com:8080/path?q=1&q=2#top").text
        let json=try XCTUnwrap(JSONSerialization.jsonObject(with:Data(output.utf8)) as? [String:Any])
        XCTAssertEqual(json["href"] as? String,"https://example.com:8080/path?q=1&q=2#top")
        XCTAssertEqual(json["protocol"] as? String,"https:"); XCTAssertEqual(json["hostname"] as? String,"example.com")
        XCTAssertEqual(json["port"] as? String,"8080"); XCTAssertEqual(json["pathname"] as? String,"/path")
        XCTAssertEqual(json["search"] as? String,"?q=1&q=2"); XCTAssertEqual(json["hash"] as? String,"#top")
        XCTAssertEqual(json["origin"] as? String,"https://example.com:8080")
        XCTAssertEqual((json["params"] as? [String:String])?["q"],"2")
    }

    func testDeveloperValidatorsStatusAndWebFallbacks() throws {
        // Match the live web regex exactly: it rejects a standard 36-character UUID and accepts this 38-character shape.
        XCTAssertEqual(try NativeUtilityEngine.run(tool("uuid-validator"),input:"550e8400-e29b-41d4-a716-446655440000").text,"Invalid UUID")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("uuid-validator"),input:"550e8400-e29b-48d4a-a7164-446655440000").text,"Valid UUID v4")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("uuid-validator"),input:"not-a-uuid").text,"Invalid UUID")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("http-status-lookup"),input:"404").text,"404 Not Found")
        XCTAssertTrue(try NativeUtilityEngine.run(tool("http-status-lookup"),input:"418").text.contains("504 Gateway Timeout"))
        XCTAssertEqual(try NativeUtilityEngine.run(tool("query-string-parser"),input:"a=1&b=2").text,"a=1&b=2")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("user-agent-parser"),input:"Mozilla/5.0").text,"Mozilla/5.0")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("cron-parser"),input:"").text,"Cron: \nFive-field format: minute hour day-of-month month day-of-week")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("markdown-preview"),input:"<div><p>Hello</p></div>").text,"<div>\n  <p>\n    Hello\n  </p>\n</div>")
    }
}
