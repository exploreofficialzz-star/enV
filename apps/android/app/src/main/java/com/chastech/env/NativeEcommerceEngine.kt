package com.chastech.env

import com.chastech.env.data.ToolRecord
import java.text.DecimalFormat
import java.util.Locale
import kotlin.math.ceil

data class NativeEcommerceField(
    val key: String,
    val label: String,
    val defaultValue: String = "",
    val multiline: Boolean = false,
)

data class NativeEcommerceResult(
    val title: String,
    val text: String,
    val fileName: String,
)

object NativeEcommerceEngine {
    private val families = setOf(
        "product", "order", "inventory", "shipping", "pricing", "discount", "coupon", "sku",
        "barcode", "catalog", "store", "customer", "return", "profit", "margin",
    )
    private val workflows = setOf("generator", "calculator", "planner", "template", "mockup", "helper")
    private val moneyFormat = DecimalFormat("#,##0.00")

    data class ParsedTool(val family: String, val workflow: String)

    fun parse(toolId: String): ParsedTool {
        val match = Regex("^([a-z]+)-(generator|calculator|planner|template|mockup|helper)$").matchEntire(toolId)
            ?: throw IllegalArgumentException("Unsupported E-commerce tool: $toolId")
        val family = match.groupValues[1]
        val workflow = match.groupValues[2]
        require(family in families && workflow in workflows) { "Unsupported E-commerce tool: $toolId" }
        return ParsedTool(family, workflow)
    }

    fun supports(tool: ToolRecord): Boolean =
        tool.category.equals("ecommerce", ignoreCase = true) &&
            runCatching { parse(tool.id) }.isSuccess

    fun fieldsFor(toolId: String): List<NativeEcommerceField> {
        val parsed = parse(toolId)
        val common = listOf(
            NativeEcommerceField("name", "Name / product", "Sample Product"),
            NativeEcommerceField("code", "Reference / SKU", "SKU-001"),
        )
        val finance = listOf(
            NativeEcommerceField("cost", "Unit cost", "40"),
            NativeEcommerceField("price", "Selling price", "75"),
            NativeEcommerceField("quantity", "Quantity", "1"),
            NativeEcommerceField("discount", "Discount (%)", "0"),
            NativeEcommerceField("tax", "Tax (%)", "0"),
            NativeEcommerceField("shipping", "Shipping charged", "0"),
            NativeEcommerceField("packaging", "Packaging / handling cost", "0"),
            NativeEcommerceField("feePercent", "Payment / platform fee (%)", "0"),
            NativeEcommerceField("advertising", "Advertising cost", "0"),
        )
        return when (parsed.workflow) {
            "calculator" -> when (parsed.family) {
                "inventory" -> common + listOf(
                    NativeEcommerceField("stock", "Available stock", "50"),
                    NativeEcommerceField("dailySales", "Average units sold per day", "5"),
                    NativeEcommerceField("leadTime", "Supplier lead time (days)", "7"),
                    NativeEcommerceField("safetyStock", "Safety stock (units)", "0"),
                )
                "discount", "coupon" -> common + finance.filter { it.key in setOf("price", "quantity", "discount", "cost", "feePercent", "packaging") }
                "profit", "margin", "pricing" -> common + finance.filter { it.key in setOf("cost", "price", "quantity", "discount", "packaging", "feePercent", "advertising") }
                "shipping" -> common + listOf(
                    NativeEcommerceField("weight", "Package weight (kg)", "1"),
                    NativeEcommerceField("distance", "Distance (km)", "10"),
                    NativeEcommerceField("shipping", "Quoted shipping amount", "0"),
                )
                "order" -> common + finance.filter { it.key in setOf("price", "quantity", "discount", "tax", "shipping") }
                else -> common + finance
            }
            "generator" -> when (parsed.family) {
                "product" -> common + listOf(NativeEcommerceField("price", "Selling price", "75"), NativeEcommerceField("cost", "Unit cost", "40"), NativeEcommerceField("stock", "Opening stock", "50"), NativeEcommerceField("description", "Product description", multiline = true))
                "sku" -> common + listOf(NativeEcommerceField("prefix", "SKU prefix", "ENV"), NativeEcommerceField("variant", "Variant / option", "DEFAULT"))
                "barcode" -> common + listOf(NativeEcommerceField("format", "Barcode format", "CODE128"), NativeEcommerceField("value", "Barcode value", "123456789"))
                "customer" -> common + listOf(NativeEcommerceField("email", "Email"), NativeEcommerceField("phone", "Phone"))
                "order", "return" -> common + listOf(NativeEcommerceField("customer", "Customer", "Customer"), NativeEcommerceField("quantity", "Quantity", "1"), NativeEcommerceField("price", "Unit price", "75"), NativeEcommerceField("notes", "Notes", multiline = true))
                else -> common + listOf(NativeEcommerceField("description", "Details", multiline = true), NativeEcommerceField("notes", "Notes", multiline = true))
            }
            "mockup" -> common + listOf(NativeEcommerceField("price", "Selling price", "75"), NativeEcommerceField("discount", "Discount (%)", "0"), NativeEcommerceField("quantity", "Quantity", "1"))
            "planner" -> common + listOf(NativeEcommerceField("stock", "Current stock", "50"), NativeEcommerceField("dailySales", "Average daily sales", "5"), NativeEcommerceField("leadTime", "Lead time (days)", "7"), NativeEcommerceField("notes", "Constraints / notes", multiline = true))
            "template" -> common + listOf(NativeEcommerceField("customer", "Customer / supplier"), NativeEcommerceField("quantity", "Quantity", "1"), NativeEcommerceField("price", "Unit price", "0"), NativeEcommerceField("notes", "Notes / next action", multiline = true))
            else -> common + listOf(NativeEcommerceField("notes", "What are you trying to do?", multiline = true))
        }
    }

    fun execute(toolId: String, values: Map<String, String>): NativeEcommerceResult {
        val parsed = parse(toolId)
        fun value(key: String, fallback: String = "") = values[key]?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
        fun number(key: String, fallback: Double = 0.0): Double {
            val raw = value(key)
            val result = if (raw.isEmpty()) fallback else raw.toDoubleOrNull()
                ?: throw IllegalArgumentException("${key.replaceFirstChar { it.uppercase() }} must be a valid number.")
            require(result.isFinite() && result >= 0.0) { "${key.replaceFirstChar { it.uppercase() }} cannot be negative." }
            return result
        }
        fun pct(key: String): Double = number(key).also { require(it <= 100.0) { "${key.replaceFirstChar { it.uppercase() }} must be between 0 and 100." } }
        fun money(amount: Double) = moneyFormat.format(amount)
        val name = value("name", parsed.family.replaceFirstChar { it.uppercase() })
        val code = value("code", "${parsed.family.uppercase()}-001")
        val title = "${parsed.family.replaceFirstChar { it.uppercase() }} ${parsed.workflow.replaceFirstChar { it.uppercase() }}"

        val output = when (parsed.workflow) {
            "calculator" -> {
                val price = number("price", 75.0)
                val cost = number("cost", 40.0)
                val quantity = number("quantity", 1.0)
                val discount = pct("discount")
                val tax = pct("tax")
                val shipping = number("shipping")
                val packaging = number("packaging")
                val feePercent = pct("feePercent")
                val advertising = number("advertising")
                val subtotal = price * quantity
                val discountAmount = subtotal * discount / 100.0
                val netSales = subtotal - discountAmount
                val taxAmount = netSales * tax / 100.0
                val fees = netSales * feePercent / 100.0
                val unitProfit = price * (1 - discount / 100.0) - cost - packaging - (price * (1 - discount / 100.0) * feePercent / 100.0)
                val profit = unitProfit * quantity - advertising
                val margin = if (netSales > 0) profit / netSales * 100.0 else 0.0
                when (parsed.family) {
                    "inventory" -> {
                        val stock = number("stock")
                        val dailySales = number("dailySales")
                        val leadTime = number("leadTime")
                        val safety = number("safetyStock")
                        val reorder = ceil(dailySales * leadTime + safety)
                        val cover = if (dailySales > 0) stock / dailySales else Double.POSITIVE_INFINITY
                        buildString {
                            appendLine("CURRENT STOCK: ${money(stock)} units")
                            appendLine("Average daily demand: ${money(dailySales)} units")
                            appendLine("Supplier lead time: ${money(leadTime)} days")
                            appendLine("Safety stock: ${money(safety)} units")
                            appendLine("Reorder point: ${money(reorder)} units")
                            appendLine(if (stock <= reorder) "ACTION: Reorder review required." else "ACTION: Stock is above the reorder point.")
                            append(if (cover.isFinite()) "Estimated stock cover: ${money(cover)} days" else "Stock cover: not estimable until daily sales are entered")
                        }
                    }
                    "discount", "coupon" -> {
                        val salePrice = price * (1 - discount / 100.0)
                        val saleProfit = salePrice - cost - packaging - salePrice * feePercent / 100.0
                        buildString {
                            appendLine("Original unit price: ${money(price)}")
                            appendLine("Discount: ${money(discount)}%")
                            appendLine("Customer savings: ${money(price - salePrice)} per unit")
                            appendLine("Sale price: ${money(salePrice)}")
                            appendLine("Estimated unit contribution after cost/packaging/fees: ${money(saleProfit)}")
                            append(if (saleProfit < 0) "WARNING: This price creates a unit loss before advertising." else "Promotion remains positive before advertising and fixed costs.")
                        }
                    }
                    "profit", "margin" -> buildString {
                        appendLine("Gross sales before discount: ${money(subtotal)}")
                        appendLine("Discount: ${money(discountAmount)}")
                        appendLine("Net sales before tax: ${money(netSales)}")
                        appendLine("Product cost: ${money(cost * quantity)}")
                        appendLine("Packaging / handling: ${money(packaging * quantity)}")
                        appendLine("Payment / platform fees: ${money(fees)}")
                        appendLine("Advertising cost: ${money(advertising)}")
                        appendLine("Estimated contribution profit: ${money(profit)}")
                        append("Estimated contribution margin: ${money(margin)}%")
                    }
                    "pricing" -> {
                        val targetMargin = pct("targetMargin")
                        val variable = cost + packaging
                        val feeRate = feePercent / 100.0
                        val minimum = if (feeRate < 1) variable / (1 - feeRate) else 0.0
                        val target = if (targetMargin + feeRate < 100) variable / (1 - (targetMargin + feePercent) / 100.0) else Double.POSITIVE_INFINITY
                        "Unit cost including packaging: ${money(variable)}\nPayment/platform fee: ${money(feePercent)}%\nMinimum break-even price before tax and advertising: ${money(minimum)}\nTarget margin: ${money(targetMargin)}%\nTarget selling price: ${if (target.isFinite()) money(target) else "Not achievable with these fee and margin inputs"}"
                    }
                    "order" -> buildString {
                        appendLine("Order subtotal: ${money(subtotal)}")
                        appendLine("Discount: ${money(discountAmount)}")
                        appendLine("Tax estimate: ${money(taxAmount)}")
                        appendLine("Shipping: ${money(shipping)}")
                        append("ORDER TOTAL: ${money(netSales + taxAmount + shipping)}")
                    }
                    "shipping" -> {
                        val weight = number("weight")
                        val distance = number("distance")
                        "Package weight: ${money(weight)} kg\nDistance: ${money(distance)} km\nQuoted shipping amount: ${money(shipping)}\nThis is a recorded quote, not a live carrier rate. Connect an enabled carrier to purchase a label."
                    }
                    else -> "Unit profit before additional costs: ${money(price - cost)}\nQuantity: ${money(quantity)}\nEstimated total: ${money(subtotal)}\nShipping entered: ${money(shipping)}\nOrder estimate including shipping and tax: ${money(netSales + taxAmount + shipping)}"
                }
            }
            "generator" -> when (parsed.family) {
                "product" -> "PRODUCT RECORD\nName: ${name}\nSKU: ${code}\nPrice: ${money(number("price", 75.0))}\nCost: ${money(number("cost", 40.0))}\nOpening stock: ${money(number("stock", 50.0))}\nDescription: ${value("description", "Add a clear customer-facing product description.")}"
                "sku" -> {
                    val prefix = value("prefix", "ENV").uppercase(Locale.ROOT).replace(Regex("[^A-Z0-9-]"), "")
                    val variant = value("variant", "DEFAULT").uppercase(Locale.ROOT).replace(Regex("[^A-Z0-9-]"), "")
                    val slug = name.uppercase(Locale.ROOT).replace(Regex("[^A-Z0-9]+"), "-").trim('-')
                    "SKU: ${prefix}-${slug.take(18)}-${variant}\nKeep each sellable variant unique and check the product catalogue for duplicates before importing."
                }
                "barcode" -> "BARCODE JOB\nName: ${name}\nReference: ${code}\nFormat requested: ${value("format", "CODE128")}\nValue: ${value("value", code)}\nUse the dedicated QR & Barcode tools to render, scan-check and print the barcode."
                "customer" -> "CUSTOMER RECORD\nName: ${name}\nEmail: ${value("email", "Not supplied")}\nPhone: ${value("phone", "Not supplied")}\nReference: ${code}\nStore only the customer fields required for your workflow and applicable privacy obligations."
                else -> "${title.uppercase(Locale.ROOT)}\nReference: ${code}\nName: ${name}\nCustomer: ${value("customer", "Not supplied")}\nQuantity: ${money(number("quantity", 1.0))}\nUnit price: ${money(number("price"))}\nNotes: ${value("notes", value("description", "Add notes."))}"
            }
            "planner" -> when (parsed.family) {
                "inventory" -> {
                    val stock = number("stock", 50.0)
                    val daily = number("dailySales", 5.0)
                    val lead = number("leadTime", 7.0)
                    "INVENTORY REVIEW PLAN\nCurrent stock: ${money(stock)}\nAverage daily sales: ${money(daily)}\nLead time: ${money(lead)} days\nReorder review point: ${money(ceil(daily * lead))}\n\n1. Confirm physical stock.\n2. Reconcile reserved and damaged units.\n3. Confirm supplier availability and lead time.\n4. Set a safety-stock policy.\n5. Approve and record a purchase order.\n6. Review stock after receiving."
                }
                "shipping" -> "SHIPPING PLAN\n1. Confirm order items and destination.\n2. Verify package weight and dimensions.\n3. Compare enabled carrier services.\n4. Purchase the selected label through the carrier integration.\n5. Record tracking and dispatch time.\n6. Reconcile delivery and exceptions."
                "return" -> "RETURN PLAN\n1. Find the original order.\n2. Confirm the return window and item condition.\n3. Record the customer's reason.\n4. Authorise return or explain the decision.\n5. Inspect and decide restock, repair or disposal.\n6. Process the approved refund or exchange.\n7. Close the case with an audit record."
                else -> "${title.uppercase(Locale.ROOT)}\nGoal: ${name}\nReference: ${code}\n\n1. Confirm the objective and source records.\n2. Check assumptions and required approvals.\n3. Complete the operation.\n4. Reconcile the result.\n5. Record the next action.\nNotes: ${value("notes", "None supplied.")}"
            }
            "template" -> "${title.uppercase(Locale.ROOT)}\nName: ${name}\nReference: ${code}\nCustomer / supplier: ${value("customer", "Not supplied")}\nQuantity: ${money(number("quantity", 1.0))}\nUnit price: ${money(number("price"))}\nStatus: [Draft / Pending / Approved / Complete]\nNotes: ${value("notes", "Add notes.")}\nNext action: "
            "mockup" -> {
                val salePrice = number("price", 75.0) * (1 - pct("discount") / 100.0)
                "STORE PREVIEW\n${name}\nReference: ${code}\nDisplayed price: ${money(salePrice)}\nQuantity shown: ${money(number("quantity", 1.0))}\n\nPreview only. This native mockup does not publish a storefront, accept payment or create an order."
            }
            else -> when (parsed.family) {
                "product" -> "Product helper: keep the title specific, record a unique SKU, describe measurable product benefits, show accurate price/availability and keep variants distinct."
                "inventory" -> "Inventory helper: reconcile on-hand, reserved and damaged stock; review supplier lead time; set a safety-stock rule; and keep a dated movement log."
                "shipping" -> "Shipping helper: confirm address, weight, dimensions and service. Live carrier rates and labels require an enabled carrier integration."
                "profit", "margin", "pricing" -> "Pricing helper: distinguish markup (profit divided by cost) from margin (profit divided by selling price). Include variable fees, packaging, fulfilment and returns before approving a promotion."
                "barcode" -> "Barcode helper: select a symbology accepted by the target scanner, validate the identifier separately, preserve quiet zones and test a printed sample."
                "return" -> "Returns helper: link every case to its original order, record condition and reason, document the decision and reconcile refund or replacement."
                else -> "Use consistent records, validate identifiers, document assumptions and export a dated copy before making operational changes."
            }
        }
        return NativeEcommerceResult(title, output, "env-${toolId}.txt")
    }
}
