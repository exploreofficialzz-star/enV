package com.chastech.env

import android.graphics.Bitmap
import com.chastech.env.data.ToolRecord
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.WriterException
import com.google.zxing.common.BitMatrix
import java.util.EnumMap

object NativeBarcodeEngine {
    private val validatorIds = setOf("ean13-check-digit", "upc-check-digit", "gtin-validator")
    private val qrIds = setOf("qr-generator", "text-qr-generator", "url-qr-generator")
    private val barcodeFormats = mapOf(
        "code128-barcode" to BarcodeFormat.CODE_128,
        "code39-barcode" to BarcodeFormat.CODE_39,
        "ean13-barcode" to BarcodeFormat.EAN_13,
        "ean8-barcode" to BarcodeFormat.EAN_8,
        "upc-barcode" to BarcodeFormat.UPC_A,
        "itf14-barcode" to BarcodeFormat.ITF,
        "codabar-barcode" to BarcodeFormat.CODABAR,
    )
    fun supports(tool: ToolRecord): Boolean = tool.engine.type in setOf("barcode", "qr") && (tool.id in validatorIds || tool.id in qrIds || tool.id in barcodeFormats)
    fun generatesImage(toolId: String): Boolean = toolId in qrIds || toolId in barcodeFormats
    fun generate(toolId: String, input: String, width: Int = 768, height: Int = 320): Bitmap {
        require(generatesImage(toolId)) { "This barcode operation is not available offline yet." }
        require(input.isNotBlank()) { "Enter a value to encode." }
        val format = barcodeFormats[toolId] ?: BarcodeFormat.QR_CODE
        val safeWidth = width.coerceIn(128, 2048)
        val safeHeight = if (format == BarcodeFormat.QR_CODE) safeWidth else height.coerceIn(96, 768)
        val hints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java).apply {
            put(EncodeHintType.MARGIN, 1)
            if (format == BarcodeFormat.QR_CODE) put(EncodeHintType.CHARACTER_SET, "UTF-8")
        }
        val matrix: BitMatrix = try { MultiFormatWriter().encode(input, format, safeWidth, safeHeight, hints) }
        catch (_: WriterException) { throw IllegalArgumentException("The value is not valid for this barcode format.") }
        return Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888).also { bitmap ->
            for (x in 0 until matrix.width) for (y in 0 until matrix.height) bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }

    fun run(toolId: String, input: String): String {
        require(toolId in validatorIds) { "Unknown barcode validation operation." }
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
