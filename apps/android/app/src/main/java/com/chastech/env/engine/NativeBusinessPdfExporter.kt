package com.chastech.env.engine

import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import java.io.ByteArrayOutputStream

/** Creates a text-first, paginated PDF entirely on device; no network or WebView required. */
object NativeBusinessPdfExporter {
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val LEFT = 48f
    private const val RIGHT = 547f
    private const val TOP = 54f
    private const val BOTTOM = 790f

    fun create(content: String, title: String, logo: Bitmap? = null): ByteArray {
        require(content.isNotBlank()) { "There is no output to export." }
        val pdf = PdfDocument()
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(35, 43, 52)
            textSize = 10.5f
            typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        }
        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(20, 94, 91)
            textSize = 18f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.GRAY; textSize = 8f }
        val maxWidth = RIGHT - LEFT
        val lines = mutableListOf<String>()
        content.replace("\r\n", "\n").split('\n').forEach { raw ->
            if (raw.isEmpty()) { lines += ""; return@forEach }
            var remaining = raw
            while (bodyPaint.measureText(remaining) > maxWidth) {
                var end = remaining.length.coerceAtLeast(1)
                while (end > 1 && bodyPaint.measureText(remaining.substring(0, end)) > maxWidth) end--
                val splitAt = remaining.substring(0, end).lastIndexOf(' ').takeIf { it > 0 } ?: end
                lines += remaining.substring(0, splitAt)
                remaining = remaining.substring(splitAt).trimStart()
            }
            lines += remaining
        }
        var pageNumber = 0
        var page: PdfDocument.Page? = null
        var canvas: android.graphics.Canvas? = null
        var y = TOP
        fun startPage() {
            pageNumber++
            val info = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create()
            page = pdf.startPage(info)
            canvas = page!!.canvas
            y = TOP
            var titleX = LEFT
            if (pageNumber == 1 && logo != null && logo.width > 0 && logo.height > 0) {
                val scale = minOf(72f / logo.width, 38f / logo.height)
                val width = logo.width * scale
                val height = logo.height * scale
                canvas!!.drawBitmap(logo, null, RectF(LEFT, 20f, LEFT + width, 20f + height), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
                titleX = LEFT + width + 12f
            }
            canvas!!.drawText(title.take(72), titleX, y, titlePaint)
            y += 28f
            canvas!!.drawLine(LEFT, y - 10f, RIGHT, y - 10f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.LTGRAY; strokeWidth = 0.8f })
        }
        fun finishPage() {
            val c = canvas ?: return
            c.drawText("Generated locally by enV · Page $pageNumber", LEFT, PAGE_HEIGHT - 24f, footerPaint)
            page?.let { pdf.finishPage(it) }
            page = null; canvas = null
        }
        try {
            startPage()
            lines.forEach { line ->
                if (y + 15f > BOTTOM) { finishPage(); startPage() }
                if (line.isNotEmpty()) canvas!!.drawText(line, LEFT, y, bodyPaint)
                y += if (line.isEmpty()) 9f else 15f
            }
            finishPage()
            return ByteArrayOutputStream().use { out -> pdf.writeTo(out); out.toByteArray() }
        } finally { pdf.close() }
    }
}
