package com.chastech.env.engine

import java.time.Instant
import kotlin.math.abs
import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabSolarEventsTest {
    @Test fun lagosSolarEventsAreOrderedAndUseUtcStorage() {
        val events=NativeWorldLabSolarEvents.calculate("2026-11-01",6.5244,3.3792)
        assertEquals(NativeWorldLabSolarStatus.NORMAL,events.status)
        val sunrise=Instant.parse(events.sunriseUTC!!)
        val noon=Instant.parse(events.solarNoonUTC)
        val sunset=Instant.parse(events.sunsetUTC!!)
        assertTrue(sunrise<noon&&noon<sunset)
        assertTrue(events.daylightMinutes!! in 700.0..730.0)
        assertEquals("NOAA-general-solar-position-equations",events.method)
        assertTrue(events.validity.contains("Approximate"))
    }
    @Test fun equatorialEquinoxHasAboutTwelveHoursOfDaylight() {
        val events=NativeWorldLabSolarEvents.calculate("2026-03-20",0.0,0.0)
        assertEquals(NativeWorldLabSolarStatus.NORMAL,events.status)
        assertTrue(abs(events.daylightMinutes!!-720.0)<10.0)
    }
    @Test fun polarDayAndNightHaveNoInventedRiseOrSetTimes() {
        val summer=NativeWorldLabSolarEvents.calculate("2026-06-21",80.0,0.0)
        val winter=NativeWorldLabSolarEvents.calculate("2026-12-21",80.0,0.0)
        assertEquals(NativeWorldLabSolarStatus.POLAR_DAY,summer.status)
        assertEquals(NativeWorldLabSolarStatus.POLAR_NIGHT,winter.status)
        listOf(summer,winter).forEach {
            assertNull(it.sunriseUTC);assertNull(it.sunsetUTC);assertNull(it.daylightMinutes)
        }
    }
    @Test fun exactPolesAvoidDivisionByZeroAndInvalidInputsAreRejected() {
        assertEquals(NativeWorldLabSolarStatus.POLAR_DAY,
            NativeWorldLabSolarEvents.calculate("2026-06-21",90.0,0.0).status)
        assertEquals(NativeWorldLabSolarStatus.POLAR_NIGHT,
            NativeWorldLabSolarEvents.calculate("2026-12-21",90.0,0.0).status)
        assertEquals(NativeWorldLabSolarStatus.POLAR_DAY,
            NativeWorldLabSolarEvents.calculate("2026-12-21",-90.0,0.0).status)
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabSolarEvents.calculate("2025-02-29",0.0,0.0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabSolarEvents.calculate("2026-01-01",91.0,0.0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabSolarEvents.calculate("2026-01-01",0.0,181.0)
        }
    }
}
