import XCTest
@testable import enV

final class NativeDateTimeEngineTests: XCTestCase {
    private let allIDs: Set<String> = [
        "birthday-countdown", "business-day-calculator", "countdown", "date-difference", "date-formatter",
        "deadline-calculator", "leap-year-checker", "time-until-calculator", "timezone-converter",
        "week-number-calculator", "weekday-calculator", "workday-calculator", "world-clock", "unix-timestamp-converter"
    ]
    private let fixedNow = ISO8601DateFormatter().date(from: "2024-01-15T12:00:00Z")!

    func testCanonicalActiveDatetimeIDsHaveLocalOperations() {
        XCTAssertEqual(Set(NativeDateTimeEngine.supportedToolIDs), allIDs)
        allIDs.forEach { XCTAssertNotNil(NativeDateTimeEngine.operation(forToolID: $0)) }
    }

    func testCalendarFormattingWeekAndLeapOperationsMatchWebSemantics() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "date-formatter", options: ["value": "2024-02-29", "pattern": "yyyy-MM-dd EEEE"], now: fixedNow).output, "Formatted: 2024-02-29 Thursday")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "weekday-calculator", input: "2024-02-29", now: fixedNow).output, "Weekday: Thursday")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "week-number-calculator", input: "2024-02-29", now: fixedNow).output, "ISO week: 9")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "leap-year-checker", options: ["year": "2024"], now: fixedNow).output, "2024: Leap year")
    }

    func testBusinessDateDiffDurationAndBirthdayAreOffline() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "date-difference", options: ["from": "2024-01-01", "to": "2024-01-05"], now: fixedNow).output, "Days: 4\nWeeks: 0.6")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "business-day-calculator", options: ["from": "2024-01-05", "to": "2024-01-08"], now: fixedNow).output, "Weekdays: 1")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "workday-calculator", options: ["start": "2024-01-05", "days": "1"], now: fixedNow).output, "Result: 2024-01-08 Monday")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "date-difference", options: ["from": "2024-01-01T00:00:00Z", "to": "2024-01-02T02:30:00Z"], now: fixedNow).output, "Days: 1\nWeeks: 0.1")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "birthday-countdown", input: "1990-02-01", now: fixedNow).output, "Days until birthday: 17")
    }

    func testCountdownTimezoneWorldClockAndUnixAreLocal() throws {
        let countdown = try NativeDateTimeEngine.run(toolID: "countdown", options: ["target": "2024-01-16T13:00:00Z"], now: fixedNow)
        XCTAssertTrue(countdown.output.contains("Countdown: 1d 1h 0m 0s")); XCTAssertTrue(countdown.output.contains("Total seconds: 90000"))
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "timezone-converter", options: ["time": "2024-01-01T00:00:00Z", "toTz": "America/New_York"], now: fixedNow).output.contains("Unix: 1704067200"))
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "world-clock", options: ["zones": "UTC, America/New_York"], now: fixedNow).rows.count, 2)
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "unix-timestamp-converter", input: "0", now: fixedNow).output.hasPrefix("ISO: 1970-01-01T00:00:00"))
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "unix-timestamp-converter", input: "2024-01-01", now: fixedNow).output, "Unix seconds: 1704067200")
    }

    func testRelativeToolsAndInvalidInputsAreExplicit() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "time-until-calculator", options: ["target": "2024-01-20"], now: fixedNow).output, "Calendar days: 5\nWeekdays: 4")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "deadline-calculator", options: ["target": "2024-01-20"], now: fixedNow).output, "Calendar days: 5\nWeekdays: 4")
        XCTAssertThrowsError(try NativeDateTimeEngine.run(toolID: "date-formatter", input: "not-a-date", now: fixedNow))
    }
}
