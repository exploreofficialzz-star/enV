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

    func testObliqueCutawayUsesNormalizedNormalAndProjectedBounds() throws {
        let project=try fixture()
        let settings=NativeWorldLabInspectionSettings(mode:.cutaway,normal:[1,1,0],
            cutawayFraction:0.5)
        try settings.validate()
        let plane=try XCTUnwrap(NativeWorldLabInspectionGeometry.plane(
            project:project,selectedId:"box-a",settings:settings))
        XCTAssertEqual(plane.normal[0],1/sqrt(2),accuracy:1e-9)
        XCTAssertEqual(plane.normal[1],1/sqrt(2),accuracy:1e-9)
        XCTAssertEqual(plane.offset,-1/sqrt(2)+0.5/sqrt(2),accuracy:1e-9)
        let polygon=[[-2.0,0.0,0.0],[0.0,0.0,0.0],[0.0,1.0,0.0],[-2.0,1.0,0.0]]
        let clipped=NativeWorldLabInspectionGeometry.clipPolygon(
            polygon,normal:plane.normal,offset:plane.offset)
        XCTAssertGreaterThanOrEqual(clipped.count,3)
        XCTAssertTrue(clipped.allSatisfy{point in
            zip(point,plane.normal).map{$0.0*$0.1}.reduce(0,+)>=plane.offset-1e-9
        })
    }
    func testCutawayNormalCannotBeZeroOrNonFinite() {
        XCTAssertThrowsError(try NativeWorldLabInspectionSettings(
            mode:.cutaway,normal:[0,0,0]).validate())
        XCTAssertThrowsError(try NativeWorldLabInspectionSettings(
            mode:.cutaway,normal:[1,.nan,0]).validate())
    }


final class NativeWorldLabFieldLayerTests:XCTestCase {
    private func makeField(kind:String="scalar",renderer:String="slice",scope:String="public",
        roles:[String]=[],values:[Any]?=nil,mask:[Bool]?=nil,
        interpolation:String="none",validated:Bool=false)throws->Data {
        let defaultValues:[Any]=[0,1,2,3,4,5,6,7,10,11,12,13,14,15,16,17]
        let data=values ?? defaultValues
        let object:[String:Any]=[
            "schemaVersion":1,"id":"field-1","label":"Test field","kind":kind,
            "units":["si":"kelvin","display":"K","scaleToSI":1.0,"offsetToSI":0.0],
            "spatialReference":["frame":"LOCAL_ENU","crs":"LOCAL_ENU","originMeters":[0.0,0.0,0.0],"axisOrder":["x","y","z"]],
            "timeReference":["kind":"simulation","worldDateUTC":"2026-11-01T00:00:00Z",
                "sampleTimesSeconds":[0.0,1.0],"acquiredAtUTC":NSNull(),"validFromUTC":NSNull(),
                "validToUTC":NSNull(),"timezoneDisplay":"UTC"],
            "source":["kind":"dataset","provider":"test-provider","datasetId":"test-1",
                "datasetVersion":"1","license":"CC0","retrievedAtUTC":"2026-11-01T00:00:00Z",
                "sourceUri":NSNull(),"evidence":"measured-observed"],
            "calibration":["status":"not-applicable","method":"No calibration required","reference":NSNull()],
            "resolution":["dimensions":[2,2,2],"spacingMeters":[1.0,1.0,1.0],"sampleCount":8],
            "interpolation":["method":interpolation,"validated":validated,"notes":"Test fixture"],
            "mask":mask.map{$0 as Any} ?? NSNull(),"values":data,"events":[],"network":NSNull(),
            "range":["minimumSI":-100000.0,"maximumSI":100000.0,"scale":"linear",
                "uncertaintyLowerSI":NSNull(),"uncertaintyUpperSI":NSNull(),"uncertaintyStatement":"not provided"],
            "permissions":["scope":scope,"readRoles":roles,"exportAllowed":false],
            "renderer":["kind":renderer,"implementationId":"native-test-v1"],
            "legend":["title":"Test field","minimumLabel":"Low","maximumLabel":"High",
                "palette":"viridis","accessibleDescription":"Test field values"],
            "validity":"Synthetic unit-test values only"
        ]
        return try JSONSerialization.data(withJSONObject:object,options:[.sortedKeys])
    }

    func testScalarSlicesReturnExactRecordedCellsForXYXZAndYZ() throws {
        let layer=try NativeWorldLabFieldLayerCodec.decode(makeField())
        let xy=try layer.scalarSlice(0.9,plane:.xy,sliceIndex:1)
        let xz=try layer.scalarSlice(0,plane:.xz,sliceIndex:1)
        let yz=try layer.scalarSlice(0,plane:.yz,sliceIndex:1)
        XCTAssertEqual(xy.sampleIndex,1)
        XCTAssertEqual(xy.sampleTimeSeconds,1,accuracy:0)
        XCTAssertEqual(xy.cells.compactMap{$0.components[0]},[14,15,16,17])
        XCTAssertEqual(xz.cells.compactMap{$0.components[0]},[2,3,6,7])
        XCTAssertEqual(yz.cells.compactMap{$0.components[0]},[1,3,5,7])
    }

    func testMaskedValuesRemainNoDataAndOutOfBoundsSliceIsRejected() throws {
        var values:[Any]=[NSNull(),1,2,3,4,5,6,7,10,11,12,13,14,15,16,17]
        let mask=[false]+Array(repeating:true,count:15)
        let layer=try NativeWorldLabFieldLayerCodec.decode(makeField(values:values,mask:mask))
        let frame=try layer.scalarSlice(0,plane:.xy,sliceIndex:0)
        XCTAssertNil(frame.cells[0].components[0])
        XCTAssertThrowsError(try layer.scalarSlice(0,plane:.xy,sliceIndex:2))
        values[0]=0
    }

    func testVectorGlyphsAndTensorSlicesUseTheRecordedComponentOrder() throws {
        let vectorValues=(0..<48).map{Double($0) as Any}
        let vector=try NativeWorldLabFieldLayerCodec.decode(
            makeField(kind:"vector",renderer:"glyphs",values:vectorValues))
        let glyphs=try vector.vectorGlyphs(0,plane:.xy,sliceIndex:0)
        XCTAssertEqual(glyphs.cells.first?.components.compactMap{$0},[0,1,2])
        XCTAssertEqual(glyphs.cells.last?.components.compactMap{$0},[9,10,11])

        let tensorValues=(0..<144).map{Double($0) as Any}
        let tensor=try NativeWorldLabFieldLayerCodec.decode(
            makeField(kind:"tensor",values:tensorValues))
        let slice=try tensor.tensorSlice(1,component:8,plane:.xy,sliceIndex:1)
        XCTAssertEqual(slice.cells.last?.components.compactMap{$0},[135,136,137,138,139,140,141,142,143])
        XCTAssertThrowsError(try tensor.tensorSlice(0,component:9))
    }

    func testStreamlinesRequireValidatedInterpolationAndIntegrateRecordedVectors() throws {
        let vectors=(0..<48).map{index -> Any in index%3==0 ? 1.0 : 0.0}
        let invalid=try NativeWorldLabFieldLayerCodec.decode(
            makeField(kind:"vector",renderer:"streamlines",values:vectors,interpolation:"nearest"))
        XCTAssertThrowsError(try invalid.vectorStreamlines(0))
        let layer=try NativeWorldLabFieldLayerCodec.decode(
            makeField(kind:"vector",renderer:"streamlines",values:vectors,interpolation:"linear",validated:true))
        let frame=try layer.vectorStreamlines(0)
        XCTAssertFalse(frame.paths.isEmpty)
        XCTAssertTrue(frame.paths.allSatisfy{$0.count>=2 && $0.allSatisfy{$0.u>=0 && $0.u<=1 && $0.v>=0 && $0.v<=1}})
    }

    func testPrivateAndSharedLayerRolesAreEnforced() throws {
        XCTAssertThrowsError(try NativeWorldLabFieldLayerCodec.decode(
            makeField(scope:"private",roles:["owner"])))
        XCTAssertThrowsError(try NativeWorldLabFieldLayerCodec.decode(
            makeField(scope:"shared",roles:["researcher"])))
        let shared=try NativeWorldLabFieldLayerCodec.decode(
            makeField(scope:"shared",roles:["researcher"]),principalRoles:["researcher"])
        XCTAssertEqual(shared.permissionsScope,"shared")
        let privateLayer=try NativeWorldLabFieldLayerCodec.decode(
            makeField(scope:"private",roles:["owner"]),principalRoles:["owner"])
        XCTAssertEqual(privateLayer.permissionsScope,"private")
    }

    func testStrictDecoderRejectsUnimplementedRendererAndMalformedTimeAxis() throws {
        XCTAssertThrowsError(try NativeWorldLabFieldLayerCodec.decode(
            makeField(renderer:"volume")))
        var invalid=try XCTUnwrap(JSONSerialization.jsonObject(with:makeField()) as? [String:Any])
        var time=try XCTUnwrap(invalid["timeReference"] as? [String:Any])
        time["sampleTimesSeconds"]=[0.0,0.0]
        invalid["timeReference"]=time
        let bytes=try JSONSerialization.data(withJSONObject:invalid)
        XCTAssertThrowsError(try NativeWorldLabFieldLayerCodec.decode(bytes))
        XCTAssertThrowsError(try NativeWorldLabFieldLayerCodec.decode(Data(repeating:0,count:NativeWorldLabFieldLayerCodec.maxBytes+1)))
    }
}
