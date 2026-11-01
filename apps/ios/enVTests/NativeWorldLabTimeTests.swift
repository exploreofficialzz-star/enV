import XCTest
@testable import enV
final class NativeWorldLabTimeCheckpointTests:XCTestCase {
 func testCheckpointRoundTripPreservesModeAndInputs()throws {
  let c=try NativeWorldLabDemoCheckpoint.make(modelId:"spring",timeSeconds:4.5,
   massKg:2,springNPerM:8,resistanceOhm:2200,diffusivityM2PerS:0.03)
  XCTAssertEqual(try NativeWorldLabDemoCheckpoint.decodeBounded(c.encodeBounded()),c)
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
}
