import XCTest
@testable import enV

final class CatalogCoreTests: XCTestCase {
    private let catalog = Catalog(schemaVersion: 1, catalogVersion: "test", counts: CatalogCounts(total: 3, active: 2, planned: 1, categories: 1), categories: [ToolCategory(id: "text", name: "Text", description: "Text tools", blurb: "Text", icon: "Type")], tools: [
        Tool(id: "word-count", name: "Word Count", slug: "word-count", description: "Count words and characters", category: "text", subcategory: nil, keywords: ["count", "words"], tags: ["writing"], icon: "Type", popularity: 70, featured: true, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "text", id: "word-count", op: nil)),
        Tool(id: "case-converter", name: "Case Converter", slug: "case-converter", description: "Convert text case", category: "text", subcategory: nil, keywords: ["uppercase"], tags: ["text"], icon: "Type", popularity: 90, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "text", id: "case-converter", op: nil)),
        Tool(id: "future-tool", name: "Future Tool", slug: "future-tool", description: "Planned tool", category: "text", subcategory: nil, keywords: ["future"], tags: [], icon: "Wand2", popularity: 100, featured: false, clientSide: false, requiresBackend: true, requiresAuth: false, status: "planned", disclaimer: nil, related: [], engine: ToolEngine(type: "custom", id: "future-tool", op: nil))
    ], relatedReferenceTools: nil)

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: "env.favoriteToolIDs")
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: "env.favoriteToolIDs")
        super.tearDown()
    }

    func testSearchIncludesDescriptionKeywordsAndTags() {
        let store = CatalogStore(catalog: catalog)
        XCTAssertEqual(store.tools(matching: "characters").first?.id, "word-count")
        XCTAssertEqual(store.tools(matching: "uppercase").first?.id, "case-converter")
        XCTAssertEqual(store.tools(matching: "writing").first?.id, "word-count")
        XCTAssertEqual(store.tools(matching: "case-converter").first?.id, "case-converter")
    }

    func testWebSearchUsesExactAndSynonymRankedMatches() {
        XCTAssertEqual(catalog.webSearch("case-converter").first?.id, "case-converter")
        XCTAssertEqual(catalog.webSearch("words").first?.id, "word-count")
        XCTAssertEqual(catalog.webSearch("").map(\.id), ["future-tool", "case-converter", "word-count"])
    }

    func testRelatedToolsExcludePlannedAndFillFromCategoryAlphabetically() {
        let current = Tool(id: "current", name: "Current", slug: "current", description: "", category: "text", subcategory: nil, keywords: [], tags: [], icon: "Type", popularity: 0, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: ["word-count", "future-tool"], engine: ToolEngine(type: "text", id: "current", op: nil))
        let testCatalog = Catalog(schemaVersion: 1, catalogVersion: "test", counts: catalog.counts, categories: catalog.categories, tools: catalog.tools + [current], relatedReferenceTools: nil)

        XCTAssertEqual(testCatalog.relatedTools(for: current).map(\.id), ["word-count", "case-converter"])
    }

    func testToolEnginePreservesUnknownConfigurationValues() throws {
        let data = Data(#"{"type":"calculator","formula":"body-mass-index","precision":2,"options":["metric"]}"#.utf8)
        let engine = try JSONDecoder().decode(ToolEngine.self, from: data)
        XCTAssertEqual(engine.type, "calculator")
        XCTAssertEqual(engine.configuration["formula"], .string("body-mass-index"))
        XCTAssertEqual(engine.configuration["precision"], .number(2))
        XCTAssertEqual(engine.configuration["options"], .array([.string("metric")]))
    }

    func testNativeDisclaimerTextMatchesCanonicalWebCopy() {
        let tool = Tool(id: "health", name: "Health", slug: "health", description: "", category: "fitness", subcategory: nil, keywords: [], tags: [], icon: "Heart", popularity: 0, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: "health", related: [], engine: ToolEngine(type: "calculator", id: "health", op: nil))
        XCTAssertEqual(tool.nativeDisclaimerText, "Estimates only — not medical advice.")
    }

    func testCategoryFilterAndPopularityOrdering() {
        let store = CatalogStore(catalog: catalog)
        XCTAssertEqual(store.tools(category: "text").map(\.id), ["future-tool", "case-converter", "word-count"])
        XCTAssertTrue(store.tools(category: "missing").isEmpty)
    }

    func testFavoritesTogglePersistsInStore() {
        let store = CatalogStore(catalog: catalog)
        let tool = catalog.tools[0]
        store.toggleFavorite(tool)
        XCTAssertTrue(store.isFavorite(tool))
        XCTAssertTrue(CatalogStore(catalog: catalog).isFavorite(tool))
        store.toggleFavorite(tool)
        XCTAssertFalse(store.isFavorite(tool))
    }

    func testNativeCopyRewritesWebsiteLanguageAndDropsWebRuntimeTools() throws {
        XCTAssertEqual(NativeCopy.text("Encode text to Base64 locally in your browser."), "Encode text to Base64 locally on this device.")
        XCTAssertEqual(NativeCopy.text("Requires a headless browser on a server."), "Requires a headless browser on a server.")
        XCTAssertEqual(NativeCopy.text("Place a screenshot inside a Chrome Browser frame. Processed locally."), "Place a screenshot inside a Chrome Browser frame. Processed locally.")
        XCTAssertEqual(NativeCopy.text("Parse a user-agent string into browser, OS, and device hints."), "Parse a user-agent string into browser, OS, and device hints.")
        let json = Data("""
        {"schemaVersion":1,"catalogVersion":"test","counts":{"total":2,"active":2,"planned":0,"categories":1},"categories":[{"id":"network","name":"Network","description":"All in the browser","blurb":"in-browser checks","icon":"Globe"}],"tools":[{"id":"json-formatter","name":"JSON Formatter","slug":"json-formatter","description":"Pretty-print JSON entirely in your browser.","category":"network","keywords":[],"tags":[],"icon":"Code2","popularity":1,"featured":false,"clientSide":true,"requiresBackend":false,"requiresAuth":false,"status":"active","related":[],"engine":{"type":"developer","id":"json-formatter"}},{"id":"connection-info","name":"Browser Connection Info","slug":"connection-info","description":"Show browser-exposed online status.","category":"network","keywords":["browser"],"tags":[],"icon":"Globe","popularity":1,"featured":false,"clientSide":true,"requiresBackend":false,"requiresAuth":false,"status":"active","related":[],"engine":{"type":"network","id":"connection-info"}}]}
        """.utf8)
        let catalog = try JSONDecoder().decode(Catalog.self, from: json).nativeFacing()
        XCTAssertEqual(catalog.tools.map(\.id), ["json-formatter"])
        XCTAssertEqual(catalog.tools.first?.description, "Pretty-print JSON entirely on this device.")
        XCTAssertEqual(catalog.categories.first?.description, "All on this device")
        XCTAssertEqual(catalog.categories.first?.blurb, "on-device checks")
        XCTAssertTrue(NativeCopy.isWebRuntimeOnly("webcodecs-audio-checker"))
    }
}
