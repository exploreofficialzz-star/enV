package com.chastech.env.engine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
class NativeWorldLabTimeTest{
 @Test fun playbackStopsAtRecordedImpactEvents(){
  assertEquals(1.0,nextWorldLabEventTime(0.0,0.5,10.0,5.0,listOf(1.0,2.0)),0.0)
  assertEquals(2.0,nextWorldLabEventTime(1.0,0.5,10.0,5.0,listOf(1.0,2.0)),0.0)
  assertEquals(2.1,nextWorldLabEventTime(2.0,0.1,1.0,5.0,listOf(1.0,2.0)),1e-12)
 }
 @Test fun reversePlaybackStopsAtPreviousRecordedEvent(){
  assertEquals(2.0,previousWorldLabEventTime(3.0,0.5,4.0,5.0,listOf(1.0,2.0)),0.0)
  assertEquals(1.0,advanceWorldLabEventTime(2.0,0.5,4.0,5.0,listOf(1.0,2.0),reverse=true),0.0)
  assertEquals(0.5,previousWorldLabEventTime(1.0,0.5,1.0,5.0,listOf(1.0,2.0)),1e-12)
 }
 @Test fun invalidEventBoundariesAreRejectedInBothDirections(){
  assertThrows(IllegalArgumentException::class.java){
   nextWorldLabEventTime(0.0,0.1,1.0,5.0,listOf(Double.NaN))
  }
  assertThrows(IllegalArgumentException::class.java){
   previousWorldLabEventTime(1.0,0.1,1.0,5.0,listOf(6.0))
  }
 }
}