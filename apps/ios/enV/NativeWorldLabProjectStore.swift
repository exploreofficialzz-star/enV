import Foundation

/// Offline, app-private, revision-aware World Lab project storage.
/// No cloud sync and no implicit overwrite of newer local revisions.
struct NativeWorldLabProjectStore {
    static let maxLocalProjects = 50
    let directory: URL
    init(directory:URL?=nil) {
        if let directory { self.directory=directory }
        else {
            let base=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0]
            self.directory=base.appendingPathComponent("WorldLabV1",isDirectory:true)
        }
    }
    private func file(_ id:String) throws -> URL {
        guard id.range(of:"^[A-Za-z0-9_-]{1,120}$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Invalid World Lab local project ID")
        }
        return directory.appendingPathComponent(id+".json",isDirectory:false)
    }
    private var recent:URL { directory.appendingPathComponent("recent-id",isDirectory:false) }
    @discardableResult func save(_ data:Data,expectedSavedRevision:Int?=nil) throws -> NativeWorldLabProject {
        let project=try NativeWorldLabProject.decode(data)
        let manager=FileManager.default
        try manager.createDirectory(at:directory,withIntermediateDirectories:true)
        let destination=try file(project.id)
        if manager.fileExists(atPath:destination.path) {
            let attrs=try manager.attributesOfItem(atPath:destination.path)
            guard let byteSize=(attrs[.size] as? NSNumber)?.intValue,
                  byteSize <= NativeWorldLabProject.maxBytes else {
                throw NativeWorldLabError.invalid("Existing local World Lab project exceeds the 1 MB limit")
            }
            let previousData=try Data(contentsOf:destination)
            let previous=try NativeWorldLabProject.decode(previousData)
            // Skipping revision numbers may hide a divergent edit history;
            // fail closed rather than silently replacing local work.
            let unchanged = project.revision == previous.revision && previousData == data
            let permittedEdit:Bool
            if let expectedSavedRevision {
                permittedEdit = expectedSavedRevision == previous.revision &&
                    project.revision > previous.revision
            } else {
                permittedEdit = project.revision == previous.revision + 1
            }
            guard previous.id == project.id, unchanged || permittedEdit else {
                throw NativeWorldLabError.invalid(
                    "Saved project revision changed. Review it before replacing any existing work.")
            }
        }else{
            let entries=try manager.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil)
            let count=entries.filter{$0.pathExtension=="json"}.count
            guard count<Self.maxLocalProjects else {
                throw NativeWorldLabError.invalid("This device has reached its 50-project limit.")
            }
        }
        try data.write(to:destination,options:.atomic)
        try Data(project.id.utf8).write(to:recent,options:.atomic)
        return project
    }
    /// Enumerate private-device projects and validate each complete portable document.
    func listProjects() throws -> [NativeWorldLabProject] {
        let manager=FileManager.default
        guard manager.fileExists(atPath:directory.path) else{return []}
        let urls=try manager.contentsOfDirectory(
            at:directory,includingPropertiesForKeys:[.contentModificationDateKey],
            options:[.skipsHiddenFiles]).filter{$0.pathExtension=="json"}
        guard urls.count<=Self.maxLocalProjects else {
            throw NativeWorldLabError.invalid("Local World Lab project capacity is inconsistent")
        }
        let sorted=urls.sorted{
            (try? $0.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate)
                ?? .distantPast >
            (try? $1.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate)
                ?? .distantPast
        }
        return try sorted.map{try read($0.deletingPathExtension().lastPathComponent).1}
    }
    /// A delete is explicit and never silently removes a second saved project.
    func delete(_ id:String) throws {
        _ = try read(id)
        let manager=FileManager.default
        try manager.removeItem(at:try file(id))
        if manager.fileExists(atPath:recent.path){
            let pointer=try Data(contentsOf:recent)
            guard pointer.count<=120,let recentId=String(data:pointer,encoding:.ascii) else {
                throw NativeWorldLabError.invalid("Corrupt recent-project pointer")
            }
            if recentId==id {
                let remaining=try listProjects()
                if let next=remaining.first {
                    try Data(next.id.utf8).write(to:recent,options:.atomic)
                }else{
                    try manager.removeItem(at:recent)
                }
            }
        }
    }

    func read(_ id:String) throws -> (Data,NativeWorldLabProject) {
        let url=try file(id)
        let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
        guard let size=(attributes[.size] as? NSNumber)?.intValue,
              size <= NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("Saved World Lab project exceeds the 1 MB limit")
        }
        let data=try Data(contentsOf:url)
        let project=try NativeWorldLabProject.decode(data)
        guard project.id==id else {
            throw NativeWorldLabError.invalid("Saved project ID does not match its filename")
        }
        return (data,project)
    }
    func loadLatest() throws -> (Data,NativeWorldLabProject)? {
        guard FileManager.default.fileExists(atPath:recent.path) else{return nil}
        let bytes=try Data(contentsOf:recent)
        guard bytes.count<=120,let id=String(data:bytes,encoding:.ascii) else {
            throw NativeWorldLabError.invalid("Corrupt World Lab recent-project pointer")
        }
        return try read(id)
    }
}
