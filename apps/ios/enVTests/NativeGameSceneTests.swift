import Foundation
import XCTest
@testable import enV

@MainActor
final class NativeGameSceneTests: XCTestCase {
    func testStarterWorldMovesAndStopsAtObstacle() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "starter", withExtension: "json", subdirectory: "game-presets"))
        let project = try NativeGameProject.decode(Data(contentsOf: url))
        let game = NativeGameScene()
        game.load(project)
        XCTAssertTrue(game.ready)
        let player = try XCTUnwrap(game.player)
        for _ in 0..<6 { game.move(x: 0, z: 1, seconds: 0.1) }
        XCTAssertGreaterThan(player.position.z, 1.5)
        for _ in 0..<15 { game.move(x: 1, z: 0, seconds: 0.1) }
        XCTAssertGreaterThan(player.position.x, 0.6)
        XCTAssertLessThanOrEqual(player.position.x, 1.01)
        let stopped = player.position
        game.paused = true
        XCTAssertTrue(game.scene.rootNode.isPaused)
        game.move(x: 0, z: -1, seconds: 0.1)
        XCTAssertEqual(player.position.z, stopped.z)
        game.paused = false
        XCTAssertFalse(game.scene.rootNode.isPaused)
    }

    func testSharedProjectLoadsActualGLBAndArtboard() throws {
        let url = try XCTUnwrap(Bundle(for: NativeGameSceneTests.self).url(forResource: "game-studio-project-v1", withExtension: "json"))
        let project = try NativeGameProject.decode(Data(contentsOf: url))
        let game = NativeGameScene()
        let loaded = expectation(description: "GLB scene loaded")
        game.load(project) { loaded.fulfill() }
        wait(for: [loaded], timeout: 30)
        XCTAssertTrue(game.ready, game.status)
        let modelObject = try XCTUnwrap(project.objects.first(where: { $0.kind == .model }))
        let model = try XCTUnwrap(game.objectNodes[modelObject.id])
        XCTAssertFalse(model.childNodes.isEmpty)
        let artboardObject = try XCTUnwrap(project.objects.first(where: { $0.kind == .artboard }))
        XCTAssertNotNil(game.objectNodes[artboardObject.id]?.geometry)
    }
}
