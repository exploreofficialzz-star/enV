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
        Tool(id:op,name:op,slug:op,description:"",category:category,subcategory:nil,keywords:[],tags:[],icon:"Code2",popularity:0,featured:false,clientSide:true,requiresBackend:false,requiresAuth:false,status:status,disclaimer:nil,related:[],engine:ToolEngine(type:engineType,id:op,op:op))
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

    func testAdCopyMatchesDeterministicWebTemplates() {
        let output = NativeAiEngine.localAdCopy(topic: "AI tools for creators", audience: "creators and small businesses", benefit: "Save time and get started quickly")
        XCTAssertEqual(output, "1. Stop overcomplicating AI tools for creators. Get Save time and get started quickly with a simple approach.\n\n2. AI tools for creators for creators and small businesses: practical, clear, and built around Save time and get started quickly.\n\n3. Ready to make AI tools for creators easier? Start with Save time and get started quickly and take the next step today.")
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


final class NativeProductivityCoverageTests: XCTestCase {
    private func tool(_ id: String) -> Tool {
        Tool(id: id, name: id, slug: id, description: "", category: "productivity", subcategory: nil, keywords: [], tags: [], icon: "Timer", popularity: 0, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "custom", id: id, op: id))
    }

    func testNativeCoverageUsesExactTimerIDsRatherThanTheWholeCategory() {
        for id in ["focus-timer", "pomodoro-timer", "stopwatch"] {
            XCTAssertTrue(NativeCoverage.isLocallyExecutable(tool(id)), id)
        }
        XCTAssertFalse(NativeCoverage.isLocallyExecutable(tool("focus-music")))
        XCTAssertFalse(NativeProductivityEngine.supports("focus-music"))
    }
}

final class NativeAiMicroEngineTests: XCTestCase {
    private let ids = [
        "ai-meeting-agenda-generator", "blog-outline-generator", "call-to-action-generator", "expand-helper",
        "faq-generator", "feature-benefit-generator", "meeting-action-items", "product-title-generator",
        "pros-cons-generator", "shorten-helper", "tiktok-caption-helper", "youtube-description-helper", "youtube-title-helper"
    ]

    func testSupportsExactlyTheThirteenWebOnlyIDs() {
        XCTAssertEqual(ids.filter(NativeAiMicroEngine.supports).count, 13)
        XCTAssertFalse(NativeAiMicroEngine.supports("youtube-title-generator"))
        XCTAssertFalse(NativeAiMicroEngine.supports("blog-outline-generator-extra"))
    }

    func testDefaultsAndFieldShapeMatchWeb() {
        XCTAssertEqual(NativeAiMicroEngine.initialValues("tiktok-caption-helper")["count"], "5")
        XCTAssertEqual(NativeAiMicroEngine.initialValues("youtube-title-helper")["count"], "8")
        XCTAssertEqual(NativeAiMicroEngine.initialValues("ai-meeting-agenda-generator")["topics"], "Progress\nBlockers\nDecisions\nNext steps")
        XCTAssertTrue(NativeAiMicroEngine.fields(for: "expand-helper").first?.multiline == true)
        XCTAssertTrue(NativeAiMicroEngine.fields(for: "unknown-tool").isEmpty)
    }

    func testBlogOutlineAndCTAExactTemplates() throws {
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "blog-outline-generator", values: ["topic":"Gardening", "audience":"new growers", "goal":"Build confidence"]), "Title: Gardening\nAudience: new growers\nGoal: Build confidence\n\nOutline\n1. Introduction — the problem and why it matters\n2. What Gardening means\n3. The key ideas new growers should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA")
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "call-to-action-generator", values: ["topic":"Meal prep"]), "1. Get started with Meal prep\n\n2. Try Meal prep today\n\n3. See how Meal prep can help\n\n4. Learn more about Meal prep\n\n5. Start creating with Meal prep")
    }

    func testExpandAndFAQTemplateOutputs() throws {
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "expand-helper", values: ["text":"A useful idea"]), "A useful idea.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step.")
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "faq-generator", values: ["topic":"Meal prep", "audience":"students", "points":"Storage\n, Cost, "]), "Q: Storage about Meal prep?\nA: Explain storage in a concise, factual way for students.\n\nQ: Cost about Meal prep?\nA: Explain cost in a concise, factual way for students.")
    }

    func testFeatureBenefitAndAgendaNormalizeLists() throws {
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "feature-benefit-generator", values: ["audience":"teams", "benefit":"Shared workspace,Fast search\nVersion history"]), "Feature: Shared workspace\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Fast search\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Version history\nBenefit: Helps teams get a clearer result with less friction.")
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "ai-meeting-agenda-generator", values: ["goal":"Choose a launch date", "topics":"Progress\nBlockers, Decision"]), "Meeting goal: Choose a launch date\n\nAgenda\n1. Progress\n2. Blockers\n3. Decision\n\nClose with owners, deadlines, and unresolved questions.")
    }

    func testMeetingActionsProductTitlesAndProsCons() throws {
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "meeting-action-items", values: ["notes":"Sam — draft\n\nLee — review"]), "Action items\n1. Sam — draft\n2. Lee — review\n\nBefore sharing, confirm each owner and deadline.")
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "product-title-generator", values: ["topic":"Focus app", "benefit":"Plan a calmer day"]).components(separatedBy: "\n\n").count, 5)
        XCTAssertTrue(try NativeAiMicroEngine.generate(toolID: "pros-cons-generator", values: ["topic":"Pilot a new workflow", "option":"Launch now vs wait"]).contains("What would make you stop or change direction?"))
    }

    func testShortenerAndVariantLimits() throws {
        let words = (1...29).map { "word\($0)" }
        let expected = words.prefix(28).joined(separator: " ") + "…"
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "shorten-helper", values: ["text":words.joined(separator: " ")]), expected)
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "tiktok-caption-helper", values: ["topic":"Quiet mornings", "audience":"students", "count":"2"]).components(separatedBy: "\n\n").count, 2)
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "youtube-title-helper", values: ["topic":"SQL", "count":"9999999999999999999999999999999999999999999"]).components(separatedBy: "\n\n").count, 8)
    }

    func testYouTubeDescriptionMatchesTemplateAndInvalidToolThrows() throws {
        XCTAssertEqual(try NativeAiMicroEngine.generate(toolID: "youtube-description-helper", values: ["topic":"Urban gardening", "audience":"beginners", "tone":"professional", "points":"Tools\nPlanning,Harvest"]), "Urban gardening\n\nIn this video, we break down Urban gardening for beginners in a clear and professional way.\n\nWhat you'll cover:\n• Tools\n• Planning\n• Harvest\n\nIf you found this useful, save it for later and share it with someone working on the same goal.")
        XCTAssertThrowsError(try NativeAiMicroEngine.generate(toolID: "unknown-tool", values: [:]))
    }
}
