import Foundation

/// Native port of the web BusinessEngine. Unsupported operations fail explicitly.
enum NativeBusinessEngine {
    private static let operations: Set<String> = ["roi","break-even","commission","pricing","markup","cash-flow","salary","customer-lifetime-value","customer-acquisition-cost","recurring-revenue","expense","inventory","discount","margin","profit","business-name","company-name","brand-name","product-name","slogan","sku","agenda","minutes","email-signature","invoice","receipt","quotation","estimate","purchase-order","payslip","meeting-agenda","meeting-minutes"]
    static func supports(_ tool: Tool) -> Bool { tool.engine.type == "business" && operations.contains(op(tool)) }
    private static func op(_ tool: Tool) -> String { tool.engine.op ?? tool.engine.id ?? tool.id }
    private static func n(_ o: [String:String], _ key: String, _ d: Double) -> Double {
        guard let parsed = Double(o[key] ?? ""), parsed.isFinite else { return d }
        return parsed
    }
    private static func s(_ o: [String:String], _ key: String, _ d: String) -> String { let v = (o[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines); return v.isEmpty ? d : v }
    private static func money(_ v: Double) -> String { String(format: "%.2f", v) }
    private static func htmlEscape(_ value: String) -> String { value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&#39;") }
    private static let nameAdjectives = ["Bright", "Atlas", "Clear", "True", "Ember", "Swift", "Green", "Blue", "Noble", "Open", "Bold", "Keen", "Lumen", "Kind", "Prime", "Ever", "Urban", "Golden", "Silver", "Calm", "Rapid", "Mosaic", "Able", "Fresh"]
    private static let nameNouns = ["Works", "Forge", "Harbor", "Grove", "Arc", "Peak", "Grid", "Foundry", "Craft", "Field", "Beacon", "Nest", "Rise", "Trail", "Root", "Pulse", "Bridge", "Labs", "Link", "Stack", "Orbit", "Bloom", "Horizon", "Canvas", "Engine", "Collective", "Market", "Studio", "Path", "Current"]
    private static let namePrefixes = ["get", "try", "use", "neo", "ever", "open", "hyper", "meta", "omni", "terra", "luma", "nexa", "aero", "kin", "nova", "heli", "unify", "bright", "true", "blue", "clear", "prime", "urban", "north"]
    private static let nameEndings = ["ly", "io", "ora", "ify", "wise", "works", "flow", "base", "hive", "verse", "nest", "path", "grid", "beam", "loop", "forge", "craft", "spark", "pulse", "pilot", "shift", "scope", "well", "field"]
    private static func cleanName(_ value: String) -> String { value.folding(options: [.diacriticInsensitive, .widthInsensitive], locale: .current).lowercased().replacingOccurrences(of: "[^a-z0-9 ]+", with: " ", options: .regularExpression).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines) }
    private static func titleName(_ value: String) -> String { value.split(whereSeparator: { $0.isWhitespace }).map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ") }
    private static func blendName(_ left: String, _ right: String) -> String {
        let a = left.lowercased().filter(\.isLetter), b = right.lowercased().filter(\.isLetter)
        if a.isEmpty { return String(b) }; if b.isEmpty { return String(a) }
        let maxOverlap = min(3, min(a.count - 2, b.count - 2))
        if maxOverlap >= 1 { for length in stride(from: maxOverlap, through: 1, by: -1) { if a.suffix(length) == b.prefix(length) { return String(a) + String(b.dropFirst(length)) } } }
        return String(a.prefix(max(2, Int(ceil(Double(a.count) * 0.62))))) + String(b.dropFirst(max(1, Int(Double(b.count) * 0.38))))
    }
    private static func generatedNames(_ options: [String:String]) -> String {
        let seed = cleanName(s(options, "seed", "technology")).isEmpty ? "business" : cleanName(s(options, "seed", "technology"))
        let tokens = Array(seed.split(separator: " ").prefix(5).map(String.init))
        let displaySeed = titleName(seed), style = s(options, "namingStyle", "descriptive")
        let maxLength = min(60, max(8, Int(n(options, "maxNameLength", 32))))
        let count = min(48, max(24, Int(n(options, "nameCount", 32))))
        let offset = max(0, Int(n(options, "generationOffset", 0))) * count
        let blacklist = s(options, "nameBlacklist", "").components(separatedBy: CharacterSet(charactersIn: ",;|\\t\\n\\r ")).map(cleanName).filter { !$0.isEmpty }
        var candidates: [String] = []
        func add(_ value: String) { let clean = value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines); if !clean.isEmpty { candidates.append(clean) } }
        switch style {
        case "compound":
            for token in tokens { for noun in nameNouns { add(titleName(token) + titleName(noun)) }; for adjective in nameAdjectives { add(titleName(adjective) + titleName(token)) } }
            if tokens.count > 1 { for i in 0..<(tokens.count - 1) { add(titleName(blendName(tokens[i], tokens[i + 1]))) } }
            for adjective in nameAdjectives { for noun in nameNouns { add(titleName(blendName(adjective, noun))) } }
        case "prefix-suffix":
            for token in tokens { for prefix in namePrefixes { add("\(titleName(prefix)) \(titleName(token))") }; for ending in nameEndings { add("\(titleName(token)) \(titleName(ending))"); add(token + ending) } }
            for prefix in namePrefixes { for ending in nameEndings { add(titleName(prefix) + titleName(ending)) } }
        case "short-brandable":
            for token in tokens { for ending in nameEndings { add(token + ending) }; for prefix in namePrefixes { add(prefix + token) }; for noun in nameNouns { add(blendName(token, noun)) } }
            for adjective in nameAdjectives { for noun in nameNouns { add(blendName(adjective, noun)) } }
        default:
            for index in 0..<max(nameNouns.count, nameAdjectives.count) { if index < nameNouns.count { add("\(displaySeed) \(nameNouns[index])") }; if index < nameAdjectives.count { add("\(nameAdjectives[index]) \(displaySeed)") } }
            for token in tokens { for noun in nameNouns { add("\(titleName(token)) \(noun)") }; for adjective in nameAdjectives { add("\(adjective) \(titleName(token))") } }
            for adjective in nameAdjectives { for noun in nameNouns { add("\(adjective) \(noun)") } }
        }
        var seen = Set<String>()
        let names = candidates.filter { candidate in
            let key = candidate.lowercased()
            return candidate.count <= maxLength && candidate.count >= 2 && !blacklist.contains(where: { key.contains($0) }) && seen.insert(key).inserted
        }
        guard !names.isEmpty else { return "No names match these filters. Increase maximum length or remove an exclusion word." }
        let start = offset % names.count
        let rotated = Array(names[start...]) + Array(names[..<start])
        return rotated.prefix(count).joined(separator: "\n")
    }
    private static func generatedSlogans(_ options: [String:String]) -> String {
        let seed = cleanName(s(options, "seed", "your work")), audience = cleanName(s(options, "audience", "customers"))
        let frames = [
            "Make {seed} work for {audience}.", "A clearer way to {seed}.", "Built around real {seed} needs.", "Less friction. More {seed}.", "Helping {audience} move {seed} forward.",
            "Your next step in {seed}.", "Thoughtful tools for {seed}.", "From idea to {seed}.", "A better rhythm for {seed}.", "Turn {seed} into progress.",
            "Designed for the people behind {seed}.", "Make room for better {seed}.", "Simple by design. Ready for {seed}.", "Where {seed} meets momentum.", "Small steps. Stronger {seed}.",
            "Practical progress for {audience}.", "Move beyond ordinary {seed}.", "Build confidence into {seed}.", "More signal, less noise in {seed}.", "Bring your best to {seed}.",
            "Good work starts with {seed}.", "Your goals, closer through {seed}.", "An easier path to {seed}.", "Make every {seed} step count.",
            "A more thoughtful way to handle {seed}.", "Keep {seed} moving in the right direction.", "Built to make {seed} feel simpler.", "Bring clarity to {seed}.",
            "Small improvements. Meaningful {seed}.", "Put better {seed} within reach.", "For people who care about {seed}.", "A strong foundation for {seed}.",
            "Make your next {seed} decision clearer.", "Practical ideas for everyday {seed}.", "Move from busywork to {seed}.", "Give good {seed} room to grow.",
            "Designed to support your {seed} goals.", "Make useful progress on {seed}.", "More confidence in every {seed} step.", "A simpler path for {audience}.",
            "Make the hard parts of {seed} easier.", "Your work, moving forward.", "Create space for better {seed}.", "Better tools for real-world {seed}.",
            "Clear thinking. Useful {seed}.", "Let better {seed} begin here.", "The practical side of progress.", "Helping good work go further."
        ].map { $0.replacingOccurrences(of: "{seed}", with: seed).replacingOccurrences(of: "{audience}", with: audience) }
        let start = (max(0, Int(n(options, "generationOffset", 0))) * 24) % frames.count
        return (Array(frames[start...]) + Array(frames[..<start])).prefix(24).joined(separator: "\n")
    }
    static func run(_ tool: Tool, options: [String:String], operationOverride: String? = nil) throws -> String {
        let operation = operationOverride ?? op(tool)
        guard operations.contains(operation) else { throw NativeNativeError.message("Unsupported Business Studio mode: \(operation)") }
        let a=n(options,"a",1000), b=n(options,"b",600), c=n(options,"c",50), d=n(options,"d",10), e=n(options,"e",12)
        switch operation {
        case "roi":
            let value = max(0, a), investment = max(0, b)
            return "ROI\n\nROI: \(investment > 0 ? String(format:"%.2f%%", (value-investment)/investment*100) : "— (enter positive investment)")\nNet return: \(money(value-investment))\n\nFormula: (Value received − Initial investment) ÷ Initial investment × 100; undefined when investment is zero."
        case "break-even": let margin=a-c; let fixed=max(0,b); let target=max(0,Double(options["targetProfit"] ?? "0") ?? 0); let possible=a>c && a>0 && c>=0; let units=possible ? ceil((fixed+target)/margin) : 0; let breakEvenUnits=possible ? ceil(fixed/margin) : 0; return "Break-even\n\nFixed costs: \(money(fixed))\nSelling price per unit: \(money(a))\nVariable cost per unit: \(money(c))\nContribution margin per unit: \(possible ? money(margin) : "—")\nContribution margin ratio: \(possible ? String(format:"%.2f%%", margin/a*100) : "—")\nBreak-even units: \(possible ? String(Int(breakEvenUnits)) : "Not possible: selling price must exceed non-negative variable cost")\nBreak-even revenue: \(possible ? money(breakEvenUnits*a) : "—")\nUnits for target profit (\(money(target))): \(possible ? String(Int(units)) : "—")\n\nFormula: Fixed costs ÷ (Selling price per unit − Variable cost per unit); target units = (fixed costs + target profit) ÷ contribution margin. Single-product estimate; units rounded up."
        case "commission":
            let sales = max(0, a), rate = min(100, max(0, b)), commission = sales * rate / 100
            return "Commission\n\nSales amount: \(money(sales))\nCommission rate: \(String(format:"%.2f",rate))%\nCommission: \(money(commission))\nAfter commission: \(money(sales-commission))\n\nFormula: Sales × Rate; rate bounded to 0–100%."
        case "pricing", "markup":
            let cost = max(0, a), rate = max(0, b)
            return "Pricing / markup\n\nUnit cost: \(money(cost))\nMarkup rate: \(String(format:"%.2f",rate))%\nSelling price: \(money(cost*(1+rate/100)))\nProfit: \(money(cost*rate/100))\n\nFormula: Selling price = cost × (1 + markup). Markup is based on cost, not margin."
        case "cash-flow":
            let inflows = max(0, a), outflows = max(0, b)
            return "Cash flow\n\nOpening cash: \(money(c))\nCash inflows: \(money(inflows))\nCash outflows: \(money(outflows))\nNet cash flow: \(money(inflows-outflows))\nEnding cash: \(money(c+inflows-outflows))\n\nFormula: Ending cash = opening cash + inflows − outflows."
        case "salary":
            let annual = max(0, a)
            return "Salary conversion (gross, before tax)\n\nGross annual: \(money(annual))\nMonthly: \(money(annual/12))\nWeekly: \(money(annual/52))\nHourly (40h): \(money(annual/2080))\n\nAnnual salary divided by standard periods; this is not take-home pay."
        case "customer-lifetime-value":
            let saas = s(options, "ltvModel", "simple") == "saas"
            let grossMargin = min(100, max(0, n(options, "grossMarginPct", 80))) / 100
            let churnPct = min(100, max(0, n(options, "monthlyChurnPct", 0)))
            let suppliedContribution = max(0, n(options, "monthlyContribution", 0))
            let monthlyContribution = saas ? (suppliedContribution > 0 ? suppliedContribution : max(0, a) * grossMargin) : suppliedContribution
            let ltv = saas ? (churnPct > 0 ? (max(0, a) * grossMargin) / (churnPct / 100) : 0) : max(0, a) * max(0, b) * max(0, c)
            let cac = n(options, "cac", n(options, "d", 0))
            let ratio = cac > 0 ? ltv/cac : 0
            let payback = cac > 0 && monthlyContribution > 0 ? cac/monthlyContribution : 0
            let band: String = saas && churnPct <= 0 ? "Set monthly churn above 0% before interpreting LTV:CAC" : cac <= 0 ? "Add CAC to assess acquisition efficiency" : ratio < 1 ? "Below 1×: value does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; improve unit economics" : ratio <= 5 ? "3–5×: commonly considered a planning band" : ">5×: strong; validate assumptions"
            let formula = saas ? "Gross-profit SaaS LTV = monthly ARPU × gross margin % ÷ monthly churn % (decimals). Churn must be above 0%; constant assumptions exclude expansion, discounting and cohort effects." : "Revenue-based LTV = average order value × purchases per period × lifespan. This is before gross margin."
            return "Customer lifetime value\n\nLTV model: \(saas ? "SaaS / subscription" : "Simple commerce")\nLTV: \(saas && churnPct <= 0 ? "Not finite: monthly churn must be above 0%" : money(ltv))\nLTV:CAC: \(cac > 0 && (!saas || churnPct > 0) ? String(format:"%.2f×", ratio) : "—")\nHealth: \(band)\nMonthly contribution: \(money(monthlyContribution))\nCAC payback: \(payback > 0 ? String(format:"%.1f months", payback) : "—")\n\nMethod: \(formula)\nPayback = CAC ÷ monthly contribution. Ratio bands are directional heuristics, not universal benchmarks."
        case "customer-acquisition-cost":
            let cac = a > 0 && b > 0 ? a / b : 0
            let ltv = Double(options["ltv"] ?? options["d"] ?? "0") ?? 0
            let ratio = cac > 0 && ltv > 0 ? ltv / cac : 0
            let monthlyContribution = max(0, Double(options["monthlyContribution"] ?? "0") ?? 0)
            let payback = cac > 0 && monthlyContribution > 0 ? cac / monthlyContribution : 0
            let health: String = cac <= 0 || ltv <= 0 ? "Add valid positive LTV and CAC inputs" : ratio < 1 ? "Below 1×: LTV does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; review acquisition efficiency" : ratio <= 5 ? "3–5×: commonly used as a healthy planning band" : ">5×: strong ratio; validate growth and retention assumptions"
            return "Customer acquisition cost\n\nCAC: \(cac > 0 ? money(cac) : "—")\nLTV:CAC: \(ratio > 0 ? String(format:"%.2f×", ratio) : "—")\nHealth: \(health)\nCAC payback: \(payback > 0 ? String(format:"%.1f months", payback) : "—")\n\nFormula: acquisition spend ÷ new customers; LTV:CAC = LTV ÷ CAC; payback months = CAC ÷ monthly contribution per new customer. Bands are directional heuristics, not universal benchmarks."
        case "recurring-revenue":
            let mrr = max(0, a)
            return "Recurring revenue\n\nMonthly recurring revenue (MRR): \(money(mrr))\nAnnual recurring revenue (ARR): \(money(mrr*12))\nAnnual growth rate: \(String(format:"%.2f",b))%\n\nARR = MRR × 12; growth is shown as entered and may be negative for contraction."
        case "expense":
            let lines = [a,b,c,d,e].map { max(0, $0) }, total = lines.reduce(0, +)
            return "Expense\n\nOperating expenses: \(money(lines[0]))\nPayroll: \(money(lines[1]))\nMarketing: \(money(lines[2]))\nSoftware / tools: \(money(lines[3]))\nOther expenses: \(money(lines[4]))\nTotal expense: \(money(total))\nAverage per line: \(money(total/5))\n\nNegative expense inputs are treated as zero."
        case "inventory":
            let units = max(0, a), unitCost = max(0, b), reorder = max(0, c)
            return "Inventory\n\nUnits in stock: \(money(units))\nCost per unit: \(money(unitCost))\nInventory value: \(money(units*unitCost))\nReorder quantity: \(money(reorder))\n\nFormula: non-negative units × non-negative unit cost; excludes shrinkage and valuation adjustments."
        case "discount":
            let original = max(0, a), rate = min(100, max(0, b)), discount = original * rate / 100
            return "Discount\n\nOriginal price: \(money(original))\nDiscount rate: \(String(format:"%.2f",rate))%\nDiscount: \(money(discount))\nFinal price: \(money(original-discount))\n\nRate bounded to 0–100%; final price cannot be negative."
        case "margin", "profit":
            let revenue = max(0, a), costs = max(0, b), profit = revenue - costs
            return "Profit / margin\n\nRevenue: \(money(revenue))\nCosts: \(money(costs))\nProfit / loss: \(money(profit))\nMargin: \(revenue == 0 ? "—" : String(format:"%.2f%%",profit/revenue*100))\n\nMargin is undefined when revenue is zero."
        case "business-name", "company-name", "brand-name", "product-name": return generatedNames(options)
        case "slogan": return generatedSlogans(options)
        case "sku": let prefix = cleanName(s(options,"seed","SKU")).replacingOccurrences(of:" ",with:"").prefix(6).uppercased().padding(toLength:3,withPad:"X",startingAt:0); let start = max(0,Int(n(options,"generationOffset",0)))*24; return (1...24).map { "\(prefix)-\(String(format:"%03d",start+$0))" }.joined(separator:"\n")
        case "agenda", "meeting-agenda":
            let parsed = s(options, "agendaItems", "").components(separatedBy: .newlines).compactMap { line -> (String, Int)? in
                let parts = line.components(separatedBy: "|")
                guard parts.count >= 2, !parts[0].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      let minutes = Int(parts[1].trimmingCharacters(in: .whitespacesAndNewlines)), (1...480).contains(minutes) else { return nil }
                return (parts[0].trimmingCharacters(in: .whitespacesAndNewlines), minutes)
            }
            let items = parsed.isEmpty ? [("Welcome and objectives", 5), ("Progress updates", 10), ("Decisions and blockers", 15), ("Actions and next steps", 5)] : parsed
            let itemLines = items.enumerated().map { "\($0.offset + 1). \($0.element.0) (\($0.element.1) min)" }
            return (["MEETING AGENDA", "Title: \(s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning")))", "Date/time: \(s(options,"dateTime","Add date and time"))", "Location/link: \(s(options,"location","Add location or meeting link"))", "Goal: \(s(options,"meetingGoal","Weekly planning"))", "Attendees: \(s(options,"attendees","Team"))", "", "Timed agenda items:"] + itemLines + ["Timing total: \(items.reduce(0) { $0 + $1.1 }) minutes", "Prep notes: \(s(options,"prepNotes","None added"))"]).joined(separator: "\n")
        case "minutes", "meeting-minutes": return "MEETING MINUTES\nTitle: \(s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning")))\nDate/time: \(s(options,"dateTime","Not set"))\nLocation/link: \(s(options,"location","Not set"))\nAttendees: \(s(options,"attendees","Team"))\n\nDiscussion notes:\n\(s(options,"discussionNotes","- Add notes by agenda item"))\n\nDecisions:\n\(s(options,"decisions","- Record decision and rationale"))\n\nAction items (owner | task | due):\n\(s(options,"actionItems","- Owner: — | Task: — | Due: —"))\n\nNext meeting: \(s(options,"nextMeeting","Not scheduled"))"
        case "invoice", "receipt", "quotation", "estimate", "purchase-order":
            let label = operation.replacingOccurrences(of: "-", with: " ").capitalized
            let company = s(options,"company","Your Business"), client = s(options,"client","Client"), currency = s(options,"currency","USD")
            let fallbackQuantity = max(0,n(options,"quantity",1)), fallbackPrice = max(0,n(options,"unitPrice",a/10))
            // Optional rows use: Description | quantity | unit price. Invalid rows are ignored.
            // If the form explicitly supplied rows but all rows are blank/invalid, show zero rather than a fake service.
            let hasLineItemsInput = options["lineItems"] != nil
            let parsedItems: [(String, Double, Double)] = (options["lineItems"] ?? "").components(separatedBy:.newlines).compactMap { row in
                let parts = row.components(separatedBy:"|")
                guard parts.count >= 3, !parts[0].trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
                      let quantity = Double(parts[1].trimmingCharacters(in:.whitespacesAndNewlines)), quantity.isFinite, quantity >= 0,
                      let price = Double(parts[2].trimmingCharacters(in:.whitespacesAndNewlines)), price.isFinite, price >= 0 else { return nil }
                return (parts[0].trimmingCharacters(in:.whitespacesAndNewlines), quantity, price)
            }
            let items = parsedItems.isEmpty ? (hasLineItemsInput ? [] : [(s(options,"description","Professional service"), fallbackQuantity, fallbackPrice)]) : parsedItems
            let subtotal = items.reduce(0.0) { sum, item in
                let line = item.1 * item.2
                let next = sum + (line.isFinite ? line : 0)
                return next.isFinite ? next : Double.greatestFiniteMagnitude
            }
            let discount = subtotal*min(100,max(0,n(options,"discountPercent",0)))/100, taxable = subtotal-discount
            let taxAmount = taxable*max(0,n(options,"taxPercent",0))/100
            let itemLines = items.map { "\($0.0) | Qty \(money($0.1)) | \(currency) \(money($0.2)) | Line total \(currency) \(money(($0.1*$0.2).isFinite ? $0.1*$0.2 : 0))" }.joined(separator:"\n")
            let safeItemLines = itemLines.isEmpty ? "(No valid line items entered)" : itemLines
            let recipientLabel = operation == "receipt" ? "Received from" : (operation == "quotation" || operation == "estimate") ? "Prepared for" : operation == "purchase-order" ? "Supplier" : "Bill to"
            return "\(label) — generated locally\nBusiness: \(company)\n\(recipientLabel): \(client)\nDocument: \(s(options,"documentNumber","DOC-001"))\nDate: \(s(options,"date","Today"))\n\nLine items:\n\(safeItemLines)\nSubtotal: \(currency) \(money(subtotal))\nDiscount: -\(currency) \(money(discount))\nTax: \(currency) \(money(taxAmount))\nTOTAL: \(currency) \(money(taxable+taxAmount))\n\nClient data remains on this device unless you explicitly export or share it."
        case "payslip": let gross=max(0,n(options,"gross",a)), statutory=max(0,n(options,"statutoryDeductions",b)), other=max(0,n(options,"otherDeductions",c)); return "PAYSLIP — DEMO ONLY\nEmployer: \(s(options,"company","Your Business"))\nEmployee: \(s(options,"employeeName","Employee name"))\nPay period: \(s(options,"payPeriod","Pay period"))\n\nGross pay: \(money(gross))\nTax / statutory deductions: -\(money(statutory))\nOther deductions: -\(money(other))\nNet pay: \(money(gross-statutory-other))\n\nIllustrative layout only; verify local payroll and statutory requirements."
        case "email-signature":
            let name = s(options, "name", "Alex Morgan")
            let role = s(options, "role", "Founder")
            let email = s(options, "email", "hello@example.com")
            let company = s(options, "company", "Your Business")
            let phone = s(options, "phone", "")
            let website = s(options, "website", "")
            let social = s(options, "socialLink", "")
            let safeWebsite = (website.lowercased().hasPrefix("https://") || website.lowercased().hasPrefix("http://")) ? website : ""
            let safeSocial = (social.lowercased().hasPrefix("https://") || social.lowercased().hasPrefix("http://")) ? social : ""
            let phoneHtml = phone.isEmpty ? "" : "<br>" + htmlEscape(phone)
            let websiteHtml = website.isEmpty ? "" : (safeWebsite.isEmpty ? "<br>" + htmlEscape(website) : "<br><a href=\"" + htmlEscape(safeWebsite) + "\">" + htmlEscape(website) + "</a>")
            let socialHtml = social.isEmpty ? "" : (safeSocial.isEmpty ? "<br>Profile: " + htmlEscape(social) : "<br><a href=\"" + htmlEscape(safeSocial) + "\">Profile</a>")
            let html = "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"font-family:Arial,sans-serif;font-size:13px;color:#222\"><tr><td style=\"padding-right:12px\"><strong>" + htmlEscape(name) + "</strong><br>" + htmlEscape(role) + "<br>" + htmlEscape(company) + "</td><td style=\"border-left:2px solid #888;padding-left:12px\">" + htmlEscape(email) + phoneHtml + websiteHtml + socialHtml + "</td></tr></table>"
            let phoneText = phone.isEmpty ? "" : "Phone: \(phone)\n"
            let websiteText = website.isEmpty ? "" : "Website: \(website)\n"
            let socialText = social.isEmpty ? "" : "Profile: \(social)\n"
            return "\(name) | \(role)\n\(email)\n\(company)\n\(phoneText)\(websiteText)\(socialText)\nHTML signature (inline styles; no remote images):\n\(html)\n\nHTML output is a starting point. Verify formatting in your target email clients; clients may sanitize pasted HTML."
        default: throw NSError(domain: "enV.NativeBusinessEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported business operation: \(operation)"])
        }
    }
}
