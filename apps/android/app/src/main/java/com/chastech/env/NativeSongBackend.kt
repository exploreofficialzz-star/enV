package com.chastech.env

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Heavy audio jobs use the same bounded backend contract as the web client. */
internal object NativeSongBackend {
    data class Result(val id: String, val report: JSONObject)
    private val base get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/') + "/api/song"
    private val idPattern = Regex("^[a-f0-9]{32}$")

    private fun connection(path: String, method: String = "GET"): HttpURLConnection {
        val url = URL(base + path)
        require(url.protocol == "https" || (url.protocol == "http" && url.host in setOf("localhost", "127.0.0.1", "10.0.2.2"))) { "Use a secure song backend address." }
        return (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method; instanceFollowRedirects = false
            connectTimeout = 12_000; readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
        }
    }

    private fun json(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer); if (count < 0) break
                    require(output.size() + count <= 8 * 1024 * 1024) { "Backend response was too large." }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            } ?: byteArrayOf()
            val payload = runCatching { JSONObject(String(bytes, Charsets.UTF_8)) }.getOrElse { JSONObject() }
            if (status !in 200..299) error(payload.optString("detail").ifBlank { payload.optString("error").ifBlank { "Backend returned HTTP $status." } })
            return payload
        } finally { connection.disconnect() }
    }

    suspend fun available(): Boolean = withContext(Dispatchers.IO) {
        try {
            val health = json(connection("/v1/health"))
            health.optString("location") == "remote_backend" && health.optBoolean("ffmpeg") && health.optBoolean("tagger_installed") && health.optBoolean("transcription_configured") && health.optBoolean("stems_configured")
        } catch (error: Exception) { if (error is CancellationException) throw error; false }
    }

    suspend fun analyze(audio: ByteArray, separate: Boolean, onProgress: suspend (String) -> Unit): Result = withContext(Dispatchers.IO) {
        require(audio.isNotEmpty() && audio.size <= 50 * 1024 * 1024) { "Backend audio must be between 1 byte and 50 MB." }
        currentCoroutineContext().ensureActive()
        val boundary = "env-song-${UUID.randomUUID()}"
        val options = JSONObject().put("tagging", true).put("transcription", true).put("stems", separate).put("pieces", separate).put("llm", false).toString()
        val start = "--$boundary\r\nContent-Disposition: form-data; name=\"options\"\r\n\r\n$options\r\n--$boundary\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"song.audio\"\r\nContent-Type: application/octet-stream\r\n\r\n".toByteArray(Charsets.UTF_8)
        val end = "\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8)
        onProgress("Sending audio to the backend")
        val upload = connection("/v1/jobs", "POST").apply {
            doOutput = true; setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setFixedLengthStreamingMode(start.size.toLong() + audio.size + end.size)
        }
        try {
            upload.outputStream.use { output ->
                output.write(start)
                var offset = 0
                while (offset < audio.size) {
                    currentCoroutineContext().ensureActive()
                    val count = minOf(64 * 1024, audio.size - offset)
                    output.write(audio, offset, count); offset += count
                }
                output.write(end)
            }
        } catch (error: Exception) { upload.disconnect(); throw error }
        val id = json(upload).optString("id")
        require(idPattern.matches(id)) { "The backend returned an invalid job." }
        var complete = false
        try {
            while (true) {
                currentCoroutineContext().ensureActive()
                val job = json(connection("/v1/jobs/$id"))
                onProgress("Backend: ${job.optString("stage", "Processing")} · ${job.optInt("progress")}%")
                when (job.optString("state")) {
                    "completed", "partial" -> {
                        val result = job.optJSONObject("result") ?: error("Backend returned no results.")
                        val processing = result.optJSONObject("processing") ?: JSONObject()
                        require(processing.optString("location") == "remote_backend" && processing.optBoolean("hosted_inference")) { "Backend result has invalid provenance." }
                        if (separate) {
                            val artifacts = result.optJSONArray("artifacts") ?: org.json.JSONArray()
                            require((0 until artifacts.length()).count { artifacts.optJSONObject(it)?.optString("kind") == "stem" } == 4) { "The backend could not create all four stems." }
                        }
                        complete = true
                        return@withContext Result(id, result)
                    }
                    "failed", "cancelled" -> error(job.optString("error").ifBlank { "Backend analysis failed." })
                }
                delay(2_000)
            }
            @Suppress("UNREACHABLE_CODE") error("Backend stopped.")
        } finally {
            if (!complete) withContext(NonCancellable + Dispatchers.IO) {
                runCatching { json(connection("/v1/jobs/$id/cancel", "POST").apply { doOutput = true; setFixedLengthStreamingMode(0); outputStream.close() }) }
            }
        }
    }

    fun artifactUrl(id: String, name: String): String {
        require(idPattern.matches(id) && name.split('/').all { it != "." && it != ".." && it.matches(Regex("[A-Za-z0-9_.-]+")) }) { "Invalid stem." }
        return "$base/v1/jobs/$id/artifacts/$name"
    }
}
