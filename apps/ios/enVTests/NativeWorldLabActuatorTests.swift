import XCTest
@testable import enV

final class NativeWorldLabActuatorTests:XCTestCase {
    func testInventedBooleanIndicatorSwitchesNativeMotorPower() throws {
        let blank=try NativeWorldLabEditor.blank()
        let withSolid=try NativeWorldLabEditor.addSolid(blank,shape:"box",id:"solid")
        let withLogic=try NativeWorldLabEditor.startDigitalInvention(withSolid,id:"logic")
        let initial=try NativeWorldLabProject.decode(withLogic)
        let powered=try NativeWorldLabDigitalMotor.evaluate(
            initial,networkId:"logic",outputId:"output_q",entityId:"solid",massKg:1)
        XCTAssertEqual(powered.logicBit,1)
        XCTAssertEqual(powered.input.supplyVoltageV,24)
        XCTAssertTrue(powered.motor.samples.contains(where:{$0.currentA>0 && $0.heightM>0}))
        let first=try NativeWorldLabEditor.digitalSwitch(
            withLogic,networkId:"logic",inputId:"input_a",value:true)
        let second=try NativeWorldLabEditor.digitalSwitch(
            first,networkId:"logic",inputId:"input_b",value:true)
        let changed=try NativeWorldLabProject.decode(second)
        let off=try NativeWorldLabDigitalMotor.evaluate(
            changed,networkId:"logic",outputId:"output_q",entityId:"solid",massKg:1)
        XCTAssertEqual(off.logicBit,0)
        XCTAssertEqual(off.input.supplyVoltageV,0)
        XCTAssertTrue(off.motor.samples.allSatisfy({$0.currentA==0 && $0.heightM==0}))
        XCTAssertEqual(off.projectRevision,changed.revision)
        XCTAssertThrowsError(try NativeWorldLabDigitalMotor.evaluate(
            changed,networkId:"logic",outputId:"missing",entityId:"solid",massKg:1))
        XCTAssertThrowsError(try NativeWorldLabDigitalMotor.evaluate(
            changed,networkId:"logic",outputId:"output_q",entityId:"solid",
            massKg:1,energizedVoltageV:Double.nan))
    }
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
    func testWiredDCMotorChangesTotalSourceCurrentAndAccountsForPassiveLoad() throws {
        let circuitData=try NativeWorldLabEditor.starterCircuit(
            NativeWorldLabEditor.blank())
        let withSolid=try NativeWorldLabEditor.addSolid(circuitData,shape:"box",id:"lift")
        let project=try NativeWorldLabProject.decode(withSolid)
        let network=try XCTUnwrap(project.networks?.first)
        let run=try NativeWorldLabNetworkMotor.evaluate(
            project,network:network,entityId:"lift",massKg:1,thermal:true)
        let sample=run.samples[240]
        XCTAssertLessThan(sample.totalSourceCurrentA,
            try XCTUnwrap(run.dc.branchCurrentsA["source"]))
        XCTAssertEqual(sample.totalSourcePowerW,
            9*run.motor.samples[240].currentA+sample.passiveResistorHeatW,accuracy:1e-8)
        XCTAssertTrue(run.samples.allSatisfy({$0.combinedEnergyResidualJ.isFinite}))
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
    func testInventedModulusDrivesAnalyticalBeamResponseWithoutClaimingStrength() throws {
        let blank=try NativeWorldLabEditor.blank()
        let withBox=try NativeWorldLabEditor.addSolid(blank,shape:"box",id:"beam")
        let resized=try NativeWorldLabEditor.resizeSolid(
            withBox,id:"beam",dimensionsMeters:[2,0.1,0.05])
        let material=try NativeWorldLabEditor.addHypotheticalMaterial(
            resized,name:"Invented solid",densityKgM3:nil,
            youngModulusPa:2e11,id:"invented-matter")
        let linked=try NativeWorldLabEditor.assignMaterial(
            material,solidId:"beam",materialId:"invented-matter")
        let project=try NativeWorldLabProject.decode(linked)
        let r=try NativeWorldLabStructural.bending(
            project,entityId:"beam",forceN:1000)
        XCTAssertEqual(r.tipDeflectionM,0.0032,accuracy:1e-12)
        XCTAssertEqual(r.maximumStressPa,24e6,accuracy:1e-4)
        XCTAssertEqual(r.surfaceStrain,0.00012,accuracy:1e-12)
        XCTAssertEqual(r.materialEvidence,"hypothetical-user-assumed")
        XCTAssertEqual(r.projectRevision,project.revision)
        XCTAssertThrowsError(try NativeWorldLabStructural.bending(
            project,entityId:"beam",forceN:1e8))
        XCTAssertThrowsError(try NativeWorldLabStructural.bending(
            project,entityId:"beam",forceN:Double.nan))
        let unknown=try NativeWorldLabEditor.addHypotheticalMaterial(
            linked,name:"Unknown substance",densityKgM3:nil,
            youngModulusPa:nil,id:"unknown")
        let changed=try NativeWorldLabEditor.assignMaterial(
            unknown,solidId:"beam",materialId:"unknown")
        XCTAssertThrowsError(try NativeWorldLabStructural.bending(
            NativeWorldLabProject.decode(changed),entityId:"beam",forceN:1000))
    }

    func testTwoInventedRigidBodiesExchangeImpulseAndConserveMomentum() throws {
        var p=try NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.blank(),shape:"box",id:"left")
        p=try NativeWorldLabEditor.addSolid(p,shape:"box",id:"right")
        p=try NativeWorldLabEditor.positionSolid(
            p,id:"left",positionMeters:[0,0.5,2])
        p=try NativeWorldLabEditor.positionSolid(
            p,id:"right",positionMeters:[3,0.5,2])
        p=try NativeWorldLabEditor.addHypotheticalMaterial(
            p,name:"Invented dense foam",densityKgM3:2,id:"matter")
        p=try NativeWorldLabEditor.assignMaterial(
            p,solidId:"left",materialId:"matter")
        p=try NativeWorldLabEditor.assignMaterial(
            p,solidId:"right",materialId:"matter")
        let project=try NativeWorldLabProject.decode(p)
        let elastic=try NativeWorldLabCollision.evaluate(
            project,firstId:"right",secondId:"left",
            velocityLeftMps:2,velocityRightMps:0,restitution:1)
        XCTAssertEqual(elastic.impactTimeSeconds,1,accuracy:1e-12)
        XCTAssertEqual(elastic.leftFinalVelocityMps,0,accuracy:1e-12)
        XCTAssertEqual(elastic.rightFinalVelocityMps,2,accuracy:1e-12)
        XCTAssertEqual(elastic.impulseNs,4,accuracy:1e-12)
        let nativeJson=try JSONSerialization.jsonObject(
            with:JSONEncoder().encode(elastic)) as? [String:Any]
        XCTAssertEqual(nativeJson?["format"] as? String,"env-world-lab-object-collision")
        XCTAssertEqual(nativeJson?["inputEvidence"] as? String,"hypothetical-user-assumed")
        XCTAssertEqual(nativeJson?["projectRevision"] as? Int,project.revision)
        XCTAssertEqual(elastic.dissipatedEnergyJ,0,accuracy:1e-12)
        let atContact=try elastic.sample(1)
        XCTAssertEqual(atContact.rightCenterXM-atContact.leftCenterXM,1,accuracy:1e-12)
        let plastic=try NativeWorldLabCollision.evaluate(
            project,firstId:"left",secondId:"right",
            velocityLeftMps:2,velocityRightMps:0,restitution:0)
        XCTAssertEqual(plastic.leftFinalVelocityMps,1,accuracy:1e-12)
        XCTAssertEqual(plastic.rightFinalVelocityMps,1,accuracy:1e-12)
        XCTAssertEqual(plastic.dissipatedEnergyJ,2,accuracy:1e-12)
        XCTAssertEqual(plastic.momentumAfterKgMps,plastic.momentumBeforeKgMps,accuracy:1e-12)
        XCTAssertThrowsError(try NativeWorldLabCollision.evaluate(
            project,firstId:"left",secondId:"right",
            velocityLeftMps:0,velocityRightMps:2,restitution:0.5))
        XCTAssertThrowsError(try NativeWorldLabCollision.evaluate(
            project,firstId:"left",secondId:"right",
            velocityLeftMps:2,velocityRightMps:0,restitution:2))
        XCTAssertThrowsError(try NativeWorldLabCollision.evaluate(
            project,firstId:"left",secondId:"right",
            velocityLeftMps:2,velocityRightMps:0,restitution:0.5,durationSeconds:0.2))
        let unassigned=try NativeWorldLabEditor.assignMaterial(
            p,solidId:"right",materialId:nil)
        XCTAssertThrowsError(try NativeWorldLabCollision.evaluate(
            NativeWorldLabProject.decode(unassigned),
            firstId:"left",secondId:"right",
            velocityLeftMps:2,velocityRightMps:0,restitution:0.5))
    }

    func testObliqueThreeDimensionalInventedSphereImpactAndConservation() throws {
        var json=try NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.blank(),shape:"sphere",id:"a")
        json=try NativeWorldLabEditor.addSolid(json,shape:"sphere",id:"b")
        json=try NativeWorldLabEditor.positionSolid(
            json,id:"a",positionMeters:[0,0.5,0])
        json=try NativeWorldLabEditor.positionSolid(
            json,id:"b",positionMeters:[3,1,0])
        json=try NativeWorldLabEditor.addHypotheticalMaterial(
            json,name:"Invented sphere matter",densityKgM3:6/Double.pi,id:"invented")
        json=try NativeWorldLabEditor.assignMaterial(
            json,solidId:"a",materialId:"invented")
        json=try NativeWorldLabEditor.assignMaterial(
            json,solidId:"b",materialId:"invented")
        let p=try NativeWorldLabProject.decode(json)
        let run=try NativeWorldLabSphereImpact.evaluate(
            p,firstId:"a",secondId:"b",
            firstVelocityMps:[2,0,0],secondVelocityMps:[0,0,0],restitution:0.65)
        XCTAssertEqual(run.impactTimeSeconds,(3-sqrt(0.75))/2,accuracy:1e-10)
        XCTAssertEqual(run.firstMassKg,1,accuracy:1e-10)
        XCTAssertEqual(run.secondMassKg,1,accuracy:1e-10)
        for i in 0..<3 {
            XCTAssertEqual(run.momentumAfterKgMps[i],run.momentumBeforeKgMps[i],
                accuracy:1e-10)
            XCTAssertEqual(run.angularMomentumAfterKgM2PerS[i],
                run.angularMomentumBeforeKgM2PerS[i],accuracy:1e-10)
        }
        XCTAssertEqual(run.energyBeforeJ,
            run.energyAfterJ+run.dissipatedEnergyJ,accuracy:1e-10)
        let at=try run.sample(run.impactTimeSeconds)
        XCTAssertEqual(hypot(at.firstCentreM[0]-at.secondCentreM[0],
            at.firstCentreM[1]-at.secondCentreM[1]),1,accuracy:1e-10)
        let evidence=try JSONSerialization.jsonObject(
            with:JSONEncoder().encode(run)) as? [String:Any]
        XCTAssertEqual(evidence?["format"] as? String,"env-world-lab-sphere-impact-3d")
        XCTAssertEqual(evidence?["assumptionEvidence"] as? String,
            "hypothetical-user-assumed")
        XCTAssertThrowsError(try NativeWorldLabSphereImpact.evaluate(
            p,firstId:"a",secondId:"b",
            firstVelocityMps:[0,0,0],secondVelocityMps:[0,0,0],restitution:0.5))
        XCTAssertThrowsError(try NativeWorldLabSphereImpact.evaluate(
            p,firstId:"a",secondId:"b",
            firstVelocityMps:[2,0,0],secondVelocityMps:[0,0,0],restitution:1.5))
        let unknown=try NativeWorldLabEditor.assignMaterial(
            json,solidId:"b",materialId:nil)
        XCTAssertThrowsError(try NativeWorldLabSphereImpact.evaluate(
            NativeWorldLabProject.decode(unknown),
            firstId:"a",secondId:"b",
            firstVelocityMps:[2,0,0],secondVelocityMps:[0,0,0],restitution:0.5))
    }

    func testThreeSphereSuccessiveContactsTransferMomentumAndKeepEvidence() throws {
        var json=try NativeWorldLabEditor.blank()
        for i in 0..<3 {
            json=try NativeWorldLabEditor.addSolid(json,shape:"sphere",id:"s-\(i)")
        }
        json=try NativeWorldLabEditor.addHypotheticalMaterial(
            json,name:"Invented gel",densityKgM3:12/Double.pi,id:"gel")
        for i in 0..<3 {
            json=try NativeWorldLabEditor.positionSolid(
                json,id:"s-\(i)",positionMeters:[-4+Double(3*i),0.5,0])
            json=try NativeWorldLabEditor.assignMaterial(
                json,solidId:"s-\(i)",materialId:"gel")
        }
        let project=try NativeWorldLabProject.decode(json)
        let run=try NativeWorldLabMultiSphere.evaluate(
            project,velocities:["s-0":[2,0,0]],restitution:1)
        XCTAssertEqual(run.events.count,2)
        XCTAssertEqual(run.events[0].atSeconds,1,accuracy:1e-10)
        XCTAssertEqual(run.events[1].atSeconds,2,accuracy:1e-10)
        XCTAssertEqual(run.totalInitialEnergyJ,run.totalFinalEnergyJ,accuracy:1e-9)
        XCTAssertEqual(run.totalDissipatedEnergyJ,0,accuracy:1e-9)
        XCTAssertEqual(run.initialMomentumKgMps[0],
            run.finalMomentumKgMps[0],accuracy:1e-9)
        let end=try run.sample(3)
        XCTAssertEqual(end.completedEvents,2)
        XCTAssertEqual(end.objects[2].velocityMps[0],2,accuracy:1e-9)
        XCTAssertEqual(end.objects[0].velocityMps[0],0,accuracy:1e-9)
        let evidence=try JSONSerialization.jsonObject(
            with:JSONEncoder().encode(run)) as? [String:Any]
        XCTAssertEqual(evidence?["format"] as? String,
            "env-world-lab-multi-sphere-impact")
        XCTAssertEqual(evidence?["materialEvidence"] as? String,
            "hypothetical-user-assumed")
        XCTAssertThrowsError(try NativeWorldLabMultiSphere.evaluate(
            project,velocities:["s-0":[2,0,0]],restitution:2))
        let unknown=try NativeWorldLabEditor.assignMaterial(
            json,solidId:"s-1",materialId:nil)
        XCTAssertThrowsError(try NativeWorldLabMultiSphere.evaluate(
            NativeWorldLabProject.decode(unknown),
            velocities:["s-0":[2,0,0]],restitution:1))
    }

    func testDisjointSimultaneousSphereContactsAreCalculatedWithoutOrderingBias() throws {
        var json=try NativeWorldLabEditor.blank()
        for i in 0..<4 {
            json=try NativeWorldLabEditor.addSolid(json,shape:"sphere",id:"s-\(i)")
        }
        json=try NativeWorldLabEditor.addHypotheticalMaterial(
            json,name:"Invented gel",densityKgM3:12/Double.pi,id:"gel")
        let positions:[Double]=[-4,-1,4,10]
        for i in 0..<4 {
            json=try NativeWorldLabEditor.positionSolid(
                json,id:"s-\(i)",positionMeters:[positions[i],0.5,0])
            json=try NativeWorldLabEditor.assignMaterial(
                json,solidId:"s-\(i)",materialId:"gel")
        }
        let project=try NativeWorldLabProject.decode(json)
        for restitution in [1.0,0.5] {
            let run=try NativeWorldLabMultiSphere.evaluate(project,velocities:[
                "s-0":[2,0,0],"s-2":[5,0,0]
            ],restitution:restitution,durationSeconds:1.5)
            XCTAssertEqual(run.events.count,2)
            XCTAssertEqual(run.events[0].atSeconds,1,accuracy:1e-10)
            XCTAssertEqual(run.events[1].atSeconds,1,accuracy:1e-10)
            XCTAssertEqual(try run.sample(0.99).completedEvents,0)
            let atContact=try run.sample(1)
            XCTAssertEqual(atContact.completedEvents,2)
            XCTAssertEqual(atContact.objects[1].velocityMps[0],1+restitution,accuracy:1e-9)
            XCTAssertEqual(atContact.objects[3].velocityMps[0],2.5*(1+restitution),accuracy:1e-9)
            XCTAssertEqual(run.totalInitialEnergyJ-run.totalFinalEnergyJ,
                run.totalDissipatedEnergyJ,accuracy:1e-9)
            XCTAssertEqual(run.initialMomentumKgMps[0],run.finalMomentumKgMps[0],
                accuracy:1e-9)
        }
    }

    func testSharedSphereSimultaneousImpactsRemainUnsupported() throws {
        var json=try NativeWorldLabEditor.blank()
        for i in 0..<3 {
            json=try NativeWorldLabEditor.addSolid(json,shape:"sphere",id:"s-\(i)")
        }
        json=try NativeWorldLabEditor.addHypotheticalMaterial(
            json,name:"Invented gel",densityKgM3:12/Double.pi,id:"gel")
        for i in 0..<3 {
            json=try NativeWorldLabEditor.positionSolid(
                json,id:"s-\(i)",positionMeters:[-4+Double(3*i),0.5,0])
            json=try NativeWorldLabEditor.assignMaterial(
                json,solidId:"s-\(i)",materialId:"gel")
        }
        let project=try NativeWorldLabProject.decode(json)
        XCTAssertThrowsError(try NativeWorldLabMultiSphere.evaluate(project,velocities:[
            "s-0":[2,0,0],"s-2":[-2,0,0]
        ],restitution:1,durationSeconds:2))
    }

}
