import Foundation

/// Portable v1 project creation and editing with strict validation on *every*
/// mutation. Unknown matter remains a user assumption, not observed science.
enum NativeWorldLabEditor {
    private static func encode(_ root:[String:Any]) throws -> Data {
        // JSONSerialization can raise an Objective-C exception, rather than a
        // Swift Error, when an NSNumber holds NaN/Infinity. Always reject
        // invalid JSON objects before attempting to serialize user input.
        guard JSONSerialization.isValidJSONObject(root) else {
            throw NativeWorldLabError.invalid("Project contains unsupported JSON or nonfinite numbers")
        }
        let data=try JSONSerialization.data(withJSONObject:root,options:[.sortedKeys,.prettyPrinted])
        _ = try NativeWorldLabProject.decode(data)
        return data
    }
    private static func mutate(_ data:Data,
                               _ transform:(inout [String:Any]) throws -> Void) throws -> Data {
        _ = try NativeWorldLabProject.decode(data)
        guard var root=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {
            throw NativeWorldLabError.invalid("Expected a World Lab project object")
        }
        try transform(&root)
        guard let revision=root["revision"] as? Int,revision<1_000_000_000 else {
            throw NativeWorldLabError.invalid("World Lab revision limit reached")
        }
        root["revision"]=revision+1
        root["updatedAt"]=ISO8601DateFormatter().string(from:Date())
        return try encode(root)
    }
    static func blank(title:String="Untitled World Lab") throws -> Data {
        let now=ISO8601DateFormatter().string(from:Date())
        return try encode([
            "format":"env-world-lab","schemaVersion":1,
            "id":UUID().uuidString,"title":title,"revision":0,
            "createdAt":now,"updatedAt":now,
            "world":["frame":"LOCAL_ENU","representation":"representative-not-measured",
                     "origin":[0,0,0],"terrainSource":NSNull()],
            "camera":["positionMeters":[0,1.65,-8],"lookingAtMeters":[0,1.2,0]],
            "entities":[],"materials":[],"networks":[],
        ])
    }
    static func starterCircuit(_ data:Data,id:String=UUID().uuidString) throws -> Data {
        try mutate(data){root in
            var networks=(root["networks"] as? [[String:Any]]) ?? []
            guard networks.count<12 else {
                throw NativeWorldLabError.invalid("Too many electrical networks")
            }
            let nodes:[[String:Any]]=[
                ["id":"ground","label":"Ground"],
                ["id":"supply","label":"Powered rail"]
            ]
            let components:[[String:Any]]=[
                ["id":"source","kind":"dc-source","positiveNodeId":"supply",
                 "negativeNodeId":"ground","voltageV":9.0],
                ["id":"load","kind":"resistor","positiveNodeId":"supply",
                 "negativeNodeId":"ground","resistanceOhm":100.0]
            ]
            networks.append(["id":id,"name":"My first circuit",
                "groundNodeId":"ground","nodes":nodes,"components":components])
            root["networks"]=networks
        }
    }
    static func addParallelResistor(_ data:Data) throws -> Data {
        try mutate(data){root in
            guard var networks=root["networks"] as? [[String:Any]],
                  !networks.isEmpty,
                  var parts=networks[0]["components"] as? [[String:Any]],
                  parts.count<48 else {
                throw NativeWorldLabError.invalid("Create a circuit before adding resistors")
            }
            parts.append(["id":UUID().uuidString,"kind":"resistor",
                "positiveNodeId":"supply","negativeNodeId":"ground",
                "resistanceOhm":200.0])
            networks[0]["components"]=parts
            root["networks"]=networks
        }
    }
    static func addSolid(_ data:Data,shape:String,id:String=UUID().uuidString) throws -> Data {
        try mutate(data){root in
            guard ["box","sphere","cylinder"].contains(shape),
                  var entities=root["entities"] as? [[String:Any]],
                  entities.count<200,
                  !entities.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Unsupported geometry, duplicate ID or 200-solid limit")
            }
            entities.append([
                "id":id,"name":shape=="box" ? "Cube":shape=="sphere" ? "Sphere":"Cylinder",
                "shape":shape,"positionMeters":[0,0.5,0],
                "dimensionsMeters":[1,1,1],"color":"#A4C9C6",
                "materialId":NSNull(),"scientificRole":"visual-only","opacity":1,
            ])
            root["entities"]=entities
        }
    }
    static func addHypotheticalMaterial(_ data:Data,name:String,densityKgM3:Double?,
                                        youngModulusPa:Double?=nil,
                                        id:String=UUID().uuidString) throws -> Data {
        try mutate(data){root in
            guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  name.count <= 120,
                  (densityKgM3.map { $0.isFinite && $0 >= 0.001 && $0 <= 1e9 } ?? true),
                  (youngModulusPa.map { $0.isFinite && $0 >= 0 && $0 <= 1e15 } ?? true) else {
                throw NativeWorldLabError.invalid("Hypothetical properties must be finite values inside their documented SI limits")
            }
            guard var materials=root["materials"] as? [[String:Any]],
                  materials.count<100,
                  !materials.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Duplicate or oversized material catalog")
            }
            materials.append([
                "id":id,"name":name,"densityKgM3":densityKgM3.map{$0 as Any} ?? NSNull(),
                "youngModulusPa":youngModulusPa.map{$0 as Any} ?? NSNull(),
                "evidence":"hypothetical-user-assumed",
            ])
            root["materials"]=materials
        }
    }
    private static func editSolid(_ data:Data,id:String,
                                  _ edit:(inout [String:Any])->Void) throws -> Data {
        try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],
                  let index=entities.firstIndex(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Selected solid no longer exists")
            }
            edit(&entities[index])
            root["entities"]=entities
        }
    }
    static func renameSolid(_ data:Data,id:String,name:String) throws -> Data {
        try editSolid(data,id:id){$0["name"]=name}
    }
    static func resizeSolid(_ data:Data,id:String,dimensionsMeters:[Double]) throws -> Data {
        guard dimensionsMeters.count == 3,
              dimensionsMeters.allSatisfy({ $0.isFinite && $0 >= 0.001 && $0 <= 10000 }) else {
            throw NativeWorldLabError.invalid("Dimensions must be three finite SI measurements between 0.001 and 10,000 m")
        }
        return try editSolid(data,id:id){$0["dimensionsMeters"]=dimensionsMeters}
    }
    static func assignMaterial(_ data:Data,solidId:String,materialId:String?) throws -> Data {
        try editSolid(data,id:solidId){$0["materialId"]=materialId.map{$0 as Any} ?? NSNull()}
    }
}
