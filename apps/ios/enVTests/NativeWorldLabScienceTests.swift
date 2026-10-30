import XCTest
@testable import enV

final class NativeWorldLabScienceTests:XCTestCase {
    func testSpringMatchesAnalyticUndampedReference() throws {
        let r=try NativeWorldLabScience.evaluate(.spring(
            massKg:1,springNPerM:4,dampingNsPerM:0,x0:1),atSeconds:1)
        XCTAssertEqual(try XCTUnwrap(r.xMeters),cos(2),accuracy:1e-9)
        XCTAssertEqual(try XCTUnwrap(r.mechanicalEnergyJ),2,accuracy:1e-8)
        XCTAssertEqual(r.modelVersion,"1.0.0")
    }
    func testIdealCircuitMatchesClosedForm() throws {
        let r=try NativeWorldLabScience.evaluate(.rc(),atSeconds:1)
        XCTAssertEqual(try XCTUnwrap(r.voltageV),10*(1-exp(-1)),accuracy:1e-12)
    }
    func testHeatConservationAndCooling() throws {
        let first=try NativeWorldLabScience.evaluate(.heat(),atSeconds:0)
        let later=try NativeWorldLabScience.evaluate(.heat(),atSeconds:2)
        XCTAssertEqual(try XCTUnwrap(first.meanTemperatureK),
                       (373.15+20*293.15)/21,accuracy:1e-10)
        XCTAssertEqual(try XCTUnwrap(later.meanTemperatureK),
                       try XCTUnwrap(first.meanTemperatureK),accuracy:1e-8)
        XCTAssertLessThan(try XCTUnwrap(later.peakTemperatureK),
                          try XCTUnwrap(first.peakTemperatureK))
        XCTAssertEqual(later.temperatureK?.count,21)
    }
    func testInvalidAndStiffInputsFailClosed() {
        XCTAssertThrowsError(try NativeWorldLabScience.evaluate(
            .rc(resistanceOhm:0),atSeconds:1))
        XCTAssertThrowsError(try NativeWorldLabScience.evaluate(
            .heat(diffusivityM2S:100,lengthM:0.1),atSeconds:12))
    }
}
