import Foundation

/// Native port of the remaining expression-only web calculators.
enum NativeCalculatorEngine {
    struct Field { let name: String; let label: String; let defaultValue: String; let suffix: String?; let hint: String?; let placeholder: String? }
    struct Output { let label: String; let value: String; let hint: String?; let primary: Bool }
    struct Operation { let id: String; let formula: String?; let fields: [Field]; let outputs: [OutputSpec] }

    indirect enum Expr {
        case constant(Double)
        case string(String)
        case value(name: String, validator: String, label: String?)
        case validate(validator: String, arg: Expr, label: String?)
        case unary(String, Expr)
        case binary(String, Expr, Expr)
        case call(String, [Expr])
        case template([TemplatePart])
    }
    enum TemplatePart { case text(String); case expr(Expr) }
    struct OutputSpec { let label: String; let value: Expr; let primary: Bool; let hint: String? }

    private enum Eval { case number(Double); case text(String) }
    private static let operations = parse()

    static func operation(for toolID: String) -> Operation? { operations[toolID] }
    static var supportedToolIDs: Set<String> { Set(operations.keys) }

    static func run(_ op: Operation, values: [String: String]) throws -> [Output] {
        try op.outputs.map { spec in
            switch try evaluate(spec.value, values: values) {
            case .number(let value): return Output(label: spec.label, value: formatNumber(value), hint: spec.hint, primary: spec.primary)
            case .text(let value): return Output(label: spec.label, value: value, hint: spec.hint, primary: spec.primary)
            }
        }
    }

    private static func evaluate(_ expr: Expr, values: [String: String]) throws -> Eval {
        switch expr {
        case .constant(let value): return .number(value)
        case .string(let value): return .text(value)
        case .value(let name, let validator, let label):
            let value = try parseNumber(values[name], label ?? name)
            return .number(try validate(validator, value, label ?? name))
        case .validate(let validator, let arg, let label):
            let value = try asNumber(try evaluate(arg, values: values))
            return .number(try validate(validator, value, label ?? "value"))
        case .unary(let op, let arg):
            let value = try asNumber(try evaluate(arg, values: values))
            return .number(op == "-" ? -value : value)
        case .binary(let op, let left, let right):
            let a = try asNumber(try evaluate(left, values: values))
            let b = try asNumber(try evaluate(right, values: values))
            switch op {
            case "+": return .number(a + b)
            case "-": return .number(a - b)
            case "*": return .number(a * b)
            case "/": return .number(a / b)
            case "**": return .number(pow(a, b))
            default: throw calculatorError("Unsupported calculator operator \(op)")
            }
        case .call(let name, let args):
            switch name {
            case "gcd":
                guard args.count == 2 else { throw calculatorError("gcd() requires two values.") }
                let a = Int(abs(try asNumber(try evaluate(args[0], values: values))))
                let b = Int(abs(try asNumber(try evaluate(args[1], values: values))))
                return .number(Double(gcd(a, b)))
            default: throw calculatorError("Unsupported calculator function \(name)")
            }
        case .template(let parts):
            var result = ""
            for part in parts {
                switch part {
                case .text(let text): result += text
                case .expr(let expr): result += jsString(try asNumber(try evaluate(expr, values: values)))
                }
            }
            return .text(result)
        }
    }

    private static func asNumber(_ value: Eval) throws -> Double {
        switch value {
        case .number(let x): return x
        case .text(let x): guard let value = Double(x) else { throw calculatorError("Expected a numeric result.") }; return value
        }
    }

    private static func parseNumber(_ raw: String?, _ label: String) throws -> Double {
        let cleaned = (raw ?? "").replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite else { throw calculatorError("Enter a valid \(label).") }
        return value
    }

    private static func validate(_ kind: String, _ value: Double, _ label: String) throws -> Double {
        switch kind {
        case "n": return value
        case "pos": guard value > 0 else { throw calculatorError("\(label) must be greater than 0.") }; return value
        case "integer": guard value.rounded() == value else { throw calculatorError("\(label) must be a whole number.") }; return value
        default: throw calculatorError("Unsupported calculator validator \(kind)")
        }
    }

    private static func gcd(_ a0: Int, _ b0: Int) -> Int {
        var a = abs(a0), b = abs(b0)
        while b != 0 { let r = a % b; a = b; b = r }
        return a == 0 ? 1 : a
    }

    private static func formatNumber(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value == .infinity { return "∞" }
        if value == -.infinity { return "-∞" }
        let formatter = NumberFormatter()
        formatter.locale = Locale.current
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 8
        formatter.minimumFractionDigits = 0
        formatter.usesGroupingSeparator = true
        return formatter.string(from: NSNumber(value: value)) ?? jsString(value)
    }

    private static func jsString(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value == .infinity { return "Infinity" }
        if value == -.infinity { return "-Infinity" }
        if value == 0 { return "0" }
        if value.rounded() == value { return String(Int(value)) }
        return String(value)
    }

    private static func calculatorError(_ message: String) -> NSError { NSError(domain: "NativeCalculator", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }

    private static func parse() -> [String: Operation] {
        guard let data = NativeCalculatorData.json.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tools = root["tools"] as? [[String: Any]] else { return [:] }
        var result: [String: Operation] = [:]
        for tool in tools {
            guard let id = tool["id"] as? String, let fieldsRaw = tool["fields"] as? [[String: Any]], let outputsRaw = tool["outputs"] as? [[String: Any]] else { continue }
            let fields = fieldsRaw.compactMap { field -> Field? in
                guard let name = field["name"] as? String, let label = field["label"] as? String else { return nil }
                return Field(name: name, label: label, defaultValue: field["defaultValue"] as? String ?? (field["defaultValue"] as? NSNumber)?.stringValue ?? "", suffix: field["suffix"] as? String, hint: field["hint"] as? String, placeholder: field["placeholder"] as? String)
            }
            let outputs = outputsRaw.compactMap { raw -> OutputSpec? in
                guard let label = raw["label"] as? String, let value = raw["value"], let expr = parseExpr(value) else { return nil }
                return OutputSpec(label: label, value: expr, primary: raw["primary"] as? Bool ?? false, hint: raw["hint"] as? String)
            }
            result[id] = Operation(id: id, formula: tool["formula"] as? String, fields: fields, outputs: outputs)
        }
        return result
    }

    private static func parseExpr(_ raw: Any) -> Expr? {
        if let string = raw as? String { return .string(string) }
        guard let object = raw as? [String: Any], let kind = object["kind"] as? String else { return nil }
        switch kind {
        case "const": return (object["value"] as? NSNumber).map { .constant($0.doubleValue) }
        case "string": return (object["value"] as? String).map(Expr.string)
        case "value":
            guard let name = object["name"] as? String, let validator = object["validator"] as? String else { return nil }
            return .value(name: name, validator: validator, label: object["label"] as? String)
        case "validate":
            guard let validator = object["validator"] as? String, let arg = object["arg"], let parsed = parseExpr(arg) else { return nil }
            return .validate(validator: validator, arg: parsed, label: object["label"] as? String)
        case "unary":
            guard let op = object["op"] as? String, let arg = object["arg"], let parsed = parseExpr(arg) else { return nil }
            return .unary(op, parsed)
        case "binary":
            guard let op = object["op"] as? String, let left = object["left"], let right = object["right"], let l = parseExpr(left), let r = parseExpr(right) else { return nil }
            return .binary(op, l, r)
        case "call":
            guard let name = object["name"] as? String, let args = object["args"] as? [Any] else { return nil }
            return .call(name, args.compactMap(parseExpr))
        case "template":
            guard let parts = object["parts"] as? [Any] else { return nil }
            return .template(parts.compactMap { part in
                if let text = part as? String { return .text(text) }
                if let object = part as? [String: Any] { return parseExpr(object).map(TemplatePart.expr) }
                return nil
            })
        default: return nil
        }
    }
}
