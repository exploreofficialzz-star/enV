package com.chastech.env

import android.graphics.Paint
import android.graphics.BitmapFactory
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import android.webkit.WebView
import androidx.core.graphics.PathParser
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URL
import java.net.URLEncoder
import kotlin.math.min
import kotlin.math.roundToInt

private data class UxUiNativeLayer(
    val id: String, val kind: String, val name: String, val x: Int, val y: Int, val width: Int, val height: Int,
    val text: String, val color: String = "#111827", val fill: String = "transparent", val iconName: String = "", val iconSvg: String = "", val imageData: String = "",
    val fontFamily: String = "sans-serif", val fontSize: Int = 16, val fontWeight: Int = 400,
    val radius: Int = 12, val borderColor: String = "#E5E7EB", val borderWidth: Int = 0, val padding: Int = 12,
    val marginTop: Int = 0, val marginRight: Int = 0, val marginBottom: Int = 0, val marginLeft: Int = 0,
    val horizontalConstraint: String = "left", val verticalConstraint: String = "top",
    val minWidth: Int = 0, val maxWidth: Int = 0, val visibleOn: String = "mobile,tablet,desktop",
    val referenceWidth: Int = 390, val referenceHeight: Int = 844, val componentKey: String = "",
    val iconViewBox: String = "0 0 24 24"
)

private fun uxNativeLayerX(layer: UxUiNativeLayer, boardWidth: Int): Int = when(layer.horizontalConstraint) {
    "center" -> layer.x + (boardWidth - layer.referenceWidth) / 2
    "right" -> boardWidth - (layer.referenceWidth - layer.x)
    else -> layer.x
}
private fun uxNativeLayerY(layer: UxUiNativeLayer, boardHeight: Int): Int = when(layer.verticalConstraint) {
    "center" -> layer.y + (boardHeight - layer.referenceHeight) / 2
    "bottom" -> boardHeight - (layer.referenceHeight - layer.y)
    else -> layer.y
}
private fun uxNativeLayerWidth(layer: UxUiNativeLayer, boardWidth: Int): Int {
    val width = if(layer.horizontalConstraint=="stretch") layer.width + (boardWidth-layer.referenceWidth) else layer.width
    return width.coerceAtLeast(layer.minWidth.coerceAtLeast(1)).let{if(layer.maxWidth>0)it.coerceAtMost(layer.maxWidth)else it}
}
private fun uxNativeLayerHeight(layer: UxUiNativeLayer, boardHeight: Int): Int =
    (if(layer.verticalConstraint=="stretch")layer.height+(boardHeight-layer.referenceHeight)else layer.height).coerceAtLeast(1)

private fun uxNativeColor(hex: String, fallback: Int = android.graphics.Color.WHITE): Color =
    Color(runCatching { android.graphics.Color.parseColor(hex) }.getOrDefault(fallback))

private fun uxNativeCleanIconSvg(svg: String): String =
    svg
        .replace(Regex("(?is)<script\\b[^>]*>.*?</script\\s*>"), "")
        .replace(Regex("(?is)<foreignObject\\b[^>]*>.*?</foreignObject\\s*>"), "")
        .replace(Regex("(?i)\\s+on[a-z]+\\s*=\\s*(['\\\"]).*?\\1"), "")

private fun uxNativeSafeIconSvg(svg: String, color: String): String {
    val safeColor = if (Regex("^#[0-9A-Fa-f]{3,8}$").matches(color)) color else "#111827"
    return uxNativeCleanIconSvg(svg).replace(Regex("(?i)currentColor"), safeColor)
}

private fun uxNativeIconHtml(svg: String, color: String): String =
    "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block;width:100%;height:100%}</style></head><body>" +
        uxNativeSafeIconSvg(svg, color) + "</body></html>"

private fun uxNativeImageHtml(dataUrl: String): String {
    val valid = Regex("^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$", RegexOption.IGNORE_CASE).matches(dataUrl)
    val source = if (valid) dataUrl else ""
    return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img alt='' src='" + source + "'></body></html>"
}

private fun uxNativeDrawSvgIcon(canvas: android.graphics.Canvas, element: UxUiNativeLayer) {
    if (element.iconSvg.isBlank()) return
    val viewBoxText = Regex("viewBox\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]", RegexOption.IGNORE_CASE)
        .find(element.iconSvg)?.groupValues?.getOrNull(1)
    val viewBox = viewBoxText?.trim()?.split(Regex("\\s+"))?.mapNotNull { it.toFloatOrNull() }
    val vx = viewBox?.getOrNull(0) ?: 0f
    val vy = viewBox?.getOrNull(1) ?: 0f
    val vw = (viewBox?.getOrNull(2) ?: 24f).takeIf { it > 0f } ?: 24f
    val vh = (viewBox?.getOrNull(3) ?: 24f).takeIf { it > 0f } ?: 24f
    val pathData = Regex("(?is)<path\\b([^>]*)>").findAll(element.iconSvg).mapNotNull { match ->
        val attributes = match.groupValues[1]
        val d = Regex("(?is)\\bd\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]").find(attributes)?.groupValues?.getOrNull(1) ?: return@mapNotNull null
        val fill = Regex("(?is)\\bfill\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]").find(attributes)?.groupValues?.getOrNull(1).orEmpty()
        d to fill
    }.toList()
    if (pathData.isEmpty()) return
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    canvas.save()
    canvas.translate(element.x.toFloat(), element.y.toFloat())
    canvas.scale(element.width.toFloat() / vw, element.height.toFloat() / vh)
    canvas.translate(-vx, -vy)
    pathData.forEach { (d, svgFill) ->
        if (svgFill.equals("none", ignoreCase=true)) return@forEach
        val fill = if (svgFill.isBlank() || svgFill.equals("currentColor", ignoreCase=true)) element.color else svgFill
        paint.color = runCatching { android.graphics.Color.parseColor(fill) }
            .getOrDefault(runCatching { android.graphics.Color.parseColor(element.color) }.getOrDefault(android.graphics.Color.BLACK))
        runCatching { PathParser.createPathFromPathData(d) }.getOrNull()?.let { path -> canvas.drawPath(path, paint) }
    }
    canvas.restore()
}

private fun uxNativeJson(elements: List<UxUiNativeLayer>): JSONArray = JSONArray().apply {
    elements.forEach { element -> put(JSONObject().apply {
        put("id", element.id); put("kind", element.kind); put("name", element.name)
        put("x", element.x); put("y", element.y); put("width", element.width); put("height", element.height)
        put("text", element.text); put("color", element.color); put("fill", element.fill); put("iconName", element.iconName); put("iconSvg", element.iconSvg); put("imageData", element.imageData)
        put("fontFamily", element.fontFamily); put("fontSize", element.fontSize); put("fontWeight", element.fontWeight)
        put("radius", element.radius); put("borderColor", element.borderColor); put("borderWidth", element.borderWidth); put("padding", element.padding)
        put("marginTop", element.marginTop); put("marginRight", element.marginRight); put("marginBottom", element.marginBottom); put("marginLeft", element.marginLeft)
        put("horizontalConstraint", element.horizontalConstraint); put("verticalConstraint", element.verticalConstraint)
        put("minWidth", element.minWidth); put("maxWidth", element.maxWidth); put("visibleOn", element.visibleOn)
        put("referenceWidth", element.referenceWidth); put("referenceHeight", element.referenceHeight); put("componentKey", element.componentKey)
        put("iconViewBox", element.iconViewBox)
    }) }
}

private fun uxNativeReadJson(elements: JSONArray): List<UxUiNativeLayer> = buildList {
    for (index in 0 until elements.length()) {
        val item = elements.optJSONObject(index) ?: continue
        add(UxUiNativeLayer(
            id=item.optString("id","layer-"+index),kind=item.optString("kind","text"),name=item.optString("name","Layer"),
            x=item.optInt("x"),y=item.optInt("y"),width=item.optInt("width",180).coerceAtLeast(1),height=item.optInt("height",48).coerceAtLeast(1),
            text=item.optString("text"),color=item.optString("color","#111827"),fill=item.optString("fill","transparent"),iconName=item.optString("iconName"),iconSvg=item.optString("iconSvg"),imageData=item.optString("imageData"),
            fontFamily=item.optString("fontFamily","sans-serif"),fontSize=item.optInt("fontSize",16).coerceAtLeast(1),fontWeight=item.optInt("fontWeight",400),
            radius=item.optInt("radius",12),borderColor=item.optString("borderColor","#E5E7EB"),borderWidth=item.optInt("borderWidth"),padding=item.optInt("padding",12),
            marginTop=item.optInt("marginTop"),marginRight=item.optInt("marginRight"),marginBottom=item.optInt("marginBottom"),marginLeft=item.optInt("marginLeft"),
            horizontalConstraint=item.optString("horizontalConstraint","left"),verticalConstraint=item.optString("verticalConstraint","top"),
            minWidth=item.optInt("minWidth"),maxWidth=item.optInt("maxWidth"),visibleOn=item.optString("visibleOn","mobile,tablet,desktop"),
            referenceWidth=item.optInt("referenceWidth",390),referenceHeight=item.optInt("referenceHeight",844),componentKey=item.optString("componentKey"),
            iconViewBox=item.optString("iconViewBox","0 0 24 24")
        ))
    }
}

private fun uxNativePreset(target: String, preset: String): List<UxUiNativeLayer> {
    fun el(id:String,kind:String,name:String,x:Int,y:Int,w:Int,h:Int,text:String,color:String="#111827",fill:String="transparent",size:Int=16,weight:Int=400,radius:Int=12) =
        UxUiNativeLayer(id,kind,name,x,y,w,h,text,color,fill,fontSize=size,fontWeight=weight,radius=radius)
    return when(preset) {
        "mobile-login" -> listOf(
            el("brand","text","Brand",28,70,334,38,"enV","#2563EB",size=28,weight=700),
            el("title","text","Welcome title",28,150,334,40,"Welcome back",size=26,weight=700),
            el("subtitle","text","Subtitle",28,194,334,44,"Sign in to continue to your workspace.","#64748B",size=14),
            el("email","input","Email field",28,270,334,48,"name@example.com","#64748B","#FFFFFF",14),
            el("password","input","Password field",28,338,334,48,"Enter your password","#64748B","#FFFFFF",14),
            el("button","button","Sign in",28,414,334,50,"Sign in","#FFFFFF","#2563EB",15,600)
        )
        "tablet-dashboard" -> listOf(
            el("nav","navbar","Navigation",24,24,720,64,"enV                        Search                         Profile",fill="#FFFFFF",weight=600),
            el("heading","text","Overview",32,112,680,42,"Overview",size=28,weight=700),
            el("metric1","card","Monthly usage",32,180,215,130,"Monthly usage\\n12,840 events",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("metric2","card","Active projects",268,180,215,130,"Active projects\\n24 in progress",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("metric3","card","Completion rate",504,180,232,130,"Completion rate\\n86.4%",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("activity","card","Activity",32,334,450,300,"Recent activity\\n\\nYour timeline and data visualization.",fill="#FFFFFF",size=16,weight=600,radius=18),
            el("actions","card","Quick actions",500,334,236,300,"Quick actions\\n\\nCreate project\\nReview activity",fill="#FFFFFF",size=15,weight=600,radius=18)
        )
        "tablet-settings" -> listOf(
            el("nav","navbar","Navigation",24,24,720,64,"enV                         Settings                         Profile",fill="#FFFFFF",weight=600),
            el("heading","text","Settings",32,112,680,42,"Settings",size=28,weight=700),
            el("preferences","card","Preferences",32,176,215,420,"Preferences\\n\\nProfile\\nNotifications\\nAppearance\\nSecurity",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("details","card","Account preferences",268,176,468,420,"Account preferences\\n\\nManage personal details and app settings.",fill="#FFFFFF",size=15,weight=600,radius=16)
        )
        "desktop-dashboard" -> listOf(
            el("nav","navbar","Navigation",20,20,1396,66,"enV                           Search projects                         Help  Profile",fill="#FFFFFF",weight=600),
            el("heading","text","Overview",60,118,700,42,"Overview",size=30,weight=700),
            el("metric1","card","Monthly usage",60,220,310,136,"Monthly usage\n12,840 events",fill="#FFFFFF",size=18,weight=600,radius=18),
            el("metric2","card","Active projects",396,220,310,136,"Active projects\n24 in progress",fill="#FFFFFF",size=18,weight=600,radius=18),
            el("metric3","card","Completion rate",732,220,310,136,"Completion rate\n86.4%",fill="#FFFFFF",size=18,weight=600,radius=18),
            el("activity","card","Activity",60,386,890,300,"Recent activity\n\nYour timeline and data visualization.","#111827","#FFFFFF",18,600,18)
        )
        "desktop-settings" -> listOf(
            el("nav","navbar","Navigation",20,20,1400,60,"enV                         Search settings                         Help  Profile",fill="#FFFFFF",weight=600),
            el("heading","text","Settings",60,114,600,42,"Settings",size=30,weight=700),
            el("row1","row","Profile and account",60,224,850,64,"Profile and account\nName, email and profile details",fill="#FFFFFF",size=15,weight=600),
            el("row2","row","Appearance",60,302,850,64,"Appearance\nTheme and interface preferences",fill="#FFFFFF",size=15,weight=600),
            el("row3","row","Notifications",60,380,850,64,"Notifications\nEmail and product updates",fill="#FFFFFF",size=15,weight=600)
        )
        "desktop-landing" -> listOf(
            el("nav","navbar","Navigation",44,26,1352,68,"NOVA                   Product   Solutions   Resources              Sign in   Get started",fill="#FFFFFF",weight=600),
            el("hero","text","Hero headline",95,160,780,110,"Design better experiences, faster.",size=48,weight=700),
            el("copy","text","Hero copy",98,288,690,68,"A flexible workspace for teams to shape, test and ship thoughtful digital products.","#64748B",size=18),
            el("cta","button","Primary action",98,386,180,52,"Start designing","#FFFFFF","#2563EB",15,600),
            el("preview","card","Preview panel",875,166,420,290,"Your next big idea\n\nBuild interfaces with a clear design system.","#111827","#F8FAFC",22,600,24)
        )
        else -> listOf(
            el("nav","navbar","App header",20,22,350,56,"enV                                  ◉",fill="#FFFFFF",weight=600),
            el("greeting","text","Greeting",24,100,340,30,"Good morning","#64748B",size=14),
            el("heading","text","Dashboard title",24,130,340,44,"Your workspace",size=27,weight=700),
            el("balance","card","Balance card",24,202,342,146,"TOTAL ACTIVITY\n\n12,840\n↑ 12.8% from last month","#FFFFFF","#1D4ED8",16,600,20),
            el("quick1","card","Create project",24,414,160,110,"＋\nCreate project",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("quick2","card","View reports",202,414,164,110,"▤\nView reports",fill="#FFFFFF",size=15,weight=600,radius=16),
            el("row1","row","Website refresh",24,602,342,64,"Website refresh\nUpdated 12 minutes ago",fill="#FFFFFF",size=14),
            el("row2","row","Mobile onboarding",24,676,342,64,"Mobile onboarding\nUpdated yesterday",fill="#FFFFFF",size=14),
            el("tabs","tabbar","Bottom navigation",20,766,350,54,"Home       Search       Activity       Profile",fill="#FFFFFF",size=12,weight=600)
        )
    }
}

private fun uxNativePrompt(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,boardWidth:Int=if(target=="mobile")390 else if(target=="tablet")768 else 1440,boardHeight:Int=if(target=="mobile")844 else if(target=="tablet")1024 else 900,tokenSpec:JSONObject=JSONObject(),breakpoints:JSONObject=JSONObject().put("mobile",480).put("tablet",768).put("desktop",1024)):String = buildString {
    appendLine("Implement this interface faithfully; numeric values and named assets are authoritative.")
    appendLine("Project: "+name);appendLine("Target: "+target)
    appendLine("Artboard: "+boardWidth+" x "+boardHeight+" CSS pixels")
    appendLine("Responsive breakpoints: "+breakpoints.toString())
    appendLine("Canvas background: "+background)
    appendLine("Design tokens: "+tokenSpec.toString())
    appendLine("Keep exact text, coordinates, dimensions, font, weight, colors, margins, padding, borders, radius, and icon IDs. Coordinates start at the artboard top-left.")
    appendLine("Preserve per-layer horizontal/vertical constraints, min/max width, reference viewport and target visibility.")
    appendLine();appendLine("ELEMENT SPECIFICATIONS")
    elements.forEachIndexed { index,e ->
        appendLine((index+1).toString()+". "+e.name+" ["+e.kind+"]")
        appendLine("id="+e.id+"; x="+e.x+"px; y="+e.y+"px; width="+e.width+"px; height="+e.height+"px")
        appendLine("text="+JSONObject.quote(e.text)+"; icon="+e.iconName+"; iconViewBox="+e.iconViewBox+"; color="+e.color+"; fill="+e.fill)
        appendLine("font="+e.fontFamily+"; size="+e.fontSize+"px; weight="+e.fontWeight+"; radius="+e.radius+"px; border="+e.borderColor+" "+e.borderWidth+"px")
        appendLine("padding="+e.padding+"px; margins top/right/bottom/left="+e.marginTop+"/"+e.marginRight+"/"+e.marginBottom+"/"+e.marginLeft+"px")
        appendLine("constraints horizontal="+e.horizontalConstraint+"; vertical="+e.verticalConstraint+"; minWidth="+e.minWidth+"; maxWidth="+e.maxWidth+"; visibleOn="+e.visibleOn+"; referenceViewport="+e.referenceWidth+"x"+e.referenceHeight+"; componentKey="+e.componentKey)
    }
    appendLine();appendLine("Acceptance: match the reference viewport; do not replace exact measurements or icons with generic alternatives.")
}

private fun uxNativeProjectJson(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,boardWidth:Int=if(target=="mobile")390 else if(target=="tablet")768 else 1440,boardHeight:Int=if(target=="mobile")844 else if(target=="tablet")1024 else 900,tokens:JSONObject=JSONObject(),reusable:JSONArray=JSONArray()):String {
    val breakpoints=JSONObject().put("mobile",480).put("tablet",768).put("desktop",1024)
    val normalized=JSONArray().apply {
        elements.forEach { item ->
            val json=uxNativeJson(listOf(item)).optJSONObject(0) ?: JSONObject()
            json.put("background",item.fill)
            json.put("imageDataUrl",item.imageData)
            json.put("schemaElementVersion",2)
            put(json)
        }
    }
    return JSONObject().put("schemaVersion",2).put("name",name).put("target",target).put("background",background)
        .put("viewport",JSONObject().put("width",boardWidth).put("height",boardHeight))
        .put("breakpoints",breakpoints).put("tokens",tokens).put("reusableComponents",reusable)
        .put("elements",normalized).put("aiPrompt",uxNativePrompt(name,target,background,elements,boardWidth,boardHeight,tokens,breakpoints))
        .put("generatedCode",JSONObject()
            .put("html",uxNativeGenerateHtml(name,target,background,elements,boardWidth,boardHeight,tokens,breakpoints))
            .put("kotlin",uxNativeGenerateKotlin(name,target,background,elements,boardWidth,boardHeight))
            .put("swift",uxNativeGenerateSwift(name,target,background,elements,boardWidth,boardHeight)))
        .put("updatedAt",System.currentTimeMillis()).toString(2)
}


private fun uxNativeSafeIdentifier(name:String):String =
    name.split(Regex("[^A-Za-z0-9]+")).filter{it.isNotBlank()}.joinToString(""){it.replaceFirstChar{c->c.uppercase()}}.ifBlank{"EnVDesign"}

private fun uxNativeGenerateHtml(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,width:Int,height:Int,tokens:JSONObject,breakpoints:JSONObject):String {
    val body=elements.joinToString("\n"){e->
        val rw=e.referenceWidth.coerceAtLeast(1);val rh=e.referenceHeight.coerceAtLeast(1)
        val hx=when(e.horizontalConstraint){"right"->"right:"+ (rw-e.x-e.width).coerceAtLeast(0)+"px";"center"->"left:calc("+e.x+"px + (100cqw - "+rw+"px)/2)";else->"left:"+e.x+"px"}
        val vy=when(e.verticalConstraint){"bottom"->"bottom:"+ (rh-e.y-e.height).coerceAtLeast(0)+"px";"center"->"top:calc("+e.y+"px + (100cqh - "+rh+"px)/2)";else->"top:"+e.y+"px"}
        val vw=if(e.horizontalConstraint=="stretch")"width:calc("+e.width+"px + (100cqw - "+rw+"px))" else "width:"+e.width+"px"
        val vh=if(e.verticalConstraint=="stretch")"height:calc("+e.height+"px + (100cqh - "+rh+"px))" else "height:"+e.height+"px"
        val css="position:absolute;"+hx+";"+vy+";"+vw+";"+vh+";box-sizing:border-box;padding:"+e.padding+"px;color:"+e.color+";background:"+(if(e.fill=="transparent")"transparent" else e.fill)+";border:"+e.borderWidth+"px solid "+(if(e.borderWidth>0)e.borderColor else "transparent")+";border-radius:"+e.radius+"px;font-family:"+e.fontFamily+";font-size:"+e.fontSize+"px;font-weight:"+e.fontWeight+";line-height:1.35;white-space:pre-wrap;overflow:hidden;"+(if(e.minWidth>0)"min-width:"+e.minWidth+"px;" else "")+(if(e.maxWidth>0)"max-width:"+e.maxWidth+"px;" else "")
        val common="class='env-layer' data-visible-on='"+e.visibleOn+"' style='"+css+"'"
        when(e.kind) {
            "icon" -> "<div "+common+" aria-label='"+e.name+"'>"+(if(e.iconSvg.isNotBlank())e.iconSvg else e.iconName)+"</div>"
            "image" -> "<div "+common+">"+(if(e.imageData.isNotBlank())"<img alt='"+e.name+"' src='"+e.imageData+"' style='width:100%;height:100%;object-fit:cover'>" else e.text)+"</div>"
            "input","search","textarea" -> "<div "+common+"><input aria-label='"+e.name+"' placeholder='"+e.text+"' style='width:100%;height:100%;font:inherit;color:inherit;background:transparent;border:0'></div>"
            "button" -> "<button type='button' "+common+">"+e.text+"</button>"
            else -> "<div "+common+">"+e.text+"</div>"
        }
    }
    val mobile=breakpoints.optInt("mobile",480);val desktop=breakpoints.optInt("desktop",1024)
    return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+name+"</title><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#f1f5f9;font-family:Inter,system-ui,sans-serif}.env-artboard{position:relative;container-type:size;width:min(100%,"+width+"px);aspect-ratio:"+width+"/"+height+";margin:0 auto;background:"+background+";overflow:hidden}@media(max-width:"+mobile+"px){.env-layer:not([data-visible-on~='mobile']){display:none!important}}@media(min-width:"+(mobile+1)+"px) and (max-width:"+(desktop-1)+"px){.env-layer:not([data-visible-on~='tablet']){display:none!important}}@media(min-width:"+desktop+"px){.env-layer:not([data-visible-on~='desktop']){display:none!important}}</style></head><body><main class='env-artboard' aria-label='"+name+" design'>"+body+"</main></body></html>"
}

private fun uxNativeGenerateKotlin(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,width:Int,height:Int):String = buildString {
    appendLine("// Generated by enV UX/UI Studio. Review app theme and run platform tests before shipping.")
    appendLine("import android.webkit.WebView")
    appendLine("import androidx.compose.foundation.background")
    appendLine("import androidx.compose.foundation.layout.*")
    appendLine("import androidx.compose.foundation.shape.RoundedCornerShape")
    appendLine("import androidx.compose.material3.Text")
    appendLine("import androidx.compose.runtime.Composable")
    appendLine("import androidx.compose.ui.Modifier")
    appendLine("import androidx.compose.ui.graphics.Color")
    appendLine("import androidx.compose.ui.text.font.FontWeight")
    appendLine("import androidx.compose.ui.unit.dp")
    appendLine("import androidx.compose.ui.unit.sp")
    appendLine("import androidx.compose.ui.viewinterop.AndroidView")
    appendLine()
    appendLine("@Composable fun "+uxNativeSafeIdentifier(name)+"Design(target: String = "+JSONObject.quote(target)+") {")
    appendLine("  BoxWithConstraints(Modifier.fillMaxWidth().height("+height+".dp)) {")
    appendLine("    val widthDelta = maxWidth.value - "+width+".f")
    appendLine("    val heightDelta = maxHeight.value - "+height+".f")
    appendLine("    Box(Modifier.fillMaxSize().background(Color(android.graphics.Color.parseColor("+JSONObject.quote(background)+")))) {")
    elements.forEach { e ->
        val x=when(e.horizontalConstraint){"center"->"("+e.x+".f + widthDelta/2f)";"right"->"(maxWidth.value - "+(e.referenceWidth-e.x-e.width).coerceAtLeast(0)+".f - "+e.width+".f)";else->e.x+".f"}
        val y=when(e.verticalConstraint){"center"->"("+e.y+".f + heightDelta/2f)";"bottom"->"(maxHeight.value - "+(e.referenceHeight-e.y-e.height).coerceAtLeast(0)+".f - "+e.height+".f)";else->e.y+".f"}
        var w=if(e.horizontalConstraint=="stretch")"("+e.width+".f + widthDelta).coerceAtLeast("+e.minWidth.coerceAtLeast(1)+".f)" else e.width+".f"
        if(e.horizontalConstraint=="stretch"&&e.maxWidth>0)w+=".coerceAtMost("+e.maxWidth+".f)"
        val h=if(e.verticalConstraint=="stretch")"("+e.height+".f + heightDelta).coerceAtLeast(1f)" else e.height+".f"
        val fill=if(e.fill=="transparent")background else e.fill
        appendLine("      // "+e.name.replace("\n"," ")+"; "+e.kind+"; anchors "+e.horizontalConstraint+"/"+e.verticalConstraint)
        appendLine("      if (listOf("+e.visibleOn.split(",").filter{it.isNotBlank()}.joinToString(","){JSONObject.quote(it)}+").contains(target)) Box(Modifier.offset(x=("+x+").dp,y=("+y+").dp).size(width=("+w+").dp,height=("+h+").dp).background(Color(android.graphics.Color.parseColor("+JSONObject.quote(fill)+")),RoundedCornerShape("+e.radius+".dp)).padding("+e.padding+".dp)) {")
        if(e.kind=="icon"&&e.iconSvg.isNotBlank()) {
            val html="<!doctype html><html><body style='margin:0'>"+e.iconSvg+"</body></html>"
            appendLine("        AndroidView(factory={ context -> WebView(context).apply { settings.javaScriptEnabled=false; setBackgroundColor(android.graphics.Color.TRANSPARENT); loadDataWithBaseURL(null,"+JSONObject.quote(html)+",\\"text/html\\",\\"UTF-8\\",null) } },modifier=Modifier.fillMaxSize())")
        } else if(e.kind=="image"&&e.imageData.isNotBlank()) {
            val html="<!doctype html><html><body style='margin:0'><img style='width:100%;height:100%;object-fit:cover' src='"+e.imageData+"'></body></html>"
            appendLine("        AndroidView(factory={ context -> WebView(context).apply { settings.javaScriptEnabled=false; setBackgroundColor(android.graphics.Color.TRANSPARENT); loadDataWithBaseURL(null,"+JSONObject.quote(html)+",\\"text/html\\",\\"UTF-8\\",null) } },modifier=Modifier.fillMaxSize())")
        } else {
            appendLine("        Text("+JSONObject.quote(e.text)+",color=Color(android.graphics.Color.parseColor("+JSONObject.quote(e.color)+")),fontSize="+e.fontSize+".sp,fontWeight=FontWeight("+e.fontWeight+"),modifier=Modifier.fillMaxSize())")
        }
        appendLine("      }")
    }
    appendLine("    }")
    appendLine("  }")
    appendLine("}")
}

private fun uxNativeGenerateSwift(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,width:Int,height:Int):String = buildString {
    appendLine("// Generated by enV UX/UI Studio. Review asset handling and validate in your app target.")
    appendLine("import SwiftUI")
    appendLine("import WebKit")
    appendLine()
    appendLine("struct EnVStudioHTMLAsset: UIViewRepresentable {")
    appendLine("  let markup: String")
    appendLine("  func makeUIView(context: Context) -> WKWebView { let view=WKWebView(); view.isOpaque=false; view.backgroundColor = .clear; view.scrollView.isScrollEnabled=false; return view }")
    appendLine("  func updateUIView(_ view: WKWebView, context: Context) { view.loadHTMLString(\\"<html><body style='margin:0'>\\" + markup + \\"</body></html>\\",baseURL:nil) }")
    appendLine("}")
    appendLine("struct "+uxNativeSafeIdentifier(name)+"DesignView: View {")
    appendLine("  let target: String = "+JSONObject.quote(target))
    appendLine("  var body: some View { GeometryReader { proxy in")
    appendLine("    let deltaWidth=proxy.size.width-CGFloat("+width+")")
    appendLine("    let deltaHeight=proxy.size.height-CGFloat("+height+")")
    appendLine("    ZStack(alignment:.topLeading) { Color(hex:"+JSONObject.quote(background)+")")
    elements.forEach { e ->
        val dx=when(e.horizontalConstraint){"center"->"deltaWidth/2";"right"->"deltaWidth";else->"0"}
        val dy=when(e.verticalConstraint){"center"->"deltaHeight/2";"bottom"->"deltaHeight";else->"0"}
        var w=if(e.horizontalConstraint=="stretch")"max(CGFloat("+e.minWidth.coerceAtLeast(1)+"),CGFloat("+e.width+")+deltaWidth)" else "CGFloat("+e.width+")"
        if(e.horizontalConstraint=="stretch"&&e.maxWidth>0)w="min("+w+",CGFloat("+e.maxWidth+"))"
        val h=if(e.verticalConstraint=="stretch")"max(1,CGFloat("+e.height+")+deltaHeight)" else "CGFloat("+e.height+")"
        val fill=if(e.fill=="transparent")background else e.fill
        val text=JSONObject.quote(e.text);val color=JSONObject.quote(e.color);val back=JSONObject.quote(fill)
        val contents=if(e.kind=="icon"&&e.iconSvg.isNotBlank())"EnVStudioHTMLAsset(markup:"+JSONObject.quote(e.iconSvg)+")" else if(e.kind=="image"&&e.imageData.isNotBlank())"EnVStudioHTMLAsset(markup:"+JSONObject.quote("<img style='width:100%;height:100%;object-fit:cover' src='"+e.imageData+"' />")+")" else "Text("+text+").font(.custom("+JSONObject.quote(e.fontFamily)+",size:"+e.fontSize+")).foregroundStyle(Color(hex:"+color+"))"
        appendLine("      if ["+e.visibleOn.split(",").filter{it.isNotBlank()}.joinToString(","){JSONObject.quote(it)}+"].contains(target) {")
        appendLine("        "+contents+".frame(width:"+w+",height:"+h+",alignment:.topLeading).background(Color(hex:"+back+")).clipShape(RoundedRectangle(cornerRadius:"+e.radius+")).position(x:CGFloat("+e.x+")+"+dx+"+("+w+")/2,y:CGFloat("+e.y+")+"+dy+"+("+h+")/2)")
        appendLine("      }")
    }
    appendLine("    }")
    appendLine("  } }.frame(maxWidth:.infinity,minHeight:"+height+")")
    appendLine("}")
    appendLine("extension Color { init(hex:String) { let value=UInt64(hex.trimmingCharacters(in:CharacterSet.alphanumerics.inverted),radix:16) ?? 0; self.init(.sRGB,red:Double((value>>16)&255)/255,green:Double((value>>8)&255)/255,blue:Double(value&255)/255,opacity:1) } }")
}

private object UxUiNativePdf {
    fun build(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,spec:String,artboardWidth:Int=if(target=="mobile")390 else if(target=="tablet")768 else 1440,artboardHeight:Int=if(target=="mobile")844 else if(target=="tablet")1024 else 900):ByteArray {
        val pdf=PdfDocument();val pageW=595;val pageH=842
        val body=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=android.graphics.Color.rgb(38,43,51);textSize=9f;typeface=Typeface.create("sans-serif",Typeface.NORMAL)}
        val title=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=android.graphics.Color.rgb(37,99,235);textSize=12f;typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)}
        fun makePage(index:Int)=pdf.startPage(PdfDocument.PageInfo.Builder(pageW,pageH,index).create())
        try {
            val first=makePage(1);val canvas=first.canvas
            canvas.drawText("enV UX/UI STUDIO",32f,34f,title);canvas.drawText(name.take(70),32f,60f,Paint(title).apply{textSize=18f})
            canvas.drawText(target.uppercase()+" | "+artboardWidth+" x "+artboardHeight+" px | "+elements.size+" layers",32f,80f,body)
            val bw=artboardWidth.toFloat();val bh=artboardHeight.toFloat();val scale=min(531f/bw,690f/bh)
            canvas.save();canvas.translate((pageW-bw*scale)/2f,110f);canvas.scale(scale,scale)
            canvas.drawColor(runCatching{android.graphics.Color.parseColor(background)}.getOrDefault(android.graphics.Color.WHITE))
            elements.forEach { e ->
                val fill=if(e.fill=="transparent")null else runCatching{android.graphics.Color.parseColor(e.fill)}.getOrDefault(android.graphics.Color.WHITE)
                val r=RectF(e.x.toFloat(),e.y.toFloat(),(e.x+e.width).toFloat(),(e.y+e.height).toFloat())
                val p=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=fill?:android.graphics.Color.TRANSPARENT;style=if(fill==null)Paint.Style.STROKE else Paint.Style.FILL;strokeWidth=e.borderWidth.coerceAtLeast(1).toFloat()}
                if(fill!=null||e.borderWidth>0)canvas.drawRoundRect(r,e.radius.toFloat(),e.radius.toFloat(),p)
                if(e.borderWidth>0){p.color=runCatching{android.graphics.Color.parseColor(e.borderColor)}.getOrDefault(android.graphics.Color.LTGRAY);p.style=Paint.Style.STROKE;p.strokeWidth=e.borderWidth.toFloat();canvas.drawRoundRect(r,e.radius.toFloat(),e.radius.toFloat(),p)}
                val t=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=runCatching{android.graphics.Color.parseColor(e.color)}.getOrDefault(android.graphics.Color.BLACK);textSize=e.fontSize.toFloat();typeface=Typeface.create(e.fontFamily,if(e.fontWeight>=600)Typeface.BOLD else Typeface.NORMAL)}
                if (e.kind == "icon" && e.iconSvg.isNotBlank()) {
                    uxNativeDrawSvgIcon(canvas, e)
                } else if(e.kind=="image" && e.imageData.startsWith("data:image/")) {
                    val payload=e.imageData.substringAfter(",", "")
                    val bitmap=runCatching{val bytes=android.util.Base64.decode(payload,android.util.Base64.DEFAULT);BitmapFactory.decodeByteArray(bytes,0,bytes.size)}.getOrNull()
                    if(bitmap!=null){
                        canvas.save()
                        val clipPath=android.graphics.Path().apply{addRoundRect(r,e.radius.toFloat(),e.radius.toFloat(),android.graphics.Path.Direction.CW)}
                        canvas.clipPath(clipPath)
                        canvas.drawBitmap(bitmap,null,r,Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
                        canvas.restore()
                        bitmap.recycle()
                    } else {
                        t.textSize=12f;canvas.drawText("Image unavailable",e.x.toFloat()+e.padding,e.y.toFloat()+e.padding+12f,t)
                    }
                } else {
                    val content=if(e.kind=="icon")e.iconName.substringAfterLast(":") else e.text;var y=e.y+e.padding+e.fontSize
                    content.lines().forEach { line -> if(line.isNotEmpty()){var remaining=line;var guard=0;while(remaining.isNotEmpty()&&guard<10){val count=t.breakText(remaining,true,(e.width-2*e.padding).toFloat(),null).coerceAtLeast(1);canvas.drawText(remaining.take(count),(e.x+e.padding).toFloat(),y.toFloat(),t);remaining=remaining.drop(count).trimStart();y+=e.fontSize+3;guard++}}else y+=e.fontSize }
                }
            }
            canvas.restore();pdf.finishPage(first)
            val lines=("AI IMPLEMENTATION PROMPT AND MACHINE-READABLE DESIGN SPECIFICATION\n\n"+spec).lines()
            var pageIndex=2;var next=makePage(pageIndex);var y=42f;next.canvas.drawText("DESIGN HANDOFF - "+name.take(60),32f,28f,title)
            lines.forEach { line -> var remaining=line;do{
                if(y>800f){pdf.finishPage(next);pageIndex++;next=makePage(pageIndex);y=42f;next.canvas.drawText("DESIGN HANDOFF - "+name.take(60),32f,28f,title)}
                val snippet=remaining.take(92);next.canvas.drawText(snippet,32f,y,body);y+=12f;remaining=remaining.drop(snippet.length)
            }while(remaining.isNotEmpty()) }
            pdf.finishPage(next)
            return ByteArrayOutputStream().use{out->pdf.writeTo(out);out.toByteArray()}
        }finally{pdf.close()}
    }
}

@Composable
fun NativeUxUiStudioForm() {
    val context=LocalContext.current;val prefs=remember{context.getSharedPreferences("env.ux-ui-studio",android.content.Context.MODE_PRIVATE)}
    val scope=rememberCoroutineScope()
    var onboarding by remember{mutableStateOf(true)};var target by remember{mutableStateOf("mobile")}
    var projectName by remember{mutableStateOf("Mobile dashboard")};var background by remember{mutableStateOf("#F8FAFC")}
    var customArtboard by remember{mutableStateOf(false)};var customWidth by remember{mutableIntStateOf(390)};var customHeight by remember{mutableIntStateOf(844)}
    var tokenNameDraft by remember{mutableStateOf("brand")};var tokenValueDraft by remember{mutableStateOf("#2563EB")}
    val colorTokens=remember{mutableStateListOf<Pair<String,String>>("primary" to "#2563EB","surface" to "#FFFFFF","text" to "#111827","muted" to "#64748B","border" to "#E5E7EB")}
    val spacingTokens=remember{mutableStateListOf(4,8,12,16,24,32,48)}
    val reusable=remember{mutableStateListOf<UxUiNativeLayer>()}
    val elements=remember{mutableStateListOf<UxUiNativeLayer>()};var selectedId by remember{mutableStateOf("")}
    val undoHistory=remember{mutableStateListOf<List<UxUiNativeLayer>>()};val redoHistory=remember{mutableStateListOf<List<UxUiNativeLayer>>()}
    var notice by remember{mutableStateOf("")};var iconQuery by remember{mutableStateOf("home")};var iconResults by remember{mutableStateOf(emptyList<String>())};var iconStart by remember{mutableIntStateOf(0)};var iconTotal by remember{mutableIntStateOf(0)};var iconLoadedQuery by remember{mutableStateOf("")}
    var iconBusy by remember{mutableStateOf(false)};var ready by remember{mutableStateOf(false)}
    var pdfBytes by remember{mutableStateOf<ByteArray?>(null)};var jsonText by remember{mutableStateOf("")}
    var sourceText by remember{mutableStateOf("")};var sourceExtension by remember{mutableStateOf("html")}
    val selected=elements.firstOrNull{it.id==selectedId}
    val presetWidth=if(target=="mobile")390 else if(target=="tablet")768 else 1440
    val presetHeight=if(target=="mobile")844 else if(target=="tablet")1024 else 900
    val bw=if(customArtboard)customWidth else presetWidth;val bh=if(customArtboard)customHeight else presetHeight
    val tokenJson=remember(colorTokens.toList(),spacingTokens.toList()){JSONObject().put("colors",JSONArray().apply{colorTokens.forEach{(name,value)->put(JSONObject().put("name",name).put("value",value))}}).put("spacing",JSONArray().apply{spacingTokens.forEach{put(it)}}).put("typography",JSONArray().apply{put(JSONObject().put("name","heading").put("fontFamily","sans-serif").put("fontSize",24).put("fontWeight",700).put("lineHeight",1.2));put(JSONObject().put("name","body").put("fontFamily","sans-serif").put("fontSize",16).put("fontWeight",400).put("lineHeight",1.5))})}
    val signature=elements.joinToString("|"){it.id+":"+it.x+":"+it.y+":"+it.width+":"+it.height+":"+it.text+":"+it.color+":"+it.fill+":"+it.iconName+":"+it.horizontalConstraint+":"+it.verticalConstraint}
    val tokenSignature=colorTokens.joinToString("|"){it.first+":"+it.second}+"|"+spacingTokens.joinToString(",")
    val pdfLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")){uri:Uri?->if(uri!=null)runCatching{val bytes=pdfBytes?:error("Export not prepared.");context.contentResolver.openOutputStream(uri)?.use{it.write(bytes)}?:error("No writable destination.")}.onSuccess{notice="PDF saved with visual preview, AI prompt and machine-readable specifications."}.onFailure{notice=it.message?:"PDF export failed."}}
    val jsonLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri:Uri?->if(uri!=null)runCatching{context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(jsonText)}?:error("No writable destination.")}.onSuccess{notice="Project JSON saved."}.onFailure{notice=it.message?:"JSON export failed."}}
    val sourceLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")){uri:Uri?->if(uri!=null)runCatching{context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(sourceText)}?:error("No writable destination.")}.onSuccess{notice="Source file saved."}.onFailure{notice=it.message?:"Source export failed."}}
    LaunchedEffect(Unit){runCatching{val raw=prefs.getString("draft",null)?:return@runCatching;val p=JSONObject(raw);projectName=p.optString("name",projectName);target=p.optString("target",target);background=p.optString("background",background);customWidth=p.optJSONObject("viewport")?.optInt("width",customWidth)?:customWidth;customHeight=p.optJSONObject("viewport")?.optInt("height",customHeight)?:customHeight;customArtboard=true
            colorTokens.clear();val savedColors=p.optJSONObject("tokens")?.optJSONArray("colors");if(savedColors!=null){for(index in 0 until savedColors.length()){val t=savedColors.optJSONObject(index)?:continue;colorTokens.add(t.optString("name") to t.optString("value","#2563EB"))}}
            spacingTokens.clear();val savedSpacing=p.optJSONObject("tokens")?.optJSONArray("spacing");if(savedSpacing!=null){for(index in 0 until savedSpacing.length())spacingTokens.add(savedSpacing.optInt(index).coerceAtLeast(1))}
            elements.clear();elements.addAll(uxNativeReadJson(p.optJSONArray("elements")?:JSONArray()));selectedId=elements.firstOrNull()?.id.orEmpty();notice="Local draft restored."};ready=true}
    LaunchedEffect(projectName,target,background,signature,tokenSignature,bw,bh,ready,onboarding){if(ready&&!onboarding)runCatching{prefs.edit().putString("draft",uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}})).apply()}.onFailure{notice="Could not save locally; export a JSON backup."}}
    fun checkpoint(){
        undoHistory.add(elements.toList())
        if(undoHistory.size>40)undoHistory.removeAt(0)
        redoHistory.clear()
    }
    fun undo(){
        if(undoHistory.isEmpty())return
        redoHistory.add(elements.toList())
        val previous=undoHistory.removeAt(undoHistory.lastIndex)
        elements.clear();elements.addAll(previous)
        if(elements.none{it.id==selectedId})selectedId=elements.firstOrNull()?.id.orEmpty()
        notice="Undo complete."
    }
    fun redo(){
        if(redoHistory.isEmpty())return
        undoHistory.add(elements.toList())
        if(undoHistory.size>40)undoHistory.removeAt(0)
        val next=redoHistory.removeAt(redoHistory.lastIndex)
        elements.clear();elements.addAll(next)
        if(elements.none{it.id==selectedId})selectedId=elements.firstOrNull()?.id.orEmpty()
        notice="Redo complete."
    }
    fun moveLayer(id:String,delta:Int){
        val from=elements.indexOfFirst{it.id==id};val to=from+delta
        if(from<0||to !in elements.indices)return
        checkpoint()
        val moving=elements.removeAt(from);elements.add(to,moving)
    }
    fun edit(id:String,change:(UxUiNativeLayer)->UxUiNativeLayer){
        val idx=elements.indexOfFirst{it.id==id}
        if(idx>=0){val updated=change(elements[idx]);if(updated!=elements[idx]){checkpoint();elements[idx]=updated}}
    }
    fun add(kind:String){
        val id="layer-"+System.nanoTime().toString()
        val e=when(kind){
            "text"->UxUiNativeLayer(id,kind,"Heading",24,120,280,48,"Your heading",fontSize=24,fontWeight=700)
            "button"->UxUiNativeLayer(id,kind,"Primary button",24,200,180,48,"Continue",color="#FFFFFF",fill="#2563EB",fontWeight=600)
            "card"->UxUiNativeLayer(id,kind,"Card",24,270,300,132,"Card title\\nSupporting text",fill="#FFFFFF",borderWidth=1,radius=18,padding=18)
            "input"->UxUiNativeLayer(id,kind,"Text input",24,420,300,48,"Enter your email",color="#64748B",fill="#FFFFFF",borderWidth=1)
            "icon"->UxUiNativeLayer(id,kind,"Icon",24,490,44,44,"",iconName="mdi:home",color="#2563EB")
            "image"->UxUiNativeLayer(id,kind,"Image",24,330,280,160,"Import an image",color="#64748B",fill="#E5E7EB",radius=12)
            "circle","ellipse"->UxUiNativeLayer(id,"ellipse","Circle",24,540,84,84,"",fill="#DBEAFE",radius=42)
            "divider"->UxUiNativeLayer(id,kind,"Divider",24,640,300,1,"",fill="#CBD5E1")
            "row","list"->UxUiNativeLayer(id,kind,"List row",24,330,300,64,"Account settings\\nManage your profile",fill="#FFFFFF",borderWidth=1,radius=10,padding=14)
            "avatar"->UxUiNativeLayer(id,kind,"Avatar",24,540,44,44,"A",color="#1D4ED8",fill="#DBEAFE",radius=22,fontWeight=700)
            "badge"->UxUiNativeLayer(id,kind,"Status badge",24,540,100,28,"Active",color="#1D4ED8",fill="#DBEAFE",radius=99,fontSize=12,fontWeight=600)
            "switch","toggle"->UxUiNativeLayer(id,"switch","Toggle switch",24,540,46,26,"ON",color="#FFFFFF",fill="#2563EB",radius=13,fontSize=10)
            "progress"->UxUiNativeLayer(id,kind,"Progress bar",24,540,240,10,"",color="#2563EB",fill="#DBEAFE",radius=5,padding=0)
            "slider"->UxUiNativeLayer(id,kind,"Range slider",24,540,240,24,"",color="#2563EB",fill="#E5E7EB",radius=12,padding=0)
            "radio"->UxUiNativeLayer(id,kind,"Radio button",24,540,22,22,"",color="#2563EB",fill="#FFFFFF",borderColor="#2563EB",borderWidth=2,radius=11,padding=0)
            "dropdown"->UxUiNativeLayer(id,kind,"Select menu",24,420,300,48,"Select an option",color="#64748B",fill="#FFFFFF",borderWidth=1)
            "search"->UxUiNativeLayer(id,kind,"Search field",24,420,300,48,"Search…",color="#64748B",fill="#FFFFFF",borderWidth=1)
            "textarea"->UxUiNativeLayer(id,kind,"Text area",24,420,300,96,"Enter your message",color="#64748B",fill="#FFFFFF",borderWidth=1)
            "table"->UxUiNativeLayer(id,kind,"Data table",24,330,320,150,"Name       Status       Updated\\nProject A  Active       Today\\nProject B  Draft        Yesterday",fill="#FFFFFF",borderWidth=1,fontSize=12)
            "chart"->UxUiNativeLayer(id,kind,"Bar chart",24,330,300,170,"Activity overview\\nJan       Feb       Mar       Apr",fill="#FFFFFF",borderWidth=1,fontSize=13)
            "modal"->UxUiNativeLayer(id,kind,"Dialog / modal",24,330,310,190,"Dialog title\\nDescribe the action here.\\nCancel          Confirm",fill="#FFFFFF",borderWidth=1,radius=18,padding=18)
            "breadcrumb"->UxUiNativeLayer(id,kind,"Breadcrumb trail",24,330,300,34,"Home / Workspace / Current",color="#475569",fontSize=12)
            "tooltip"->UxUiNativeLayer(id,kind,"Tooltip",24,330,170,38,"Helpful information",color="#FFFFFF",fill="#111827",radius=8,fontSize=12)
            "video"->UxUiNativeLayer(id,kind,"Video preview",24,330,280,158,"Video preview",color="#FFFFFF",fill="#0F172A",radius=12)
            "logo"->UxUiNativeLayer(id,kind,"Brand wordmark",24,330,180,42,"Your brand",color="#2563EB",fontSize=26,fontWeight=800)
            "navbar"->UxUiNativeLayer(id,kind,"Navigation bar",20,22,350,56,"enV                         Menu",fill="#FFFFFF",borderWidth=1,fontWeight=600)
            "tabbar","tabs"->UxUiNativeLayer(id,kind,"Tab navigation",20,766,350,54,"Home       Explore       Saved       Profile",fill="#FFFFFF",borderWidth=1,fontSize=12,fontWeight=600)
            "menu"->UxUiNativeLayer(id,kind,"Menu bar",20,22,350,48,"File     Edit     View     Insert     Help",fill="#F8FAFC",borderWidth=1,fontSize=13)
            "spacer"->UxUiNativeLayer(id,kind,"Layout spacer",24,540,80,24,"",fill="transparent",radius=0,padding=0)
            else->UxUiNativeLayer(id,"rect","Rectangle",24,540,140,90,"",fill="#DBEAFE")
        }
        checkpoint();elements.add(e);selectedId=id;notice=e.name+" added."
    }

    fun searchIcons(loadMore:Boolean=false){
        val query=iconQuery.trim()
        if(query.isBlank()){notice="Enter a term to search the icon catalogue.";return}
        scope.launch {
            iconBusy=true
            val append=loadMore&&query==iconLoadedQuery
            val offset=if(append)iconStart else 0
            runCatching {
                withContext(Dispatchers.IO) {
                    val q=URLEncoder.encode(query,"UTF-8")
                    val payload=JSONObject(URL("https://api.iconify.design/search?query="+q+"&limit=24&start="+offset).readText())
                    val icons=payload.optJSONArray("icons")?.let{arr->(0 until arr.length()).map{arr.optString(it)}}?:emptyList()
                    Triple(payload.optInt("total",offset+icons.size),icons,offset)
                }
            }.onSuccess { result ->
                iconResults=if(append)iconResults+result.second else result.second
                iconStart=result.third+result.second.size
                iconTotal=result.first
                iconLoadedQuery=query
                notice=iconResults.size.toString()+" of "+iconTotal+" icon IDs loaded."
            }.onFailure { notice=it.message?: "Icon catalogue unavailable." }
            iconBusy=false
        }
    }

    var imageTargetId by remember{mutableStateOf("")}
    val imageLauncher=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri:Uri?->
        if(uri!=null){
            val layerId=imageTargetId
            scope.launch {
                runCatching {
                    withContext(Dispatchers.IO) {
                        val mime=context.contentResolver.getType(uri)?.lowercase() ?: "image/png"
                        require(mime in setOf("image/png","image/jpeg","image/webp","image/gif")) { "Use a PNG, JPEG, WebP or GIF image." }
                        val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("Could not read the selected image.")
                        require(bytes.size<=4*1024*1024) { "Images must be 4 MB or smaller for a portable project." }
                        "data:"+mime+";base64,"+android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)
                    }
                }.onSuccess { dataUrl ->
                    val index=elements.indexOfFirst{it.id==layerId}
                    if(index>=0){checkpoint();elements[index]=elements[index].copy(kind="image",name="Image",imageData=dataUrl);notice="Image imported and saved in the design project."}
                }.onFailure { notice=it.message?:"Image import failed." }
            }
        }
    }

    fun chooseIcon(layerId:String, icon:String){
        scope.launch {
            iconBusy=true
            runCatching {
                withContext(Dispatchers.IO) {
                    val svg=URL("https://api.iconify.design/"+icon.replace(":", "/")+".svg").readText()
                    require(svg.contains("<svg")) { "The icon source returned invalid artwork." }
                    svg
                }
            }.onSuccess { svg ->
                edit(layerId){it.copy(iconName=icon,name=icon,iconSvg=uxNativeCleanIconSvg(svg))}
                notice="Loaded actual SVG artwork for "+icon+". Check its source licence before shipping."
            }.onFailure { notice=it.message ?: "Could not load selected icon artwork." }
            iconBusy=false
        }
    }

    Surface(color=MaterialTheme.colorScheme.background,modifier=Modifier.fillMaxWidth()){
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
            Text("UX/UI Studio",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold)
            Text("Native editor · exact coordinates, type, spacing, colors and icon names.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(onboarding){
                Card{Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Text("What are you designing?",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.SemiBold)
                    Text("Choose an exact target-size artboard, edit elements and export PDF or JSON handoff.")
                    Button(onClick={target="mobile";customArtboard=false;background="#F8FAFC";projectName="Mobile dashboard";elements.clear();elements.addAll(uxNativePreset("mobile","mobile-dashboard").map{it.copy(referenceWidth=390,referenceHeight=844)});customWidth=390;customHeight=844;selectedId=elements.firstOrNull()?.id.orEmpty();onboarding=false},modifier=Modifier.fillMaxWidth()){Text("Mobile · 390 × 844 px")}
                    OutlinedButton(onClick={target="tablet";customArtboard=false;background="#F8FAFC";projectName="Tablet dashboard";elements.clear();elements.addAll(uxNativePreset("tablet","tablet-dashboard").map{it.copy(referenceWidth=768,referenceHeight=1024)});customWidth=768;customHeight=1024;selectedId=elements.firstOrNull()?.id.orEmpty();onboarding=false},modifier=Modifier.fillMaxWidth()){Text("Tablet · 768 × 1024 px")}
                    OutlinedButton(onClick={target="desktop";customArtboard=false;background="#FFFFFF";projectName="Website landing";elements.clear();elements.addAll(uxNativePreset("desktop","desktop-landing").map{it.copy(referenceWidth=1440,referenceHeight=900)});customWidth=1440;customHeight=900;selectedId=elements.firstOrNull()?.id.orEmpty();onboarding=false},modifier=Modifier.fillMaxWidth()){Text("Desktop · 1440 × 900 px")}
                }}
            }else{
                OutlinedTextField(projectName,{projectName=it},label={Text("Project name")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    FilterChip(selected=target=="mobile",onClick={target="mobile";customArtboard=false;customWidth=390;customHeight=844},label={Text("Mobile")})
                    FilterChip(selected=target=="tablet",onClick={target="tablet";customArtboard=false;customWidth=768;customHeight=1024},label={Text("Tablet")})
                    FilterChip(selected=target=="desktop",onClick={target="desktop";customArtboard=false;customWidth=1440;customHeight=900},label={Text("Desktop")})
                    OutlinedButton(onClick={onboarding=true}){Text("Workflow")}
                }
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
                    OutlinedButton(onClick={undo()},enabled=undoHistory.isNotEmpty()){Text("Undo")}
                    OutlinedButton(onClick={redo()},enabled=redoHistory.isNotEmpty()){Text("Redo")}
                    Text("Drag layers to reposition.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("ARTBOARD · "+bw+" × "+bh+" px · "+elements.size+" layers",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
                    Checkbox(checked=customArtboard,onCheckedChange={customArtboard=it},modifier=Modifier.size(28.dp))
                    Text("Custom",style=MaterialTheme.typography.bodySmall)
                    OutlinedTextField(customWidth.toString(),{v->v.toIntOrNull()?.let{customWidth=it.coerceIn(160,4096)}},label={Text("Width px")},enabled=customArtboard,modifier=Modifier.weight(1f),singleLine=true)
                    OutlinedTextField(customHeight.toString(),{v->v.toIntOrNull()?.let{customHeight=it.coerceIn(240,4096)}},label={Text("Height px")},enabled=customArtboard,modifier=Modifier.weight(1f),singleLine=true)
                }
                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                    listOf("mobile-dashboard" to "Mobile dashboard","mobile-login" to "Mobile login","tablet-dashboard" to "Tablet dashboard","tablet-settings" to "Tablet settings","desktop-landing" to "Website landing","desktop-dashboard" to "Desktop dashboard","desktop-settings" to "Desktop settings").forEach{(id,label)->
                        OutlinedButton(onClick={
                            checkpoint()
                            target=when{ id.startsWith("mobile")->"mobile";id.startsWith("tablet")->"tablet";else->"desktop"}
                            customArtboard=false
                            customWidth=if(target=="mobile")390 else if(target=="tablet")768 else 1440
                            customHeight=if(target=="mobile")844 else if(target=="tablet")1024 else 900
                            elements.clear()
                            elements.addAll(uxNativePreset(target,id).map{it.copy(referenceWidth=customWidth,referenceHeight=customHeight)})
                            selectedId=elements.firstOrNull()?.id.orEmpty();projectName=label;notice=label+" loaded."
                        }){Text(label,maxLines=1)}
                    }
                }
                Card{Column(Modifier.fillMaxWidth().padding(10.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                    Text("Artboard preview",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                    BoxWithConstraints(Modifier.fillMaxWidth()){
                        val width=maxWidth.value.coerceAtMost(if(target=="mobile")390f else 900f);val scale=width/bw.toFloat()
                        Box(Modifier.width(width.dp).height((bh*scale).dp).clip(RoundedCornerShape(8.dp)).background(uxNativeColor(background))){
                            Box(Modifier.size(bw.dp,bh.dp).graphicsLayer(scaleX=scale,scaleY=scale,transformOrigin=TransformOrigin(0f,0f))){
                                val dragDensity=androidx.compose.ui.platform.LocalDensity.current.density
                        elements.forEach{e->
                                    val shape=if(e.kind=="ellipse")androidx.compose.foundation.shape.CircleShape else RoundedCornerShape(e.radius.dp)
                                    Box(Modifier.offset(uxNativeLayerX(e,bw).dp,uxNativeLayerY(e,bh).dp).size(uxNativeLayerWidth(e,bw).dp,uxNativeLayerHeight(e,bh).dp).clip(shape).background(uxNativeColor(e.fill,android.graphics.Color.TRANSPARENT)).border(if(selectedId==e.id)2.dp else e.borderWidth.dp,if(selectedId==e.id)MaterialTheme.colorScheme.primary else uxNativeColor(e.borderColor,android.graphics.Color.LTGRAY),shape).padding(e.padding.dp).pointerInput(e.id,scale,dragDensity){
                                        val density=dragDensity
                                        detectDragGestures(onDragStart={selectedId=e.id;checkpoint()}){change,dragAmount->
                                            change.consume()
                                            val index=elements.indexOfFirst{it.id==e.id}
                                            if(index>=0){val current=elements[index];elements[index]=current.copy(x=(current.x+(dragAmount.x/(density*scale)).roundToInt()).coerceAtLeast(0),y=(current.y+(dragAmount.y/(density*scale)).roundToInt()).coerceAtLeast(0))}
                                        }
                                    }){
                                        if((e.kind=="icon" && e.iconSvg.isNotBlank()) || (e.kind=="image" && e.imageData.isNotBlank())) {
                                            AndroidView(
                                                factory={ctx->WebView(ctx).apply{
                                                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                                                    settings.javaScriptEnabled=false
                                                    settings.domStorageEnabled=false
                                                    isHorizontalScrollBarEnabled=false
                                                    isVerticalScrollBarEnabled=false
                                                    isFocusable=false
                                                    isFocusableInTouchMode=false
                                                    isEnabled=false
                                                    isClickable=false
                                                }},
                                                modifier=Modifier.fillMaxSize(),
                                                update={view->
                                                    val html=if(e.kind=="icon")uxNativeIconHtml(e.iconSvg,e.color) else uxNativeImageHtml(e.imageData)
                                                    if(view.tag != html){view.tag=html;view.loadDataWithBaseURL(null,html,"text/html","UTF-8",null)}
                                                }
                                            )
                                        } else {
                                            Text(if(e.kind=="icon")e.iconName.substringAfterLast(":").take(3).uppercase() else e.text,color=uxNativeColor(e.color,android.graphics.Color.BLACK),fontSize=e.fontSize.sp,fontWeight=if(e.fontWeight>=700)FontWeight.Bold else if(e.fontWeight>=600)FontWeight.SemiBold else FontWeight.Normal,fontFamily=if(e.fontFamily.contains("serif",true))FontFamily.Serif else FontFamily.SansSerif,maxLines=5,overflow=TextOverflow.Clip)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Text("Preview scales to fit. Coordinates remain design pixels.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }}
                Text("Add elements",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf("text" to "Text","button" to "Button","card" to "Card","input" to "Input","icon" to "Icon","image" to "Image","navbar" to "Navbar","tabbar" to "Tab bar","tabs" to "Tabs","row" to "Row","avatar" to "Avatar","badge" to "Badge","switch" to "Switch","progress" to "Progress","slider" to "Slider","radio" to "Radio","dropdown" to "Dropdown","search" to "Search","textarea" to "Text area","table" to "Table","chart" to "Chart","modal" to "Modal","breadcrumb" to "Breadcrumb","tooltip" to "Tooltip","list" to "List","video" to "Video","logo" to "Logo","menu" to "Menu","spacer" to "Spacer","rect" to "Rectangle","circle" to "Circle","divider" to "Divider").forEach{(kind,label)->OutlinedButton(onClick={add(kind)}){Text(label)}}}
                Text("Layers · "+elements.size,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                elements.forEach{e->FilterChip(selected=selectedId==e.id,onClick={selectedId=e.id},label={Text(e.name,maxLines=1)})}
                selected?.let{e->
                    Card{Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                        Text("Properties · "+e.kind,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                        OutlinedTextField(e.name,{v->edit(e.id){it.copy(name=v)}},label={Text("Layer name")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        if(e.kind !in setOf("icon","ellipse","rect","divider"))OutlinedTextField(e.text,{v->edit(e.id){it.copy(text=v)}},label={Text("Text content")},modifier=Modifier.fillMaxWidth(),maxLines=4)
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.x.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(x=n.coerceAtLeast(0))}}},label={Text("X px")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.y.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(y=n.coerceAtLeast(0))}}},label={Text("Y px")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.width.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(width=n.coerceAtLeast(1))}}},label={Text("Width px")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.height.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(height=n.coerceAtLeast(1))}}},label={Text("Height px")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.fontSize.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(fontSize=n.coerceIn(1,240))}}},label={Text("Font px")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.fontWeight.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(fontWeight=n.coerceIn(100,900))}}},label={Text("Font weight")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        OutlinedTextField(e.fontFamily,{v->edit(e.id){it.copy(fontFamily=v)}},label={Text("Font family")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.color,{v->edit(e.id){it.copy(color=v)}},label={Text("Text color hex")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.fill,{v->edit(e.id){it.copy(fill=v)}},label={Text("Fill / transparent")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.radius.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(radius=n.coerceIn(0,300))}}},label={Text("Corner radius px")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.padding.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(padding=n.coerceAtLeast(0))}}},label={Text("Padding px")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        OutlinedTextField(e.borderWidth.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(borderWidth=n.coerceIn(0,30))}}},label={Text("Border width px")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.marginTop.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(marginTop=n)}}},label={Text("Margin top")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.marginRight.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(marginRight=n)}}},label={Text("Margin right")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.marginBottom.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(marginBottom=n)}}},label={Text("Margin bottom")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.marginLeft.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(marginLeft=n)}}},label={Text("Margin left")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Text("Responsive constraints",style=MaterialTheme.typography.labelLarge)
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.horizontalConstraint,{v->edit(e.id){it.copy(horizontalConstraint=v)}},label={Text("Horizontal anchor")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.verticalConstraint,{v->edit(e.id){it.copy(verticalConstraint=v)}},label={Text("Vertical anchor")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.minWidth.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(minWidth=n.coerceAtLeast(0))}}},label={Text("Min width px")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.maxWidth.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(maxWidth=n.coerceAtLeast(0))}}},label={Text("Max width 0=none")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        OutlinedTextField(e.visibleOn,{v->edit(e.id){it.copy(visibleOn=v)}},label={Text("Visible on: mobile,tablet,desktop")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedTextField(e.referenceWidth.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(referenceWidth=n.coerceAtLeast(1))}}},label={Text("Reference width")},modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(e.referenceHeight.toString(),{v->v.toIntOrNull()?.let{n->edit(e.id){it.copy(referenceHeight=n.coerceAtLeast(1))}}},label={Text("Reference height")},modifier=Modifier.weight(1f),singleLine=true)
                        }
                        OutlinedTextField(e.componentKey,{v->edit(e.id){it.copy(componentKey=v)}},label={Text("Reusable component key")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        if(e.kind=="image"){
                            Button(onClick={imageTargetId=e.id;imageLauncher.launch("image/*")},modifier=Modifier.fillMaxWidth()){Text(if(e.imageData.isBlank())"Import image (PNG, JPEG, WebP or GIF)" else "Replace image")}
                            Text("Raster image assets up to 4 MB are embedded into JSON and rendered in the artboard.",style=MaterialTheme.typography.bodySmall)
                        }
                        if(e.kind=="icon"){
                            OutlinedTextField(iconQuery,{iconQuery=it},label={Text("Search icon library")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                            Button(onClick={searchIcons(false)},enabled=!iconBusy&&iconQuery.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text(if(iconBusy)"Searching…" else "Search icons")}
                            iconResults.forEach{icon->OutlinedButton(onClick={chooseIcon(e.id,icon)},modifier=Modifier.fillMaxWidth()){Text(icon,maxLines=1)}}
                            if(iconResults.size<iconTotal)OutlinedButton(onClick={searchIcons(true)},enabled=!iconBusy,modifier=Modifier.fillMaxWidth()){Text(if(iconBusy)"Loading…" else "Load more icons · "+iconResults.size+" / "+iconTotal)}
                            Text("Icon IDs are searched in pages; selected SVG artwork is embedded into the project. Check collection licences before shipping.",style=MaterialTheme.typography.bodySmall)
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedButton(onClick={val copy=e.copy(id="layer-"+System.nanoTime(),name=e.name+" copy",x=e.x+16,y=e.y+16);checkpoint();elements.add(copy);selectedId=copy.id},modifier=Modifier.weight(1f)){Text("Duplicate")}
                            OutlinedButton(onClick={moveLayer(e.id,-1)},modifier=Modifier.weight(1f)){Text("Move up")}
                            OutlinedButton(onClick={moveLayer(e.id,1)},modifier=Modifier.weight(1f)){Text("Move down")}
                            OutlinedButton(onClick={checkpoint();elements.removeAll{it.id==e.id};selectedId=elements.firstOrNull()?.id.orEmpty()},modifier=Modifier.weight(1f)){Text("Delete")}
                        }
                        Text("Exact specification",style=MaterialTheme.typography.labelLarge)
                        Text(uxNativeJson(listOf(e)).toString(2),style=MaterialTheme.typography.bodySmall)
                    }}
                }
                Card{Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text("Export and handoff",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                    OutlinedTextField(background,{background=it},label={Text("Canvas background hex")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                    Button(onClick={jsonText=uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}});jsonLauncher.launch(projectName.lowercase().replace(Regex("[^a-z0-9]+"),"-")+"-design-spec.json")},modifier=Modifier.fillMaxWidth()){Text("Export project JSON + AI prompt")}
                    Button(onClick={pdfBytes=UxUiNativePdf.build(projectName,target,background,elements,uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}}),bw,bh);pdfLauncher.launch(projectName.lowercase().replace(Regex("[^a-z0-9]+"),"-")+"-design-spec.pdf")},modifier=Modifier.fillMaxWidth()){Text("Export visual PDF + specifications")}
                }}
            }
            if(notice.isNotBlank())Text(notice,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.primary)
        }
    }
}
