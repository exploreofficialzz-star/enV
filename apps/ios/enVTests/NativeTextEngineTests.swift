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

    func testAllDeveloperOperationsPreferLocalExecutionOverCategoryBackend() {
        let operations=["cron-generator","data-uri-generator","http-status-lookup","json-formatter","regex-tester","url-parser","uuid-validator","ascii-encoder","csv-formatter","mime-validator","xml-validator","file-hash-calculator","future-developer-operation"]
        for op in operations {
            let candidate=tool(op)
            XCTAssertTrue(NativeUtilityEngine.supports(candidate),op)
            XCTAssertFalse(NativeBackendEngine.supports(candidate),op)
            XCTAssertTrue(NativeCoverage.isLocallyExecutable(candidate),op)
        }
        XCTAssertFalse(NativeBackendEngine.supports(tool("unrelated",category:"misc",engineType:"custom")))
    }

    func testDeveloperFormOnlyShowsConditionalFieldsWhenTheWebDoes() {
        XCTAssertFalse(NativeDeveloperToolFormPolicy.needsSecondInput("json-formatter"))
        XCTAssertTrue(NativeDeveloperToolFormPolicy.needsSecondInput("regex-tester"))
        XCTAssertTrue(NativeDeveloperToolFormPolicy.needsRegexFlags("regex-tester"))
        XCTAssertFalse(NativeDeveloperToolFormPolicy.needsRegexFlags("json-formatter"))
    }

    func testImplementedDatetimeAndBarcodeRecordsBypassGenericBackend() throws {
        XCTAssertFalse(NativeBackendEngine.supports(tool("unix-timestamp-converter", category: "developer", engineType: "datetime")))
        XCTAssertFalse(NativeBackendEngine.supports(tool("gtin-validator", category: "qr", engineType: "barcode")))
        XCTAssertTrue(try NativeBarcodeEngine.run(toolID: "gtin-validator", input: "4006381333931").hasPrefix("Valid: Expected check digit: 1. Supplied: 1."))
        XCTAssertTrue(try NativeBarcodeEngine.run(toolID: "gtin-validator", input: "4006381333930").hasPrefix("Invalid: Expected check digit: 1. Supplied: 0."))
    }

    func testCaptionGeneratorMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localCaption(topic: "AI tools for creators", audience: "creators and small businesses", count: "5")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 5)
        XCTAssertTrue(output.contains("AI tools for creators made simple. Save this for later."))
        XCTAssertTrue(output.contains("A quick reminder for creators and small businesses: you don't need to overcomplicate AI tools for creators."))
    }

    func testPromptGeneratorMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localPrompt(task: "Create a launch plan for a digital product", audience: "creators and small businesses", tone: "natural")
        XCTAssertTrue(output.hasPrefix("ROLE\nYou are a helpful specialist supporting creators and small businesses."))
        XCTAssertTrue(output.contains("TASK\nCreate a launch plan for a digital product."))
        XCTAssertTrue(output.contains("STYLE\nUse a natural and conversational style."))
    }

    func testBioGeneratorMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localBio(role: "AI music creator", audience: "creators and small businesses", count: "5")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 5)
        XCTAssertTrue(output.contains("AI music creator | Helping creators and small businesses learn, create & grow."))
        XCTAssertTrue(output.contains("AI music creator focused on practical ideas for creators and small businesses."))
    }

    func testTitleGeneratorMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localTitle(topic: "AI tools for creators", audience: "creators and small businesses", count: "8")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 8)
        XCTAssertTrue(output.contains("AI tools for creators: What creators and small businesses Should Know"))
        XCTAssertTrue(output.contains("A Practical AI tools for creators Guide for creators and small businesses"))
    }

    func testProductDescriptionMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localProduct(product: "AI Music Generator Class", features: "Beginner friendly\nWorks from a smartphone\nUses accessible tools", audience: "creators and small businesses", tone: "natural")
        XCTAssertTrue(output.hasPrefix("AI Music Generator Class\n\nA practical option for creators and small businesses who want a simple way to get started."))
        XCTAssertTrue(output.contains("• Beginner friendly\n• Works from a smartphone\n• Uses accessible tools"))
        XCTAssertTrue(output.contains("CTA: Get started and see what AI Music Generator Class can help you create."))
    }

    func testIdeaGeneratorMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localIdea(topic: "AI tools for creators", audience: "creators and small businesses")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 8)
        XCTAssertTrue(output.contains("How-to: AI tools for creators for creators and small businesses"))
        XCTAssertTrue(output.contains("Behind the scenes: working on AI tools for creators"))
    }

    func testResumeBulletGeneratorMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localResume(duty: "Managed social media content and improved engagement", result: "increased engagement")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 4)
        XCTAssertTrue(output.contains("Managed social media content and improved engagement, contributing to increased engagement."))
        XCTAssertTrue(output.contains("Owned Managed social media content and improved engagement with a focus on increased engagement."))
    }

    func testRewriteHelperMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localRewrite(text: "We are launching a new product that helps people create useful content faster.", tone: "natural")
        XCTAssertEqual(output, "Rewritten in a natural and conversational tone:\n\nWe are launching a new product that helps people create useful content faster.\n\nEdit for clarity, natural flow, and consistent tone before publishing.")
    }

    func testEmailDraftMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localEmail(purpose: "Introduce a new digital product", points: "What it does\nWho it is for\nHow to get started")
        XCTAssertTrue(output.hasPrefix("Subject: Introduce a new digital product\n\nHi,"))
        XCTAssertTrue(output.contains("• What it does\n• Who it is for\n• How to get started"))
    }

    func testMetaDescriptionMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localMeta(topic: "AI tools for creators", page: "Explain the product, key benefits, and how visitors can get started.")
        XCTAssertEqual(output, "AI tools for creators — Explain the product, key benefits, and how visitors can get started. Start here for a concise overview and useful guidance.")
    }

    func testSocialHookMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localHook(topic: "AI tools for creators", audience: "creators and small businesses")
        XCTAssertEqual(output.components(separatedBy: "\n\n").count, 5)
        XCTAssertTrue(output.contains("Most people overcomplicate AI tools for creators."))
        XCTAssertTrue(output.contains("The simple way to approach AI tools for creators."))
    }

    func testContentBriefMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localContentBrief(topic: "AI tools for creators", audience: "creators and small businesses", goal: "Educate and give the reader a practical next step", tone: "natural")
        XCTAssertEqual(output, "Content brief\nTopic: AI tools for creators\nAudience: creators and small businesses\nGoal: Educate and give the reader a practical next step\nTone: natural and conversational\n\nCore question: What does the reader need to know or do?\nPrimary sections: problem → context → solution → examples → next step\nCTA: Give the reader one clear action to take.")
    }

    func testPromptImproverMatchesDeterministicWebTemplate() {
        let output = NativeAiEngine.localImprover(task: "Write a good social media post about my product.", audience: "creators and small businesses", tone: "natural")
        XCTAssertTrue(output.hasPrefix("Improved prompt:\n\nRewrite the following request into a precise, natural and conversational instruction"))
        XCTAssertTrue(output.contains("Original request:\nWrite a good social media post about my product."))
        XCTAssertTrue(output.contains("6. Quality checks"))
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

    func testBrowserVerifiedEncodingCsvMimeMarkupAndFallbacks() throws {
        XCTAssertEqual(try NativeUtilityEngine.run(tool("ascii-encoder"),input:"Hi").text,"4869")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("csv-formatter"),input:"name,age\nAda,36\nGrace,40").text,"name,age\nAda,36\nGrace,40")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("mime-validator"),input:"pdf").text,"application/pdf")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("xml-validator"),input:"<root><child>ok</child></root>").text,"Valid markup/XML.")
        XCTAssertEqual(try NativeUtilityEngine.run(tool("developer-api-mock-response-generator"),input:"  template  ").text,"template")
        XCTAssertThrowsError(try NativeUtilityEngine.run(tool("data-uri-generator"),input:"hello"))
        XCTAssertThrowsError(try NativeUtilityEngine.run(tool("file-hash-calculator"),input:"hello"))
        XCTAssertEqual(try NativeUtilityEngine.run(tool("http-status-lookup"),input:"422").text,"422 Unprocessable Content")
    }
}
