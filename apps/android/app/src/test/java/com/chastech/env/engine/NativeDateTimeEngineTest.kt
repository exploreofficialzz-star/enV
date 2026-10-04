package com.chastech.env.engine

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDateTimeEngineTest {
    private val allIds = setOf(
        "birthday-countdown", "business-day-calculator", "countdown", "date-difference", "date-formatter",
        "deadline-calculator", "leap-year-checker", "time-until-calculator", "timezone-converter",
        "week-number-calculator", "weekday-calculator", "workday-calculator", "world-clock", "unix-timestamp-converter"
    )
    private val fixedNow = Instant.parse("2024-01-15T12:00:00Z")

    @Test fun canonicalActiveDatetimeIdsHaveLocalOperations() {
        assertEquals(allIds, NativeDateTimeEngine.supportedToolIds)
        allIds.forEach { assertTrue(NativeDateTimeEngine.operationForTool(it)!!.isNotEmpty()) }
    }

    @Test fun calendarFormattingWeekAndLeapOperationsMatchWebSemantics() {
        assertEquals("Formatted: 2024-02-29 Thursday", NativeDateTimeEngine.run("date-formatter", options = mapOf("value" to "2024-02-29", "pattern" to "yyyy-MM-dd EEEE"), now = fixedNow).output)
        assertEquals("Weekday: Thursday", NativeDateTimeEngine.run("weekday-calculator", input = "2024-02-29", now = fixedNow).output)
        assertEquals("ISO week: 9", NativeDateTimeEngine.run("week-number-calculator", input = "2024-02-29", now = fixedNow).output)
        assertEquals("2024: Leap year", NativeDateTimeEngine.run("leap-year-checker", options = mapOf("year" to "2024"), now = fixedNow).output)
    }

    @Test fun businessDayDateDiffDurationAndBirthdayAreOffline() {
        assertEquals("Days: 4\nWeeks: 0.6", NativeDateTimeEngine.run("date-difference", options = mapOf("from" to "2024-01-01", "to" to "2024-01-05"), now = fixedNow).output)
        assertEquals("Weekdays: 1", NativeDateTimeEngine.run("business-day-calculator", options = mapOf("from" to "2024-01-05", "to" to "2024-01-08"), now = fixedNow).output)
        assertEquals("Result: 2024-01-08 Monday", NativeDateTimeEngine.run("workday-calculator", options = mapOf("start" to "2024-01-05", "days" to "1"), now = fixedNow).output)
        assertEquals("Days until birthday: 17", NativeDateTimeEngine.run("birthday-countdown", input = "1990-02-01", now = fixedNow).output)
    }

    @Test fun countdownTimezoneWorldClockAndUnixAreLocal() {
        val countdown = NativeDateTimeEngine.run("countdown", options = mapOf("target" to "2024-01-16T13:00:00Z"), now = fixedNow).output
        assertTrue(countdown.contains("Countdown: 1d 1h 0m 0s")); assertTrue(countdown.contains("Total seconds: 90000"))
        assertTrue(NativeDateTimeEngine.run("timezone-converter", options = mapOf("time" to "2024-01-01T00:00:00Z", "toTz" to "America/New_York"), now = fixedNow).output.contains("Unix: 1704067200"))
        assertTrue(NativeDateTimeEngine.run("world-clock", options = mapOf("zones" to "UTC, America/New_York"), now = fixedNow).rows.size == 2)
        assertTrue(NativeDateTimeEngine.run("unix-timestamp-converter", input = "0", now = fixedNow).output.startsWith("ISO: 1970-01-01T00:00:00Z"))
        assertEquals("Unix seconds: 1704067200", NativeDateTimeEngine.run("unix-timestamp-converter", input = "2024-01-01", now = fixedNow).output)
    }

    @Test fun relativeToolsAndInvalidInputsAreExplicit() {
        assertEquals("Calendar days: 5\nWeekdays: 4", NativeDateTimeEngine.run("time-until-calculator", options = mapOf("target" to "2024-01-20"), now = fixedNow).output)
        assertEquals("Calendar days: 5\nWeekdays: 4", NativeDateTimeEngine.run("deadline-calculator", options = mapOf("target" to "2024-01-20"), now = fixedNow).output)
        try { NativeDateTimeEngine.run("date-formatter", input = "not-a-date", now = fixedNow); throw AssertionError("invalid date accepted") } catch (_: IllegalArgumentException) { }
    }
}
