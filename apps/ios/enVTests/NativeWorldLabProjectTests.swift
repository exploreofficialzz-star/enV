import XCTest
@testable import enV

final class NativeWorldLabProjectTests: XCTestCase {
    func testNativeDigitalTruthTableInventAndRejectCycles() throws {
        let start=try NativeWorldLabEditor.startDigitalInvention(
            NativeWorldLabEditor.blank())
        let first=try NativeWorldLabProject.decode(start)
        let network=try XCTUnwrap(first.digitalNetworks?.first)
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(network)["output_q"],1)
        let setA=try NativeWorldLabEditor.digitalSwitch(start,
            networkId:network.id,inputId:"input_a",value:true)
        let setB=try NativeWorldLabEditor.digitalSwitch(setA,
            networkId:network.id,inputId:"input_b",value:true)
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(
            XCTUnwrap(NativeWorldLabProject.decode(setB).digitalNetworks?.first))["output_q"],0)
        let edited=try NativeWorldLabEditor.digitalTruthBit(setB,
            networkId:network.id,gateId:"invented_gate",row:3,bit:1)
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(
            XCTUnwrap(NativeWorldLabProject.decode(edited).digitalNetworks?.first))["output_q"],1)
        var corrupt=try XCTUnwrap(JSONSerialization.jsonObject(with:setB) as? [String:Any])
        var networks=try XCTUnwrap(corrupt["digitalNetworks"] as? [[String:Any]])
        var gates=try XCTUnwrap(networks[0]["gates"] as? [[String:Any]])
        gates[0]["inputNodeIds"]=["invented_gate","input_b"]
        networks[0]["gates"]=gates;corrupt["digitalNetworks"]=networks
        XCTAssertThrowsError(try NativeWorldLabProject.decode(
            JSONSerialization.data(withJSONObject:corrupt)))
    }

    private func sharedFixture() throws -> Data {
        let url=try XCTUnwrap(Bundle(for: Self.self).url(forResource:"world-lab-project-v1",withExtension:"json"))
        return try Data(contentsOf:url)
    }
    func testSharedProjectAndVolumeMatchesWebAndAndroid() throws {
        let project=try NativeWorldLabProject.decode(sharedFixture())
        XCTAssertEqual(project.entities.count,2)
        XCTAssertEqual(project.materials.count,1)
        XCTAssertEqual(try XCTUnwrap(project.entities.first).volumeMetersCubed,24,accuracy:1e-10)
        XCTAssertEqual(project.entities.first?.materialId,"mat-1")
        XCTAssertNil(project.entities.last?.materialId)
    }
    func testOptionalCircuitNetworkRoundTripsWithPortValidation() throws {
        let base=try NativeWorldLabEditor.blank()
        var root=try XCTUnwrap(JSONSerialization.jsonObject(with:base) as? [String:Any])
        let nodes:[[String:Any]]=[
            ["id":"ground","label":"Ground"],["id":"supply","label":"Power rail"]]
        let components:[[String:Any]]=[
            ["id":"battery","kind":"dc-source","positiveNodeId":"supply",
             "negativeNodeId":"ground","voltageV":9.0],
            ["id":"load","kind":"resistor","positiveNodeId":"supply",
             "negativeNodeId":"ground","resistanceOhm":100.0]]
        root["networks"]=[["id":"power","name":"DC network",
            "groundNodeId":"ground","nodes":nodes,"components":components]]
        let encoded=try JSONSerialization.data(withJSONObject:root)
        let decoded=try NativeWorldLabProject.decode(encoded)
        XCTAssertEqual(decoded.networks?.first?.components.count,2)
        root["networks"]=[["id":"power","name":"DC network",
            "groundNodeId":"missing","nodes":nodes,"components":components]]
        XCTAssertThrowsError(try NativeWorldLabProject.decode(
            JSONSerialization.data(withJSONObject:root)))
    }
    func testNativeConnectedDcPowerAndParallelResistors() throws {
        let initial=try NativeWorldLabEditor.blank()
        let source=try NativeWorldLabEditor.starterCircuit(initial)
        let project=try NativeWorldLabProject.decode(source)
        let circuit=try XCTUnwrap(project.networks?.first)
        let result=try NativeWorldLabDc.solve(circuit,project:project)
        XCTAssertEqual(result.nodeVoltagesV["supply"],9)
        XCTAssertEqual(try XCTUnwrap(result.branchCurrentsA["load"]),0.09,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(result.branchCurrentsA["source"]),-0.09,accuracy:1e-12)
        XCTAssertEqual(result.powerResidualW,0,accuracy:1e-10)
        let updated=try NativeWorldLabEditor.addParallelResistor(source)
        let parallel=try NativeWorldLabProject.decode(updated)
        let second=try NativeWorldLabDc.solve(
            XCTUnwrap(parallel.networks?.first),project:parallel)
        XCTAssertEqual(second.resistorHeatW/9,0.135,accuracy:1e-12)
    }
    func testNativeArchimedesFluidWithUnknownMass() throws {
        let base=try NativeWorldLabEditor.blank()
        let solid=try NativeWorldLabEditor.addSolid(base,shape:"box",id:"float")
        let withMat=try NativeWorldLabEditor.addHypotheticalMaterial(
            solid,name:"Assumed foam",densityKgM3:500,id:"foam")
        let data=try NativeWorldLabEditor.assignMaterial(
            withMat,solidId:"float",materialId:"foam")
        let p=try NativeWorldLabProject.decode(data)
        let result=try NativeWorldLabHydrostatics.evaluate(
            p,entityId:"float",fluidDensityKgM3:1000,immersionDepthM:0.5)
        XCTAssertEqual(result.displacedVolumeM3,0.5,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(result.equilibriumDraftM),0.5,accuracy:1e-10)
        XCTAssertEqual(try XCTUnwrap(result.netUpwardForceN),0,accuracy:1e-9)
        let unknown=try NativeWorldLabProject.decode(solid)
        let notMeasured=try NativeWorldLabHydrostatics.evaluate(
            unknown,entityId:"float",fluidDensityKgM3:1000,immersionDepthM:0.5)
        XCTAssertNil(notMeasured.equilibriumDraftM)
        XCTAssertEqual(notMeasured.status,"unknown-mass")
    }
    func testInventedOhmicAssumptionIsNotAssignedWithoutConsent() throws {
        let initial=try NativeWorldLabEditor.starterCircuit(
            NativeWorldLabEditor.blank())
        let unknown=try NativeWorldLabEditor.inventOhmicDevice(initial,
            name:"Novel conductor",assumption:"Not yet characterized")
        let p1=try NativeWorldLabProject.decode(unknown)
        XCTAssertThrowsError(try NativeWorldLabDc.solve(
            XCTUnwrap(p1.networks?.first),project:p1))
        let supported=try NativeWorldLabEditor.inventOhmicDevice(initial,
            name:"Novel filament",assumption:"Assume Ohmic 20 Ω",assumedResistanceOhm:20)
        let p2=try NativeWorldLabProject.decode(supported)
        let graph=try XCTUnwrap(p2.networks?.first)
        let component=try XCTUnwrap(graph.components.first(where:{$0.kind=="hypothetical-device"}))
        XCTAssertEqual(component.assumedResistanceOhm,20)
        let run=try NativeWorldLabDc.solve(graph,project:p2)
        XCTAssertEqual(try XCTUnwrap(run.branchCurrentsA[component.id]),0.45,accuracy:1e-10)
        XCTAssertEqual(run.powerResidualW,0,accuracy:1e-8)
    }
    func testNativeFloatingDynamicsChangesSubmergedVolumeAndAccountsForEnergy() throws {
        var data=try NativeWorldLabEditor.blank()
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"float")
        data=try NativeWorldLabEditor.addHypotheticalMaterial(data,
            name:"Assumed lightweight matter",densityKgM3:500,id:"foam")
        data=try NativeWorldLabEditor.assignMaterial(
            data,solidId:"float",materialId:"foam")
        let project=try NativeWorldLabProject.decode(data)
        let input=NativeLabFluidMotionInput(fluidDensityKgM3:1000,
            waterSurfaceHeightM:1,startingBottomHeightM:0,
            linearDragNsPerM:200,durationSeconds:3)
        let run=try NativeWorldLabFluidMotion.evaluate(
            project,entityId:"float",input:input)
        XCTAssertGreaterThan(run.samples.count,500)
        XCTAssertEqual(run.samples[0].displacedVolumeM3,1,accuracy:1e-12)
        XCTAssertGreaterThan(run.samples[150].bottomHeightM,0)
        XCTAssertLessThan(run.samples[150].immersionDepthM,1)
        XCTAssertTrue(run.samples.allSatisfy({$0.energyResidualJ.isFinite}))
        var impossible=input
        impossible.linearDragNsPerM = .nan
        XCTAssertThrowsError(try NativeWorldLabFluidMotion.evaluate(
            project,entityId:"float",input:impossible))
    }
    func testPortableAssemblyMembershipRejectsUnknownSolids() throws {
        let original=try NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),
                shape:"box",id:"a"),shape:"box",id:"b")
        var root=try XCTUnwrap(JSONSerialization.jsonObject(with:original) as? [String:Any])
        root["assemblies"]=[["id":"group","name":"Two invented parts","entityIds":["a","b"]]]
        let combined=try NativeWorldLabProject.decode(JSONSerialization.data(withJSONObject:root))
        XCTAssertEqual(combined.assemblies?.first?.entityIds.count,2)
        root["assemblies"]=[["id":"group","name":"Broken","entityIds":["a","missing"]]]
        XCTAssertThrowsError(try NativeWorldLabProject.decode(
            JSONSerialization.data(withJSONObject:root)))
    }
    func testNativeChemicalReactionThermalFeedbackAndEnergy() throws {
        var input=NativeChemicalThermalInput()
        input.activationEnergyJPerMol=0
        input.coolingConductanceWPerK=0
        input.durationSeconds=4
        let run=try NativeWorldLabChemicalThermal.evaluate(input)
        XCTAssertGreaterThan(try XCTUnwrap(run.samples.last?.productFormedMol),0.5)
        XCTAssertGreaterThan(try XCTUnwrap(run.samples.last?.temperatureK),300)
        XCTAssertLessThan(abs(try XCTUnwrap(run.samples.last?.energyResidualJ)),1e-4)
        input.heatCapacityJPerK=0
        XCTAssertThrowsError(try NativeWorldLabChemicalThermal.evaluate(input))
    }
    func testRejectsUnsupportedInputAndWrongMaterialReference() throws {
        var data=try sharedFixture()
        let original=try XCTUnwrap(String(data:data,encoding:.utf8))
        data=Data(original.replacingOccurrences(of:"\"schemaVersion\": 1",with:"\"schemaVersion\": 2").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(data))
        let bad=Data(original.replacingOccurrences(of:"\"materialId\": \"mat-1\"",with:"\"materialId\": \"missing\"").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(bad))
        let script=Data(original.replacingOccurrences(of:"\"revision\": 0,",with:"\"revision\": 0, \"script\":\"alert(1)\",").utf8)
        XCTAssertThrowsError(try NativeWorldLabProject.decode(script))
    }
}
