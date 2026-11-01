package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabRecordedTimeTest {
 private fun run()=NativeWorldLabRecordedRun(
  runId="run-1",modelId="spring",modelVersion="2.1.0",
  worldEpochUTC="2026-11-01T00:00:00Z",
  sampleTimesSeconds=listOf(0.0,0.1,0.2,0.3,0.4,0.5),
  mandatoryEventTimesSeconds=listOf(0.2,0.4))
 private fun state()=NativeWorldLabRecordedTime.start(run(),
  "2026-11-01T12:00:00Z","Africa/Lagos")

 @Test fun pauseAdvancesWallClockButNotSimulationOrWorldDate(){
  val initial=state()
  val paused=NativeWorldLabRecordedTime.advance(run(),initial,2.0,paused=true)
  assertEquals(initial.simulationTimeSeconds,paused.simulationTimeSeconds,0.0)
  assertEquals(initial.worldDateUTC,paused.worldDateUTC)
  assertEquals("2026-11-01T12:00:02Z",paused.wallTimeUTC)
 }
 @Test fun playbackHonorsRatesAndStopsAtMandatoryEventsInBothDirections(){
  val atStart=state().copy(paused=false,playbackRate=10.0)
  val forward=NativeWorldLabRecordedTime.advance(run(),atStart,0.05)
  assertEquals(0.2,forward.simulationTimeSeconds,1e-9)
  val backward=NativeWorldLabRecordedTime.advance(run(),forward.copy(
   direction="reverse-recording",playbackRate=10.0),0.05)
  assertEquals(0.0,backward.simulationTimeSeconds,1e-9)
  assertEquals("recorded-sample-playback",backward.fidelity)
 }
 @Test fun stepAndSeekSelectExactRecordedSamplesAndPause(){
  val stepped=NativeWorldLabRecordedTime.step(run(),state(),1)
  assertEquals(1,stepped.sampleIndex);assertEquals(0.1,stepped.simulationTimeSeconds,0.0)
  val sought=NativeWorldLabRecordedTime.seek(run(),stepped,0.39)
  assertEquals(4,sought.sampleIndex);assertEquals(0.4,sought.displaySampleTimeSeconds,0.0)
  assertTrue(sought.paused)
 }
 @Test fun checkpointRestoresOnlyTheMatchingImmutableRunAndExactSample(){
  val checkpoint=NativeWorldLabRecordedTime.checkpoint(run(),state().let{
   NativeWorldLabRecordedTime.seek(run(),it,0.3)
  })
  val restored=NativeWorldLabRecordedTime.restore(run(),checkpoint)
  assertEquals(3,restored.sampleIndex);assertTrue(restored.paused)
  val wrongRun=run().copy(runId="different")
  assertThrows(IllegalArgumentException::class.java){
   NativeWorldLabRecordedTime.restore(wrongRun,checkpoint)
  }
  val forged=checkpoint.copy(sampleIndex=1,sampleTimeSeconds=0.1)
  assertThrows(IllegalArgumentException::class.java){
   NativeWorldLabRecordedTime.restore(run(),forged)
  }
 }
 @Test fun malformedSampleAxesAndEventsAreRejected(){
  assertThrows(IllegalArgumentException::class.java){
   run().copy(sampleTimesSeconds=listOf(0.0,0.2,0.2)).validate()
  }
  assertThrows(IllegalArgumentException::class.java){
   run().copy(mandatoryEventTimesSeconds=listOf(0.25)).validate()
  }
  assertThrows(IllegalArgumentException::class.java){
   NativeWorldLabRecordedTime.advance(run(),state(),Double.NaN)
  }
 }
}

 @Test fun checkpointJsonRoundTripsAndRejectsUnknownOrOversizedFields(){
  val run=run()
  val state=NativeWorldLabRecordedTime.seek(run,state(),0.3)
  val checkpoint=NativeWorldLabRecordedTime.checkpoint(run,state)
  val json=NativeWorldLabRecordedCheckpointCodec.encode(checkpoint,run)
  val decoded=NativeWorldLabRecordedCheckpointCodec.decode(json,run)
  assertEquals(checkpoint,decoded)
  assertThrows(IllegalArgumentException::class.java){
   NativeWorldLabRecordedCheckpointCodec.decode(json.replace("\\"sampleIndex\\"","\\"unexpected\\""),run)
  }
  assertThrows(IllegalArgumentException::class.java){
   NativeWorldLabRecordedCheckpointCodec.decode(" ".repeat(16*1024+1),run)
  }
 }
