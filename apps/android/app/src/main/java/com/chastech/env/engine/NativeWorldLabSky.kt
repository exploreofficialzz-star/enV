package com.chastech.env.engine

import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tan

data class NativeSolarPosition(val altitudeDegrees: Double, val azimuthDegrees: Double)

/** Colours are linear 0..1 RGB triples. */
data class NativeSkyPalette(
    val zenith: List<Double>,
    val horizon: List<Double>,
    val glowStrength: Double,
)

data class NativeSkyLighting(val ambient: Double, val sun: Double, val sunVisible: Boolean)

/**
 * Display-grade sun position and sky palette for the representative world. Uses the public NOAA
 * solar-position equations (no refraction); it is a visual reference good to about half a degree,
 * not an ephemeris. Axes follow the World Lab scene: +X east, +Y up, +Z north.
 */
object NativeWorldLabSky {
    private const val RAD = PI / 180.0
    private const val DEG = 180.0 / PI

    private fun clamp(value: Double, low: Double, high: Double) = minOf(high, maxOf(low, value))

    fun solarPosition(epochMillis: Long, latitudeDegrees: Double, longitudeDegrees: Double): NativeSolarPosition {
        val julianDay = epochMillis / 86_400_000.0 + 2_440_587.5
        val t = (julianDay - 2_451_545.0) / 36_525.0
        val meanLongitude = (((280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360.0) + 360.0) % 360.0
        val meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t)
        val eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
        val m = meanAnomaly * RAD
        val centre = sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
            sin(2 * m) * (0.019993 - 0.000101 * t) + sin(3 * m) * 0.000289
        val trueLongitude = meanLongitude + centre
        val omega = 125.04 - 1934.136 * t
        val apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sin(omega * RAD)
        val meanObliquity = 23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0
        val obliquity = meanObliquity + 0.00256 * cos(omega * RAD)
        val declination = asin(sin(obliquity * RAD) * sin(apparentLongitude * RAD))
        val y = tan(obliquity * RAD / 2.0).pow(2)
        val l0 = meanLongitude * RAD
        val equationOfTimeMinutes = 4.0 * DEG * (
            y * sin(2 * l0) - 2 * eccentricity * sin(m) +
                4 * eccentricity * y * sin(m) * cos(2 * l0) -
                0.5 * y * y * sin(4 * l0) - 1.25 * eccentricity * eccentricity * sin(2 * m)
            )
        val dayMillis = ((epochMillis % 86_400_000L) + 86_400_000L) % 86_400_000L
        val utcMinutes = dayMillis / 60_000.0
        val solarMinutes = (((utcMinutes + equationOfTimeMinutes + 4.0 * longitudeDegrees) % 1440.0) + 1440.0) % 1440.0
        var hourAngle = solarMinutes / 4.0 - 180.0
        if (hourAngle < -180.0) hourAngle += 360.0
        val lat = clamp(latitudeDegrees, -90.0, 90.0) * RAD
        val cosZenith = clamp(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle * RAD), -1.0, 1.0)
        val zenith = acos(cosZenith)
        val denominator = cos(lat) * sin(zenith)
        var azimuth = 180.0
        if (kotlin.math.abs(denominator) > 1e-9) {
            val raw = DEG * acos(clamp((sin(lat) * cosZenith - sin(declination)) / denominator, -1.0, 1.0))
            azimuth = if (hourAngle > 0) (raw + 180.0) % 360.0 else (540.0 - raw) % 360.0
        }
        return NativeSolarPosition(90.0 - zenith * DEG, azimuth)
    }

    /** Unit vector toward the sun: x east, y up, z north. */
    fun sunDirection(position: NativeSolarPosition): NativeLabVector {
        val altitude = position.altitudeDegrees * RAD
        val azimuth = position.azimuthDegrees * RAD
        return NativeLabVector(sin(azimuth) * cos(altitude), sin(altitude), cos(azimuth) * cos(altitude))
    }

    private class Key(val altitude: Double, val zenith: List<Double>, val horizon: List<Double>, val glow: Double)

    private val keys = listOf(
        Key(-18.0, listOf(0.012, 0.02, 0.06), listOf(0.035, 0.05, 0.11), 0.0),
        Key(-6.0, listOf(0.05, 0.08, 0.2), listOf(0.2, 0.2, 0.34), 0.35),
        Key(0.0, listOf(0.2, 0.3, 0.58), listOf(0.96, 0.6, 0.4), 0.85),
        Key(8.0, listOf(0.24, 0.46, 0.8), listOf(0.86, 0.8, 0.74), 0.45),
        Key(25.0, listOf(0.17, 0.42, 0.82), listOf(0.72, 0.85, 0.96), 0.18),
        Key(90.0, listOf(0.15, 0.38, 0.8), listOf(0.7, 0.84, 0.95), 0.1),
    )

    private fun mix(a: List<Double>, b: List<Double>, f: Double) = List(3) { a[it] + (b[it] - a[it]) * f }

    fun palette(altitudeDegrees: Double): NativeSkyPalette {
        val altitude = clamp(altitudeDegrees, keys.first().altitude, 90.0)
        var index = 0
        while (index < keys.size - 2 && altitude > keys[index + 1].altitude) index += 1
        val a = keys[index]
        val b = keys[index + 1]
        val f = clamp((altitude - a.altitude) / (b.altitude - a.altitude), 0.0, 1.0)
        return NativeSkyPalette(mix(a.zenith, b.zenith, f), mix(a.horizon, b.horizon, f), a.glow + (b.glow - a.glow) * f)
    }

    fun lighting(altitudeDegrees: Double): NativeSkyLighting {
        val day = clamp((altitudeDegrees + 4.0) / 16.0, 0.0, 1.0)
        val twilight = clamp((altitudeDegrees + 18.0) / 14.0, 0.0, 1.0)
        return NativeSkyLighting(0.12 + 0.12 * twilight + 0.61 * day, 0.65 * day, altitudeDegrees > -2.0)
    }

    /** The representative site sits on the equator; longitude is chosen so the device clock reads local solar time. */
    fun representativeLongitude(timezoneOffsetMillis: Int): Double = timezoneOffsetMillis / 3_600_000.0 * 15.0
}
