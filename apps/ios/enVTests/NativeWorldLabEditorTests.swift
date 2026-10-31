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
