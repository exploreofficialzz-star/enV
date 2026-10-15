package com.chastech.env.engine

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeBusinessEngineTest {
    private fun tool(id: String, op: String = id) = ToolRecord(
        id = id, name = id, slug = id, description = "", category = "business",
        keywords = emptyList(), tags = emptyList(), icon = "Briefcase", popularity = 0,
        featured = false, clientSide = true, requiresBackend = false, requiresAuth = false,
        status = "active", related = emptyList(), engine = EngineInfo("business", id, mapOf("op" to op)),
    )

    @Test fun studioModeOverrideRunsSelectedOperationInsteadOfAnchorTool() {
        val anchor = tool("invoice", "invoice")
        val result = NativeBusinessEngine.run(anchor, JSONObject().put("a", 50000).put("b", 8), operationOverride = "commission")
        assertTrue(result.contains("Commission: 4,000.00"))
        assertTrue(!result.contains("Subtotal:"))
    }

    @Test fun breakEvenRejectsImpossibleUnitEconomics() {
        val result = NativeBusinessEngine.run(tool("break-even"), JSONObject().put("a", 10).put("b", 1000).put("c", 15))
        assertTrue(result.contains("Not possible"))
        assertTrue(result.contains("Selling price per unit"))
    }

    @Test fun breakEvenRoundsUpRevenueAndSupportsTargetProfit() {
        val result = NativeBusinessEngine.run(tool("break-even"), JSONObject().put("a", 50).put("b", 10000).put("c", 30).put("targetProfit", 5000))
        assertTrue(result.contains("Break-even units: 500"))
        assertTrue(result.contains("Break-even revenue: 25,000.00"))
        assertTrue(result.contains("Units for target profit (5,000.00): 750"))
    }

    @Test fun cacDoesNotInventLtvAndCalculatesPaybackOnlyWithContribution() {
        val withoutLtv = NativeBusinessEngine.run(tool("customer-acquisition-cost"), JSONObject().put("a", 5000).put("b", 100).put("monthlyContribution", 10))
        assertTrue(withoutLtv.contains("CAC: 50.00"))
        assertTrue(withoutLtv.contains("LTV:CAC: —"))
        assertTrue(withoutLtv.contains("CAC payback: 5.0 months"))
        val withLtv = NativeBusinessEngine.run(tool("customer-acquisition-cost"), JSONObject().put("a", 5000).put("b", 100).put("ltv", 250).put("monthlyContribution", 10))
        assertTrue(withLtv.contains("LTV:CAC: 5.00×"))
    }

    @Test fun meetingTemplatesAreOperationsNotFinanceCalculators() {
        val agenda = NativeBusinessEngine.run(tool("meeting-agenda-generator", "meeting-agenda"), JSONObject().put("meetingTitle", "Q4 sales review"))
        val minutes = NativeBusinessEngine.run(tool("meeting-minutes-generator", "meeting-minutes"), JSONObject())
        assertTrue(agenda.contains("MEETING AGENDA"))
        assertTrue(agenda.contains("Q4 sales review"))
        assertTrue(!agenda.contains("Revenue / amount"))
        assertTrue(minutes.contains("Decisions:"))
        assertTrue(minutes.contains("Action items (owner | task | due):"))
        assertTrue(!minutes.contains("Revenue / amount"))
    }

    @Test fun nativeDocumentsSupportMultipleLineItemsAndCorrectTotals() {
        val result = NativeBusinessEngine.run(tool("invoice"), JSONObject().put("lineItems", "Design | 2 | 250\nHosting | 1 | 250").put("taxPercent", 7.5).put("discountPercent", 0))
        assertTrue(result.contains("Design | Qty 2.00 | USD 250.00 | Line total USD 500.00"))
        assertTrue(result.contains("Subtotal: USD 750.00"))
        assertTrue(result.contains("Tax: USD 56.25"))
        assertTrue(result.contains("TOTAL: USD 806.25"))
    }

    @Test fun blankEditableDocumentRowsDoNotInventAServiceOrTotal() {
        val result = NativeBusinessEngine.run(tool("invoice"), JSONObject().put("lineItems", " | 1 | 0").put("taxPercent", 7.5))
        assertTrue(result.contains("(No valid line items entered)"))
        assertTrue(result.contains("Subtotal: USD 0.00"))
        assertTrue(result.contains("TOTAL: USD 0.00"))
        assertTrue(!result.contains("Professional service |"))
    }

    @Test fun payslipIsClearlyALabeledDemoWithNetPay() {
        val result = NativeBusinessEngine.run(tool("payslip", "payslip"), JSONObject().put("gross", 3000).put("statutoryDeductions", 300).put("otherDeductions", 100))
        assertTrue(result.contains("PAYSLIP — DEMO ONLY"))
        assertTrue(result.contains("Net pay: 2,600.00"))
        assertTrue(!result.contains("Bill to:"))
    }
    @Test fun namingModesCreateFilteredDistinctPagesAndSlogansAdvance() {
        val namesTool = tool("business-name")
        val descriptive = NativeBusinessEngine.run(namesTool, JSONObject().put("seed", "solar energy").put("namingStyle", "descriptive"))
        val compound = NativeBusinessEngine.run(namesTool, JSONObject().put("seed", "solar energy").put("namingStyle", "compound"))
        val more = NativeBusinessEngine.run(namesTool, JSONObject().put("seed", "solar energy").put("namingStyle", "descriptive").put("generationOffset", 1))
        assertTrue(descriptive.lines().size >= 24)
        assertTrue(descriptive != compound)
        assertTrue(descriptive != more)
        val filtered = NativeBusinessEngine.run(namesTool, JSONObject().put("seed", "solar energy").put("namingStyle", "short-brandable").put("maxNameLength", 12).put("nameBlacklist", "solar,energy"))
        assertTrue(filtered.lines().all { it.length <= 12 && !it.contains("solar", true) && !it.contains("energy", true) })
        val slogansFirst = NativeBusinessEngine.run(tool("slogan"), JSONObject().put("seed", "solar").put("audience", "homeowners"))
        val slogansMore = NativeBusinessEngine.run(tool("slogan"), JSONObject().put("seed", "solar").put("audience", "homeowners").put("generationOffset", 1))
        assertTrue(slogansFirst.lines().size >= 24)
        assertTrue(slogansFirst != slogansMore)
    }

    @Test fun timedAgendaUsesInputRowsAndTotalsMinutes() {
        val result = NativeBusinessEngine.run(tool("meeting-agenda-generator", "meeting-agenda"), JSONObject()
            .put("meetingTitle", "Launch review")
            .put("agendaItems", "Metrics review | 10\nDecision log | 20"))
        assertTrue(result.contains("1. Metrics review (10 min)"))
        assertTrue(result.contains("2. Decision log (20 min)"))
        assertTrue(result.contains("Timing total: 30 minutes"))
    }

    @Test fun emailSignatureIncludesOptionalSafeProfileLinksAndEscapesText() {
        val result = NativeBusinessEngine.run(tool("email-signature"), JSONObject()
            .put("name", "A <B>")
            .put("email", "a@example.com")
            .put("website", "https://example.com")
            .put("socialLink", "https://social.example/profile"))
        assertTrue(result.contains("A &lt;B&gt;"))
        assertTrue(result.contains("href=\"https://example.com\""))
        assertTrue(result.contains("https://social.example/profile"))
    }

    @Test fun zeroSaaSChurnDoesNotClaimFiniteLifetimeValue() {
        val result = NativeBusinessEngine.run(tool("customer-lifetime-value"), JSONObject()
            .put("a", 50).put("ltvModel", "saas").put("grossMarginPct", 80).put("monthlyChurnPct", 0))
        assertTrue(result.contains("Not finite: monthly churn must be above 0%"))
        assertTrue(result.contains("Set monthly churn above 0%"))
    }

    @Test fun exactFiveTimesRatioStaysInThreeToFivePlanningBand() {
        val result = NativeBusinessEngine.run(tool("customer-acquisition-cost"), JSONObject()
            .put("a", 5000).put("b", 100).put("ltv", 250))
        assertTrue(result.contains("LTV:CAC: 5.00×"))
        assertTrue(result.contains("3–5×: commonly used as a healthy planning band"))
    }

    @Test fun saasLifetimeValueIncludesGrossProfitLtvRatioBandAndPayback() {
        val result = NativeBusinessEngine.run(tool("customer-lifetime-value"), JSONObject().put("a", 50).put("d", 100).put("ltvModel", "saas").put("grossMarginPct", 80).put("monthlyChurnPct", 5))
        assertTrue(result.contains("LTV: 800.00"))
        assertTrue(result.contains("LTV:CAC: 8.00×"))
        assertTrue(result.contains("Monthly contribution: 40.00"))
        assertTrue(result.contains("CAC payback: 2.5 months"))
        assertTrue(result.contains(">5×: strong"))
    }

    @Test fun recurringRevenueAndExpenseInputsAreBoundedAndLabeled() {
        val revenue = NativeBusinessEngine.run(tool("recurring-revenue"), JSONObject().put("a", -100).put("b", -15))
        assertTrue(revenue.contains("Monthly recurring revenue (MRR): 0.00"))
        assertTrue(revenue.contains("Annual recurring revenue (ARR): 0.00"))
        assertTrue(revenue.contains("Annual growth rate: -15.00%"))
        val expenses = NativeBusinessEngine.run(tool("expense"), JSONObject().put("a", 100).put("b", -200).put("c", 300).put("d", 0).put("e", 20))
        assertTrue(expenses.contains("Operating expenses: 100.00"))
        assertTrue(expenses.contains("Payroll: 0.00"))
        assertTrue(expenses.contains("Total expense: 420.00"))
        assertTrue(expenses.contains("Average across five lines: 84.00"))
    }

}
