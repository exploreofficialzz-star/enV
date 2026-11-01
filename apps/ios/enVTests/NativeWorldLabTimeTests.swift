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
