package com.chastech.env

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.chastech.env.NativeBackendEngine.InputFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

object NativeAiClient {
    private const val COOKIE_KEY = "env_ai_cookie"
    private const val MAX_IMAGE_BYTES = 2_400_000
    private const val MAX_AUDIO_BYTES = 2_800_000

    data class AiError(val code: String, override val message: String, val retryable: Boolean = false, val retryAfterSeconds: Int? = null) : Exception(message)

    private val base: String
        get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/')

    private fun cookie(context: Context): String? = context.getSharedPreferences("env_ai", Context.MODE_PRIVATE).getString(COOKIE_KEY, null)

    private fun storeCookie(context: Context, setCookie: String?) {
        val value = setCookie?.substringBefore(';')?.trim() ?: return
        if (value.startsWith("env_ai_sid=")) {
            context.getSharedPreferences("env_ai", Context.MODE_PRIVATE).edit().putString(COOKIE_KEY, value).apply()
        }
    }

    suspend fun availability(context: Context): Map<String, Boolean> = withContext(Dispatchers.IO) {
        val response = request(context, "/api/ai/status", "GET", null)
        if (response.code !in 200..299) return@withContext emptyMap()
        val body = JSONObject(response.text ?: "{}")
        if (!body.optBoolean("ok", false)) return@withContext emptyMap()
        val tasks = body.optJSONObject("tasks") ?: return@withContext emptyMap()
        buildMap {
            for (key in tasks.keys()) put(key, tasks.optJSONObject(key)?.optBoolean("available", false) == true)
        }
    }

    suspend fun run(context: Context, taskId: String, input: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val body = JSONObject().put("task", taskId).put("input", input)
        val response = request(context, "/api/ai/run", "POST", body.toString().toByteArray(StandardCharsets.UTF_8))
        if (response.code !in 200..299) {
            val errorBody = runCatching { JSONObject(response.text ?: "{}") }.getOrElse { JSONObject() }
            val error = errorBody.optJSONObject("error")
            throw AiError(
                error?.optString("code", "AI_UNAVAILABLE") ?: "AI_UNAVAILABLE",
                error?.optString("message", "AI is unavailable right now.") ?: "AI is unavailable right now.",
                error?.optBoolean("retryable", response.code >= 500) ?: (response.code >= 500),
                error?.takeIf { it.has("retryAfterSeconds") }?.optInt("retryAfterSeconds"),
            )
        }
        val root = JSONObject(response.text ?: "{}")
        if (!root.optBoolean("ok", false)) throw AiError("AI_UNAVAILABLE", "AI is unavailable right now.", true)
        root.optJSONObject("data")?.optJSONObject("result") ?: throw AiError("AI_PROVIDER_BAD_RESPONSE", "The AI response was not usable.", true)
    }

    fun prepareImage(file: InputFile): InputFile {
        require(file.bytes.isNotEmpty()) { "The image is empty." }
        val decoded = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size) ?: throw IllegalArgumentException("The selected file is not a supported image.")
        decoded.recycle()
        var bitmap = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size)
            ?: throw IllegalArgumentException("The selected file is not a supported image.")
        try {
            val qualities = intArrayOf(82, 68, 60, 55)
            for (maxSide in intArrayOf(1280, 1024, 768)) {
                val scale = minOf(1f, maxSide.toFloat() / maxOf(bitmap.width, bitmap.height).toFloat())
                val width = maxOf(1, (bitmap.width * scale).toInt())
                val height = maxOf(1, (bitmap.height * scale).toInt())
                val scaled = if (width != bitmap.width || height != bitmap.height) Bitmap.createScaledBitmap(bitmap, width, height, true) else bitmap
                if (scaled !== bitmap) bitmap.recycle()
                bitmap = scaled
                for (quality in qualities) {
                    val output = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)
                    val bytes = output.toByteArray()
                    if (bytes.size <= MAX_IMAGE_BYTES) {
                        return InputFile(file.name, "image/jpeg", bytes)
                    }
                }
            }
            throw IllegalArgumentException("That image is too large for AI. Try a smaller image.")
        } finally {
            bitmap.recycle()
        }
    }

    fun prepareAudio(file: InputFile): InputFile {
        require(file.bytes.isNotEmpty()) { "The audio is empty." }
        if (file.bytes.size > MAX_AUDIO_BYTES) throw IllegalArgumentException("That audio file is too large for AI. Keep it under 2.8 MB.")
        val mime = when (file.name.substringAfterLast('.', "").lowercase()) {
            "mp3" -> "audio/mpeg"
            "m4a" -> "audio/x-m4a"
            "mp4" -> "audio/mp4"
            "wav" -> "audio/wav"
            "webm" -> "audio/webm"
            "ogg", "oga" -> "audio/ogg"
            "flac" -> "audio/flac"
            else -> file.mimeType.lowercase()
        }
        require(mime.startsWith("audio/")) { "Use an MP3, M4A, WAV, WebM, OGG or FLAC audio file." }
        return InputFile(file.name, mime, file.bytes)
    }

    fun fileInput(file: InputFile): JSONObject = JSONObject().apply {
        put("base64", Base64.encodeToString(file.bytes, Base64.NO_WRAP))
        put("mimeType", file.mimeType)
        put("bytes", file.bytes.size)
        put("filename", file.name)
    }

    private data class ResponseData(val code: Int, val text: String?, val contentType: String?)

    private fun request(context: Context, path: String, method: String, body: ByteArray?): ResponseData {
        require(base.isNotBlank()) { "AI/backend API is not configured for this build." }
        val connection = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 90_000
            setRequestProperty("Accept", "application/json")
            cookie(context)?.let { setRequestProperty("Cookie", it) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Content-Length", body.size.toString())
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            storeCookie(context, connection.getHeaderField("Set-Cookie"))
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { String(it.readBytes(), StandardCharsets.UTF_8) }
            return ResponseData(code, text, connection.contentType)
        } finally {
            connection.disconnect()
        }
    }

    fun toList(value: JSONObject?, key: String): List<String> {
        val array = value?.optJSONArray(key) ?: JSONArray()
        return buildList { for (i in 0 until array.length()) add(array.optString(i)) }
    }
}
