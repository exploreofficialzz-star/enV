package com.chastech.env.engine

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.*

enum class NativeWorldLabSolarStatus { NORMAL, POLAR_DAY, POLAR_NIGHT }

data class NativeWorldLabSolarEvents(
    val dateUTC:String,
    val latitudeDegrees:Double,
    val longitudeDegrees:Double,
    val status:NativeWorldLabSolarStatus,
    val solarNoonUTC:String,
    val sunriseUTC:String?,
    val sunsetUTC:String?,
    val daylightMinutes:Double?,
    val method:String="NOAA-general-solar-position-equations",
    val horizonZenithDegrees:Double=90.833,
    val timeBasis:String="UTC civil date; no UT1/TT conversion",
    val validity:String="Approximate apparent sunrise/sunset for 1800–2100 using a standard 0.833° horizon correction; terrain, elevation horizon, weather, pressure, measured solar data, Earth-orientation parameters, leap seconds and precision ephemerides are not included."
)

object NativeWorldLabSolarEvents {
    private fun utcAtMinutes(date:LocalDate,minutes:Double):String {
        require(minutes.isFinite())
        val nanos=(minutes*60_000_000_000.0).roundToLong()
        return DateTimeFormatter.ISO_INSTANT.format(
            date.atStartOfDay(ZoneOffset.UTC).toInstant().plusNanos(nanos))
    }

    fun calculate(dateUTC:String,latitudeDegrees:Double,longitudeDegrees:Double):NativeWorldLabSolarEvents {
        require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(dateUTC)) {
            "Solar date must use YYYY-MM-DD UTC form."
        }
        val date=runCatching{LocalDate.parse(dateUTC)}.getOrElse {
            throw IllegalArgumentException("Solar date is not a valid Gregorian calendar day.")
        }
        require(date.year in 1800..2100) {
            "Solar approximation is supported only from 1800 through 2100."
        }
        require(latitudeDegrees.isFinite()&&latitudeDegrees in -90.0..90.0) {
            "Solar latitude must be finite and between -90° and 90°."
        }
        require(longitudeDegrees.isFinite()&&longitudeDegrees in -180.0..180.0) {
            "Solar longitude must be finite and between -180° and 180°."
        }
        val dayOfYear=date.dayOfYear
        val yearLength=if(date.isLeapYear)366.0 else 365.0
        val gamma=2.0*PI/yearLength*(dayOfYear-1)
        val equationOfTime=229.18*(0.000075+0.001868*cos(gamma)-
            0.032077*sin(gamma)-0.014615*cos(2*gamma)-
            0.040849*sin(2*gamma))
        val declination=0.006918-0.399912*cos(gamma)+
            0.070257*sin(gamma)-0.006758*cos(2*gamma)+
            0.000907*sin(2*gamma)-0.002697*cos(3*gamma)+
            0.00148*sin(3*gamma)
        val latitude=Math.toRadians(latitudeDegrees)
        val zenith=Math.toRadians(90.833)
        val noonMinutes=720.0-4.0*longitudeDegrees-equationOfTime
        require(noonMinutes.isFinite()&&declination.isFinite()) {
            "Solar position exceeded the supported numerical range."
        }
        val noon=utcAtMinutes(date,noonMinutes)
        var status=NativeWorldLabSolarStatus.NORMAL
        var sunrise:String?=null
        var sunset:String?=null
        var daylight:Double?=null
        val cosLatitude=cos(latitude)
        if(abs(cosLatitude)<1e-12){
            val declinationDegrees=Math.toDegrees(declination)
            val polarAltitude=if(latitudeDegrees>0)declinationDegrees else -declinationDegrees
            status=if(polarAltitude> -0.833)NativeWorldLabSolarStatus.POLAR_DAY
                else NativeWorldLabSolarStatus.POLAR_NIGHT
        }else{
            val denominator=cosLatitude*cos(declination)
            val cosHour=cos(zenith)/denominator-tan(latitude)*tan(declination)
            require(cosHour.isFinite()) {
                "Solar position exceeded the supported numerical range."
            }
            when {
                cosHour>1.0+1e-12->status=NativeWorldLabSolarStatus.POLAR_NIGHT
                cosHour< -1.0-1e-12->status=NativeWorldLabSolarStatus.POLAR_DAY
                else->{
                    val hourAngle=Math.toDegrees(acos(cosHour.coerceIn(-1.0,1.0)))
                    val rise=noonMinutes-4.0*hourAngle
                    val set=noonMinutes+4.0*hourAngle
                    sunrise=utcAtMinutes(date,rise)
                    sunset=utcAtMinutes(date,set)
                    daylight=set-rise
                }
            }
        }
        return NativeWorldLabSolarEvents(dateUTC,latitudeDegrees,longitudeDegrees,status,
            noon,sunrise,sunset,daylight)
    }
}
