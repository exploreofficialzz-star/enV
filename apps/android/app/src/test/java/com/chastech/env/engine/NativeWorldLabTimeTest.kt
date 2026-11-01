package com.chastech.env.engine
import org.junit.Assert.assertEquals
import org.junit.Test
class NativeWorldLabTimeTest{
 @Test fun playbackStopsAtRecordedImpactEvents(){assertEquals(1.0,nextWorldLabEventTime(0.0,0.5,10.0,5.0,listOf(1.0,2.0)),0.0);assertEquals(2.0,nextWorldLabEventTime(1.0,0.5,10.0,5.0,listOf(1.0,2.0)),0.0);assertEquals(2.1,nextWorldLabEventTime(2.0,0.1,1.0,5.0,listOf(1.0,2.0)),1e-12)}
}