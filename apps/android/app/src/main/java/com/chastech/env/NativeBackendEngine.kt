package com.chastech.env

import android.os.Build
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeDateTimeEngine
import com.chastech.env.engine.NativeMimeEngine
import com.chastech.env.engine.NativeUtilityEngine
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
    private val explicit = setOf("youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader")
    // Must match server/routes/api/backend/tool.post.ts CUSTOM_CATEGORIES exactly.
    // The previous broad set made unsupported tools look executable and return fabricated output.
    private val categoryBackend = setOf("personal","marketing","communication","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators")

    fun supports(tool:ToolRecord):Boolean {
        if (tool.engine.type == "developer" && NativeUtilityEngine.supports(tool)) return false
        if (tool.engine.type == "mime" && NativeMimeEngine.operationForTool(tool.id) != null) return false
        if (tool.engine.type == "datetime" && NativeDateTimeEngine.operationForTool(tool.id) != null) return false
        if (NativeBarcodeEngine.supports(tool)) return false
        return tool.id in explicit || tool.category in categoryBackend || tool.engine.type in setOf("developer","image","audio","video","mockup","post","pdf","document-backend")
    }

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
            tool.engine.type=="url-media" || tool.engine.type=="url-media-info" -> postJson("/api/backend/url-media/${if(tool.engine.type=="url-media-info")"info" else "download"}",urlMediaRequestBody(input,options))
            tool.category=="qr" || tool.category=="barcode" -> postJson("/api/backend/barcodes",JSONObject().apply{put("format",tool.id);put("toolId",tool.id);put("value",input)})
            tool.category=="mockups" -> postJson("/api/backend/mockups",JSONObject().apply{put("toolId",tool.id)})
            tool.category=="screenshots" -> { require(files.isNotEmpty()){ "Choose a screenshot first." }; multipart("/api/backend/screenshots",files,mapOf("operation" to tool.id)) }
            tool.engine.type=="image" -> { require(files.isNotEmpty()){ "Choose an image first." }; multipart("/api/backend/images",files.take(1),mapOf("operation" to (tool.engine.extras["op"] ?: tool.engine.id),"params" to options.toString(),"outputName" to "${tool.id}-output")) }
            tool.engine.type=="audio" || tool.engine.type=="video" -> { require(files.isNotEmpty()){ "Choose an audio or video file first." }; multipart("/api/backend/media",files,mapOf("operation" to ((tool.engine.extras["op"] ?: tool.engine.id) ?: tool.id),"params" to options.toString())) }
            tool.engine.type=="custom" || tool.engine.type=="developer" -> postJson("/api/backend/tool",JSONObject().apply{put("toolId",tool.id);put("category",tool.category);put("input",input);put("options",options)})
            tool.category in categoryBackend -> postJson("/api/backend/tool",JSONObject().apply{put("toolId",tool.id);put("category",tool.category);put("input",input);put("options",options)})
            tool.engine.type=="pdf" -> { require(files.isNotEmpty()){ "Choose a PDF first." }; multipart("/api/backend/pdf",files,mapOf("operation" to (tool.engine.extras["op"] ?: tool.engine.id),"params" to options.toString(),"outputName" to "${tool.id}.pdf")) }
            tool.engine.type=="document-backend" -> {
                require(files.isNotEmpty()){ "Choose the document or file required by this tool." }
                val operation = tool.engine.extras["op"] ?: tool.engine.id ?: tool.id
                multipart("/api/backend/documents",files,mapOf("operation" to operation,"params" to options.toString(),"outputName" to "$operation-output"),downloadResponse=true,documentResponse=true)
            }
            tool.engine.type=="video" -> { require(files.isNotEmpty()){ "Choose a video first." }; multipart("/api/backend/media",files,mapOf("operation" to (tool.engine.extras["op"]?:tool.id),"params" to options.toString())) }
            else -> error("This backend operation is not configured.")
        }
    }

    internal fun urlMediaRequestBody(input:String, options:JSONObject):JSONObject {
        val body=JSONObject()
        val keys=options.keys()
        while(keys.hasNext()) { val key=keys.next(); body.put(key,options.get(key)) }
        body.put("url",input)
        return body
    }
    private fun postJson(path:String,body:JSONObject):Result=request(path,body.toString().toByteArray(StandardCharsets.UTF_8),"application/json")
    private fun multipart(path:String,files:List<InputFile>,fields:Map<String,String>,downloadResponse:Boolean=false,documentResponse:Boolean=false):Result {
        val boundary="----enV-${UUID.randomUUID()}"; val out=ByteArrayOutputStream()
        fun w(s:String)=out.write(s.toByteArray(StandardCharsets.UTF_8))
        fields.forEach{(k,v)->w("--$boundary\r\nContent-Disposition: form-data; name=\"$k\"\r\n\r\n$v\r\n")}
        files.forEach{f->w("--$boundary\r\nContent-Disposition: form-data; name=\"files\"; filename=\"${f.name.replace("\"","_")}\"\r\nContent-Type: ${f.mimeType}\r\n\r\n");out.write(f.bytes);w("\r\n")};w("--$boundary--\r\n")
        return request(path,out.toByteArray(),"multipart/form-data; boundary=$boundary",downloadResponse,documentResponse)
    }
    private fun request(path:String,body:ByteArray,type:String,downloadResponse:Boolean=false,documentResponse:Boolean=false):Result {
        require(base.isNotBlank()) { "enV backend API is not configured for this build." }
        val c=(URL(base+path).openConnection() as HttpURLConnection).apply{requestMethod="POST";doOutput=true;connectTimeout=20000;readTimeout=180000;setRequestProperty("Content-Type",type);setRequestProperty("Accept","application/json,application/octet-stream,text/plain")}
        c.outputStream.use{it.write(body)}
        val data=(if(c.responseCode in 200..299)c.inputStream else c.errorStream).use{it.readBytes()}; if(c.responseCode !in 200..299){val msg=runCatching{JSONObject(String(data)).optString("error")}.getOrNull();throw IllegalStateException(msg?.takeIf{it.isNotBlank()}?:if(documentResponse)"Document service returned HTTP ${c.responseCode}." else "Backend request failed (${c.responseCode}).")}
        val mime=c.contentType?:"application/octet-stream"; val fileName=c.getHeaderField("Content-Disposition")?.substringAfter("filename=\"")?.substringBefore('"'); return if(!downloadResponse&&mime.contains("json"))Result(text=String(data),mimeType=mime) else Result(bytes=data,mimeType=mime,fileName=fileName)
    }
}
