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
    private val nameAdjectives = listOf("Bright", "Atlas", "Clear", "True", "Ember", "Swift", "Green", "Blue", "Noble", "Open", "Bold", "Keen", "Lumen", "Kind", "Prime", "Ever", "Urban", "Golden", "Silver", "Calm", "Rapid", "Mosaic", "Able", "Fresh")
    private val nameNouns = listOf("Works", "Forge", "Harbor", "Grove", "Arc", "Peak", "Grid", "Foundry", "Craft", "Field", "Beacon", "Nest", "Rise", "Trail", "Root", "Pulse", "Bridge", "Labs", "Link", "Stack", "Orbit", "Bloom", "Horizon", "Canvas", "Engine", "Collective", "Market", "Studio", "Path", "Current")
    private val namePrefixes = listOf("get", "try", "use", "neo", "ever", "open", "hyper", "meta", "omni", "terra", "luma", "nexa", "aero", "kin", "nova", "heli", "unify", "bright", "true", "blue", "clear", "prime", "urban", "north")
    private val nameEndings = listOf("ly", "io", "ora", "ify", "wise", "works", "flow", "base", "hive", "verse", "nest", "path", "grid", "beam", "loop", "forge", "craft", "spark", "pulse", "pilot", "shift", "scope", "well", "field")
    private fun titleName(value: String): String = value.split(Regex("\\s+")).filter { it.isNotBlank() }.joinToString(" ") { it.replaceFirstChar { c -> c.titlecase(Locale.US) } }
    private fun cleanName(value: String): String = value.lowercase(Locale.US).replace(Regex("[^a-z0-9 ]+"), " ").replace(Regex("\\s+"), " ").trim()
    private fun blendName(left: String, right: String): String {
        val a = left.lowercase(Locale.US).filter { it.isLetter() }; val b = right.lowercase(Locale.US).filter { it.isLetter() }
        if (a.isEmpty()) return b; if (b.isEmpty()) return a
        for (n in minOf(3, a.length - 2, b.length - 2) downTo 1) if (a.takeLast(n) == b.take(n)) return a + b.drop(n)
        return a.take(maxOf(2, kotlin.math.ceil(a.length * .62).toInt())) + b.drop(maxOf(1, (b.length * .38).toInt()))
    }
    private fun generatedNames(options: JSONObject): String {
        val seed = cleanName(s(options, "seed", "technology")).ifBlank { "business" }
        val tokens = seed.split(" ").filter { it.isNotBlank() }.take(5)
        val displaySeed = titleName(seed)
        val style = s(options, "namingStyle", "descriptive")
        val maxLength = n(options, "maxNameLength", 32.0).toInt().coerceIn(8, 60)
        val count = n(options, "nameCount", 32.0).toInt().coerceIn(24, 48)
        val offset = n(options, "generationOffset", 0.0).toInt().coerceAtLeast(0) * count
        val blacklist = s(options, "nameBlacklist", "").split(Regex("[,;|\\s]+")).map { cleanName(it) }.filter { it.isNotBlank() }
        val candidates = mutableListOf<String>()
        fun add(value: String) { val clean = value.replace(Regex("\\s+"), " ").trim(); if (clean.isNotEmpty()) candidates.add(clean) }
        when (style) {
            "compound" -> {
                for (token in tokens) { for (noun in nameNouns) add(titleName(token) + titleName(noun)); for (adj in nameAdjectives) add(titleName(adj) + titleName(token)) }
                for (i in 0 until (tokens.size - 1).coerceAtLeast(0)) add(titleName(blendName(tokens[i], tokens[i + 1])))
                for (adj in nameAdjectives) for (noun in nameNouns) add(titleName(blendName(adj, noun)))
            }
            "prefix-suffix" -> {
                for (token in tokens) { for (prefix in namePrefixes) add("${titleName(prefix)} ${titleName(token)}"); for (ending in nameEndings) { add("${titleName(token)} ${titleName(ending)}"); add(token + ending) } }
                for (prefix in namePrefixes) for (ending in nameEndings) add(titleName(prefix) + titleName(ending))
            }
            "short-brandable" -> {
                for (token in tokens) { for (ending in nameEndings) add(token + ending); for (prefix in namePrefixes) add(prefix + token); for (noun in nameNouns) add(blendName(token, noun)) }
                for (adj in nameAdjectives) for (noun in nameNouns) add(blendName(adj, noun))
            }
            else -> {
                for (i in 0 until maxOf(nameNouns.size, nameAdjectives.size)) { if (i < nameNouns.size) add("$displaySeed ${nameNouns[i]}"); if (i < nameAdjectives.size) add("${nameAdjectives[i]} $displaySeed") }
                for (token in tokens) { for (noun in nameNouns) add("${titleName(token)} $noun"); for (adj in nameAdjectives) add("$adj ${titleName(token)}") }
                for (adj in nameAdjectives) for (noun in nameNouns) add("$adj $noun")
            }
        }
        val seen = mutableSetOf<String>()
        val names = candidates.filter { it.length <= maxLength && it.length >= 2 && blacklist.none { word -> it.lowercase(Locale.US).contains(word) } && seen.add(it.lowercase(Locale.US)) }
        if (names.isEmpty()) return "No names match these filters. Increase maximum length or remove an exclusion word."
        val start = offset % names.size
        return (names.drop(start) + names.take(start)).take(count).joinToString("\n")
    }
    private fun generatedSlogans(options: JSONObject): String {
        val seed = cleanName(s(options, "seed", "your work")).ifBlank { "your work" }
        val audience = cleanName(s(options, "audience", "customers")).ifBlank { "customers" }
        val frames = listOf(
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
        ).map { it.replace("{seed}", seed).replace("{audience}", audience) }
        val start = (n(options, "generationOffset", 0.0).toInt().coerceAtLeast(0) * 24) % frames.size
        return (frames.drop(start) + frames.take(start)).take(24).joinToString("\n")
    }

    private fun generatedAgenda(options: JSONObject): String {
        val parsed = s(options, "agendaItems", "").lines().mapNotNull { line ->
            val fields = line.split("|")
            if (fields.size < 2 || fields[0].isBlank()) null else {
                val minutes = fields[1].trim().toIntOrNull()?.takeIf { it in 1..480 } ?: return@mapNotNull null
                fields[0].trim() to minutes
            }
        }
        val items = parsed.ifEmpty { listOf("Welcome and objectives" to 5, "Progress updates" to 10, "Decisions and blockers" to 15, "Actions and next steps" to 5) }
        val lines = items.mapIndexed { index, item -> "${index + 1}. ${item.first} (${item.second} min)" }
        return (listOf("MEETING AGENDA", "Title: ${s(options, "meetingTitle", s(options, "meetingGoal", "Weekly planning"))}", "Date/time: ${s(options, "dateTime", "Add date and time")}", "Location/link: ${s(options, "location", "Add location or meeting link")}", "Goal: ${s(options, "meetingGoal", "Weekly planning")}", "Attendees: ${s(options, "attendees", "Team")}", "", "Timed agenda items:") + lines + listOf("Timing total: ${items.sumOf { it.second }} minutes", "Prep notes: ${s(options, "prepNotes", "None added")}")).joinToString("\n")
    }
    fun run(tool: ToolRecord, options: JSONObject, operationOverride: String? = null): String {
        val op = operationOverride ?: operation(tool)
        require(op in operations) { "Unsupported Business Studio mode: $op" }
        val a=n(options,"a",1000.0); val b=n(options,"b",600.0); val c=n(options,"c",50.0); val d=n(options,"d",10.0); val e=n(options,"e",12.0)
        return when (op) {
            "roi" -> { val value=maxOf(0.0,a); val investment=maxOf(0.0,b); "ROI\n\nROI: ${if (investment > 0) ((value-investment)/investment*100).toFixed(2)+"%" else "— (enter positive investment)"}\nNet return: ${money(value-investment)}\n\nFormula: (Value received − Initial investment) ÷ Initial investment × 100; undefined when investment is zero." }
            "break-even" -> { val margin=a-c; val fixed=maxOf(0.0,b); val target=maxOf(0.0,n(options,"targetProfit",0.0)); val possible=a>c && a>0 && c>=0; val units=if(possible) ceil((fixed+target)/margin) else 0.0; val breakEvenUnits=if(possible) ceil(fixed/margin) else 0.0; "Break-even\n\nFixed costs: ${money(fixed)}\nSelling price per unit: ${money(a)}\nVariable cost per unit: ${money(c)}\nContribution margin per unit: ${if(possible) money(margin) else "—"}\nBreak-even units: ${if(possible) breakEvenUnits.toInt().toString() else "Not possible: selling price must exceed non-negative variable cost"}\nBreak-even revenue: ${if(possible) money(breakEvenUnits*a) else "—"}\nContribution margin ratio: ${if(possible) "%.2f".format(Locale.US, margin/a*100)+"%" else "—"}\nUnits for target profit (${money(target)}): ${if(possible) units.toInt().toString() else "—"}\n\nFormula: Fixed costs ÷ (Selling price per unit − Variable cost per unit); target units = (fixed costs + target profit) ÷ contribution margin. Single-product estimate; units rounded up." }
            "commission" -> { val sales=maxOf(0.0,a); val rate=n(options,"b",600.0).coerceIn(0.0,100.0); val commission=sales*rate/100; "Commission\n\nSales amount: ${money(sales)}\nCommission rate: ${"%.2f".format(Locale.US,rate)}%\nCommission: ${money(commission)}\nAfter commission: ${money(sales-commission)}\n\nFormula: Sales × Rate; rate bounded to 0–100%." }
            "pricing", "markup" -> { val cost=maxOf(0.0,a); val rate=maxOf(0.0,b); "Pricing / markup\n\nUnit cost: ${money(cost)}\nMarkup rate: ${"%.2f".format(Locale.US,rate)}%\nSelling price: ${money(cost*(1+rate/100))}\nProfit: ${money(cost*rate/100)}\n\nFormula: Selling price = cost × (1 + markup). Markup is based on cost, not margin." }
            "cash-flow" -> { val inflows=maxOf(0.0,a); val outflows=maxOf(0.0,b); "Cash flow\n\nOpening cash: ${money(c)}\nCash inflows: ${money(inflows)}\nCash outflows: ${money(outflows)}\nNet cash flow: ${money(inflows-outflows)}\nEnding cash: ${money(c+inflows-outflows)}\n\nFormula: Ending cash = opening cash + inflows − outflows." }
            "salary" -> { val annual=maxOf(0.0,a); "Salary conversion (gross, before tax)\n\nGross annual: ${money(annual)}\nMonthly: ${money(annual/12)}\nWeekly: ${money(annual/52)}\nHourly (40h): ${money(annual/2080)}\n\nAnnual salary divided by standard periods; this is not take-home pay." }
            "customer-lifetime-value" -> {
                val saas = s(options, "ltvModel", "simple") == "saas"
                val margin = n(options, "grossMarginPct", 80.0).coerceIn(0.0, 100.0) / 100.0
                val churnPct = n(options, "monthlyChurnPct", 0.0).coerceIn(0.0, 100.0)
                val overrideContribution = maxOf(0.0, n(options, "monthlyContribution", 0.0))
                val monthlyContribution = if (saas) { if (overrideContribution > 0) overrideContribution else a * margin } else overrideContribution
                val ltv = if (!saas) maxOf(0.0,a)*maxOf(0.0,b)*maxOf(0.0,c) else if (churnPct > 0) (maxOf(0.0,a) * margin) / (churnPct / 100.0) else 0.0
                val cac = if(options.has("cac") || options.has("d")) n(options,"cac",n(options,"d",0.0)) else 0.0
                val ratio = if(cac>0) ltv/cac else 0.0
                val payback = if(cac>0 && monthlyContribution>0) cac/monthlyContribution else 0.0
                val band = when { saas && churnPct<=0 -> "Set monthly churn above 0% before interpreting LTV:CAC"; cac<=0 -> "Add CAC to assess acquisition efficiency"; ratio<1 -> "Below 1×: value does not cover acquisition cost"; ratio<3 -> "1–3×: weak; improve unit economics"; ratio<=5 -> "3–5×: commonly considered a planning band"; else -> ">5×: strong; validate assumptions" }
                val formula = if (saas) "Gross-profit SaaS LTV = monthly ARPU × gross margin % ÷ monthly churn % (decimals). Churn must be above 0%; assumptions are constant and exclude expansion, discounting and cohort effects." else "Revenue-based LTV = average order value × purchases per period × lifespan. Revenue-based, before gross margin."
                "Customer lifetime value\n\nLTV model: ${if(saas) "SaaS / subscription" else "Simple commerce"}\nLTV: ${if(saas && churnPct<=0) "Not finite: monthly churn must be above 0%" else money(ltv)}\nLTV:CAC: ${if(cac>0 && (!saas || churnPct>0)) "%.2f".format(Locale.US,ratio)+"×" else "—"}\nHealth: $band\nMonthly contribution: ${money(monthlyContribution)}\nCAC payback: ${if(payback>0) "%.1f months".format(Locale.US,payback) else "—"}\n\nMethod: $formula\nPayback = CAC ÷ monthly contribution. Ratio bands are directional heuristics, not universal benchmarks."
            }
            "customer-acquisition-cost" -> { val cac=if(a>0 && b>0) a/b else 0.0; val ltv=if(options.has("ltv")) n(options,"ltv",0.0) else if(options.has("d")) n(options,"d",0.0) else 0.0; val ratio=if(cac>0 && ltv>0) ltv/cac else 0.0; val monthlyContribution=maxOf(0.0,n(options,"monthlyContribution",0.0)); val payback=if(cac>0 && monthlyContribution>0) cac/monthlyContribution else 0.0; val health=when { cac<=0 || ltv<=0 -> "Add valid positive LTV and CAC inputs"; ratio<1 -> "Below 1×: LTV does not cover acquisition cost"; ratio<3 -> "1–3×: weak; review acquisition efficiency"; ratio<=5 -> "3–5×: commonly used as a healthy planning band"; else -> ">5×: strong ratio; validate growth and retention assumptions" }; "Customer acquisition cost\n\nCAC: ${if(cac>0) money(cac) else "—"}\nLTV:CAC: ${if(ratio>0) "%.2f".format(Locale.US,ratio)+"×" else "—"}\nHealth: $health\nCAC payback: ${if(payback>0) "%.1f months".format(Locale.US,payback) else "—"}\n\nFormula: acquisition spend ÷ new customers; LTV:CAC = LTV ÷ CAC; payback months = CAC ÷ monthly contribution per new customer. Bands are directional heuristics, not universal benchmarks." }
            "recurring-revenue" -> { val mrr=maxOf(0.0,a); "Recurring revenue\n\nMonthly recurring revenue (MRR): ${money(mrr)}\nAnnual recurring revenue (ARR): ${money(mrr*12)}\nAnnual growth rate: ${"%.2f".format(Locale.US,b)}%\n\nARR = non-negative MRR × 12; growth may be negative when revenue contracts." }
            "expense" -> { val lines=listOf(a,b,c,d,e).map { maxOf(0.0,it) }; val total=lines.sum(); "Expense\n\nOperating expenses: ${money(lines[0])}\nPayroll: ${money(lines[1])}\nMarketing: ${money(lines[2])}\nSoftware / tools: ${money(lines[3])}\nOther expenses: ${money(lines[4])}\nTotal expense: ${money(total)}\nAverage across five lines: ${money(total/5)}\n\nNegative expense inputs are treated as zero." }
            "inventory" -> { val units=maxOf(0.0,a); val unitCost=maxOf(0.0,b); val reorder=maxOf(0.0,c); "Inventory\n\nUnits in stock: ${money(units)}\nCost per unit: ${money(unitCost)}\nInventory value: ${money(units*unitCost)}\nReorder quantity: ${money(reorder)}\n\nFormula: non-negative units × non-negative unit cost; excludes shrinkage and valuation adjustments." }
            "discount" -> { val original=maxOf(0.0,a); val rate=maxOf(0.0,b).coerceAtMost(100.0); val value=original*rate/100; "Discount\n\nOriginal price: ${money(original)}\nDiscount rate: ${"%.2f".format(Locale.US,rate)}%\nDiscount: ${money(value)}\nFinal price: ${money(original-value)}\n\nRate bounded to 0–100%; final price cannot be negative." }
            "margin", "profit" -> { val revenue=maxOf(0.0,a); val costs=maxOf(0.0,b); val profit=revenue-costs; "Profit / margin\n\nRevenue: ${money(revenue)}\nCosts: ${money(costs)}\nProfit / loss: ${money(profit)}\nMargin: ${if(revenue>0) "%.2f".format(Locale.US,profit/revenue*100)+"%" else "—"}\n\nMargin is undefined when revenue is zero." }
            "business-name", "company-name", "brand-name", "product-name" -> generatedNames(options)
            "slogan" -> generatedSlogans(options)
            "sku" -> { val prefix = cleanName(s(options,"seed","SKU")).replace(" ", "").take(6).uppercase(Locale.US).ifBlank { "SKU" }.padEnd(3,'X'); val start = n(options,"generationOffset",0.0).toInt().coerceAtLeast(0)*24; (1..24).joinToString("\n") { "${prefix}-${(start+it).toString().padStart(3,'0')}" } }
            "agenda", "meeting-agenda" -> generatedAgenda(options)
            "minutes", "meeting-minutes" -> "MEETING MINUTES\nTitle: ${s(options,"meetingTitle",s(options,"meetingGoal","Weekly planning"))}\nDate/time: ${s(options,"dateTime","Not set")}\nLocation/link: ${s(options,"location","Not set")}\nAttendees: ${s(options,"attendees","Team")}\n\nDiscussion notes:\n${s(options,"discussionNotes","- Add notes by agenda item")}\n\nDecisions:\n${s(options,"decisions","- Record decision and rationale")}\n\nAction items (owner | task | due):\n${s(options,"actionItems","- Owner: — | Task: — | Due: —")}\n\nNext meeting: ${s(options,"nextMeeting","Not scheduled")}"
            "invoice", "receipt", "quotation", "estimate", "purchase-order" -> {
                val label = op.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }
                val business = s(options,"company","Your Business"); val client = s(options,"client","Client")
                val number = s(options,"documentNumber","DOC-001"); val currency = s(options,"currency","USD")
                val fallbackQuantity = maxOf(0.0,n(options,"quantity",1.0)); val fallbackPrice = maxOf(0.0,n(options,"unitPrice",a/10.0))
                // Optional one-item-per-line format: Description | quantity | unit price.
                // When the native form supplied editable line items, an empty/invalid set must total zero,
                // not silently fall back to a demo service. Legacy single-item fields are used only when
                // the caller did not supply the lineItems option at all.
                val hasLineItemsInput = options.has("lineItems")
                val parsedItems = s(options,"lineItems","").lines().mapNotNull { row ->
                    val parts = row.split("|")
                    if (parts.size < 3 || parts[0].trim().isEmpty()) null else {
                        val quantity = parts[1].trim().toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: return@mapNotNull null
                        val price = parts[2].trim().toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: return@mapNotNull null
                        Triple(parts[0].trim(), quantity, price)
                    }
                }
                val items = if (parsedItems.isNotEmpty()) parsedItems else if (!hasLineItemsInput) listOf(Triple(s(options,"description","Professional service"), fallbackQuantity, fallbackPrice)) else emptyList()
                val subtotal = items.fold(0.0) { sum, item -> val line = item.second * item.third; val next = sum + if (line.isFinite()) line else 0.0; if (next.isFinite()) next else Double.MAX_VALUE }
                val discount = subtotal*maxOf(0.0,n(options,"discountPercent",0.0)).coerceAtMost(100.0)/100.0
                val taxable = subtotal-discount; val taxAmount = taxable*maxOf(0.0,n(options,"taxPercent",0.0))/100.0
                val itemLines = items.joinToString("\n") { "${it.first} | Qty ${money(it.second)} | $currency ${money(it.third)} | Line total $currency ${money((it.second*it.third).takeIf { value -> value.isFinite() } ?: 0.0)}" }.ifBlank { "(No valid line items entered)" }
                val recipientLabel = when(op) { "receipt" -> "Received from"; "quotation", "estimate" -> "Prepared for"; "purchase-order" -> "Supplier"; else -> "Bill to" }
                "$label — generated locally\nBusiness: $business\n$recipientLabel: $client\nDocument: $number\nDate: ${s(options,"date","Today")}\n\nLine items:\n$itemLines\nSubtotal: $currency ${money(subtotal)}\nDiscount: -$currency ${money(discount)}\nTax: $currency ${money(taxAmount)}\nTOTAL: $currency ${money(taxable+taxAmount)}\n\nClient data remains on this device unless you explicitly export or share it."
            }
            "payslip" -> { val gross=maxOf(0.0,n(options,"gross",a)); val statutory=maxOf(0.0,n(options,"statutoryDeductions",b)); val other=maxOf(0.0,n(options,"otherDeductions",c)); "PAYSLIP — DEMO ONLY\nEmployer: ${s(options,"company","Your Business")}\nEmployee: ${s(options,"employeeName","Employee name")}\nPay period: ${s(options,"payPeriod","Pay period")}\n\nGross pay: ${money(gross)}\nTax / statutory deductions: -${money(statutory)}\nOther deductions: -${money(other)}\nNet pay: ${money(gross-statutory-other)}\n\nIllustrative layout only; verify local payroll and statutory requirements." }
            "email-signature" -> {
                val name=s(options,"name","Alex Morgan"); val role=s(options,"role","Founder"); val email=s(options,"email","hello@example.com"); val company=s(options,"company","Your Business"); val phone=s(options,"phone",""); val website=s(options,"website",""); val social=s(options,"socialLink","")
                val safeWebsite = if (website.startsWith("https://", true) || website.startsWith("http://", true)) website else ""
                val safeSocial = if (social.startsWith("https://", true) || social.startsWith("http://", true)) social else ""
                val websiteHtml = if (website.isBlank()) "" else if (safeWebsite.isNotBlank()) "<br><a href=\"${htmlEscape(safeWebsite)}\">${htmlEscape(website)}</a>" else "<br>${htmlEscape(website)}"
                val socialHtml = if (social.isBlank()) "" else if (safeSocial.isNotBlank()) "<br><a href=\"${htmlEscape(safeSocial)}\">Profile</a>" else "<br>Profile: ${htmlEscape(social)}"
                val html="<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"font-family:Arial,sans-serif;font-size:13px;color:#222\"><tr><td style=\"padding-right:12px\"><strong>${htmlEscape(name)}</strong><br>${htmlEscape(role)}<br>${htmlEscape(company)}</td><td style=\"border-left:2px solid #888;padding-left:12px\">${htmlEscape(email)}${if(phone.isNotBlank()) "<br>${htmlEscape(phone)}" else ""}$websiteHtml$socialHtml</td></tr></table>"
                "$name | $role\n$email\n$company\n${if(phone.isNotBlank()) "Phone: $phone\n" else ""}${if(website.isNotBlank()) "Website: $website\n" else ""}${if(social.isNotBlank()) "Profile: $social\n" else ""}\nHTML signature (inline styles; no remote images):\n$html\n\nHTML output is a starting point. Verify formatting in your target email clients; clients may sanitize pasted HTML."
            }
            else -> throw IllegalArgumentException("Unsupported business operation: $op")
        }
    }
    private fun Double.toFixed(digits: Int): String = String.format(Locale.US, "%.${digits}f", this)
}
