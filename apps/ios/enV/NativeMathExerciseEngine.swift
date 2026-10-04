import Foundation

struct NativeExerciseField { let name: String; let label: String }
struct NativeExerciseOperation { let id: String; let specKey: String; let target: String; let name: String; let formula: String; let fields: [NativeExerciseField]; let label: String; let kind: String; let expression: String? }

enum NativeMathExerciseEngine {
    private static let operations = parse()
    static func operation(for toolID: String) -> NativeExerciseOperation? { operations[toolID] }
    static var supportedToolIDs: Set<String> { Set(operations.keys) }

    static func run(_ op: NativeExerciseOperation, values: [String: Double]) throws -> (String, Double) {
        let result: Double
        if op.kind == "expression" { var parser = ExpressionParser(source: op.expression ?? "", values: values); result = try parser.parse() }
        else { result = try complex(op, values) }
        guard result.isFinite else { throw NSError(domain: "NativeExercise", code: 1, userInfo: [NSLocalizedDescriptionKey: "The formula produced an undefined result."]) }
        return (op.label, result)
    }

    private static func complex(_ op: NativeExerciseOperation, _ v: [String: Double]) throws -> Double {
        func req(_ key: String) throws -> Double { guard let x = v[key] else { throw NSError(domain: "NativeExercise", code: 2, userInfo: [NSLocalizedDescriptionKey: "Enter a value for \(key)."])}; return x }
        switch op.specKey {
        case "geometric-sum": let r = try req("r"), a = try req("a"), n = try req("n"); return abs(r - 1) < 1e-12 ? a * n : a * (pow(r, n) - 1) / (r - 1)
        case "binomial-probability": let n = Int(round(try req("n"))), k = Int(round(try req("k"))), p = try req("p"); var c = 1.0; if k > 0 { for i in 1...k { c *= Double(n-k+i) / Double(i) } }; return c * pow(p, Double(k)) * pow(1-p, Double(n-k))
        case "cylinder-surface-area": let h = try req("h"), A = try req("A"); return (-2 * Double.pi * h + sqrt(pow(2 * Double.pi * h, 2) + 8 * Double.pi * A)) / (4 * Double.pi)
        case "heron-area": let a = try req("a"), b = try req("b"), c = try req("c"), s = (a+b+c)/2; return sqrt(s*(s-a)*(s-b)*(s-c))
        case "permutation": var r = 1.0; for i in 0..<Int(round(try req("r"))) { r *= try req("n") - Double(i) }; return r
        case "combination": let n = Int(round(try req("n"))); var r = Int(round(try req("r"))); if r > n { throw NSError(domain: "NativeExercise", code: 3, userInfo: [NSLocalizedDescriptionKey: "r cannot exceed n."]) }; r = min(r, n-r); if r == 0 { return 1 }; var c = 1.0; for i in 1...r { c *= Double(n-r+i)/Double(i) }; return c
        case "kinematic-displacement": let u = try req("u"), a = try req("a"), s = try req("s"); return (-u + sqrt(u*u + 2*a*s))/a
        default: throw NSError(domain: "NativeExercise", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unsupported exercise formula: \(op.specKey)"])
        }
    }

    private static func parse() -> [String: NativeExerciseOperation] {
        guard let data = NativeEngineData.exerciseJSON.data(using: .utf8), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let specs = root["specs"] as? [[String: Any]] else { return [:] }
        var output: [String: NativeExerciseOperation] = [:]
        for spec in specs {
            guard let key = spec["key"] as? String, let name = spec["name"] as? String, let formula = spec["formula"] as? String, let labels = spec["labels"] as? [String: Any], let fieldsRaw = spec["fields"] as? [[String: Any]], let solves = spec["solves"] as? [String: Any] else { continue }
            let fields = fieldsRaw.compactMap { f -> NativeExerciseField? in guard let n = f["name"] as? String, let l = f["label"] as? String else { return nil }; return NativeExerciseField(name: n, label: l) }
            for (target, rawSolve) in solves {
                guard let solve = rawSolve as? [String: Any], let kind = solve["kind"] as? String else { continue }
                let id = "math-exercise-\(key)-\(target)"
                output[id] = NativeExerciseOperation(id: id, specKey: key, target: target, name: name, formula: formula, fields: fields.filter { $0.name != target }, label: labels[target] as? String ?? target, kind: kind, expression: solve["expression"] as? String)
            }
        }
        return output
    }

    private struct ExpressionParser {
        let source: [Character]
        let values: [String: Double]
        var index = 0
        init(source: String, values: [String: Double]) { self.source = Array(source); self.values = values }
        mutating func parse() throws -> Double { let value = try expression(); skip(); guard index == source.count else { throw error("Unsupported formula expression") }; return value }
        mutating private func expression() throws -> Double { var x = try term(); while true { skip(); if eat("+") { x += try term() } else if eat("-") { x -= try term() } else { return x } } }
        mutating private func term() throws -> Double { var x = try power(); while true { skip(); if eat("*") { x *= try power() } else if eat("/") { x /= try power() } else if eat("%") { x.formTruncatingRemainder(dividingBy: try power()) } else { return x } } }
        mutating private func power() throws -> Double { var x = try unary(); skip(); if match("**") { x = pow(x, try unary()) } else if eat("^") { x = pow(x, try unary()) }; return x }
        mutating private func unary() throws -> Double { skip(); if eat("+") { return try unary() }; if eat("-") { return -(try unary()) }; return try primary() }
        mutating private func primary() throws -> Double { skip(); if eat("(") { let x = try expression(); try expect(")"); return x }; if index < source.count && (source[index].isNumber || source[index] == ".") { return try number() }; let name = identifier(); guard !name.isEmpty else { throw error("Expected formula value") }; skip(); if eat("(") { var args:[Double] = []; skip(); if !eat(")") { repeat { args.append(try expression()) } while eat(","); try expect(")") }; return try function(name, args) }; if let v = values[name] { return v }; if name == "PI" { return Double.pi }; if name == "E" { return exp(1) }; throw error("Unknown formula variable: \(name)") }
        mutating private func number() throws -> Double { let start=index; while index<source.count && (source[index].isNumber || source[index]==".") { index += 1 }; if index<source.count && (source[index]=="e" || source[index]=="E") { index += 1; if index<source.count && (source[index]=="+" || source[index]=="-") { index += 1 }; while index<source.count && source[index].isNumber { index += 1 } }; guard let value = Double(String(source[start..<index])) else { throw error("Invalid number") }; return value }
        mutating private func identifier() -> String { skip(); let start=index; while index<source.count && (source[index].isLetter || source[index].isNumber || source[index]=="_" || source[index]=="$") { index += 1 }; return String(source[start..<index]) }
        mutating private func function(_ name:String,_ a:[Double]) throws -> Double { guard let first=a.first else { throw error("Function requires arguments") }; switch name { case "sqrt": return sqrt(first); case "cbrt": return cbrt(first); case "abs": return abs(first); case "acos": return acos(first); case "asin": return asin(first); case "cos": return cos(first); case "sin": return sin(first); case "exp": return exp(first); case "log": return log(first); case "round": return round(first); case "pow": guard a.count>1 else { throw error("pow() requires two arguments") }; return pow(a[0],a[1]); case "hypot": guard a.count>1 else { throw error("hypot() requires two arguments") }; return hypot(a[0],a[1]); case "min": return a.min() ?? first; case "max": return a.max() ?? first; default: throw error("Unsupported math function: \(name)") } }
        mutating private func skip() { while index<source.count && source[index].isWhitespace { index += 1 } }
        mutating private func eat(_ c:Character)->Bool { skip(); guard index<source.count && source[index]==c else{return false}; index += 1; return true }
        mutating private func match(_ s:String)->Bool { skip(); let chars=Array(s); guard source[index..<min(source.count,index+chars.count)].elementsEqual(chars) else{return false}; index += chars.count; return true }
        mutating private func expect(_ c:Character)throws { guard eat(c) else{throw error("Expected \(c)")} }
        func error(_ text:String)->NSError { NSError(domain:"NativeExpression",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    }
}
