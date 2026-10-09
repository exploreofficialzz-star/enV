package com.chastech.env.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.chastech.env.data.ToolRecord
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

object NativeFileConverterEngine {
    data class Result(val text: String? = null, val bytes: ByteArray? = null, val mime: String = "text/plain", val extension: String = "txt")
    private val imageOps = setOf("jpg-to-png","png-to-jpg","png-to-webp","webp-to-png","jpg-to-webp","webp-to-jpg","png-to-svg")
    fun supports(tool: ToolRecord): Boolean = tool.engine.type == "file-converter" && op(tool) in setOf(
        "csv-to-json","json-to-csv","csv-to-tsv","tsv-to-csv","xml-to-json","json-to-xml","yaml-to-json","json-to-yaml","txt-to-csv","csv-to-txt","markdown-to-html","html-to-markdown"
    ) + imageOps
    private fun op(t: ToolRecord) = t.engine.extras["op"] ?: t.engine.id ?: t.id
    fun run(tool: ToolRecord, fileName: String, bytes: ByteArray): Result {
        val operation = op(tool)
        if (operation in imageOps) return image(operation, fileName, bytes)
        val input = bytes.toString(Charsets.UTF_8)
        return when (operation) {
            "csv-to-json" -> Result(csvToJson(input), extension="json", mime="application/json")
            "json-to-csv" -> Result(rowsToCsv(jsonRows(input)), extension="csv", mime="text/csv")
            "csv-to-tsv" -> Result(rowsToCsv(parseCsv(input), '\t'), extension="tsv", mime="text/tab-separated-values")
            "tsv-to-csv" -> Result(rowsToCsv(parseCsv(input, '\t')), extension="csv", mime="text/csv")
            "xml-to-json" -> Result(xmlToJson(input), extension="json", mime="application/json")
            "json-to-xml" -> Result("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + objectToXml(JSONObject(input)), extension="xml", mime="application/xml")
            "yaml-to-json" -> Result(JSONObject(simpleYaml(input)).toString(2), extension="json", mime="application/json")
            "json-to-yaml" -> Result(jsonToYaml(JSONObject(input)) + "\n", extension="yaml", mime="text/yaml")
            "txt-to-csv" -> Result(rowsToCsv(input.split(Regex("\\r?\\n")).filter(String::isNotEmpty).map(::listOf)), extension="csv", mime="text/csv")
            "csv-to-txt" -> Result(parseCsv(input).joinToString("\n") { it.joinToString(" ") } + "\n", extension="txt")
            "markdown-to-html" -> Result(markdownToHtml(input), extension="html", mime="text/html")
            "html-to-markdown" -> Result(htmlToMarkdown(input) + "\n", extension="md", mime="text/markdown")
            else -> error("Unsupported file conversion: $operation")
        }
    }
    private fun image(op:String,name:String,data:ByteArray):Result {
        if (op=="png-to-svg") { val b64=Base64.encodeToString(data,Base64.NO_WRAP); val image=BitmapFactory.decodeByteArray(data,0,data.size) ?: error("Selected file is not a supported PNG image."); return Result("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${image.width}\" height=\"${image.height}\" viewBox=\"0 0 ${image.width} ${image.height}\"><image href=\"data:image/png;base64,$b64\" width=\"100%\" height=\"100%\"/></svg>",extension="svg",mime="image/svg+xml") }
        val bitmap=BitmapFactory.decodeByteArray(data,0,data.size) ?: error("Selected file is not a supported image.")
        val (format,ext,mime)=when { op.endsWith("png") -> Triple(Bitmap.CompressFormat.PNG,"png","image/png"); op.endsWith("webp") -> Triple(Bitmap.CompressFormat.WEBP,"webp","image/webp"); else -> Triple(Bitmap.CompressFormat.JPEG,"jpg","image/jpeg") }
        val out=ByteArrayOutputStream(); bitmap.compress(format,92,out); return Result(bytes=out.toByteArray(),extension=ext,mime=mime)
    }
    private fun parseCsv(text:String,delimiter:Char=','):List<List<String>> { val rows=mutableListOf<MutableList<String>>(); var row=mutableListOf<String>(); val cell=StringBuilder(); var quote=false; var i=0; while(i<text.length){val c=text[i]; if(c=='"'){if(quote&&i+1<text.length&&text[i+1]=='"'){cell.append('"');i++}else quote=!quote}else if(c==delimiter&&!quote){row.add(cell.toString());cell.clear()}else if((c=='\n'||c=='\r')&&!quote){if(c=='\r'&&i+1<text.length&&text[i+1]=='\n')i++;row.add(cell.toString());cell.clear();if(row.any{it.trim().isNotEmpty()})rows.add(row);row=mutableListOf()}else cell.append(c);i++};if(cell.isNotEmpty()||row.isNotEmpty()){row.add(cell.toString());if(row.any{it.trim().isNotEmpty()})rows.add(row)};return rows}
    private fun csvEscape(v:String)=if(v.any{it==','||it=='\n'||it=='\r'||it=='"'})"\"${v.replace("\"","\"\"")}\"" else v
    private fun rowsToCsv(rows:List<List<String>>,d:Char=',')=rows.joinToString("\r\n"){it.joinToString(d.toString(),transform=::csvEscape)}+"\r\n"
    private fun csvToJson(text:String):String { val rows=parseCsv(text);if(rows.isEmpty())return "[]";val heads=rows[0].mapIndexed{i,v->v.trim().ifEmpty{"column_${i+1}"}};return JSONArray().apply{rows.drop(1).forEach{r->put(JSONObject().apply{heads.forEachIndexed{i,h->put(h,r.getOrNull(i) ?: "")}})}}.toString(2) }
    private fun jsonRows(text:String):List<List<String>> { val raw=text.trim(); val arr=if(raw.startsWith("["))JSONArray(raw) else JSONArray().put(JSONObject(raw)); val keys=linkedSetOf<String>();for(i in 0 until arr.length())arr.optJSONObject(i)?.keys()?.forEach(keys::add);return listOf(keys.toList())+(0 until arr.length()).map{i->val o=arr.optJSONObject(i);keys.map{k->o?.opt(k)?.let{if(it is JSONObject||it is JSONArray)it.toString() else it.toString()} ?: ""}}
    }
    private fun xmlToJson(text:String):String { val root=Regex("<([A-Za-z_][\\w.-]*)[^>]*>([\\s\\S]*)</\\1>").find(text.trim()) ?: error("Invalid XML."); return JSONObject().put(root.groupValues[1],root.groupValues[2].replace(Regex("<[^>]+>"),"").trim()).toString(2) }
    private fun objectToXml(o:JSONObject,tag:String="root"):String { val b=StringBuilder("<$tag>");o.keys().forEach{key->val v=o.get(key);val safe=key.replace(Regex("[^A-Za-z0-9_.-]"),"_");if(v is JSONObject)b.append(objectToXml(v,safe)) else b.append("<$safe>${xmlEsc(v.toString())}</$safe>")};return b.append("</$tag>").toString() }
    private fun xmlEsc(s:String)=s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;")
    private fun simpleYaml(text: String): String {
        val output = JSONObject()
        text.lines().forEach { raw ->
            val line = raw.replace(Regex("\\s+#.*"), "").trim()
            if (line.isNotEmpty() && !line.startsWith("#") && line.contains(":")) {
                val parts = line.split(":", limit = 2)
                val rawValue = parts[1].trim()
                val value: Any = when {
                    rawValue == "true" -> true
                    rawValue == "false" -> false
                    rawValue == "null" -> JSONObject.NULL
                    rawValue.matches(Regex("-?\\d+(\\.\\d+)?")) -> rawValue.toDouble()
                    else -> rawValue.trim('"', '\'')
                }
                output.put(parts[0].trim(), value)
            }
        }
        return output.toString()
    }
    private fun jsonToYaml(o:JSONObject,indent:String=""):String { val b=StringBuilder();o.keys().forEach{key->val v=o.get(key);b.append(indent).append(key).append(": ");if(v is JSONObject)b.append("\n").append(jsonToYaml(v,indent+"  ")) else b.append(if(v is String)"\"$v\"" else v).append("\n")};return b.toString().trimEnd() }
    private fun markdownToHtml(text:String)=buildString{append("<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>Converted document</title></head><body>\n");text.lines().forEach{l->when{l.startsWith("### ")->append("<h3>${htmlEsc(l.drop(4))}</h3>");l.startsWith("## ")->append("<h2>${htmlEsc(l.drop(3))}</h2>");l.startsWith("# ")->append("<h1>${htmlEsc(l.drop(2))}</h1>");l.startsWith("- ")->append("<li>${htmlEsc(l.drop(2))}</li>");l.isBlank()->append("\n");else->append("<p>${htmlEsc(l).replace(Regex("\\*\\*(.+?)\\*\\*"),"<strong>$1</strong>")}</p>\n")}};append("</body></html>\n")}
    private fun htmlToMarkdown(text:String)=text.replace(Regex("<script[\\s\\S]*?</script>",RegexOption.IGNORE_CASE),"").replace(Regex("<style[\\s\\S]*?</style>",RegexOption.IGNORE_CASE),"").replace(Regex("<h1[^>]*>(.*?)</h1>",RegexOption.IGNORE_CASE),"# $1\n\n").replace(Regex("<h2[^>]*>(.*?)</h2>",RegexOption.IGNORE_CASE),"## $1\n\n").replace(Regex("<h3[^>]*>(.*?)</h3>",RegexOption.IGNORE_CASE),"### $1\n\n").replace(Regex("<strong[^>]*>(.*?)</strong>",RegexOption.IGNORE_CASE),"**$1**").replace(Regex("<li[^>]*>(.*?)</li>",RegexOption.IGNORE_CASE),"- $1\n").replace(Regex("<p[^>]*>(.*?)</p>",RegexOption.IGNORE_CASE),"$1\n\n").replace(Regex("<[^>]+>"),"").replace(Regex("\n{3,}"),"\n\n").trim()
    private fun htmlEsc(s:String)=s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
}
