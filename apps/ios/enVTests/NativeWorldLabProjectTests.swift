import XCTest
@testable import enV

final class NativeWorldLabProjectTests: XCTestCase {
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
