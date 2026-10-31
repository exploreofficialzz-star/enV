package com.chastech.env.engine

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDateTimeEngineTest {
    private val allIds = setOf(
        "age-calculator", "birthday-countdown", "business-day-calculator", "countdown",
        "date-calculator", "date-difference", "date-formatter", "deadline-calculator",
        "duration-calculator", "leap-year-checker", "meeting-time-planner",
        "time-until-calculator", "timezone-converter", "week-number-calculator",
        "weekday-calculator", "workday-calculator", "world-clock", "unix-timestamp-converter"
    )
    private val fixedNow = Instant.parse("2024-01-15T12:00:00Z")

    @Test fun canonicalActiveDatetimeIdsHaveLocalOperations() {
        assertEquals(allIds, NativeDateTimeEngine.supportedToolIds)
        allIds.forEach { assertTrue(NativeDateTimeEngine.operationForTool(it)!!.isNotEmpty()) }
    }

    @Test fun calendarFormattingWeekAndLeapOperationsMatchWebSemantics() {
        assertEquals("Formatted: 2024-02-29 Thursday", NativeDateTimeEngine.run("date-formatter", options = mapOf("value" to "2024-02-29", "pattern" to "yyyy-MM-dd EEEE"), now = fixedNow).output)
        assertEquals("Weekday: Thursday", NativeDateTimeEngine.run("weekday-calculator", input = "2024-02-29", now = fixedNow).output)
        assertEquals("ISO week: 9\nISO week-year: 2024", NativeDateTimeEngine.run("week-number-calculator", input = "2024-02-29", now = fixedNow).output)
        assertEquals("2024: Leap year", NativeDateTimeEngine.run("leap-year-checker", options = mapOf("year" to "2024"), now = fixedNow).output)
    }

    @Test fun businessDayDateDiffDurationAndBirthdayAreOffline() {
        assertEquals("Calendar span: 0 years, 0 months, 4 days\nTotal days: 4\nWeeks: 0.57\nCalendar hours (24-hour days): 96", NativeDateTimeEngine.run("date-difference", options = mapOf("from" to "2024-01-01", "to" to "2024-01-05"), now = fixedNow).output)
        assertTrue(NativeDateTimeEngine.run("date-difference", options = mapOf(
            "from" to "2024-01-31", "to" to "2024-02-29"
        ), now = fixedNow).output.contains("Calendar span: 0 years, 1 months, 0 days"))
        assertEquals("Age: 25 years, 0 months, 0 days", NativeDateTimeEngine.run(
            "age-calculator", options = mapOf("birth" to "2000-02-29"),
            now = Instant.parse("2025-02-28T12:00:00Z"), localTimeZone = java.time.ZoneId.of("UTC")
        ).output.substringBefore("\n"))
        assertEquals("Working days: 1\nRange rule: Start date excluded; end date included.\nCustom excluded dates: None supplied", NativeDateTimeEngine.run("business-day-calculator", options = mapOf("from" to "2024-01-05", "to" to "2024-01-08"), now = fixedNow).output)
        assertEquals("Result: 2024-01-08 Monday", NativeDateTimeEngine.run("workday-calculator", options = mapOf("start" to "2024-01-05", "days" to "1"), now = fixedNow).output)
        assertEquals("Days until birthday: 17", NativeDateTimeEngine.run("birthday-countdown", input = "1990-02-01", now = fixedNow).output)
    }

    @Test fun countdownTimezoneWorldClockAndUnixAreLocal() {
        val countdown = NativeDateTimeEngine.run("countdown", options = mapOf("target" to "2024-01-16T13:00:00Z"), now = fixedNow).output
        assertTrue(countdown.contains("Countdown: 1d 1h 0m 0s")); assertTrue(countdown.contains("Total seconds: 90000"))
        assertTrue(NativeDateTimeEngine.run("timezone-converter", options = mapOf("time" to "2024-01-01T00:00:00Z", "fromTz" to "UTC", "toTz" to "America/New_York"), now = fixedNow).output.contains("Unix seconds: 1704067200"))
        assertTrue(NativeDateTimeEngine.run("world-clock", options = mapOf("zones" to "UTC, America/New_York"), now = fixedNow).rows.size == 2)
        assertTrue(NativeDateTimeEngine.run("unix-timestamp-converter", input = "0", now = fixedNow).output.contains("ISO UTC: 1970-01-01T00:00:00Z"))
        assertTrue(NativeDateTimeEngine.run("unix-timestamp-converter", input = "2024-01-01", now = fixedNow).output.contains("Unix seconds: 1704067200"))
    }

    @Test fun relativeToolsAndInvalidInputsAreExplicit() {
        assertEquals("Calendar span: 0 years, 0 months, 5 days\nTotal days: 5", NativeDateTimeEngine.run("time-until-calculator", options = mapOf("target" to "2024-01-20"), now = fixedNow).output)
        assertEquals("Calendar days remaining: 5\nWorking days remaining: 4\nDeadline weekday: Saturday\nEnd-date rule: Deadline date excluded", NativeDateTimeEngine.run("deadline-calculator", options = mapOf("target" to "2024-01-20"), now = fixedNow).output)
        try { NativeDateTimeEngine.run("date-formatter", input = "not-a-date", now = fixedNow); throw AssertionError("invalid date accepted") } catch (_: IllegalArgumentException) { }
    }
    @Test fun sourceTimezoneIsUsedForWallClockConversionAndDayShift() {
        val result = NativeDateTimeEngine.run(
            "timezone-converter",
            options = mapOf("time" to "2024-01-01T09:00", "fromTz" to "UTC", "toTz" to "America/New_York"),
            now = fixedNow
        )
        assertTrue(result.output.contains("Unix seconds: 1704099600"))
        assertTrue(result.output.contains("Same calendar day"))
    }

    @Test fun dateMathAndBusinessDayRulesHandleCustomHolidaysAndReverseRanges() {
        assertEquals(
            "Working days: 1\nRange rule: Start date excluded; end date included.\nCustom excluded dates: 1",
            NativeDateTimeEngine.run("business-day-calculator", options = mapOf(
                "from" to "2024-01-05", "to" to "2024-01-09",
                "excludedDates" to "2024-01-08", "includeEnd" to "true"
            ), now = fixedNow).output
        )
        assertEquals(
            "Result: 2024-01-05 Friday",
            NativeDateTimeEngine.run("workday-calculator", options = mapOf("start" to "2024-01-08", "days" to "-1"), now = fixedNow).output
        )
        assertTrue(NativeDateTimeEngine.run("date-difference", options = mapOf("from" to "2024-01-10", "to" to "2024-01-01"), now = fixedNow).output.contains("Total days: -9"))
        assertTrue(NativeDateTimeEngine.run("week-number-calculator", input = "2021-01-01", now = fixedNow).output.contains("ISO week-year: 2020"))
    }

    @Test fun cityBasedWorldClockAndDstGapAreExplicit() {
        assertEquals(2, NativeDateTimeEngine.run("world-clock", options = mapOf("zones" to "Lagos\nLondon"), now = fixedNow).rows.size)
        try {
            NativeDateTimeEngine.run("timezone-converter", options = mapOf("time" to "2024-03-10T02:30", "fromTz" to "America/New_York", "toTz" to "UTC"), now = fixedNow)
            throw AssertionError("DST gap should not be silently accepted")
        } catch (_: IllegalArgumentException) { }
    }


    @Test fun invalidDateTimeOptionsAreRejectedRatherThanSilentlyDefaulted() {
        try {
            NativeDateTimeEngine.run("workday-calculator", options = mapOf("start" to "2024-01-08", "days" to "1.5"), now = fixedNow)
            throw AssertionError("fractional business days accepted")
        } catch (_: IllegalArgumentException) { }
        try {
            NativeDateTimeEngine.run("date-calculator", options = mapOf("start" to "2024-01-01", "days" to "abc"), now = fixedNow)
            throw AssertionError("invalid date unit accepted")
        } catch (_: IllegalArgumentException) { }
        try {
            NativeDateTimeEngine.run("date-calculator", options = mapOf("start" to "2024-01-01", "days" to "1", "direction" to "ad"), now = fixedNow)
            throw AssertionError("invalid date direction accepted")
        } catch (_: IllegalArgumentException) { }
        try {
            NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
                "date" to "2024-01-15", "zones" to "Lagos, London", "sourceTz" to "Lagos", "durationMinutes" to "abc"
            ), now = fixedNow)
            throw AssertionError("invalid meeting duration accepted")
        } catch (_: IllegalArgumentException) { }
        try {
            NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
                "date" to "2024-01-15", "zones" to "Lagos, London", "sourceTz" to "Lagos",
                "workStart" to "20:00", "workEnd" to "08:00"
            ), now = fixedNow)
            throw AssertionError("overnight window must not be reported as supported")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun meetingPlannerDoesNotOfferWeekendSlotsByDefault() {
        val result = NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
            "date" to "2024-01-13", "zones" to "Lagos, London", "sourceTz" to "Lagos"
        ), now = fixedNow)
        assertTrue(result.output.contains("No shared working-hours slots"))
        assertTrue(!result.output.contains("Option 1:"))
    }

    @Test fun meetingPlannerSupportsSundayToThursdayWorkweeks() {
        val result = NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
            "date" to "2024-01-14", "zones" to "Lagos, Berlin", "sourceTz" to "Lagos",
            "workStart" to "09:00", "workEnd" to "17:00", "workDays" to "0,1,2,3,4"
        ), now = fixedNow)
        assertTrue(result.output.contains("Option 1:"))
        assertTrue(result.output.contains("Sunday, Monday, Tuesday, Wednesday, Thursday"))
    }

    @Test fun meetingPlannerRejectsInvalidWeekdayInput() {
        try {
            NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
                "date" to "2024-01-14", "zones" to "Lagos, Berlin", "sourceTz" to "Lagos", "workDays" to "0,7"
            ), now = fixedNow)
            throw AssertionError("invalid weekday accepted")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun worldClockAcceptsUnambiguousIanaCityAliases() {
        val result = NativeDateTimeEngine.run(
            "world-clock",
            options = mapOf("zones" to "Stockholm, Kathmandu, Brisbane"),
            now = fixedNow
        )
        assertEquals(3, result.rows.size)
        assertEquals(listOf("Stockholm", "Kathmandu", "Brisbane"), result.rows.map { it.label })
        assertTrue(result.rows.all { it.value.contains("UTC") })
    }

    @Test fun dateAdditionAgeDurationAndMeetingPlannerAreAvailable() {
        assertTrue(NativeDateTimeEngine.run("age-calculator", options = mapOf("birth" to "1990-02-01"), now = fixedNow).output.contains("Age: 33 years, 11 months, 14 days"))
        assertEquals("Result: 2024-02-29 Thursday\nDate: 2024-02-29", NativeDateTimeEngine.run("date-calculator", options = mapOf("start" to "2024-01-31", "months" to "1"), now = fixedNow).output)
        val duration = NativeDateTimeEngine.run("duration-calculator", options = mapOf("from" to "2024-01-01T09:00:00Z", "to" to "2024-01-02T10:30:00Z"), now = fixedNow).output
        assertTrue(duration.contains("Elapsed duration: 1d 1h 30m 0s"))
        val meeting = NativeDateTimeEngine.run("meeting-time-planner", options = mapOf(
            "date" to "2024-01-15", "zones" to "Lagos, London, New York", "sourceTz" to "Lagos",
            "workStart" to "09:00", "workEnd" to "17:00", "durationMinutes" to "30", "intervalMinutes" to "30"
        ), now = fixedNow).output
        assertTrue(meeting.contains("Option 1:"))
        assertTrue(meeting.contains("ICS for option 1:"))
        assertTrue(meeting.contains("UID:env-"))
        assertTrue(meeting.contains("DTSTAMP:"))
    }

    @Test fun negativeSubsecondUnixValuesUseFloorSemantics() {
        val result = NativeDateTimeEngine.run("unix-timestamp-converter", options = mapOf(
            "value" to "-00000000000000001"
        ), now = fixedNow)
        assertTrue(result.output.contains("ISO UTC: 1969-12-31T23:59:59.999999999Z"))
        assertTrue(result.output.contains("Unix milliseconds: -1"))
        assertTrue(result.output.contains("Unix microseconds: -1"))
    }

    @Test fun unixTimestampBatchConvertsLocallyAndEnforcesLimit() {
        val result = NativeDateTimeEngine.run("unix-timestamp-converter", options = mapOf(
            "value" to "1704067200, 1704153600000"
        ), now = fixedNow)
        assertEquals(2, result.rows.size)
        assertTrue(result.output.contains("Timestamp 1:"))
        assertTrue(result.output.contains("Timestamp 2:"))
        try {
            NativeDateTimeEngine.run("unix-timestamp-converter", options = mapOf(
                "value" to (1..101).joinToString(",") { "1704067200" }
            ), now = fixedNow)
            throw AssertionError("more than 100 timestamps accepted")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun repeatedDaylightSavingTimeSelectsEarlierOccurrenceAndExplainsIt() {
        val result = NativeDateTimeEngine.run("timezone-converter", options = mapOf(
            "time" to "2024-11-03T01:30", "fromTz" to "America/New_York", "toTz" to "UTC"
        ), now = fixedNow)
        assertTrue(result.output.contains("Unix seconds: 1730611800"))
        assertTrue(result.output.contains("DST note: This local time occurs twice; the earlier occurrence was selected."))
    }

    @Test fun invalidCustomHolidayDateIsRejected() {
        try {
            NativeDateTimeEngine.run("business-day-calculator", options = mapOf(
                "from" to "2024-01-05", "to" to "2024-01-09", "excludedDates" to "2024-02-30"
            ), now = fixedNow)
            throw AssertionError("invalid excluded date should not be ignored")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun relativeDateToolsUseDeviceLocalCalendarDay() {
        val now = Instant.parse("2024-01-15T23:30:00Z")
        val lagos = java.time.ZoneId.of("Africa/Lagos")
        val age = NativeDateTimeEngine.run("age-calculator", options = mapOf("birth" to "2020-01-16"), now = now, localTimeZone = lagos)
        assertTrue(age.output.contains("Age: 4 years, 0 months, 0 days"))
        val until = NativeDateTimeEngine.run("time-until-calculator", options = mapOf("target" to "2024-01-17"), now = now, localTimeZone = lagos)
        assertTrue(until.output.contains("Calendar span: 0 years, 0 months, 1 days"))
        val deadline = NativeDateTimeEngine.run("deadline-calculator", options = mapOf("target" to "2024-01-17", "includeEnd" to "true"), now = now, localTimeZone = lagos)
        assertTrue(deadline.output.contains("Calendar days remaining: 1"))
    }
    @Test fun leapDayBirthdayDefaultsToFebruary28WithMarchFirstOption() {
        val now = Instant.parse("2025-01-15T12:00:00Z")
        assertEquals("Days until birthday: 44", NativeDateTimeEngine.run("birthday-countdown", input = "2000-02-29", now = now).output)
        assertEquals("Days until birthday: 45", NativeDateTimeEngine.run("birthday-countdown", options = mapOf(
            "birth" to "2000-02-29", "leapBirthday" to "mar-1"
        ), now = now).output)
    }

}
