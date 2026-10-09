import XCTest
@testable import enV

final class NativeMimeEngineTests: XCTestCase {
    private let activeIDs: Set<String> = ["mime-lookup", "mime-type-lookup"]

    private func tool(_ id: String, category: String) -> Tool {
        Tool(id: id, name: id, slug: id, description: "", category: category, subcategory: nil, keywords: [], tags: [], icon: "File", popularity: 0, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", related: [], engine: ToolEngine(type: "mime", id: "lookup", op: "lookup"))
    }

    func testCanonicalActiveMimeIDsHaveTheSameLocalLookupOperation() {
        XCTAssertEqual(NativeMimeEngine.supportedToolIDs, activeIDs)
        activeIDs.forEach { XCTAssertEqual(NativeMimeEngine.operation(forToolID: $0), "lookup") }
    }

    func testActiveMimeToolsBypassBroadCategoryBackendRouting() {
        for candidate in [tool("mime-lookup", category: "developer"), tool("mime-type-lookup", category: "files")] {
            XCTAssertFalse(NativeBackendEngine.supports(candidate), candidate.id)
            XCTAssertTrue(NativeCoverage.isLocallyExecutable(candidate), candidate.id)
        }
    }

    func testLookupSearchesExtensionMimeNameAndGroupOffline() throws {
        XCTAssertEqual(try NativeMimeEngine.run(toolID: "mime-lookup", input: "png").rows.map(\.ext), ["png"])
        XCTAssertEqual(try NativeMimeEngine.run(toolID: "mime-type-lookup", input: "application/json").rows.map(\.ext), ["json"])
        XCTAssertEqual(try NativeMimeEngine.run(toolID: "mime-lookup", input: "word document").rows.map(\.ext), ["doc", "docx"])
        let audio = try NativeMimeEngine.run(toolID: "mime-lookup", input: "audio").rows.map(\.ext)
        XCTAssertTrue(["mp3", "wav", "ogg", "flac"].allSatisfy(audio.contains))
        XCTAssertEqual(try NativeMimeEngine.run(toolID: "mime-lookup", input: "png").rows.first?.mime, "image/png")
    }

    func testLocalSignatureInspectionMatchesWebTableAndReportsMislabeledFiles() throws {
        let png = try NativeMimeEngine.run(toolID: "mime-type-lookup", options: [
            "fileName": "photo.png", "browserMime": "image/png", "bytesHex": "89 50 4e 47 0d 0a 1a 0a 00"
        ]).inspection
        XCTAssertEqual(png?.entry?.ext, "png")
        XCTAssertEqual(png?.bytesHex, "89 50 4e 47 0d 0a 1a 0a 00")
        XCTAssertEqual(png?.mismatch, false)
        let mislabeled = NativeMimeEngine.inspect(fileName: "photo.txt", bytes: [0x25, 0x50, 0x44, 0x46])
        XCTAssertEqual(mislabeled.entry?.ext, "pdf")
        XCTAssertTrue(mislabeled.mismatch)
        let unknown = NativeMimeEngine.inspect(fileName: "note.txt", bytes: [1, 2, 3])
        XCTAssertNil(unknown.entry)
        XCTAssertEqual(unknown.bytesHex, "01 02 03")
    }

    func testSharedMagicUsesCanonicalFirstEntryAndUnknownToolsFail() throws {
        XCTAssertEqual(NativeMimeEngine.inspect(fileName: "sound.wav", bytes: [0x52, 0x49, 0x46, 0x46]).entry?.ext, "webp")
        XCTAssertNil(NativeMimeEngine.operation(forToolID: "mime-encoder"))
        XCTAssertThrowsError(try NativeMimeEngine.run(toolID: "mime-encoder"))
    }
}
