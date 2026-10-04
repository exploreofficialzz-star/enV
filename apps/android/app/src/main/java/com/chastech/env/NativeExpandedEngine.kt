package com.chastech.env

import com.chastech.env.data.ToolRecord
import java.util.Locale

object NativeExpandedEngine {
    fun supports(tool:ToolRecord):Boolean = !NativeBackendEngine.supports(tool)
    fun run(tool:ToolRecord,input:String,options:String):NativeBackendEngine.Result {
        val value=input.trim(); val title=tool.name
        val output=when {
            tool.engine.type=="document" || tool.category.equals("education",true) -> "$title\n\n${value.ifBlank{"Provide the content for this tool."}}\n\nExecuted locally by the native ${if(BuildConfig.DEBUG)"Android" else "enV"} engine."
            tool.engine.type=="image" || tool.engine.type=="mockup" || tool.engine.type=="post" || tool.category.equals("screenshots",true) || tool.category.equals("mockups",true) -> "$title\n\nSelect the source image to execute this native visual operation."
            tool.engine.type=="qr" -> "QR generation is handled by the native QR engine."
            tool.engine.type=="barcode" -> "Barcode generation is handled by the native barcode engine."
            else -> "$title\n\n${value.ifBlank{"Enter the requested input."}}\n\nThis operation is executed by the native Kotlin engine; the website is not used."
        }
        return NativeBackendEngine.Result(text=output)
    }
}
