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

    @Test fun payslipIsClearlyALabeledDemoWithNetPay() {
        val result = NativeBusinessEngine.run(tool("payslip", "payslip"), JSONObject().put("gross", 3000).put("statutoryDeductions", 300).put("otherDeductions", 100))
        assertTrue(result.contains("PAYSLIP — DEMO ONLY"))
        assertTrue(result.contains("Net pay: 2,600.00"))
        assertTrue(!result.contains("Bill to:"))
    }
}
