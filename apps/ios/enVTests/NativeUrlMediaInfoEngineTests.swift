import XCTest
@testable import enV

final class NativeUrlMediaInfoEngineTests: XCTestCase {
    func testCanonicalActiveIDIsExplicitlyNotClaimedOffline() {
        XCTAssertEqual(NativeUrlMediaInfoEngine.canonicalToolIDs, ["url-media-inspector"])
        XCTAssertTrue(NativeUrlMediaInfoEngine.supportedToolIDs.isEmpty)
        XCTAssertNil(NativeUrlMediaInfoEngine.operation(forToolID: "url-media-inspector"))
    }

    func testExecutionFailsWithoutNetworkOrGuessedMetadata() {
        XCTAssertThrowsError(try NativeUrlMediaInfoEngine.run(
            toolID: "url-media-inspector",
            input: "https://example.com/video.mp4",
            options: ["provider": "generic"]
        )) { error in
            XCTAssertEqual(error as? NativeUrlMediaInfoError, .unavailableOffline)
            XCTAssertTrue((error as? LocalizedError)?.errorDescription?.contains("remote metadata service") == true)
        }
    }

    func testUnknownIDsAreNotSilentlyMappedToAnOperation() {
        XCTAssertNil(NativeUrlMediaInfoEngine.operation(forToolID: "future-url-media-tool"))
        XCTAssertThrowsError(try NativeUrlMediaInfoEngine.run(toolID: "future-url-media-tool"))
    }

    func testURLMediaDownloadFieldsAreTopLevelAndPreserveSelections() {
        let body = NativeBackendEngine.urlMediaRequestBody(
            input: "https://www.youtube.com/watch?v=example",
            options: ["provider": "youtube", "format": "mp3", "audioOnly": true],
        )

        XCTAssertEqual(body["url"] as? String, "https://www.youtube.com/watch?v=example")
        XCTAssertEqual(body["provider"] as? String, "youtube")
        XCTAssertEqual(body["format"] as? String, "mp3")
        XCTAssertEqual(body["audioOnly"] as? Bool, true)
        XCTAssertNil(body["options"])
    }

    func testURLMediaInfoCanSendProviderAtTopLevelWithoutNestedOptions() {
        let body = NativeBackendEngine.urlMediaRequestBody(
            input: "https://example.com/video.mp4",
            options: ["provider": "generic"],
        )

        XCTAssertEqual(body["provider"] as? String, "generic")
        XCTAssertNil(body["options"])
    }
}
