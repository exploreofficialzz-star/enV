import XCTest
@testable import enV

final class NativeWorldLabProjectTests: XCTestCase {
    private func sharedFixture() throws -> Data {
        let url=try XCTUnwrap(Bundle(for: Self.self).url(forResource:"world-lab-project-v1",withExtension:"json"))
        return try Data(contentsOf:url)
    }
    func testSharedProjectAndVolumeMatchesWebAndAndroid() throws {
        let project=try NativeWorldLabProject.decode(sharedFixture())
        XCTAssertEqual(project.entities.count,2)
        XCTAssertEqual(project.materials.count,1)
        XCTAssertEqual(project.entities.first?.volumeMetersCubed,24,accuracy:1e-10)
        XCTAssertEqual(project.entities.first?.materialId,"mat-1")
        XCTAssertNil(project.entities.last?.materialId)
    }
    func testRejectsUnsupportedInputAndWrongMaterialReference() throws {
        var data=try sharedFixture()
        let original=try XCTUnwrap(String(data:data,encoding:.utf8))
        data=Data(original.replacingOccurrences(of:"\"schemaVersion\": 1",with:"\"schemaVersion\": 2").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(data))
        let bad=Data(original.replacingOccurrences(of:"\"materialId\": \"mat-1\"",with:"\"materialId\": \"missing\"").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(bad))
        let script=Data(original.replacingOccurrences(of:"\"revision\": 0,",with:"\"revision\": 0, \"script\":\"alert(1)\",").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(script))
    }
}
