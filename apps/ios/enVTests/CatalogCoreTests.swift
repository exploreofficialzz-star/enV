import XCTest
@testable import enV

final class CatalogCoreTests: XCTestCase {
    private let catalog = Catalog(schemaVersion: 1, catalogVersion: "test", counts: CatalogCounts(total: 3, active: 2, planned: 1, categories: 1), categories: [ToolCategory(id: "text", name: "Text", description: "Text tools", blurb: "Text", icon: "Type")], tools: [
        Tool(id: "word-count", name: "Word Count", slug: "word-count", description: "Count words and characters", category: "text", keywords: ["count", "words"], tags: ["writing"], icon: "Type", popularity: 70, featured: true, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", related: [], engine: ToolEngine(type: "text", id: "word-count", op: nil)),
        Tool(id: "case-converter", name: "Case Converter", slug: "case-converter", description: "Convert text case", category: "text", keywords: ["uppercase"], tags: ["text"], icon: "Type", popularity: 90, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", related: [], engine: ToolEngine(type: "text", id: "case-converter", op: nil)),
        Tool(id: "future-tool", name: "Future Tool", slug: "future-tool", description: "Planned tool", category: "text", keywords: ["future"], tags: [], icon: "Wand2", popularity: 100, featured: false, clientSide: false, requiresBackend: true, requiresAuth: false, status: "planned", related: [], engine: ToolEngine(type: "custom", id: "future-tool", op: nil))
    ])

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

    func testToolEnginePreservesUnknownConfigurationValues() throws {
        let data = Data(#"{"type":"calculator","formula":"body-mass-index","precision":2,"options":["metric"]}"#.utf8)
        let engine = try JSONDecoder().decode(ToolEngine.self, from: data)
        XCTAssertEqual(engine.type, "calculator")
        XCTAssertEqual(engine.configuration["formula"], .string("body-mass-index"))
        XCTAssertEqual(engine.configuration["precision"], .number(2))
        XCTAssertEqual(engine.configuration["options"], .array([.string("metric")]))
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
}
