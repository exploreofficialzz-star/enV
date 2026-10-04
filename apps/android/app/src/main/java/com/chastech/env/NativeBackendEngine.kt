package com.chastech.env

import android.os.Build
import com.chastech.env.data.ToolRecord
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

object NativeBackendEngine {
    data class InputFile(val name:String,val mimeType:String,val bytes:ByteArray)
    data class Result(val text:String?=null,val bytes:ByteArray?=null,val mimeType:String?=null,val fileName:String?=null)
    private val base get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
    private val explicit = setOf("audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles","ocr-tool","pdf-to-word","dns-lookup","whois-lookup","website-screenshot")

    fun supports(tool:ToolRecord):Boolean = tool.id in explicit || tool.requiresBackend || tool.engine.type in setOf("pdf","url-media","url-media-info","video")

    fun execute(tool:ToolRecord,input:String,optionsJson:String,files:List<InputFile>):Result {
        val options=runCatching{JSONObject(optionsJson.ifBlank{"{}"})}.getOrElse{JSONObject()}
        return when {
            tool.id in setOf("audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles") -> {
                require(files.isNotEmpty()){ "Choose an audio or video file first." }
                multipart("/api/backend/transcribe",files.take(1),mapOf("mode" to if(tool.id.startsWith("video-"))"video" else "audio","format" to if(tool.id.endsWith("-subtitles"))"srt" else "txt","language" to options.optString("language","auto")))
            }
            tool.id=="ocr-tool" -> { require(files.isNotEmpty()){ "Choose an image or PDF first." }; multipart("/api/backend/ocr",files,mapOf("language" to options.optString("language","eng"))) }
            tool.id=="pdf-to-word" -> { require(files.isNotEmpty()){ "Choose a PDF first." }; multipart("/api/backend/pdf",files.take(1),mapOf("operation" to "pdf-to-word","params" to options.toString(),"outputName" to "pdf-to-word.docx")) }
            tool.id=="dns-lookup" || tool.id=="whois-lookup" -> postJson("/api/backend/network",JSONObject().apply{put("operation",if(tool.id=="dns-lookup")"dns" else "whois");put("domain",input);put("recordType",options.optString("recordType","A"))})
            tool.id=="website-screenshot" -> postJson("/api/backend/website-screenshot",JSONObject().apply{put("url",input);put("options",options)})
            tool.engine.type=="url-media" || tool.engine.type=="url-media-info" -> postJson("/api/backend/url-media/${if(tool.engine.type=="url-media-info")"info" else "download"}",JSONObject().apply{put("url",input);put("options",options)})
            tool.engine.type=="pdf" -> { require(files.isNotEmpty()){ "Choose a PDF first." }; multipart("/api/backend/pdf",files,mapOf("operation" to (tool.engine.extras["op"]?:"metadata"),"params" to options.toString(),"outputName" to "${tool.id}.pdf")) }
            tool.engine.type=="video" -> { require(files.isNotEmpty()){ "Choose a video first." }; multipart("/api/backend/media",files,mapOf("operation" to (tool.engine.extras["op"]?:tool.id),"params" to options.toString())) }
            else -> error("This backend operation is not configured.")
        }
    }

    private fun postJson(path:String,body:JSONObject):Result=request(path,body.toString().toByteArray(StandardCharsets.UTF_8),"application/json")
    private fun multipart(path:String,files:List<InputFile>,fields:Map<String,String>):Result {
        val boundary="----enV-${UUID.randomUUID()}"; val out=ByteArrayOutputStream()
        fun w(s:String)=out.write(s.toByteArray(StandardCharsets.UTF_8))
        fields.forEach{(k,v)->w("--$boundary\r\nContent-Disposition: form-data; name=\"$k\"\r\n\r\n$v\r\n")}
        files.forEach{f->w("--$boundary\r\nContent-Disposition: form-data; name=\"files\"; filename=\"${f.name.replace("\"","_")}\"\r\nContent-Type: ${f.mimeType}\r\n\r\n");out.write(f.bytes);w("\r\n")};w("--$boundary--\r\n")
        return request(path,out.toByteArray(),"multipart/form-data; boundary=$boundary")
    }
    private fun request(path:String,body:ByteArray,type:String):Result {
        val c=(URL(base+path).openConnection() as HttpURLConnection).apply{requestMethod="POST";doOutput=true;connectTimeout=20000;readTimeout=180000;setRequestProperty("Content-Type",type);setRequestProperty("Accept","application/json,application/octet-stream,text/plain")}
        c.outputStream.use{it.write(body)}
        val data=(if(c.responseCode in 200..299)c.inputStream else c.errorStream).use{it.readBytes()}; if(c.responseCode !in 200..299){val msg=runCatching{JSONObject(String(data)).optString("error")}.getOrNull();throw IllegalStateException(msg?.takeIf{it.isNotBlank()}?:"Backend request failed (${c.responseCode}).")}
        val mime=c.contentType?:"application/octet-stream"; return if(mime.contains("json"))Result(text=String(data),mimeType=mime) else Result(bytes=data,mimeType=mime,fileName=c.getHeaderField("Content-Disposition")?.substringAfter("filename=\"")?.substringBefore('"'))
    }
}
