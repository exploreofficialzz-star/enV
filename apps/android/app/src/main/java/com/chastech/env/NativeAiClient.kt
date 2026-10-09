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
    data class AiResponse(val result: JSONObject, val warnings: List<String>, val requestId: String, val cached: Boolean)

    class RequestHandle {
        @Volatile private var connection: HttpURLConnection? = null
        @Volatile private var cancelled = false

        internal fun attach(value: HttpURLConnection) {
            connection = value
            if (cancelled) value.disconnect()
        }

        internal fun detach(value: HttpURLConnection) {
            if (connection === value) connection = null
        }

        fun cancel() {
            cancelled = true
            connection?.disconnect()
        }
    }

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

    suspend fun run(context: Context, taskId: String, input: JSONObject, handle: RequestHandle? = null): JSONObject = runWithMetadata(context, taskId, input, handle).result

    suspend fun runWithMetadata(context: Context, taskId: String, input: JSONObject, handle: RequestHandle? = null): AiResponse = withContext(Dispatchers.IO) {
        val body = JSONObject().put("task", taskId).put("input", input)
        val response = request(context, "/api/ai/run", "POST", body.toString().toByteArray(StandardCharsets.UTF_8), handle)
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
        val data = root.optJSONObject("data") ?: throw AiError("AI_PROVIDER_BAD_RESPONSE", "The AI response was not usable.", true)
        val result = data.optJSONObject("result") ?: throw AiError("AI_PROVIDER_BAD_RESPONSE", "The AI response was not usable.", true)
        val meta = data.optJSONObject("meta") ?: JSONObject()
        val warnings = meta.optJSONArray("warnings")?.let { array -> (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) } } ?: emptyList()
        AiResponse(result, warnings, meta.optString("requestId"), meta.optBoolean("cached", false))
    }

    fun prepareImage(file: InputFile): InputFile {
        require(file.bytes.isNotEmpty()) { "The image is empty." }
        val ext = file.name.substringAfterLast('.', "").lowercase()
        val sourceMime = file.mimeType.substringBefore(';').trim().lowercase()
        val imageMime = when {
            sourceMime in setOf("image/jpeg", "image/png", "image/webp") -> sourceMime
            ext in setOf("jpg", "jpeg") -> "image/jpeg"
            ext == "png" -> "image/png"
            ext == "webp" -> "image/webp"
            else -> ""
        }
        require(imageMime in setOf("image/jpeg", "image/png", "image/webp")) { "Use a JPEG, PNG or WebP image." }
        val bitmap = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size)
            ?: throw IllegalArgumentException("The selected file is not a supported image.")
        try {
            for ((maxSide, quality) in listOf(1280 to 82, 1280 to 68, 1024 to 60, 768 to 55)) {
                val scale = minOf(1f, maxSide.toFloat() / maxOf(bitmap.width, bitmap.height).toFloat())
                val width = maxOf(1, (bitmap.width * scale).toInt())
                val height = maxOf(1, (bitmap.height * scale).toInt())
                val scaled = if (width != bitmap.width || height != bitmap.height) Bitmap.createScaledBitmap(bitmap, width, height, true) else bitmap
                try {
                    val output = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, quality, output)
                    val bytes = output.toByteArray()
                    if (bytes.size <= MAX_IMAGE_BYTES) return InputFile(file.name, "image/jpeg", bytes)
                } finally {
                    if (scaled !== bitmap) scaled.recycle()
                }
            }
            throw IllegalArgumentException("That image is too large for AI. Try a smaller image.")
        } finally {
            bitmap.recycle()
        }
    }

    fun prepareAudio(file: InputFile): InputFile {
        require(file.bytes.isNotEmpty()) { "The audio is empty." }
        val mimeAliases = mapOf("audio/mp3" to "audio/mpeg", "audio/mpeg3" to "audio/mpeg", "audio/wave" to "audio/wav", "audio/x-flac" to "audio/flac", "audio/m4a" to "audio/x-m4a")
        val accepted = setOf("audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac")
        val sourceMime = file.mimeType.substringBefore(';').trim().lowercase()
        val ext = file.name.substringAfterLast('.', "").lowercase()
        val extensionMime = mapOf("mp3" to "audio/mpeg", "m4a" to "audio/x-m4a", "mp4" to "audio/mp4", "wav" to "audio/wav", "webm" to "audio/webm", "ogg" to "audio/ogg", "oga" to "audio/ogg", "flac" to "audio/flac")[ext]
        val mime = mimeAliases[sourceMime] ?: sourceMime.takeIf { it in accepted } ?: extensionMime
        require(mime != null) { "Use an MP3, M4A, WAV, WebM, OGG or FLAC audio file." }
        if (file.bytes.size > MAX_AUDIO_BYTES) throw IllegalArgumentException("That file is ${(file.bytes.size / 1_000_000.0).let { String.format("%.1f", it) }} MB. AI transcription currently accepts audio up to 2.8 MB. Trim or compress it first.")
        return InputFile(file.name, mime, file.bytes)
    }

    fun fileInput(file: InputFile): JSONObject = JSONObject().apply {
        put("base64", Base64.encodeToString(file.bytes, Base64.NO_WRAP))
        put("mimeType", file.mimeType)
        put("bytes", file.bytes.size)
        put("filename", file.name)
    }

    private data class ResponseData(val code: Int, val text: String?, val contentType: String?)

    private fun request(context: Context, path: String, method: String, body: ByteArray?, handle: RequestHandle? = null): ResponseData {
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
        handle?.attach(connection)
        try {
            if (body != null) connection.outputStream.use { it.write(body) }
            val code = connection.responseCode
            storeCookie(context, connection.getHeaderField("Set-Cookie"))
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { String(it.readBytes(), StandardCharsets.UTF_8) }
            return ResponseData(code, text, connection.contentType)
        } finally {
            handle?.detach(connection)
            connection.disconnect()
        }
    }

    fun toList(value: JSONObject?, key: String): List<String> {
        val array = value?.optJSONArray(key) ?: JSONArray()
        return buildList { for (i in 0 until array.length()) add(array.optString(i)) }
    }
}
