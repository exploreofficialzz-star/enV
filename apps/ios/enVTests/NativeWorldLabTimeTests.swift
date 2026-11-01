import XCTest
@testable import enV
final class NativeWorldLabTimeCheckpointTests:XCTestCase {
 func testCheckpointRoundTripPreservesModeAndInputs()throws {
  let c=try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:4.5,
   massKg:2,springNPerM:8,resistanceOhm:2200,diffusivityM2PerS:0.03)
  let restored=try NativeWorldLabDemoCheckpoint.decodeBounded(c.encodeBounded())
  XCTAssertEqual(restored,c)
  XCTAssertNil(restored.solverStepSeconds)
 }
 func testVersionTwoClockRoundTripPreservesUTCAndPlaybackState()throws {
  let c=try NativeWorldLabDemoCheckpoint.make(modelId:"heat",timeSeconds:2.5,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,
   wallTimeUTC:"2026-11-01T12:00:05Z",worldEpochUTC:"2020-01-01T00:00:00Z",
   solverInternalTimeSeconds:2.5,displaySampleTimeSeconds:2.5,
   playbackRate:10,playbackDirection:"reverse-recording",timezoneDisplay:"Africa/Lagos",solverStepSeconds:0.0025)
  XCTAssertEqual(c.schemaVersion,3)
  let restored=try NativeWorldLabDemoCheckpoint.decodeBounded(c.encodeBounded())
  XCTAssertEqual(restored,c)
  XCTAssertEqual(restored.solverStepSeconds,0.0025)
 }
 func testVersionOneCheckpointStillDecodes()throws {
  let legacy=#"{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":1,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":4.5,"massKg":2.0,"springNPerM":8.0,"resistanceOhm":2200.0,"diffusivityM2PerS":0.03}"#
  let decoded=try NativeWorldLabDemoCheckpoint.decodeBounded(Data(legacy.utf8))
  XCTAssertEqual(decoded.timeSeconds,4.5);XCTAssertNil(decoded.wallTimeUTC)
 }
 func testClockCheckpointRejectsInvalidOrPartialData()throws {
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:2,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,wallTimeUTC:"bad"))
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:2,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02,
   wallTimeUTC:"2026-11-01T12:00:00Z",worldEpochUTC:"2020-01-01T00:00:00Z",
   solverInternalTimeSeconds:2,displaySampleTimeSeconds:2,playbackRate:0,
   playbackDirection:"forward",timezoneDisplay:"UTC"))
 }
 func testCheckpointRejectsUnsupportedModelsAndOutOfRangeTime()throws {
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"unknown",timeSeconds:0,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02))
  XCTAssertThrowsError(try NativeWorldLabDemoCheckpoint.make(modelId:"heat",timeSeconds:13,
   massKg:1,springNPerM:4,resistanceOhm:1000,diffusivityM2PerS:0.02))
 }
 func testPlaybackStopsAtEveryScheduledEvent() {
  XCTAssertEqual(NativeWorldLabTime.next(current:0,elapsed:0.5,rate:10,duration:5,events:[1,2]),1,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.next(current:1,elapsed:0.5,rate:10,duration:5,events:[1,2]),2,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.next(current:2,elapsed:0.1,rate:1,duration:5,events:[1,2]),2.1,accuracy:1e-12)
 }
 func testReversePlaybackStopsAtThePreviousRecordedEvent() {
  XCTAssertEqual(NativeWorldLabTime.previous(current:3,elapsed:0.5,rate:4,
      duration:5,events:[1,2]),2,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.advance(current:2,elapsed:0.5,rate:4,
      duration:5,events:[1,2],reverse:true),1,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.previous(current:1,elapsed:0.5,rate:1,
      duration:5,events:[1,2]),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.advance(current:1,elapsed:0.5,rate:1,
      duration:5,events:[Double.nan,6],reverse:true),0.5,accuracy:1e-12)
 }
 func testPreviousAndNextContactNavigationIsBoundedAndSorted() {
  let events=[0.8,0.2,0.5,0.5,Double.nan,-1,4]
  XCTAssertEqual(NativeWorldLabTime.previousEvent(current:0,duration:3,events:events),0,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.previousEvent(current:0.7,duration:3,events:events),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.nextEvent(current:0.2,duration:3,events:events),0.5,accuracy:1e-12)
  XCTAssertEqual(NativeWorldLabTime.nextEvent(current:0.8,duration:3,events:events),3,accuracy:1e-12)
 }
 func testVersionTwoClockCheckpointRemainsReadableWithoutSolverStep()throws {
  let json=#"{"format":"env-world-lab-native-demo-checkpoint","schemaVersion":2,"modelVersion":"1.0.0","modelId":"spring","timeSeconds":2.0,"massKg":1.0,"springNPerM":4.0,"resistanceOhm":1000.0,"diffusivityM2PerS":0.02,"wallTimeUTC":"2026-11-01T12:00:00Z","worldEpochUTC":"2020-01-01T00:00:00Z","solverInternalTimeSeconds":2.0,"displaySampleTimeSeconds":2.0,"playbackRate":1.0,"playbackDirection":"forward","timezoneDisplay":"UTC"}"#
  let v=try NativeWorldLabDemoCheckpoint.decodeBounded(Data(json.utf8))
  XCTAssertEqual(v.schemaVersion,2);XCTAssertNil(v.solverStepSeconds)
 }
}


final class NativeWorldLabRecordedTimeTests:XCTestCase {
    private func run()->NativeWorldLabRecordedRun {
        NativeWorldLabRecordedRun(runId:"run-1",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleTimesSeconds:[0,0.1,0.2,0.3,0.4,0.5],
            mandatoryEventTimesSeconds:[0.2,0.4])
    }
    private func state()throws->NativeWorldLabRecordedClock {
        try NativeWorldLabRecordedTime.start(run:run(),
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
    }
    func testPauseAdvancesWallClockWithoutAdvancingSimulationOrWorldDate()throws {
        let initial=try state()
        let paused=try NativeWorldLabRecordedTime.advance(run:run(),state:initial,
            elapsedSeconds:2,paused:true)
        XCTAssertEqual(paused.simulationTimeSeconds,initial.simulationTimeSeconds,accuracy:0)
        XCTAssertEqual(paused.worldDateUTC,initial.worldDateUTC)
        XCTAssertEqual(ISO8601DateFormatter().date(from:paused.wallTimeUTC)?.timeIntervalSince1970 ?? 0,
            ISO8601DateFormatter().date(from:initial.wallTimeUTC)!.timeIntervalSince1970+2,accuracy:0.001)
    }
    func testPlaybackRespectsRateMandatoryEventsAndCachedReverse()throws {
        let initial=try state()
        let forward=try NativeWorldLabRecordedTime.advance(run:run(),
            state:NativeWorldLabRecordedClock(wallTimeUTC:initial.wallTimeUTC,
                worldDateUTC:initial.worldDateUTC,simulationTimeSeconds:0,
                solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0,sampleIndex:0,
                playbackRate:10,direction:"forward",paused:false,timezoneDisplay:"Africa/Lagos",
                fidelity:"recorded-sample-playback"),elapsedSeconds:0.05)
        XCTAssertEqual(forward.simulationTimeSeconds,0.2,accuracy:1e-9)
        let reverseState=NativeWorldLabRecordedClock(wallTimeUTC:forward.wallTimeUTC,
            worldDateUTC:forward.worldDateUTC,simulationTimeSeconds:0.2,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0.2,sampleIndex:2,
            playbackRate:10,direction:"reverse-recording",paused:false,
            timezoneDisplay:"Africa/Lagos",fidelity:"recorded-sample-playback")
        let reverse=try NativeWorldLabRecordedTime.advance(run:run(),state:reverseState,elapsedSeconds:0.05)
        XCTAssertEqual(reverse.simulationTimeSeconds,0,accuracy:1e-9)
    }
    func testSeekAndStepSelectExactRecordedSamplesAndPause()throws {
        let initial=try state()
        let step=try NativeWorldLabRecordedTime.step(run:run(),state:initial,direction:1)
        XCTAssertEqual(step.sampleIndex,1);XCTAssertEqual(step.simulationTimeSeconds,0.1,accuracy:0)
        let seek=try NativeWorldLabRecordedTime.seek(run:run(),state:step,timeSeconds:0.39)
        XCTAssertEqual(seek.sampleIndex,4);XCTAssertEqual(seek.displaySampleTimeSeconds,0.4,accuracy:0)
        XCTAssertTrue(seek.paused)
    }
    func testCheckpointIsBoundToRunVersionEpochAndExactSample()throws {
        let selected=try NativeWorldLabRecordedTime.seek(run:run(),state:state(),timeSeconds:0.3)
        let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:run(),state:selected)
        let bytes=try checkpoint.encodeBounded()
        let decoded=try NativeWorldLabRecordedCheckpoint.decodeBounded(bytes)
        let restored=try NativeWorldLabRecordedTime.restore(run:run(),checkpoint:decoded)
        XCTAssertEqual(restored.sampleIndex,3);XCTAssertTrue(restored.paused)
        let other=NativeWorldLabRecordedRun(runId:"other",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:run().sampleTimesSeconds,
            mandatoryEventTimesSeconds:run().mandatoryEventTimesSeconds)
        XCTAssertThrowsError(try NativeWorldLabRecordedTime.restore(run:other,checkpoint:decoded))
        let forged=NativeWorldLabRecordedCheckpoint(runId:"run-1",modelId:"spring",
            modelVersion:"2.1.0",worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleIndex:1,sampleTimeSeconds:0.1,clock:selected)
        XCTAssertThrowsError(try NativeWorldLabRecordedTime.restore(run:run(),checkpoint:forged))
    }
    func testInvalidTimelineAxesAndEventTimesAreRejected() {
        let duplicate=NativeWorldLabRecordedRun(runId:"bad",modelId:"spring",modelVersion:"1",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:[0,0.1,0.1])
        XCTAssertThrowsError(try duplicate.validate())
        let event=NativeWorldLabRecordedRun(runId:"bad",modelId:"spring",modelVersion:"1",
            worldEpochUTC:"2026-11-01T00:00:00Z",sampleTimesSeconds:[0,0.1,0.2],
            mandatoryEventTimesSeconds:[0.25])
        XCTAssertThrowsError(try event.validate())
    }
}

final class NativeWorldLabRecordedEventBoundaryTests:XCTestCase {
    private func run()->NativeWorldLabRecordedRun {
        NativeWorldLabRecordedRun(runId:"run-1",modelId:"spring",modelVersion:"2.1.0",
            worldEpochUTC:"2026-11-01T00:00:00Z",
            sampleTimesSeconds:[0,0.1,0.2,0.3,0.4,0.5])
    }
    func testMandatoryEventBetweenSamplesStopsAtExactSimulationTime()throws {
        let base=run()
        let recording=NativeWorldLabRecordedRun(runId:base.runId,modelId:base.modelId,
            modelVersion:base.modelVersion,worldEpochUTC:base.worldEpochUTC,
            sampleTimesSeconds:base.sampleTimesSeconds,mandatoryEventTimesSeconds:[0.15])
        let initial=try NativeWorldLabRecordedTime.start(run:recording,
            wallTimeUTC:"2026-11-01T12:00:00Z",timezoneDisplay:"Africa/Lagos")
        let running=NativeWorldLabRecordedClock(wallTimeUTC:initial.wallTimeUTC,
            worldDateUTC:initial.worldDateUTC,simulationTimeSeconds:0,
            solverInternalTimeSeconds:nil,displaySampleTimeSeconds:0,sampleIndex:0,
            playbackRate:10,direction:"forward",paused:false,
            timezoneDisplay:"Africa/Lagos",fidelity:"recorded-sample-playback")
        let stopped=try NativeWorldLabRecordedTime.advance(run:recording,state:running,
            elapsedSeconds:0.05,paused:false)
        XCTAssertEqual(stopped.simulationTimeSeconds,0.15,accuracy:1e-9)
        let checkpoint=try NativeWorldLabRecordedTime.checkpoint(run:recording,state:stopped)
        XCTAssertEqual(try NativeWorldLabRecordedTime.restore(run:recording,checkpoint:checkpoint)
            .simulationTimeSeconds,0.15,accuracy:1e-9)
    }
}
