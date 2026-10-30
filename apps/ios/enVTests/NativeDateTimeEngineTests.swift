import XCTest
@testable import enV

final class NativeDateTimeEngineTests: XCTestCase {
    private let allIDs: Set<String> = [
        "age-calculator", "birthday-countdown", "business-day-calculator", "countdown", "date-calculator",
        "date-difference", "date-formatter", "deadline-calculator", "duration-calculator", "leap-year-checker",
        "meeting-time-planner", "time-until-calculator", "timezone-converter", "week-number-calculator",
        "weekday-calculator", "workday-calculator", "world-clock", "unix-timestamp-converter"
    ]
    private let fixedNow = ISO8601DateFormatter().date(from: "2024-01-15T12:00:00Z")!

    func testCanonicalActiveDatetimeIDsHaveLocalOperations() {
        XCTAssertEqual(Set(NativeDateTimeEngine.supportedToolIDs), allIDs)
        allIDs.forEach { XCTAssertNotNil(NativeDateTimeEngine.operation(forToolID: $0)) }
    }

    func testCalendarFormattingWeekAndLeapOperationsMatchWebSemantics() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "date-formatter", options: ["value": "2024-02-29", "pattern": "yyyy-MM-dd EEEE"], now: fixedNow).output, "Formatted: 2024-02-29 Thursday")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "weekday-calculator", input: "2024-02-29", now: fixedNow).output, "Weekday: Thursday")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "week-number-calculator", input: "2024-02-29", now: fixedNow).output, "ISO week: 9\nISO week-year: 2024")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "leap-year-checker", options: ["year": "2024"], now: fixedNow).output, "2024: Leap year")
    }

    func testBusinessDateDiffDurationAndBirthdayAreOffline() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "date-difference", options: ["from": "2024-01-01", "to": "2024-01-05"], now: fixedNow).output, "Calendar span: 0 years, 0 months, 4 days\nTotal days: 4\nWeeks: 0.57\nCalendar hours (24-hour days): 96")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "business-day-calculator", options: ["from": "2024-01-05", "to": "2024-01-08"], now: fixedNow).output, "Working days: 1\nRange rule: Start date excluded; end date included.\nCustom excluded dates: None supplied")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "workday-calculator", options: ["start": "2024-01-05", "days": "1"], now: fixedNow).output, "Result: 2024-01-08 Monday")
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "date-difference", options: ["from": "2024-01-01", "to": "2024-01-02"], now: fixedNow).output.contains("Total days: 1"))
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "birthday-countdown", input: "1990-02-01", now: fixedNow).output, "Days until birthday: 17")
    }

    func testCountdownTimezoneWorldClockAndUnixAreLocal() throws {
        let countdown = try NativeDateTimeEngine.run(toolID: "countdown", options: ["target": "2024-01-16T13:00:00Z"], now: fixedNow)
        XCTAssertTrue(countdown.output.contains("Countdown: 1d 1h 0m 0s")); XCTAssertTrue(countdown.output.contains("Total seconds: 90000"))
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "timezone-converter", options: ["time": "2024-01-01T00:00:00Z", "toTz": "America/New_York"], now: fixedNow).output.contains("Unix seconds: 1704067200"))
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "world-clock", options: ["zones": "UTC, America/New_York"], now: fixedNow).rows.count, 2)
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "unix-timestamp-converter", input: "0", now: fixedNow).output.contains("ISO UTC: 1970-01-01T00:00:00"))
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "unix-timestamp-converter", input: "2024-01-01", now: fixedNow).output.contains("Unix seconds: 1704067200"))
    }

    func testRelativeToolsAndInvalidInputsAreExplicit() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "time-until-calculator", options: ["target": "2024-01-20"], now: fixedNow).output, "Calendar span: 0 years, 0 months, 5 days\nTotal days: 5")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "deadline-calculator", options: ["target": "2024-01-20"], now: fixedNow).output, "Calendar days remaining: 5\nWorking days remaining: 4\nDeadline weekday: Saturday\nEnd-date rule: Deadline date excluded")
        XCTAssertThrowsError(try NativeDateTimeEngine.run(toolID: "date-formatter", input: "not-a-date", now: fixedNow))
    }
    func testSourceTimezoneIsUsedForWallClockConversionAndDayShift() throws {
        let result = try NativeDateTimeEngine.run(
            toolID: "timezone-converter",
            options: ["time": "2024-01-01T09:00", "fromTz": "UTC", "toTz": "America/New_York"],
            now: fixedNow
        )
        XCTAssertTrue(result.output.contains("Unix seconds: 1704099600"))
        XCTAssertTrue(result.output.contains("Same calendar day"))
    }

    func testCalendarWorkdayDurationAndMeetingToolsAreConsistent() throws {
        let workday = try NativeDateTimeEngine.run(toolID: "workday-calculator", options: ["start": "2024-01-08", "days": "-1"], now: fixedNow)
        XCTAssertEqual(workday.output, "Result: 2024-01-05 Friday")
        let duration = try NativeDateTimeEngine.run(toolID: "duration-calculator", options: ["from": "2024-01-01T09:00:00Z", "to": "2024-01-02T10:30:00Z"], now: fixedNow)
        XCTAssertTrue(duration.output.contains("Elapsed duration: 1d 1h 30m 0s"))
        XCTAssertTrue(duration.output.contains("Total seconds: 91800.000"))
        let meeting = try NativeDateTimeEngine.run(toolID: "meeting-time-planner", options: [
            "date": "2024-01-15", "zones": "Lagos, London, New York", "sourceTz": "Lagos",
            "workStart": "09:00", "workEnd": "17:00", "durationMinutes": "30", "intervalMinutes": "30"
        ], now: fixedNow)
        XCTAssertTrue(meeting.output.contains("Option 1:"))
        XCTAssertTrue(meeting.output.contains("ICS for option 1:"))
    }

    func testCustomHolidayRulesAndNanosecondPrecision() throws {
        let business = try NativeDateTimeEngine.run(toolID: "business-day-calculator", options: [
            "from": "2024-01-05", "to": "2024-01-09", "includeEnd": "true", "excludedDates": "2024-01-08"
        ], now: fixedNow)
        XCTAssertTrue(business.output.contains("Working days: 1"))
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "week-number-calculator", input: "2021-01-01", now: fixedNow).output.contains("ISO week-year: 2020"))
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "unix-timestamp-converter", input: "1704067200000000", now: fixedNow).output.contains("Detected precision: microseconds"))
    }

    func testCityWorldClockAndDaylightSavingGapValidation() throws {
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "world-clock", options: ["zones": "Lagos, London"], now: fixedNow).rows.count, 2)
        XCTAssertThrowsError(try NativeDateTimeEngine.run(toolID: "timezone-converter", options: [
            "time": "2024-03-10T02:30", "fromTz": "America/New_York", "toTz": "UTC"
        ], now: fixedNow))
    }

    func testDateAdditionAgeAndNegativeWorkdayAreSupported() throws {
        XCTAssertTrue(try NativeDateTimeEngine.run(toolID: "age-calculator", options: ["birth": "1990-02-01"], now: fixedNow).output.contains("Age: 33 years, 11 months, 14 days"))
        let dateAdd = try NativeDateTimeEngine.run(toolID: "date-calculator", options: ["start": "2024-01-31", "months": "1"], now: fixedNow)
        XCTAssertEqual(dateAdd.output, "Result: 2024-02-29 Thursday\nDate: 2024-02-29")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "workday-calculator", options: ["start": "2024-01-08", "days": "-1"], now: fixedNow).output, "Result: 2024-01-05 Friday")
    }

    func testRepeatedDaylightSavingTimeChoosesEarlierOccurrenceAndExplainsIt() throws {
        let result = try NativeDateTimeEngine.run(toolID: "timezone-converter", options: [
            "time": "2024-11-03T01:30", "fromTz": "America/New_York", "toTz": "UTC"
        ], now: fixedNow)
        XCTAssertTrue(result.output.contains("Unix seconds: 1730611800"))
        XCTAssertTrue(result.output.contains("DST note: This local time occurs twice; the earlier occurrence was selected."))
    }

    func testInvalidCustomHolidayDateIsRejected() throws {
        XCTAssertThrowsError(try NativeDateTimeEngine.run(toolID: "business-day-calculator", options: [
            "from": "2024-01-05", "to": "2024-01-09", "excludedDates": "2024-02-30"
        ], now: fixedNow))
    }

    func testRelativeDateToolsUseDeviceLocalCalendarDay() throws {
        let now = ISO8601DateFormatter().date(from: "2024-01-15T23:30:00Z")!
        let lagos = TimeZone(secondsFromGMT: 3600)!
        let age = try NativeDateTimeEngine.run(toolID: "age-calculator", options: ["birth": "2020-01-16"], now: now, localTimeZone: lagos)
        XCTAssertTrue(age.output.contains("Age: 4 years, 0 months, 0 days"))
        let until = try NativeDateTimeEngine.run(toolID: "time-until-calculator", options: ["target": "2024-01-17"], now: now, localTimeZone: lagos)
        XCTAssertTrue(until.output.contains("Calendar span: 0 years, 0 months, 1 days"))
        let deadline = try NativeDateTimeEngine.run(toolID: "deadline-calculator", options: ["target": "2024-01-17", "includeEnd": "true"], now: now, localTimeZone: lagos)
        XCTAssertTrue(deadline.output.contains("Calendar days remaining: 1"))
    }
    func testLeapDayBirthdayDefaultsToFebruary28WithMarchFirstOption() throws {
        let now = ISO8601DateFormatter().date(from: "2025-01-15T12:00:00Z")!
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "birthday-countdown", input: "2000-02-29", now: now).output, "Days until birthday: 44")
        XCTAssertEqual(try NativeDateTimeEngine.run(toolID: "birthday-countdown", options: [
            "birth": "2000-02-29", "leapBirthday": "mar-1"
        ], now: now).output, "Days until birthday: 45")
    }

}
