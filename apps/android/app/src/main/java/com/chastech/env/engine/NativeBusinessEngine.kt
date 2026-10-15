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
    private fun htmlEscape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
    fun run(tool: ToolRecord, options: JSONObject): String {
        val op = operation(tool); val a=n(options,"a",1000.0); val b=n(options,"b",600.0); val c=n(options,"c",50.0); val d=n(options,"d",10.0); val e=n(options,"e",12.0)
        return when (op) {
            "roi" -> "ROI\n\nROI: ${if (b != 0.0) ((a-b)/b*100).toFixed(2) else "0.00"}%\nReturn: ${money(a-b)}\n\nFormula: (Return − Investment) ÷ Investment × 100"
            "break-even" -> { val margin=a-c; val fixed=maxOf(0.0,b); val target=maxOf(0.0,n(options,"targetProfit",0.0)); val possible=a>c && a>0 && c>=0; val units=if(possible) ceil((fixed+target)/margin) else 0.0; val breakEvenUnits=if(possible) ceil(fixed/margin) else 0.0; "Break-even\n\nFixed costs: ${money(fixed)}\nSelling price per unit: ${money(a)}\nVariable cost per unit: ${money(c)}\nContribution margin per unit: ${if(possible) money(margin) else "—"}\nBreak-even units: ${if(possible) breakEvenUnits.toInt().toString() else "Not possible: selling price must exceed non-negative variable cost"}\nBreak-even revenue: ${if(possible) money(breakEvenUnits*a) else "—"}\nContribution margin ratio: ${if(possible) "%.2f".format(Locale.US, margin/a*100)+"%" else "—"}\nUnits for target profit (${money(target)}): ${if(possible) units.toInt().toString() else "—"}\n\nFormula: Fixed costs ÷ (Selling price per unit − Variable cost per unit); target units = (fixed costs + target profit) ÷ contribution margin. Single-product estimate; units rounded up." }
            "commission" -> "Commission\n\nCommission: ${money(a*b/100)}\nAfter commission: ${money(a-a*b/100)}"
            "pricing", "markup" -> "Pricing\n\nSelling price: ${money(a*(1+b/100))}\nProfit: ${money(a*b/100)}"
            "cash-flow" -> "Cash flow\n\nNet cash flow: ${money(a-b)}\nEnding cash: ${money(c+a-b)}"
            "salary" -> "Salary\n\nGross annual: ${money(a)}\nMonthly: ${money(a/12)}\nWeekly: ${money(a/52)}\nHourly (40h): ${money(a/2080)}"
            "customer-lifetime-value" -> { val ltv=a*b*c; val cac=if(options.has("d") || options.has("cac")) n(options,"cac",n(options,"d",0.0)) else 0.0; val ratio=if(cac>0) ltv/cac else 0.0; val monthlyContribution=maxOf(0.0,n(options,"monthlyContribution",0.0)); val payback=if(cac>0 && monthlyContribution>0) cac/monthlyContribution else 0.0; val band=when { cac<=0 -> "Add CAC to assess acquisition efficiency"; ratio<1 -> "Below 1×: value does not cover acquisition cost"; ratio<3 -> "1–3×: weak; improve unit economics"; ratio<5 -> "3–5×: commonly considered healthy"; else -> ">5×: strong; validate assumptions" }; "Customer lifetime value\n\nLTV: ${money(ltv)}\nLTV:CAC: ${if(cac>0) "%.2f".format(Locale.US,ratio)+"×" else "—"}\nHealth: $band\nCAC payback: ${if(payback>0) "%.1f months".format(Locale.US,payback) else "—"}\n\nMethod: Average order value × purchases per period × lifespan. Payback = CAC ÷ monthly contribution; align periods and use contribution rather than revenue." }
            "customer-acquisition-cost" -> { val cac=if(a>0 && b>0) a/b else 0.0; val ltv=if(options.has("ltv")) n(options,"ltv",0.0) else if(options.has("d")) n(options,"d",0.0) else 0.0; val ratio=if(cac>0 && ltv>0) ltv/cac else 0.0; val monthlyContribution=maxOf(0.0,n(options,"monthlyContribution",0.0)); val payback=if(cac>0 && monthlyContribution>0) cac/monthlyContribution else 0.0; val health=when { cac<=0 || ltv<=0 -> "Add valid positive LTV and CAC inputs"; ratio<1 -> "Below 1×: LTV does not cover acquisition cost"; ratio<3 -> "1–3×: weak; review acquisition efficiency"; ratio<5 -> "3–5×: commonly used as a healthy planning band"; else -> ">5×: strong ratio; validate growth and retention assumptions" }; "Customer acquisition cost\n\nCAC: ${if(cac>0) money(cac) else "—"}\nLTV:CAC: ${if(ratio>0) "%.2f".format(Locale.US,ratio)+"×" else "—"}\nHealth: $health\nCAC payback: ${if(payback>0) "%.1f months".format(Locale.US,payback) else "—"}\n\nFormula: acquisition spend ÷ new customers; LTV:CAC = LTV ÷ CAC; payback months = CAC ÷ monthly contribution per new customer. Bands are directional heuristics, not universal benchmarks." }
            "recurring-revenue" -> "Recurring revenue\n\nMRR: ${money(a)}\nARR: ${money(a*12)}\nAnnual growth: ${"%.2f".format(Locale.US,b)}%"
            "expense" -> "Expense\n\nTotal expense: ${money(a+b+c+d+e)}\nAverage: ${money((a+b+c+d+e)/5)}"
            "inventory" -> "Inventory\n\nInventory value: ${money(a*b)}\nReorder quantity: ${money(c)}"
            "discount" -> "Discount\n\nDiscount: ${money(a*b/100)}\nFinal price: ${money(a-a*b/100)}"
            "margin", "profit" -> "Profit / margin\n\nProfit: ${money(a-b)}\nMargin: ${if(a!=0.0) "%.2f".format(Locale.US,(a-b)/a*100) else "0.00"}%"
            "business-name", "company-name", "brand-name" -> listOf("${s(options,"seed","technology")} Labs","Nova ${s(options,"seed","technology")}","${s(options,"seed","technology")} Works","Bright ${s(options,"seed","technology")}","${s(options,"seed","technology")} Studio").joinToString("\n")
            "product-name" -> listOf("${s(options,"seed","technology")} Pro","Nova ${s(options,"seed","technology")}","${s(options,"seed","technology")} Flow","${s(options,"seed","technology")} Plus").joinToString("\n")
            "slogan" -> listOf("${s(options,"seed","technology")}: Built for ${s(options,"audience","customers") }.","Make ${s(options,"seed","technology")} simpler.","Better ${s(options,"seed","technology")}, without the busywork.").joinToString("\n")
            "sku" -> (1..8).joinToString("\n") { "${s(options,"seed","SKU").take(3).uppercase(Locale.US).padEnd(3,'X')}-${it.toString().padStart(3,'0')}" }
            "agenda", "meeting-agenda" -> listOf("MEETING AGENDA","Title: ${s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning"))}","Date/time: ${s(options,"dateTime","Add date and time")}","Location/link: ${s(options,"location","Add location or meeting link")}","Goal: ${s(options,"meetingGoal","Weekly planning")}","Attendees: ${s(options,"attendees","Team")}","","1. Welcome & objectives (5 min)","2. ${s(options,"meetingGoal","Weekly planning")} (15 min)","3. Progress updates (10 min)","4. Decisions & blockers (10 min)","5. Owners and next steps (5 min)","Prep notes: ${s(options,"prepNotes","None added")}").joinToString("\n")
            "minutes", "meeting-minutes" -> "MEETING MINUTES\nTitle: ${s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning"))}\nDate/time: ${s(options,"dateTime","Not set")}\nLocation/link: ${s(options,"location","Not set")}\nAttendees: ${s(options,"attendees","Team")}\n\nDiscussion notes:\n${s(options,"discussionNotes","- Add notes by agenda item")}\n\nDecisions:\n${s(options,"decisions","- Record decision and rationale")}\n\nAction items (owner | task | due):\n${s(options,"actionItems","- Owner: — | Task: — | Due: —")}\n\nNext meeting: ${s(options,"nextMeeting","Not scheduled")}"
            "invoice", "receipt", "quotation", "estimate", "purchase-order" -> {
                val label = op.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }
                val business = s(options,"company","Your Business"); val client = s(options,"client","Client")
                val number = s(options,"documentNumber","DOC-001"); val currency = s(options,"currency","USD")
                val fallbackQuantity = maxOf(0.0,n(options,"quantity",1.0)); val fallbackPrice = maxOf(0.0,n(options,"unitPrice",a/10.0))
                // Optional one-item-per-line format: Description | quantity | unit price.
                // Invalid rows are ignored; if none are valid, use the legacy single-item fields.
                val parsedItems = s(options,"lineItems","").lines().mapNotNull { row ->
                    val parts = row.split("|")
                    if (parts.size < 3 || parts[0].trim().isEmpty()) null else {
                        val quantity = parts[1].trim().toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: return@mapNotNull null
                        val price = parts[2].trim().toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: return@mapNotNull null
                        Triple(parts[0].trim(), quantity, price)
                    }
                }
                val items = parsedItems.ifEmpty { listOf(Triple(s(options,"description","Professional service"), fallbackQuantity, fallbackPrice)) }
                val subtotal = items.sumOf { it.second * it.third }
                val discount = subtotal*maxOf(0.0,n(options,"discountPercent",0.0)).coerceAtMost(100.0)/100.0
                val taxable = subtotal-discount; val taxAmount = taxable*maxOf(0.0,n(options,"taxPercent",0.0))/100.0
                val itemLines = items.joinToString("\n") { "${it.first} | Qty ${money(it.second)} | $currency ${money(it.third)} | Line total $currency ${money(it.second*it.third)}" }
                "$label — generated locally\nBusiness: $business\nClient: $client\nDocument: $number\nDate: ${s(options,"date","Today")}\n\nLine items:\n$itemLines\nSubtotal: $currency ${money(subtotal)}\nDiscount: -$currency ${money(discount)}\nTax: $currency ${money(taxAmount)}\nTOTAL: $currency ${money(taxable+taxAmount)}\n\nClient data remains on this device unless you explicitly export or share it."
            }
            "payslip" -> { val gross=maxOf(0.0,n(options,"gross",a)); val statutory=maxOf(0.0,n(options,"statutoryDeductions",b)); val other=maxOf(0.0,n(options,"otherDeductions",c)); "PAYSLIP — DEMO ONLY\nEmployer: ${s(options,"company","Your Business")}\nEmployee: ${s(options,"employeeName","Employee name")}\nPay period: ${s(options,"payPeriod","Pay period")}\n\nGross pay: ${money(gross)}\nTax / statutory deductions: -${money(statutory)}\nOther deductions: -${money(other)}\nNet pay: ${money(gross-statutory-other)}\n\nIllustrative layout only; verify local payroll and statutory requirements." }
            "email-signature" -> { val name=s(options,"name","Alex Morgan"); val role=s(options,"role","Founder"); val email=s(options,"email","hello@example.com"); val company=s(options,"company","Your Business"); val phone=s(options,"phone",""); val website=s(options,"website",""); val safeWebsite = if (website.startsWith("https://", true) || website.startsWith("http://", true)) website else ""; val html="<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"font-family:Arial,sans-serif;font-size:13px;color:#222\"><tr><td style=\"padding-right:12px\"><strong>${htmlEscape(name)}</strong><br>${htmlEscape(role)}<br>${htmlEscape(company)}</td><td style=\"border-left:2px solid #888;padding-left:12px\">${htmlEscape(email)}${if(phone.isNotBlank()) "<br>${htmlEscape(phone)}" else ""}${if(website.isNotBlank() && safeWebsite.isNotBlank()) "<br><a href=\"${htmlEscape(safeWebsite)}\">${htmlEscape(website)}</a>" else if(website.isNotBlank()) "<br>${htmlEscape(website)}" else ""}</td></tr></table>"; "$name | $role\n$email\n$company\n${if(phone.isNotBlank()) "Phone: $phone\n" else ""}${if(website.isNotBlank()) "Website: $website\n" else ""}\nHTML signature (inline styles; no remote images):\n$html\n\nHTML output is a starting point. Verify formatting in your target email clients; clients may sanitize pasted HTML." }
            else -> throw IllegalArgumentException("Unsupported business operation: $op")
        }
    }
    private fun Double.toFixed(digits: Int): String = String.format(Locale.US, "%.${digits}f", this)
}
