import Foundation
import XCTest
@testable import enV

final class NativeWorldLabProjectStoreTests:XCTestCase {
    private func temporaryStore() throws -> NativeWorldLabProjectStore {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(
            "world-lab-local-"+UUID().uuidString,isDirectory:true)
        return NativeWorldLabProjectStore(directory:root)
    }
    func testSaveReopenAndRejectStaleRevision() throws {
        let store=try temporaryStore()
        defer{try? FileManager.default.removeItem(at:store.directory)}
        XCTAssertNil(try store.loadLatest())
        let a=try NativeWorldLabEditor.blank(title:"Offline study")
        let initial=try store.save(a)
        XCTAssertEqual(initial.title,"Offline study")
        let loaded=try XCTUnwrap(store.loadLatest())
        XCTAssertEqual(loaded.0,a)
        let b=try NativeWorldLabEditor.addSolid(a,shape:"box",id:"new-solid")
        _ = try store.save(b)
        XCTAssertEqual(try store.loadLatest()?.1.entities.count,1)
        XCTAssertThrowsError(try store.save(a))
        XCTAssertEqual(try store.read(initial.id).0,b)
    }
    func testBrowseDeleteAndMultipleEditsWithExpectedSavedRevision() throws {
        let store=try temporaryStore()
        defer {try? FileManager.default.removeItem(at:store.directory)}
        let first=try NativeWorldLabEditor.blank(title:"First")
        let initial=try store.save(first)
        var edited=try NativeWorldLabEditor.addSolid(first,shape:"box",id:"a")
        edited=try NativeWorldLabEditor.addSolid(edited,shape:"sphere",id:"b")
        XCTAssertThrowsError(try store.save(edited))
        _ = try store.save(edited,expectedSavedRevision:initial.revision)
        XCTAssertEqual(try store.read(initial.id).1.entities.count,2)
        let second=try store.save(NativeWorldLabEditor.blank(title:"Second"))
        XCTAssertEqual(try store.listProjects().count,2)
        XCTAssertThrowsError(try store.save(edited,expectedSavedRevision:0))
        try store.delete(second.id)
        XCTAssertEqual(try store.loadLatest()?.1.id,initial.id)
        XCTAssertEqual(try store.listProjects().count,1)
        XCTAssertThrowsError(try store.delete("../escape"))
        try store.delete(initial.id)
        XCTAssertNil(try store.loadLatest())
    }
    func testCorruptedFileFailsClosedWithoutInventedRecovery() throws {
        let store=try temporaryStore()
        defer{try? FileManager.default.removeItem(at:store.directory)}
        let a=try NativeWorldLabEditor.blank()
        let project=try store.save(a)
        XCTAssertThrowsError(try store.read("../escape"))
        let file=store.directory.appendingPathComponent(project.id+".json")
        try Data("{invalid".utf8).write(to:file)
        XCTAssertThrowsError(try store.loadLatest())
        XCTAssertThrowsError(try store.save(a))
    }
    func testSkippedRevisionCannotEraseDivergentProjectHistory() throws {
        let store=try temporaryStore()
        defer{try? FileManager.default.removeItem(at:store.directory)}
        let initial=try NativeWorldLabEditor.blank()
        let project=try store.save(initial)
        var tampered=try XCTUnwrap(JSONSerialization.jsonObject(with:initial) as? [String:Any])
        tampered["revision"]=10
        let skipped=try JSONSerialization.data(withJSONObject:tampered)
        XCTAssertThrowsError(try store.save(skipped))
        XCTAssertEqual(try store.read(project.id).0,initial)
    }
    func testSameRevisionDifferentPayloadIsExplicitConflict() throws {
        let store=try temporaryStore()
        defer{try? FileManager.default.removeItem(at:store.directory)}
        let a=try NativeWorldLabEditor.blank()
        _ = try store.save(a)
        var root=try XCTUnwrap(JSONSerialization.jsonObject(with:a) as? [String:Any])
        root["title"]="Conflicting local edit"
        let altered=try JSONSerialization.data(withJSONObject:root)
        XCTAssertThrowsError(try store.save(altered))
        XCTAssertEqual(try store.loadLatest()?.0,a)
    }
}
