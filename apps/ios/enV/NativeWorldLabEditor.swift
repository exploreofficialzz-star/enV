import Foundation

/// Portable v1 project creation and editing with strict validation on *every *
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
                     "origin":[0,0,0],"terrainSource":NSNull(),"geodeticOrigin":NSNull()],
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
                "dimensionsMeters":[1,1,1],"rotationRadians":[0,0,0],"color":"#A4C9C6",
                "materialId":NSNull(),"scientificRole":"visual-only","opacity":1,
            ])
            root["entities"]=entities
        }
    }
    static func setGeodeticOrigin(_ data:Data,origin:NativeGeodetic?)throws->Data {
        if let origin {_ = try NativeWorldLabGeodesy.validate(origin)}
        return try mutate(data){root in
            guard var world=root["world"] as? [String:Any] else {
                throw NativeWorldLabError.invalid("Project world reference settings are unavailable")
            }
            if let origin {world["geodeticOrigin"]=["latitudeDegrees":origin.latitudeDegrees,
                "longitudeDegrees":origin.longitudeDegrees,"heightMeters":origin.heightMeters]}
            else {world["geodeticOrigin"]=NSNull()}
            root["world"]=world
        }
    }
    static func saveCameraViewpoint(_ data:Data,positionMeters:[Double],
        lookingAtMeters:[Double])throws->Data {
        guard positionMeters.count==3,lookingAtMeters.count==3,
              (positionMeters+lookingAtMeters).allSatisfy({$0.isFinite && abs($0)<=100000}) else {
            throw NativeWorldLabError.invalid("Camera viewpoint requires six finite bounded world coordinates")
        }
        return try mutate(data){root in
            guard var camera=root["camera"] as? [String:Any] else {
                throw NativeWorldLabError.invalid("Project camera settings are unavailable")
            }
            camera["positionMeters"]=positionMeters
            camera["lookingAtMeters"]=lookingAtMeters
            root["camera"]=camera
        }
    }
    private static func rotationMatrix(_ angles:[Double])->[[Double]] {
        let (x,y,z)=(angles[0],angles[1],angles[2])
        let cx=cos(x),sx=sin(x),cy=cos(y),sy=sin(y),cz=cos(z),sz=sin(z)
        return [[cy*cz+sy*sx*sz,-cy*sz+sy*sx*cz,sy*cx],
                [cx*sz,cx*cz,-sx],
                [-sy*cz+cy*sx*sz,sy*sz+cy*sx*cz,cy*cx]]
    }
    private static func matrixAngles(_ m:[[Double]])->[Double] {
        let x=asin(max(-1,min(1,-m[1][2]))),cx=cos(x)
        let y:Double,z:Double
        if abs(cx)>1e-8 {y=atan2(m[0][2],m[2][2]);z=atan2(m[1][0],m[1][1])}
        else {y=atan2(-m[2][0],m[0][0]);z=0}
        func wrap(_ a:Double)->Double {
            let value=(a+Double.pi).truncatingRemainder(dividingBy:2*Double.pi)
            let result=value<0 ? value+2*Double.pi-Double.pi:value-Double.pi
            return abs(result)<1e-12 ? 0:result
        }
        return [wrap(x),wrap(y),wrap(z)]
    }
    private static func multiplyRotation(_ a:[[Double]],_ b:[[Double]])->[[Double]] {
        (0..<3).map{row in (0..<3).map{col in (0..<3).reduce(0.0){$0+a[row][$1]*b[$1][col]}}}
    }

    private struct NativeCadBounds {
        let center:[Double];let half:[Double];let min:[Double];let max:[Double]
    }
    private static func cadBounds(_ entity:[String:Any])throws->NativeCadBounds {
        guard let position=entity["positionMeters"] as? [Double],
              let dimensions=entity["dimensionsMeters"] as? [Double],
              position.count==3,dimensions.count==3,
              dimensions.allSatisfy({$0.isFinite && $0>0}) else {
            throw NativeWorldLabError.invalid("CAD part coordinates or dimensions are invalid")
        }
        let angles=entity["rotationRadians"] as? [Double] ?? [0,0,0]
        guard angles.count==3,angles.allSatisfy({$0.isFinite && abs($0)<=2*Double.pi}) else {
            throw NativeWorldLabError.invalid("CAD part rotation is invalid")
        }
        let rotation=Self.rotationMatrix(angles)
        let half=(0..<3).map{axis in
            (0..<3).reduce(0.0){$0+abs(rotation[axis][$1])*dimensions[$1]/2}
        }
        return NativeCadBounds(center:position,half:half,
            min:(0..<3).map{position[$0]-half[$0]},
            max:(0..<3).map{position[$0]+half[$0]})
    }
    private static func selectedCAD(_ root:[String:Any],_ ids:[String])throws->[[String:Any]] {
        guard !ids.isEmpty,Set(ids).count==ids.count,
              let entities=root["entities"] as? [[String:Any]] else {
            throw NativeWorldLabError.invalid("Select one or more distinct CAD parts")
        }
        let selected=ids.compactMap{id in entities.first(where:{$0["id"] as? String==id})}
        guard selected.count==ids.count else {
            throw NativeWorldLabError.invalid("A selected part no longer exists")
        }
        return selected
    }
    static func rotateSolids(_ data:Data,ids:[String],axis:Int,degrees:Double)throws->Data {
        guard (0...2).contains(axis),degrees.isFinite,(-3600...3600).contains(degrees) else {
            throw NativeWorldLabError.invalid("Multi-part rotation needs an axis and bounded finite degrees")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            for part in selected {
                guard let id=part["id"] as? String,
                      let index=entities.firstIndex(where:{$0["id"] as? String==id}) else {
                    throw NativeWorldLabError.invalid("A selected CAD part disappeared")
                }
                var rotation=entities[index]["rotationRadians"] as? [Double] ?? [0,0,0]
                guard rotation.count==3,rotation.allSatisfy({$0.isFinite&&abs($0)<=2*Double.pi}) else {
                    throw NativeWorldLabError.invalid("Stored part rotation is invalid")
                }
                let raw=rotation[axis]+degrees*Double.pi/180
                let wrapped=(raw+Double.pi).truncatingRemainder(dividingBy:2*Double.pi)
                let normalized=wrapped<0 ? wrapped+2*Double.pi-Double.pi:wrapped-Double.pi
                rotation[axis]=abs(normalized)<1e-12 ? 0:normalized
                entities[index]["rotationRadians"]=rotation
            }
            root["entities"]=entities
        }
    }
    static func scaleSolids(_ data:Data,ids:[String],factors:[Double])throws->Data {
        guard factors.count==3,factors.allSatisfy({$0.isFinite&&(0.001...1000).contains($0)}) else {
            throw NativeWorldLabError.invalid("Multi-part scale requires three positive bounded factors")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            for part in selected {
                guard let id=part["id"] as? String,
                      let index=entities.firstIndex(where:{$0["id"] as? String==id}),
                      let old=entities[index]["dimensionsMeters"] as? [Double],
                      old.count==3 else {
                    throw NativeWorldLabError.invalid("A selected CAD part has invalid dimensions")
                }
                let shape=entities[index]["shape"] as? String ?? "box"
                let next:[Double]
                switch shape {
                case "sphere":next=Array(repeating:old[0]*factors[0],count:3)
                case "cylinder":
                    let radial=sqrt(factors[0]*factors[2])
                    next=[old[0]*radial,old[1]*factors[1],old[2]*radial]
                default:next=zip(old,factors).map{$0*$1}
                }
                guard next.allSatisfy({$0.isFinite&&(0.001...10000).contains($0)}) else {
                    throw NativeWorldLabError.invalid("Multi-part scale exceeds supported geometry bounds")
                }
                entities[index]["dimensionsMeters"]=next
            }
            root["entities"]=entities
        }
    }
    static func duplicateSolids(_ data:Data,ids:[String],offsetMeters:[Double])throws->Data {
        guard offsetMeters.count==3,offsetMeters.allSatisfy({$0.isFinite&&abs($0)<=100000}) else {
            throw NativeWorldLabError.invalid("Multi-part duplicate offset is outside the local world")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            guard entities.count+selected.count<=200 else {
                throw NativeWorldLabError.invalid("Duplicating the selection exceeds the 200-part limit")
            }
            var used=Set(entities.compactMap{$0["id"] as? String})
            for original in selected {
                guard let position=original["positionMeters"] as? [Double],
                      position.count==3 else {
                    throw NativeWorldLabError.invalid("Selected part cannot be duplicated")
                }
                var clone=original
                let next=zip(position,offsetMeters).map{$0+$1}
                guard next.allSatisfy({$0.isFinite&&abs($0)<=100000}) else {
                    throw NativeWorldLabError.invalid("A duplicate part would leave the local world")
                }
                var id=UUID().uuidString
                while used.contains(id){id=UUID().uuidString}
                used.insert(id)
                clone["id"]=id
                clone["name"]=String(((original["name"] as? String ?? "Solid")+" copy").prefix(120))
                clone["positionMeters"]=next
                if clone["rotationRadians"]==nil{clone["rotationRadians"]=[0,0,0]}
                entities.append(clone)
            }
            root["entities"]=entities
        }
    }
    static func alignSolids(_ data:Data,ids:[String],axis:Int,alignment:String)throws->Data {
        guard (0...2).contains(axis),["min","center","max"].contains(alignment) else {
            throw NativeWorldLabError.invalid("Alignment needs an axis and min, center or max")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            guard selected.count>=2 else {
                throw NativeWorldLabError.invalid("Alignment needs at least two parts")
            }
            let details=try selected.map{($0,try Self.cadBounds($0))}
            let target:Double
            switch alignment {
            case "min":target=details.map{$0.1.min[axis]}.min()!
            case "max":target=details.map{$0.1.max[axis]}.max()!
            default:target=details.map{$0.1.center[axis]}.reduce(0,+)/Double(details.count)
            }
            var entities=root["entities"] as? [[String:Any]] ?? []
            for (part,bounds) in details {
                guard let id=part["id"] as? String,
                      let index=entities.firstIndex(where:{$0["id"] as? String==id}),
                      var position=entities[index]["positionMeters"] as? [Double],
                      position.count==3 else {
                    throw NativeWorldLabError.invalid("A selected part disappeared during alignment")
                }
                position[axis]=alignment=="min" ? target+bounds.half[axis] :
                    alignment=="max" ? target-bounds.half[axis] : target
                guard position[axis].isFinite,abs(position[axis])<=100000 else {
                    throw NativeWorldLabError.invalid("Aligned part leaves the local world")
                }
                entities[index]["positionMeters"]=position
            }
            root["entities"]=entities
        }
    }
    static func distributeSolids(_ data:Data,ids:[String],axis:Int,gapMeters:Double)throws->Data {
        guard (0...2).contains(axis),gapMeters.isFinite,(0...100000).contains(gapMeters) else {
            throw NativeWorldLabError.invalid("Distribution requires an axis and nonnegative bounded gap")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            guard selected.count>=3 else {
                throw NativeWorldLabError.invalid("Distribution needs at least three parts")
            }
            let sorted=try selected.map{($0,try Self.cadBounds($0))}
                .sorted{$0.1.center[axis]<$1.1.center[axis]}
            var positions:[String:Double]=[:]
            var cursor=sorted[0].1.max[axis]
            for (part,bounds) in sorted.dropFirst(){
                let next=cursor+gapMeters+bounds.half[axis]
                guard next.isFinite,abs(next)<=100000,
                      let id=part["id"] as? String else {
                    throw NativeWorldLabError.invalid("Distribution leaves local-world bounds")
                }
                positions[id]=next
                cursor=next+bounds.half[axis]
            }
            var entities=root["entities"] as? [[String:Any]] ?? []
            for index in entities.indices{
                guard let id=entities[index]["id"] as? String,
                      let coordinate=positions[id],
                      var position=entities[index]["positionMeters"] as? [Double] else{continue}
                position[axis]=coordinate;entities[index]["positionMeters"]=position
            }
            root["entities"]=entities
        }
    }




    static func rotateGroupAroundCentroid(_ data:Data,ids:[String],
        axis:Int,degrees:Double)throws->Data {
        guard (0...2).contains(axis),degrees.isFinite,abs(degrees)<=3600 else{
            throw NativeWorldLabError.invalid("Group rotation requires an axis and bounded finite angle")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            let pivot=(0..<3).map{axisIndex in
                selected.compactMap{$0["positionMeters"] as? [Double]}.map{$0[axisIndex]}.reduce(0,+)/Double(selected.count)
            }
            var angles=[0.0,0.0,0.0];angles[axis]=degrees*Double.pi/180
            let groupRotation=Self.rotationMatrix(angles)
            var updated:[String:(position:[Double],rotation:[Double])]=[:]
            for part in selected{
                guard let id=part["id"] as? String,
                      let position=part["positionMeters"] as? [Double],position.count==3 else{
                    throw NativeWorldLabError.invalid("Group member position is invalid")
                }
                let relative=(0..<3).map{position[$0]-pivot[$0]}
                let next=(0..<3).map{row in
                    pivot[row]+(0..<3).reduce(0.0){$0+groupRotation[row][$1]*relative[$1]}
                }
                guard next.allSatisfy({$0.isFinite&&abs($0)<=100000}) else{
                    throw NativeWorldLabError.invalid("Group rotation leaves local-world bounds")
                }
                let local=Self.rotationMatrix(part["rotationRadians"] as? [Double] ?? [0,0,0])
                updated[id]=(next,Self.matrixAngles(Self.multiplyRotation(groupRotation,local)))
            }
            var entities=root["entities"] as? [[String:Any]] ?? []
            for index in entities.indices{
                guard let id=entities[index]["id"] as? String,let item=updated[id] else{continue}
                entities[index]["positionMeters"]=item.position
                entities[index]["rotationRadians"]=item.rotation
            }
            root["entities"]=entities
        }
    }
    static func scaleGroupAroundCentroid(_ data:Data,ids:[String],factor:Double)throws->Data {
        guard factor.isFinite,(0.001...1000).contains(factor) else{
            throw NativeWorldLabError.invalid("Group scale must be a finite positive factor between 0.001 and 1000")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            let pivot=(0..<3).map{axisIndex in
                selected.compactMap{$0["positionMeters"] as? [Double]}.map{$0[axisIndex]}.reduce(0,+)/Double(selected.count)
            }
            var updated:[String:(position:[Double],dimensions:[Double])]=[:]
            for part in selected{
                guard let id=part["id"] as? String,
                      let position=part["positionMeters"] as? [Double],position.count==3,
                      let dimensions=part["dimensionsMeters"] as? [Double],dimensions.count==3 else{
                    throw NativeWorldLabError.invalid("Group member geometry is invalid")
                }
                let next=(0..<3).map{pivot[$0]+(position[$0]-pivot[$0])*factor}
                let scaled=dimensions.map{$0*factor}
                guard next.allSatisfy({$0.isFinite&&abs($0)<=100000}),
                      scaled.allSatisfy({$0.isFinite&&(0.001...10000).contains($0)}) else{
                    throw NativeWorldLabError.invalid("Group scale exceeds geometry bounds")
                }
                updated[id]=(next,scaled)
            }
            var entities=root["entities"] as? [[String:Any]] ?? []
            for index in entities.indices{
                guard let id=entities[index]["id"] as? String,let item=updated[id] else{continue}
                entities[index]["positionMeters"]=item.position
                entities[index]["dimensionsMeters"]=item.dimensions
            }
            root["entities"]=entities
        }
    }

    static func translateSolids(_ data:Data,ids:[String],deltaMeters:[Double])throws->Data {
        guard deltaMeters.count==3,deltaMeters.allSatisfy({$0.isFinite&&abs($0)<=100000}) else {
            throw NativeWorldLabError.invalid("Translation needs three finite bounded SI offsets")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            var targets:[String:[Double]]=[:]
            for part in selected {
                guard let id=part["id"] as? String,
                      let position=part["positionMeters"] as? [Double],position.count==3 else{
                    throw NativeWorldLabError.invalid("A selected part has invalid position")
                }
                let next=zip(position,deltaMeters).map{$0+$1}
                guard next.allSatisfy({$0.isFinite&&abs($0)<=100000}) else{
                    throw NativeWorldLabError.invalid("A translated part leaves local-world bounds")
                }
                targets[id]=next
            }
            for index in entities.indices{
                guard let id=entities[index]["id"] as? String,
                      let position=targets[id] else{continue}
                entities[index]["positionMeters"]=position
            }
            root["entities"]=entities
        }
    }
    static func mirrorSolids(_ data:Data,ids:[String],axis:Int,planeMeters:Double)throws->Data {
        guard (0...2).contains(axis),planeMeters.isFinite,abs(planeMeters)<=100000 else {
            throw NativeWorldLabError.invalid("Multi-part mirror needs a bounded X/Y/Z plane")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            for part in selected{
                guard let id=part["id"] as? String,
                      let index=entities.firstIndex(where:{$0["id"] as? String==id}),
                      var position=entities[index]["positionMeters"] as? [Double],
                      position.count==3 else{
                    throw NativeWorldLabError.invalid("A selected part disappeared during mirror")
                }
                position[axis]=2*planeMeters-position[axis]
                guard position[axis].isFinite,abs(position[axis])<=100000 else{
                    throw NativeWorldLabError.invalid("A mirrored part leaves local-world bounds")
                }
                let angles=entities[index]["rotationRadians"] as? [Double] ?? [0,0,0]
                guard angles.count==3,angles.allSatisfy({$0.isFinite}) else{
                    throw NativeWorldLabError.invalid("Selected rotation is invalid")
                }
                let matrix=Self.rotationMatrix(angles)
                var signs=[1.0,1.0,1.0];signs[axis] = -1
                var local=[1.0,1.0,1.0];local[axis] = -1
                let reflected=(0..<3).map{row in
                    (0..<3).map{col in signs[row]*matrix[row][col]*local[col]}
                }
                entities[index]["positionMeters"]=position
                entities[index]["rotationRadians"]=Self.matrixAngles(reflected)
            }
            root["entities"]=entities
        }
    }
    static func linearPatternSolids(_ data:Data,ids:[String],axis:Int,
        spacingMeters:Double,copies:Int)throws->Data {
        guard (0...2).contains(axis),spacingMeters.isFinite,abs(spacingMeters)<=100000,
              spacingMeters != 0,(1...50).contains(copies) else{
            throw NativeWorldLabError.invalid("Multi-part linear pattern needs an axis, non-zero spacing and 1–50 copies")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            guard entities.count+selected.count*copies<=200 else{
                throw NativeWorldLabError.invalid("Multi-part linear pattern exceeds the 200-solid limit")
            }
            var used=Set(entities.compactMap{$0["id"] as? String})
            var clones:[[String:Any]]=[]
            for n in 1...copies{
                for original in selected{
                    guard var clone=original as? [String:Any],
                          var position=clone["positionMeters"] as? [Double],
                          position.count==3,
                          let name=original["name"] as? String else{
                        throw NativeWorldLabError.invalid("Pattern part has invalid position/name")
                    }
                    position[axis]+=spacingMeters*Double(n)
                    guard position[axis].isFinite,abs(position[axis])<=100000 else{
                        throw NativeWorldLabError.invalid("Linear pattern leaves local-world bounds")
                    }
                    var id=UUID().uuidString
                    while used.contains(id){id=UUID().uuidString}
                    used.insert(id)
                    clone["id"]=id;clone["name"]=String((name+" \(n+1)").prefix(120))
                    clone["positionMeters"]=position
                    if clone["rotationRadians"]==nil{clone["rotationRadians"]=[0,0,0]}
                    clones.append(clone)
                }
            }
            entities.append(contentsOf:clones)
            root["entities"]=entities
        }
    }
    static func circularPatternSolids(_ data:Data,ids:[String],axis:Int,
        centerMeters:[Double],instances:Int)throws->Data {
        guard (0...2).contains(axis),centerMeters.count==3,
              centerMeters.allSatisfy({$0.isFinite&&abs($0)<=100000}),
              (2...36).contains(instances) else{
            throw NativeWorldLabError.invalid("Multi-part circular pattern needs a bounded center, axis and 2–36 instances")
        }
        return try mutate(data){root in
            let selected=try Self.selectedCAD(root,ids)
            var entities=root["entities"] as? [[String:Any]] ?? []
            guard entities.count+selected.count*(instances-1)<=200 else{
                throw NativeWorldLabError.invalid("Multi-part circular pattern exceeds the 200-solid limit")
            }
            var used=Set(entities.compactMap{$0["id"] as? String})
            var clones:[[String:Any]]=[]
            let a=axis,b=(a+1)%3,c=(a+2)%3
            for n in 1..<instances{
                let angle=2*Double.pi*Double(n)/Double(instances)
                let co=cos(angle),si=sin(angle)
                for original in selected{
                    guard var clone=original as? [String:Any],
                          let position=original["positionMeters"] as? [Double],
                          position.count==3,
                          let name=original["name"] as? String else{
                        throw NativeWorldLabError.invalid("Circular-pattern source is invalid")
                    }
                    var next=position
                    let u=position[b]-centerMeters[b],v=position[c]-centerMeters[c]
                    next[b]=centerMeters[b]+u*co-v*si
                    next[c]=centerMeters[c]+u*si+v*co
                    guard next.allSatisfy({$0.isFinite&&abs($0)<=100000}) else{
                        throw NativeWorldLabError.invalid("Circular pattern leaves local-world bounds")
                    }
                    let sourceRotation=Self.rotationMatrix(original["rotationRadians"] as? [Double] ?? [0,0,0])
                    var world=Array(repeating:Array(repeating:0.0,count:3),count:3)
                    world[a][a]=1;world[b][b]=co;world[b][c] = -si
                    world[c][b]=si;world[c][c]=co
                    var id=UUID().uuidString
                    while used.contains(id){id=UUID().uuidString}
                    used.insert(id)
                    clone["id"]=id;clone["name"]=String((name+" \(n+1)").prefix(120))
                    clone["positionMeters"]=next
                    clone["rotationRadians"]=Self.matrixAngles(Self.multiplyRotation(world,sourceRotation))
                    clones.append(clone)
                }
            }
            entities.append(contentsOf:clones)
            root["entities"]=entities
        }
    }

    static func mirrorSolid(_ data:Data,id:String,axis:Int,planeMeters:Double)throws->Data {
        guard (0...2).contains(axis),planeMeters.isFinite,abs(planeMeters)<=100000 else {
            throw NativeWorldLabError.invalid("Mirror requires an axis and bounded local-world plane")
        }
        return try editSolid(data,id:id){solid in
            var position=solid["positionMeters"] as? [Double] ?? []
            guard position.count==3 else{return}
            position[axis]=2*planeMeters-position[axis]
            guard position[axis].isFinite && abs(position[axis])<=100000 else{return}
            let angles=solid["rotationRadians"] as? [Double] ?? [0,0,0]
            let r=Self.rotationMatrix(angles)
            var signs=[1.0,1.0,1.0];signs[axis] = -1
            var local=[1.0,1.0,1.0];local[axis] = -1
            let reflected=(0..<3).map{row in (0..<3).map{col in signs[row]*r[row][col]*local[col]}}
            solid["positionMeters"]=position
            solid["rotationRadians"]=Self.matrixAngles(reflected)
        }
    }
    static func circularPattern(_ data:Data,id:String,axis:Int,centerMeters:[Double],
        instances:Int)throws->Data {
        guard (0...2).contains(axis),centerMeters.count==3,
              centerMeters.allSatisfy({$0.isFinite && abs($0)<=100000}),
              (2...36).contains(instances) else {
            throw NativeWorldLabError.invalid("Circular pattern needs a bounded center, axis and 2–36 instances")
        }
        return try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],
                  let source=entities.first(where:{$0["id"] as? String==id}),
                  entities.count+instances-1<=200 else {
                throw NativeWorldLabError.invalid("Circular pattern source missing or solid limit reached")
            }
            let position=source["positionMeters"] as? [Double] ?? []
            guard position.count==3 else {throw NativeWorldLabError.invalid("Pattern source position is invalid")}
            let a=axis,b=(a+1)%3,c=(a+2)%3
            let angles=source["rotationRadians"] as? [Double] ?? [0,0,0]
            let sourceRotation=Self.rotationMatrix(angles)
            for index in 1..<instances {
                let angle=2*Double.pi*Double(index)/Double(instances)
                let co=cos(angle),si=sin(angle)
                let u=position[b]-centerMeters[b],v=position[c]-centerMeters[c]
                var next=position
                next[b]=centerMeters[b]+u*co-v*si
                next[c]=centerMeters[c]+u*si+v*co
                guard next.allSatisfy({$0.isFinite && abs($0)<=100000}) else {
                    throw NativeWorldLabError.invalid("Circular-pattern position overflow")
                }
                var world=Array(repeating:Array(repeating:0.0,count:3),count:3)
                world[a][a]=1;world[b][b]=co;world[b][c] = -si
                world[c][b]=si;world[c][c]=co
                var clone=source
                clone["id"]=UUID().uuidString
                clone["name"]=String(((source["name"] as? String ?? "Solid")+" \(index+1)").prefix(120))
                clone["positionMeters"]=next
                clone["rotationRadians"]=Self.matrixAngles(Self.multiplyRotation(world,sourceRotation))
                entities.append(clone)
            }
            root["entities"]=entities
        }
    }
    static func extrudeRectangle(_ data:Data,widthMeters:Double,depthMeters:Double,
        heightMeters:Double,id:String=UUID().uuidString)throws->Data {
        guard [widthMeters,depthMeters,heightMeters].allSatisfy({$0.isFinite && (0.001...10000).contains($0)}),
              id.range(of:"^[A-Za-z0-9_-]{1,120}$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Rectangular sketch needs bounded positive SI dimensions")
        }
        return try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],entities.count<200,
                  !entities.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Sketch exceeds the project solid limit or duplicates an ID")
            }
            entities.append(["id":id,"name":"Extruded rectangular profile","shape":"box",
                "positionMeters":[0,heightMeters/2,0],
                "dimensionsMeters":[widthMeters,heightMeters,depthMeters],
                "rotationRadians":[0,0,0],"color":"#A4C9C6",
                "materialId":NSNull(),"scientificRole":"visual-only","opacity":1])
            root["entities"]=entities
        }
    }
    static func extrudeCircle(_ data:Data,radiusMeters:Double,heightMeters:Double,
        id:String=UUID().uuidString)throws->Data {
        guard radiusMeters.isFinite,(0.0005...5000).contains(radiusMeters),
              heightMeters.isFinite,(0.001...10000).contains(heightMeters),
              radiusMeters*2<=10000,
              id.range(of:"^[A-Za-z0-9_-]{1,120}$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Circular sketch needs a bounded radius and height")
        }
        let diameter=radiusMeters*2
        return try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],entities.count<200,
                  !entities.contains(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Sketch exceeds the project solid limit or duplicates an ID")
            }
            entities.append(["id":id,"name":"Extruded circular profile","shape":"cylinder",
                "positionMeters":[0,heightMeters/2,0],
                "dimensionsMeters":[diameter,heightMeters,diameter],
                "rotationRadians":[0,0,0],"color":"#A4C9C6",
                "materialId":NSNull(),"scientificRole":"visual-only","opacity":1])
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
            materials[index]["thermalConductivityWPerMK"] = thermalConductivityWPerMK.map{$0 as Any} ?? NSNull()
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
    static func rotateSolid(_ data:Data,id:String,axis:Int,deltaDegrees:Double)throws->Data {
        guard (0...2).contains(axis),deltaDegrees.isFinite,
              (-3600...3600).contains(deltaDegrees) else {
            throw NativeWorldLabError.invalid("Rotation requires an axis and finite degrees within ±3600")
        }
        return try editSolid(data,id:id){solid in
            var angles=solid["rotationRadians"] as? [Double] ?? [0,0,0]
            guard angles.count==3,angles.allSatisfy({$0.isFinite && abs($0)<=2*Double.pi}) else {return}
            let raw=angles[axis]+deltaDegrees*Double.pi/180
            let normalized=(raw+Double.pi).truncatingRemainder(dividingBy:2*Double.pi)
            let result=normalized<0 ? normalized+2*Double.pi-Double.pi:normalized-Double.pi
            angles[axis]=abs(result)<1e-12 ? 0:result
            solid["rotationRadians"]=angles
        }
    }
    static func scaleSolid(_ data:Data,id:String,factors:[Double])throws->Data {
        guard factors.count==3,factors.allSatisfy({$0.isFinite && (0.001...1000).contains($0)}) else {
            throw NativeWorldLabError.invalid("Scale factors must be three positive bounded values")
        }
        let project=try NativeWorldLabProject.decode(data)
        guard let solid=project.entities.first(where:{$0.id==id}) else {
            throw NativeWorldLabError.invalid("Selected solid no longer exists")
        }
        let old=solid.dimensionsMeters
        let dimensions:[Double]
        switch solid.shape {
        case "sphere":dimensions=Array(repeating:old[0]*factors[0],count:3)
        case "cylinder":
            let radial=sqrt(factors[0]*factors[2])
            dimensions=[old[0]*radial,old[1]*factors[1],old[2]*radial]
        default:dimensions=zip(old,factors).map{pair in pair.0*pair.1}
        }
        guard dimensions.allSatisfy({$0.isFinite && (0.001...10000).contains($0)}) else {
            throw NativeWorldLabError.invalid("Scaled geometry exceeds model bounds")
        }
        return try resizeSolid(data,id:id,dimensionsMeters:dimensions)
    }
    static func duplicateSolid(_ data:Data,id:String,offsetMeters:[Double],
        newId:String=UUID().uuidString)throws->Data {
        guard offsetMeters.count==3,offsetMeters.allSatisfy({$0.isFinite && abs($0)<=100000}),
              newId.range(of:"^[A-Za-z0-9_-]{1,120}$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Duplicate offset or identity is invalid")
        }
        return try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],
                  entities.count<200,!entities.contains(where:{$0["id"] as? String==newId}),
                  let source=entities.first(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Duplicate source is missing or project is full")
            }
            var clone=source
            let position=source["positionMeters"] as? [Double] ?? []
            guard position.count==3 else {throw NativeWorldLabError.invalid("Source coordinates are invalid")}
            let next=zip(position,offsetMeters).map{$0+$1}
            guard next.allSatisfy({$0.isFinite && abs($0)<=100000}) else {
                throw NativeWorldLabError.invalid("Duplicate position is outside local-world bounds")
            }
            clone["id"]=newId;clone["name"]=String(((source["name"] as? String ?? "Solid")+" copy").prefix(120))
            clone["positionMeters"]=next
            if clone["rotationRadians"] == nil {clone["rotationRadians"]=[0,0,0]}
            entities.append(clone);root["entities"]=entities
        }
    }
    static func linearPattern(_ data:Data,id:String,axis:Int,spacingMeters:Double,
        copies:Int)throws->Data {
        guard (0...2).contains(axis),spacingMeters.isFinite,spacingMeters != 0,
              abs(spacingMeters)<=100000,(1...50).contains(copies) else {
            throw NativeWorldLabError.invalid("Linear pattern requires a valid axis, spacing and 1–50 copies")
        }
        return try mutate(data){root in
            guard var entities=root["entities"] as? [[String:Any]],
                  entities.count+copies<=200,
                  let source=entities.first(where:{$0["id"] as? String==id}) else {
                throw NativeWorldLabError.invalid("Pattern source missing or 200-solid limit reached")
            }
            let position=source["positionMeters"] as? [Double] ?? []
            guard position.count==3 else {throw NativeWorldLabError.invalid("Source coordinates are invalid")}
            for n in 1...copies {
                var clone=source
                let value=position[axis]+spacingMeters*Double(n)
                guard value.isFinite && abs(value)<=100000 else {
                    throw NativeWorldLabError.invalid("Pattern position exceeds local-world bounds")
                }
                var next=position;next[axis]=value
                clone["id"]=UUID().uuidString
                clone["name"]=String(((source["name"] as? String ?? "Solid")+" \(n+1)").prefix(120))
                clone["positionMeters"]=next
                if clone["rotationRadians"] == nil {clone["rotationRadians"]=[0,0,0]}
                entities.append(clone)
            }
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
