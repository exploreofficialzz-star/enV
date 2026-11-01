package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

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
