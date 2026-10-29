import Foundation
import XCTest
@testable import enV

final class NativeGameProjectTests: XCTestCase {
    private func fixture() throws -> Data {
        let url = try XCTUnwrap(Bundle(for: NativeGameProjectTests.self).url(forResource: "game-studio-project-v1", withExtension: "json"))
        return try Data(contentsOf: url)
    }

    func testSharedProjectRoundTripsAssetsAndTransforms() throws {
        let project = try NativeGameProject.decode(fixture())
        XCTAssertEqual(project.objects.count, 4)
        XCTAssertEqual(project.assets.count, 2)
        XCTAssertEqual(project.objects[1].position.x, 1.25)
        XCTAssertEqual(project.objects[2].assetId, "artboard-1")
        XCTAssertEqual(try NativeGameProject.decode(project.encoded()), project)
    }

    func testRejectsUnsupportedVersionMissingAssetsAndInvalidScale() throws {
        let project = try NativeGameProject.decode(fixture())
        let future = NativeGameProject(format: project.format, version: 2, id: project.id, name: project.name, objects: project.objects, assets: project.assets)
        XCTAssertThrowsError(try future.validate())
        var missing = project; missing.assets.removeAll()
        XCTAssertThrowsError(try missing.validate())
        var invalid = project; invalid.objects[1].scale.x = -1
        XCTAssertThrowsError(try invalid.validate())
        var damaged = project
        let payload = try XCTUnwrap(damaged.assets.first?.dataUrl.split(separator: ",").last)
        var image = try XCTUnwrap(Data(base64Encoded: String(payload)))
        image[30] ^= 1
        damaged.assets[0].dataUrl = "data:image/png;base64," + image.base64EncodedString()
        XCTAssertThrowsError(try damaged.validate())
    }
}
