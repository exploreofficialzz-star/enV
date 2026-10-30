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
                try requireKeys(component,common.union(extras))
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
