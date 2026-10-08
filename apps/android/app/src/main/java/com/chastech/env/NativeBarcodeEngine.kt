package com.chastech.env

import com.chastech.env.data.ToolRecord

object NativeBarcodeEngine {
    private val ids = setOf("ean13-check-digit", "upc-check-digit", "gtin-validator")
    fun supports(tool: ToolRecord): Boolean = tool.id in ids && tool.engine.type == "barcode"

    fun run(toolId: String, input: String): String {
        require(toolId in ids) { "Unknown barcode operation." }
        val digits = input.filter(Char::isDigit)
        if (toolId == "gtin-validator") {
            require(digits.length in setOf(8, 12, 13, 14)) { "GTIN must contain 8, 12, 13 or 14 digits." }
            val expected = checkDigit(digits.dropLast(1))
            return "${if (expected == digits.last().digitToInt()) "Valid" else "Invalid"}: Expected check digit: $expected. Supplied: ${digits.last()}."
        }
        require(digits.isNotEmpty()) { "Enter numeric digits." }
        val body = if (toolId == "upc-check-digit") digits.take(11) else digits.take(12)
        require(body.isNotEmpty()) { "Enter numeric digits." }
        val expected = checkDigit(body)
        return "Calculated check digit: $expected. Supplied check digit: ${digits.last()}."
    }

    private fun checkDigit(value: String): Int {
        var sum = 0
        value.reversed().forEachIndexed { index, char -> sum += char.digitToInt() * if (index % 2 == 0) 3 else 1 }
        return (10 - sum % 10) % 10
    }
}
