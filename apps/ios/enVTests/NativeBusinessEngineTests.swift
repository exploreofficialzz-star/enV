import XCTest
@testable import enV

final class NativeBusinessEngineTests: XCTestCase {
    private func tool(_ id: String, op: String? = nil) -> Tool {
        Tool(id: id, name: id, slug: id, description: "", category: "business", subcategory: nil,
             keywords: [], tags: [], icon: "Briefcase", popularity: 0, featured: false, clientSide: true,
             requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [],
             engine: ToolEngine(type: "business", id: id, op: op ?? id))
    }

    func testBreakEvenRejectsImpossibleUnitEconomics() throws {
        let output = try NativeBusinessEngine.run(tool("break-even"), options: ["a":"10", "b":"1000", "c":"15"])
        XCTAssertTrue(output.contains("Not possible"))
        XCTAssertTrue(output.contains("Selling price per unit"))
    }

    func testBreakEvenSupportsTargetProfitAndCorrectRevenue() throws {
        let output = try NativeBusinessEngine.run(tool("break-even"), options: ["a":"50", "b":"10000", "c":"30", "targetProfit":"5000"])
        XCTAssertTrue(output.contains("Break-even units: 500"))
        XCTAssertTrue(output.contains("Break-even revenue: 25000.00"))
        XCTAssertTrue(output.contains("Units for target profit (5000.00): 750"))
    }

    func testCACDoesNotInventLTVAndCalculatesPaybackOnlyWithContribution() throws {
        let withoutLTV = try NativeBusinessEngine.run(tool("customer-acquisition-cost"), options: ["a":"5000", "b":"100", "monthlyContribution":"10"])
        XCTAssertTrue(withoutLTV.contains("CAC: 50.00"))
        XCTAssertTrue(withoutLTV.contains("LTV:CAC: —"))
        XCTAssertTrue(withoutLTV.contains("CAC payback: 5.0 months"))
        let withLTV = try NativeBusinessEngine.run(tool("customer-acquisition-cost"), options: ["a":"5000", "b":"100", "ltv":"250", "monthlyContribution":"10"])
        XCTAssertTrue(withLTV.contains("LTV:CAC: 5.00×"))
    }

    func testAgendaAndMinutesAreOperationalTemplates() throws {
        let agenda = try NativeBusinessEngine.run(tool("meeting-agenda-generator", op: "meeting-agenda"), options: ["meetingTitle":"Q4 sales review"])
        let minutes = try NativeBusinessEngine.run(tool("meeting-minutes-generator", op: "meeting-minutes"), options: [:])
        XCTAssertTrue(agenda.contains("MEETING AGENDA"))
        XCTAssertTrue(agenda.contains("Q4 sales review"))
        XCTAssertFalse(agenda.contains("Revenue / amount"))
        XCTAssertTrue(minutes.contains("Decisions:"))
        XCTAssertTrue(minutes.contains("Action items (owner | task | due):"))
    }

    func testNativeDocumentsSupportMultipleLineItemsAndCorrectTotals() throws {
        let output = try NativeBusinessEngine.run(tool("invoice"), options: ["lineItems":"Design | 2 | 250\nHosting | 1 | 250", "taxPercent":"7.5", "discountPercent":"0"])
        XCTAssertTrue(output.contains("Design | Qty 2.00 | USD 250.00 | Line total USD 500.00"))
        XCTAssertTrue(output.contains("Subtotal: USD 750.00"))
        XCTAssertTrue(output.contains("Tax: USD 56.25"))
        XCTAssertTrue(output.contains("TOTAL: USD 806.25"))
    }

    func testPayslipIsDemoAndCalculatesNetPay() throws {
        let output = try NativeBusinessEngine.run(tool("payslip"), options: ["gross":"3000", "statutoryDeductions":"300", "otherDeductions":"100"])
        XCTAssertTrue(output.contains("PAYSLIP — DEMO ONLY"))
        XCTAssertTrue(output.contains("Net pay: 2600.00"))
        XCTAssertFalse(output.contains("Bill to:"))
    }
}
