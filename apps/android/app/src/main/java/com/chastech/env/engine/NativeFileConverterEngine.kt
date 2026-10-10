package com.chastech.env.engine

import android.graphics.BitmapFactory
import android.util.Base64
import com.chastech.env.data.ToolRecord
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream
import org.json.JSONArray
import org.json.JSONObject

object NativeFileConverterEngine {
    data class Result(val text: String? = null, val bytes: ByteArray? = null, val mime: String = "text/plain", val extension: String = "txt")
    private val imageOps = setOf("jpg-to-png","png-to-jpg","png-to-webp","webp-to-png","jpg-to-webp","webp-to-jpg","png-to-svg")
    private val documentOps = setOf("pdf-metadata-viewer","pdf-metadata-tool","pdf-page-extractor","pdf-splitter","pdf-rotator","pdf-merger","pdf-text-extractor","docx-text-extractor")
    fun supports(tool: ToolRecord): Boolean = (tool.engine.type == "file-converter" && op(tool) in setOf("csv-to-json","json-to-csv","csv-to-tsv","tsv-to-csv","xml-to-json","json-to-xml","yaml-to-json","json-to-yaml","txt-to-csv","csv-to-txt","markdown-to-html","html-to-markdown") + imageOps) || (tool.engine.type == "document-backend" && op(tool) in documentOps)
    private fun op(t: ToolRecord) = t.engine.extras["op"] ?: t.engine.id ?: t.id
    fun run(tool: ToolRecord, fileName: String, bytes: ByteArray): Result {
        val operation = op(tool)
        if (operation in documentOps) return document(operation, fileName, bytes)
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
    private fun document(op:String,name:String,data:ByteArray):Result {
        if (op == "docx-text-extractor") return Result(docxText(data), extension="txt", mime="text/plain")
        PDDocument.load(ByteArrayInputStream(data)).use { pdf ->
            if (op == "pdf-metadata-viewer" || op == "pdf-metadata-tool") return Result(JSONObject().put("pages",pdf.numberOfPages).put("title",pdf.documentInformation.title ?: "").put("author",pdf.documentInformation.author ?: "").toString(2), extension="json", mime="application/json")
            if (op == "pdf-text-extractor") { val text = com.tom_roush.pdfbox.text.PDFTextStripper().getText(pdf); return Result(text, extension="txt", mime="text/plain") }
            if (op == "pdf-rotator") { pdf.pages.forEach { it.rotation = (it.rotation + 90) % 360 }; val out=ByteArrayOutputStream(); pdf.save(out); return Result(bytes=out.toByteArray(),extension="pdf",mime="application/pdf") }
            val out=PDDocument(); val pages=if(op=="pdf-page-extractor"||op=="pdf-splitter") listOf(0) else (0 until pdf.numberOfPages).toList(); pages.forEach { out.importPage(pdf.getPage(it)) }; val outBytes=ByteArrayOutputStream(); out.save(outBytes); out.close(); return Result(bytes=outBytes.toByteArray(),extension="pdf",mime="application/pdf")
        }
    }
    private fun docxText(data:ByteArray):String { val xml=ZipInputStream(ByteArrayInputStream(data)).use { z -> var e=z.nextEntry; var result=""; while(e!=null){if(e.name=="word/document.xml") result=z.readBytes().toString(Charsets.UTF_8); e=z.nextEntry}; result }; require(xml.isNotEmpty()){ "This DOCX file does not contain word/document.xml." }; return xml.replace(Regex("<w:tab\\s*/?>"),"\t").replace(Regex("<w:br\\s*/?>"),"\n").replace("</w:p>","\n").replace(Regex("<w:t[^>]*>(.*?)</w:t>")){it.groupValues[1]}.replace(Regex("<[^>]+>"),"").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">").trim()+"\n" }
    private fun image(op:String,name:String,data:ByteArray):Result { if(op=="png-to-svg"){val image=BitmapFactory.decodeByteArray(data,0,data.size) ?: error("Unsupported PNG"); val b64=Base64.encodeToString(data,Base64.NO_WRAP); return Result("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${image.width}\" height=\"${image.height}\"><image href=\"data:image/png;base64,$b64\" width=\"100%\" height=\"100%\"/></svg>",extension="svg",mime="image/svg+xml")}; val bitmap=BitmapFactory.decodeByteArray(data,0,data.size) ?: error("Unsupported image"); val format=when{op.endsWith("png")->android.graphics.Bitmap.CompressFormat.PNG;op.endsWith("webp")->android.graphics.Bitmap.CompressFormat.WEBP;else->android.graphics.Bitmap.CompressFormat.JPEG}; val out=ByteArrayOutputStream(); bitmap.compress(format,92,out); return Result(bytes=out.toByteArray(),extension=if(format==android.graphics.Bitmap.CompressFormat.PNG)"png" else if(format==android.graphics.Bitmap.CompressFormat.WEBP)"webp" else "jpg",mime=if(format==android.graphics.Bitmap.CompressFormat.PNG)"image/png" else "image/jpeg") }
    private fun parseCsv(text:String,delimiter:Char=','):List<List<String>> { val rows=mutableListOf<MutableList<String>>(); var row=mutableListOf<String>(); val cell=StringBuilder(); var quote=false; var i=0; while(i<text.length){val c=text[i];if(c=='"'){if(quote&&i+1<text.length&&text[i+1]=='"'){cell.append('"');i++}else quote=!quote}else if(c==delimiter&&!quote){row.add(cell.toString());cell.clear()}else if((c=='\n'||c=='\r')&&!quote){if(c=='\r'&&i+1<text.length&&text[i+1]=='\n')i++;row.add(cell.toString());cell.clear();if(row.any{it.trim().isNotEmpty()})rows.add(row);row=mutableListOf()}else cell.append(c);i++};if(cell.isNotEmpty()||row.isNotEmpty()){row.add(cell.toString());if(row.any{it.trim().isNotEmpty()})rows.add(row)};return rows}
    private fun csvEscape(v:String)=if(v.any{it==','||it=='\n'||it=='\r'||it=='"'})"\"${v.replace("\"","\"\"")}\"" else v
    private fun rowsToCsv(rows:List<List<String>>,d:Char=',')=rows.joinToString("\r\n"){it.joinToString(d.toString(),transform=::csvEscape)}+"\r\n"
    private fun csvToJson(text:String):String { val rows=parseCsv(text);if(rows.isEmpty())return "[]";val heads=rows[0].mapIndexed{i,v->v.trim().ifEmpty{"column_${i+1}"}};return JSONArray().apply{rows.drop(1).forEach{r->put(JSONObject().apply{heads.forEachIndexed{i,h->put(h,r.getOrNull(i) ?: "")}})}}.toString(2) }
    private fun jsonRows(text:String):List<List<String>> { val raw=text.trim();val arr=if(raw.startsWith("["))JSONArray(raw) else JSONArray().put(JSONObject(raw));val keys=linkedSetOf<String>();for(i in 0 until arr.length())arr.optJSONObject(i)?.keys()?.forEach(keys::add);return listOf(keys.toList())+(0 until arr.length()).map{i->val o=arr.optJSONObject(i);keys.map{k->o?.opt(k)?.toString() ?: ""}} }
    private fun xmlToJson(text:String)=JSONObject().put("document",text.replace(Regex("<[^>]+>"),"").trim()).toString(2)
    private fun objectToXml(o:JSONObject,tag:String="root")=o.keys().asSequence().joinToString("",prefix="<$tag>",postfix="</$tag>"){k->"<$k>${o.get(k)}</$k>"}
    private fun simpleYaml(text:String)=JSONObject().apply{text.lines().forEach{l->if(l.contains(":")){val p=l.split(":",limit=2);put(p[0].trim(),p[1].trim())}}}.toString()
    private fun jsonToYaml(o:JSONObject)=o.keys().asSequence().joinToString("\n"){k->"$k: ${o.get(k)}"}
    private fun markdownToHtml(t:String)="<!doctype html><html><body>"+t.lines().joinToString("\n"){if(it.startsWith("# "))"<h1>${it.drop(2)}</h1>" else "<p>$it</p>"}+"</body></html>"
    private fun htmlToMarkdown(t:String)=t.replace(Regex("<h1[^>]*>(.*?)</h1>",RegexOption.IGNORE_CASE),"# $1\n\n").replace(Regex("<p[^>]*>(.*?)</p>",RegexOption.IGNORE_CASE),"$1\n\n").replace(Regex("<[^>]+>"),"").trim()
}
