import Foundation

/// A strict native Swift project interchange model, separate from gameplay schemas.
enum NativeWorldLabError: LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        if case .invalid(let detail) = self { return detail }
        return "Invalid World Lab project"
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
        guard keys==essential || keys==essential.union(["networks"]) else {
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
    let validity="One-dimensional Archimedes displacement with an assumed fixed fluid plane, "+
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

