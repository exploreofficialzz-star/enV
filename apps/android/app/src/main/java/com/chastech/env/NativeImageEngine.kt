package com.chastech.env

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Typeface
import com.chastech.env.data.ToolRecord
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object NativeImageEngine {
    private val operations = setOf("resize", "compress", "grayscale", "invert", "blur", "sharpen", "crop", "watermark", "rotate", "flip")
    private val aliases = mapOf(
        "image-resizer" to "resize", "image-compressor" to "compress", "image-grayscale" to "grayscale",
        "image-invert" to "invert", "image-blur" to "blur", "image-sharpen" to "sharpen",
        "image-cropper" to "crop", "image-watermark" to "watermark", "image-rotator" to "rotate", "image-flipper" to "flip",
    )
    data class Input(val name: String, val bytes: ByteArray)
    data class Result(val bytes: ByteArray, val mimeType: String, val fileName: String, val width: Int, val height: Int)

    fun operationFor(tool: ToolRecord): String? {
        if (tool.engine.type != "image") return null
        val op = tool.engine.extras["op"] ?: tool.engine.id ?: tool.id
        return aliases[tool.id] ?: op.takeIf { it in operations }
    }
    fun supports(tool: ToolRecord): Boolean = operationFor(tool) != null

    fun run(tool: ToolRecord, input: ByteArray, optionsJson: String): Result {
        val operation = operationFor(tool) ?: error("This image operation is not available offline yet.")
        val options = runCatching { JSONObject(optionsJson.ifBlank { "{}" }) }.getOrElse { JSONObject() }
        val source = BitmapFactory.decodeByteArray(input, 0, input.size) ?: error("Choose a supported PNG, JPEG, or WebP image.")
        val transformed = when (operation) {
            "resize" -> resize(source, options)
            "compress" -> source
            "grayscale" -> pixels(source) { r, g, b, a -> val gray = (0.299 * r + 0.587 * g + 0.114 * b).roundToInt(); intArrayOf(gray, gray, gray, a) }
            "invert" -> pixels(source) { r, g, b, a -> intArrayOf(255 - r, 255 - g, 255 - b, a) }
            "blur" -> convolve(source, arrayOf(intArrayOf(1, 1, 1), intArrayOf(1, 1, 1), intArrayOf(1, 1, 1)), 9)
            "sharpen" -> convolve(source, arrayOf(intArrayOf(0, -1, 0), intArrayOf(-1, 5, -1), intArrayOf(0, -1, 0)), 1)
            "crop" -> crop(source, options)
            "watermark" -> watermark(source, options)
            "rotate" -> rotate(source, options.optDouble("degrees", 90.0).toFloat())
            "flip" -> flip(source, options.optBoolean("horizontal", true))
            else -> source
        }
        val quality = options.optInt("quality", 88).coerceIn(1, 100)
        val format = when (options.optString("format", "jpeg").lowercase()) {
            "png" -> Bitmap.CompressFormat.PNG
            "webp", "webp-lossy" -> Bitmap.CompressFormat.WEBP
            else -> Bitmap.CompressFormat.JPEG
        }
        val ext = when (format) { Bitmap.CompressFormat.PNG -> "png"; Bitmap.CompressFormat.WEBP -> "webp"; else -> "jpg" }
        val mime = when (format) { Bitmap.CompressFormat.PNG -> "image/png"; Bitmap.CompressFormat.WEBP -> "image/webp"; else -> "image/jpeg" }
        val out = ByteArrayOutputStream()
        transformed.compress(format, quality, out)
        val outputWidth = transformed.width
        val outputHeight = transformed.height
        if (transformed !== source) transformed.recycle()
        source.recycle()
        return Result(out.toByteArray(), mime, "env-${operation}.$ext", outputWidth, outputHeight)
    }

    private fun resize(source: Bitmap, o: JSONObject): Bitmap {
        val requestedW = o.optInt("width", 0)
        val requestedH = o.optInt("height", 0)
        require(requestedW > 0 || requestedH > 0) { "Enter a target width or height." }
        val scale = when { requestedW > 0 && requestedH > 0 -> min(requestedW.toFloat() / source.width, requestedH.toFloat() / source.height); requestedW > 0 -> requestedW.toFloat() / source.width; else -> requestedH.toFloat() / source.height }
        val factor = scale.coerceIn(0.01f, 20f)
        return Bitmap.createScaledBitmap(source, max(1, (source.width * factor).roundToInt()), max(1, (source.height * factor).roundToInt()), true)
    }
    private fun crop(source: Bitmap, o: JSONObject): Bitmap {
        val w = o.optInt("width", source.width).coerceIn(1, source.width)
        val h = o.optInt("height", source.height).coerceIn(1, source.height)
        val x = o.optInt("x", (source.width - w) / 2).coerceIn(0, source.width - w)
        val y = o.optInt("y", (source.height - h) / 2).coerceIn(0, source.height - h)
        return Bitmap.createBitmap(source, x, y, w, h)
    }
    private fun rotate(source: Bitmap, degrees: Float): Bitmap = Bitmap.createBitmap(source, 0, 0, source.width, source.height, Matrix().apply { postRotate(degrees) }, true)
    private fun flip(source: Bitmap, horizontal: Boolean): Bitmap = Bitmap.createBitmap(source, 0, 0, source.width, source.height, Matrix().apply { postScale(if (horizontal) -1f else 1f, if (horizontal) 1f else -1f) }, true)
    private fun watermark(source: Bitmap, o: JSONObject): Bitmap = source.copy(Bitmap.Config.ARGB_8888, true).also { bitmap ->
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = o.optInt("alpha", 180).coerceIn(1, 255); textSize = o.optDouble("size", max(18.0, source.width / 18.0)).toFloat(); typeface = Typeface.DEFAULT_BOLD; setShadowLayer(4f, 2f, 2f, Color.BLACK) }
        val text = o.optString("text", "enV").ifBlank { "enV" }
        val margin = o.optInt("margin", 24).coerceAtLeast(0)
        canvas.drawText(text, margin.toFloat(), bitmap.height - margin.toFloat(), paint)
    }
    private fun pixels(source: Bitmap, fn: (Int, Int, Int, Int) -> IntArray): Bitmap {
        val out = source.copy(Bitmap.Config.ARGB_8888, true); val data = IntArray(source.width * source.height); source.getPixels(data, 0, source.width, 0, 0, source.width, source.height)
        for (i in data.indices) { val c = data[i]; val v = fn(Color.red(c), Color.green(c), Color.blue(c), Color.alpha(c)); data[i] = Color.argb(v[3], v[0].coerceIn(0,255), v[1].coerceIn(0,255), v[2].coerceIn(0,255)) }
        out.setPixels(data, 0, source.width, 0, 0, source.width, source.height); return out
    }
    private fun convolve(source: Bitmap, kernel: Array<IntArray>, divisor: Int): Bitmap {
        val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888); val src = IntArray(source.width * source.height); source.getPixels(src, 0, source.width, 0, 0, source.width, source.height); val result = IntArray(src.size)
        for (y in 0 until source.height) for (x in 0 until source.width) { var r=0; var g=0; var b=0; val cy=y; val cx=x; for (ky in -1..1) for (kx in -1..1) { val px=(cx+kx).coerceIn(0,source.width-1); val py=(cy+ky).coerceIn(0,source.height-1); val c=src[py*source.width+px]; val weight=kernel[ky+1][kx+1]; r+=Color.red(c)*weight; g+=Color.green(c)*weight; b+=Color.blue(c)*weight }; val a=Color.alpha(src[y*source.width+x]); result[y*source.width+x]=Color.argb(a,(r/divisor).coerceIn(0,255),(g/divisor).coerceIn(0,255),(b/divisor).coerceIn(0,255)) }
        out.setPixels(result,0,source.width,0,0,source.width,source.height); return out
    }
}
