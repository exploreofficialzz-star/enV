import XCTest
@testable import enV

final class NativeWorldLabInspectionTests:XCTestCase {
    private func fixture() throws -> NativeWorldLabProject {
        var data=try NativeWorldLabEditor.blank(title:"Inspection geometry")
        data=try NativeWorldLabEditor.addSolid(data,shape:"box",id:"box-a")
        data=try NativeWorldLabEditor.addSolid(data,shape:"sphere",id:"sphere-b")
        data=try NativeWorldLabEditor.addSolid(data,shape:"cylinder",id:"cylinder-c")
        data=try NativeWorldLabEditor.createVisualAssembly(data,name:"Two-part assembly",
            entityIds:["box-a","sphere-b"],id:"assembly-ab")
        return try NativeWorldLabProject.decode(data)
    }
    func testIsolationKeepsAssemblyAndHidesUnrelatedParts() throws {
        let project=try fixture()
        XCTAssertTrue(NativeWorldLabInspectionGeometry.isVisible(project:project,selectedId:"box-a",mode:.isolate,id:"box-a"))
        XCTAssertTrue(NativeWorldLabInspectionGeometry.isVisible(project:project,selectedId:"box-a",mode:.isolate,id:"sphere-b"))
        XCTAssertFalse(NativeWorldLabInspectionGeometry.isVisible(project:project,selectedId:"box-a",mode:.isolate,id:"cylinder-c"))
        XCTAssertTrue(NativeWorldLabInspectionGeometry.isVisible(project:project,selectedId:nil,mode:.isolate,id:"cylinder-c"))
    }
    func testExplodedAssemblyPositionsAreViewOnlyAndBounded() throws {
        let project=try fixture()
        let before=project.entities.map(\.positionMeters)
        let settings=NativeWorldLabInspectionSettings(mode:.exploded,explosionDistanceMeters:2)
        let first=NativeWorldLabInspectionGeometry.renderPosition(project:project,selectedId:"box-a",settings:settings,id:"box-a")
        let second=NativeWorldLabInspectionGeometry.renderPosition(project:project,selectedId:"box-a",settings:settings,id:"sphere-b")
        let other=NativeWorldLabInspectionGeometry.renderPosition(project:project,selectedId:"box-a",settings:settings,id:"cylinder-c")
        let separation=sqrt(zip(first,second).map{pow($0.0-$0.1,2)}.reduce(0,+))
        XCTAssertGreaterThan(separation,1.9)
        XCTAssertEqual(other,try XCTUnwrap(project.entities.first(where:{$0.id=="cylinder-c"})).positionMeters)
        XCTAssertEqual(project.entities.map(\.positionMeters),before)
    }
    func testCutawayPolygonClippingWorksOnEveryAxis() {
        let polygon=[[-2.0,0.0,0.0],[0.0,0.0,0.0],[0.0,1.0,0.0],[-2.0,1.0,0.0]]
        let x=NativeWorldLabInspectionGeometry.clipPolygon(polygon,axis:0,offset:-1)
        XCTAssertEqual(x.count,4);XCTAssertTrue(x.allSatisfy{$0[0]>=(-1-1e-9)})
        let y=NativeWorldLabInspectionGeometry.clipPolygon(polygon,axis:1,offset:0.5)
        XCTAssertEqual(y.count,4);XCTAssertTrue(y.allSatisfy{$0[1]>=0.5-1e-9})
        let zPolygon=[[0.0,0.0,-2.0],[1.0,0.0,0.0],[1.0,1.0,0.0],[0.0,1.0,-2.0]]
        let z=NativeWorldLabInspectionGeometry.clipPolygon(zPolygon,axis:2,offset:-1)
        XCTAssertEqual(z.count,4);XCTAssertTrue(z.allSatisfy{$0[2]>=(-1-1e-9)})
        XCTAssertTrue(NativeWorldLabInspectionGeometry.clipPolygon(polygon,axis:0,offset:3).isEmpty)
    }
    func testCutawayGeometryBuildsTriangleMeshForEachPrimitive() throws {
        let project=try fixture()
        for solid in project.entities {
            let geometry=NativeWorldLabInspectionGeometry.makeCutawayGeometry(solid,axis:0,offset:0.25)
            XCTAssertFalse(geometry.elements.isEmpty,solid.shape)
            XCTAssertGreaterThan(geometry.elements.first?.primitiveCount ?? 0,0,solid.shape)
            XCTAssertGreaterThan(geometry.sources(for:.vertex).first?.vectorCount ?? 0,0,solid.shape)
        }
    }
    func testInspectionBoundsRejectInvalidDisplayState() {
        XCTAssertThrowsError(try NativeWorldLabInspectionSettings(mode:.transparent,opacity:2).validate())
        XCTAssertThrowsError(try NativeWorldLabInspectionSettings(mode:.cutaway,cutawayFraction:Double.nan).validate())
        XCTAssertThrowsError(try NativeWorldLabInspectionSettings(mode:.exploded,explosionDistanceMeters:11).validate())
    }
}


final class NativeWorldLabInspectionHistoryTests:XCTestCase {
    func testUndoRedoRestoresCutawayAndXrayDisplayState() throws {
        let initial=NativeWorldLabInspectionSettings()
        var history=NativeWorldLabInspectionHistory(present:initial)
        let cutaway=NativeWorldLabInspectionSettings(mode:.cutaway,opacity:0.32,
            axis:.z,cutawayFraction:0.4,explosionDistanceMeters:1)
        try history.commit(cutaway)
        try history.commit(NativeWorldLabInspectionSettings(mode:.xray,opacity:0.25,
            axis:.z,cutawayFraction:0.4,explosionDistanceMeters:1))
        XCTAssertEqual(history.present.mode,.xray)
        XCTAssertEqual(history.undo(),cutaway)
        XCTAssertEqual(history.undo(),initial)
        XCTAssertEqual(history.redo(),cutaway)
    }
    func testHistoryIsBoundedAndNewChangesClearRedo() throws {
        var history=NativeWorldLabInspectionHistory()
        for index in 0..<65 {
            try history.commit(NativeWorldLabInspectionSettings(
                mode:index.isMultiple(of:2) ? .transparent : .xray,
                opacity:index.isMultiple(of:2) ? 0.3 : 0.6,
                axis:.x,cutawayFraction:Double(index%20)/20,
                explosionDistanceMeters:1))
        }
        XCTAssertEqual(history.past.count,NativeWorldLabInspectionHistory.limit)
        _ = history.undo()
        try history.commit(NativeWorldLabInspectionSettings(mode:.cutaway))
        XCTAssertTrue(history.future.isEmpty)
        XCTAssertThrowsError(try history.commit(NativeWorldLabInspectionSettings(opacity:2)))
    }
}
