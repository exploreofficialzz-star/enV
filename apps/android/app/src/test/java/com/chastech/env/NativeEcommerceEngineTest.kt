package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeEcommerceEngineTest {
    private fun tool(id: String) = ToolRecord(
        id = id, name = id, slug = id, description = "", category = "ecommerce",
        keywords = emptyList(), tags = emptyList(), icon = "ShoppingCart", popularity = 0,
        featured = false, clientSide = true, requiresBackend = false, requiresAuth = false,
        status = "active", related = emptyList(), engine = EngineInfo("custom", id),
    )

    @Test fun allNinetyCatalogWorkflowsHaveNativeHandlers() {
        val families = listOf("product", "order", "inventory", "shipping", "pricing", "discount", "coupon", "sku", "barcode", "catalog", "store", "customer", "return", "profit", "margin")
        val workflows = listOf("generator", "calculator", "planner", "template", "mockup", "helper")
        assertEquals(90, families.size * workflows.size)
        families.forEach { family ->
            workflows.forEach { workflow ->
                val item = tool("$family-$workflow")
                assertTrue(item.id, NativeEcommerceEngine.supports(item))
                val fields = NativeEcommerceEngine.fieldsFor(item.id)
                val values = fields.associate { it.key to it.defaultValue }
                assertTrue(item.id, NativeEcommerceEngine.execute(item.id, values).text.length > 20)
            }
        }
    }

    @Test fun inventoryCalculatorIncludesLeadTimeAndSafetyStock() {
        val item = tool("inventory-calculator")
        val values = NativeEcommerceEngine.initialValues(item.id) + mapOf(
            "stock" to "20", "dailySales" to "6", "leadTime" to "5", "safetyStock" to "4",
        )
        val output = NativeEcommerceEngine.execute(item.id, values).text
        assertTrue(output.contains("Reorder point: 34.00 units"))
        assertTrue(output.contains("Reorder review required"))
    }

    @Test fun orderCalculatorAppliesDiscountThenTaxAndShipping() {
        val item = tool("order-calculator")
        val values = NativeEcommerceEngine.initialValues(item.id) + mapOf(
            "price" to "100", "quantity" to "2", "discount" to "10", "tax" to "7.5", "shipping" to "8",
        )
        val output = NativeEcommerceEngine.execute(item.id, values).text
        assertTrue(output.contains("Order subtotal: 200.00"))
        assertTrue(output.contains("Discount: 20.00"))
        assertTrue(output.contains("Tax estimate: 13.50"))
        assertTrue(output.contains("ORDER TOTAL: 201.50"))
    }

    @Test fun profitCalculatorAccountsForCostFeesPackagingAndAdvertising() {
        val item = tool("profit-calculator")
        val values = NativeEcommerceEngine.initialValues(item.id) + mapOf(
            "cost" to "40", "price" to "100", "quantity" to "2", "feePercent" to "3",
            "packaging" to "2", "advertising" to "10",
        )
        val output = NativeEcommerceEngine.execute(item.id, values).text
        assertTrue(output.contains("Payment / platform fees: 6.00"))
        assertTrue(output.contains("Estimated contribution profit: 100.00"))
    }

    @Test fun pricingCalculatorExposesTargetMarginAndCalculatesFeeAwarePrice() {
        val item = tool("pricing-calculator")
        val fields = NativeEcommerceEngine.fieldsFor(item.id).map { it.key }
        assertTrue("targetMargin", fields.contains("targetMargin"))
        val values = NativeEcommerceEngine.initialValues(item.id) + mapOf(
            "cost" to "40", "packaging" to "2", "feePercent" to "3", "targetMargin" to "30",
        )
        val output = NativeEcommerceEngine.execute(item.id, values).text
        assertTrue(output.contains("Target margin: 30.00%"))
        assertTrue(output.contains("Target selling price: 62.69"))
    }

    @Test fun nativeEngineRejectsNegativeAndOutOfRangePercentInputs() {
        val item = tool("discount-calculator")
        val defaults = NativeEcommerceEngine.initialValues(item.id)
        assertThrows(IllegalArgumentException::class.java) {
            NativeEcommerceEngine.execute(item.id, defaults + ("price" to "-10"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeEcommerceEngine.execute(item.id, defaults + ("discount" to "150"))
        }
    }

    @Test fun catalogPromotionIsLimitedToTheTwoImplementedCategories() {
        assertTrue(NativeEcommerceEngine.supports(tool("product-generator")))
        assertFalse(NativeEcommerceEngine.supports(tool("unrelated-generator").copy(category = "marketing")))
    }
}
