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
    func testNativeActuatorSelfAuditHasReproducibleEnergyChecks() throws {
        var zero=NativeActuatorInput(massKg:1)
        zero.supplyVoltageV=0
        let stationary=try NativeWorldLabActuator.evaluate(zero)
        let audit=try NativeWorldLabActuator.numericalAudit(zero,stationary)
        XCTAssertEqual(audit.status,"within-internal-tolerance")
        XCTAssertEqual(audit.maximumEnergyResidualFraction,0)
        XCTAssertEqual(audit.maximumRelativeStateDifference,0)

        let powered=NativeActuatorInput(massKg:1)
        let run=try NativeWorldLabActuator.evaluate(powered)
        let result=try NativeWorldLabActuator.numericalAudit(powered,run)
        XCTAssertNotEqual(result.status,"unavailable")
        XCTAssertTrue(result.maximumEnergyResidualFraction.isFinite)
        XCTAssertNotNil(result.maximumRelativeStateDifference)
    }
    func testCoilThermalFeedbackChangesCurrent() throws {
        var hot=NativeActuatorInput(massKg:1)
        hot.thermal=NativeActuatorThermalInput()
        let base=try NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg:1))
        let result=try NativeWorldLabActuator.evaluate(hot)
        XCTAssertEqual(result.modelVersion,"1.1.0")
        XCTAssertGreaterThan(try XCTUnwrap(result.samples.last?.coilTemperatureK),293.15)
        XCTAssertGreaterThan(try XCTUnwrap(result.samples.last?.coilResistanceOhm),2)
        XCTAssertGreaterThan(try XCTUnwrap(result.samples.last?.thermalEnergyJ),0)
        XCTAssertNotEqual(result.samples.last?.currentA,base.samples.last?.currentA)
        hot.thermal?.heatCapacityJPerK=0
        XCTAssertThrowsError(try NativeWorldLabActuator.evaluate(hot))
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
    func testUncoupledActuatorMatchesAnalyticRLCircuit() throws {
        var input=NativeActuatorInput(massKg:1)
        input.gravityMps2=0
        input.forceConstantNPerA=0
        let run=try NativeWorldLabActuator.evaluate(input)
        let atOne=try XCTUnwrap(run.samples.first(where:{$0.timeSeconds>=1-1e-10}))
        let timeConstant = input.resistanceOhm / input.inductanceH
        let steadyCurrent = input.supplyVoltageV / input.resistanceOhm
        let expected = steadyCurrent * (1 - exp(-timeConstant))
        XCTAssertEqual(atOne.currentA,expected,accuracy:1e-7)
        XCTAssertEqual(atOne.heightM,0)
    }
}
