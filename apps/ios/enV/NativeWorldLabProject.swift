import Foundation

/// A strict native Swift project interchange model, separate from gameplay schemas.
enum NativeWorldLabError: LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        if case .invalid(let detail) = self { return detail }
        return "Invalid World Lab project"
    }
}
/// Primitive bounding boxes: exact box separation, conservative for spheres/cylinders.
struct NativeLabSpatialClearance {
    let gapLowerBoundMeters:Double
    let overlapDepthMeters:[Double]
    let status:String
    let exactForBoxes:Bool
    let validity:String
}
enum NativeWorldLabSpatial {
    static func inspect(_ a:NativeLabSolid,_ b:NativeLabSolid)throws->NativeLabSpatialClearance {
        guard a.id != b.id else {
            throw NativeWorldLabError.invalid("Select two different solids")
        }
        let ac=a.positionMeters,bc=b.positionMeters
        let ad=a.dimensionsMeters,bd=b.dimensionsMeters
        guard ac.count==3,bc.count==3,ad.count==3,bd.count==3,
              (ac+bc).allSatisfy({$0.isFinite && abs($0)<=100000}),
              (ad+bd).allSatisfy({$0.isFinite && $0>=0.001 && $0<=10000}) else {
            throw NativeWorldLabError.invalid("Invalid primitive bounding geometry")
        }
        var gaps:[Double]=[],depths:[Double]=[]
        for axis in 0..<3 {
            let amin=ac[axis]-ad[axis]/2,amax=ac[axis]+ad[axis]/2
            let bmin=bc[axis]-bd[axis]/2,bmax=bc[axis]+bd[axis]/2
            gaps.append(max(0,amin-bmax,bmin-amax))
            depths.append(max(0,min(amax,bmax)-max(amin,bmin)))
        }
        let gap=sqrt(gaps.reduce(0){$0+$1*$1})
        let exact=a.shape=="box" && b.shape=="box"
        let status=gap>1e-9 ? "separated" :
            depths.contains(where:{$0<=1e-9}) ? "bounds-touch" :
            exact ? "box-intersection" : "potential-curved-intersection"
        let validity=exact ?
            "Axis-aligned box separation only. No rigid collision or material stress." :
            "Conservative bounding-box overlap only. Curved solids may not touch; no forces or damage modeled."
        return NativeLabSpatialClearance(gapLowerBoundMeters:gap,
            overlapDepthMeters:depths,status:status,
            exactForBoxes:exact,validity:validity)
    }
}

struct NativeLabVector3: Decodable {
    let values: [Double]
    func validate(positive: Bool = false) throws {
        guard values.count == 3 && values.allSatisfy({ $0.isFinite &&
            (positive ? ($0 >= 0.001 && $0 <= 10000) : ($0 >= -100000 && $0 <= 100000)) }) else {
            throw NativeWorldLabError.invalid("World Lab vectors require three bounded SI values")
        }
    }
}
struct NativeLabMaterial: Decodable {
    let id: String
    let name: String
    let densityKgM3: Double?
    let youngModulusPa: Double?
    let evidence: String
}
struct NativeLabSolid: Decodable {
    let id: String
    let name: String
    let shape: String
    let positionMeters: [Double]
    let dimensionsMeters: [Double]
    let color: String
    let materialId: String?
    let scientificRole: String
    let opacity: Double
    var volumeMetersCubed: Double {
        let x = dimensionsMeters[0], y = dimensionsMeters[1], z = dimensionsMeters[2]
        switch shape {
        case "sphere": return Double.pi * x * x * x / 6
        case "cylinder": return Double.pi * x * z * y / 4
        default: return x * y * z
        }
    }
}
struct NativeLabCircuitNode:Decodable {
    let id:String
    let label:String
}
struct NativeLabCircuitComponent:Decodable {
    let id:String
    let kind:String
    let positiveNodeId:String
    let negativeNodeId:String
    let voltageV:Double?
    let resistanceOhm:Double?
    let name:String?
    let assumption:String?
    let evidence:String?
    let assumedResistanceOhm:Double?
}
struct NativeLabCircuitNetwork:Decodable {
    let id:String
    let name:String
    let groundNodeId:String
    let nodes:[NativeLabCircuitNode]
    let components:[NativeLabCircuitComponent]
}
struct NativeLabAssembly:Decodable {
    let id:String
    let name:String
    let entityIds:[String]
}
struct NativeLabDigitalInput:Decodable {let id:String;let label:String;let value:Bool}
struct NativeLabDigitalGate:Decodable {
    let id:String;let name:String;let assumption:String
    let inputNodeIds:[String];let truthTable:[Int];let evidence:String
}
struct NativeLabDigitalOutput:Decodable {
    let id:String;let label:String;let sourceNodeId:String
}
struct NativeLabDigitalNetwork:Decodable {
    let id:String;let name:String;let inputs:[NativeLabDigitalInput]
    let gates:[NativeLabDigitalGate];let outputs:[NativeLabDigitalOutput]
}
enum NativeWorldLabDigitalLogic {

    /// Exhaust the Boolean input space; this does not verify real semiconductor behavior.
    static func truthTable(_ n:NativeLabDigitalNetwork)throws->[[String:Int]] {
        guard n.inputs.count<=8 else {
            throw NativeWorldLabError.invalid("Only eight switches can be exhaustively checked")
        }
        return try (0..<(1<<n.inputs.count)).map{sample in
            let switches=n.inputs.enumerated().map{index,input in
                NativeLabDigitalInput(id:input.id,label:input.label,
                    value:(sample & (1<<(n.inputs.count-index-1))) != 0)
            }
            let test=NativeLabDigitalNetwork(id:n.id,name:n.name,
                inputs:switches,gates:n.gates,outputs:n.outputs)
            return try evaluate(test)
        }
    }
    static func evaluate(_ n:NativeLabDigitalNetwork)throws->[String:Int] {
        var values:[String:Int]=[:]
        for input in n.inputs {values[input.id]=input.value ? 1 : 0}
        for gate in n.gates {
            var row=0
            for upstream in gate.inputNodeIds {
                guard let bit=values[upstream] else {
                    throw NativeWorldLabError.invalid("Unsupported digital connection")
                }
                row=row*2+bit
            }
            guard row<gate.truthTable.count else {
                throw NativeWorldLabError.invalid("Missing digital truth-table row")
            }
            values[gate.id]=gate.truthTable[row]
        }
        var outputs:[String:Int]=[:]
        for output in n.outputs {
            guard let bit=values[output.sourceNodeId] else {
                throw NativeWorldLabError.invalid("Missing digital output source")
            }
            outputs[output.id]=bit
        }
        return outputs
    }
}

struct NativeWorldLabProject: Decodable {
    struct World: Decodable {
        let frame: String
        let representation: String
        let origin: [Double]
        let terrainSource: String?
    }
    struct Camera: Decodable {
        let positionMeters: [Double]
        let lookingAtMeters: [Double]
    }
    let format: String
    let schemaVersion: Int
    let id: String
    let title: String
    let revision: Int
    let createdAt: String
    let updatedAt: String
    let world: World
    let camera: Camera
    let entities: [NativeLabSolid]
    let materials: [NativeLabMaterial]
    let networks: [NativeLabCircuitNetwork]?
    let assemblies:[NativeLabAssembly]?
    let digitalNetworks:[NativeLabDigitalNetwork]?

    static let maxBytes = 1_048_576
    static func decode(_ data: Data) throws -> NativeWorldLabProject {
        guard data.count <= maxBytes else { throw NativeWorldLabError.invalid("World Lab project exceeds 1 MB") }
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let root = raw as? [String: Any] else {
            throw NativeWorldLabError.invalid("Expected a World Lab project object")
        }
        let essential:Set<String>=["format","schemaVersion","id","title","revision",
            "createdAt","updatedAt","world","camera","entities","materials"]
        let keys=Set(root.keys)
        guard keys.subtracting(["networks","assemblies","digitalNetworks"])==essential &&
              keys.count<=essential.count+3 else {
            throw NativeWorldLabError.invalid("Unexpected or missing World Lab JSON keys")
        }
        guard let world = root["world"] as? [String: Any],
              let camera = root["camera"] as? [String: Any],
              let entities = root["entities"] as? [[String: Any]],
              let materials = root["materials"] as? [[String: Any]] else {
            throw NativeWorldLabError.invalid("Missing typed World Lab project members")
        }
        try requireKeys(world, ["frame","representation","origin","terrainSource"])
        try requireKeys(camera, ["positionMeters","lookingAtMeters"])
        for o in entities {
            try requireKeys(o, ["id","name","shape","positionMeters","dimensionsMeters",
                                "color","materialId","scientificRole","opacity"])
        }
        for o in materials {
            try requireKeys(o, ["id","name","densityKgM3","youngModulusPa","evidence"])
        }
        if root.keys.contains("networks") && !(root["networks"] is [[String:Any]]) {
            throw NativeWorldLabError.invalid("Circuit networks must be an array of objects")
        }
        let rawNetworks=(root["networks"] as? [[String:Any]]) ?? []
        guard rawNetworks.count<=12 else {
            throw NativeWorldLabError.invalid("Too many portable circuits")
        }
        for network in rawNetworks {
            try requireKeys(network,["id","name","groundNodeId","nodes","components"])
            guard let nodes=network["nodes"] as? [[String:Any]],
                  let components=network["components"] as? [[String:Any]],
                  (2...24).contains(nodes.count),(1...48).contains(components.count),
                  let ground=network["groundNodeId"] as? String else {
                throw NativeWorldLabError.invalid("Invalid electrical node/branch capacity")
            }
            var nodeIds:Set<String>=[]
            for node in nodes {
                try requireKeys(node,["id","label"])
                guard let id=node["id"] as? String,let label=node["label"] as? String else {
                    throw NativeWorldLabError.invalid("Circuit node is missing its identity")
                }
                try validateId(id)
                try validateName(label)
                guard label.count<=80,nodeIds.insert(id).inserted else {
                    throw NativeWorldLabError.invalid("Duplicate or oversized circuit node")
                }
            }
            try validateId(ground)
            guard nodeIds.contains(ground) else {
                throw NativeWorldLabError.invalid("Circuit ground is absent")
            }
            var componentIds:Set<String>=[]
            for component in components {
                guard let kind=component["kind"] as? String,
                      let id=component["id"] as? String,
                      let from=component["positiveNodeId"] as? String,
                      let to=component["negativeNodeId"] as? String else {
                    throw NativeWorldLabError.invalid("Circuit branch requires two ports")
                }
                let common:Set<String>=["id","kind","positiveNodeId","negativeNodeId"]
                let extras:Set<String>
                switch kind {
                case "dc-source": extras=["voltageV"]
                case "resistor": extras=["resistanceOhm"]
                case "hypothetical-device": extras=["name","assumption","evidence"]
                default: throw NativeWorldLabError.invalid("Unsupported circuit component kind")
                }
                if kind=="hypothetical-device" && component.keys.contains("assumedResistanceOhm") {
                    try requireKeys(component,common.union(extras).union(["assumedResistanceOhm"]))
                }else {try requireKeys(component,common.union(extras))}
                try validateId(id);try validateId(from);try validateId(to)
                guard componentIds.insert(id).inserted,from != to,
                      nodeIds.contains(from),nodeIds.contains(to) else {
                    throw NativeWorldLabError.invalid("Duplicate or dangling electrical branch")
                }
                if kind=="dc-source" {
                    guard let voltage=component["voltageV"] as? Double,
                          voltage.isFinite,abs(voltage)<=1000 else {
                        throw NativeWorldLabError.invalid("Invalid electrical voltage")
                    }
                } else if kind=="resistor" {
                    guard let resistance=component["resistanceOhm"] as? Double,
                          resistance.isFinite,resistance>=0.01,resistance<=1e9 else {
                        throw NativeWorldLabError.invalid("Invalid resistor assumption")
                    }
                } else {
                    guard let title=component["name"] as? String,
                          let assumption=component["assumption"] as? String,
                          let evidence=component["evidence"] as? String,
                          evidence=="hypothetical-user-assumed",
                          title.count<=120,assumption.count<=500 else {
                        throw NativeWorldLabError.invalid("Unknown device needs explicit assumptions")
                    }
                    try validateName(title);try validateName(assumption)
                    if component.keys.contains("assumedResistanceOhm"){
                        guard let ohms=component["assumedResistanceOhm"] as? Double,
                              ohms.isFinite,ohms>=0.01,ohms<=1e9 else {
                            throw NativeWorldLabError.invalid(
                                "An invented component needs a bounded assumed Ohmic law")
                        }
                    }
                }
            }
        }
        if root.keys.contains("assemblies") && !(root["assemblies"] is [[String:Any]]) {
            throw NativeWorldLabError.invalid("Assemblies must be bounded JSON objects")
        }
        let groups=(root["assemblies"] as? [[String:Any]]) ?? []
        guard groups.count<=50 else {
            throw NativeWorldLabError.invalid("Too many visual assemblies")
        }
        var groupIds:Set<String>=[]
        var includedSolidIds:Set<String>=[]
        let solidIds=Set(entities.compactMap{$0["id"] as? String})
        for group in groups {
            try requireKeys(group,["id","name","entityIds"])
            guard let id=group["id"] as? String,
                  let name=group["name"] as? String,
                  let members=group["entityIds"] as? [String],
                  (2...30).contains(members.count) else {
                throw NativeWorldLabError.invalid("Assemblies need 2–30 actual solid IDs")
            }
            try validateId(id);try validateName(name)
            guard groupIds.insert(id).inserted else {
                throw NativeWorldLabError.invalid("Duplicate assembly identity")
            }
            for member in members {
                try validateId(member)
                guard solidIds.contains(member),includedSolidIds.insert(member).inserted else {
                    throw NativeWorldLabError.invalid("Assembly has missing or overlapping solid")
                }
            }
        }
        if root.keys.contains("digitalNetworks") &&
            !(root["digitalNetworks"] is [[String:Any]]) {
            throw NativeWorldLabError.invalid("Digital networks must be objects")
        }
        let digital=(root["digitalNetworks"] as? [[String:Any]]) ?? []
        guard digital.count<=8 else {throw NativeWorldLabError.invalid("Digital network limit reached")}
        var digitalIds:Set<String>=[]
        for network in digital {
            try requireKeys(network,["id","name","inputs","gates","outputs"])
            guard let networkId=network["id"] as? String,
                  let name=network["name"] as? String,
                  let inputs=network["inputs"] as? [[String:Any]],
                  let gates=network["gates"] as? [[String:Any]],
                  let outputs=network["outputs"] as? [[String:Any]],
                  (1...12).contains(inputs.count),(1...32).contains(gates.count),
                  (1...16).contains(outputs.count) else {
                throw NativeWorldLabError.invalid("Invalid digital network capacity")
            }
            try validateId(networkId);try validateName(name)
            guard digitalIds.insert(networkId).inserted else {
                throw NativeWorldLabError.invalid("Duplicate digital networks")
            }
            var allIds:Set<String>=[];var known:Set<String>=[]
            for input in inputs {
                try requireKeys(input,["id","label","value"])
                guard let key=input["id"] as? String,
                      let label=input["label"] as? String,
                      input["value"] is Bool else {
                    throw NativeWorldLabError.invalid("Invalid digital Boolean input")
                }
                try validateId(key);try validateName(label)
                guard label.count<=80,allIds.insert(key).inserted else {
                    throw NativeWorldLabError.invalid("Duplicate digital input")
                }
                known.insert(key)
            }
            for gate in gates {
                try requireKeys(gate,["id","name","assumption","inputNodeIds","truthTable","evidence"])
                guard let key=gate["id"] as? String,
                      let name=gate["name"] as? String,
                      let assumption=gate["assumption"] as? String,
                      let wires=gate["inputNodeIds"] as? [String],
                      let bits=gate["truthTable"] as? [Int],
                      let evidence=gate["evidence"] as? String,
                      evidence=="hypothetical-user-assumed",
                      (1...4).contains(wires.count),bits.count==(1<<wires.count),
                      bits.allSatisfy({$0==0 || $0==1}),assumption.count<=500 else {
                    throw NativeWorldLabError.invalid("Invalid assumed digital truth table")
                }
                try validateId(key);try validateName(name);try validateName(assumption)
                guard allIds.insert(key).inserted,Set(wires).count==wires.count,
                      wires.allSatisfy({known.contains($0)}) else {
                    throw NativeWorldLabError.invalid("Cyclic or missing digital input port")
                }
                known.insert(key)
            }
            for output in outputs {
                try requireKeys(output,["id","label","sourceNodeId"])
                guard let key=output["id"] as? String,
                      let name=output["label"] as? String,
                      let source=output["sourceNodeId"] as? String else {
                    throw NativeWorldLabError.invalid("Invalid digital output")
                }
                try validateId(key);try validateId(source);try validateName(name)
                guard name.count<=80,allIds.insert(key).inserted,
                      known.contains(source) else {
                    throw NativeWorldLabError.invalid("Missing digital output source")
                }
            }
        }
        let p = try JSONDecoder().decode(NativeWorldLabProject.self, from: data)
        guard p.format == "env-world-lab", p.schemaVersion == 1,
              p.revision >= 0, p.revision <= 1_000_000_000,
              p.world.frame == "LOCAL_ENU",
              p.world.representation == "representative-not-measured",
              p.world.origin == [0,0,0], p.world.terrainSource == nil,
              p.entities.count <= 200, p.materials.count <= 100 else {
            throw NativeWorldLabError.invalid("Unsupported World Lab project version or world coordinates")
        }
        try validateId(p.id)
        try validateName(p.title)
        if let networks=p.networks {
            for network in networks {try validateId(network.id);try validateName(network.name)}
            guard Set(networks.map(\.id)).count==networks.count else {
                throw NativeWorldLabError.invalid("Duplicate network IDs")
            }
        }
        try validateVector(p.camera.positionMeters)
        try validateVector(p.camera.lookingAtMeters)
        func timestamp(_ s: String) -> Date? {
            let f=ISO8601DateFormatter()
            if let date=f.date(from:s) { return date }
            f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
            return f.date(from:s)
        }
        guard let created=timestamp(p.createdAt), let updated=timestamp(p.updatedAt),
              updated >= created else { throw NativeWorldLabError.invalid("Invalid project time") }
        for m in p.materials {
            try validateId(m.id); try validateName(m.name)
            guard m.evidence == "hypothetical-user-assumed",
                  m.densityKgM3.map({ $0.isFinite && $0 >= 0.001 && $0 <= 1e9 }) ?? true,
                  m.youngModulusPa.map({ $0.isFinite && $0 >= 0 && $0 <= 1e15 }) ?? true else {
                throw NativeWorldLabError.invalid("Unsupported material assumption")
            }
        }
        guard Set(p.materials.map(\.id)).count == p.materials.count,
              Set(p.entities.map(\.id)).count == p.entities.count else {
            throw NativeWorldLabError.invalid("Duplicate World Lab object IDs")
        }
        let materialIds=Set(p.materials.map(\.id))
        for e in p.entities {
            try validateId(e.id); try validateName(e.name)
            try validateVector(e.positionMeters)
            try validateVector(e.dimensionsMeters, positive:true)
            guard ["box","sphere","cylinder"].contains(e.shape),
                  e.color.range(of:"^#[0-9a-fA-F]{6}$",options:.regularExpression) != nil,
                  ["visual-only","reference-solid"].contains(e.scientificRole),
                  e.opacity.isFinite, (0...1).contains(e.opacity),
                  e.materialId.map({materialIds.contains($0)}) ?? true else {
                throw NativeWorldLabError.invalid("Invalid solid type, label or material reference")
            }
            if e.shape == "sphere" && !(e.dimensionsMeters[0] == e.dimensionsMeters[1] &&
                e.dimensionsMeters[1] == e.dimensionsMeters[2]) {
                throw NativeWorldLabError.invalid("Nonuniform sphere geometry")
            }
            if e.shape == "cylinder" && e.dimensionsMeters[0] != e.dimensionsMeters[2] {
                throw NativeWorldLabError.invalid("Noncircular cylinder geometry")
            }
        }
        return p
    }
    private static func requireKeys(_ o:[String:Any],_ expected:Set<String>) throws {
        guard Set(o.keys) == expected else {
            throw NativeWorldLabError.invalid("Unexpected or missing World Lab JSON keys")
        }
    }
    private static func validateId(_ s:String) throws {
        guard s.count > 0, s.count <= 120,
              s.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil else {
            throw NativeWorldLabError.invalid("Invalid World Lab identifier")
        }
    }
    private static func validateName(_ s:String) throws {
        guard !s.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              s.count <= 120 else { throw NativeWorldLabError.invalid("Invalid object name") }
    }
    private static func validateVector(_ values:[Double],positive:Bool=false) throws {
        guard values.count == 3,
              values.allSatisfy({$0.isFinite && (positive ? $0 >= 0.001 && $0 <= 10000 :
                                      $0 >= -100000 && $0 <= 100000)}) else {
            throw NativeWorldLabError.invalid("Invalid 3D coordinates or dimensions")
        }
    }
}

/// Native Swift solution of bounded ideal DC node networks (MNA).
/// New hypothetical parts are rejected until their behavior is supported.
struct NativeLabDcResult {
    let projectId:String
    let projectRevision:Int
    let networkId:String
    let nodeVoltagesV:[String:Double]
    let branchCurrentsA:[String:Double]
    let networkSnapshot:NativeLabCircuitNetwork
    let deliveredPowerW:Double
    let resistorHeatW:Double
    let powerResidualW:Double
    let evidence="physics-model-computed"
    let validity="Bounded ideal linear DC sources and ohmic resistors. Not measured electronics or transients."
}
enum NativeWorldLabDc {
    static func solve(_ network:NativeLabCircuitNetwork,
                      project:NativeWorldLabProject) throws -> NativeLabDcResult {
        let ground=network.groundNodeId
        let nodes=network.nodes.map(\.id).filter{$0 != ground}
        let sources=network.components.filter{$0.kind=="dc-source"}
        guard (1...12).contains(sources.count) else {
            throw NativeWorldLabError.invalid("Circuit needs 1–12 voltage sources")
        }
        let count=nodes.count+sources.count
        guard (1...36).contains(count) else {
            throw NativeWorldLabError.invalid("Circuit exceeds the local numerical budget")
        }
        let nodeIndex=Dictionary(uniqueKeysWithValues:nodes.enumerated().map{($0.element,$0.offset)})
        func position(_ id:String) throws -> Int {
            if id==ground {return -1}
            guard let index=nodeIndex[id] else {
                throw NativeWorldLabError.invalid("Unconnected circuit node")
            }
            return index
        }
        var matrix=Array(repeating:Array(repeating:0.0,count:count+1),count:count)
        for component in network.components {
            let positive=try position(component.positiveNodeId)
            let negative=try position(component.negativeNodeId)
            if component.kind=="resistor" || component.kind=="hypothetical-device" {
                guard let ohms=component.resistanceOhm ?? component.assumedResistanceOhm,
                      ohms>=0.01 else {
                    throw NativeWorldLabError.invalid("Missing bounded resistance")
                }
                let g=1.0/ohms
                if positive>=0 {matrix[positive][positive]+=g}
                if negative>=0 {matrix[negative][negative]+=g}
                if positive>=0 && negative>=0 {
                    matrix[positive][negative]-=g
                    matrix[negative][positive]-=g
                }
            }else if component.kind=="dc-source" {
                guard let sourceIndex=sources.firstIndex(where:{$0.id==component.id}),
                      let voltage=component.voltageV else {
                    throw NativeWorldLabError.invalid("Unknown ideal voltage source")
                }
                let column=nodes.count+sourceIndex
                if positive>=0 {
                    matrix[positive][column]+=1
                    matrix[column][positive]+=1
                }
                if negative>=0 {
                    matrix[negative][column]-=1
                    matrix[column][negative]-=1
                }
                matrix[column][count]=voltage
            }else{
                throw NativeWorldLabError.invalid(
                    "Hypothetical device cannot be solved without a supported physical law")
            }
        }
        let scale=max(1.0,matrix.flatMap{Array($0.prefix(count))}.map{abs($0)}.max() ?? 0)
        for col in 0..<count {
            var pivot=col
            if col+1<count {
                for row in (col+1)..<count {
                    if abs(matrix[row][col])>abs(matrix[pivot][col]) {pivot=row}
                }
            }
            guard abs(matrix[pivot][col])>1e-12*scale else {
                throw NativeWorldLabError.invalid(
                    "DC network has floating nodes or contradictory voltage constraints")
            }
            matrix.swapAt(col,pivot)
            let divisor=matrix[col][col]
            for j in col...count {matrix[col][j]/=divisor}
            for row in 0..<count where row != col {
                let multiplier=matrix[row][col]
                for j in col...count {matrix[row][j]-=multiplier*matrix[col][j]}
            }
        }
        var voltages:[String:Double]=[ground:0]
        for (index,id) in nodes.enumerated() {voltages[id]=matrix[index][count]}
        var currents:[String:Double]=[:]
        var delivered=0.0
        var heat=0.0
        for c in network.components {
            let current:Double
            if c.kind=="dc-source" {
                guard let index=sources.firstIndex(where:{$0.id==c.id}),
                      let voltage=c.voltageV else {
                    throw NativeWorldLabError.invalid("Missing source")
                }
                current=matrix[nodes.count+index][count]
                delivered-=voltage*current
            }else {
                guard let r=c.resistanceOhm ?? c.assumedResistanceOhm,
                      let positive=voltages[c.positiveNodeId],
                      let negative=voltages[c.negativeNodeId] else {
                    throw NativeWorldLabError.invalid("Unconnected resistor")
                }
                current=(positive-negative)/r
                heat+=current*current*r
            }
            guard current.isFinite,abs(current)<=1e6 else {
                throw NativeWorldLabError.invalid("Current exceeds bounded solver limits")
            }
            currents[c.id]=current
        }
        let residual=delivered-heat
        guard delivered.isFinite,heat.isFinite,residual.isFinite,
              abs(residual)<=1e-8*max(1.0,max(abs(delivered),heat)) else {
            throw NativeWorldLabError.invalid("Kirchhoff circuit power balance failed")
        }
        return NativeLabDcResult(projectId:project.id,projectRevision:project.revision,
            networkId:network.id,nodeVoltagesV:voltages,branchCurrentsA:currents,
            networkSnapshot:network,deliveredPowerW:delivered,
            resistorHeatW:heat,powerResidualW:residual)
    }
}

/// Bounded native Swift Archimedes reference with hypothetical solids and fluid.
struct NativeLabHydroResult {
    let projectId:String
    let projectRevision:Int
    let entityId:String
    let fluidDensityKgM3:Double
    let immersionDepthM:Double
    let displacedVolumeM3:Double
    let buoyancyForceN:Double
    let bottomGaugePressurePa:Double
    let netUpwardForceN:Double?
    let equilibriumDraftM:Double?
    let status:String
    let validity="Static level fluid, ideal upright geometry, hypothetical density; " +
        "no dynamic flow, instability, melting, waves or physical material validation."
}
enum NativeWorldLabHydrostatics {
    static func displacedVolume(_ solid:NativeLabSolid,depth:Double)throws->Double {
        let y=solid.dimensionsMeters[1]
        guard depth.isFinite,depth>=0,depth<=y else {
            throw NativeWorldLabError.invalid("Immersion must fit within the selected solid")
        }
        let x=solid.dimensionsMeters[0]
        let z=solid.dimensionsMeters[2]
        switch solid.shape {
        case "box":return x*z*depth
        case "cylinder":return Double.pi*x*z*depth/4
        case "sphere":
            let radius=y/2
            return Double.pi*depth*depth*(3*radius-depth)/3
        default:throw NativeWorldLabError.invalid("Unsupported fluid shape")
        }
    }
    static func evaluate(_ project:NativeWorldLabProject,entityId:String,
                         fluidDensityKgM3:Double,immersionDepthM:Double,
                         gravityMps2:Double=9.80665)throws->NativeLabHydroResult {
        guard fluidDensityKgM3.isFinite,fluidDensityKgM3>=0.01,
              fluidDensityKgM3<=25000,gravityMps2.isFinite,
              gravityMps2>=0,gravityMps2<=100 else {
            throw NativeWorldLabError.invalid("Invalid fluid density or gravity")
        }
        guard let solid=project.entities.first(where:{$0.id==entityId}) else {
            throw NativeWorldLabError.invalid("Select a solid for immersion")
        }
        let displacement=try displacedVolume(solid,depth:immersionDepthM)
        let density=project.materials.first(where:{$0.id==solid.materialId})?.densityKgM3
        let mass=density.map{solid.volumeMetersCubed*$0}
        let full=solid.volumeMetersCubed*fluidDensityKgM3
        let buoyancy=displacement*fluidDensityKgM3*gravityMps2
        let net=mass.map{buoyancy-$0*gravityMps2}
        let status:String
        let draft:Double?
        if let mass {
            if mass>full {status="sinking"}
            else if mass==full {status="neutrally-buoyant"}
            else {status="floating"}
            if mass>=full {draft=solid.dimensionsMeters[1]}
            else {
                let target=mass/fluidDensityKgM3
                var lo=0.0
                var hi=solid.dimensionsMeters[1]
                for _ in 0..<64 {
                    let mid=(lo+hi)/2
                    if try displacedVolume(solid,depth:mid)<target {lo=mid}
                    else {hi=mid}
                }
                draft=(lo+hi)/2
            }
        }else {status="unknown-mass";draft=nil}
        let pressure=fluidDensityKgM3*gravityMps2*immersionDepthM
        guard [displacement,buoyancy,pressure,net ?? 0,draft ?? 0].allSatisfy({$0.isFinite}) else {
            throw NativeWorldLabError.invalid("Fluid experiment exceeded finite precision")
        }
        return NativeLabHydroResult(
            projectId:project.id,projectRevision:project.revision,entityId:entityId,
            fluidDensityKgM3:fluidDensityKgM3,immersionDepthM:immersionDepthM,
            displacedVolumeM3:displacement,buoyancyForceN:buoyancy,
            bottomGaugePressurePa:pressure,netUpwardForceN:net,
            equilibriumDraftM:draft,status:status)
    }
}

/// Independent bounded Swift 1D buoyancy, gravity and viscous damping.
struct NativeLabFluidMotionInput {
    var fluidDensityKgM3:Double
    var waterSurfaceHeightM:Double
    var startingBottomHeightM:Double
    var linearDragNsPerM:Double
    var gravityMps2:Double=9.80665
    var durationSeconds:Double=4
}
struct NativeLabFluidMotionSample {
    let timeSeconds:Double
    let bottomHeightM:Double
    let velocityMps:Double
    let immersionDepthM:Double
    let displacedVolumeM3:Double
    let buoyancyForceN:Double
    let dragForceN:Double
    let weightForceN:Double
    let kineticEnergyJ:Double
    let gravitationalEnergyJ:Double
    let cumulativeBuoyancyWorkJ:Double
    let dissipatedEnergyJ:Double
    let energyResidualJ:Double
    let grounded:Bool
}
struct NativeLabFluidMotionRun {
    let projectId:String
    let projectRevision:Int
    let entityId:String
    let materialId:String
    let massKg:Double
    let input:NativeLabFluidMotionInput
    let samples:[NativeLabFluidMotionSample]
    let stepSeconds:Double
    let evidence="physics-model-computed"
    let validity="One-dimensional Archimedes displacement with an assumed fixed fluid plane, " +
        "viscous drag and bottom contact; no real fluid flow, waves or verified material."
}
enum NativeWorldLabFluidMotion {
    static func evaluate(_ p:NativeWorldLabProject,entityId:String,
                         input:NativeLabFluidMotionInput,
                         requestedStepSeconds:Double=1.0/240)throws->NativeLabFluidMotionRun {
        func bounded(_ v:Double,_ lower:Double,_ upper:Double,_ name:String)throws {
            guard v.isFinite,v>=lower,v<=upper else {
                throw NativeWorldLabError.invalid("\(name) outside the supported fluid range")
            }
        }
        try bounded(input.fluidDensityKgM3,0.01,25000,"Fluid density")
        try bounded(input.waterSurfaceHeightM,0,20,"Fluid surface")
        try bounded(input.startingBottomHeightM,0,20,"Initial height")
        try bounded(input.linearDragNsPerM,0,10000,"Linear damping")
        try bounded(input.gravityMps2,0,100,"Gravity")
        try bounded(input.durationSeconds,0.1,12,"Duration")
        try bounded(requestedStepSeconds,0.0001,0.05,"Solver step")
        guard let solid=p.entities.first(where:{$0.id==entityId}),
              let material=p.materials.first(where:{$0.id==solid.materialId}),
              let density=material.densityKgM3 else {
            throw NativeWorldLabError.invalid("Floating motion requires an assumed solid density")
        }
        let mass=solid.volumeMetersCubed*density
        try bounded(mass,0.001,10000,"Invented mass")
        let rate=max(1.0,input.linearDragNsPerM/mass)
        let stepCount=Int(ceil(input.durationSeconds/min(
            requestedStepSeconds,0.05/rate)))
        guard stepCount<=50000 else {
            throw NativeWorldLabError.invalid("A stiff fluid solver is required")
        }
        let dt=input.durationSeconds/Double(stepCount)
        struct Force {
            let depth:Double
            let displaced:Double
            let buoyancy:Double
            let drag:Double
            let weight:Double
            let acceleration:Double
        }
        func forces(_ h:Double,_ v:Double)throws->Force {
            let depth=max(0,min(solid.dimensionsMeters[1],
                input.waterSurfaceHeightM-max(0,h)))
            let displaced=try NativeWorldLabHydrostatics.displacedVolume(solid,depth:depth)
            let buoyancy=input.fluidDensityKgM3*input.gravityMps2*displaced
            let drag = -input.linearDragNsPerM*v
            let weight=mass*input.gravityMps2
            return Force(depth:depth,displaced:displaced,buoyancy:buoyancy,
                drag:drag,weight:weight,acceleration:(buoyancy+drag-weight)/mass)
        }
        func derivative(_ s:[Double])throws->[Double] {
            let f=try forces(s[0],s[1])
            if s[0]<=0 && s[1]<=0 && f.buoyancy<=f.weight {return [0,0]}
            return [s[1],f.acceleration]
        }
        func advance(_ s:[Double])throws->[Double] {
            let k1=try derivative(s)
            func shifted(_ k:[Double],_ multiple:Double)->[Double] {
                return [s[0]+dt*k[0]*multiple,s[1]+dt*k[1]*multiple]
            }
            let k2=try derivative(shifted(k1,0.5))
            let k3=try derivative(shifted(k2,0.5))
            let k4=try derivative(shifted(k3,1))
            return [
                s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
                s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6
            ]
        }
        var state:[Double]=[input.startingBottomHeightM,0]
        var buoyancyWork=0.0
        var dissipation=0.0
        let initial=mass*input.gravityMps2*state[0]
        var samples:[NativeLabFluidMotionSample]=[]
        samples.reserveCapacity(stepCount+1)
        for j in 0...stepCount {
            let h=state[0],v=state[1]
            let f=try forces(h,v)
            let kinetic=0.5*mass*v*v
            let potential=mass*input.gravityMps2*h
            let residual=initial+buoyancyWork-kinetic-potential-dissipation
            guard [h,v,kinetic,potential,residual,buoyancyWork,
                   dissipation,f.buoyancy].allSatisfy({$0.isFinite}),
                  h<=1000,abs(v)<=10000 else {
                throw NativeWorldLabError.invalid("Fluid motion left its finite numerical domain")
            }
            samples.append(NativeLabFluidMotionSample(
                timeSeconds:Double(j)*dt,bottomHeightM:h,velocityMps:v,
                immersionDepthM:f.depth,displacedVolumeM3:f.displaced,
                buoyancyForceN:f.buoyancy,dragForceN:f.drag,weightForceN:f.weight,
                kineticEnergyJ:kinetic,gravitationalEnergyJ:potential,
                cumulativeBuoyancyWorkJ:buoyancyWork,
                dissipatedEnergyJ:dissipation,energyResidualJ:residual,
                grounded:h==0 && v==0))
            if j==stepCount {break}
            let raw=try advance(state)
            let next=(raw[0]<0 || (raw[0]==0 && raw[1]<0))
                ? [0.0,0.0] : raw
            let after=try forces(next[0],next[1])
            buoyancyWork+=0.5*(f.buoyancy+after.buoyancy)*(next[0]-h)
            dissipation+=0.5*dt*input.linearDragNsPerM*(v*v+next[1]*next[1])
            if next[0]==0 && next[1]==0 && (h>0 || v<0) && raw[1]<0 {
                dissipation+=0.5*mass*raw[1]*raw[1]
            }
            state=next
        }
        return NativeLabFluidMotionRun(
            projectId:p.id,projectRevision:p.revision,entityId:entityId,
            materialId:material.id,massKg:mass,input:input,
            samples:samples,stepSeconds:dt)
    }
}

/// Native Swift well-mixed hypothetical Arrhenius kinetics with thermal feedback.
struct NativeChemicalThermalInput {
    var initialReactantMol:Double=1
    var initialTemperatureK:Double=300
    var ambientTemperatureK:Double=300
    var preExponentialPerS:Double=0.5
    var activationEnergyJPerMol:Double=10000
    var reactionHeatReleasedJPerMol:Double=50000
    var heatCapacityJPerK:Double=500
    var coolingConductanceWPerK:Double=5
    var externalHeatingW:Double=0
    var durationSeconds:Double=6
}
struct NativeChemicalThermalSample {
    let timeSeconds:Double
    let reactantRemainingMol:Double
    let productFormedMol:Double
    let reactionRateMolPerS:Double
    let temperatureK:Double
    let reactionPowerW:Double
    let coolingPowerW:Double
    let cumulativeChemicalHeatJ:Double
    let cumulativeExternalHeatJ:Double
    let cumulativeCoolingJ:Double
    let storedThermalEnergyJ:Double
    let energyResidualJ:Double
}
struct NativeChemicalThermalResult {
    let input:NativeChemicalThermalInput
    let samples:[NativeChemicalThermalSample]
    let stepSeconds:Double
    let evidence="physics-model-computed"
    let validity="Well-mixed hypothetical first-order Arrhenius reaction and thermal energy balance; " +
        "no identified substance, reaction selectivity, measured matter or safety certification."
}
enum NativeWorldLabChemicalThermal {
    static func evaluate(_ i:NativeChemicalThermalInput,
                         requestedStepSeconds:Double=1.0/120)throws->NativeChemicalThermalResult {
        func bounded(_ value:Double,_ lower:Double,_ upper:Double,
                     _ field:String)throws {
            guard value.isFinite,value>=lower,value<=upper else {
                throw NativeWorldLabError.invalid("\(field) outside assumed chemical domain")
            }
        }
        try bounded(i.initialReactantMol,0.001,10000,"Reactant")
        try bounded(i.initialTemperatureK,200,1200,"Initial temperature")
        try bounded(i.ambientTemperatureK,200,1200,"Ambient temperature")
        try bounded(i.preExponentialPerS,0,100000,"Frequency factor")
        try bounded(i.activationEnergyJPerMol,0,200000,"Activation energy")
        try bounded(i.reactionHeatReleasedJPerMol,-1e6,1e6,"Reaction heat")
        try bounded(i.heatCapacityJPerK,1,1e6,"Thermal capacity")
        try bounded(i.coolingConductanceWPerK,0,10000,"Cooling")
        try bounded(i.externalHeatingW,-10000,10000,"External heating")
        try bounded(i.durationSeconds,0.1,60,"Duration")
        try bounded(requestedStepSeconds,0.0001,0.05,"Solver step")
        let rateScale=i.preExponentialPerS*exp(
            -i.activationEnergyJPerMol/(8.31446261815324*2000))
        let stiffness=max(1,max(rateScale,
            i.coolingConductanceWPerK/i.heatCapacityJPerK))
        let stepCount=Int(ceil(i.durationSeconds/min(
            requestedStepSeconds,0.04/stiffness)))
        guard stepCount<=50000 else {
            throw NativeWorldLabError.invalid("A specialized stiff chemistry solver is required")
        }
        let dt=i.durationSeconds/Double(stepCount)
        func rate(_ n:Double,_ t:Double)->Double {
            return i.preExponentialPerS*exp(-i.activationEnergyJPerMol / (8.31446261815324*max(1,t)))*n
        }
        func derivative(_ s:[Double])->[Double]{
            let reactionRate=rate(s[0],s[1])
            let cooling=i.coolingConductanceWPerK*(s[1]-i.ambientTemperatureK)
            let heat=i.reactionHeatReleasedJPerMol*reactionRate +
                i.externalHeatingW-cooling
            return [-reactionRate,heat/i.heatCapacityJPerK]
        }
        func advance(_ s:[Double])->[Double]{
            let k1=derivative(s)
            func shifted(_ k:[Double],_ factor:Double)->[Double]{
                return [s[0]+dt*k[0]*factor,s[1]+dt*k[1]*factor]
            }
            let k2=derivative(shifted(k1,0.5))
            let k3=derivative(shifted(k2,0.5))
            let k4=derivative(shifted(k3,1))
            return [s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
                s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6]
        }
        var state=[i.initialReactantMol,i.initialTemperatureK]
        var cumulativeCooling=0.0
        var output:[NativeChemicalThermalSample]=[]
        output.reserveCapacity(stepCount+1)
        for j in 0...stepCount {
            let n=state[0],temp=state[1]
            let product=i.initialReactantMol-n
            let reactionRate=rate(n,temp)
            let released=i.reactionHeatReleasedJPerMol*product
            let external=i.externalHeatingW*Double(j)*dt
            let stored=i.heatCapacityJPerK*(temp-i.initialTemperatureK)
            let cooling=i.coolingConductanceWPerK*(temp-i.ambientTemperatureK)
            let residual=released+external-stored-cumulativeCooling
            guard [n,temp,product,reactionRate,released,external,stored,
                   cooling,residual].allSatisfy({$0.isFinite}),
                  n >= -1e-6,n<=i.initialReactantMol+1e-6,
                  temp>=150,temp<=2000 else {
                throw NativeWorldLabError.invalid("Thermal reaction left bounded numerical conditions")
            }
            output.append(NativeChemicalThermalSample(
                timeSeconds:Double(j)*dt,reactantRemainingMol:n,
                productFormedMol:product,reactionRateMolPerS:reactionRate,
                temperatureK:temp,reactionPowerW:reactionRate*i.reactionHeatReleasedJPerMol,
                coolingPowerW:cooling,cumulativeChemicalHeatJ:released,
                cumulativeExternalHeatJ:external,cumulativeCoolingJ:cumulativeCooling,
                storedThermalEnergyJ:stored,energyResidualJ:residual))
            if j==stepCount {break}
            let next=advance(state)
            guard next.allSatisfy({$0.isFinite}),next[0] >= -1e-6,
                  next[0]<=i.initialReactantMol+1e-6,next[1]>=150,next[1]<=2000 else {
                throw NativeWorldLabError.invalid("Reaction solver is unstable under these assumptions")
            }
            let nextCooling=i.coolingConductanceWPerK*(next[1]-i.ambientTemperatureK)
            cumulativeCooling+=0.5*dt*(cooling+nextCooling)
            state=[max(0,min(i.initialReactantMol,next[0])),next[1]]
        }
        return NativeChemicalThermalResult(input:i,samples:output,stepSeconds:dt)
    }
}

