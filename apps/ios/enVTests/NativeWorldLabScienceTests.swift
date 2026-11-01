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

    func testNativeDropMatchesAnalyticalVacuumFall() throws {
        var input=NativeDropInput(massKg:2,supportingHalfHeightM:0.5,projectedAreaM2:1)
        input.dropHeightM=50
        input.airDensityKgM3=0
        input.restitution=0
        let run=try NativeWorldLabDropScience.evaluate(input)
        let atOne=run.samples[240]
        XCTAssertEqual(atOne.heightAboveGroundM,50-9.80665/2,accuracy:0.03)
        XCTAssertEqual(atOne.velocityMps,-9.80665,accuracy:1e-8)
        XCTAssertEqual(run.inputEvidence,"hypothetical-user-assumed")
    }
    func testNativeDropContactSettlesWithoutInventingImpacts() throws {
        var input=NativeDropInput(massKg:2,supportingHalfHeightM:0.5,projectedAreaM2:1)
        input.dropHeightM=1
        input.airDensityKgM3=0
        input.restitution=0
        let run=try NativeWorldLabDropScience.evaluate(input)
        XCTAssertEqual(run.impactCount,1)
        XCTAssertEqual(run.samples.last?.grounded,true)
        XCTAssertTrue(run.samples.allSatisfy({$0.heightAboveGroundM>=0 && $0.kineticEnergyJ.isFinite}))
    }
    func testNativeDropRejectsImpossibleInputs() {
        let nan=NativeDropInput(massKg:Double.nan,supportingHalfHeightM:0.5,projectedAreaM2:1)
        XCTAssertThrowsError(try NativeWorldLabDropScience.evaluate(nan))
        var badBounce=NativeDropInput(massKg:1,supportingHalfHeightM:0.5,projectedAreaM2:1)
        badBounce.restitution=1.1
        XCTAssertThrowsError(try NativeWorldLabDropScience.evaluate(badBounce))
    }
}


final class NativeWorldLabElasticWaveTests:XCTestCase {
    func testStandingWaveConservationAndFreeEnds() throws {
        let r=try NativeWorldLabElasticWave.parameters(
            projectId:"p",projectRevision:3,entityId:"rod",materialId:"matter",
            lengthMeters:1,crossSectionM2:0.06,densityKgM3:8000,
            youngModulusPa:200e9,mode:1,amplitudeMeters:1e-5,cycles:4)
        XCTAssertEqual(r.waveSpeedMps,5000,accuracy:1e-9)
        XCTAssertEqual(r.frequencyHz,2500,accuracy:1e-9)
        let initial=try r.sample(0)
        XCTAssertEqual(try XCTUnwrap(initial.displacementsMeters.first),1e-5,accuracy:1e-14)
        XCTAssertEqual(try XCTUnwrap(initial.displacementsMeters.last),-1e-5,accuracy:1e-14)
        XCTAssertLessThan(abs(try XCTUnwrap(initial.stressesPa.first)),1e-6)
        XCTAssertLessThan(abs(try XCTUnwrap(initial.stressesPa.last)),1e-6)
        let quarter=try r.sample(r.periodSeconds/4)
        XCTAssertEqual(quarter.kineticEnergyJ,r.totalEnergyJ,accuracy:1e-7)
        XCTAssertEqual(quarter.strainEnergyJ,0,accuracy:1e-16)
        XCTAssertEqual(quarter.totalEnergyJ,initial.totalEnergyJ,accuracy:1e-7)
        XCTAssertEqual(r.inputEvidence,"hypothetical-user-assumed")
    }
    func testNonlinearAssumptionsAreRejected() {
        XCTAssertThrowsError(try NativeWorldLabElasticWave.parameters(
            projectId:"p",projectRevision:1,entityId:"r",materialId:"m",
            lengthMeters:1,crossSectionM2:0.06,densityKgM3:8000,
            youngModulusPa:200e9,mode:1,amplitudeMeters:0.1,cycles:4))
        XCTAssertThrowsError(try NativeWorldLabElasticWave.parameters(
            projectId:"p",projectRevision:1,entityId:"r",materialId:"m",
            lengthMeters:1,crossSectionM2:0.06,densityKgM3:0.001,
            youngModulusPa:1e15,mode:1,amplitudeMeters:1e-5,cycles:4))
    }
}
