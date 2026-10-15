import XCTest
@testable import enV

final class NativeBusinessEngineTests: XCTestCase {
    private func tool(_ id: String, op: String? = nil) -> Tool {
        Tool(id: id, name: id, slug: id, description: "", category: "business", subcategory: nil,
             keywords: [], tags: [], icon: "Briefcase", popularity: 0, featured: false, clientSide: true,
             requiresBackend: false, requiresAuth: false, status: "active", disclaimer: nil, related: [],
             engine: ToolEngine(type: "business", id: id, op: op ?? id))
    }

    func testStudioModeOverrideRunsSelectedOperationInsteadOfAnchorTool() throws {
        let anchor = tool("invoice", op: "invoice")
        let output = try NativeBusinessEngine.run(anchor, options: ["a":"50000", "b":"8"], operationOverride: "commission")
        XCTAssertTrue(output.contains("Commission: 4000.00"))
        XCTAssertFalse(output.contains("Subtotal:"))
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

    func testBlankEditableDocumentRowsDoNotInventAServiceOrTotal() throws {
        let output = try NativeBusinessEngine.run(tool("invoice"), options: ["lineItems":" | 1 | 0", "taxPercent":"7.5"])
        XCTAssertTrue(output.contains("(No valid line items entered)"))
        XCTAssertTrue(output.contains("Subtotal: USD 0.00"))
        XCTAssertTrue(output.contains("TOTAL: USD 0.00"))
        XCTAssertFalse(output.contains("Professional service |"))
    }

    func testPayslipIsDemoAndCalculatesNetPay() throws {
        let output = try NativeBusinessEngine.run(tool("payslip"), options: ["gross":"3000", "statutoryDeductions":"300", "otherDeductions":"100"])
        XCTAssertTrue(output.contains("PAYSLIP — DEMO ONLY"))
        XCTAssertTrue(output.contains("Net pay: 2600.00"))
        XCTAssertFalse(output.contains("Bill to:"))
    }
    func testNamingModesCreateFilteredDistinctPagesAndSlogansAdvance() throws {
        let namesTool = tool("business-name")
        let descriptive = try NativeBusinessEngine.run(namesTool, options: ["seed":"solar energy", "namingStyle":"descriptive"])
        let compound = try NativeBusinessEngine.run(namesTool, options: ["seed":"solar energy", "namingStyle":"compound"])
        let more = try NativeBusinessEngine.run(namesTool, options: ["seed":"solar energy", "namingStyle":"descriptive", "generationOffset":"1"])
        XCTAssertGreaterThanOrEqual(descriptive.components(separatedBy: "\n").count, 24)
        XCTAssertNotEqual(descriptive, compound)
        XCTAssertNotEqual(descriptive, more)
        let filtered = try NativeBusinessEngine.run(namesTool, options: ["seed":"solar energy", "namingStyle":"short-brandable", "maxNameLength":"12", "nameBlacklist":"solar,energy"])
        XCTAssertTrue(filtered.components(separatedBy: "\n").allSatisfy { $0.count <= 12 && !$0.localizedCaseInsensitiveContains("solar") && !$0.localizedCaseInsensitiveContains("energy") })
        let slogansFirst = try NativeBusinessEngine.run(tool("slogan"), options: ["seed":"solar", "audience":"homeowners"])
        let slogansMore = try NativeBusinessEngine.run(tool("slogan"), options: ["seed":"solar", "audience":"homeowners", "generationOffset":"1"])
        XCTAssertGreaterThanOrEqual(slogansFirst.components(separatedBy: "\n").count, 24)
        XCTAssertNotEqual(slogansFirst, slogansMore)
    }

    func testTimedAgendaUsesInputRowsAndTotalsMinutes() throws {
        let output = try NativeBusinessEngine.run(tool("meeting-agenda-generator", op: "meeting-agenda"), options: ["meetingTitle":"Launch review", "agendaItems":"Metrics review | 10\nDecision log | 20"])
        XCTAssertTrue(output.contains("1. Metrics review (10 min)"))
        XCTAssertTrue(output.contains("2. Decision log (20 min)"))
        XCTAssertTrue(output.contains("Timing total: 30 minutes"))
    }

    func testSignatureIncludesOptionalProfileLinksAndEscapesText() throws {
        let output = try NativeBusinessEngine.run(tool("email-signature"), options: ["name":"A <B>", "email":"a@example.com", "website":"https://example.com", "socialLink":"https://social.example/profile"])
        XCTAssertTrue(output.contains("A &lt;B&gt;"))
        XCTAssertTrue(output.contains("href=\"https://example.com\""))
        XCTAssertTrue(output.contains("https://social.example/profile"))
    }

    func testZeroSaaSChurnDoesNotClaimFiniteLifetimeValue() throws {
        let output = try NativeBusinessEngine.run(tool("customer-lifetime-value"), options: ["a":"50", "ltvModel":"saas", "grossMarginPct":"80", "monthlyChurnPct":"0"])
        XCTAssertTrue(output.contains("Not finite: monthly churn must be above 0%"))
        XCTAssertTrue(output.contains("Set monthly churn above 0%"))
    }

    func testExactFiveTimesRatioStaysInThreeToFivePlanningBand() throws {
        let output = try NativeBusinessEngine.run(tool("customer-acquisition-cost"), options: ["a":"5000", "b":"100", "ltv":"250"])
        XCTAssertTrue(output.contains("LTV:CAC: 5.00×"))
        XCTAssertTrue(output.contains("3–5×: commonly used as a healthy planning band"))
    }

    func testSaaSLifetimeValueIncludesGrossProfitLtvRatioBandAndPayback() throws {
        let result = try NativeBusinessEngine.run(tool("customer-lifetime-value"), options: ["a":"50", "d":"100", "ltvModel":"saas", "grossMarginPct":"80", "monthlyChurnPct":"5"])
        XCTAssertTrue(result.contains("LTV: 800.00"))
        XCTAssertTrue(result.contains("LTV:CAC: 8.00×"))
        XCTAssertTrue(result.contains("Monthly contribution: 40.00"))
        XCTAssertTrue(result.contains("CAC payback: 2.5 months"))
        XCTAssertTrue(result.contains(">5×: strong"))
    }

    func testNonFiniteNumericTextUsesSafeDefault() throws {
        let result = try NativeBusinessEngine.run(tool("commission"), options: ["a":"nan", "b":"8"])
        XCTAssertTrue(result.contains("Commission: 80.00"))
    }

    func testRecurringRevenueAndExpenseInputsAreBoundedAndLabeled() throws {
        let revenue = try NativeBusinessEngine.run(tool("recurring-revenue"), options: ["a":"-100", "b":"-15"])
        XCTAssertTrue(revenue.contains("Monthly recurring revenue (MRR): 0.00"))
        XCTAssertTrue(revenue.contains("Annual recurring revenue (ARR): 0.00"))
        XCTAssertTrue(revenue.contains("Annual growth rate: -15.00%"))
        let expenses = try NativeBusinessEngine.run(tool("expense"), options: ["a":"100", "b":"-200", "c":"300", "d":"0", "e":"20"])
        XCTAssertTrue(expenses.contains("Operating expenses: 100.00"))
        XCTAssertTrue(expenses.contains("Payroll: 0.00"))
        XCTAssertTrue(expenses.contains("Total expense: 420.00"))
        XCTAssertTrue(expenses.contains("Average across five lines: 84.00"))
    }

}
