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


final class NativeWorldLabBranchTests:XCTestCase {
    func testSameModelBranchRecordsDiffAndRecomputesNewRun() throws {
        let source=NativeLabInput.spring(massKg:1,springNPerM:4,dampingNsPerM:0.2,x0:0.5,v0:0)
        let target=NativeLabInput.spring(massKg:2,springNPerM:9,dampingNsPerM:0.2,x0:0.5,v0:0)
        let original=try NativeWorldLabScience.evaluate(source,atSeconds:0.5)
        let record=try NativeWorldLabBranch.make(source:source,target:target,
            sourceTimeSeconds:0.5,sourceRunId:"source-run",
            createdAtUTC:"2026-11-01T12:00:00Z")
        let result=try NativeWorldLabBranch.recompute(target,record:record)
        XCTAssertEqual(record.sourceRunId,"source-run")
        XCTAssertEqual(record.sourceModelId,"spring")
        XCTAssertEqual(record.targetModelId,"spring")
        XCTAssertEqual(record.fidelity,"recomputed-new-run")
        XCTAssertEqual(record.inputDiff.map{$0.field},["massKg","springNPerM"])
        XCTAssertEqual(record.inputDiff[0].previous,1)
        XCTAssertEqual(record.inputDiff[0].next,2)
        XCTAssertNotEqual(original.xMeters,result.xMeters)
        XCTAssertEqual(record.sourceParameters["massKg"],1)
        XCTAssertEqual(record.targetParameters["massKg"],2)
    }
    func testCrossModelBranchRecordsRemovedAndAddedAssumptions() throws {
        let source=NativeLabInput.rc()
        let target=NativeLabInput.heat()
        let record=try NativeWorldLabBranch.make(source:source,target:target,
            sourceTimeSeconds:0.2,sourceRunId:"rc-source",
            createdAtUTC:"2026-11-01T12:00:00Z")
        XCTAssertEqual(record.sourceModelId,"rc")
        XCTAssertEqual(record.targetModelId,"heat")
        XCTAssertTrue(record.inputDiff.contains{$0.field=="resistanceOhm" && $0.previous==1000 && $0.next==nil})
        XCTAssertTrue(record.inputDiff.contains{$0.field=="diffusivityM2S" && $0.previous==nil && $0.next==0.02})
        XCTAssertEqual(try NativeWorldLabBranch.recompute(target,record:record).temperatureK?.count,21)
    }
    func testBranchRejectsInvalidTimeAndTamperedTarget() throws {
        let source=NativeLabInput.spring()
        XCTAssertThrowsError(try NativeWorldLabBranch.make(source:source,target:.rc(),
            sourceTimeSeconds:-0.1))
        let target=NativeLabInput.rc()
        let record=try NativeWorldLabBranch.make(source:source,target:target,sourceTimeSeconds:0.1)
        XCTAssertThrowsError(try NativeWorldLabBranch.recompute(.rc(resistanceOhm:500),record:record))
        XCTAssertThrowsError(try NativeWorldLabBranch.recompute(source,record:record))
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


final class NativeWorldLabRadiationTests:XCTestCase {
    func make(_ start:Double=400,_ ambient:Double=300,_ emissivity:Double=0.8)throws->NativeRadiationRun {
        try NativeWorldLabRadiation.parameters(
            projectId:"world",projectRevision:2,entityId:"object",materialId:"matter",
            massKg:1000,areaM2:6,densityKgM3:1000,specificHeatJPerKgK:500,
            startK:start,environmentK:ambient,emissivity:emissivity,duration:1000)
    }
    func testPhysicalCoolingAndEnergyLedger() throws {
        let r=try make()
        let initial=try XCTUnwrap(r.samples.first)
        let expected=0.8*NativeWorldLabRadiation.sigma*6*(pow(400.0,4)-pow(300.0,4))
        XCTAssertEqual(initial.netRadiatedPowerW,expected,accuracy:1e-8)
        let last=try XCTUnwrap(r.samples.last)
        XCTAssertLessThan(last.temperatureK,400)
        XCTAssertGreaterThan(last.temperatureK,300)
        for s in r.samples{XCTAssertLessThan(abs(s.energyResidualJ),1e-5)}
        XCTAssertEqual(r.inputEvidence,"hypothetical-user-assumed")
    }
    func testInsulationAndEnvironmentHeating() throws {
        XCTAssertEqual(try XCTUnwrap(make(400,300,0).samples.last).temperatureK,
            400,accuracy:0)
        let warmed=try XCTUnwrap(make(300,700).samples.last)
        XCTAssertGreaterThan(warmed.temperatureK,300)
        XCTAssertLessThan(warmed.transferredEnergyJ,0)
    }
    func testNonphysicalAssumptionsRefused() throws {
        XCTAssertThrowsError(try make(400,300,-1))
        XCTAssertThrowsError(try NativeWorldLabRadiation.parameters(
            projectId:"p",projectRevision:0,entityId:"r",materialId:"m",
            massKg:1e-5,areaM2:6,densityKgM3:0.001,specificHeatJPerKgK:0.01,
            startK:400,environmentK:300,emissivity:0.8,duration:1000))
        XCTAssertThrowsError(try make().sample(Double.infinity))
    }
    func testNativeScientificSIAndPortParity() throws {
        let length=try NativeWorldLabSI.declare(150,unit:"cm")
        XCTAssertEqual(length.valueSI,1.5,accuracy:1e-12)
        XCTAssertEqual(try NativeWorldLabSI.convert(length,to:"mm"),1500,accuracy:1e-8)
        XCTAssertEqual(try NativeWorldLabSI.convert(
            NativeWorldLabSI.declare(250,unit:"g"),to:"kg"),0.25,accuracy:1e-12)
        XCTAssertEqual(try NativeWorldLabSI.convert(
            NativeWorldLabSI.declare(2,unit:"kPa"),to:"Pa"),2000,accuracy:1e-8)
        XCTAssertThrowsError(try NativeWorldLabSI.convert(length,to:"K"))
        XCTAssertThrowsError(try NativeWorldLabSI.declare(-1,unit:"K"))
        XCTAssertThrowsError(try NativeWorldLabSI.declare(Double.nan,unit:"m"))
        XCTAssertThrowsError(try NativeWorldLabSI.declare(1,unit:"V",
            evidence:"measured-observed"))
        let measured=try NativeWorldLabSI.declare(5,unit:"V",
            evidence:"measured-observed",sourceId:"lab:volt-5")
        XCTAssertEqual(measured.sourceId,"lab:volt-5")
        let source=NativeSciencePort(id:"source",direction:"output",
            unit:"V",frame:"SCALAR",flow:"electrical")
        let load=NativeSciencePort(id:"load",direction:"input",
            unit:"V",frame:"SCALAR",flow:"electrical")
        try NativeWorldLabSI.connect(source,load)
        XCTAssertThrowsError(try NativeWorldLabSI.connect(
            source,NativeSciencePort(id:"load",direction:"input",
                unit:"W",frame:"SCALAR",flow:"electrical")))
        XCTAssertThrowsError(try NativeWorldLabSI.connect(load,source))
    }
    func testNativeGraphRejectsAlgebraicCyclesButAllowsDelays() throws {
        let source=NativeScienceComponent(id:"s",modelId:"source",ports:[
            .init(id:"out",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
            .init(id:"in",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical")
        ])
        let load=NativeScienceComponent(id:"l",modelId:"load",ports:[
            .init(id:"out",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
            .init(id:"in",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical")
        ])
        let one=NativeScienceEdge(fromComponentId:"s",fromPortId:"out",
            toComponentId:"l",toPortId:"in",delayed:false)
        let two=NativeScienceEdge(fromComponentId:"l",fromPortId:"out",
            toComponentId:"s",toPortId:"in",delayed:false)
        let graph=NativeScientificGraph(projectId:"native-graph",projectRevision:1,
            components:[source,load],connections:[one])
        try NativeWorldLabGraph.validate(graph)
        XCTAssertThrowsError(try NativeWorldLabGraph.validate(
            NativeScientificGraph(projectId:"native-graph",projectRevision:1,
                components:[source,load],connections:[one,two])))
        try NativeWorldLabGraph.validate(NativeScientificGraph(
            projectId:"native-graph",projectRevision:1,components:[source,load],
            connections:[one,NativeScienceEdge(fromComponentId:"l",fromPortId:"out",
                toComponentId:"s",toPortId:"in",delayed:true)]))
        let mismatched=NativeScienceComponent(id:"l",modelId:"load",ports:[
            .init(id:"out",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
            .init(id:"in",direction:"input",unit:"W",frame:"SCALAR",flow:"electrical")
        ])
        XCTAssertThrowsError(try NativeWorldLabGraph.validate(
            NativeScientificGraph(projectId:"native-graph",projectRevision:1,
                components:[source,mismatched],connections:[one])))
    }
}


final class NativeWorldLabExecutionTests:XCTestCase {
    func makeRCGraph()->NativeScientificGraph {
        NativeScientificGraph(projectId:"rc-contract",projectRevision:2,components:[
            NativeScienceComponent(id:"source",modelId:"ideal-dc-source",ports:[
                NativeSciencePort(id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical")]),
            NativeScienceComponent(id:"load",modelId:"series-rc-load",ports:[
                NativeSciencePort(id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"),
                NativeSciencePort(id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
                NativeSciencePort(id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical")])
        ],connections:[NativeScienceEdge(fromComponentId:"source",fromPortId:"V",
            toComponentId:"load",toPortId:"Vin",delayed:false)])
    }
    func testTrustedSchedulerRunsRealRcAndBalancesPower() throws {
        let run=try NativeWorldLabExecution.execute(makeRCGraph(),
            adapters:NativeWorldLabExecution.idealRCAdapters(sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5),
            durationSeconds:0.3,stepSeconds:0.1)
        let last=try XCTUnwrap(run.samples.last)
        XCTAssertEqual(try XCTUnwrap(last.values["load:Vc"]?.valueSI),12*(1-exp(-0.3/3)),accuracy:1e-12)
        XCTAssertGreaterThan(try XCTUnwrap(last.values["load:I"]?.valueSI),0)
        XCTAssertTrue(run.samples.allSatisfy({abs($0.residualW)<1e-10&&$0.dissipatedW>=0}))
        let adapters=try NativeWorldLabExecution.idealRCAdapters(sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5)
        let changedSource=NativeScientificAdapter(componentId:"source",modelId:"ideal-dc-source",
            modelVersion:"1.0.0"){_,_,_ in
            NativeScientificStepOutput(outputs:["V":try NativeWorldLabSI.declare(6,unit:"V")],
                suppliedW:0,dissipatedW:0,storedRateW:0)
        }
        let connected=try NativeWorldLabExecution.execute(makeRCGraph(),
            adapters:[changedSource,adapters[1]],durationSeconds:0.3,stepSeconds:0.1)
        XCTAssertEqual(try XCTUnwrap(connected.samples.last?.values["load:Vc"]?.valueSI),
            6*(1-exp(-0.3/3)),accuracy:1e-12)
    }
    func testSchedulerHonoursFutureEventsAndRejectsFalsePower() throws {
        let graph=makeRCGraph()
        let base=try NativeWorldLabExecution.idealRCAdapters(sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5)
        let eventSource=NativeScientificAdapter(componentId:"source",modelId:"ideal-dc-source",
            modelVersion:"1.0.0"){time,_,_ in
            NativeScientificStepOutput(outputs:["V":try NativeWorldLabSI.declare(12,unit:"V")],
                suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:time<0.11 ? 0.15:nil)
        }
        let eventRun=try NativeWorldLabExecution.execute(graph,adapters:[eventSource,base[1]],
            durationSeconds:0.3,stepSeconds:0.1)
        XCTAssertTrue(eventRun.samples.contains{$0.eventBoundary&&abs($0.timeSeconds-0.15)<1e-10})
        let faulty=NativeScientificAdapter(componentId:"load",modelId:"series-rc-load",
            modelVersion:"1.0.0"){time,delta,inputs in
            let valid=try base[1].advance(time,delta,inputs)
            return NativeScientificStepOutput(outputs:valid.outputs,
                suppliedW:valid.suppliedW-1,dissipatedW:valid.dissipatedW,storedRateW:valid.storedRateW)
        }
        XCTAssertThrowsError(try NativeWorldLabExecution.execute(graph,adapters:[base[0],faulty],
            durationSeconds:0.3,stepSeconds:0.1))
    }
}


final class NativeWorldLabConnectedPortContractTests:XCTestCase {
    func testConnectedInputFailsClosedWhenSourceOmitsItsDeclaredOutput() throws {
        let graph=NativeScientificGraph(projectId:"rc-missing-output",projectRevision:1,
            components:[
                NativeScienceComponent(id:"source",modelId:"ideal-dc-source",ports:[
                    NativeSciencePort(id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical")]),
                NativeScienceComponent(id:"load",modelId:"series-rc-load",ports:[
                    NativeSciencePort(id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"),
                    NativeSciencePort(id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
                    NativeSciencePort(id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical")])
            ],connections:[NativeScienceEdge(fromComponentId:"source",fromPortId:"V",
                toComponentId:"load",toPortId:"Vin",delayed:false)])
        let base=try NativeWorldLabExecution.idealRCAdapters(
            sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5)
        let missingSource=NativeScientificAdapter(componentId:"source",modelId:"ideal-dc-source",
            modelVersion:"1.0.0"){_,_,_ in
                NativeScientificStepOutput(outputs:[:],suppliedW:0,dissipatedW:0,storedRateW:0)
            }
        XCTAssertThrowsError(try NativeWorldLabExecution.execute(graph,
            adapters:[missingSource,base[1]],durationSeconds:0.3,stepSeconds:0.1))
    }
}


final class NativeWorldLabStatefulExecutionParityTests:XCTestCase {
    func testRCCapacitorStatePersistsAcrossConnectedSourceSwitch() throws {
        let graph=NativeWorldLabExecution.idealRCGraph(projectId:"rc-switch",projectRevision:1)
        let base=try NativeWorldLabExecution.idealRCAdapters(
            sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5)
        let switched=NativeScientificAdapter(componentId:"source",modelId:"ideal-dc-source",
            modelVersion:"1.0.0"){time,_,_ in
            let voltage=time<0.15 ? 12.0 : 0.0
            return NativeScientificStepOutput(outputs:["V":try NativeWorldLabSI.declare(voltage,unit:"V")],
                suppliedW:0,dissipatedW:0,storedRateW:0)
        }
        let run=try NativeWorldLabExecution.execute(graph,adapters:[switched,base[1]],
            durationSeconds:0.3,stepSeconds:0.1)
        let charged=12*(1-exp(-0.1/3))
        XCTAssertEqual(try XCTUnwrap(run.samples.last?.values["load:Vc"]?.valueSI),
            charged*exp(-0.2/3),accuracy:1e-12)
    }

    func testDelayedFeedbackRequiresExplicitInitialPortState() throws {
        let ports=[
            NativeSciencePort(id:"out",direction:"output",unit:"1",frame:"SCALAR",flow:"signal"),
            NativeSciencePort(id:"in",direction:"input",unit:"1",frame:"SCALAR",flow:"signal")]
        let graph=NativeScientificGraph(projectId:"delay-loop",projectRevision:1,
            components:[
                NativeScienceComponent(id:"a",modelId:"delay-step",ports:ports),
                NativeScienceComponent(id:"b",modelId:"delay-step",ports:ports)],
            connections:[
                NativeScienceEdge(fromComponentId:"a",fromPortId:"out",toComponentId:"b",toPortId:"in",delayed:true),
                NativeScienceEdge(fromComponentId:"b",fromPortId:"out",toComponentId:"a",toPortId:"in",delayed:true)])
        func adapter(_ id:String,_ initial:Double)throws->NativeScientificAdapter {
            NativeScientificAdapter(componentId:id,modelId:"delay-step",modelVersion:"1.0.0",
                initialOutputs:["out":try NativeWorldLabSI.declare(initial,unit:"1")]){_,_,inputs in
                NativeScientificStepOutput(outputs:["out":try NativeWorldLabSI.declare(
                    inputs["in"]!.valueSI+1,unit:"1",evidence:"physics-model-computed")],
                    suppliedW:0,dissipatedW:0,storedRateW:0)
            }
        }
        let run=try NativeWorldLabExecution.execute(graph,
            adapters:[try adapter("a",1),try adapter("b",10)],durationSeconds:0.2,stepSeconds:0.1)
        XCTAssertEqual(try XCTUnwrap(run.samples[0].values["a:out"]?.valueSI),11,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(run.samples[0].values["b:out"]?.valueSI),2,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(run.samples[1].values["a:out"]?.valueSI),3,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(run.samples[1].values["b:out"]?.valueSI),12,accuracy:1e-12)

        let missing=try adapter("a",1)
        let noInitial=NativeScientificAdapter(componentId:"a",modelId:"delay-step",
            modelVersion:"1.0.0",advance:missing.advance)
        XCTAssertThrowsError(try NativeWorldLabExecution.execute(graph,
            adapters:[noInitial,try adapter("b",10)],durationSeconds:0.1,stepSeconds:0.1))
    }
}


final class NativeWorldLabRepeatRunStateTests:XCTestCase {
    func testStatefulAdaptersResetBeforeEveryIndependentRun() throws {
        let graph=NativeWorldLabExecution.idealRCGraph(projectId:"rc-repeat-run",projectRevision:1)
        let adapters=try NativeWorldLabExecution.idealRCAdapters(
            sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5)
        let first=try NativeWorldLabExecution.execute(graph,adapters:adapters,
            durationSeconds:0.3,stepSeconds:0.1)
        let repeated=try NativeWorldLabExecution.execute(graph,adapters:adapters,
            durationSeconds:0.3,stepSeconds:0.1)
        let firstValues=first.samples.map{$0.values["load:Vc"]!.valueSI}
        let repeatedValues=repeated.samples.map{$0.values["load:Vc"]!.valueSI}
        XCTAssertEqual(firstValues,repeatedValues)
    }
}


final class NativeWorldLabVehicleTests:XCTestCase {
    private func project() throws -> NativeWorldLabProject {
        try NativeWorldLabProject.decode(NativeWorldLabEditor.blank(title:"Vehicle test"))
    }

    func testRoadVehicleComputesTractionDragAndBatteryDischarge() throws {
        let run=try NativeWorldLabVehicle.evaluate(project(),"road-run",
            NativeWorldLabVehicleInput())
        XCTAssertEqual(run.outcome,"ground-run")
        XCTAssertGreaterThan(try XCTUnwrap(run.samples.last).horizontalSpeedMps,0)
        XCTAssertGreaterThan(try XCTUnwrap(run.samples.last).distanceMeters,0)
        XCTAssertLessThan(try XCTUnwrap(run.samples.last).batterySOC,1)
        for sample in run.samples {
            XCTAssertLessThanOrEqual(sample.wheelDriveForceN,
                run.input.tireFriction*sample.normalForceN+1e-6)
            XCTAssertTrue(sample.terminalVoltageV.isFinite)
            XCTAssertGreaterThan(sample.terminalVoltageV,0)
        }
    }

    func testMotorDropoutIsRecordedAndDisablesWheelDrive() throws {
        var input=NativeWorldLabVehicleInput()
        input.motorFailureAtSeconds=2
        let run=try NativeWorldLabVehicle.evaluate(project(),"motor-dropout",input)
        XCTAssertTrue(run.events.contains(where:{$0.contains("motor dropout")}))
        let after=try XCTUnwrap(run.samples.first(where:{$0.timeSeconds>=4}))
        XCTAssertEqual(after.wheelDriveForceN,0,accuracy:1e-9)
    }

    func testRotorcraftComputesLiftAndReachesAirborneState() throws {
        var input=NativeWorldLabVehicleInput()
        input.mode = .rotorcraft
        input.massKg=600
        input.batteryVoltageV=800
        input.batteryResistanceOhm=0.01
        input.batteryMaxCurrentA=1500
        input.batteryCapacityWh=200000
        input.rotorDiskAreaM2=15
        input.rotorMaxThrustN=10000
        input.rotorThrottle=0.9
        input.maxCruiseThrustN=1800
        input.driveThrottle=0
        input.durationSeconds=2
        input.maxStructuralLoadFactor=4
        let run=try NativeWorldLabVehicle.evaluate(project(),"rotorcraft",input)
        XCTAssertTrue(run.samples.contains(where:{$0.airborne}))
        XCTAssertTrue(run.samples.contains(where:{$0.rotorThrustN>600*9.80665}))
        XCTAssertTrue(run.events.contains(where:{$0.hasPrefix("Takeoff")}))
    }

    func testFixedWingTakeoffRequiresComputedLiftAndConfiguredSpeed() throws {
        var input=NativeWorldLabVehicleInput()
        input.mode = .fixedWing
        input.massKg=800
        input.wingAreaM2=18
        input.wingLiftCoefficient=1.4
        input.takeoffSpeedMps=25
        input.maxCruiseThrustN=4000
        input.maxWheelForceN=10000
        input.motorMaxPowerW=350000
        input.batteryMaxCurrentA=700
        input.durationSeconds=60
        input.maxSpeedMps=100
        let run=try NativeWorldLabVehicle.evaluate(project(),"wing-takeoff",input)
        XCTAssertTrue(run.samples.contains(where:{$0.airborne}))
    }

    func testInsufficientWingLiftAndInvalidInputsFailClosed() throws {
        var input=NativeWorldLabVehicleInput()
        input.mode = .fixedWing
        input.wingAreaM2=2
        input.wingLiftCoefficient=1
        input.takeoffSpeedMps=25
        input.maxCruiseThrustN=2500
        let run=try NativeWorldLabVehicle.evaluate(project(),"wing-blocked",input)
        XCTAssertEqual(run.outcome,"unable-to-takeoff")
        XCTAssertTrue(run.preflight.contains(where:{$0.contains("Wing lift at configured takeoff speed is below")}))
        input.massKg=Double.nan
        XCTAssertThrowsError(try NativeWorldLabVehicle.validate(input))
    }

    func testNativeEvidenceIsPortableCodableAndCarriesProjectRevision() throws {
        let source=try project()
        let run=try NativeWorldLabVehicle.evaluate(source,"portable-evidence",NativeWorldLabVehicleInput())
        XCTAssertEqual(run.projectRevision,source.revision)
        XCTAssertEqual(run.evidence,"physics-model-computed")
        XCTAssertTrue(run.validity.localizedCaseInsensitiveContains("no suspension"))
        let data=try JSONEncoder().encode(run)
        let decoded=try JSONDecoder().decode(NativeWorldLabVehicleRun.self,from:data)
        XCTAssertEqual(decoded.projectId,source.id)
        XCTAssertEqual(decoded.samples.count,run.samples.count)
    }
}
