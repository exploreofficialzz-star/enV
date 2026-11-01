package com.chastech.env.engine
import org.junit.Assert.*
import org.junit.Test
class NativeWorldLabDemoCheckpointTest {
 @Test fun roundTripPreservesModelInputsAndTime(){
  val value=NativeWorldLabDemoCheckpoint("spring",4.5,2.0,8.0,2200.0,0.03)
  val decoded=NativeWorldLabDemoCheckpointCodec.decode(NativeWorldLabDemoCheckpointCodec.encode(value))
  assertEquals(value,decoded)
 }
 @Test fun rejectsWrongVersionTamperingAndUnknownFields(){
  val valid=NativeWorldLabDemoCheckpointCodec.encode(NativeWorldLabDemoCheckpoint("heat",2.0,1.0,4.0,1000.0,0.02))
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.replace("\"schemaVersion\": 1","\"schemaVersion\": 9"))}
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.replace("\"timeSeconds\": 2.0","\"timeSeconds\": 999.0"))}
  assertThrows(IllegalArgumentException::class.java){NativeWorldLabDemoCheckpointCodec.decode(valid.dropLast(1)+",\"code\":\"unsafe\"}")}
 }
}
