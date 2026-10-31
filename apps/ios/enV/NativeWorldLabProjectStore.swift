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
    private var recovery:URL { directory.appendingPathComponent("Recovery",isDirectory:true) }
    @discardableResult func saveDraft(_ data:Data)throws->NativeWorldLabProject {
        guard data.count<=NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("Recovery draft exceeds 1 MB")
        }
        let project=try NativeWorldLabProject.decode(data)
        let manager=FileManager.default
        try manager.createDirectory(at:recovery,withIntermediateDirectories:true)
        let destination=recovery.appendingPathComponent(try file(project.id).lastPathComponent)
        let files=try manager.contentsOfDirectory(at:recovery,includingPropertiesForKeys:nil)
            .filter{$0.pathExtension=="json"}
        guard manager.fileExists(atPath:destination.path) || files.count<Self.maxLocalProjects else {
            throw NativeWorldLabError.invalid("Recovery cache is full (50 projects)")
        }
        try data.write(to:destination,options:.atomic)
        return project
    }
    func readDraft(_ id:String)throws->(Data,NativeWorldLabProject){
        let url=recovery.appendingPathComponent(try file(id).lastPathComponent)
        let attrs=try FileManager.default.attributesOfItem(atPath:url.path)
        guard let size=(attrs[.size] as? NSNumber)?.intValue,
              size<=NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("Recovery draft exceeds 1 MB")
        }
        let data=try Data(contentsOf:url)
        let project=try NativeWorldLabProject.decode(data)
        guard project.id==id else {
            throw NativeWorldLabError.invalid("Recovery file identity mismatch")
        }
        return (data,project)
    }
    func listDrafts()throws->[NativeWorldLabProject]{
        let manager=FileManager.default
        guard manager.fileExists(atPath:recovery.path) else{return []}
        let files=try manager.contentsOfDirectory(at:recovery,
            includingPropertiesForKeys:[.contentModificationDateKey])
            .filter{$0.pathExtension=="json"}
        guard files.count<=Self.maxLocalProjects else {
            throw NativeWorldLabError.invalid("Recovery cache limit is inconsistent")
        }
        let sorted=try files.map{ url -> (URL,Date) in
            let values=try url.resourceValues(forKeys:[.contentModificationDateKey])
            return (url,values.contentModificationDate ?? .distantPast)
        }.sorted{$0.1>$1.1}
        return try sorted.map{try readDraft($0.0.deletingPathExtension().lastPathComponent).1}
    }
    func deleteDraft(_ id:String)throws{
        let url=recovery.appendingPathComponent(try file(id).lastPathComponent)
        if FileManager.default.fileExists(atPath:url.path){
            _ = try readDraft(id)
            try FileManager.default.removeItem(at:url)
        }
    }
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
            if let expectedSavedRevision {
                guard expectedSavedRevision == previous.revision else {
                    throw NativeWorldLabError.invalid(
                        "A stale expected local project revision cannot be saved.")
                }
            }
            let unchanged = project.revision == previous.revision && previousData == data
            let permittedEdit:Bool
            if expectedSavedRevision != nil {
                permittedEdit = project.revision > previous.revision
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
        let dated=try urls.map { url -> (URL,Date) in
            let attributes=try url.resourceValues(forKeys:[.contentModificationDateKey])
            return (url,attributes.contentModificationDate ?? .distantPast)
        }
        let sorted=dated.sorted{$0.1 > $1.1}.map{$0.0}
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


/// Private evidence library for native Swift gravity and material-heat models.
/// The exact native JSON payload is retained; it is not a measured reading or
/// a substitute for saving the inventor's own material assumptions.
struct NativeWorldLabScientificEvidenceStore {
    static let maxRecords=20
    static let maxRecordBytes=2*1024*1024
    let root:URL
    init(directory:URL?=nil){
        root=directory ?? NativeWorldLabProjectStore().directory
    }
    private func validateID(_ id:String)throws {
        guard id.range(of:"^[A-Za-z0-9_-]{1,120}$",
            options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Scientific record ID is invalid")
        }
    }
    private func folder(_ projectId:String)throws->URL {
        try validateID(projectId)
        return root.appendingPathComponent("ScientificEvidence",isDirectory:true)
            .appendingPathComponent(projectId,isDirectory:true)
    }
    private func file(_ projectId:String,_ id:String)throws->URL {
        try validateID(id)
        return try folder(projectId).appendingPathComponent(id+".json")
    }
    private func inspect(_ bytes:Data,expectedId:String?,
        expectedProject:String)throws->[String:Any] {
        guard bytes.count<=Self.maxRecordBytes,
              let record=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],
              Set(record.keys)==Set(["id","projectId","projectRevision",
                "createdAt","kind","result"]),
              let id=record["id"] as? String,
              let projectId=record["projectId"] as? String,
              projectId==expectedProject,
              let revision=record["projectRevision"] as? Int,revision>=0,
              let createdAt=record["createdAt"] as? String,
              ISO8601DateFormatter().date(from:createdAt) != nil,
              let kind=record["kind"] as? String,
              let result=record["result"] as? [String:Any],
              let innerId=result["projectId"] as? String,innerId==projectId,
              let innerRevision=result["projectRevision"] as? Int,
              innerRevision==revision,
              result["evidence"] as? String=="physics-model-computed",
              result["materialEvidence"] as? String=="hypothetical-user-assumed",
              let validity=result["validity"] as? String,
              validity.count>=30,validity.count<=2000,
              (expectedId == nil || expectedId == id) else {
            throw NativeWorldLabError.invalid("Scientific evidence metadata is inconsistent")
        }
        try validateID(id)
        if kind=="newton-gravity" {
            guard result["format"] as? String=="env-world-lab-newton-gravity",
                  let bodies=result["bodies"] as? [[String:Any]],
                  (2...32).contains(bodies.count),
                  let frames=result["frames"] as? [[String:Any]],
                  (2...241).contains(frames.count) else {
                throw NativeWorldLabError.invalid("Unsupported gravitational record")
            }
        }else if kind=="material-heat" {
            guard result["format"] as? String=="env-world-lab-material-heat-transfer",
                  let samples=result["samples"] as? [[String:Any]],
                  samples.count==121 else {
                throw NativeWorldLabError.invalid("Unsupported material heat record")
            }
        }else if kind=="interface-optics" {
            guard result["format"] as? String=="env-world-lab-interface-optics",
                  result["modelVersion"] as? String=="1.0.0",
                  let firstId=result["firstMaterialId"] as? String,
                  let secondId=result["secondMaterialId"] as? String,
                  firstId != secondId,
                  let first=result["firstIndex"] as? Double,
                  let second=result["secondIndex"] as? Double,
                  first.isFinite,second.isFinite,
                  (1...5).contains(first),(1...5).contains(second),
                  let angle=result["incidentAngleDegrees"] as? Double,
                  angle.isFinite,(0...89.9).contains(angle),
                  result["reflectedAngleDegrees"] as? Double==angle,
                  let reflected=result["unpolarizedReflectance"] as? Double,
                  let transmitted=result["unpolarizedTransmittance"] as? Double,
                  reflected.isFinite,transmitted.isFinite,
                  (0...1).contains(reflected),(0...1).contains(transmitted),
                  abs(1-reflected-transmitted)<=1e-10 else {
                throw NativeWorldLabError.invalid("Unsupported invented optical evidence")
            }
        }else{
            throw NativeWorldLabError.invalid("Unknown scientific evidence kind")
        }
        return record
    }
    func validateEnvelope(_ bytes:Data,projectId:String)throws {
        _ = try inspect(bytes,expectedId:nil,expectedProject:projectId)
    }
    func importRecord(_ data:Data,projectId:String)throws{
        let record=try inspect(data,expectedId:nil,expectedProject:projectId)
        let current=try NativeWorldLabProjectStore(directory:root).read(projectId).1
        guard let revision=record["projectRevision"] as? Int,
              revision<=current.revision,let id=record["id"] as? String else {
            throw NativeWorldLabError.invalid("Imported science is newer than the invention")
        }
        let destination=try file(projectId,id)
        let directory=try folder(projectId)
        let manager=FileManager.default
        try manager.createDirectory(at:directory,withIntermediateDirectories:true)
        if manager.fileExists(atPath:destination.path){
            let existing=try read(projectId,id)
            guard (try JSONSerialization.jsonObject(with:existing) as? NSDictionary)?
                .isEqual(to:record) == true else {
                throw NativeWorldLabError.invalid(
                    "A different immutable record already uses this scientific ID")
            }
            return
        }
        let count=try manager.contentsOfDirectory(at:directory,
            includingPropertiesForKeys:nil).filter{$0.pathExtension=="json"}.count
        guard count<Self.maxRecords else {
            throw NativeWorldLabError.invalid("Science evidence quota reached")
        }
        try data.write(to:destination,options:.atomic)
    }
    @discardableResult private func store<T:Encodable>(
        _ result:T,kind:String,project:NativeWorldLabProject)throws->String {
        let current=try NativeWorldLabProjectStore(directory:root).read(project.id).1
        guard current.revision>=project.revision else {
            throw NativeWorldLabError.invalid(
                "Save the matching invention before retaining its scientific result")
        }
        let data=try JSONEncoder().encode(result)
        let value=try JSONSerialization.jsonObject(with:data) as? [String:Any]
        guard let value,
              value["projectId"] as? String==project.id,
              value["projectRevision"] as? Int==project.revision else {
            throw NativeWorldLabError.invalid(
                "Scientific evidence belongs to another invention or revision")
        }
        let id=UUID().uuidString
        let envelope:[String:Any]=[
            "id":id,"projectId":project.id,"projectRevision":project.revision,
            "createdAt":ISO8601DateFormatter().string(from:Date()),
            "kind":kind,"result":value
        ]
        let bytes=try JSONSerialization.data(withJSONObject:envelope,
            options:[.sortedKeys])
        _ = try inspect(bytes,expectedId:id,expectedProject:project.id)
        let directory=try folder(project.id)
        let manager=FileManager.default
        try manager.createDirectory(at:directory,withIntermediateDirectories:true)
        let count=try manager.contentsOfDirectory(at:directory,
            includingPropertiesForKeys:nil).filter{$0.pathExtension=="json"}.count
        guard count<Self.maxRecords else {
            throw NativeWorldLabError.invalid(
                "This invention already holds 20 scientific evidence records")
        }
        try bytes.write(to:try file(project.id,id),options:.atomic)
        return id
    }
    @discardableResult func saveGravity(_ run:NativeGravityRun,
        project:NativeWorldLabProject)throws->String {
        try store(run,kind:"newton-gravity",project:project)
    }
    @discardableResult func saveHeat(_ run:NativeMaterialHeatRun,
        project:NativeWorldLabProject)throws->String {
        try store(run,kind:"material-heat",project:project)
    }
    @discardableResult func saveOptics(_ run:NativeOpticalInterfaceRun,
        project:NativeWorldLabProject)throws->String {
        try store(run,kind:"interface-optics",project:project)
    }
    func read(_ projectId:String,_ recordId:String)throws->Data {
        let url=try file(projectId,recordId)
        let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
        guard let size=(attributes[.size] as? NSNumber)?.intValue,
              size<=Self.maxRecordBytes else {
            throw NativeWorldLabError.invalid(
                "Scientific evidence file is missing or exceeds 2 MB")
        }
        let bytes=try Data(contentsOf:url)
        _ = try inspect(bytes,expectedId:recordId,expectedProject:projectId)
        return bytes
    }
    func list(_ projectId:String)throws->[(id:String,kind:String,createdAt:String)] {
        let dir=try folder(projectId)
        let manager=FileManager.default
        guard manager.fileExists(atPath:dir.path) else{return []}
        let urls=try manager.contentsOfDirectory(at:dir,
            includingPropertiesForKeys:[.contentModificationDateKey])
            .filter{$0.pathExtension=="json"}
        guard urls.count<=Self.maxRecords else {
            throw NativeWorldLabError.invalid("Scientific evidence storage quota is inconsistent")
        }
        return try urls.map{ url in
            let id=url.deletingPathExtension().lastPathComponent
            let record=try inspect(Data(contentsOf:url),
                expectedId:id,expectedProject:projectId)
            return (id:id,kind:record["kind"] as! String,
                createdAt:record["createdAt"] as! String)
        }.sorted{$0.createdAt>$1.createdAt}
    }
    func delete(_ projectId:String,_ recordId:String)throws {
        _ = try read(projectId,recordId)
        try FileManager.default.removeItem(at:try file(projectId,recordId))
    }
}


/// Portable cross-client v1/v2 archive. Uninterpreted legacy numerical records
/// are retained for re-export; no native code is executed from archived JSON.
struct NativeWorldLabPortableArchiveContent {
    let projectData:Data
    let project:NativeWorldLabProject
    let legacyRuns:[[String:Any]]
    let scientificRecords:[Data]
}
struct NativeWorldLabPortableArchiveStore {
    static let maxBytes=24*1024*1024
    let root:URL
    init(directory:URL?=nil){
        root=directory ?? NativeWorldLabProjectStore().directory
    }
    private func validID(_ value:String)->Bool {
        value.range(of:"^[A-Za-z0-9_-]{1,120}$",
            options:.regularExpression) != nil
    }
    private func legacyFile(_ id:String)throws->URL {
        guard validID(id) else {
            throw NativeWorldLabError.invalid("Invalid portable project ID")
        }
        return root.appendingPathComponent("PortableNumericalRuns",isDirectory:true)
            .appendingPathComponent(id+".json")
    }
    func decode(_ bytes:Data)throws->NativeWorldLabPortableArchiveContent {
        guard bytes.count<=Self.maxBytes,
              let archive=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],
              let format=archive["format"] as? String,
              format=="env-world-lab-archive",
              let version=archive["schemaVersion"] as? Int,
              version==1 || version==2,
              Set(archive.keys)==(version==1 ?
                Set(["format","schemaVersion","project","recordedRuns"]) :
                Set(["format","schemaVersion","project","recordedRuns",
                    "scientificEvidence"])),
              let rawProject=archive["project"] as? [String:Any],
              let runs=archive["recordedRuns"] as? [[String:Any]],
              runs.count<=20 else {
            throw NativeWorldLabError.invalid(
                "World Lab archive version, metadata or size is unsupported")
        }
        let data=try JSONSerialization.data(withJSONObject:rawProject,options:[.sortedKeys])
        guard data.count<=NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("Archive project exceeds 1 MB")
        }
        let project=try NativeWorldLabProject.decode(data)
        let rawScience:[[String:Any]]
        if version==1 {rawScience=[]}
        else {
            guard let science=archive["scientificEvidence"] as? [[String:Any]],
                  science.count<=20 else {
                throw NativeWorldLabError.invalid("Too many scientific archive records")
            }
            rawScience=science
        }
        let evidence=NativeWorldLabScientificEvidenceStore(directory:root)
        var ids=Set<String>()
        for entry in runs {
            guard Set(entry.keys)==Set(["projectId","run"]),
                  entry["projectId"] as? String==project.id,
                  let run=entry["run"] as? [String:Any],
                  let id=run["id"] as? String,validID(id),
                  ids.insert(id).inserted,
                  run["format"] as? String=="env-world-lab-run",
                  run["schemaVersion"] as? Int==1,
                  run["evidence"] as? String=="physics-model-computed",
                  let samples=run["samples"] as? [Any],
                  (2...50001).contains(samples.count),
                  try JSONSerialization.data(withJSONObject:entry).count<=8*1024*1024
            else {
                throw NativeWorldLabError.invalid(
                    "Imported numerical evidence is malformed or duplicated")
            }
        }
        let scienceRecords=try rawScience.map{ item -> Data in
            guard let id=item["id"] as? String,ids.insert(id).inserted,
                  item["projectId"] as? String==project.id,
                  let revision=item["projectRevision"] as? Int,
                  revision<=project.revision else {
                throw NativeWorldLabError.invalid(
                    "Scientific evidence identity or revision mismatch")
            }
            let blob=try JSONSerialization.data(withJSONObject:item,options:[.sortedKeys])
            try evidence.validateEnvelope(blob,projectId:project.id)
            return blob
        }
        return NativeWorldLabPortableArchiveContent(projectData:data,
            project:project,legacyRuns:runs,scientificRecords:scienceRecords)
    }
    func export(_ projectData:Data)throws->Data {
        let project=try NativeWorldLabProject.decode(projectData)
        let file=try legacyFile(project.id)
        let manager=FileManager.default
        var legacy:[[String:Any]]=[]
        if manager.fileExists(atPath:file.path){
            let attrs=try manager.attributesOfItem(atPath:file.path)
            guard let size=(attrs[.size] as? NSNumber)?.intValue,size<=Self.maxBytes else {
                throw NativeWorldLabError.invalid("Stored numerical history is oversized")
            }
            let data=try Data(contentsOf:file)
            guard let list=try JSONSerialization.jsonObject(with:data) as? [[String:Any]]
            else {
                throw NativeWorldLabError.invalid("Stored historical experiment list invalid")
            }
            legacy=list
        }
        let science=NativeWorldLabScientificEvidenceStore(directory:root)
        let records=try science.list(project.id).map{
            try JSONSerialization.jsonObject(with:science.read(project.id,$0.id))
        }
        let raw=try JSONSerialization.jsonObject(with:projectData)
        let archive:[String:Any]=[
            "format":"env-world-lab-archive","schemaVersion":2,
            "project":raw,"recordedRuns":legacy,"scientificEvidence":records
        ]
        let bytes=try JSONSerialization.data(withJSONObject:archive,options:[.sortedKeys])
        _ = try decode(bytes)
        return bytes
    }
    func importArchive(_ data:Data)throws->NativeWorldLabPortableArchiveContent {
        let imported=try decode(data)
        let local=NativeWorldLabProjectStore(directory:root)
        let target=root.appendingPathComponent(imported.project.id+".json")
        if FileManager.default.fileExists(atPath:target.path) {
            throw NativeWorldLabError.invalid(
                "An invention with this ID already exists, including unreadable copies; "+
                "portable import may not overwrite it.")
        }
        let manager=FileManager.default
        // Keep an original source backup first, so any interrupted multi-file
        // import can be retried without losing the user's evidence.
        let archiveFolder=root.appendingPathComponent(
            "ImportedPortableArchives",isDirectory:true)
        try manager.createDirectory(at:archiveFolder,withIntermediateDirectories:true)
        try data.write(to:archiveFolder.appendingPathComponent(
            imported.project.id+".json"),options:.atomic)
        let historical=try legacyFile(imported.project.id)
        try manager.createDirectory(at:historical.deletingLastPathComponent(),
            withIntermediateDirectories:true)
        let legacy=try JSONSerialization.data(withJSONObject:imported.legacyRuns,
            options:[.sortedKeys])
        try legacy.write(to:historical,options:.atomic)
        _ = try local.save(imported.projectData)
        let history=NativeWorldLabScientificEvidenceStore(directory:root)
        for item in imported.scientificRecords {
            try history.importRecord(item,projectId:imported.project.id)
        }
        return imported
    }
}
