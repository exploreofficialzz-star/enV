import Foundation

/// Native port of the web BusinessEngine. Unsupported operations fail explicitly.
enum NativeBusinessEngine {
    private static let operations: Set<String> = ["roi","break-even","commission","pricing","markup","cash-flow","salary","customer-lifetime-value","customer-acquisition-cost","recurring-revenue","expense","inventory","discount","margin","profit","business-name","company-name","brand-name","product-name","slogan","sku","agenda","minutes","email-signature","invoice","receipt","quotation","estimate","purchase-order","payslip","meeting-agenda","meeting-minutes"]
    static func supports(_ tool: Tool) -> Bool { tool.engine.type == "business" && operations.contains(op(tool)) }
    private static func op(_ tool: Tool) -> String { tool.engine.op ?? tool.engine.id ?? tool.id }
    private static func n(_ o: [String:String], _ key: String, _ d: Double) -> Double { Double(o[key] ?? "") ?? d }
    private static func s(_ o: [String:String], _ key: String, _ d: String) -> String { let v = (o[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? d : v }
    private static func money(_ v: Double) -> String { String(format: "%.2f", v) }
    private static func htmlEscape(_ value: String) -> String { value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&#39;") }
    static func run(_ tool: Tool, options: [String:String]) throws -> String {
        let operation = op(tool), a=n(options,"a",1000), b=n(options,"b",600), c=n(options,"c",50), d=n(options,"d",10), e=n(options,"e",12)
        switch operation {
        case "roi": return "ROI\n\nROI: \(b == 0 ? "0.00" : String(format:"%.2f", (a-b)/b*100))%\nReturn: \(money(a-b))\n\nFormula: (Return − Investment) ÷ Investment × 100"
        case "break-even": let margin=a-c; let fixed=max(0,b); let target=max(0,Double(options["targetProfit"] ?? "0") ?? 0); let possible=a>c && a>0 && c>=0; let units=possible ? ceil((fixed+target)/margin) : 0; let breakEvenUnits=possible ? ceil(fixed/margin) : 0; return "Break-even\n\nFixed costs: \(money(fixed))\nSelling price per unit: \(money(a))\nVariable cost per unit: \(money(c))\nContribution margin per unit: \(possible ? money(margin) : "—")\nContribution margin ratio: \(possible ? String(format:"%.2f%%", margin/a*100) : "—")\nBreak-even units: \(possible ? String(Int(breakEvenUnits)) : "Not possible: selling price must exceed non-negative variable cost")\nBreak-even revenue: \(possible ? money(breakEvenUnits*a) : "—")\nUnits for target profit (\(money(target))): \(possible ? String(Int(units)) : "—")\n\nFormula: Fixed costs ÷ (Selling price per unit − Variable cost per unit); target units = (fixed costs + target profit) ÷ contribution margin. Single-product estimate; units rounded up."
        case "commission": return "Commission\n\nCommission: \(money(a*b/100))\nAfter commission: \(money(a-a*b/100))"
        case "pricing", "markup": return "Pricing\n\nSelling price: \(money(a*(1+b/100)))\nProfit: \(money(a*b/100))"
        case "cash-flow": return "Cash flow\n\nNet cash flow: \(money(a-b))\nEnding cash: \(money(c+a-b))"
        case "salary": return "Salary\n\nGross annual: \(money(a))\nMonthly: \(money(a/12))\nWeekly: \(money(a/52))\nHourly (40h): \(money(a/2080))"
        case "customer-lifetime-value":
            let ltv = a*b*c
            let cac = Double(options["cac"] ?? options["d"] ?? "0") ?? 0
            let ratio = cac > 0 ? ltv/cac : 0
            let monthlyContribution = max(0, Double(options["monthlyContribution"] ?? "0") ?? 0)
            let payback = cac > 0 && monthlyContribution > 0 ? cac/monthlyContribution : 0
            let band: String = cac <= 0 ? "Add CAC to assess acquisition efficiency" : ratio < 1 ? "Below 1×: value does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; improve unit economics" : ratio < 5 ? "3–5×: commonly considered healthy" : ">5×: strong; validate assumptions"
            return "Customer lifetime value\n\nLTV: \(money(ltv))\nLTV:CAC: \(cac > 0 ? String(format:"%.2f×", ratio) : "—")\nHealth: \(band)\nCAC payback: \(payback > 0 ? String(format:"%.1f months", payback) : "—")\n\nMethod: Average order value × purchases per period × lifespan. Payback = CAC ÷ monthly contribution; align periods and use contribution rather than revenue."
        case "customer-acquisition-cost":
            let cac = a > 0 && b > 0 ? a / b : 0
            let ltv = Double(options["ltv"] ?? options["d"] ?? "0") ?? 0
            let ratio = cac > 0 && ltv > 0 ? ltv / cac : 0
            let monthlyContribution = max(0, Double(options["monthlyContribution"] ?? "0") ?? 0)
            let payback = cac > 0 && monthlyContribution > 0 ? cac / monthlyContribution : 0
            let health: String = cac <= 0 || ltv <= 0 ? "Add valid positive LTV and CAC inputs" : ratio < 1 ? "Below 1×: LTV does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; review acquisition efficiency" : ratio < 5 ? "3–5×: commonly used as a healthy planning band" : ">5×: strong ratio; validate growth and retention assumptions"
            return "Customer acquisition cost\n\nCAC: \(cac > 0 ? money(cac) : "—")\nLTV:CAC: \(ratio > 0 ? String(format:"%.2f×", ratio) : "—")\nHealth: \(health)\nCAC payback: \(payback > 0 ? String(format:"%.1f months", payback) : "—")\n\nFormula: acquisition spend ÷ new customers; LTV:CAC = LTV ÷ CAC; payback months = CAC ÷ monthly contribution per new customer. Bands are directional heuristics, not universal benchmarks."
        case "recurring-revenue": return "Recurring revenue\n\nMRR: \(money(a))\nARR: \(money(a*12))\nAnnual growth: \(String(format:"%.2f", b))%"
        case "expense": return "Expense\n\nTotal expense: \(money(a+b+c+d+e))\nAverage: \(money((a+b+c+d+e)/5))"
        case "inventory": return "Inventory\n\nInventory value: \(money(a*b))\nReorder quantity: \(money(c))"
        case "discount": return "Discount\n\nDiscount: \(money(a*b/100))\nFinal price: \(money(a-a*b/100))"
        case "margin", "profit": return "Profit / margin\n\nProfit: \(money(a-b))\nMargin: \(a == 0 ? "0.00" : String(format:"%.2f", (a-b)/a*100))%"
        case "business-name", "company-name", "brand-name": let x=s(options,"seed","technology"); return ["\(x) Labs","Nova \(x)","\(x) Works","Bright \(x)","\(x) Studio"].joined(separator:"\n")
        case "product-name": let x=s(options,"seed","technology"); return ["\(x) Pro","Nova \(x)","\(x) Flow","\(x) Plus"].joined(separator:"\n")
        case "slogan": let x=s(options,"seed","technology"), a=s(options,"audience","customers"); return ["\(x): Built for \(a).","Make \(x) simpler.","Better \(x), without the busywork."].joined(separator:"\n")
        case "sku": return (1...8).map { "\(String(s(options,"seed","SKU").prefix(3)).uppercased().padding(toLength:3,withPad:"X",startingAt:0))-\(String(format:"%03d",$0))" }.joined(separator:"\n")
        case "agenda", "meeting-agenda": return ["MEETING AGENDA", "Title: \(s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning")))", "Date/time: \(s(options,"dateTime","Add date and time"))", "Location/link: \(s(options,"location","Add location or meeting link"))", "Goal: \(s(options,"meetingGoal","Weekly planning"))", "Attendees: \(s(options,"attendees","Team"))", "", "1. Welcome & objectives (5 min)", "2. \(s(options,"meetingGoal","Weekly planning")) (15 min)", "3. Progress updates (10 min)", "4. Decisions & blockers (10 min)", "5. Owners and next steps (5 min)", "Prep notes: \(s(options,"prepNotes","None added"))"].joined(separator:"\n")
        case "minutes", "meeting-minutes": return "MEETING MINUTES\nTitle: \(s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning")))\nDate/time: \(s(options,"dateTime","Not set"))\nLocation/link: \(s(options,"location","Not set"))\nAttendees: \(s(options,"attendees","Team"))\n\nDiscussion notes:\n\(s(options,"discussionNotes","- Add notes by agenda item"))\n\nDecisions:\n\(s(options,"decisions","- Record decision and rationale"))\n\nAction items (owner | task | due):\n\(s(options,"actionItems","- Owner: — | Task: — | Due: —"))\n\nNext meeting: \(s(options,"nextMeeting","Not scheduled"))"
        case "invoice", "receipt", "quotation", "estimate", "purchase-order":
            let label = operation.replacingOccurrences(of: "-", with: " ").capitalized
            let company = s(options,"company","Your Business"), client = s(options,"client","Client"), currency = s(options,"currency","USD")
            let fallbackQuantity = max(0,n(options,"quantity",1)), fallbackPrice = max(0,n(options,"unitPrice",a/10))
            // Optional rows use: Description | quantity | unit price. Invalid rows are ignored.
            let parsedItems: [(String, Double, Double)] = (options["lineItems"] ?? "").components(separatedBy:.newlines).compactMap { row in
                let parts = row.components(separatedBy:"|")
                guard parts.count >= 3, !parts[0].trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      let quantity = Double(parts[1].trimmingCharacters(in:.whitespacesAndNewlines)), quantity.isFinite, quantity >= 0,
                      let price = Double(parts[2].trimmingCharacters(in:.whitespacesAndNewlines)), price.isFinite, price >= 0 else { return nil }
                return (parts[0].trimmingCharacters(in:.whitespacesAndNewlines), quantity, price)
            }
            let items = parsedItems.isEmpty ? [(s(options,"description","Professional service"), fallbackQuantity, fallbackPrice)] : parsedItems
            let subtotal = items.reduce(0) { $0 + $1.1 * $1.2 }
            let discount = subtotal*min(100,max(0,n(options,"discountPercent",0)))/100, taxable = subtotal-discount
            let taxAmount = taxable*max(0,n(options,"taxPercent",0))/100
            let itemLines = items.map { "\($0.0) | Qty \(money($0.1)) | \(currency) \(money($0.2)) | Line total \(currency) \(money($0.1*$0.2))" }.joined(separator:"\n")
            return "\(label) — generated locally\nBusiness: \(company)\nClient: \(client)\nDocument: \(s(options,"documentNumber","DOC-001"))\nDate: \(s(options,"date","Today"))\n\nLine items:\n\(itemLines)\nSubtotal: \(currency) \(money(subtotal))\nDiscount: -\(currency) \(money(discount))\nTax: \(currency) \(money(taxAmount))\nTOTAL: \(currency) \(money(taxable+taxAmount))\n\nClient data remains on this device unless you explicitly export or share it."
        case "payslip": let gross=max(0,n(options,"gross",a)), statutory=max(0,n(options,"statutoryDeductions",b)), other=max(0,n(options,"otherDeductions",c)); return "PAYSLIP — DEMO ONLY\nEmployer: \(s(options,"company","Your Business"))\nEmployee: \(s(options,"employeeName","Employee name"))\nPay period: \(s(options,"payPeriod","Pay period"))\n\nGross pay: \(money(gross))\nTax / statutory deductions: -\(money(statutory))\nOther deductions: -\(money(other))\nNet pay: \(money(gross-statutory-other))\n\nIllustrative layout only; verify local payroll and statutory requirements."
        case "email-signature":
            let name = s(options, "name", "Alex Morgan")
            let role = s(options, "role", "Founder")
            let email = s(options, "email", "hello@example.com")
            let company = s(options, "company", "Your Business")
            let phone = s(options, "phone", "")
            let website = s(options, "website", "")
            let safeWebsite = (website.lowercased().hasPrefix("https://") || website.lowercased().hasPrefix("http://")) ? website : ""
            let phoneHtml = phone.isEmpty ? "" : "<br>" + htmlEscape(phone)
            let websiteHtml = website.isEmpty ? "" : (safeWebsite.isEmpty ? "<br>" + htmlEscape(website) : "<br><a href=\"" + htmlEscape(safeWebsite) + "\">" + htmlEscape(website) + "</a>")
            let html = "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"font-family:Arial,sans-serif;font-size:13px;color:#222\"><tr><td style=\"padding-right:12px\"><strong>" + htmlEscape(name) + "</strong><br>" + htmlEscape(role) + "<br>" + htmlEscape(company) + "</td><td style=\"border-left:2px solid #888;padding-left:12px\">" + htmlEscape(email) + phoneHtml + websiteHtml + "</td></tr></table>"
            let phoneText = phone.isEmpty ? "" : "Phone: \(phone)\n"
            let websiteText = website.isEmpty ? "" : "Website: \(website)\n"
            return "\(name) | \(role)\n\(email)\n\(company)\n\(phoneText)\(websiteText)\nHTML signature (inline styles; no remote images):\n\(html)\n\nHTML output is a starting point. Verify formatting in your target email clients; clients may sanitize pasted HTML."
        default: throw NSError(domain: "enV.NativeBusinessEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported business operation: \(operation)"])
        }
    }
}
