import XCTest
@testable import enV

final class CatalogCoreTests: XCTestCase {
    func testMusicDownloaderIsAvailableInTheNativeCatalogExtension() {
        let extended = catalog.includingMusicDownloader()
        XCTAssertEqual(extended.tools.filter { $0.id == "music-downloader" }.count, 1)
        XCTAssertEqual(extended.counts.total, catalog.counts.total + 1)
        XCTAssertEqual(extended.counts.active, catalog.counts.active + 1)
        let tool = extended.tools.first { $0.id == "music-downloader" }
        XCTAssertEqual(tool?.category, "audio")
        XCTAssertEqual(tool?.engine.id, "music-downloader")
        XCTAssertEqual(tool?.engine.type, "audio")
        XCTAssertEqual(extended.webSearch("Audiomack").first?.id, "music-downloader")
        XCTAssertEqual(extended.webSearch("Boomplay").first?.id, "music-downloader")
        XCTAssertEqual(extended.webSearch("YouTube Music").first?.id, "music-downloader")
    }


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

    func testNativeCatalogActivatesQRAndEcommerceAndNamesTheReader() {
        let tools = [
            Tool(id: "qr-payload-inspector", name: "QR Payload Inspector", slug: "qr-payload-inspector", description: "Inspect a QR payload", category: "qr", subcategory: nil, keywords: ["payload"], tags: [], icon: "QrCode", popularity: 10, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "qr", id: "inspect", op: nil)),
            Tool(id: "product-generator", name: "Product Generator", slug: "product-generator", description: "Create product records", category: "ecommerce", subcategory: nil, keywords: [], tags: [], icon: "ShoppingCart", popularity: 10, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "planned", disclaimer: nil, related: [], engine: ToolEngine(type: "custom", id: "product-generator", op: nil)),
            Tool(id: "future-tool", name: "Future Tool", slug: "future-tool", description: "Still planned", category: "marketing", subcategory: nil, keywords: [], tags: [], icon: "Megaphone", popularity: 1, featured: false, clientSide: false, requiresBackend: true, requiresAuth: false, status: "planned", disclaimer: nil, related: [], engine: ToolEngine(type: "custom", id: "future-tool", op: nil))
        ]
        let native = Catalog(schemaVersion: 1, catalogVersion: "test", counts: CatalogCounts(total: 3, active: 1, planned: 2, categories: 3), categories: [], tools: tools, relatedReferenceTools: nil).nativeFacing()
        XCTAssertEqual(native.tools.first { $0.id == "qr-payload-inspector" }?.name, "QR & Barcode Reader")
        XCTAssertEqual(native.tools.first { $0.id == "qr-payload-inspector" }?.status, "active")
        XCTAssertEqual(native.tools.first { $0.id == "product-generator" }?.status, "active")
        XCTAssertEqual(native.tools.first { $0.id == "future-tool" }?.status, "planned")
        XCTAssertEqual(native.counts.active, 2)
        XCTAssertEqual(native.counts.planned, 1)
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

    func testAccessibilityDiscoveryUsesEightStudiosAndPreservesLegacyIDs() {
        let ids = ["contrast-checker", "alt-text-checker", "focus-state-checker", "text-readability-checker", "aria-checker", "motion-checker", "keyboard-navigation-checker", "form-checker"]
        let sources = ids.map { id in
            Tool(id: id, name: id, slug: id, description: "", category: "accessibility", subcategory: nil, keywords: [], tags: [], icon: "Accessibility", popularity: 10, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "custom", id: id, op: nil))
        }
        let sut = Catalog(schemaVersion: 1, catalogVersion: "test", counts: catalog.counts, categories: catalog.categories, tools: sources, relatedReferenceTools: nil)
        let studios = sut.webSearch("", includeRelatedReferences: true).filter { $0.category == "accessibility" }
        XCTAssertEqual(studios.count, 8)
        XCTAssertEqual(Set(studios.map(\.id)).count, 8)
        XCTAssertEqual(sut.webSearch("focus ring", includeRelatedReferences: true).first?.id, "focus-state-checker")
        XCTAssertEqual(sut.accessibilityStudio(for: "focus-state-generator")?.id, "focus-state-checker")
        XCTAssertEqual(sut.relatedTools(for: studios.first(where: { $0.id == "aria-checker" })!, limit: 20).filter { $0.category == "accessibility" }.count, 7)
    }

    func testDeveloperCategoryProjectsFourteenNativeStudiosAndPreservesLegacyTools() {
        let sourceIDs = Array(Set(nativeDeveloperStudioSpecs.map(\.sourceID))).sorted()
        let sources = sourceIDs.map { id in
            Tool(id: id, name: id, slug: id, description: "source", category: "developer", subcategory: nil, keywords: [], tags: [], icon: "Code", popularity: 10, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "developer", id: id, op: id))
        }
        let sut = Catalog(schemaVersion: 1, catalogVersion: "test", counts: catalog.counts, categories: catalog.categories, tools: sources, relatedReferenceTools: nil)
        let studios = sut.developerStudioTools()
        XCTAssertEqual(studios.count, 14)
        XCTAssertEqual(Set(studios.map(\.id)).count, 14)
        XCTAssertTrue(studios.allSatisfy { $0.engine.type == "developer" })
        XCTAssertEqual(studios.first(where: { $0.id == "devops-studio" })?.engine.op, "developer-gitignore-generator")
        XCTAssertEqual(sut.webSearch("", includeRelatedReferences: true).filter { $0.tags.contains("developer-studio") }.count, 14)
        XCTAssertEqual(sut.tools.first(where: { $0.id == "json-formatter" })?.id, "json-formatter")
        XCTAssertTrue(nativeDeveloperStudioSpecs.first(where: { $0.id == "json-studio" })?.modes.contains(where: { $0.key == "schema" }) == true)
        XCTAssertTrue(nativeDeveloperStudioSpecs.first(where: { $0.id == "markup-studio" })?.modes.contains(where: { $0.key == "samples" }) == true)
        XCTAssertEqual(sut.developerModeForLegacySlug("json-diff"), "diff")
        XCTAssertEqual(sut.developerModeForLegacySlug("file-hash-calculator"), "file")
        XCTAssertEqual(sut.developerModeForLegacySlug("developer-dockerfile-helper"), "dockerfile")
        XCTAssertTrue(nativeDeveloperStudioSpecs.first(where: { $0.id == "ux-ui-studio" })?.modes.contains(where: { $0.key == "icons" }) == true)
        XCTAssertTrue(nativeDeveloperStudioSpecs.first(where: { $0.id == "ux-ui-studio" })?.modes.contains(where: { $0.key == "presets" }) == true)
        let legacyHash = Tool(id: "sha256-hash", name: "SHA-256", slug: "sha256-hash", description: "", category: "developer", subcategory: nil, keywords: [], tags: [], icon: "Code", popularity: 1, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "codec", id: "sha256-hash", op: nil))
        let legacySample = Tool(id: "lorem-ipsum-generator", name: "Lorem Ipsum", slug: "lorem-ipsum-generator", description: "", category: "developer", subcategory: nil, keywords: [], tags: [], icon: "Code", popularity: 1, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [], engine: ToolEngine(type: "generator", id: "lorem-ipsum-generator", op: nil))
        XCTAssertEqual(sut.developerStudio(forLegacyTool: legacyHash)?.id, "hash-studio")
        XCTAssertEqual(sut.developerStudio(forLegacyTool: legacySample)?.id, "markup-studio")
        XCTAssertNil(sut.developerStudio(forLegacyTool: studios[0]))
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
