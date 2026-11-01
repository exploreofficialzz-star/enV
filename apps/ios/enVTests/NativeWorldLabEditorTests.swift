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
        data=try NativeWorldLabEditor.addDigitalGate(
            data,networkId:"invented",name:"Invented two-port",
            assumption:"Assumed OR",inputNodeIds:["input_a","input_b"],id:"two-input")
        data=try NativeWorldLabEditor.digitalTruthBit(
            data,networkId:"invented",gateId:"two-input",row:2,bit:1)
        data=try NativeWorldLabEditor.digitalOutputSource(
            data,networkId:"invented",outputId:"output_q",sourceNodeId:"two-input")
        let multi=try XCTUnwrap(NativeWorldLabProject.decode(data).digitalNetworks?.first)
        XCTAssertEqual(try NativeWorldLabDigitalLogic.evaluate(multi)["output_q"],1)
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
    func testInventedMaterialRevisionPreservesPortableSolidReference() throws {
        var data=try NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.blank(),shape:"box",id:"solid")
        data=try NativeWorldLabEditor.addHypotheticalMaterial(
            data,name:"Invented",densityKgM3:nil,
            youngModulusPa:nil,id:"invented")
        data=try NativeWorldLabEditor.assignMaterial(
            data,solidId:"solid",materialId:"invented")
        let before=try NativeWorldLabProject.decode(data)
        let changed=try NativeWorldLabEditor.reviseHypotheticalMaterial(
            data,id:"invented",name:"Changed hypothesis",
            densityKgM3:45,youngModulusPa:2e11)
        let after=try NativeWorldLabProject.decode(changed)
        XCTAssertEqual(after.revision,before.revision+1)
        XCTAssertEqual(after.entities.first?.materialId,"invented")
        XCTAssertEqual(after.materials.first?.id,"invented")
        XCTAssertEqual(after.materials.first?.evidence,"hypothetical-user-assumed")
        XCTAssertEqual(after.materials.first?.youngModulusPa,2e11)
        XCTAssertThrowsError(try NativeWorldLabEditor.reviseHypotheticalMaterial(
            changed,id:"invented",name:"Invalid",
            densityKgM3:Double.nan,youngModulusPa:1))
        XCTAssertThrowsError(try NativeWorldLabEditor.reviseHypotheticalMaterial(
            changed,id:"missing",name:"Unavailable",densityKgM3:1,youngModulusPa:1))
    }


    func testNativeCADRotationScaleDuplicatePatternAndCameraRoundtrip() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"cad")
        data=try NativeWorldLabEditor.rotateSolid(data,id:"cad",axis:2,deltaDegrees:45)
        var parsed=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(parsed.entities[0].effectiveRotationRadians[2],Double.pi/4,accuracy:1e-12)
        data=try NativeWorldLabEditor.scaleSolid(data,id:"cad",factors:[2,1,1])
        XCTAssertEqual(try NativeWorldLabProject.decode(data).entities[0].dimensionsMeters[0],2,accuracy:1e-12)
        data=try NativeWorldLabEditor.duplicateSolid(data,id:"cad",offsetMeters:[2,0,0],newId:"copy")
        XCTAssertEqual(try NativeWorldLabProject.decode(data).entities.count,2)
        data=try NativeWorldLabEditor.linearPattern(data,id:"copy",axis:0,spacingMeters:3,copies:2)
        parsed=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(parsed.entities.count,4)
        XCTAssertEqual(try XCTUnwrap(parsed.entities.last?.positionMeters[0]),8,accuracy:1e-12)
        data=try NativeWorldLabEditor.saveCameraViewpoint(data,
            positionMeters:[10,8,-10],lookingAtMeters:[1,2,3])
        parsed=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(parsed.cameraPositionMeters,[10,8,-10])
        XCTAssertEqual(parsed.cameraLookingAtMeters,[1,2,3])
    }
    func testNativeSketchExtrusionsCreatePortableBoxAndCylinderProfiles() throws {
        var data=try NativeWorldLabEditor.extrudeRectangle(
            NativeWorldLabEditor.blank(),widthMeters:2,depthMeters:3,heightMeters:4,id:"rect")
        data=try NativeWorldLabEditor.extrudeCircle(data,radiusMeters:0.5,heightMeters:2,id:"circle")
        let p=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(p.entities.map{$0.shape},["box","cylinder"])
        XCTAssertEqual(p.entities[0].dimensionsMeters,[2,4,3])
        XCTAssertEqual(p.entities[1].dimensionsMeters,[1,2,1])
        XCTAssertEqual(p.entities[0].positionMeters,[0,2,0])
    }
    func testNativeSketchProfilesRejectInvalidDimensions() throws {
        let data=try NativeWorldLabEditor.blank()
        XCTAssertThrowsError(try NativeWorldLabEditor.extrudeRectangle(
            data,widthMeters:0,depthMeters:1,heightMeters:1))
        XCTAssertThrowsError(try NativeWorldLabEditor.extrudeCircle(
            data,radiusMeters:0,heightMeters:1))
    }
    func testNativeCADRejectsUnsafeTransformParameters() throws {
        let data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"sphere",id:"s")
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateSolid(data,id:"s",axis:4,deltaDegrees:15))
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateSolid(data,id:"s",axis:0,deltaDegrees:Double.nan))
        XCTAssertThrowsError(try NativeWorldLabEditor.scaleSolid(data,id:"s",factors:[-1,1,1]))
        XCTAssertThrowsError(try NativeWorldLabEditor.linearPattern(data,id:"s",axis:0,spacingMeters:0,copies:2))
    }

    func testWGS84ProjectOriginPersistsAndClears() throws {
        var data=try NativeWorldLabEditor.blank()
        data=try NativeWorldLabEditor.setGeodeticOrigin(data,
            origin:NativeGeodetic(latitudeDegrees:51.5074,longitudeDegrees:-0.1278,heightMeters:35))
        var p=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(try XCTUnwrap(p.world.geodeticOrigin?.latitudeDegrees),51.5074,accuracy:1e-12)
        XCTAssertEqual(try XCTUnwrap(p.world.geodeticOrigin?.longitudeDegrees),-0.1278,accuracy:1e-12)
        data=try NativeWorldLabEditor.setGeodeticOrigin(data,origin:nil)
        p=try NativeWorldLabProject.decode(data)
        XCTAssertNil(p.world.geodeticOrigin)
        XCTAssertThrowsError(try NativeWorldLabEditor.setGeodeticOrigin(data,
            origin:NativeGeodetic(latitudeDegrees:91,longitudeDegrees:0,heightMeters:0)))
    }

    func testNativeMirrorAndCircularPatternKeepAValidPortableProject() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"base")
        data=try NativeWorldLabEditor.mirrorSolid(data,id:"base",axis:0,planeMeters:1)
        var p=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(p.entities[0].positionMeters[0],2,accuracy:1e-12)
        data=try NativeWorldLabEditor.circularPattern(data,id:"base",axis:2,
            centerMeters:[0,0.5,0],instances:4)
        p=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(p.entities.count,4)
        for e in p.entities.dropFirst(){
            XCTAssertEqual(hypot(e.positionMeters[0],e.positionMeters[1]-0.5),2,accuracy:1e-9)
        }
    }


    func testMultiSelectionCADTransformsAreAtomicAndRespectRotatedPrimitiveBounds() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"cylinder",id:"c")
        data=try NativeWorldLabEditor.positionSolid(data,id:"a",positionMeters:[0,0.5,0])
        data=try NativeWorldLabEditor.positionSolid(data,id:"b",positionMeters:[4,0.5,0])
        data=try NativeWorldLabEditor.positionSolid(data,id:"c",positionMeters:[10,0.5,0])
        let initial=try NativeWorldLabProject.decode(data).revision
        data=try NativeWorldLabEditor.rotateSolids(data,ids:["a","b"],axis:2,degrees:45)
        var project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.revision,initial+1)
        XCTAssertEqual(project.entities[0].effectiveRotationRadians[2],Double.pi/4,accuracy:1e-12)
        XCTAssertEqual(project.entities[1].effectiveRotationRadians[2],Double.pi/4,accuracy:1e-12)
        data=try NativeWorldLabEditor.scaleSolids(data,ids:["a","b","c"],factors:[2,3,4])
        project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.entities[0].dimensionsMeters,[2,3,4])
        XCTAssertEqual(project.entities[1].dimensionsMeters[0],project.entities[1].dimensionsMeters[2],accuracy:1e-12)
        XCTAssertEqual(project.entities[2].dimensionsMeters[0],project.entities[2].dimensionsMeters[2],accuracy:1e-12)
        data=try NativeWorldLabEditor.alignSolids(data,ids:["a","b","c"],axis:0,alignment:"min")
        project=try NativeWorldLabProject.decode(data)
        let extents=project.entities.map{part->Double in
            let d=part.dimensionsMeters,angle=part.effectiveRotationRadians[2]
            return (abs(cos(angle))*d[0]+abs(sin(angle))*d[1])/2
        }
        let minima=project.entities.enumerated().map{index,part in
            part.positionMeters[0]-extents[index]
        }
        XCTAssertLessThan((minima.max() ?? 0)-(minima.min() ?? 0),1e-8)
        data=try NativeWorldLabEditor.distributeSolids(data,ids:["a","b","c"],axis:0,gapMeters:0.5)
        project=try NativeWorldLabProject.decode(data)
        let sorted=project.entities.enumerated().sorted{$0.element.positionMeters[0]<$1.element.positionMeters[0]}
        for index in 0..<2 {
            let left=sorted[index].element.positionMeters[0]+extents[sorted[index].offset]
            let right=sorted[index+1].element.positionMeters[0]-extents[sorted[index+1].offset]
            XCTAssertEqual(right-left,0.5,accuracy:1e-8)
        }
        data=try NativeWorldLabEditor.duplicateSolids(data,ids:["a","b"],offsetMeters:[10,0,0])
        XCTAssertEqual(try NativeWorldLabProject.decode(data).entities.count,5)
    }
    func testMultiSelectionCADRejectsInvalidIDsAndTransforms() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateSolids(data,ids:["a","missing"],axis:0,degrees:10))
        XCTAssertThrowsError(try NativeWorldLabEditor.scaleSolids(data,ids:["a","a"],factors:[1,1,1]))
        XCTAssertThrowsError(try NativeWorldLabEditor.duplicateSolids(data,ids:["a","b"],offsetMeters:[Double.nan,0,0]))
        XCTAssertThrowsError(try NativeWorldLabEditor.distributeSolids(data,ids:["a","b"],axis:0,gapMeters:1))
    }


    func testMultiSelectionTranslateMirrorAndPatternOperations() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"cylinder",id:"c")
        let before=try NativeWorldLabProject.decode(data)
        let beforePosition=before.entities[0].positionMeters
        data=try NativeWorldLabEditor.translateSolids(data,ids:["a","b","c"],deltaMeters:[1,2,3])
        var project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.entities[0].positionMeters[0],beforePosition[0]+1,accuracy:1e-12)
        XCTAssertEqual(project.entities[1].positionMeters[1],before.entities[1].positionMeters[1]+2,accuracy:1e-12)
        data=try NativeWorldLabEditor.mirrorSolids(data,ids:["a","b","c"],axis:0,planeMeters:0)
        project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.entities[0].positionMeters[0],-(beforePosition[0]+1),accuracy:1e-12)
        data=try NativeWorldLabEditor.linearPatternSolids(data,ids:["a","b"],axis:2,spacingMeters:2,copies:2)
        project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.entities.count,7)
        data=try NativeWorldLabEditor.circularPatternSolids(data,ids:["a","b"],axis:1,
            centerMeters:[0,0,0],instances:4)
        project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.entities.count,13)
        XCTAssertTrue(project.entities.allSatisfy{$0.positionMeters.allSatisfy{$0.isFinite}})
    }
    func testMultiSelectionTranslateAndPatternsRejectInvalidInputs() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        XCTAssertThrowsError(try NativeWorldLabEditor.translateSolids(data,ids:["a","b"],deltaMeters:[Double.nan,0,0]))
        XCTAssertThrowsError(try NativeWorldLabEditor.mirrorSolids(data,ids:["a","missing"],axis:0,planeMeters:0))
        XCTAssertThrowsError(try NativeWorldLabEditor.linearPatternSolids(data,ids:["a","b"],axis:0,spacingMeters:0,copies:2))
        XCTAssertThrowsError(try NativeWorldLabEditor.circularPatternSolids(data,ids:["a","b"],axis:0,centerMeters:[0,0,0],instances:1))
    }


    func testGroupRotationAndScaleMoveSelectedPartsAroundSharedCentroid() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"outside")
        data=try NativeWorldLabEditor.positionSolid(data,id:"a",positionMeters:[-2,0.5,0])
        data=try NativeWorldLabEditor.positionSolid(data,id:"b",positionMeters:[2,0.5,0])
        data=try NativeWorldLabEditor.positionSolid(data,id:"outside",positionMeters:[20,0.5,0])
        let initial=try NativeWorldLabProject.decode(data).revision

        data=try NativeWorldLabEditor.rotateGroupAroundCentroid(data,ids:["a","b"],axis:1,degrees:90)
        var project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.revision,initial+1)
        XCTAssertEqual(project.entities[0].positionMeters[0],0,accuracy:1e-8)
        XCTAssertEqual(project.entities[0].positionMeters[2],2,accuracy:1e-8)
        XCTAssertEqual(project.entities[1].positionMeters[0],0,accuracy:1e-8)
        XCTAssertEqual(project.entities[1].positionMeters[2],-2,accuracy:1e-8)
        XCTAssertEqual(project.entities[0].effectiveRotationRadians[1],Double.pi/2,accuracy:1e-8)
        XCTAssertEqual(project.entities[2].positionMeters[0],20,accuracy:1e-8)

        data=try NativeWorldLabEditor.scaleGroupAroundCentroid(data,ids:["a","b"],factor:2)
        project=try NativeWorldLabProject.decode(data)
        XCTAssertEqual(project.revision,initial+2)
        XCTAssertEqual(project.entities[0].positionMeters[2],4,accuracy:1e-8)
        XCTAssertEqual(project.entities[1].positionMeters[2],-4,accuracy:1e-8)
        XCTAssertEqual(project.entities[0].dimensionsMeters,[2,2,2])
        XCTAssertEqual(project.entities[1].dimensionsMeters,[2,2,2])
        XCTAssertEqual(project.entities[2].positionMeters[0],20,accuracy:1e-8)
        XCTAssertEqual(project.entities[2].dimensionsMeters,[1,1,1])
    }
    func testGroupCADRejectsMissingMembersAndUnsafeParameters() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"b")
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateGroupAroundCentroid(data,ids:["a","missing"],axis:1,degrees:90))
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateGroupAroundCentroid(data,ids:["a","a"],axis:1,degrees:90))
        XCTAssertThrowsError(try NativeWorldLabEditor.rotateGroupAroundCentroid(data,ids:["a","b"],axis:1,degrees:Double.nan))
        XCTAssertThrowsError(try NativeWorldLabEditor.scaleGroupAroundCentroid(data,ids:["a","b"],factor:0))
    }


    func testSketchExtrusionsHonorBasePlacementAndOrientation() throws {
        let data=try NativeWorldLabEditor.extrudeRectangle(NativeWorldLabEditor.blank(),
            widthMeters:2,depthMeters:3,heightMeters:4,id:"placed",
            centerMeters:[1,2,3],rotationRadians:[0,0,Double.pi/2])
        let solid=try XCTUnwrap(NativeWorldLabProject.decode(data).entities.first)
        XCTAssertEqual(solid.positionMeters,[-1,2,3])
        XCTAssertEqual(solid.effectiveRotationRadians[2],Double.pi/2,accuracy:1e-12)
    }
    func testSketchExtrusionsRejectInvalidPlacementAndOrientation() throws {
        XCTAssertThrowsError(try NativeWorldLabEditor.extrudeRectangle(
            NativeWorldLabEditor.blank(),widthMeters:2,depthMeters:3,heightMeters:4,
            centerMeters:[100000,100000,100000]))
        XCTAssertThrowsError(try NativeWorldLabEditor.extrudeCircle(
            NativeWorldLabEditor.blank(),radiusMeters:0.5,heightMeters:2,
            rotationRadians:[0,Double.nan,0]))
    }


    func testCADExchangeRoundTripsSupportedGeometryAndReferencedMaterials() throws {
        var source=try NativeWorldLabEditor.addSolid(try NativeWorldLabEditor.blank(),shape:"box",id:"box-source")
        source=try NativeWorldLabEditor.positionSolid(source,id:"box-source",positionMeters:[1,2,3])
        source=try NativeWorldLabEditor.rotateSolid(source,id:"box-source",axis:2,degrees:30)
        source=try NativeWorldLabEditor.addHypotheticalMaterial(source,name:"Assumed alloy",
            densityKgM3:7850,youngModulusPa:2e11,id:"mat-used")
        source=try NativeWorldLabEditor.assignMaterial(source,solidId:"box-source",materialId:"mat-used")
        source=try NativeWorldLabEditor.addHypotheticalMaterial(source,name:"Unused",densityKgM3:nil,
            youngModulusPa:nil,id:"mat-unused")
        let exported=try NativeWorldLabEditor.exportCADExchange(source)
        let bundle=try XCTUnwrap(JSONSerialization.jsonObject(with:exported) as? [String:Any])
        XCTAssertEqual(bundle["format"] as? String,"env-world-lab-cad")
        XCTAssertEqual(bundle["units"] as? String,"m")
        XCTAssertEqual((bundle["entities"] as? [[String:Any]])?.count,1)
        XCTAssertEqual((bundle["materials"] as? [[String:Any]])?.count,1)
        let imported=try NativeWorldLabEditor.importCADExchange(try NativeWorldLabEditor.blank(),cadData:exported)
        let project=try NativeWorldLabProject.decode(imported)
        XCTAssertEqual(project.entities.count,1)
        XCTAssertEqual(project.entities[0].positionMeters,[1,2,3])
        XCTAssertEqual(project.entities[0].effectiveRotationRadians[2],Double.pi/6,accuracy:1e-12)
        XCTAssertEqual(project.entities[0].materialId,"mat-used")
        XCTAssertEqual(project.materials.first?.name,"Assumed alloy")
    }

    func testCADExchangeMergePreservesCameraAndRemapsConflictingIDs() throws {
        var target=try NativeWorldLabEditor.addSolid(try NativeWorldLabEditor.blank(),shape:"box",id:"shared")
        target=try NativeWorldLabEditor.positionSolid(target,id:"shared",positionMeters:[4,5,6])
        let source=try NativeWorldLabEditor.addSolid(try NativeWorldLabEditor.blank(),shape:"sphere",id:"shared")
        let targetProject=try NativeWorldLabProject.decode(target)
        let merged=try NativeWorldLabEditor.importCADExchange(target,
            cadData:NativeWorldLabEditor.exportCADExchange(source))
        let result=try NativeWorldLabProject.decode(merged)
        XCTAssertEqual(result.entities.count,2)
        XCTAssertEqual(result.entities[0].id,"shared")
        XCTAssertNotEqual(result.entities[1].id,"shared")
        XCTAssertEqual(result.camera.positionMeters,targetProject.camera.positionMeters)
        XCTAssertEqual(result.camera.lookingAtMeters,targetProject.camera.lookingAtMeters)
        XCTAssertEqual(result.revision,targetProject.revision+1)
    }

    func testCADExchangeRejectsUnknownFieldsVersionsAndInvalidGeometry() throws {
        let source=try NativeWorldLabEditor.addSolid(try NativeWorldLabEditor.blank(),shape:"box",id:"box")
        let valid=try NativeWorldLabEditor.exportCADExchange(source)
        var wrong=try XCTUnwrap(JSONSerialization.jsonObject(with:valid) as? [String:Any])
        wrong["schemaVersion"]=99
        XCTAssertThrowsError(try NativeWorldLabEditor.importCADExchange(source,
            cadData:JSONSerialization.data(withJSONObject:wrong)))
        wrong=try XCTUnwrap(JSONSerialization.jsonObject(with:valid) as? [String:Any])
        wrong["script"]="alert(1)"
        XCTAssertThrowsError(try NativeWorldLabEditor.importCADExchange(source,
            cadData:JSONSerialization.data(withJSONObject:wrong)))
        wrong=try XCTUnwrap(JSONSerialization.jsonObject(with:valid) as? [String:Any])
        var entities=wrong["entities"] as! [[String:Any]]
        entities[0]["dimensionsMeters"]=[0,1,1];wrong["entities"]=entities
        XCTAssertThrowsError(try NativeWorldLabEditor.importCADExchange(source,
            cadData:JSONSerialization.data(withJSONObject:wrong)))
    }


    func testMultiSelectionSnapIsAtomicAndMatchesWebNegativeHalfGridRule() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"outside")
        data=try NativeWorldLabEditor.positionSolid(data,id:"a",positionMeters:[0.25,-0.25,2.49])
        data=try NativeWorldLabEditor.positionSolid(data,id:"b",positionMeters:[3,4,12])
        data=try NativeWorldLabEditor.positionSolid(data,id:"outside",positionMeters:[8.25,0,0])
        let before=try NativeWorldLabProject.decode(data)
        let result=try NativeWorldLabEditor.snapSolids(data,ids:["a","b"],gridMeters:0.5)
        let after=try NativeWorldLabProject.decode(result)
        XCTAssertEqual(after.revision,before.revision+1)
        XCTAssertEqual(after.entities.first(where:{$0.id=="a"})?.positionMeters,[0.5,0,2.5])
        XCTAssertEqual(after.entities.first(where:{$0.id=="outside"})?.positionMeters,
                       before.entities.first(where:{$0.id=="outside"})?.positionMeters)
        XCTAssertThrowsError(try NativeWorldLabEditor.snapSolids(data,ids:["a","missing"],gridMeters:0.5))
        XCTAssertThrowsError(try NativeWorldLabEditor.snapSolids(data,ids:["a","a"],gridMeters:0.5))
        XCTAssertThrowsError(try NativeWorldLabEditor.snapSolids(data,ids:["a"],gridMeters:0))
    }

    func testSelectedGeometryMeasurementReportsThreeDimensionalAndHorizontalOffsets() throws {
        var data=try NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),shape:"box",id:"a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"b")
        data=try NativeWorldLabEditor.positionSolid(data,id:"a",positionMeters:[0,0,0])
        data=try NativeWorldLabEditor.positionSolid(data,id:"b",positionMeters:[3,4,12])
        let project=try NativeWorldLabProject.decode(data)
        let measured=try NativeWorldLabEditor.measureCenters(project,fromId:"a",toId:"b")
        XCTAssertEqual(measured.centerDistanceM,13,accuracy:1e-12)
        XCTAssertEqual(measured.horizontalDistanceM,hypot(3,12),accuracy:1e-12)
        XCTAssertEqual(measured.offsetXM,3,accuracy:1e-12)
        XCTAssertEqual(measured.offsetYM,4,accuracy:1e-12)
        XCTAssertEqual(measured.offsetZM,12,accuracy:1e-12)
        XCTAssertThrowsError(try NativeWorldLabEditor.measureCenters(project,fromId:"a",toId:"a"))
    }
}
