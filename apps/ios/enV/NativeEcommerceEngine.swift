import Foundation

enum NativeEcommerceEngine {
    static let families: Set<String> = [
        "product", "order", "inventory", "shipping", "pricing", "discount", "coupon", "sku",
        "barcode", "catalog", "store", "customer", "return", "profit", "margin"
    ]
    static let workflows: Set<String> = ["generator", "calculator", "planner", "template", "mockup", "helper"]

    struct Field: Identifiable, Hashable {
        let key: String
        let label: String
        var defaultValue: String = ""
        var multiline: Bool = false
        var id: String { key }
    }

    struct Operation {
        let family: String
        let workflow: String
    }

    static func operation(for tool: Tool) -> Operation? {
        guard tool.category.lowercased() == "ecommerce" else { return nil }
        let parts = tool.id.split(separator: "-").map(String.init)
        guard let workflow = parts.last, workflows.contains(workflow) else { return nil }
        let family = parts.dropLast().joined(separator: "-")
        guard families.contains(family) else { return nil }
        return Operation(family: family, workflow: workflow)
    }

    static func supports(_ tool: Tool) -> Bool { operation(for: tool) != nil }

    static func fields(for tool: Tool) -> [Field] {
        guard let op = operation(for: tool) else { return [] }
        let common = [Field(key: "name", label: "Name / product", defaultValue: "Sample Product"),
                      Field(key: "code", label: "Reference / SKU", defaultValue: "SKU-001")]
        let finance = [
            Field(key: "cost", label: "Unit cost", defaultValue: "40"),
            Field(key: "price", label: "Selling price", defaultValue: "75"),
            Field(key: "quantity", label: "Quantity", defaultValue: "1"),
            Field(key: "discount", label: "Discount (%)", defaultValue: "0"),
            Field(key: "tax", label: "Tax (%)", defaultValue: "0"),
            Field(key: "shipping", label: "Shipping charged", defaultValue: "0"),
            Field(key: "packaging", label: "Packaging / handling cost", defaultValue: "0"),
            Field(key: "feePercent", label: "Payment / platform fee (%)", defaultValue: "0"),
            Field(key: "advertising", label: "Advertising cost", defaultValue: "0"),
            Field(key: "targetMargin", label: "Target margin (%)", defaultValue: "30")
        ]
        switch op.workflow {
        case "calculator":
            switch op.family {
            case "inventory":
                return common + [
                    Field(key: "stock", label: "Available stock", defaultValue: "50"),
                    Field(key: "dailySales", label: "Average units sold per day", defaultValue: "5"),
                    Field(key: "leadTime", label: "Supplier lead time (days)", defaultValue: "7"),
                    Field(key: "safetyStock", label: "Safety stock (units)", defaultValue: "0")
                ]
            case "discount", "coupon":
                return common + finance.filter { ["price", "quantity", "discount", "cost", "feePercent", "packaging"].contains($0.key) }
            case "profit", "margin", "pricing":
                return common + finance.filter { ["cost", "price", "quantity", "discount", "packaging", "feePercent", "advertising", "targetMargin"].contains($0.key) }
            case "shipping":
                return common + [
                    Field(key: "weight", label: "Package weight (kg)", defaultValue: "1"),
                    Field(key: "distance", label: "Distance (km)", defaultValue: "10"),
                    Field(key: "shipping", label: "Quoted shipping amount", defaultValue: "0")
                ]
            case "order":
                return common + finance.filter { ["price", "quantity", "discount", "tax", "shipping"].contains($0.key) }
            default: return common + finance
            }
        case "generator":
            switch op.family {
            case "product":
                return common + [Field(key: "price", label: "Selling price", defaultValue: "75"),
                                 Field(key: "cost", label: "Unit cost", defaultValue: "40"),
                                 Field(key: "stock", label: "Opening stock", defaultValue: "50"),
                                 Field(key: "description", label: "Product description", multiline: true)]
            case "sku":
                return common + [Field(key: "prefix", label: "SKU prefix", defaultValue: "ENV"),
                                 Field(key: "variant", label: "Variant / option", defaultValue: "DEFAULT")]
            case "barcode":
                return common + [Field(key: "format", label: "Barcode format", defaultValue: "CODE128"),
                                 Field(key: "value", label: "Barcode value", defaultValue: "123456789")]
            case "customer":
                return common + [Field(key: "email", label: "Email"), Field(key: "phone", label: "Phone")]
            case "order", "return":
                return common + [Field(key: "customer", label: "Customer", defaultValue: "Customer"),
                                 Field(key: "quantity", label: "Quantity", defaultValue: "1"),
                                 Field(key: "price", label: "Unit price", defaultValue: "75"),
                                 Field(key: "notes", label: "Notes", multiline: true)]
            default:
                return common + [Field(key: "description", label: "Details", multiline: true),
                                 Field(key: "notes", label: "Notes", multiline: true)]
            }
        case "mockup":
            return common + [Field(key: "price", label: "Selling price", defaultValue: "75"),
                             Field(key: "discount", label: "Discount (%)", defaultValue: "0"),
                             Field(key: "quantity", label: "Quantity", defaultValue: "1")]
        case "planner":
            return common + [Field(key: "stock", label: "Current stock", defaultValue: "50"),
                             Field(key: "dailySales", label: "Average daily sales", defaultValue: "5"),
                             Field(key: "leadTime", label: "Lead time (days)", defaultValue: "7"),
                             Field(key: "notes", label: "Constraints / notes", multiline: true)]
        case "template":
            return common + [Field(key: "customer", label: "Customer / supplier"),
                             Field(key: "quantity", label: "Quantity", defaultValue: "1"),
                             Field(key: "price", label: "Unit price", defaultValue: "0"),
                             Field(key: "notes", label: "Notes / next action", multiline: true)]
        default:
            return common + [Field(key: "notes", label: "What are you trying to do?", multiline: true)]
        }
    }

    static func initialValues(for tool: Tool) -> [String: String] {
        Dictionary(fields(for: tool).map { ($0.key, $0.defaultValue) }, uniquingKeysWith: { first, _ in first })
    }

    static func run(_ tool: Tool, values: [String: String]) throws -> String {
        guard let op = operation(for: tool) else { throw NativeEcommerceError.invalidTool }
        func value(_ key: String, _ fallback: String = "") -> String {
            let text = values[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty ? fallback : text
        }
        func number(_ key: String, _ fallback: Double = 0) throws -> Double {
            let raw = value(key)
            let parsed = raw.isEmpty ? fallback : (Double(raw) ?? .nan)
            guard parsed.isFinite else { throw NativeEcommerceError.invalidNumber(key) }
            guard parsed >= 0 else { throw NativeEcommerceError.negativeNumber(key) }
            return parsed
        }
        func percentage(_ key: String) throws -> Double {
            let result = try number(key)
            guard result <= 100 else { throw NativeEcommerceError.invalidPercentage(key) }
            return result
        }
        func money(_ amount: Double) -> String { String(format: "%.2f", amount) }
        let name = value("name", op.family.capitalized)
        let code = value("code", "\(op.family.uppercased())-001")

        if op.workflow == "calculator" {
            let price = try number("price", 75)
            let cost = try number("cost", 40)
            let quantity = try number("quantity", 1)
            let discount = try percentage("discount")
            let tax = try percentage("tax")
            let shipping = try number("shipping")
            let packaging = try number("packaging")
            let feePercent = try percentage("feePercent")
            let advertising = try number("advertising")
            let subtotal = price * quantity
            let discountAmount = subtotal * discount / 100
            let netSales = subtotal - discountAmount
            let taxAmount = netSales * tax / 100
            let fees = netSales * feePercent / 100
            let unitProfit = price * (1 - discount / 100) - cost - packaging - price * (1 - discount / 100) * feePercent / 100
            let profit = unitProfit * quantity - advertising
            let margin = netSales > 0 ? profit / netSales * 100 : 0

            switch op.family {
            case "inventory":
                let stock = try number("stock")
                let daily = try number("dailySales")
                let lead = try number("leadTime")
                let safety = try number("safetyStock")
                let reorder = ceil(daily * lead + safety)
                let cover = daily > 0 ? money(stock / daily) + " days" : "not estimable until daily sales are entered"
                return """
                CURRENT STOCK: \(money(stock)) units
                Average daily demand: \(money(daily)) units
                Supplier lead time: \(money(lead)) days
                Safety stock: \(money(safety)) units
                Reorder point: \(money(reorder)) units
                ACTION: \(stock <= reorder ? "Reorder review required." : "Stock is above the reorder point.")
                Estimated stock cover: \(cover)
                """
            case "discount", "coupon":
                let sale = price * (1 - discount / 100)
                let contribution = sale - cost - packaging - sale * feePercent / 100
                return """
                Original unit price: \(money(price))
                Discount: \(money(discount))%
                Customer savings: \(money(price - sale)) per unit
                Sale price: \(money(sale))
                Estimated unit contribution after cost, packaging and fees: \(money(contribution))
                \(contribution < 0 ? "WARNING: This price creates a unit loss before advertising." : "Promotion remains positive before advertising and fixed costs.")
                """
            case "profit", "margin":
                return """
                Gross sales before discount: \(money(subtotal))
                Discount: \(money(discountAmount))
                Net sales before tax: \(money(netSales))
                Product cost: \(money(cost * quantity))
                Packaging / handling: \(money(packaging * quantity))
                Payment / platform fees: \(money(fees))
                Advertising cost: \(money(advertising))
                Estimated contribution profit: \(money(profit))
                Estimated contribution margin: \(money(margin))%
                """
            case "pricing":
                let target = try percentage("targetMargin")
                let variable = cost + packaging
                let feeRate = feePercent / 100
                let minimum = feeRate < 1 ? variable / (1 - feeRate) : .infinity
                let targetPrice = target + feePercent < 100 ? variable / (1 - (target + feePercent) / 100) : .infinity
                return """
                Unit cost including packaging: \(money(variable))
                Payment / platform fee: \(money(feePercent))%
                Minimum break-even price before tax and advertising: \(money(minimum))
                Target margin: \(money(target))%
                Target selling price: \(targetPrice.isFinite ? money(targetPrice) : "Not achievable with these fee and margin inputs")
                """
            case "order":
                return """
                Order subtotal: \(money(subtotal))
                Discount: \(money(discountAmount))
                Tax estimate: \(money(taxAmount))
                Shipping: \(money(shipping))
                ORDER TOTAL: \(money(netSales + taxAmount + shipping))
                """
            case "shipping":
                let weight = try number("weight")
                let distance = try number("distance")
                return """
                Package weight: \(money(weight)) kg
                Distance: \(money(distance)) km
                Quoted shipping amount: \(money(shipping))
                This is a recorded quote, not a live carrier rate. Connect an enabled carrier to purchase a label.
                """
            default:
                return """
                Unit profit before additional costs: \(money(price - cost))
                Quantity: \(money(quantity))
                Estimated total: \(money(subtotal))
                Shipping entered: \(money(shipping))
                Order estimate including shipping and tax: \(money(netSales + taxAmount + shipping))
                """
            }
        }

        switch op.workflow {
        case "generator":
            switch op.family {
            case "product":
                return "PRODUCT RECORD\nName: \(name)\nSKU: \(code)\nPrice: \(money(try number("price", 75)))\nCost: \(money(try number("cost", 40)))\nOpening stock: \(money(try number("stock", 50)))\nDescription: \(value("description", "Add a clear customer-facing product description."))"
            case "sku":
                let prefix = value("prefix", "ENV").uppercased().filter { $0.isLetter || $0.isNumber || $0 == "-" }
                let variant = value("variant", "DEFAULT").uppercased().filter { $0.isLetter || $0.isNumber || $0 == "-" }
                let slug = name.uppercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: "-")
                return "SKU: \(prefix)-\(String(slug.prefix(18)))-\(variant)\nKeep each sellable variant unique and check the product catalogue for duplicates before importing."
            case "barcode":
                return "BARCODE JOB\nName: \(name)\nReference: \(code)\nFormat requested: \(value("format", "CODE128"))\nValue: \(value("value", code))\nUse the dedicated QR & Barcode tools to render, scan-check and print the barcode."
            case "customer":
                return "CUSTOMER RECORD\nName: \(name)\nEmail: \(value("email", "Not supplied"))\nPhone: \(value("phone", "Not supplied"))\nReference: \(code)\nStore only customer fields required for your workflow and applicable privacy obligations."
            default:
                return "\(op.family.uppercased()) RECORD\nReference: \(code)\nName: \(name)\nCustomer: \(value("customer", "Not supplied"))\nQuantity: \(money(try number("quantity", 1)))\nUnit price: \(money(try number("price")))\nNotes: \(value("notes", value("description", "Add notes.")))"
            }
        case "planner":
            switch op.family {
            case "inventory":
                let stock = try number("stock", 50)
                let daily = try number("dailySales", 5)
                let lead = try number("leadTime", 7)
                return "INVENTORY REVIEW PLAN\nCurrent stock: \(money(stock))\nAverage daily sales: \(money(daily))\nLead time: \(money(lead)) days\nReorder review point: \(money(ceil(daily * lead)))\n\n1. Confirm physical stock.\n2. Reconcile reserved and damaged units.\n3. Confirm supplier availability and lead time.\n4. Set a safety-stock policy.\n5. Approve and record a purchase order.\n6. Review stock after receiving."
            case "shipping":
                return "SHIPPING PLAN\n1. Confirm order items and destination.\n2. Verify package weight and dimensions.\n3. Compare enabled carrier services.\n4. Purchase the selected label through the carrier integration.\n5. Record tracking and dispatch time.\n6. Reconcile delivery and exceptions."
            case "return":
                return "RETURN PLAN\n1. Find the original order.\n2. Confirm the return window and item condition.\n3. Record the customer's reason.\n4. Authorise return or explain the decision.\n5. Inspect and decide restock, repair or disposal.\n6. Process the approved refund or exchange.\n7. Close the case with an audit record."
            default:
                return "\(op.family.uppercased()) PLAN\nGoal: \(name)\nReference: \(code)\n\n1. Confirm the objective and source records.\n2. Check assumptions and required approvals.\n3. Complete the operation.\n4. Reconcile the result.\n5. Record the next action.\nNotes: \(value("notes", "None supplied."))"
            }
        case "template":
            return "\(op.family.uppercased()) TEMPLATE\nName: \(name)\nReference: \(code)\nCustomer / supplier: \(value("customer", "Not supplied"))\nQuantity: \(money(try number("quantity", 1)))\nUnit price: \(money(try number("price")))\nStatus: [Draft / Pending / Approved / Complete]\nNotes: \(value("notes", "Add notes."))\nNext action: "
        case "mockup":
            let sale = try number("price", 75) * (1 - (try percentage("discount")) / 100)
            return "STORE PREVIEW\n\(name)\nReference: \(code)\nDisplayed price: \(money(sale))\nQuantity shown: \(money(try number("quantity", 1)))\n\nPreview only. This native mockup does not publish a storefront, accept payment or create an order."
        default:
            switch op.family {
            case "inventory": return "Inventory helper: reconcile on-hand, reserved and damaged stock; review supplier lead time; set a safety-stock rule; and keep a dated movement log."
            case "shipping": return "Shipping helper: confirm address, weight, dimensions and service. Live carrier rates and labels require an enabled carrier integration."
            case "profit", "margin", "pricing": return "Pricing helper: distinguish markup (profit divided by cost) from margin (profit divided by selling price). Include variable fees, packaging, fulfilment and returns before approving a promotion."
            case "barcode": return "Barcode helper: select a symbology accepted by the target scanner, validate the identifier separately, preserve quiet zones and test a printed sample."
            case "return": return "Returns helper: link every case to its original order, record condition and reason, document the decision and reconcile refund or replacement."
            default: return "Use consistent records, validate identifiers, document assumptions and export a dated copy before making operational changes."
            }
        }
    }
}

enum NativeEcommerceError: LocalizedError {
    case invalidTool
    case invalidNumber(String)
    case negativeNumber(String)
    case invalidPercentage(String)

    var errorDescription: String? {
        switch self {
        case .invalidTool: return "This native E-commerce tool is not supported."
        case .invalidNumber(let field): return "\(field.capitalized) must be a valid number."
        case .negativeNumber(let field): return "\(field.capitalized) cannot be negative."
        case .invalidPercentage(let field): return "\(field.capitalized) must be between 0 and 100."
        }
    }
}
