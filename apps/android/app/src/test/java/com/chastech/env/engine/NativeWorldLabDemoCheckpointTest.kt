package com.chastech.env.engine
import org.junit.Assert.*
import org.junit.Test
class NativeWorldLabDemoCheckpointTest {
 @Test fun roundTripPreservesModelInputsAndTime(){
  val v=NativeWorldLabDemoCheckpoint("spring",4.5,2.0,8.0,2200.0,0.03)
  assertEquals(v,NativeWorldLabDemoCheckpointCodec.decode(NativeWorldLabDemoCheckpointCodec.encode(v)))
 }
 @Test fun versionTwoRoundTripPreservesIndependentClockFields(){
  val v=NativeWorldLabDemoCheckpoint("heat",2.5,1.0,4.0,1000.0,0.02,
   "2026-11-01T12:00:05Z","2020-01-01T00:00:00Z",2.5,2.5,10.0,"reverse-recording","Africa/Lagos")
  val json=NativeWorldLabDemoCheckpointCodec.encode(v)
  assertTrue(json.contains("\"schemaVersion\": 2"))
  assertEquals(v,NativeWorldLabDemoCheckpointCodec.decode(json))
 }
 @Test fun legacyVersionOneCheckpointRemainsReadable(){
  val json="""{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":1,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":4.5,"massKg":2.0,"springNPerM":8.0,"resistanceOhm":2200.0,"diffusivityM2PerS":0.03}"""
  val v=NativeWorldLabDemoCheckpointCodec.decode(json)
  assertEquals(4.5,v.timeSeconds,0.0);assertNull(v.wallTimeUTC)
 }
 @Test fun rejectsIncompleteInvalidOrNonUtcClockFields(){
  val v=NativeWorldLabDemoCheckpoint("spring",2.0,1.0,4.0,1000.0,0.02,"bad",
   "2020-01-01T00:00:00Z",2.0,2.0,1.0,"forward","UTC")
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.encode(v)}
  val zone=NativeWorldLabDemoCheckpoint("spring",2.0,1.0,4.0,1000.0,0.02,
   "2026-11-01T12:00:00Z","2020-01-01T00:00:00Z",2.0,2.0,1.0,"forward","Bad/Zone")
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.encode(zone)}
 }
 @Test fun rejectsWrongVersionTamperingAndUnknownFields(){
  val valid=NativeWorldLabDemoCheckpointCodec.encode(NativeWorldLabDemoCheckpoint("heat",2.0,1.0,4.0,1000.0,0.02))
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.replace("\"schemaVersion\": 1","\"schemaVersion\": 9"))}
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.replace("\"timeSeconds\": 2.0","\"timeSeconds\": 999.0"))}
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.dropLast(1)+",\"code\":\"unsafe\"}")}
 }
}
