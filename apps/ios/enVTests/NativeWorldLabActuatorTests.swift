import XCTest
@testable import enV

final class NativeWorldLabActuatorTests:XCTestCase {
    func testElectricityActuallyLiftsAConstructedReferenceSolid() throws {
        let result=try NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg:1))
        XCTAssertEqual(result.inputEvidence,"hypothetical-user-assumed")
        XCTAssertGreaterThan(result.samples[240].currentA,0)
        XCTAssertGreaterThan(result.samples[480].heightM,0)
        XCTAssertGreaterThan(result.samples[480].backEmfV,0)
        XCTAssertTrue(result.samples.contains(where:{$0.resistiveHeatW>0 && $0.motorForceN>0}))
        XCTAssertTrue(result.samples.allSatisfy({$0.heightM>=0 && $0.energyResidualJ.isFinite}))
    }
    func testUnpoweredActuatorCannotInventMotion() throws {
        var input=NativeActuatorInput(massKg:1)
        input.supplyVoltageV=0
        let result=try NativeWorldLabActuator.evaluate(input)
        XCTAssertTrue(result.samples.allSatisfy({$0.heightM==0 && $0.currentA==0}))
    }
    func testImpossibleCoilAndUnknownMassAreRejected() {
        XCTAssertThrowsError(try NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg:Double.nan)))
        var input=NativeActuatorInput(massKg:1)
        input.inductanceH=0
        XCTAssertThrowsError(try NativeWorldLabActuator.evaluate(input))
    }
}
