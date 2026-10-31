import XCTest
@testable import enV

final class NativeWorldLabEditorTests: XCTestCase {
    func testCreateEditAndPortableRoundtrip() throws {
        var data=try NativeWorldLabEditor.blank()
        XCTAssertEqual(try NativeWorldLabProject.decode(data).entities.count,0)
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"new-solid")
        data=try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Unknown lattice",
                                                               densityKgM3:440,id:"new-matter")
        data=try NativeWorldLabEditor.assignMaterial(data,solidId:"new-solid",
                                                     materialId:"new-matter")
        data=try NativeWorldLabEditor.renameSolid(data,id:"new-solid",name:"New invention")
        data=try NativeWorldLabEditor.resizeSolid(data,id:"new-solid",dimensionsMeters:[2,2,2])
        let parsed=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(parsed.revision,5)
        XCTAssertEqual(parsed.entities[0].name,"New invention")
        XCTAssertEqual(parsed.entities[0].materialId,"new-matter")
        XCTAssertEqual(try XCTUnwrap(parsed.materials[0].densityKgM3),440)
        XCTAssertGreaterThan(parsed.entities[0].volumeMetersCubed,4)
    }
    func testPortableGridSnappingAndEuclideanMeasurements() throws {
        var data=try NativeWorldLabEditor.blank()
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        data=try NativeWorldLabEditor.positionSolid(
            data,id:"a",positionMeters:[0.24,-0.26,2.49])
        data=try NativeWorldLabEditor.snapSolid(data,id:"a",gridMeters:0.5)
        let first=try XCTUnwrap(NativeWorldLabProject.decode(data)
            .entities.first(where:{$0.id=="a"}))
        XCTAssertEqual(first.positionMeters,[0,-0.5,2.5])
        data=try NativeWorldLabEditor.positionSolid(
            data,id:"b",positionMeters:[3,3.5,14.5])
        let parsed=try NativeWorldLabProject.decode(data)
        let distance=try NativeWorldLabEditor.measureCenters(
            parsed,fromId:"a",toId:"b")
        XCTAssertEqual(distance.centerDistanceM,13,accuracy:1e-12)
        XCTAssertEqual(distance.horizontalDistanceM,hypot(3,12),accuracy:1e-12)
        XCTAssertThrowsError(try NativeWorldLabEditor.snapSolid(
            data,id:"a",gridMeters:0))
        XCTAssertThrowsError(try NativeWorldLabEditor.positionSolid(
            data,id:"a",positionMeters:[Double.nan,0,0]))
    }
    func testNativeSeriesJunctionCircuitObeysKirchhoffPower() throws {
        var data=try NativeWorldLabEditor.starterCircuit(
            NativeWorldLabEditor.blank())
        data=try NativeWorldLabEditor.addCircuitNode(data,label:"Middle",id:"middle")
        data=try NativeWorldLabEditor.rewireCircuitPart(
            data,id:"load",positive:"supply",negative:"middle")
        data=try NativeWorldLabEditor.addCircuitResistor(
            data,positive:"middle",negative:"ground",resistanceOhm:200,id:"load2")
        let p=try NativeWorldLabProject.decode(data)
        let result=try NativeWorldLabDc.solve(
            XCTUnwrap(p.networks?.first),project:p)
        XCTAssertEqual(try XCTUnwrap(result.nodeVoltagesV["middle"]),6,accuracy:1e-10)
        XCTAssertEqual(try XCTUnwrap(result.branchCurrentsA["load"]),0.03,accuracy:1e-10)
        XCTAssertEqual(try XCTUnwrap(result.branchCurrentsA["load2"]),0.03,accuracy:1e-10)
        XCTAssertEqual(result.powerResidualW,0,accuracy:1e-10)
        XCTAssertThrowsError(try NativeWorldLabEditor.removeUnusedCircuitNode(data,id:"middle"))
        XCTAssertThrowsError(try NativeWorldLabEditor.rewireCircuitPart(
            data,id:"load",positive:"middle",negative:"middle"))
    }
    func testNativeUndoRedoPreservesMonotonicProjectRevisions() throws {
        var history=NativeWorldLabEditHistory()
        let original=try NativeWorldLabEditor.blank()
        let edited=try NativeWorldLabEditor.addSolid(original,shape:"box",id:"invented")
        try history.record(before:original,after:edited)
        XCTAssertTrue(history.canUndo)
        let undone=try XCTUnwrap(history.undo(current:edited))
        XCTAssertTrue(try NativeWorldLabProject.decode(undone).entities.isEmpty)
        XCTAssertEqual(try NativeWorldLabProject.decode(undone).revision,2)
        let redone=try XCTUnwrap(history.redo(current:undone))
        XCTAssertEqual(try NativeWorldLabProject.decode(redone).entities.count,1)
        XCTAssertEqual(try NativeWorldLabProject.decode(redone).revision,3)
        history.clear()
        XCTAssertFalse(history.canUndo)
        XCTAssertFalse(history.canRedo)
    }
    func testNativeAssemblyGroupMoveAndNondestructiveUngroup() throws {
        var data=try NativeWorldLabEditor.blank()
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"c")
        data=try NativeWorldLabEditor.createVisualAssembly(
            data,name:"Assembly",entityIds:["a","b"],id:"group")
        let before=try NativeWorldLabProject.decode(data)
        data=try NativeWorldLabEditor.moveVisualAssembly(
            data,id:"group",deltaMeters:[1,0,-2])
        let after=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(after.entities[0].positionMeters[0],
            before.entities[0].positionMeters[0]+1,accuracy:1e-12)
        XCTAssertEqual(after.entities[1].positionMeters[2],
            before.entities[1].positionMeters[2]-2,accuracy:1e-12)
        XCTAssertEqual(after.entities[2].positionMeters,before.entities[2].positionMeters)
        XCTAssertThrowsError(try NativeWorldLabEditor.createVisualAssembly(
            data,name:"Overlap",entityIds:["a","c"]))
        data=try NativeWorldLabEditor.ungroupVisualAssembly(data,id:"group")
        XCTAssertEqual(try NativeWorldLabProject.decode(data).entities.count,3)
        XCTAssertEqual(try NativeWorldLabProject.decode(data).assemblies?.count,0)
    }
    func testDigitalIndicatorCanReadAnInventedSwitchAndRejectUnknownSource() throws {
        var data=try NativeWorldLabEditor.startDigitalInvention(
            NativeWorldLabEditor.blank(),id:"invented")
        data=try NativeWorldLabEditor.digitalOutputSource(
            data,networkId:"invented",outputId:"output_q",sourceNodeId:"input_a")
        data=try NativeWorldLabEditor.digitalSwitch(
            data,networkId:"invented",inputId:"input_a",value:true)
        let project=try NativeWorldLabProject.decode(data)
        let network=try XCTUnwrap(project.digitalNetworks?.first)
        XCTAssertEqual(network.outputs[0].sourceNodeId,"input_a")
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(network)["output_q"],1)
        data=try NativeWorldLabEditor.addDigitalGate(
            data,networkId:"invented",name:"My next device",
            assumption:"Assumed one-input gate",inputNodeIds:["invented_gate"],id:"next")
        data=try NativeWorldLabEditor.digitalTruthBit(
            data,networkId:"invented",gateId:"next",row:1,bit:1)
        data=try NativeWorldLabEditor.digitalOutputSource(
            data,networkId:"invented",outputId:"output_q",sourceNodeId:"next")
        let chained=try XCTUnwrap(NativeWorldLabProject.decode(data).digitalNetworks?.first)
        XCTAssertEqual(chained.gates.count,2)
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(chained)["output_q"],1)
        XCTAssertThrowsError(try NativeWorldLabEditor.addDigitalGate(
            data,networkId:"invented",name:"Broken",
            assumption:"Assumed",inputNodeIds:["missing"]))
        XCTAssertThrowsError(try NativeWorldLabEditor.digitalOutputSource(
            data,networkId:"invented",outputId:"output_q",sourceNodeId:"absent"))
    }
    func testSchemaEnforcedForEveryMutation() throws {
        let data=try NativeWorldLabEditor.blank()
        XCTAssertThrowsError(try NativeWorldLabEditor.addSolid(data,shape:"freeform"))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Impossible",
                                                                               densityKgM3:Double.nan))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Impossible",
                                                                               densityKgM3:Double.infinity))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Impossible",
                                                                               densityKgM3:-Double.infinity))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Impossible",
                                                                               densityKgM3:1,
                                                                               youngModulusPa:Double.nan))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"Impossible",
                                                                               densityKgM3:-1))
        XCTAssertThrowsError(try NativeWorldLabEditor.addHypotheticalMaterial(data,name:"",
                                                                               densityKgM3:1))
        let withSphere=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"sphere")
        XCTAssertThrowsError(try NativeWorldLabEditor.resizeSolid(withSphere,id:"sphere",
                                                                    dimensionsMeters:[2,1,2]))
        XCTAssertThrowsError(try NativeWorldLabEditor.resizeSolid(withSphere,id:"sphere",
                                                                    dimensionsMeters:[Double.nan,1,1]))
        XCTAssertThrowsError(try NativeWorldLabEditor.resizeSolid(withSphere,id:"sphere",
                                                                    dimensionsMeters:[Double.infinity,1,1]))
        XCTAssertThrowsError(try NativeWorldLabEditor.resizeSolid(withSphere,id:"sphere",
                                                                    dimensionsMeters:[1,1]))
        XCTAssertThrowsError(try NativeWorldLabEditor.assignMaterial(withSphere,solidId:"sphere",
                                                                      materialId:"missing"))
    }
}
