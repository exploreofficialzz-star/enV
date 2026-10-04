import Foundation

struct NativeConverterOperation {
    let toolID: String
    let systemID: String
    let mode: String
}

struct NativeUnitDef {
    let id: String
    let label: String
    let toBase: Double
    let offset: Double
    let inverse: Bool
    let table: [Double: Double]
}

struct NativeSystemDef {
    let id: String
    let name: String
    let units: [NativeUnitDef]
}

enum NativeConverterError: Error, LocalizedError {
    case invalidInput
    case unknownSystem
    case unknownUnit(String)
    case unsupportedMode

    var errorDescription: String? {
        switch self {
        case .invalidInput: return "Enter a valid number."
        case .unknownSystem: return "Unknown conversion system."
        case .unknownUnit(let unit): return "Unknown unit: \(unit)"
        case .unsupportedMode: return "Unsupported converter mode."
        }
    }
}

enum NativeConverterEngine {
    private static let parsed: ([String: NativeSystemDef], [String: (name: String, width: Double, height: Double)]) = parseData()

    static func operation(for tool: Tool) -> NativeConverterOperation? {
        guard !tool.isPlanned, tool.engine.type == "converter" else { return nil }
        guard let system = configurationString(tool.engine.configuration["system"]) else { return nil }
        guard parsed.0[system] != nil else { return nil }
        return NativeConverterOperation(toolID: tool.id, systemID: system, mode: configurationString(tool.engine.configuration["mode"]) ?? "standard")
    }

    static func units(for operation: NativeConverterOperation) -> [NativeUnitDef] { parsed.0[operation.systemID]?.units ?? [] }

    static func run(_ operation: NativeConverterOperation, valueText: String, from: String, to: String) throws -> String {
        guard let value = Double(valueText.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: "")) else { throw NativeConverterError.invalidInput }
        guard let system = parsed.0[operation.systemID] else { throw NativeConverterError.unknownSystem }
        switch operation.mode {
        case "reference", "table", "comparison", "quick":
            return try reference(system: system, systemID: operation.systemID, value: value, from: from)
        default:
            let result = try convert(systemID: operation.systemID, value: value, from: from, to: to)
            let target = system.units.first(where: { $0.id == to })?.label ?? to
            return "\(format(result)) \(target)"
        }
    }

    private static func reference(system: NativeSystemDef, systemID: String, value: Double, from: String) throws -> String {
        var lines = ["\(format(value)) \(system.units.first(where: { $0.id == from })?.label ?? from)"]
        for unit in system.units where unit.id != from {
            if let value = try? convert(systemID: systemID, value: value, from: from, to: unit.id) {
                lines.append("\(unit.label): \(format(value))")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func convert(systemID: String, value: Double, from: String, to: String) throws -> Double {
        if from == to { return value }
        if systemID == "dpi" { return convertDPI(value: value, from: from, to: to) }
        if systemID == "paper" {
            let fromPaper = parsed.1[from.lowercased()]
            let toPaper = parsed.1[to.lowercased()]
            if let toPaper { return fromPaper != nil ? toPaper.width : Double.nan }
            if let fromPaper { return fromPaper.width * value }
            return Double.nan
        }
        guard let system = parsed.0[systemID] else { throw NativeConverterError.unknownSystem }
        guard let fromUnit = system.units.first(where: { $0.id.caseInsensitiveCompare(from) == .orderedSame }) else { throw NativeConverterError.unknownUnit(from) }
        guard let toUnit = system.units.first(where: { $0.id.caseInsensitiveCompare(to) == .orderedSame }) else { throw NativeConverterError.unknownUnit(to) }
        let base = toBase(fromUnit, value)
        return fromBase(toUnit, base)
    }

    private static func toBase(_ unit: NativeUnitDef, _ value: Double) -> Double {
        if unit.inverse { return value == 0 ? Double.nan : unit.toBase / value }
        if unit.toBase == 0, !unit.table.isEmpty { return tableToBase(unit.table, value) }
        return (value + unit.offset) * (unit.toBase == 0 ? 1 : unit.toBase)
    }

    private static func fromBase(_ unit: NativeUnitDef, _ base: Double) -> Double {
        if unit.inverse { return base == 0 ? Double.nan : unit.toBase / base }
        if unit.toBase == 0, !unit.table.isEmpty { return tableFromBase(unit.table, base) }
        return base / (unit.toBase == 0 ? 1 : unit.toBase) - unit.offset
    }

    private static func tableToBase(_ table: [Double: Double], _ value: Double) -> Double {
        if let exact = table[value] { return exact }
        let entries = table.sorted { $0.key < $1.key }
        guard let first = entries.first, let last = entries.last else { return value }
        if value <= first.key { return first.value }
        if value >= last.key { return last.value }
        for i in 1..<entries.count {
            let (x0, y0) = (entries[i - 1].key, entries[i - 1].value)
            let (x1, y1) = (entries[i].key, entries[i].value)
            if value <= x1 {
                let t = (value - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
            }
        }
        return last.value
    }

    private static func tableFromBase(_ table: [Double: Double], _ base: Double) -> Double {
        let entries = table.sorted { $0.value < $1.value }
        guard let first = entries.first, let last = entries.last else { return base }
        if base <= first.value { return first.key }
        if base >= last.value { return last.key }
        for i in 1..<entries.count {
            let (x0, y0) = (entries[i - 1].key, entries[i - 1].value)
            let (x1, y1) = (entries[i].key, entries[i].value)
            if base <= y1 {
                let span = y1 - y0
                let t = span == 0 ? 0 : (base - y0) / span
                return x0 + t * (x1 - x0)
            }
        }
        return last.key
    }

    private static func convertDPI(value: Double, from: String, to: String) -> Double {
        let from = from.lowercased(), to = to.lowercased()
        let inches: Double
        switch from {
        case "in": inches = value
        case "mm": inches = value / 25.4
        case "px": inches = value / 96
        case "dpi": return to == "dpi" ? value : Double.nan
        default: return Double.nan
        }
        switch to {
        case "in": return inches
        case "mm": return inches * 25.4
        case "px": return inches * 96
        case "dpi": return 96
        default: return Double.nan
        }
    }

    private static func format(_ value: Double) -> String {
        guard value.isFinite else { return "—" }
        let absolute = abs(value)
        if absolute != 0 && (absolute < 1e-6 || absolute >= 1e10) { return String(format: "%.6e", value).replacingOccurrences(of: ".?0+e", with: "e", options: .regularExpression) }
        return String(format: absolute >= 1e6 ? "%.8g" : "%.10g", value)
    }

    private static func parseData() -> ([String: NativeSystemDef], [String: (name: String, width: Double, height: Double)]) {
        guard let data = NativeEngineData.unitJSON.data(using: .utf8), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return ([:], [:]) }
        var systems: [String: NativeSystemDef] = [:]
        if let rawSystems = root["systems"] as? [String: Any] {
            for (key, value) in rawSystems {
                guard let obj = value as? [String: Any], let units = obj["units"] as? [[String: Any]] else { continue }
                let defs = units.compactMap { u -> NativeUnitDef? in
                    guard let id = u["id"] as? String, let label = u["label"] as? String else { return nil }
                    var table: [Double: Double] = [:]
                    if let rawTable = u["table"] as? [String: Any] { for (k, v) in rawTable { if let x = Double(k), let y = v as? NSNumber { table[x] = y.doubleValue } } }
                    return NativeUnitDef(id: id, label: label, toBase: (u["toBase"] as? NSNumber)?.doubleValue ?? 0, offset: (u["offset"] as? NSNumber)?.doubleValue ?? 0, inverse: (u["inverse"] as? NSNumber)?.boolValue ?? false, table: table)
                }
                systems[key] = NativeSystemDef(id: obj["id"] as? String ?? key, name: obj["name"] as? String ?? key, units: defs)
            }
        }
        var papers: [String: (name: String, width: Double, height: Double)] = [:]
        if let rawPapers = root["paperSizes"] as? [String: Any] {
            for (key, value) in rawPapers {
                guard let obj = value as? [String: Any], let name = obj["name"] as? String, let width = (obj["widthMm"] as? NSNumber)?.doubleValue, let height = (obj["heightMm"] as? NSNumber)?.doubleValue else { continue }
                papers[key.lowercased()] = (name, width, height)
            }
        }
        return (systems, papers)
    }

    private static func configurationString(_ value: CatalogJSONValue?) -> String? { if case let .string(s)? = value { return s }; return nil }
}
