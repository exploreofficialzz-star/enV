import Foundation

struct NativeExpansionOperation {
    let id: String
    let family: String
    let key: String
    let aLabel: String
    let bLabel: String
    let cLabel: String
    let target: Character
}

enum NativeExpansionCalculatorEngine {
    private static let operations: [String: NativeExpansionOperation] = parse()
    static func operation(for toolID: String) -> NativeExpansionOperation? { operations[toolID] }
    static var supportedToolIDs: Set<String> { Set(operations.keys) }

    static func run(_ op: NativeExpansionOperation, values: [Character: Double]) throws -> (String, Double) {
        func value(_ key: Character, _ label: String) throws -> Double { guard let v = values[key] else { throw NSError(domain: "NativeExpansion", code: 1, userInfo: [NSLocalizedDescriptionKey: "Enter a value for \(label)."]) }; return v }
        switch op.family {
        case "product":
            switch op.target { case "a": return (op.aLabel, try value("c", op.cLabel) / value("b", op.bLabel)); case "b": return (op.bLabel, try value("c", op.cLabel) / value("a", op.aLabel)); default: return (op.cLabel, try value("a", op.aLabel) * value("b", op.bLabel)) }
        case "sum":
            switch op.target { case "a": return (op.aLabel, try value("c", op.cLabel) - value("b", op.bLabel)); case "b": return (op.bLabel, try value("c", op.cLabel) - value("a", op.aLabel)); default: return (op.cLabel, try value("a", op.aLabel) + value("b", op.bLabel)) }
        case "ratio":
            switch op.target { case "a": return (op.aLabel, try value("c", op.cLabel) * value("b", op.bLabel)); case "b": return (op.bLabel, try value("a", op.aLabel) / value("c", op.cLabel)); default: return (op.cLabel, try value("a", op.aLabel) / value("b", op.bLabel)) }
        default: throw NSError(domain: "NativeExpansion", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported expansion family."])
        }
    }

    private static func parse() -> [String: NativeExpansionOperation] {
        guard let data = NativeEngineData.expansionJSON.data(using: .utf8), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        var output: [String: NativeExpansionOperation] = [:]
        for (family, raw) in root {
            guard let rows = raw as? [[Any]] else { continue }
            for row in rows where row.count >= 4 {
                guard let key = row[0] as? String, let a = row[1] as? String, let b = row[2] as? String, let c = row[3] as? String else { continue }
                for target in [Character("a"), Character("b"), Character("c")] {
                    let id = "math-exp-\(family)-\(key)-\(target)"
                    output[id] = NativeExpansionOperation(id: id, family: family, key: key, aLabel: a, bLabel: b, cLabel: c, target: target)
                }
            }
        }
        return output
    }
}
