import XCTest
@testable import enV

final class NativeCelebrationTests: XCTestCase {
    private let occasions = [
        "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
        "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party"
    ]
    private let experiences = [
        "page-generator", "interactive-card", "invitation-generator", "countdown",
        "memory-page", "reveal-page", "quiz-generator", "surprise-page"
    ]
    private let omitted = Set([
        "birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page"
    ])

    func testAllNinetyThreeCataloguedToolsHaveExactNativeOperations() {
        let expected = Set(occasions.flatMap { occasion in experiences.map { "\(occasion)-\($0)" } }.filter { !omitted.contains($0) })
        XCTAssertEqual(expected.count, 93)
        for id in expected {
            let parsed = NativeCelebrationEngine.parse(id)
            XCTAssertNotNil(parsed, id)
            let occasion = occasions.first { id.hasPrefix($0 + "-") }
            XCTAssertEqual(parsed?.occasion, occasion, id)
            XCTAssertEqual(parsed?.experience, occasion.map { String(id.dropFirst($0.count + 1)) }, id)
        }
        for id in omitted { XCTAssertNil(NativeCelebrationEngine.parse(id), id) }
        XCTAssertNil(NativeCelebrationEngine.parse("celebration-unsupported"))
    }

    func testIanaTimeZoneConversionAndDaylightSavingValidation() throws {
        let instant = try NativeCelebrationEngine.eventInstant("2026-11-05T10:00", timeZoneName: "Africa/Lagos")
        XCTAssertEqual(Calendar(identifier: .gregorian).dateComponents(in: TimeZone(secondsFromGMT: 0)!, from: instant).hour, 9)
        XCTAssertThrowsError(try NativeCelebrationEngine.eventInstant("2026-03-08T02:30", timeZoneName: "America/New_York")) {
            XCTAssertTrue($0.localizedDescription.contains("does not exist"))
        }
        XCTAssertThrowsError(try NativeCelebrationEngine.eventInstant("2026-11-01T01:30", timeZoneName: "America/New_York")) {
            XCTAssertTrue($0.localizedDescription.contains("occurs twice"))
        }
    }

    func testInvitationEscapesContentAndProvidesLocalReplyContact() throws {
        let output = try NativeCelebrationEngine.build("birthday-invitation-generator", values: [
            "title": "A & B <Birthday>",
            "honoree": "A & B",
            "message": "Dinner with <friends>",
            "contactMethod": "host@example.test",
            "rsvpBy": "20 November"
        ])
        XCTAssertTrue(output.html.hasPrefix("<!doctype html>"))
        XCTAssertTrue(output.html.contains("A &amp; B &lt;Birthday&gt;"))
        XCTAssertTrue(output.html.contains("Dinner with &lt;friends&gt;"))
        XCTAssertTrue(output.html.contains("Reply to: host@example.test"))
        XCTAssertTrue(output.html.contains("Guest responses are not collected"))
        XCTAssertFalse(output.checks.contains(where: { $0.contains("contact method") }))
    }

    func testUnsafeRsvpUrlIsNotRenderedAndQuizRequiresAnAnswerKey() throws {
        let invitation = try NativeCelebrationEngine.build("party-invitation-generator", values: [
            "title": "Party", "honoree": "Alex", "rsvpUrl": "javascript:alert(1)"
        ])
        XCTAssertFalse(invitation.html.contains("href=\"javascript:"))
        XCTAssertTrue(invitation.checks.contains(where: { $0.contains("http or https") }))

        let unanswered = try NativeCelebrationEngine.build("graduation-quiz-generator", values: [
            "title": "Graduation quiz", "honoree": "Sam",
            "quizQuestion": "Which year?", "quizOptions": "2025\n2026"
        ])
        XCTAssertTrue(unanswered.checks.contains(where: { $0.contains("correct answer") }))
        let answered = try NativeCelebrationEngine.build("graduation-quiz-generator", values: [
            "title": "Graduation quiz", "honoree": "Sam",
            "quizQuestion": "Which year?", "quizOptions": "2025\n2026", "quizAnswer": "2026"
        ])
        XCTAssertTrue(answered.html.contains("data-correct=\"true\""))
        XCTAssertFalse(answered.checks.contains(where: { $0.contains("correct answer") }))
    }

    func testMemoryPageEmbedsOnlyStrictlyValidatedImageDataUrls() throws {
        let output = try NativeCelebrationEngine.build("graduation-memory-page", values: [
            "title": "The good days",
            "photosData": [
                "data:image/png;base64,AAAA",
                "data:image/svg+xml;base64,PHN2ZyBvbmVycm9yPSJ4Ii8+",
                "data:image/png;base64,AAAA\\"><svg onload=alert(1)>"
            ].joined(separator: "\\n")
        ])
        XCTAssertEqual(output.html.components(separatedBy: "<figure>").count - 1, 1)
        XCTAssertFalse(output.html.contains("data:image/svg+xml"))
        XCTAssertFalse(output.html.contains("<svg onload="))
    }

    func testCountdownCompletesAndHasSecondPrecision() throws {
        let values = ["date": "2026-11-05T10:00", "timezone": "Africa/Lagos"]
        let target = try NativeCelebrationEngine.eventInstant(values["date"]!, timeZoneName: values["timezone"]!)
        let oneSecond = NativeCelebrationEngine.countdown(values, now: target.addingTimeInterval(-1))
        XCTAssertEqual(oneSecond?.seconds, 1)
        XCTAssertEqual(oneSecond?.complete, false)
        let past = NativeCelebrationEngine.countdown(values, now: target.addingTimeInterval(1))
        XCTAssertEqual(past?.complete, true)
    }
}
