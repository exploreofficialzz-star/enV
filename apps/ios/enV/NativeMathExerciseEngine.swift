import Foundation

struct NativeExerciseField { let name: String; let label: String }
struct NativeExerciseOutput { let label: String; let value: String; let hint: String?; let primary: Bool }
struct NativeExerciseOperation {
    let id: String; let specKey: String; let target: String; let name: String; let formula: String
    let fields: [NativeExerciseField]; let label: String; let kind: String; let expression: String?
    let allTargets: Set<String>; let hasCheck: Bool
}

enum NativeMathExerciseEngine {
    private static let operations = parse()
    static func operation(for toolID: String) -> NativeExerciseOperation? { operations[toolID] }
    static var supportedToolIDs: Set<String> { Set(operations.keys) }

    static func run(_ op: NativeExerciseOperation, values: [String: String]) throws -> [NativeExerciseOutput] {
        try validateDomain(op, values)
        if op.allTargets.contains(op.target) { return try runAll(op, values) }
        let result = try scalar(op, values)
        guard result.isFinite else { throw error("The formula produced an undefined result.") }
        return [NativeExerciseOutput(label: op.label, value: NativeNumberParser.format(result), hint: nil, primary: true)]
    }

    private static func scalar(_ op: NativeExerciseOperation, _ values: [String: String]) throws -> Double {
        if op.specKey == "compound-growth" && op.target == "n" { return try compoundingPeriods(try req(values, "A"), try req(values, "P"), try req(values, "r"), try req(values, "t")) }
        if op.kind == "expression" { var parser = ExpressionParser(source: op.expression ?? "", values: values); return try parser.parse() }
        return try complex(op, values)
    }

    private static func runAll(_ op: NativeExerciseOperation, _ v: [String: String]) throws -> [NativeExerciseOutput] {
        switch op.specKey {
        case "compound-growth":
            let periods = try compoundingPeriods(try req(v, "A"), try req(v, "P"), try req(v, "r"), try req(v, "t"))
            var out = [NativeExerciseOutput(label: "Periods/year", value: NativeNumberParser.format(periods), hint: "real-valued solution, found numerically", primary: true)]
            let whole = max(1, Int(periods.rounded()))
            if abs(periods - Double(whole)) > 1e-6 { let p = try req(v, "P"), r = try req(v, "r"), t = try req(v, "t"); out.append(NativeExerciseOutput(label: "Nearest whole number of periods/year", value: String(whole), hint: nil, primary: false)); out.append(NativeExerciseOutput(label: "Final amount with that whole number", value: NativeNumberParser.format(p * pow(1 + r / Double(whole), Double(whole) * t)), hint: "for comparison", primary: false)) }
            return out
        case "quadratic-root": return try quadraticOutputs(v)
        case "law-of-sines": return try lawOfSinesOutputs(op.target, v)
        case "law-of-cosines": return try lawOfCosinesOutputs(op.target, v)
        case "percent-error": return try percentErrorOutputs(op.target, v)
        case "vector-magnitude":
            let mag = try req(v, "mag")
            let other = try req(v, op.target == "x" ? "y" : "x")
            let radicand = mag * mag - other * other
            return try signedRootOutputs(op.target == "x" ? "x component" : "y component", radicand)
        case "kinematic-final-velocity":
            let a = try req(v, "a")
            let s = try req(v, "s")
            let radicand: Double
            if op.target == "v" {
                let u = try req(v, "u")
                radicand = u * u + 2 * a * s
            } else {
                let vel = try req(v, "v")
                radicand = vel * vel - 2 * a * s
            }
            return try signedRootOutputs(op.target == "v" ? "Final velocity" : "Initial velocity", radicand)
        default:
            return [NativeExerciseOutput(label: op.label, value: NativeNumberParser.format(try scalar(op, v)), hint: nil, primary: true)]
        }
    }

    private static func quadraticOutputs(_ v: [String: String]) throws -> [NativeExerciseOutput] {
        let a = try req(v, "a"), b = try req(v, "b"), c = try req(v, "c")
        guard a != 0 else { throw error("Coefficient a must not be 0: with a = 0 the equation is linear, not quadratic.") }
        let d = b*b - 4*a*c
        if d < 0 { let re = -b/(2*a), im = sqrt(-d)/(2*abs(a)); return [NativeExerciseOutput(label: "Root x₁", value: "\(fmt(re)) + \(fmt(im))i", hint: "complex roots — no real solution (discriminant b² − 4ac = \(fmt(d)))", primary: true), NativeExerciseOutput(label: "Root x₂", value: "\(fmt(re)) − \(fmt(im))i", hint: "complex conjugate", primary: false)] }
        let root = sqrt(d)
        if d == 0 { return [NativeExerciseOutput(label: "Root x (double root)", value: fmt(-b/(2*a)), hint: "discriminant b² − 4ac = 0", primary: true)] }
        let q = -(b + (b < 0 ? -root : root))/2
        if q == 0 { return [NativeExerciseOutput(label: "Root x", value: "0", hint: nil, primary: true)] }
        let plus = b < 0 ? q/a : c/q, minus = b < 0 ? c/q : q/a
        return [NativeExerciseOutput(label: "Root x₁", value: fmt(plus), hint: "(−b + √D) / 2a · discriminant b² − 4ac = \(fmt(d))", primary: true), NativeExerciseOutput(label: "Root x₂", value: fmt(minus), hint: "(−b − √D) / 2a", primary: false)]
    }

    private static func lawOfSinesOutputs(_ target: String, _ v: [String: String]) throws -> [NativeExerciseOutput] {
        let opposite = target == "A" ? "a" : "b", side = target == "A" ? "b" : "a", knownAngle = target == "A" ? "B" : "A"
        let sine = try req(v, opposite) * sin((try req(v, knownAngle))*Double.pi/180) / (try req(v, side))
        guard sine <= 1 + 1e-12 else { throw error("No triangle exists: sin \(target) would be \(fmt(sine)), which is greater than 1.") }
        let known = try req(v, knownAngle), acute = asin(min(1, sine))*180/Double.pi
        let angles = [acute, 180-acute].filter { $0 > 0 && $0 + known < 180 - 1e-9 }.deduplicated()
        guard !angles.isEmpty else { throw error("No triangle exists: angle \(target) plus angle \(knownAngle) would be 180° or more.") }
        return angles.enumerated().map { i,x in NativeExerciseOutput(label: "Angle \(target)\(angles.count > 1 ? " (\(i == 0 ? "acute" : "obtuse"))" : "")", value: fmt(x), hint: angles.count > 1 ? "degrees · two triangles fit (side-side-angle case)" : "degrees", primary: i == 0) }
    }

    private static func lawOfCosinesOutputs(_ target: String, _ v: [String: String]) throws -> [NativeExerciseOutput] {
        if target == "C" { let a=try positiveSide(v,"a"), b=try positiveSide(v,"b"), c=try positiveSide(v,"c"); let cosine=(a*a+b*b-c*c)/(2*a*b); guard (-1...1).contains(cosine) else { throw error("These sides cannot form a triangle: \(fmt(a)), \(fmt(b)) and \(fmt(c)) break the triangle inequality.") }; return [NativeExerciseOutput(label:"Angle C",value:fmt(acos(cosine)*180/Double.pi),hint:"degrees",primary:true)] }
        let known = try positiveSide(v, target == "a" ? "b" : "a"), c = try positiveSide(v,"c"), angle = try req(v,"C")*Double.pi/180
        let h = known*sin(angle), d = c*c-h*h; guard d >= 0 else { throw error("No triangle exists with these measurements.") }
        let base = known*cos(angle), sides = [base+sqrt(d),base-sqrt(d)].filter{$0>0}.deduplicated(); guard !sides.isEmpty else { throw error("No triangle exists with these measurements.") }
        return sides.enumerated().map { i,x in NativeExerciseOutput(label:"Side \(target)\(sides.count>1 ? " (solution \(i+1))" : "")",value:fmt(x),hint:sides.count>1 ? "two triangles fit these measurements (side-side-angle case)" : nil,primary:i==0) }
    }

    private static func percentErrorOutputs(_ target: String, _ v: [String: String]) throws -> [NativeExerciseOutput] {
        let e=try req(v,"error"); guard e >= 0 else { throw error("Percent error must be 0 or greater: it is an absolute value.") }
        if target == "experimental" { let accepted=try req(v,"accepted"); guard accepted != 0 else { throw error("Accepted value must not be 0: percent error divides by it.") }; let xs=[accepted*(1+e/100),accepted*(1-e/100)].deduplicated(); return xs.enumerated().map { i,x in NativeExerciseOutput(label:"Experimental (\(x > accepted ? "above" : "below") accepted)",value:fmt(x),hint:nil,primary:i==0) } }
        let experimental=try req(v,"experimental"); let candidates=[experimental/(1+e/100), e==100 ? Double.nan : experimental/(1-e/100)].filter{$0.isFinite && $0 != 0}.filter{abs(abs(experimental-$0)/abs($0)*100-e) <= 1e-8*max(1,abs(e))}.deduplicated(); guard !candidates.isEmpty else { throw error("No accepted value gives that percent error for this experimental value.") }; return candidates.enumerated().map { i,x in NativeExerciseOutput(label:candidates.count>1 ? "Accepted (solution \(i+1))" : "Accepted",value:fmt(x),hint:nil,primary:i==0) }
    }

    private static func signedRootOutputs(_ label: String, _ radicand: Double) throws -> [NativeExerciseOutput] { guard radicand >= 0 else { throw error("No real \(label.lowercased()) exists: the square-root radicand is \(fmt(radicand)) and is negative.") }; let root=sqrt(radicand); if root == 0 { return [NativeExerciseOutput(label:label,value:"0",hint:nil,primary:true)] }; return [NativeExerciseOutput(label:"\(label) (+)",value:fmt(root),hint:"positive direction",primary:true),NativeExerciseOutput(label:"\(label) (−)",value:fmt(-root),hint:"negative direction",primary:false)] }

    private static func validateDomain(_ op: NativeExerciseOperation, _ v: [String:String]) throws {
        guard op.hasCheck else { return }
        switch op.specKey {
        case "pythagorean": if op.target != "c" { let other=op.target == "a" ? "b" : "a"; guard try req(v,"c") > req(v,other) else { throw error("The hypotenuse must be longer than leg \(other).") } }
        case "snell":
            for name in ["n1","n2"] where name != op.target { guard try req(v,name) > 0 else { throw error("Refractive indices must be greater than 0.") } }
            for name in ["theta1","theta2"] where name != op.target { let a=try req(v,name); guard (0...90).contains(a) else { throw error("Angles are measured from the normal and must be between 0° and 90°.") } }
            if op.target == "theta1" || op.target == "theta2" {
                let s: Double
                if op.target == "theta1" {
                    let n2 = try req(v, "n2"), theta2 = try req(v, "theta2"), n1 = try req(v, "n1")
                    s = n2 * sin(theta2 * Double.pi / 180) / n1
                } else {
                    let n1 = try req(v, "n1"), theta1 = try req(v, "theta1"), n2 = try req(v, "n2")
                    s = n1 * sin(theta1 * Double.pi / 180) / n2
                }
                guard s <= 1 else { throw error("Total internal reflection: sin θ would be \(fmt(s)) (greater than 1), so no refracted ray exists.") }
            }
        case "law-of-sines": for name in ["A","B"] where name != op.target { let a=try req(v,name); guard a > 0 && a < 180 else { throw error("Angle \(name) must be greater than 0° and less than 180°.") } }
        case "law-of-cosines": if op.target != "C" { let a=try req(v,"C"); guard a > 0 && a < 180 else { throw error("Angle C must be greater than 0° and less than 180°.") } }
        case "scientific-notation":
            if op.target == "e" {
                let x = try req(v, "x"), m = try req(v, "m")
                guard x / m > 0 else { throw error("Number and mantissa must be non-zero and have the same sign to solve for the exponent.") }
            }
        case "log-product":
            let base = try req(v, "a")
            let x = try req(v, "x"), y = try req(v, "y")
            guard base > 0 && base != 1 else { throw error("Base must be greater than 0 and not equal to 1.") }
            guard x > 0 && y > 0 else { throw error("x and y must both be greater than 0 for a real logarithm.") }
        default: break
        }
    }

    private static func complex(_ op: NativeExerciseOperation, _ v: [String:String]) throws -> Double {
        func req(_ k:String)throws->Double { try self.req(v,k) }
        switch op.specKey {
        case "geometric-sum": let r=try req("r"), a=try req("a"), n=try req("n"); return abs(r-1)<1e-12 ? a*n : a*(pow(r,n)-1)/(r-1)
        case "binomial-probability": let n=Int(round(try req("n"))), k=Int(round(try req("k"))), p=try req("p"); var c=1.0; if k>0 { for i in 1...k { c *= Double(n-k+i)/Double(i) } }; return c*pow(p,Double(k))*pow(1-p,Double(n-k))
        case "cylinder-surface-area": let h=try req("h"), a=try req("A"); return (-2*Double.pi*h+sqrt(pow(2*Double.pi*h,2)+8*Double.pi*a))/(4*Double.pi)
        case "heron-area": let a=try req("a"),b=try req("b"),c=try req("c"),s=(a+b+c)/2; return sqrt(s*(s-a)*(s-b)*(s-c))
        case "permutation": var r=1.0; for i in 0..<Int(round(try req("r"))) { r *= try req("n")-Double(i) }; return r
        case "combination": let n=Int(round(try req("n"))); var r=Int(round(try req("r"))); if r>n { throw error("r cannot exceed n.") }; r=min(r,n-r); if r==0 { return 1 }; var c=1.0; for i in 1...r { c *= Double(n-r+i)/Double(i) }; return c
        case "kinematic-displacement": let u=try req("u"),a=try req("a"),s=try req("s"); return (-u+sqrt(u*u+2*a*s))/a
        default: throw error("Unsupported exercise formula: \(op.specKey)")
        }
    }

    private static func compoundingPeriods(_ A:Double,_ P:Double,_ r:Double,_ t:Double)throws->Double { guard A>0 && P>0 else { throw error("Final amount and initial amount must both be greater than 0.") }; guard t>0 else { throw error("Years must be greater than 0.") }; guard r != 0 else { throw error("With a rate of 0 the amount never changes, so the compounding frequency cannot be determined.") }; let target=log(A/P)/t, limit=r, attainable=r>0 ? target>0 && target<limit : target<limit; guard attainable else { throw error("No compounding frequency gives that result for the supplied rate and amounts.") }; func h(_ n:Double)->Double{ n*log(1+r/n) }; var lo=r>0 ? 1e-9 : -r*(1+1e-12), hi=1e12; guard h(hi)>=target else { throw error("The frequency exceeds 10¹² periods per year.") }; for _ in 0..<300 { let mid=sqrt(lo*hi); if h(mid)<target { lo=mid } else { hi=mid } }; return sqrt(lo*hi) }

    private static func req(_ v:[String:String],_ k:String)throws->Double { try NativeNumberParser.parse(v[k],label:k) }
    private static func positiveSide(_ v:[String:String],_ k:String)throws->Double { let x=try req(v,k); guard x>0 else { throw error("Side \(k) must be greater than 0.") }; return x }
    private static func fmt(_ x:Double)->String { NativeNumberParser.format(x) }
    private static func error(_ text:String)->NSError { NSError(domain:"NativeExercise",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }

    private static func parse() -> [String: NativeExerciseOperation] {
        guard let data = NativeEngineData.exerciseJSON.data(using: .utf8), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let specs = root["specs"] as? [[String: Any]] else { return [:] }
        var output: [String: NativeExerciseOperation] = [:]
        for spec in specs {
            guard let key = spec["key"] as? String, let name = spec["name"] as? String, let formula = spec["formula"] as? String, let labels = spec["labels"] as? [String: Any], let fieldsRaw = spec["fields"] as? [[String: Any]], let solves = spec["solves"] as? [String: Any] else { continue }
            let allTargets = Set(spec["allTargets"] as? [String] ?? []), hasCheck = spec["hasCheck"] as? Bool ?? false
            let fields = fieldsRaw.compactMap { f -> NativeExerciseField? in guard let n=f["name"] as? String, let l=f["label"] as? String else { return nil }; return NativeExerciseField(name:n,label:l) }
            for (target, rawSolve) in solves { guard let solve=rawSolve as? [String:Any], let kind=solve["kind"] as? String else { continue }; let id="math-exercise-\(key)-\(target)"; output[id]=NativeExerciseOperation(id:id,specKey:key,target:target,name:name,formula:formula,fields:fields.filter{$0.name != target},label:labels[target] as? String ?? target,kind:kind,expression:solve["expression"] as? String,allTargets:allTargets,hasCheck:hasCheck) }
        }
        return output
    }

    private struct ExpressionParser {
        let source:[Character]; let values:[String:String]; var index=0
        init(source:String,values:[String:String]){self.source=Array(source);self.values=values}
        mutating func parse()throws->Double{let value=try expression();skip();guard index==source.count else{throw error("Unsupported formula expression")};return value}
        mutating private func expression()throws->Double{var x=try term();while true{skip();if eat("+"){x+=try term()}else if eat("-"){x-=try term()}else{return x}}}
        mutating private func term()throws->Double{var x=try power();while true{skip();if eat("*"){x*=try power()}else if eat("/"){x/=try power()}else if eat("%"){x.formTruncatingRemainder(dividingBy:try power())}else{return x}}}
        mutating private func power()throws->Double{var x=try unary();skip();if match("**"){x=pow(x,try unary())}else if eat("^"){x=pow(x,try unary())};return x}
        mutating private func unary()throws->Double{skip();if eat("+"){return try unary()};if eat("-"){return -(try unary())};return try primary()}
        mutating private func primary()throws->Double{skip();if eat("("){let x=try expression();try expect(")");return x};if index<source.count && (source[index].isNumber || source[index]=="."){return try number()};let name=identifier();guard !name.isEmpty else{throw error("Expected formula value")};skip();if eat("("){var args:[Double]=[];skip();if !eat(")"){repeat{args.append(try expression())}while eat(",");try expect(")")};return try function(name,args)};return try NativeNumberParser.parse(values[name],label:name)}
        mutating private func number()throws->Double{let start=index;while index<source.count && (source[index].isNumber || source[index]=="."){index += 1};if index<source.count && (source[index]=="e" || source[index]=="E"){index += 1;if index<source.count && (source[index]=="+" || source[index]=="-"){index += 1};while index<source.count && source[index].isNumber{index += 1}};guard let value=Double(String(source[start..<index])) else{throw error("Invalid number")};return value}
        mutating private func identifier()->String{skip();let start=index;while index<source.count && (source[index].isLetter || source[index].isNumber || source[index]=="_" || source[index]=="$"){index += 1};return String(source[start..<index])}
        mutating private func function(_ name:String,_ a:[Double])throws->Double{guard let first=a.first else{throw error("Function requires arguments")};switch name{case "sqrt":return sqrt(first);case "cbrt":return cbrt(first);case "abs":return abs(first);case "acos":return acos(first);case "asin":return asin(first);case "cos":return cos(first);case "sin":return sin(first);case "exp":return exp(first);case "log":return log(first);case "log10":return log10(first);case "round":return round(first);case "pow":guard a.count>1 else{throw error("pow() requires two arguments")};return pow(a[0],a[1]);case "hypot":guard a.count>1 else{throw error("hypot() requires two arguments")};return hypot(a[0],a[1]);case "min":return a.min() ?? first;case "max":return a.max() ?? first;default:throw error("Unsupported math function: \(name)")}}
        mutating private func skip(){while index<source.count && source[index].isWhitespace{index += 1}}
        mutating private func eat(_ c:Character)->Bool{skip();guard index<source.count && source[index]==c else{return false};index += 1;return true}
        mutating private func match(_ s:String)->Bool{skip();let chars=Array(s);guard index+chars.count <= source.count, Array(source[index..<index+chars.count]) == chars else{return false};index += chars.count;return true}
        mutating private func expect(_ c:Character)throws{guard eat(c) else{throw error("Expected \(c)")}}
        func error(_ text:String)->NSError{NSError(domain:"NativeExpression",code:1,userInfo:[NSLocalizedDescriptionKey:text])}
    }
}

private extension Array where Element == Double {
    func deduplicated() -> [Double] {
        reduce(into: []) { result, value in if !result.contains(where: { abs($0 - value) <= 1e-9 * Swift.max(1, Swift.max(abs($0), abs(value))) }) { result.append(value) } }
    }
}
