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
   "2026-11-01T12:00:05Z","2020-01-01T00:00:00Z",2.5,2.5,10.0,"reverse-recording","Africa/Lagos",0.0025)
  val json=NativeWorldLabDemoCheckpointCodec.encode(v)
  assertTrue(json.contains("\"schemaVersion\": 3"))
  val restored=NativeWorldLabDemoCheckpointCodec.decode(json)
  assertEquals(v,restored)
  assertEquals(0.0025,restored.solverStepSeconds!!,0.0)
  assertEquals("2020-01-01T00:00:00Z",restored.worldEpochUTC)
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
  val wrongVersion=org.json.JSONObject(valid).put("schemaVersion",9).toString()
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(wrongVersion)}
  val changedTime=org.json.JSONObject(valid).put("timeSeconds",999.0).toString()
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(changedTime)}
  val unknownField=org.json.JSONObject(valid).put("code","unsafe").toString()
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(unknownField)}
 }
 @Test fun versionTwoClockCheckpointRemainsReadableWithoutSolverStep(){
  val json="""{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":2,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":2.0,"massKg":1.0,"springNPerM":4.0,"resistanceOhm":1000.0,"diffusivityM2PerS":0.02,"wallTimeUTC":"2026-11-01T12:00:00Z","worldEpochUTC":"2020-01-01T00:00:00Z","solverInternalTimeSeconds":2.0,"displaySampleTimeSeconds":2.0,"playbackRate":1.0,"playbackDirection":"forward","timezoneDisplay":"UTC"}"""
  val v=NativeWorldLabDemoCheckpointCodec.decode(json)
  assertEquals(2.0,v.timeSeconds,0.0);assertNull(v.solverStepSeconds)
 }
}
