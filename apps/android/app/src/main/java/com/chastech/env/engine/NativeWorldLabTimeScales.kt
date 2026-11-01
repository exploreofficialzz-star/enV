package com.chastech.env.engine

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sqrt

enum class NativeWorldLabEarthOrientationQuality { OBSERVED, PREDICTED }
data class NativeWorldLabEarthOrientationSample(
    val utcDay:String,val mjd:Int,val dut1Seconds:Double,
    val uncertaintySeconds:Double,val quality:NativeWorldLabEarthOrientationQuality
)
data class NativeWorldLabEarthOrientationSeries(
    val format:String="env-iers-bulletin-a-series",
    val schemaVersion:Int=1,
    val source:String="IERS Bulletin A",
    val volume:String,val number:Int,val issuedDateUTC:String,
    val algorithm:String,val samples:List<NativeWorldLabEarthOrientationSample>
) {
    init { validate() }
    fun validate() {
        require(format=="env-iers-bulletin-a-series"&&schemaVersion==1&&source=="IERS Bulletin A")
        require(volume.isNotBlank()&&volume.length<=12&&number in 1..999&&
            issuedDateUTC.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$")))
        require(samples.size in 2..2000)
        samples.forEachIndexed { index,row ->
            val date=LocalDate.parse(row.utcDay)
            require(date.toEpochDay().toInt()+40587==row.mjd)
            require(row.dut1Seconds.isFinite()&&kotlin.math.abs(row.dut1Seconds)<=1.0)
            require(row.uncertaintySeconds.isFinite()&&row.uncertaintySeconds in 0.0..1.0)
            if(index>0)require(samples[index-1].mjd+1==row.mjd)
        }
    }
    val validFromUTC:String get()=samples.first().utcDay+"T00:00:00Z"
    val validThroughUTC:String get()=samples.last().utcDay+"T00:00:00Z"
}
data class NativeWorldLabTimeScaleReading(
    val utc:String,val tai:String,val tt:String,val ut1:String?,
    val taiMinusUtcSeconds:Int,val ttMinusUtcSeconds:Double,
    val dut1Seconds:Double?,val ut1UncertaintySeconds:Double?,
    val quality:NativeWorldLabEarthOrientationQuality?,
    val source:String,val bulletin:String?,val issuedDateUTC:String?
)
object NativeWorldLabTimeScales {
    private val leapRows=listOf(
        "1972-01-01" to 10,"1972-07-01" to 11,"1973-01-01" to 12,
        "1974-01-01" to 13,"1975-01-01" to 14,"1976-01-01" to 15,
        "1977-01-01" to 16,"1978-01-01" to 17,"1979-01-01" to 18,
        "1980-01-01" to 19,"1981-07-01" to 20,"1982-07-01" to 21,
        "1983-07-01" to 22,"1985-07-01" to 23,"1988-01-01" to 24,
        "1990-01-01" to 25,"1991-01-01" to 26,"1992-07-01" to 27,
        "1993-07-01" to 28,"1994-07-01" to 29,"1996-01-01" to 30,
        "1997-07-01" to 31,"1999-01-01" to 32,"2006-01-01" to 33,
        "2009-01-01" to 34,"2012-07-01" to 35,"2015-07-01" to 36,
        "2017-01-01" to 37
    )
    const val LEAP_SOURCE="USNO/IERS tai-utc.dat"
    const val LEAP_VALID_THROUGH_UTC="2027-01-01T00:00:00Z"
    private fun parseUtc(value:String):Instant {
        require(value.endsWith("Z")){"Time-scale input must be an explicit UTC timestamp ending in Z."}
        return runCatching{Instant.parse(value)}.getOrElse {
            throw IllegalArgumentException("Time-scale input is not a valid UTC timestamp.")
        }
    }
    private fun offsetAt(instant:Instant):Int {
        require(!instant.isBefore(Instant.parse("1972-01-01T00:00:00Z"))&&
            !instant.isAfter(Instant.parse(LEAP_VALID_THROUGH_UTC))){
            "TAI−UTC is not certified by the bundled IERS leap-second data for this date."
        }
        return leapRows.lastOrNull{!instant.isBefore(Instant.parse(it.first+"T00:00:00Z"))}?.second
            ?:throw IllegalArgumentException("No authoritative TAI−UTC offset is available for this date.")
    }
    fun utcToTaiTt(utc:String):Pair<String,String> {
        val value=parseUtc(utc);val offset=offsetAt(value)
        return (value.plusSeconds(offset.toLong()).toString()+" TAI") to
            (value.plusNanos(((offset+32.184)*1e9).toLong()).toString()+" TT")
    }
    fun parseBulletinA(raw:String):NativeWorldLabEarthOrientationSeries {
        require(raw.length in 100..2_000_000&&Regex("(?i)I\\s*E\\s*R\\s*S\\s+B\\s*U\\s*L\\s*L\\s*E\\s*T\\s*I\\s*N\\s*[-–]\\s*A").containsMatchIn(raw)){
            "Import must be the official plain-text IERS Bulletin A product (ser7.dat)."
        }
        val header=Regex("(?i)(\\d{1,2})\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{4})\\s+Vol\\.\\s+([IVXLCDM]+)\\s+No\\.?\\s*(\\d+)").find(raw)
            ?:throw IllegalArgumentException("IERS Bulletin A issue date and number could not be identified.")
        val issueDate=LocalDate.of(header.groupValues[4].toInt(),
            listOf("January","February","March","April","May","June","July","August","September","October","November","December")
                .indexOfFirst{it.equals(header.groupValues[2],true)}+1,header.groupValues[1].toInt())
        var combined=false;var predictions=false
        var algorithm="IERS Rapid Service/Prediction Centre source-defined algorithm"
        val rows=mutableListOf<NativeWorldLabEarthOrientationSample>()
        raw.lineSequence().forEach { line->
            if(line.contains("COMBINED EARTH ORIENTATION PARAMETERS",true))combined=true
            if(line.trim().startsWith("PREDICTIONS:",true))predictions=true
            if(line.contains("Kalman smoother and weighted cubic spline",true))
                algorithm="IERS Rapid Service Kalman smoother and weighted cubic spline"
            if(!combined)return@forEach
            val t=line.trim().split(Regex("\\s+"))
            if(!predictions&&t.size>=10&&t[0].matches(Regex("\\d{2}"))&&
                t[1].matches(Regex("\\d{1,2}"))&&t[2].matches(Regex("\\d{1,2}"))&&t[3].matches(Regex("\\d{5}"))){
                val short=t[0].toInt();val year=if(short<50)2000+short else 1900+short
                val date=LocalDate.of(year,t[1].toInt(),t[2].toInt())
                rows.add(NativeWorldLabEarthOrientationSample(date.toString(),t[3].toInt(),
                    t[8].toDouble(),t[9].toDouble(),NativeWorldLabEarthOrientationQuality.OBSERVED))
            }else if(predictions&&t.size>=7&&t[0].matches(Regex("\\d{4}"))&&
                t[1].matches(Regex("\\d{1,2}"))&&t[2].matches(Regex("\\d{1,2}"))&&t[3].matches(Regex("\\d{5}"))){
                val date=LocalDate.of(t[0].toInt(),t[1].toInt(),t[2].toInt())
                val mjd=t[3].toInt()
                val sigma=0.00025*(mjd-61342).toDouble().pow(0.75)
                rows.add(NativeWorldLabEarthOrientationSample(date.toString(),mjd,
                    t[6].toDouble(),sigma,NativeWorldLabEarthOrientationQuality.PREDICTED))
            }
        }
        require(rows.any{it.quality==NativeWorldLabEarthOrientationQuality.OBSERVED}&&
            rows.any{it.quality==NativeWorldLabEarthOrientationQuality.PREDICTED}){
            "Bulletin A must include both rapid-service observations and prediction rows."
        }
        return NativeWorldLabEarthOrientationSeries(volume=header.groupValues[4],
            number=header.groupValues[5].toInt(),issuedDateUTC=issueDate.toString(),
            algorithm=algorithm,samples=rows)
    }
    fun utcToUt1(utc:String,series:NativeWorldLabEarthOrientationSeries):NativeWorldLabTimeScaleReading {
        series.validate()
        val instant=parseUtc(utc)
        val first=Instant.parse(series.validFromUTC);val last=Instant.parse(series.validThroughUTC)
        require(!instant.isBefore(first)&&!instant.isAfter(last)){
            "UT1−UTC is unavailable outside the imported IERS Bulletin A coverage."
        }
        var index=0
        while(index<series.samples.lastIndex&&
            !Instant.parse(series.samples[index+1].utcDay+"T00:00:00Z").isAfter(instant))index++
        val left=series.samples[index]
        if(index==series.samples.lastIndex){
            require(instant==last){"An adjacent IERS sample is required to interpolate UT1−UTC."}
            val offset=offsetAt(instant)
            return NativeWorldLabTimeScaleReading(instant.toString(),(instant.plusSeconds(offset.toLong()).toString()+" TAI"),
                (instant.plusNanos(((offset+32.184)*1e9).toLong()).toString()+" TT"),
                (instant.plusNanos((left.dut1Seconds*1e9).toLong()).toString()+" UT1"),
                offset,offset+32.184,left.dut1Seconds,left.uncertaintySeconds,left.quality,
                LEAP_SOURCE,"Volume ${series.volume} No. ${series.number}",series.issuedDateUTC)
        }
        val right=series.samples[index+1]
        val from=Instant.parse(left.utcDay+"T00:00:00Z")
        val fraction=(instant.toEpochMilli()-from.toEpochMilli())/86_400_000.0
        require(fraction in 0.0..1.0){"IERS interpolation interval is invalid."}
        val dut1=left.dut1Seconds+(right.dut1Seconds-left.dut1Seconds)*fraction
        val sigma=sqrt((1-fraction).pow(2)*left.uncertaintySeconds.pow(2)+
            fraction.pow(2)*right.uncertaintySeconds.pow(2))
        val quality=if(left.quality==NativeWorldLabEarthOrientationQuality.PREDICTED||
            right.quality==NativeWorldLabEarthOrientationQuality.PREDICTED)
            NativeWorldLabEarthOrientationQuality.PREDICTED else NativeWorldLabEarthOrientationQuality.OBSERVED
        val offset=offsetAt(instant)
        return NativeWorldLabTimeScaleReading(instant.toString(),
            instant.plusSeconds(offset.toLong()).toString()+" TAI",
            instant.plusNanos(((offset+32.184)*1e9).toLong()).toString()+" TT",
            instant.plusNanos((dut1*1e9).toLong()).toString()+" UT1",
            offset,offset+32.184,dut1,sigma,quality,LEAP_SOURCE,
            "Volume ${series.volume} No. ${series.number}",series.issuedDateUTC)
    }
}
