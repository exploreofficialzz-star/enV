import Foundation

/// Portable v1 project creation and editing with strict validation on *every*
/// mutation. Unknown matter remains a user assumption, not observed science.
enum NativeWorldLabEditor {
    struct GeometryMeasurement {
        let fromId:String
        let toId:String
        let offsetXM:Double
        let offsetYM:Double
        let offsetZM:Double
        let centerDistanceM:Double
        let horizontalDistanceM:Double
    }
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
            "entities":[],"materials":[],"networks":[],"assemblies":[],
            "digitalNetworks":[],
        ])
    }
    static func startDigitalInvention(_ data:Data,
        id:String=UUID().uuidString)throws->Data {
        try mutate(data){root in
            var networks=(root["digitalNetworks"] as? [[String:Any]]) ?? []
            guard networks.count<8 else {
                throw NativeWorldLabError.invalid("Maximum eight digital inventions")
            }
            let inputs:[[String:Any]]=[
                ["id":"input_a","label":"Switch A","value":false],
                ["id":"input_b","label":"Switch B","value":false]]
            let gate:[String:Any]=["id":"invented_gate","name":"Invented NAND",
                "assumption":"User-assumed NAND behavior",
                "evidence":"hypothetical-user-assumed",
                "inputNodeIds":["input_a","input_b"],"truthTable":[1,1,1,0]]
            let output:[String:Any]=["id":"output_q","label":"Indicator",
                "sourceNodeId":"invented_gate"]
            networks.append(["id":id,"name":"My invented logic",
                "inputs":inputs,"gates":[gate],"outputs":[output]])
            root["digitalNetworks"]=networks
        }
    }
    static func digitalSwitch(_ data:Data,networkId:String,
        inputId:String,value:Bool)throws->Data {
        try mutate(data){root in
            guard var networks=root["digitalNetworks"] as? [[String:Any]],
                  let idx=networks.firstIndex(where:{$0["id"] as? String==networkId}),
                  var inputs=networks[idx]["inputs"] as? [[String:Any]],
                  let inputIndex=inputs.firstIndex(where:{$0["id"] as? String==inputId}) else {
                throw NativeWorldLabError.invalid("Digital switch not found")
            }
            inputs[inputIndex]["value"]=value
            networks[idx]["inputs"]=inputs
            root["digitalNetworks"]=networks
        }
    }
    static func digitalTruthBit(_ data:Data,networkId:String,gateId:String,
        row:Int,bit:Int)throws->Data {
        try mutate(data){root in
            guard bit==0 || bit==1,
                  var networks=root["digitalNetworks"] as? [[String:Any]],
                  let idx=networks.firstIndex(where:{$0["id"] as? String==networkId}),
                  var gates=networks[idx]["gates"] as? [[String:Any]],
                  let gateIndex=gates.firstIndex(where:{$0["id"] as? String==gateId}),
                  var table=gates[gateIndex]["truthTable"] as? [Int],
                  table.indices.contains(row) else {
                throw NativeWorldLabError.invalid("Digital truth-table row is invalid")
            }
            table[row]=bit
            gates[gateIndex]["truthTable"]=table
            networks[idx]["gates"]=gates
            root["digitalNetworks"]=networks
        }
    }
    /// Define a bounded, forward-wired hypothetical truth-table gate.
    static func addDigitalGate(_ data:Data,networkId:String,name:String,
        assumption:String,inputNodeIds:[String],id:String=UUID().uuidString)throws->Data {
        try mutate(data){root in
            guard !name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  name.count<=120,
                  !assumption.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  assumption.count<=500,
                  (1...4).contains(inputNodeIds.count),
                  Set(inputNodeIds).count==inputNodeIds.count else {
                throw NativeWorldLabError.invalid(
                    "Digital invention requires a name, an assumption and distinct inputs")
            }
            guard var networks=root["digitalNetworks"] as? [[String:Any]],
                  let index=networks.firstIndex(where:{$0["id"] as? String==networkId}),
                  var gates=networks[index]["gates"] as? [[String:Any]],
                  let inputs=networks[index]["inputs"] as? [[String:Any]],
                  let outputs=networks[index]["outputs"] as? [[String:Any]],
                  gates.count<32 else {
                throw NativeWorldLabError.invalid("Digital network or gate limit invalid")
            }
            let inputIds=inputs.compactMap{$0["id"] as? String}
            let gateIds=gates.compactMap{$0["id"] as? String}
            let outputIds=outputs.compactMap{$0["id"] as? String}
            let preceding=inputIds+gateIds
            guard inputNodeIds.allSatisfy({preceding.contains($0)}),
                  !(preceding+outputIds).contains(id) else {
                throw NativeWorldLabError.invalid(
                    "Digital gate must have a unique ID and only preceding input nodes")
            }
            let gate:[String:Any]=["id":id,"name":name.trimmingCharacters(in:.whitespaces),
                "assumption":assumption.trimmingCharacters(in:.whitespaces),
                "inputNodeIds":inputNodeIds,
                "truthTable":Array(repeating:0,count:1 << inputNodeIds.count),
                "evidence":"hypothetical-user-assumed"]
            gates.append(gate)
            networks[index]["gates"]=gates
            root["digitalNetworks"]=networks
        }
    }
    /// Rewire a Boolean indicator to an existing input or computed invented gate.
    static func digitalOutputSource(_ data:Data,networkId:String,outputId:String,
        sourceNodeId:String)throws->Data {
        try mutate(data){root in
            guard var networks=root["digitalNetworks"] as? [[String:Any]],
                  let index=networks.firstIndex(where:{$0["id"] as? String==networkId}),
                  var outputs=networks[index]["outputs"] as? [[String:Any]],
                  let outputIndex=outputs.firstIndex(where:{$0["id"] as? String==outputId}),
                  let inputs=networks[index]["inputs"] as? [[String:Any]],
                  let gates=networks[index]["gates"] as? [[String:Any]] else {
                throw NativeWorldLabError.invalid("Unknown digital indicator")
            }
            let inputIds=inputs.compactMap{$0["id"] as? String}
            let gateIds=gates.compactMap{$0["id"] as? String}
            let known=inputIds+gateIds
            guard known.contains(sourceNodeId) else {
                throw NativeWorldLabError.invalid(
                    "Digital indicator must read an existing switch or gate")
            }
            outputs[outputIndex]["sourceNodeId"]=sourceNodeId
            networks[index]["outputs"]=outputs
            root["digitalNetworks"]=networks
        }
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
    static func createVisualAssembly(_ data:Data,name:String,entityIds:[String],
                                     id:String=UUID().uuidString) throws->Data {
        try mutate(data){root in
            let title=name.trimmingCharacters(in:.whitespacesAndNewlines)
            var groups=(root["assemblies"] as? [[String:Any]]) ?? []
            guard !title.isEmpty,title.count<=120,
                  (2...30).contains(entityIds.count),groups.count<50 else {
                throw NativeWorldLabError.invalid("Groups require 2–30 real solids and a name")
            }
            groups.append(["id":id,"name":title,"entityIds":entityIds])
            root["assemblies"]=groups
        }
    }
    static func moveVisualAssembly(_ data:Data,id:String,
                                   deltaMeters:[Double]) throws->Data {
        try mutate(data){root in
            guard deltaMeters.count==3,
                  deltaMeters.allSatisfy({$0.isFinite && abs($0)<=1000}),
                  let groups=root["assemblies"] as? [[String:Any]],
                  let group=groups.first(where:{$0["id"] as? String==id}),
                  let members=group["entityIds"] as? [String],
                  var entities=root["entities"] as? [[String:Any]] else {
                throw NativeWorldLabError.invalid("Select a valid assembly and bounded displacement")
            }
            let included=Set(members)
            for index in entities.indices {
                guard let solidId=entities[index]["id"] as? String,
                      included.contains(solidId),
                      let current=entities[index]["positionMeters"] as? [Double],
                      current.count==3 else {continue}
                let moved=zip(current,deltaMeters).map { pair in
                    round((pair.0+pair.1)*1e6)/1e6
                }
                guard moved.allSatisfy({$0.isFinite && abs($0)<=100000}) else {
                    throw NativeWorldLabError.invalid("Group would leave the portable world")
                }
                entities[index]["positionMeters"]=moved
            }
            root["entities"]=entities
        }
    }
    static func ungroupVisualAssembly(_ data:Data,id:String)throws->Data {
        try mutate(data){root in
            guard let groups=root["assemblies"] as? [[String:Any]],
                  groups.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Visual group is missing")
            }
            root["assemblies"]=groups.filter{$0["id"] as? String != id}
        }
    }
    static func addCircuitNode(_ data:Data,label:String,
                               id:String=UUID().uuidString) throws -> Data {
        try mutate(data){root in
            let name=label.trimmingCharacters(in:.whitespacesAndNewlines)
            guard !name.isEmpty,name.count<=80,
                  var networks=root["networks"] as? [[String:Any]],!networks.isEmpty,
                  var nodes=networks[0]["nodes"] as? [[String:Any]],nodes.count<24,
                  !nodes.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Junction needs a unique name and available node capacity")
            }
            nodes.append(["id":id,"label":name])
            networks[0]["nodes"]=nodes
            root["networks"]=networks
        }
    }
    static func addCircuitResistor(_ data:Data,positive:String,negative:String,
                                   resistanceOhm:Double=200,
                                   id:String=UUID().uuidString) throws -> Data {
        try mutate(data){root in
            guard resistanceOhm.isFinite,resistanceOhm>=0.01,resistanceOhm<=1e9,
                  positive != negative,
                  var networks=root["networks"] as? [[String:Any]],!networks.isEmpty,
                  let nodes=networks[0]["nodes"] as? [[String:Any]],
                  var components=networks[0]["components"] as? [[String:Any]],
                  components.count<48,
                  nodes.contains(where:{$0["id"] as? String==positive}),
                  nodes.contains(where:{$0["id"] as? String==negative}),
                  !components.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Connect two distinct existing nodes with a bounded resistor")
            }
            components.append(["id":id,"kind":"resistor",
                "positiveNodeId":positive,"negativeNodeId":negative,
                "resistanceOhm":resistanceOhm])
            networks[0]["components"]=components
            root["networks"]=networks
        }
    }
    static func rewireCircuitPart(_ data:Data,id:String,
                                  positive:String,negative:String) throws -> Data {
        try mutate(data){root in
            guard positive != negative,
                  var networks=root["networks"] as? [[String:Any]],!networks.isEmpty,
                  let nodes=networks[0]["nodes"] as? [[String:Any]],
                  var parts=networks[0]["components"] as? [[String:Any]],
                  let partIndex=parts.firstIndex(where:{$0["id"] as? String==id}),
                  nodes.contains(where:{$0["id"] as? String==positive}),
                  nodes.contains(where:{$0["id"] as? String==negative}) else {
                throw NativeWorldLabError.invalid("Both component terminals need distinct valid nodes")
            }
            parts[partIndex]["positiveNodeId"]=positive
            parts[partIndex]["negativeNodeId"]=negative
            networks[0]["components"]=parts
            root["networks"]=networks
        }
    }
    static func removeUnusedCircuitNode(_ data:Data,id:String) throws -> Data {
        try mutate(data){root in
            guard var networks=root["networks"] as? [[String:Any]],!networks.isEmpty,
                  let nodes=networks[0]["nodes"] as? [[String:Any]],
                  let components=networks[0]["components"] as? [[String:Any]],
                  nodes.count>2,
                  networks[0]["groundNodeId"] as? String != id,
                  nodes.contains(where:{$0["id"] as? String==id}),
                  !components.contains(where:{$0["positiveNodeId"] as? String==id ||
                    $0["negativeNodeId"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Only disconnected non-ground nodes can be removed")
            }
            networks[0]["nodes"]=nodes.filter{$0["id"] as? String != id}
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
            guard let source=parts.first(where:{$0["kind"] as? String=="dc-source"}),
                  let positive=source["positiveNodeId"] as? String,
                  let negative=source["negativeNodeId"] as? String else {
                throw NativeWorldLabError.invalid("A voltage source is required")
            }
            parts.append(["id":UUID().uuidString,"kind":"resistor",
                "positiveNodeId":positive,"negativeNodeId":negative,
                "resistanceOhm":200.0])
            networks[0]["components"]=parts
            root["networks"]=networks
        }
    }
    static func adjustCircuitComponent(_ data:Data,id:String,delta:Double) throws ->Data {
        try mutate(data){root in
            guard delta.isFinite,var networks=root["networks"] as? [[String:Any]],
                  !networks.isEmpty,
                  var parts=networks[0]["components"] as? [[String:Any]],
                  let index=parts.firstIndex(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Selected circuit component does not exist")
            }
            let kind=parts[index]["kind"] as? String
            if kind=="dc-source" {
                guard let current=parts[index]["voltageV"] as? Double else {
                    throw NativeWorldLabError.invalid("Invalid source voltage")
                }
                parts[index]["voltageV"]=min(1000,max(-1000,current+delta))
            }else if kind=="resistor" {
                guard let current=parts[index]["resistanceOhm"] as? Double else {
                    throw NativeWorldLabError.invalid("Invalid resistance")
                }
                parts[index]["resistanceOhm"]=min(1e9,max(0.01,current+delta))
            }else {
                throw NativeWorldLabError.invalid("Unknown devices have no verified electrical parameter")
            }
            networks[0]["components"]=parts
            root["networks"]=networks
        }
    }
    static func removeCircuitComponent(_ data:Data,id:String) throws ->Data {
        try mutate(data){root in
            guard var networks=root["networks"] as? [[String:Any]],
                  !networks.isEmpty,
                  let parts=networks[0]["components"] as? [[String:Any]],
                  parts.count>1,
                  let part=parts.first(where:{$0["id"] as? String==id}),
                  part["kind"] as? String != "dc-source" else {
                throw NativeWorldLabError.invalid("Only removable, existing circuit loads can be deleted")
            }
            networks[0]["components"]=parts.filter{$0["id"] as? String != id}
            root["networks"]=networks
        }
    }
    static func inventOhmicDevice(_ data:Data,name:String,assumption:String,
                                  assumedResistanceOhm:Double?=nil) throws ->Data {
        try mutate(data){root in
            guard !name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  name.count<=120,
                  !assumption.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  assumption.count<=500,
                  assumedResistanceOhm.map({$0.isFinite && $0>=0.01 && $0<=1e9}) ?? true,
                  var networks=root["networks"] as? [[String:Any]],
                  !networks.isEmpty,
                  var components=networks[0]["components"] as? [[String:Any]],
                  components.count<48,
                  let source=components.first(where:{$0["kind"] as? String=="dc-source"}),
                  let positive=source["positiveNodeId"] as? String,
                  let negative=source["negativeNodeId"] as? String else {
                throw NativeWorldLabError.invalid("Invented circuit devices need valid source ports and explicit assumptions")
            }
            var invented:[String:Any]=[
                "id":UUID().uuidString,"kind":"hypothetical-device",
                "name":name,"assumption":assumption,
                "evidence":"hypothetical-user-assumed",
                "positiveNodeId":positive,"negativeNodeId":negative
            ]
            if let ohms=assumedResistanceOhm {invented["assumedResistanceOhm"]=ohms}
            components.append(invented)
            networks[0]["components"]=components
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
                                        id:String=UUID().uuidString,
                                        thermalConductivityWPerMK:Double?=nil,
                                        specificHeatJPerKgK:Double?=nil,
                                        refractiveIndex:Double?=nil) throws -> Data {
        try mutate(data){root in
            guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  name.count <= 120,
                  (densityKgM3.map { $0.isFinite && $0 >= 0.001 && $0 <= 1e9 } ?? true),
                  (youngModulusPa.map { $0.isFinite && $0 >= 0 && $0 <= 1e15 } ?? true),
                  (thermalConductivityWPerMK.map{$0.isFinite && $0>=1e-6 && $0<=1e6} ?? true),
                  (specificHeatJPerKgK.map{$0.isFinite && $0>=0.01 && $0<=1e7} ?? true),
                  (refractiveIndex.map{$0.isFinite && $0>=1 && $0<=5} ?? true),
                  (refractiveIndex.map{$0.isFinite && $0>=1 && $0<=5} ?? true) else {
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
                "thermalConductivityWPerMK":thermalConductivityWPerMK.map{$0 as Any} ?? NSNull(),
                "specificHeatJPerKgK":specificHeatJPerKgK.map{$0 as Any} ?? NSNull(),
                "refractiveIndex":refractiveIndex.map{$0 as Any} ?? NSNull(),
                "evidence":"hypothetical-user-assumed",
            ])
            root["materials"]=materials
        }
    }
    /// Revise a hypothetical material; attached solids keep their original material ID.
    static func reviseHypotheticalMaterial(_ data:Data,id:String,name:String,
        densityKgM3:Double?,youngModulusPa:Double?,
        thermalConductivityWPerMK:Double?=nil,
        specificHeatJPerKgK:Double?=nil,
        refractiveIndex:Double?=nil)throws->Data {
        try mutate(data){root in
            guard !name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                  name.count<=120,
                  (densityKgM3.map{$0.isFinite && $0 >= 0.001 && $0<=1e9} ?? true),
                  (youngModulusPa.map{$0.isFinite && $0 >= 0 && $0<=1e15} ?? true),
                  (thermalConductivityWPerMK.map{$0.isFinite && $0>=1e-6 && $0<=1e6} ?? true),
                  (specificHeatJPerKgK.map{$0.isFinite && $0>=0.01 && $0<=1e7} ?? true),
                  var materials=root["materials"] as? [[String:Any]],
                  let index=materials.firstIndex(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Invented material or its proposed properties are invalid")
            }
            materials[index]["name"]=name.trimmingCharacters(in:.whitespacesAndNewlines)
            materials[index]["densityKgM3"]=densityKgM3.map{$0 as Any} ?? NSNull()
            materials[index]["youngModulusPa"]=youngModulusPa.map{$0 as Any} ?? NSNull()
            materials[index]["thermalConductivityWPerMK"]=
                thermalConductivityWPerMK.map{$0 as Any} ?? NSNull()
            materials[index]["specificHeatJPerKgK"]=specificHeatJPerKgK.map{$0 as Any} ?? NSNull()
            materials[index]["refractiveIndex"]=refractiveIndex.map{$0 as Any} ?? NSNull()
            materials[index]["evidence"]="hypothetical-user-assumed"
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
    static func positionSolid(_ data:Data,id:String,positionMeters:[Double]) throws -> Data {
        guard positionMeters.count==3,
              positionMeters.allSatisfy({$0.isFinite && abs($0)<=100000}) else {
            throw NativeWorldLabError.invalid("Position needs three bounded SI coordinates")
        }
        return try editSolid(data,id:id){$0["positionMeters"]=positionMeters}
    }
    static func snapSolid(_ data:Data,id:String,gridMeters:Double) throws -> Data {
        guard gridMeters.isFinite,gridMeters>=0.001,gridMeters<=100 else {
            throw NativeWorldLabError.invalid("Grid spacing must be 0.001–100 metres")
        }
        let project=try NativeWorldLabProject.decode(data)
        guard let solid=project.entities.first(where:{$0.id==id}) else {
            throw NativeWorldLabError.invalid("Selected solid is missing")
        }
        let result=try solid.positionMeters.map{value -> Double in
            let raw=(value/gridMeters).rounded()*gridMeters
            let rounded=(raw*1e6).rounded()/1e6
            guard rounded.isFinite,abs(rounded)<=100000 else {
                throw NativeWorldLabError.invalid("Snapped position outside local world")
            }
            return rounded
        }
        return try positionSolid(data,id:id,positionMeters:result)
    }
    static func measureCenters(_ project:NativeWorldLabProject,
                               fromId:String,toId:String) throws -> GeometryMeasurement {
        guard fromId != toId,
              let a=project.entities.first(where:{$0.id==fromId}),
              let b=project.entities.first(where:{$0.id==toId}) else {
            throw NativeWorldLabError.invalid("Choose two distinct existing solids")
        }
        let x=b.positionMeters[0]-a.positionMeters[0]
        let y=b.positionMeters[1]-a.positionMeters[1]
        let z=b.positionMeters[2]-a.positionMeters[2]
        let horizontal=hypot(x,z)
        let threeDimensional=hypot(horizontal,y)
        guard horizontal.isFinite,threeDimensional.isFinite else {
            throw NativeWorldLabError.invalid("Geometric distance outside finite bounds")
        }
        return GeometryMeasurement(fromId:fromId,toId:toId,
            offsetXM:x,offsetYM:y,offsetZM:z,
            centerDistanceM:threeDimensional,horizontalDistanceM:horizontal)
    }
    static func assignMaterial(_ data:Data,solidId:String,materialId:String?) throws -> Data {
        try editSolid(data,id:solidId){$0["materialId"]=materialId.map{$0 as Any} ?? NSNull()}
    }
}

/// Pure in-memory history; restored edits advance the authoritative revision.
struct NativeWorldLabEditHistory {
    private(set) var past:[Data]=[]
    private(set) var future:[Data]=[]
    var canUndo:Bool {!past.isEmpty}
    var canRedo:Bool {!future.isEmpty}
    mutating func clear(){past.removeAll();future.removeAll()}
    mutating func record(before:Data,after:Data)throws {
        let old=try NativeWorldLabProject.decode(before)
        let next=try NativeWorldLabProject.decode(after)
        guard old.id==next.id,next.revision>old.revision else {
            throw NativeWorldLabError.invalid("Edit history requires one advancing project")
        }
        past.append(before)
        if past.count>50 {past.removeFirst(past.count-50)}
        future.removeAll()
    }
    private func restore(_ snapshot:Data,current:Data)throws->Data {
        let before=try NativeWorldLabProject.decode(snapshot)
        let active=try NativeWorldLabProject.decode(current)
        guard before.id==active.id,active.revision<1_000_000_000 else {
            throw NativeWorldLabError.invalid("History cannot replace a project or overflow revision")
        }
        guard var root=try JSONSerialization.jsonObject(with:snapshot) as? [String:Any] else {
            throw NativeWorldLabError.invalid("Historical project cannot be reconstructed")
        }
        root["revision"]=active.revision+1
        root["updatedAt"]=ISO8601DateFormatter().string(from:Date())
        guard JSONSerialization.isValidJSONObject(root) else {
            throw NativeWorldLabError.invalid("Historical state is not valid JSON")
        }
        let data=try JSONSerialization.data(withJSONObject:root,options:[.sortedKeys])
        _ = try NativeWorldLabProject.decode(data)
        return data
    }
    mutating func undo(current:Data)throws->Data? {
        guard let last=past.last else {return nil}
        let restored=try restore(last,current:current)
        past.removeLast()
        future.insert(current,at:0)
        if future.count>50 {future.removeLast(future.count-50)}
        return restored
    }
    mutating func redo(current:Data)throws->Data? {
        guard let next=future.first else {return nil}
        let restored=try restore(next,current:current)
        future.removeFirst()
        past.append(current)
        if past.count>50 {past.removeFirst(past.count-50)}
        return restored
    }
}
