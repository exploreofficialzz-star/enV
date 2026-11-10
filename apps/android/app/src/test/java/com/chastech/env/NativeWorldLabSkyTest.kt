package com.chastech.env

import com.chastech.env.engine.NativeSolarPosition
import com.chastech.env.engine.NativeWorldLabSky
import java.time.Instant
import kotlin.math.abs
import kotlin.math.hypot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeWorldLabSkyTest {
    private fun at(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun equinoxSolarNoonOnTheEquatorIsNearlyOverhead() {
        val p = NativeWorldLabSky.solarPosition(at("2026-03-20T12:07:00Z"), 0.0, 0.0)
        assertTrue(p.altitudeDegrees.toString(), p.altitudeDegrees > 88.0 && p.altitudeDegrees <= 90.01)
    }

    @Test
    fun equinoxSunriseIsEastAndSunsetIsWest() {
        val rise = NativeWorldLabSky.solarPosition(at("2026-03-20T06:07:00Z"), 0.0, 0.0)
        val set = NativeWorldLabSky.solarPosition(at("2026-03-20T18:07:00Z"), 0.0, 0.0)
        assertTrue(abs(rise.altitudeDegrees) < 3.0 && abs(rise.azimuthDegrees - 90.0) < 6.0)
        assertTrue(abs(set.altitudeDegrees) < 3.0 && abs(set.azimuthDegrees - 270.0) < 6.0)
    }

    @Test
    fun midnightSunIsFarBelowTheHorizon() {
        assertTrue(NativeWorldLabSky.solarPosition(at("2026-03-20T00:07:00Z"), 0.0, 0.0).altitudeDegrees < -80.0)
    }

    @Test
    fun sunDirectionIsAUnitVectorWithYUp() {
        val d = NativeWorldLabSky.sunDirection(NativeSolarPosition(30.0, 90.0))
        assertEquals(1.0, hypot(hypot(d.x, d.y), d.z), 1e-12)
        assertEquals(0.5, d.y, 1e-12)
        assertTrue(d.x > 0.8 && abs(d.z) < 1e-9)
    }

    @Test
    fun paletteAndLightingStayBoundedAcrossTheDay() {
        var altitude = -30.0
        while (altitude <= 90.0) {
            val palette = NativeWorldLabSky.palette(altitude)
            (palette.zenith + palette.horizon).forEach { assertTrue(it in 0.0..1.0) }
            val light = NativeWorldLabSky.lighting(altitude)
            assertTrue(light.ambient in 0.1..1.0 && light.sun in 0.0..0.7)
            altitude += 1.0
        }
        assertFalse(NativeWorldLabSky.lighting(-30.0).sunVisible)
        assertTrue(NativeWorldLabSky.lighting(40.0).sunVisible)
        assertTrue(NativeWorldLabSky.lighting(-30.0).ambient < NativeWorldLabSky.lighting(40.0).ambient)
    }
}
