package com.chastech.env.engine

import com.chastech.env.data.ToolRecord
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.ceil

/** Native port of the web BusinessEngine. No generic/template fallback is used. */
object NativeBusinessEngine {
    private val operations = setOf("roi","break-even","commission","pricing","markup","cash-flow","salary","customer-lifetime-value","customer-acquisition-cost","recurring-revenue","expense","inventory","discount","margin","profit","business-name","company-name","brand-name","product-name","slogan","sku","agenda","minutes","email-signature","invoice","receipt","quotation","estimate","purchase-order","payslip","meeting-agenda","meeting-minutes")
    fun supports(tool: ToolRecord): Boolean = tool.engine.type == "business" && operation(tool) in operations
    private fun operation(tool: ToolRecord): String = tool.engine.extras["op"] ?: tool.engine.id
    private fun n(o: JSONObject, key: String, default: Double): Double = o.optDouble(key, default).takeIf { it.isFinite() } ?: default
    private fun s(o: JSONObject, key: String, default: String): String = o.optString(key, default).ifBlank { default }
    private fun money(v: Double): String = NumberFormat.getNumberInstance(Locale.US).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(v)
    fun run(tool: ToolRecord, options: JSONObject): String {
        val op = operation(tool); val a=n(options,"a",1000.0); val b=n(options,"b",600.0); val c=n(options,"c",50.0); val d=n(options,"d",10.0); val e=n(options,"e",12.0)
        return when (op) {
            "roi" -> "ROI\n\nROI: ${if (b != 0.0) ((a-b)/b*100).toFixed(2) else "0.00"}%\nReturn: ${money(a-b)}\n\nFormula: (Return − Investment) ÷ Investment × 100"
            "break-even" -> { val margin=a-c; "Break-even\n\nBreak-even units: ${if(margin>0) ceil(b/margin).toInt().toString() else "—"}\nBreak-even revenue: ${if(margin>0) money(b/margin*a) else "—"}\n\nFormula: Fixed costs ÷ (Price − Variable cost)" }
            "commission" -> "Commission\n\nCommission: ${money(a*b/100)}\nAfter commission: ${money(a-a*b/100)}"
            "pricing", "markup" -> "Pricing\n\nSelling price: ${money(a*(1+b/100))}\nProfit: ${money(a*b/100)}"
            "cash-flow" -> "Cash flow\n\nNet cash flow: ${money(a-b)}\nEnding cash: ${money(c+a-b)}"
            "salary" -> "Salary\n\nGross annual: ${money(a)}\nMonthly: ${money(a/12)}\nWeekly: ${money(a/52)}\nHourly (40h): ${money(a/2080)}"
            "customer-lifetime-value" -> "Customer lifetime value\n\nLTV: ${money(a*b*c)}\nLTV:CAC: ${if(d!=0.0) "%.2f".format(Locale.US,a*b*c/d)+"×" else "—"}"
            "customer-acquisition-cost" -> "Customer acquisition cost\n\nCAC: ${if(b!=0.0) money(a/b) else "—"}\nLTV:CAC: ${if(a!=0.0) "%.2f".format(Locale.US,d/(if(b!=0.0)a/b else 1.0))+"×" else "—"}"
            "recurring-revenue" -> "Recurring revenue\n\nMRR: ${money(a)}\nARR: ${money(a*12)}\nAnnual growth: ${"%.2f".format(Locale.US,b)}%"
            "expense" -> "Expense\n\nTotal expense: ${money(a+b+c+d+e)}\nAverage: ${money((a+b+c+d+e)/5)}"
            "inventory" -> "Inventory\n\nInventory value: ${money(a*b)}\nReorder quantity: ${money(c)}"
            "discount" -> "Discount\n\nDiscount: ${money(a*b/100)}\nFinal price: ${money(a-a*b/100)}"
            "margin", "profit" -> "Profit / margin\n\nProfit: ${money(a-b)}\nMargin: ${if(a!=0.0) "%.2f".format(Locale.US,(a-b)/a*100) else "0.00"}%"
            "business-name", "company-name", "brand-name" -> listOf("${s(options,"seed","technology")} Labs","Nova ${s(options,"seed","technology")}","${s(options,"seed","technology")} Works","Bright ${s(options,"seed","technology")}","${s(options,"seed","technology")} Studio").joinToString("\n")
            "product-name" -> listOf("${s(options,"seed","technology")} Pro","Nova ${s(options,"seed","technology")}","${s(options,"seed","technology")} Flow","${s(options,"seed","technology")} Plus").joinToString("\n")
            "slogan" -> listOf("${s(options,"seed","technology")}: Built for ${s(options,"audience","customers") }.","Make ${s(options,"seed","technology")} simpler.","Better ${s(options,"seed","technology")}, without the busywork.").joinToString("\n")
            "sku" -> (1..8).joinToString("\n") { "${s(options,"seed","SKU").take(3).uppercase(Locale.US).padEnd(3,'X')}-${it.toString().padStart(3,'0')}" }
            "agenda", "meeting-agenda" -> listOf("1. Welcome & objectives","2. ${s(options,"meetingGoal","Weekly planning")}","3. Progress updates","4. Decisions & blockers","5. Owners and next steps","6. Recap & close").joinToString("\n")
            "minutes", "meeting-minutes" -> "Meeting: ${s(options,"meetingGoal","Weekly planning")}\nAttendees: ${s(options,"attendees","Team")}\n\nDecisions:\n- \n\nAction items:\n- Owner — Task — Due date\n\nNext meeting:"
            "email-signature" -> "${s(options,"name","Alex Morgan")} | ${s(options,"role","Founder")}\n${s(options,"email","hello@example.com")}\n${s(options,"company","Your Business")}\nPhone: __________________\nWebsite: __________________"
            else -> throw IllegalArgumentException("Unsupported business operation: $op")
        }
    }
    private fun Double.toFixed(digits: Int): String = String.format(Locale.US, "%.${digits}f", this)
}
