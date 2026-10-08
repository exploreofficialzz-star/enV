import Foundation

/// Native port of the web BusinessEngine. Unsupported operations fail explicitly.
enum NativeBusinessEngine {
    private static let operations: Set<String> = ["roi","break-even","commission","pricing","markup","cash-flow","salary","customer-lifetime-value","customer-acquisition-cost","recurring-revenue","expense","inventory","discount","margin","profit","business-name","company-name","brand-name","product-name","slogan","sku","agenda","minutes","email-signature","invoice","receipt","quotation","estimate","purchase-order","payslip","meeting-agenda","meeting-minutes"]
    static func supports(_ tool: Tool) -> Bool { tool.engine.type == "business" && operations.contains(op(tool)) }
    private static func op(_ tool: Tool) -> String { tool.engine.op ?? tool.engine.id ?? tool.id }
    private static func n(_ o: [String:String], _ key: String, _ d: Double) -> Double { Double(o[key] ?? "") ?? d }
    private static func s(_ o: [String:String], _ key: String, _ d: String) -> String { let v = (o[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? d : v }
    private static func money(_ v: Double) -> String { String(format: "%.2f", v) }
    static func run(_ tool: Tool, options: [String:String]) throws -> String {
        let operation = op(tool), a=n(options,"a",1000), b=n(options,"b",600), c=n(options,"c",50), d=n(options,"d",10), e=n(options,"e",12)
        switch operation {
        case "roi": return "ROI\n\nROI: \(b == 0 ? "0.00" : String(format:"%.2f", (a-b)/b*100))%\nReturn: \(money(a-b))\n\nFormula: (Return − Investment) ÷ Investment × 100"
        case "break-even": let margin=a-c; return "Break-even\n\nBreak-even units: \(margin > 0 ? String(Int(ceil(b/margin))) : "—")\nBreak-even revenue: \(margin > 0 ? money(b/margin*a) : "—")"
        case "commission": return "Commission\n\nCommission: \(money(a*b/100))\nAfter commission: \(money(a-a*b/100))"
        case "pricing", "markup": return "Pricing\n\nSelling price: \(money(a*(1+b/100)))\nProfit: \(money(a*b/100))"
        case "cash-flow": return "Cash flow\n\nNet cash flow: \(money(a-b))\nEnding cash: \(money(c+a-b))"
        case "salary": return "Salary\n\nGross annual: \(money(a))\nMonthly: \(money(a/12))\nWeekly: \(money(a/52))\nHourly (40h): \(money(a/2080))"
        case "customer-lifetime-value": return "Customer lifetime value\n\nLTV: \(money(a*b*c))\nLTV:CAC: \(d == 0 ? "—" : String(format:"%.2f×", a*b*c/d))"
        case "customer-acquisition-cost": return "Customer acquisition cost\n\nCAC: \(b == 0 ? "—" : money(a/b))\nLTV:CAC: \(a == 0 ? "—" : String(format:"%.2f×", d/(b == 0 ? 1 : a/b)))"
        case "recurring-revenue": return "Recurring revenue\n\nMRR: \(money(a))\nARR: \(money(a*12))\nAnnual growth: \(String(format:"%.2f", b))%"
        case "expense": return "Expense\n\nTotal expense: \(money(a+b+c+d+e))\nAverage: \(money((a+b+c+d+e)/5))"
        case "inventory": return "Inventory\n\nInventory value: \(money(a*b))\nReorder quantity: \(money(c))"
        case "discount": return "Discount\n\nDiscount: \(money(a*b/100))\nFinal price: \(money(a-a*b/100))"
        case "margin", "profit": return "Profit / margin\n\nProfit: \(money(a-b))\nMargin: \(a == 0 ? "0.00" : String(format:"%.2f", (a-b)/a*100))%"
        case "business-name", "company-name", "brand-name": let x=s(options,"seed","technology"); return ["\(x) Labs","Nova \(x)","\(x) Works","Bright \(x)","\(x) Studio"].joined(separator:"\n")
        case "product-name": let x=s(options,"seed","technology"); return ["\(x) Pro","Nova \(x)","\(x) Flow","\(x) Plus"].joined(separator:"\n")
        case "slogan": let x=s(options,"seed","technology"), a=s(options,"audience","customers"); return ["\(x): Built for \(a).","Make \(x) simpler.","Better \(x), without the busywork."].joined(separator:"\n")
        case "sku": return (1...8).map { "\(String(s(options,"seed","SKU").prefix(3)).uppercased().padding(toLength:3,withPad:"X",startingAt:0))-\(String(format:"%03d",$0))" }.joined(separator:"\n")
        case "agenda", "meeting-agenda": return ["1. Welcome & objectives","2. \(s(options,"meetingGoal","Weekly planning"))","3. Progress updates","4. Decisions & blockers","5. Owners and next steps","6. Recap & close"].joined(separator:"\n")
        case "minutes", "meeting-minutes": return "Meeting: \(s(options,"meetingGoal","Weekly planning"))\nAttendees: \(s(options,"attendees","Team"))\n\nDecisions:\n- \n\nAction items:\n- Owner — Task — Due date\n\nNext meeting:"
        case "email-signature": return "\(s(options,"name","Alex Morgan")) | \(s(options,"role","Founder"))\n\(s(options,"email","hello@example.com"))\n\(s(options,"company","Your Business"))\nPhone: __________________\nWebsite: __________________"
        default: throw NativeSimpleError.message("Unsupported business operation: \(operation)")
        }
    }
}
