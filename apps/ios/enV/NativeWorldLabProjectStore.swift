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
    @discardableResult func save(_ data:Data) throws -> NativeWorldLabProject {
        let project=try NativeWorldLabProject.decode(data)
        let manager=FileManager.default
        try manager.createDirectory(at:directory,withIntermediateDirectories:true)
        let destination=try file(project.id)
        if manager.fileExists(atPath:destination.path) {
            let previousData=try Data(contentsOf:destination)
            let previous=try NativeWorldLabProject.decode(previousData)
            guard project.revision>previous.revision ||
                    (project.revision==previous.revision && previousData==data) else {
                throw NativeWorldLabError.invalid("A newer local revision exists. Export or resolve the conflict first.")
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
    func read(_ id:String) throws -> (Data,NativeWorldLabProject) {
        let data=try Data(contentsOf:file(id))
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
