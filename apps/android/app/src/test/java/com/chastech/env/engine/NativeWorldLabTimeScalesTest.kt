package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.pow
import kotlin.math.pow

class NativeWorldLabTimeScalesTest {
    private val bulletin="""I E R S   B U L L E T I N - A
29 October 2026                                     Vol. XXXIX No. 044
COMBINED EARTH ORIENTATION PARAMETERS:
26 10 28  61341 0.14424 .00004 0.31844 .00004 -0.051795 0.000011
26 10 29  61342 0.14284 .00004 0.31828 .00004 -0.052612 0.000014
PREDICTIONS:
2026 10 30 61343 0.1414 0.3181 -0.05324
2026 10 31 61344 0.1401 0.3179 -0.05383
2026 11  1 61345 0.1388 0.3179 -0.05453
2026 11  2 61346 0.1375 0.3180 -0.05542
"""
    @Test fun parseRetainsDatedObservedAndPredictedSamples(){
        val s=NativeWorldLabTimeScales.parseBulletinA(bulletin)
        assertEquals("XXXIX",s.volume);assertEquals(44,s.number)
        assertEquals("2026-10-29",s.issuedDateUTC);assertEquals(6,s.samples.size)
        assertEquals(NativeWorldLabEarthOrientationQuality.OBSERVED,s.samples[0].quality)
        assertEquals(NativeWorldLabEarthOrientationQuality.PREDICTED,s.samples[2].quality)
    }
    @Test fun taiTtAndUt1RetainOfficialOffsetsAndUncertainty(){
        val taiTt=NativeWorldLabTimeScales.utcToTaiTt("2026-11-01T12:00:00Z")
        assertTrue(taiTt.first.endsWith(" TAI"));assertTrue(taiTt.second.endsWith(" TT"))
        val reading=NativeWorldLabTimeScales.utcToUt1("2026-11-01T12:00:00Z",
            NativeWorldLabTimeScales.parseBulletinA(bulletin))
        assertEquals(-0.054975,reading.dut1Seconds!!,1e-9)
        assertEquals(NativeWorldLabEarthOrientationQuality.PREDICTED,reading.quality)
        assertTrue(reading.ut1UncertaintySeconds!!>0)
        assertTrue(reading.bulletin!!.contains("No. 44"))
    }
    @Test fun predictionUncertaintyStartsAtTheFinalObservedMjd(){
        val shifted=bulletin
            .replace("29 October 2026","29 October 2027")
            .replace("26 10 28  61341","27 10 28  61706")
            .replace("26 10 29  61342","27 10 29  61707")
            .replace("2026 10 30 61343","2027 10 30 61708")
            .replace("2026 10 31 61344","2027 10 31 61709")
            .replace("2026 11  1 61345","2027 11  1 61710")
            .replace("2026 11  2 61346","2027 11  2 61711")
        val parsed=NativeWorldLabTimeScales.parseBulletinA(shifted)
        assertEquals(0.00025,parsed.samples[2].uncertaintySeconds,1e-15)
        assertEquals(0.00025*2.0.pow(0.75),parsed.samples[3].uncertaintySeconds,1e-15)
    }
    @Test fun iauCoordinateTimeTransformsRoundTripAcrossGeologicalRanges(){
        val reference=NativeWorldLabTimeScales.IAU_REFERENCE_MJD
        assertEquals(reference,NativeWorldLabTimeScales.ttMjdToTcgMjd(reference),0.0)
        assertEquals(reference,NativeWorldLabTimeScales.tcgMjdToTtMjd(reference),0.0)
        assertEquals(reference+1.0/(1.0-NativeWorldLabTimeScales.IAU_LG),
            NativeWorldLabTimeScales.ttMjdToTcgMjd(reference+1.0),1e-11)
        assertEquals(reference+NativeWorldLabTimeScales.IAU_TDB0_SECONDS/86400.0,
            NativeWorldLabTimeScales.tcbMjdToTdbMjd(reference),1e-11)
        listOf(-1_000_000.0,reference,1_000_000.0,100_000_000.0).forEach { value ->
            assertEquals(value,NativeWorldLabTimeScales.tcgMjdToTtMjd(
                NativeWorldLabTimeScales.ttMjdToTcgMjd(value)),2e-8)
            assertEquals(value,NativeWorldLabTimeScales.tdbMjdToTcbMjd(
                NativeWorldLabTimeScales.tcbMjdToTdbMjd(value)),2e-8)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabTimeScales.ttMjdToTcgMjd(Double.NaN)
        }
    }
    @Test fun utcToTcgUsesCertifiedTtInputAndIauRate(){
        val result=NativeWorldLabTimeScales.utcToTcg("2026-11-01T12:00:00Z")
        assertEquals("IAU 2000 Resolution B1.9",result.source)
        assertTrue(result.tcgMjd>result.ttMjd)
        val expectedDeltaSeconds=(result.ttMjd-NativeWorldLabTimeScales.IAU_REFERENCE_MJD)*
            NativeWorldLabTimeScales.IAU_LG/(1.0-NativeWorldLabTimeScales.IAU_LG)*86400.0
        assertEquals(expectedDeltaSeconds,(result.tcgMjd-result.ttMjd)*86400.0,1e-8)
        assertTrue(expectedDeltaSeconds>1.0)
    }
    @Test fun conversionsFailClosedOutsideDataValidity(){
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabTimeScales.utcToTaiTt("2027-01-02T00:00:00Z")
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabTimeScales.utcToUt1("2026-11-10T00:00:00Z",
                NativeWorldLabTimeScales.parseBulletinA(bulletin))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabTimeScales.parseBulletinA("not IERS")
        }
    }
}
