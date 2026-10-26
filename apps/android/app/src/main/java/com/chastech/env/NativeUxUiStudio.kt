package com.chastech.env

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import android.graphics.Paint
import android.graphics.BitmapFactory
import android.graphics.RectF
import android.graphics.Rect
import android.graphics.Typeface
import android.content.Context
import android.util.Base64
import java.io.File
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.caverock.androidsvg.SVG
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
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal data class UxUiStudioChartPoint(val label: String, val value: Double)
internal data class UxUiStudioChartSpec(val title: String, val points: List<UxUiStudioChartPoint>, val invalidRows: Int)

internal fun uxUiParseChartData(source: String): UxUiStudioChartSpec {
    val lines = source.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
    val title = lines.firstOrNull() ?: "Untitled chart"
    val points = mutableListOf<UxUiStudioChartPoint>()
    var invalidRows = 0
    val rowPattern = Regex("^(.+?)\\s*[:,=]\\s*(\\+?(?:\\d+(?:\\.\\d*)?|\\.\\d+))$")
    lines.drop(1).forEach { line ->
        val match = rowPattern.matchEntire(line)
        val label = match?.groupValues?.getOrNull(1)?.trim().orEmpty()
        val value = match?.groupValues?.getOrNull(2)?.toDoubleOrNull()
        if (label.isBlank() || value == null || !value.isFinite() || value < 0 || points.size >= 8) invalidRows++
        else points.add(UxUiStudioChartPoint(label, value))
    }
    return UxUiStudioChartSpec(title, points, invalidRows)
}

private data class UxUiNativeLayer(
    val id: String, val kind: String, val name: String, val x: Int, val y: Int, val width: Int, val height: Int,
    val text: String, val color: String = "#111827", val fill: String = "transparent", val iconName: String = "", val iconSvg: String = "", val imageData: String = "", val fontData: String = "",
    val fontFamily: String = "sans-serif", val fontSize: Int = 16, val fontWeight: Int = 400,
    val radius: Int = 12, val borderColor: String = "#E5E7EB", val borderWidth: Int = 0, val padding: Int = 12,
    val marginTop: Int = 0, val marginRight: Int = 0, val marginBottom: Int = 0, val marginLeft: Int = 0,
    val horizontalConstraint: String = "left", val verticalConstraint: String = "top",
    val minWidth: Int = 0, val maxWidth: Int = 0, val visibleOn: String = "mobile,tablet,desktop",
    val referenceWidth: Int = 390, val referenceHeight: Int = 844, val componentKey: String = "",
    val iconViewBox: String = "0 0 24 24", val rotation: Float = 0f,
    val prototypeTargetScreenId: String = "", val opacity: Float = 1f, val shadow: Boolean = false
)

private data class UxNativeToolkit(val id: String, val name: String, val description: String, val panel: String, val status: String)
private val uxNativeToolkits = listOf(
    UxNativeToolkit("icons", "Icons", "Discover, style, import and reuse icons.", "Icons", "Connected"),
    UxNativeToolkit("typography", "Typography", "Font discovery, typography and embedded font assets.", "Fonts", "Connected"),
    UxNativeToolkit("color", "Colors", "Palette, semantic colors and design tokens.", "Tokens", "Connected"),
    UxNativeToolkit("background", "Gradients & backgrounds", "Canvas background, image backgrounds and decorative surfaces.", "Tokens", "Connected foundation"),
    UxNativeToolkit("effects", "Effects", "Border, radius, opacity, shadow and visual depth.", "Style", "Connected foundation"),
    UxNativeToolkit("illustrations", "Illustrations", "Import and position SVG or image illustrations.", "Elements", "Import"),
    UxNativeToolkit("media", "Images & media", "Import photos, screenshots and media previews.", "Elements", "Import"),
    UxNativeToolkit("brand", "Brand", "Brand colors, fonts and reusable component templates.", "Tokens", "Connected foundation"),
    UxNativeToolkit("motion", "Motion & rotation", "Rotation and visual transition values.", "Style", "Connected foundation"),
    UxNativeToolkit("components", "Components & patterns", "Reusable controls, cards, forms and navigation elements.", "Elements", "Connected"),
    UxNativeToolkit("device", "Device mockups", "Preview the screen in device frames.", "Device", "Connected"),
    UxNativeToolkit("responsive", "Responsive layout", "Viewport size, anchors, grid and responsive visibility.", "Canvas", "Connected"),
    UxNativeToolkit("projects", "Screens & projects", "Projects, drafts, presets and import.", "Presets", "Connected"),
    UxNativeToolkit("layers", "Layers & objects", "Select and reorder objects, duplicate and delete layers.", "Layers", "Connected"),
    UxNativeToolkit("flows", "Interactive flows", "Assign tap destinations and preview connected screens.", "Prototype", "Partial: screen links"),
    UxNativeToolkit("design-system", "Design system", "Reusable color and spacing tokens.", "Tokens", "Connected foundation"),
    UxNativeToolkit("accessibility", "Accessibility", "Structure and touch-target review.", "QA", "Advisory checks"),
    UxNativeToolkit("content", "Content", "Sample text, buttons and placeholder elements.", "Content", "Starter actions"),
    UxNativeToolkit("data-viz", "Data visualization", "Edit saved numeric data and preview bar charts.", "Chart", "Editable bar charts"),
    UxNativeToolkit("patterns", "Patterns & textures", "Grid, vector shapes and decorative patterns.", "Pattern", "Starter actions"),
    UxNativeToolkit("transform", "Transform", "Rotate, resize and align layers with live previews.", "Transform", "Connected"),
    UxNativeToolkit("platform", "Platform kits", "Mobile, tablet and desktop conventions.", "Device", "Connected foundation"),
    UxNativeToolkit("assets", "Assets", "Import supported assets and replace artwork.", "Elements", "Import"),
    UxNativeToolkit("handoff", "Export & handoff", "Export PDF, JSON and source handoff.", "Handoff", "Connected"),
    UxNativeToolkit("inspiration", "Inspiration", "Import visual references for comparison.", "Elements", "Import"),
    UxNativeToolkit("qa", "Design QA", "Review overlaps, bounds, labels and touch targets.", "QA", "Advisory checks")
)

@Composable
private fun UxNativeAnimatedFontSpecimen(family:String, words:String, animated:Boolean = true) {
    val context = LocalContext.current
    val reduceMotion = remember { android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val phase = if (animated && !reduceMotion) {
        val transition = rememberInfiniteTransition(label="Font specimen")
        val value by transition.animateFloat(initialValue=0f,targetValue=1f,animationSpec=infiniteRepeatable(tween(2400),RepeatMode.Reverse),label="Preview motion")
        value
    } else 1f
    Text(words.ifBlank { "Make something beautiful" },fontFamily=FontFamily(uxNativeTypeface(context,UxUiNativeLayer("font-sample","text",family,0,0,300,60,"",fontFamily=family))),fontSize=25.sp,maxLines=2,
        modifier=Modifier.fillMaxWidth().heightIn(min=68.dp).graphicsLayer { alpha=.72f+phase*.28f; translationX=phase*3f; scaleX=.98f+phase*.02f; scaleY=.98f+phase*.02f })
}

@Composable
private fun UxNativeVisualSlider(label:String,value:Float,range:ClosedFloatingPointRange<Float>,begin:()->Unit,change:(Float)->Unit) {
    var editing by remember { mutableStateOf(false) }
    Text(label,style=MaterialTheme.typography.labelLarge)
    Slider(value=value.coerceIn(range.start,range.endInclusive),valueRange=range,
        onValueChange={ if(!editing){begin();editing=true};change(it) },onValueChangeFinished={editing=false})
}

@Composable
private fun UxNativeToolkitSample(id: String) {
    val ink = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.primaryContainer
    val surface = MaterialTheme.colorScheme.surface
    if (id == "icons") {
        Row(Modifier.fillMaxWidth().height(76.dp).background(muted, RoundedCornerShape(12.dp)), horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically) {
            listOf("lucide:house", "lucide:heart", "lucide:palette", "lucide:star").forEach { UxNativeIconThumbnail(it) }
        }
    } else if (id == "typography") {
        val context=LocalContext.current
        Text("Aa · Design with type",fontSize=26.sp,fontFamily=FontFamily(uxNativeTypeface(context,UxUiNativeLayer("sample","text","",0,0,200,60,"",fontFamily="Lora"))),modifier=Modifier.fillMaxWidth().height(76.dp).background(muted,RoundedCornerShape(12.dp)).padding(14.dp))
    } else Canvas(Modifier.fillMaxWidth().height(76.dp).background(muted,RoundedCornerShape(12.dp))) {
        val w=size.width;val h=size.height
        fun block(x:Float,y:Float,bw:Float,bh:Float,color:Color=ink,r:Float=6f)=drawRoundRect(color,androidx.compose.ui.geometry.Offset(x,y),androidx.compose.ui.geometry.Size(bw,bh),androidx.compose.ui.geometry.CornerRadius(r,r))
        when(id){
            "color","brand","design-system" -> listOf(ink,ink.copy(alpha=.8f),ink.copy(alpha=.6f),ink.copy(alpha=.4f),ink.copy(alpha=.2f)).forEachIndexed{i,c->block(w*.08f+i*w*.17f,h*.2f,w*.13f,h*.6f,c,12f)}
            "background" -> drawRect(Brush.linearGradient(listOf(ink.copy(alpha=.95f),ink.copy(alpha=.2f))),androidx.compose.ui.geometry.Offset(w*.1f,h*.15f),androidx.compose.ui.geometry.Size(w*.8f,h*.7f))
            "effects" -> {block(w*.28f+8,h*.24f+8,w*.44f,h*.5f,ink.copy(alpha=.2f),12f);block(w*.28f,h*.24f,w*.44f,h*.5f,surface,12f)}
            "device","platform","responsive" -> {block(w*.17f,h*.15f,w*.13f,h*.75f);block(w*.36f,h*.12f,w*.21f,h*.77f);block(w*.64f,h*.2f,w*.27f,h*.57f);block(w*.19f,h*.2f,w*.09f,h*.61f,surface,3f);block(w*.38f,h*.18f,w*.17f,h*.64f,surface,3f);block(w*.66f,h*.25f,w*.23f,h*.46f,surface,2f)}
            "patterns" -> for(x in 0..11)for(y in 0..3)drawCircle(ink.copy(alpha=.55f),3f,androidx.compose.ui.geometry.Offset(w*.08f+x*w*.076f,h*.2f+y*h*.2f))
            "data-viz" -> (1..6).forEach{i->block(w*.13f+i*w*.1f,h*(.8f-i*.09f),w*.065f,h*i*.09f)}
            "layers","projects" -> {block(w*.2f+22,h*.15f,w*.55f,h*.55f,ink.copy(alpha=.25f));block(w*.2f+11,h*.23f,w*.55f,h*.55f,ink.copy(alpha=.5f));block(w*.2f,h*.31f,w*.55f,h*.55f)}
            "flows","motion" -> {block(w*.15f,h*.27f,w*.22f,h*.46f);block(w*.64f,h*.27f,w*.22f,h*.46f);drawLine(ink,androidx.compose.ui.geometry.Offset(w*.4f,h*.5f),androidx.compose.ui.geometry.Offset(w*.6f,h*.5f),4f);drawLine(ink,androidx.compose.ui.geometry.Offset(w*.55f,h*.4f),androidx.compose.ui.geometry.Offset(w*.6f,h*.5f),4f)}
            "transform" -> {drawContext.canvas.save();drawContext.canvas.translate(w*.5f,h*.5f);drawContext.canvas.rotate(18f);block(-w*.2f,-h*.28f,w*.4f,h*.56f);drawContext.canvas.restore()}
            "accessibility","qa" -> {drawCircle(ink,24f,androidx.compose.ui.geometry.Offset(w*.3f,h*.5f));drawLine(surface,androidx.compose.ui.geometry.Offset(w*.3f-12,h*.5f),androidx.compose.ui.geometry.Offset(w*.3f-2,h*.5f+10),4f);drawLine(surface,androidx.compose.ui.geometry.Offset(w*.3f-2,h*.5f+10),androidx.compose.ui.geometry.Offset(w*.3f+14,h*.5f-12),4f);block(w*.48f,h*.32f,w*.32f,6f);block(w*.48f,h*.55f,w*.23f,6f)}
            "handoff" -> {block(w*.22f,h*.18f,w*.28f,h*.65f,surface);block(w*.26f,h*.3f,w*.2f,5f);block(w*.26f,h*.47f,w*.15f,5f);drawLine(ink,androidx.compose.ui.geometry.Offset(w*.64f,h*.25f),androidx.compose.ui.geometry.Offset(w*.64f,h*.65f),5f);drawLine(ink,androidx.compose.ui.geometry.Offset(w*.58f,h*.52f),androidx.compose.ui.geometry.Offset(w*.64f,h*.65f),4f);drawLine(ink,androidx.compose.ui.geometry.Offset(w*.7f,h*.52f),androidx.compose.ui.geometry.Offset(w*.64f,h*.65f),4f)}
            "media","illustrations","inspiration","assets" -> {block(w*.18f,h*.15f,w*.64f,h*.7f,surface);drawCircle(ink,9f,androidx.compose.ui.geometry.Offset(w*.66f,h*.32f));val path=androidx.compose.ui.graphics.Path().apply{moveTo(w*.23f,h*.73f);lineTo(w*.4f,h*.33f);lineTo(w*.55f,h*.65f);lineTo(w*.67f,h*.48f);lineTo(w*.77f,h*.73f);close()};drawPath(path,ink)}
            "content" -> {block(w*.17f,h*.25f,w*.47f,9f);block(w*.17f,h*.5f,w*.67f,5f);block(w*.17f,h*.68f,w*.55f,5f)}
            else -> {block(w*.15f,h*.18f,w*.7f,h*.2f,surface);block(w*.15f,h*.5f,w*.3f,h*.32f);block(w*.5f,h*.5f,w*.35f,h*.32f,ink.copy(alpha=.45f))}
        }
    }
}

@Composable
private fun UxNativeElementSample(kind:String,label:String){
    val accent=MaterialTheme.colorScheme.primary
    Box(Modifier.fillMaxWidth().height(58.dp).background(MaterialTheme.colorScheme.surfaceVariant,RoundedCornerShape(10.dp)),contentAlignment=Alignment.Center){
        when(kind){
            "icon"->UxNativeIconThumbnail("lucide:star")
            "ellipse","circle","avatar"->Box(Modifier.size(34.dp).background(accent,CircleShape))
            "triangle","diamond","hexagon","star","pill","rect"->Box(Modifier.size(55.dp,34.dp).background(accent,uxNativeComposeShape(kind,10)))
            "progress","slider","divider","line"->Box(Modifier.width(80.dp).height(if(kind=="divider"||kind=="line")2.dp else 7.dp).background(accent,RoundedCornerShape(5.dp)))
            "switch","toggle"->Box(Modifier.size(42.dp,24.dp).background(accent,CircleShape).padding(3.dp)){Box(Modifier.size(18.dp).align(Alignment.CenterEnd).background(MaterialTheme.colorScheme.onPrimary,CircleShape))}
            "input","dropdown","search","textarea"->Box(Modifier.fillMaxWidth(.8f).height(32.dp).border(1.dp,accent,RoundedCornerShape(6.dp)).padding(6.dp)){Text(if(kind=="search")"Search…" else "Your text",fontSize=10.sp)}
            "button","badge"->Box(Modifier.background(accent,RoundedCornerShape(if(kind=="badge")20.dp else 8.dp)).padding(horizontal=12.dp,vertical=6.dp)){Text(if(kind=="badge")"Active" else "Continue",color=MaterialTheme.colorScheme.onPrimary,fontSize=11.sp)}
            "chart"->Row(Modifier.height(36.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(4.dp)){listOf(12,23,18,32,28).forEach{v->Box(Modifier.width(10.dp).height(v.dp).background(accent,RoundedCornerShape(2.dp)))}}
            else->Text(if(kind=="text")"Aa · Your heading" else label,fontSize=if(kind=="text")18.sp else 12.sp,fontWeight=FontWeight.SemiBold,color=accent)
        }
    }
}

private data class UxUiNativeScreen(
    val id: String, val name: String, val target: String, val background: String,
    val customArtboard: Boolean, val customWidth: Int, val customHeight: Int,
    val elements: List<UxUiNativeLayer>, val updatedAt: Long = System.currentTimeMillis()
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

private object UxNativeArtworkLibrary {
    private var bundled: JSONObject? = null
    private val remote = android.util.LruCache<String, String>(160)
    @Synchronized fun icon(context: Context, name: String): String? {
        if (bundled == null) bundled = runCatching { context.assets.open("uxui-icons.json").bufferedReader().use { JSONObject(it.readText()) } }.getOrDefault(JSONObject())
        return bundled?.optString(name)?.takeIf { it.isNotBlank() } ?: remote.get(name)
    }
    fun names(context: Context): List<String> { icon(context,"lucide:house"); return bundled?.keys()?.asSequence()?.toList().orEmpty().sorted() }
    fun fetchIcon(context: Context, name: String): String {
        icon(context, name)?.let { return it }
        require(Regex("^[a-z0-9-]+:[a-z0-9-]+$").matches(name)) { "Choose a valid icon." }
        val connection = URL("https://api.iconify.design/" + name.replace(":", "/") + ".svg").openConnection().apply { connectTimeout = 8000; readTimeout = 8000 }
        val svg = connection.getInputStream().bufferedReader().use { it.readText().also { value -> require(value.length <= 256000) { "Icon artwork is too large." } } }
        require(svg.contains("<svg")) { "Icon artwork could not be loaded." }
        return uxNativeCleanIconSvg(svg).also { remote.put(name, it) }
    }
}

@Composable
private fun UxNativeIconThumbnail(iconName: String) {
    val context = LocalContext.current
    var svg by remember(iconName) { mutableStateOf(UxNativeArtworkLibrary.icon(context, iconName).orEmpty()) }
    var failed by remember(iconName) { mutableStateOf(false) }
    var retry by remember(iconName) { mutableIntStateOf(0) }
    LaunchedEffect(iconName, retry) {
        failed = false
        runCatching { withContext(Dispatchers.IO) { UxNativeArtworkLibrary.fetchIcon(context, iconName) } }
            .onSuccess { svg = it }.onFailure { failed = true }
    }
    val thumbnailColor=MaterialTheme.colorScheme.onSurface
    if (svg.isNotBlank()) {
        Canvas(modifier = Modifier.size(30.dp)) {
            val layer = UxUiNativeLayer("icon-thumb", "icon", iconName, 0, 0, size.width.roundToInt(), size.height.roundToInt(), "", color = String.format("#%06X",thumbnailColor.toArgb() and 0xFFFFFF), iconName = iconName, iconSvg = svg)
            drawIntoCanvas { canvas -> uxNativeDrawSvgIcon(canvas.nativeCanvas, layer) }
        }
    } else if (failed) {
        TextButton(onClick = { retry++ }, contentPadding = PaddingValues(0.dp), modifier = Modifier.sizeIn(minWidth = 44.dp, minHeight = 44.dp)) { Text("Retry", fontSize = 10.sp) }
    } else CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
}

private val uxNativeBundledFonts = mapOf("Inter" to "inter.ttf", "Lora" to "lora.ttf", "JetBrains Mono" to "jetbrains-mono.ttf", "Bebas Neue" to "bebas-neue.ttf", "Caveat" to "caveat.ttf")
private val uxNativeFontFamilies = listOf("Inter", "Lora", "JetBrains Mono", "Bebas Neue", "Caveat", "sans-serif", "serif", "monospace")
private val uxNativeTypefaceCache = android.util.LruCache<String, Typeface>(40)
private val uxNativeFontDataCache = mutableMapOf<String,String>()
private fun uxNativeBundledFontData(context:Context,family:String):String = uxNativeFontDataCache.getOrPut(family){
    uxNativeBundledFonts[family]?.let{file->runCatching{context.assets.open("fonts/"+file).use{input->"data:font/ttf;base64,"+Base64.encodeToString(input.readBytes(),Base64.NO_WRAP)}}.getOrDefault("")}.orEmpty()
}
private val uxNativeIconStyles = listOf(
    "all" to "All styles","lucide" to "Lucide · line","tabler" to "Tabler · outline",
    "material-symbols" to "Material Symbols","mdi" to "Material Design","ph" to "Phosphor",
    "solar" to "Solar","carbon" to "Carbon","fa6-solid" to "Font Awesome","heroicons" to "Heroicons",
    "fluent" to "Fluent","iconamoon" to "Iconamoon","mingcute" to "MingCute"
)
private val uxNativeIconCategories = linkedMapOf(
    "Navigation" to listOf("lucide:house","tabler:home","material-symbols:home-rounded","mdi:home","ph:house","solar:home-linear","carbon:home","fa6-solid:house","heroicons:home","fluent:home-24-regular","lucide:menu","tabler:menu-2","mdi:menu","ph:list","lucide:arrow-left","tabler:arrow-left","material-symbols:arrow-back-rounded","lucide:chevron-down","tabler:chevron-down","mdi:chevron-down"),
    "Actions" to listOf("lucide:plus","tabler:plus","material-symbols:add-rounded","mdi:plus","ph:plus-bold","lucide:check","tabler:check","mdi:check-bold","lucide:x","tabler:x","mdi:close","lucide:pencil","tabler:edit","mdi:pencil","lucide:trash-2","tabler:trash","mdi:delete","lucide:copy","tabler:copy","lucide:download","tabler:download"),
    "Forms" to listOf("lucide:mail","tabler:mail","mdi:email-outline","ph:envelope","lucide:lock","tabler:lock","mdi:lock-outline","lucide:eye","tabler:eye","mdi:eye-outline","lucide:eye-off","tabler:eye-off","lucide:calendar","tabler:calendar","lucide:clock","tabler:clock","lucide:sliders-horizontal","tabler:adjustments"),
    "Communication" to listOf("lucide:message-circle","tabler:message-circle","mdi:message-outline","lucide:bell","tabler:bell","mdi:bell-outline","lucide:phone","tabler:phone","mdi:phone-outline","lucide:send","tabler:send","lucide:users","tabler:users","mdi:account-group-outline"),
    "Media" to listOf("lucide:image","tabler:photo","mdi:image-outline","lucide:camera","tabler:camera","mdi:camera-outline","lucide:video","tabler:video","lucide:music","tabler:music","lucide:mic","tabler:microphone","lucide:play","tabler:player-play"),
    "Commerce" to listOf("lucide:shopping-cart","tabler:shopping-cart","mdi:cart-outline","lucide:credit-card","tabler:credit-card","mdi:credit-card-outline","lucide:wallet","tabler:wallet","mdi:wallet-outline","lucide:package","tabler:package","lucide:tag","tabler:tag","lucide:truck","tabler:truck"),
    "Data" to listOf("lucide:chart-column","tabler:chart-bar","mdi:chart-bar","lucide:chart-line","tabler:chart-line","mdi:chart-line","lucide:pie-chart","tabler:chart-pie","mdi:chart-pie","lucide:database","tabler:database","mdi:database-outline","lucide:table","tabler:table","lucide:activity"),
    "Devices" to listOf("lucide:smartphone","tabler:device-mobile","mdi:cellphone","lucide:tablet","tabler:device-tablet","mdi:tablet","lucide:laptop","tabler:device-laptop","mdi:laptop","lucide:monitor","tabler:device-desktop","mdi:monitor","lucide:wifi","tabler:wifi","lucide:bluetooth","lucide:battery"),
    "Files" to listOf("lucide:file-text","tabler:file-text","mdi:file-document-outline","lucide:folder","tabler:folder","mdi:folder-outline","lucide:cloud","tabler:cloud","mdi:cloud-outline","lucide:code","tabler:code","mdi:code-tags","lucide:terminal","tabler:terminal-2"),
    "Shapes" to listOf("lucide:circle","tabler:circle","mdi:circle-outline","lucide:square","tabler:square","mdi:square-outline","lucide:triangle","tabler:triangle","mdi:triangle-outline","lucide:star","tabler:star","mdi:star-outline","lucide:heart","tabler:heart","mdi:heart-outline","lucide:hexagon","tabler:hexagon","lucide:diamond","tabler:diamond")
)

private fun uxNativeFontFamilyCategory(family: String): String = when {
    family in setOf("serif","Merriweather","Playfair Display","Lora","PT Serif","Libre Baskerville","Roboto Slab","Fraunces","Cormorant Garamond","Crimson Text","Bitter") -> "Serif"
    family in setOf("JetBrains Mono","Fira Code","IBM Plex Mono","Source Code Pro","Space Mono","Inconsolata","monospace","Menlo") -> "Monospace"
    family in setOf("Oswald","Bebas Neue","Archivo Black","Anton","Space Grotesk","Syne") -> "Display"
    family in setOf("Caveat","Pacifico","Dancing Script","Satisfy") -> "Handwriting"
    else -> "Sans serif"
}

private fun uxNativeComposeShape(kind: String, radius: Int): Shape = when (kind) {
    "ellipse", "avatar" -> CircleShape
    "pill", "badge", "switch", "toggle" -> RoundedCornerShape(percent = 50)
    "triangle" -> GenericShape { size, _ ->
        moveTo(size.width / 2, 0f); lineTo(size.width, size.height); lineTo(0f, size.height); close()
    }
    "diamond" -> GenericShape { size, _ ->
        moveTo(size.width / 2, 0f); lineTo(size.width, size.height / 2); lineTo(size.width / 2, size.height); lineTo(0f, size.height / 2); close()
    }
    "hexagon" -> GenericShape { size, _ ->
        moveTo(size.width * .25f, 0f); lineTo(size.width * .75f, 0f); lineTo(size.width, size.height / 2)
        lineTo(size.width * .75f, size.height); lineTo(size.width * .25f, size.height); lineTo(0f, size.height / 2); close()
    }
    "star" -> GenericShape { size, _ ->
        for (index in 0 until 10) {
            val radiusFactor = if (index % 2 == 0) .5f else .21f
            val angle = (-PI / 2.0) + index * PI / 5.0
            val x = size.width / 2 + cos(angle).toFloat() * size.width * radiusFactor
            val y = size.height / 2 + sin(angle).toFloat() * size.height * radiusFactor
            if (index == 0) moveTo(x, y) else lineTo(x, y)
        }
        close()
    }
    else -> RoundedCornerShape(radius.coerceAtLeast(0).dp)
}

private fun uxNativeShapePath(kind: String, rect: RectF): android.graphics.Path? {
    if (kind !in setOf("triangle","diamond","hexagon","star","ellipse","avatar","pill","line")) return null
    val path = android.graphics.Path()
    val x=rect.left; val y=rect.top; val w=rect.width(); val h=rect.height()
    when(kind) {
        "ellipse", "avatar" -> { path.addOval(rect, android.graphics.Path.Direction.CW); return path }
        "pill" -> { path.addRoundRect(rect, minOf(w,h)/2, minOf(w,h)/2, android.graphics.Path.Direction.CW); return path }
        "line" -> { path.moveTo(rect.left,rect.centerY()); path.lineTo(rect.right,rect.centerY()); return path }
    }
    val points = when(kind) {
        "triangle" -> listOf(x+w/2 to y, x+w to y+h, x to y+h)
        "diamond" -> listOf(x+w/2 to y, x+w to y+h/2, x+w/2 to y+h, x to y+h/2)
        "hexagon" -> listOf(x+w*.25f to y, x+w*.75f to y, x+w to y+h/2, x+w*.75f to y+h, x+w*.25f to y+h, x to y+h/2)
        else -> (0 until 10).map { index ->
            val radiusFactor=if(index%2==0).5f else .21f
            val angle=(-PI/2.0)+index*PI/5.0
            (x+w/2+cos(angle).toFloat()*w*radiusFactor) to (y+h/2+sin(angle).toFloat()*h*radiusFactor)
        }
    }
    points.forEachIndexed { index, point -> if(index==0) path.moveTo(point.first,point.second) else path.lineTo(point.first,point.second) }
    path.close()
    return path
}

private fun uxNativeTypeface(context: Context, layer: UxUiNativeLayer): Typeface {
    val cacheKey = layer.fontFamily + ":" + layer.fontWeight + ":" + layer.fontData.hashCode()
    uxNativeTypefaceCache.get(cacheKey)?.let { return it }
    uxNativeBundledFonts[layer.fontFamily]?.let { file ->
        runCatching { Typeface.create(Typeface.createFromAsset(context.assets, "fonts/" + file), if (layer.fontWeight >= 600) Typeface.BOLD else Typeface.NORMAL) }
            .getOrNull()?.let { uxNativeTypefaceCache.put(cacheKey, it); return it }
    }
    val data = layer.fontData
    if (data.startsWith("data:font/") && data.contains(",")) {
        runCatching {
            val mime=data.substringAfter("data:").substringBefore(";").lowercase()
            require(mime=="font/ttf" || mime=="font/otf" || mime=="application/x-font-ttf" || mime=="application/vnd.ms-opentype")
            val bytes=Base64.decode(data.substringAfter(","),Base64.DEFAULT)
            require(bytes.size<=4*1024*1024)
            val extension=if(mime.contains("otf")||mime.contains("opentype"))"otf" else "ttf"
            val target=File(context.cacheDir,"uxui-font-"+data.hashCode()+"."+extension)
            if(!target.exists()||target.length()!=bytes.size.toLong())target.writeBytes(bytes)
            return Typeface.create(Typeface.createFromFile(target),if(layer.fontWeight>=600)Typeface.BOLD else Typeface.NORMAL).also{uxNativeTypefaceCache.put(cacheKey,it)}
        }
    }
    val family=when {
        layer.fontFamily.contains("mono",true)||layer.fontFamily.contains("code",true) -> Typeface.MONOSPACE
        layer.fontFamily.contains("serif",true)||layer.fontFamily.contains("Merriweather",true)||layer.fontFamily.contains("Playfair",true) -> Typeface.SERIF
        else -> Typeface.SANS_SERIF
    }
    return Typeface.create(family,if(layer.fontWeight>=600)Typeface.BOLD else Typeface.NORMAL)
}


private fun uxNativeCleanIconSvg(svg: String): String =
    svg
        .replace(Regex("(?is)<script\\b[^>]*>.*?</script\\s*>"), "")
        .replace(Regex("(?is)<foreignObject\\b[^>]*>.*?</foreignObject\\s*>"), "")
        .replace(Regex("(?i)\\s+on[a-z]+\\s*=\\s*(['\\\"]).*?\\1"), "")

private fun uxNativeSvgAttribute(source: String, name: String): String? =
    Regex("(?is)\\b"+Regex.escape(name)+"\\s*=\\s*['\\\"]([^'\\\"]*)['\\\"]").find(source)?.groupValues?.getOrNull(1)

private fun uxNativeDrawSvgIcon(canvas: android.graphics.Canvas, element: UxUiNativeLayer) {
    if (element.iconSvg.isBlank()) return
    runCatching {
        val svg = SVG.getFromString(uxNativeCleanIconSvg(element.iconSvg).replace("currentColor", element.color))
        svg.setDocumentWidth("100%")
        svg.setDocumentHeight("100%")
        svg.renderToCanvas(canvas, RectF(element.x.toFloat(), element.y.toFloat(), (element.x + element.width).toFloat(), (element.y + element.height).toFloat()))
    }
}

@Composable
private fun UxUiNativeArtworkPreview(element: UxUiNativeLayer, modifier: Modifier = Modifier, monochrome: Boolean = false) {
    val bitmap=remember(element.imageData) {
        if(element.kind!="image"||!element.imageData.startsWith("data:image/")) null
        else runCatching {
            val payload=element.imageData.substringAfter(",", "")
            val bytes=android.util.Base64.decode(payload,android.util.Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes,0,bytes.size)
        }.getOrNull()
    }
    Canvas(modifier) {
        val pixelWidth=size.width.roundToInt().coerceAtLeast(1)
        val pixelHeight=size.height.roundToInt().coerceAtLeast(1)
        drawIntoCanvas { composeCanvas ->
            val nativeCanvas=composeCanvas.nativeCanvas
            if(element.kind=="icon"&&element.iconSvg.isNotBlank()){
                uxNativeDrawSvgIcon(nativeCanvas,element.copy(x=0,y=0,width=pixelWidth,height=pixelHeight))
            } else if(bitmap!=null){
                val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
                if (monochrome) paint.colorFilter = android.graphics.ColorMatrixColorFilter(android.graphics.ColorMatrix().apply { setSaturation(0f) })
                nativeCanvas.drawBitmap(bitmap,null,Rect(0,0,pixelWidth,pixelHeight),paint)
            }
        }
    }
}

private fun uxNativeRasterIconData(layer:UxUiNativeLayer):String {
    val scale=minOf(1f,512f/maxOf(layer.width,layer.height))
    val w=(layer.width*scale).roundToInt().coerceAtLeast(1);val h=(layer.height*scale).roundToInt().coerceAtLeast(1)
    val bitmap=android.graphics.Bitmap.createBitmap(w,h,android.graphics.Bitmap.Config.ARGB_8888)
    uxNativeDrawSvgIcon(android.graphics.Canvas(bitmap),layer.copy(x=0,y=0,width=w,height=h))
    val bytes=ByteArrayOutputStream().use{out->bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);out.toByteArray()};bitmap.recycle()
    return "data:image/png;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)
}

private fun uxNativeBackgroundArtwork(name:String,width:Int,height:Int):String {
    val scale=minOf(1f,1024f/maxOf(width,height))
    val w=(width*scale).roundToInt().coerceAtLeast(1);val h=(height*scale).roundToInt().coerceAtLeast(1)
    val bitmap=android.graphics.Bitmap.createBitmap(w,h,android.graphics.Bitmap.Config.ARGB_8888)
    val canvas=android.graphics.Canvas(bitmap)
    val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    val colors=when(name){"Sunset"->intArrayOf(0xFFFB7185.toInt(),0xFF7C3AED.toInt());"Forest"->intArrayOf(0xFF059669.toInt(),0xFF164E63.toInt());else->intArrayOf(0xFF2563EB.toInt(),0xFF7C3AED.toInt())}
    if(name in setOf("Dots","Grid","Stripes","Checkerboard")){
        canvas.drawColor(0xFFF8FAFC.toInt());paint.color=0xFFCBD5E1.toInt();paint.strokeWidth=1f
        val gap=(w/16f).coerceAtLeast(8f)
        var x=0f;while(x<=w){var y=0f;while(y<=h){when(name){"Dots"->canvas.drawCircle(x,y,2f,paint);"Checkerboard"->if(((x/gap).roundToInt()+(y/gap).roundToInt())%2==0)canvas.drawRect(x,y,x+gap,y+gap,paint);else->{}};y+=gap};if(name=="Grid")canvas.drawLine(x,0f,x,h.toFloat(),paint);if(name=="Stripes")canvas.drawLine(x,0f,x,h.toFloat(),paint.apply{strokeWidth=gap/3});x+=gap}
        if(name=="Grid"){var y=0f;while(y<=h){canvas.drawLine(0f,y,w.toFloat(),y,paint);y+=gap}}
    }else{
        paint.shader=if(name=="Radial glow")android.graphics.RadialGradient(w*.5f,h*.4f,maxOf(w,h)*.7f,colors,null,android.graphics.Shader.TileMode.CLAMP)else android.graphics.LinearGradient(0f,0f,w.toFloat(),h.toFloat(),colors,null,android.graphics.Shader.TileMode.CLAMP)
        canvas.drawRect(0f,0f,w.toFloat(),h.toFloat(),paint)
    }
    val bytes=ByteArrayOutputStream().use{out->bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);out.toByteArray()};bitmap.recycle()
    return "data:image/png;base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)
}

private fun uxNativeJson(elements: List<UxUiNativeLayer>): JSONArray = JSONArray().apply {
    elements.forEach { element -> put(JSONObject().apply {
        put("id", element.id); put("kind", element.kind); put("name", element.name)
        put("x", element.x); put("y", element.y); put("width", element.width); put("height", element.height)
        put("text", element.text); put("color", element.color); put("background",element.fill); put("imageDataUrl",element.imageData); put("fontDataUrl",element.fontData); put("fill", element.fill); put("iconName", element.iconName); put("iconSvg", element.iconSvg); put("imageData", element.imageData); put("fontData", element.fontData)
        put("fontFamily", element.fontFamily); put("fontSize", element.fontSize); put("fontWeight", element.fontWeight)
        put("radius", element.radius); put("borderColor", element.borderColor); put("borderWidth", element.borderWidth); put("padding", element.padding)
        put("marginTop", element.marginTop); put("marginRight", element.marginRight); put("marginBottom", element.marginBottom); put("marginLeft", element.marginLeft)
        put("horizontalConstraint", element.horizontalConstraint); put("verticalConstraint", element.verticalConstraint)
        put("minWidth", element.minWidth); put("maxWidth", element.maxWidth); put("visibleOn", element.visibleOn)
        put("referenceWidth", element.referenceWidth); put("referenceHeight", element.referenceHeight); put("componentKey", element.componentKey)
        put("iconViewBox", element.iconViewBox); put("rotation", element.rotation); put("prototypeTargetScreenId", element.prototypeTargetScreenId); put("opacity", element.opacity); put("shadow", element.shadow)
    }) }
}

private fun uxNativeReadJson(elements: JSONArray): List<UxUiNativeLayer> = buildList {
    for (index in 0 until elements.length()) {
        val item = elements.optJSONObject(index) ?: continue
        add(UxUiNativeLayer(
            id=item.optString("id","layer-"+index),kind=item.optString("kind","text"),name=item.optString("name","Layer"),
            x=item.optInt("x"),y=item.optInt("y"),width=item.optInt("width",180).coerceAtLeast(1),height=item.optInt("height",48).coerceAtLeast(1),
            text=item.optString("text"),color=item.optString("color","#111827"),fill=item.optString("fill","transparent"),iconName=item.optString("iconName"),iconSvg=item.optString("iconSvg"),imageData=item.optString("imageData"),fontData=item.optString("fontData"),
            fontFamily=item.optString("fontFamily","sans-serif"),fontSize=item.optInt("fontSize",16).coerceAtLeast(1),fontWeight=item.optInt("fontWeight",400),
            radius=item.optInt("radius",12),borderColor=item.optString("borderColor","#E5E7EB"),borderWidth=item.optInt("borderWidth"),padding=item.optInt("padding",12),
            marginTop=item.optInt("marginTop"),marginRight=item.optInt("marginRight"),marginBottom=item.optInt("marginBottom"),marginLeft=item.optInt("marginLeft"),
            horizontalConstraint=item.optString("horizontalConstraint","left"),verticalConstraint=item.optString("verticalConstraint","top"),
            minWidth=item.optInt("minWidth"),maxWidth=item.optInt("maxWidth"),visibleOn=item.optString("visibleOn","mobile,tablet,desktop"),
            referenceWidth=item.optInt("referenceWidth",390),referenceHeight=item.optInt("referenceHeight",844),componentKey=item.optString("componentKey"),
            iconViewBox=item.optString("iconViewBox","0 0 24 24"),rotation=item.optDouble("rotation",0.0).toFloat(),prototypeTargetScreenId=item.optString("prototypeTargetScreenId",""),opacity=item.optDouble("opacity",1.0).toFloat().coerceIn(0f,1f),shadow=item.optBoolean("shadow",false)
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


private object UxUiNativePdf {
    fun build(
        context: Context,
        projectName: String,
        target: String,
        background: String,
        elements: List<UxUiNativeLayer>,
        projectJson: String,
        boardWidth: Int,
        boardHeight: Int
    ): ByteArray {
        val safeWidth = boardWidth.coerceIn(320, 4096)
        val safeHeight = boardHeight.coerceIn(320, 4096)
        val document = PdfDocument()
        try {
            val artboardInfo = PdfDocument.PageInfo.Builder(safeWidth, safeHeight, 1).create()
            val artboardPage = document.startPage(artboardInfo)
            val canvas = artboardPage.canvas
            canvas.drawColor(runCatching { android.graphics.Color.parseColor(background) }
                .getOrDefault(android.graphics.Color.WHITE))
            val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.rgb(100, 116, 139)
                textSize = 11f
            }
            elements.filter { it.visibleOn.split(",").map(String::trim).contains(target) || it.visibleOn.isBlank() }.forEach { original ->
                val layer = original.copy(
                    x = uxNativeLayerX(original, safeWidth),
                    y = uxNativeLayerY(original, safeHeight),
                    width = uxNativeLayerWidth(original, safeWidth),
                    height = uxNativeLayerHeight(original, safeHeight)
                )
                val rect = RectF(layer.x.toFloat(), layer.y.toFloat(),
                    (layer.x + layer.width).toFloat(), (layer.y + layer.height).toFloat())
                val layerSave = canvas.saveLayerAlpha(null, (layer.opacity.coerceIn(0f,1f)*255).roundToInt())
                canvas.rotate(layer.rotation,rect.centerX(),rect.centerY())
                val shapePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = runCatching { android.graphics.Color.parseColor(layer.fill) }
                        .getOrDefault(android.graphics.Color.TRANSPARENT)
                    style = Paint.Style.FILL
                }
                if(layer.shadow){
                    val shadowPaint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=0x26000000;setShadowLayer(12f,0f,6f,0x33000000)}
                    canvas.drawRoundRect(rect,layer.radius.toFloat(),layer.radius.toFloat(),shadowPaint)
                }
                val vectorShape = uxNativeShapePath(layer.kind, rect)
                if (layer.kind == "line") {
                    shapePaint.color = runCatching { android.graphics.Color.parseColor(layer.fill) }.getOrDefault(android.graphics.Color.DKGRAY)
                    shapePaint.style = Paint.Style.STROKE
                    shapePaint.strokeWidth = maxOf(1f, layer.height.toFloat(), layer.borderWidth.toFloat())
                    canvas.drawLine(rect.left, rect.centerY(), rect.right, rect.centerY(), shapePaint)
                } else if (!layer.fill.equals("transparent", true) && shapePaint.color != android.graphics.Color.TRANSPARENT) {
                    if (vectorShape != null) canvas.drawPath(vectorShape, shapePaint)
                    else canvas.drawRoundRect(rect, layer.radius.toFloat(), layer.radius.toFloat(), shapePaint)
                }
                if (layer.borderWidth > 0 && layer.kind != "line") {
                    shapePaint.color = runCatching { android.graphics.Color.parseColor(layer.borderColor) }
                        .getOrDefault(android.graphics.Color.LTGRAY)
                    shapePaint.style = Paint.Style.STROKE
                    shapePaint.strokeWidth = layer.borderWidth.toFloat()
                    if (vectorShape != null) canvas.drawPath(vectorShape, shapePaint)
                    else canvas.drawRoundRect(rect, layer.radius.toFloat(), layer.radius.toFloat(), shapePaint)
                }
                when {
                    layer.kind == "icon" && layer.iconSvg.isNotBlank() -> uxNativeDrawSvgIcon(canvas, layer)
                    layer.kind == "image" && layer.imageData.startsWith("data:image/") -> {
                        val payload = layer.imageData.substringAfter(",", "")
                        val bitmap = runCatching {
                            val bytes = android.util.Base64.decode(payload, android.util.Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        }.getOrNull()
                        if (bitmap != null) {
                            val save = canvas.save()
                            val clip = android.graphics.Path().apply {
                                addRoundRect(rect, layer.radius.toFloat(), layer.radius.toFloat(), android.graphics.Path.Direction.CW)
                            }
                            canvas.clipPath(clip)
                            canvas.drawBitmap(bitmap, null, rect, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
                            canvas.restoreToCount(save)
                            bitmap.recycle()
                        } else {
                            footerPaint.color = android.graphics.Color.DKGRAY
                            canvas.drawText("Image unavailable", layer.x + layer.padding.toFloat(), layer.y + 16f, footerPaint)
                        }
                    }
                    else -> {
                        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            color = runCatching { android.graphics.Color.parseColor(layer.color) }
                                .getOrDefault(android.graphics.Color.BLACK)
                            textSize = layer.fontSize.coerceIn(1, 256).toFloat()
                            typeface = uxNativeTypeface(context, layer)
                        }
                        val save = canvas.save()
                        canvas.clipRect(rect)
                        var baseline = layer.y + layer.padding + textPaint.textSize
                        val maxWidth = (layer.width - layer.padding * 2).coerceAtLeast(1).toFloat()
                        layer.text.lines().forEach { sourceLine ->
                            if (sourceLine.isEmpty()) {
                                baseline += textPaint.textSize * 1.25f
                            } else {
                                var remaining = sourceLine
                                var guard = 0
                                while (remaining.isNotEmpty() && guard < 100 && baseline <= rect.bottom) {
                                    val count = textPaint.breakText(remaining, true, maxWidth, null).coerceAtLeast(1)
                                    canvas.drawText(remaining.take(count), layer.x + layer.padding.toFloat(), baseline, textPaint)
                                    remaining = remaining.drop(count).trimStart()
                                    baseline += textPaint.textSize * 1.25f
                                    guard++
                                }
                            }
                        }
                        canvas.restoreToCount(save)
                    }
                }
                canvas.restoreToCount(layerSave)
            }
            footerPaint.color = android.graphics.Color.rgb(100, 116, 139)
            canvas.drawText("enV UX/UI Studio · " + safeWidth + " × " + safeHeight + " px · " + elements.size + " layers",
                16f, (safeHeight - 12).coerceAtLeast(16).toFloat(), footerPaint)
            document.finishPage(artboardPage)

            val root = runCatching { JSONObject(projectJson) }.getOrElse { JSONObject() }
            val aiPrompt = root.optString("aiPrompt",
                uxNativePrompt(projectName, target, background, elements, safeWidth, safeHeight))
            root.remove("generatedCode")
            fun removeRawAssets(array: JSONArray?) {
                if (array == null) return
                for (index in 0 until array.length()) {
                    val element = array.optJSONObject(index) ?: continue
                    element.remove("iconSvg")
                    element.remove("imageData")
                    element.remove("imageDataUrl")
                    element.remove("fontData")
                    element.remove("fontDataUrl")
                }
            }
            removeRawAssets(root.optJSONArray("elements"))
            removeRawAssets(root.optJSONArray("reusableComponents"))
            root.put("pdfAssetNote", "The first page renders selected icon and image artwork. Full vector and image assets remain embedded in the editable JSON project; this PDF appendix keeps identifiers and exact measurements without duplicating large binary payloads.")
            val specText = root.toString(2)
            val appendixLines = mutableListOf<String>()
            appendixLines.add("AI IMPLEMENTATION PROMPT")
            appendixLines.add("")
            appendixLines.addAll(aiPrompt.lines())
            appendixLines.add("")
            appendixLines.add("MACHINE-READABLE DESIGN SPECIFICATION")
            appendixLines.add("")
            appendixLines.addAll(specText.lines())

            var pageNumber = 2
            var page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
            var specCanvas = page.canvas
            specCanvas.drawColor(android.graphics.Color.WHITE)
            val headingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.rgb(37, 99, 235)
                textSize = 13f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
            val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.rgb(31, 41, 55)
                textSize = 7.2f
                typeface = Typeface.create("monospace", Typeface.NORMAL)
            }
            specCanvas.drawText("DESIGN HANDOFF · " + projectName, 28f, 24f, headingPaint)
            var y = 44f
            appendixLines.forEach { line ->
                val maxChars = 112
                val wrapped = if (line.length <= maxChars) listOf(line) else {
                    val pieces = mutableListOf<String>()
                    var rest = line
                    while (rest.length > maxChars) {
                        var splitAt = rest.lastIndexOf(' ', maxChars)
                        if (splitAt <= 0) splitAt = maxChars
                        pieces.add(rest.substring(0, splitAt))
                        rest = rest.substring(splitAt).trimStart()
                    }
                    pieces.add(rest)
                    pieces
                }
                wrapped.forEach { piece ->
                    if (y > 812f) {
                        document.finishPage(page)
                        pageNumber++
                        page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
                        specCanvas = page.canvas
                        specCanvas.drawColor(android.graphics.Color.WHITE)
                        specCanvas.drawText("DESIGN HANDOFF · " + projectName + " · continued", 28f, 24f, headingPaint)
                        y = 44f
                    }
                    specCanvas.drawText(piece.take(140), 28f, y, bodyPaint)
                    y += 9f
                }
            }
            document.finishPage(page)
            val output = ByteArrayOutputStream()
            document.writeTo(output)
            return output.toByteArray()
        } finally {
            document.close()
        }
    }
}

private fun uxNativeProjectJson(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,boardWidth:Int=if(target=="mobile")390 else if(target=="tablet")768 else 1440,boardHeight:Int=if(target=="mobile")844 else if(target=="tablet")1024 else 900,tokens:JSONObject=JSONObject(),reusable:JSONArray=JSONArray(),screens:List<UxUiNativeScreen> = emptyList(),activeScreenId:String=""):String {
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
    val screenJson = JSONArray().apply {
        screens.forEach { screen ->
            put(JSONObject()
                .put("id", screen.id).put("name", screen.name).put("target", screen.target).put("background", screen.background)
                .put("customArtboard", screen.customArtboard).put("customWidth", screen.customWidth).put("customHeight", screen.customHeight)
                .put("elements", uxNativeJson(screen.elements)).put("updatedAt", screen.updatedAt))
        }
    }
    return JSONObject().put("schemaVersion",2).put("name",name).put("target",target).put("background",background)
        .put("viewport",JSONObject().put("width",boardWidth).put("height",boardHeight))
        .put("breakpoints",breakpoints).put("tokens",tokens).put("reusableComponents",reusable)
        .put("screens",screenJson).put("activeScreenId",activeScreenId)
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
        val css="position:absolute;opacity:"+e.opacity+";transform:rotate("+e.rotation+"deg);"+(if(e.shadow)"box-shadow:0 6px 12px #00000026;" else "")+hx+";"+vy+";"+vw+";"+vh+";box-sizing:border-box;padding:"+e.padding+"px;color:"+e.color+";background:"+(if(e.fill=="transparent")"transparent" else e.fill)+";border:"+e.borderWidth+"px solid "+(if(e.borderWidth>0)e.borderColor else "transparent")+";border-radius:"+e.radius+"px;font-family:"+e.fontFamily+";font-size:"+e.fontSize+"px;font-weight:"+e.fontWeight+";line-height:1.35;white-space:pre-wrap;overflow:hidden;"+(if(e.minWidth>0)"min-width:"+e.minWidth+"px;" else "")+(if(e.maxWidth>0)"max-width:"+e.maxWidth+"px;" else "")
        val common="class='env-layer' data-visible-on='"+e.visibleOn+"' style='"+css+"'"
        when(e.kind) {
            "icon" -> "<div "+common+" aria-label='"+e.name+"'>"+(if(e.iconSvg.isNotBlank())e.iconSvg else e.iconName)+"</div>"
            "image" -> "<div "+common+">"+(if(e.imageData.isNotBlank())"<img alt='"+e.name+"' src='"+e.imageData+"' style='width:100%;height:100%;object-fit:cover'>" else e.text)+"</div>"
            "input","search","textarea" -> "<div "+common+"><input aria-label='"+e.name+"' placeholder='"+e.text+"' style='width:100%;height:100%;font:inherit;color:inherit;background:transparent;border:0'></div>"
            "button" -> "<button type='button' "+common+">"+e.text+"</button>"
            else -> "<div "+common+">"+e.text+"</div>"
        }
    }
    val fontFaces=elements.filter{it.fontData.isNotBlank()}.distinctBy{it.fontFamily}.joinToString(""){e->"@font-face{font-family:"+JSONObject.quote(e.fontFamily)+";src:url("+JSONObject.quote(e.fontData)+")} "}
    val mobile=breakpoints.optInt("mobile",480);val desktop=breakpoints.optInt("desktop",1024)
    return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+name+"</title><style>"+fontFaces+"*{box-sizing:border-box}body{margin:0;padding:16px;background:#f1f5f9;font-family:Inter,system-ui,sans-serif}.env-artboard{position:relative;container-type:size;width:min(100%,"+width+"px);aspect-ratio:"+width+"/"+height+";margin:0 auto;background:"+background+";overflow:hidden}@media(max-width:"+mobile+"px){.env-layer:not([data-visible-on~='mobile']){display:none!important}}@media(min-width:"+(mobile+1)+"px) and (max-width:"+(desktop-1)+"px){.env-layer:not([data-visible-on~='tablet']){display:none!important}}@media(min-width:"+desktop+"px){.env-layer:not([data-visible-on~='desktop']){display:none!important}}</style></head><body><main class='env-artboard' aria-label='"+name+" design'>"+body+"</main></body></html>"
}

private fun uxNativeKotlinDataLiteral(value:String):String = value.chunked(12000).joinToString(prefix="listOf(",postfix=").joinToString(\"\")"){JSONObject.quote(it)}

private fun uxNativeGenerateKotlin(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,width:Int,height:Int):String = buildString {
    appendLine("// Generated by enV UX/UI Studio. Uses native Compose and embedded raster artwork. Original SVGs remain in project JSON.")
    appendLine("import android.graphics.Paint")
    appendLine("import android.graphics.Typeface")
    appendLine("import androidx.compose.ui.platform.LocalContext")
    appendLine("import androidx.compose.ui.text.font.FontFamily")
    appendLine("import java.io.File")
    appendLine("import android.graphics.BitmapFactory")
    appendLine("import android.util.Base64")
    appendLine("import androidx.compose.foundation.Canvas")
    appendLine("import androidx.compose.foundation.Image")
    appendLine("import androidx.compose.foundation.background")
    appendLine("import androidx.compose.foundation.layout.*")
    appendLine("import androidx.compose.foundation.shape.RoundedCornerShape")
    appendLine("import androidx.compose.material3.Text")
    appendLine("import androidx.compose.runtime.*")
    appendLine("import androidx.compose.ui.Modifier")
    appendLine("import androidx.compose.ui.graphics.Color")
    appendLine("import androidx.compose.ui.graphics.graphicsLayer")
    appendLine("import androidx.compose.ui.draw.shadow")
    appendLine("import androidx.compose.ui.graphics.asImageBitmap")
    appendLine("import androidx.compose.ui.graphics.drawscope.drawIntoCanvas")
    appendLine("import androidx.compose.ui.graphics.nativeCanvas")
    appendLine("import androidx.compose.ui.layout.ContentScale")
    appendLine("import androidx.compose.ui.text.font.FontWeight")
    appendLine("import androidx.compose.ui.unit.dp")
    appendLine("import androidx.compose.ui.unit.sp")
    appendLine("import androidx.core.graphics.PathParser")
    appendLine()
    appendLine("@Composable fun "+uxNativeSafeIdentifier(name)+"Design(target: String = "+JSONObject.quote(target)+") {")
    appendLine("  val context = LocalContext.current")
    appendLine("  BoxWithConstraints(Modifier.fillMaxWidth().height("+height+".dp)) {")
    appendLine("    val widthDelta = maxWidth.value - "+width+".f")
    appendLine("    val heightDelta = maxHeight.value - "+height+".f")
    appendLine("    Box(Modifier.fillMaxSize().background(Color(android.graphics.Color.parseColor("+JSONObject.quote(background)+")))) {")
    elements.forEachIndexed { layerIndex,e ->
        val x=when(e.horizontalConstraint){"center"->"("+e.x+".f + widthDelta/2f)";"right"->"(maxWidth.value - "+(e.referenceWidth-e.x-e.width).coerceAtLeast(0)+".f - "+e.width+".f)";else->e.x.toString()+".f"}
        val y=when(e.verticalConstraint){"center"->"("+e.y+".f + heightDelta/2f)";"bottom"->"(maxHeight.value - "+(e.referenceHeight-e.y-e.height).coerceAtLeast(0)+".f - "+e.height+".f)";else->e.y.toString()+".f"}
        var w=if(e.horizontalConstraint=="stretch")"("+e.width+".f + widthDelta).coerceAtLeast("+e.minWidth.coerceAtLeast(1)+".f)" else e.width.toString()+".f"
        if(e.horizontalConstraint=="stretch"&&e.maxWidth>0)w+=".coerceAtMost("+e.maxWidth+".f)"
        val h=if(e.verticalConstraint=="stretch")"("+e.height+".f + heightDelta).coerceAtLeast(1f)" else e.height.toString()+".f"
        val fill=if(e.fill=="transparent")background else e.fill
        appendLine("      // "+e.name.replace("\n"," ")+"; "+e.kind+"; anchors "+e.horizontalConstraint+"/"+e.verticalConstraint)
        appendLine("      if (listOf("+e.visibleOn.split(",").filter{it.isNotBlank()}.joinToString(","){JSONObject.quote(it)}+").contains(target)) Box(Modifier.offset(x=("+x+").dp,y=("+y+").dp).size(width=("+w+").dp,height=("+h+").dp).graphicsLayer(rotationZ="+e.rotation+"f,alpha="+e.opacity+"f).shadow("+(if(e.shadow)12 else 0)+".dp,RoundedCornerShape("+e.radius+".dp)).background(Color(android.graphics.Color.parseColor("+JSONObject.quote(fill)+")),RoundedCornerShape("+e.radius+".dp)).padding("+e.padding+".dp)) {")
        if((e.kind=="icon"&&e.iconSvg.isNotBlank())||(e.kind=="image"&&e.imageData.isNotBlank())) {
            val payload=(if(e.kind=="icon")uxNativeRasterIconData(e)else e.imageData).substringAfter(",", "")
            appendLine("        val studioImage"+layerIndex+" = remember { Base64.decode("+uxNativeKotlinDataLiteral(payload)+",Base64.DEFAULT).let { bytes -> BitmapFactory.decodeByteArray(bytes,0,bytes.size)?.asImageBitmap() } }")
            appendLine("        if(studioImage"+layerIndex+" != null) Image(bitmap=studioImage"+layerIndex+"!!,contentDescription="+JSONObject.quote(e.name)+",contentScale=ContentScale.Crop,modifier=Modifier.fillMaxSize())")
        } else {
            val fontCode=if(e.fontData.isNotBlank()){
                val payload=e.fontData.substringAfter(",", "")
                appendLine("        val studioFont"+layerIndex+" = remember { val file=File(context.cacheDir,\"studio-font-"+layerIndex+".ttf\");file.writeBytes(Base64.decode("+uxNativeKotlinDataLiteral(payload)+",Base64.DEFAULT));FontFamily(Typeface.createFromFile(file)) }")
                "studioFont"+layerIndex
            }else when(e.fontFamily){"monospace"->"FontFamily.Monospace";"serif"->"FontFamily.Serif";else->"FontFamily.SansSerif"}
            appendLine("        Text("+JSONObject.quote(e.text)+",color=Color(android.graphics.Color.parseColor("+JSONObject.quote(e.color)+")),fontSize="+e.fontSize+".sp,fontWeight=FontWeight("+e.fontWeight+"),fontFamily="+fontCode+",modifier=Modifier.fillMaxSize())")
        }
        appendLine("      }")
    }
    appendLine("    }")
    appendLine("  }")
    appendLine("}")
}

private fun uxNativeGenerateSwift(name:String,target:String,background:String,elements:List<UxUiNativeLayer>,width:Int,height:Int):String = buildString {
    appendLine("// Generated by enV UX/UI Studio. Native SwiftUI output with embedded raster artwork. Original SVGs remain in project JSON.")
    appendLine("import SwiftUI")
    appendLine("import UIKit")
    appendLine("import CoreText")
    appendLine("private func studioEmbeddedFont(_ encoded:String,size:CGFloat)->Font { guard let data=Data(base64Encoded:encoded),let provider=CGDataProvider(data:data as CFData),let font=CGFont(provider),let name=font.postScriptName else{return .system(size:size)};CTFontManagerRegisterGraphicsFont(font,nil);return .custom(name as String,size:size) }")
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
        val visible=e.visibleOn.split(",").filter{it.isNotBlank()}.joinToString(","){JSONObject.quote(it)}
        val child=when {
            e.kind=="icon"&&e.iconSvg.isNotBlank() -> {
                val payload=uxNativeRasterIconData(e).substringAfter(",", "")
                "Group { if let data = Data(base64Encoded:"+JSONObject.quote(payload)+"), let image = UIImage(data:data) { Image(uiImage:image).resizable().scaledToFit() } }"
            }
            e.kind=="image"&&e.imageData.isNotBlank() -> {
                val payload=e.imageData.substringAfter(",", "")
                "Group { if let data = Data(base64Encoded:"+JSONObject.quote(payload)+"), let image = UIImage(data:data) { Image(uiImage:image).resizable().scaledToFill() } else { Text("+JSONObject.quote(e.name+" image unavailable")+") } }"
            }
            else -> {
                val face=if(e.fontData.isNotBlank())"studioEmbeddedFont("+JSONObject.quote(e.fontData.substringAfter(",", ""))+",size:"+e.fontSize+")" else ".custom("+JSONObject.quote(e.fontFamily)+",size:"+e.fontSize+")"
                "Text("+JSONObject.quote(e.text)+").font("+face+").foregroundStyle(Color(hex:"+JSONObject.quote(e.color)+"))"
            }
        }
        appendLine("      if ["+visible+"].contains(target) {")
        appendLine("        "+child+".frame(width:"+w+",height:"+h+",alignment:.topLeading).background(Color(hex:"+JSONObject.quote(fill)+")).clipShape(RoundedRectangle(cornerRadius:"+e.radius+")).shadow(color:Color.black.opacity("+(if(e.shadow)"0.15" else "0")+"),radius:12,x:0,y:6).opacity("+e.opacity+").rotationEffect(.degrees("+e.rotation+")).position(x:CGFloat("+e.x+")+"+dx+"+("+w+")/2,y:CGFloat("+e.y+")+"+dy+"+("+h+")/2)")
        appendLine("      }")
    }
    appendLine("    }")
    appendLine("  } }.frame(maxWidth:.infinity,minHeight:"+height+")")
    appendLine("}")
    appendLine("extension Color { init(hex:String) { let value=UInt64(hex.trimmingCharacters(in:CharacterSet.alphanumerics.inverted),radix:16) ?? 0; self.init(.sRGB,red:Double((value>>16)&255)/255,green:Double((value>>8)&255)/255,blue:Double(value&255)/255,opacity:1) } }")
    appendLine("""
    private struct EnVStudioNativeSVGIcon: View {
        let paths: [String]
        let viewBox: CGRect
        let tint: Color
        let stroked: Bool
        let strokeWidth: CGFloat
        var body: some View {
            Canvas { context, size in
                let sx = size.width / max(1, viewBox.width)
                let sy = size.height / max(1, viewBox.height)
                let transform = CGAffineTransform(a:sx,b:0,c:0,d:sy,tx:-viewBox.minX*sx,ty:-viewBox.minY*sy)
                for data in paths {
                    let path = enVStudioSVGPath(data).applying(transform)
                    if stroked { context.stroke(path,with:.color(tint),lineWidth:strokeWidth*(sx+sy)/2) }
                    else { context.fill(path,with:.color(tint)) }
                }
            }
        }
    }

    private func enVStudioSVGPath(_ data: String) -> Path {
        let pattern = #"[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?"#
        let regex = try! NSRegularExpression(pattern: pattern)
        let ns = data as NSString
        let tokens = regex.matches(in:data,range:NSRange(location:0,length:ns.length)).map { ns.substring(with:$0.range) }
        var i = 0
        var command: Character?
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastCubic: CGPoint?
        var lastQuad: CGPoint?
        var path = Path()
        func isCommand(_ token:String)->Bool { token.count == 1 && token.first?.isLetter == true }
        func number()->CGFloat? {
            guard i < tokens.count, !isCommand(tokens[i]), let value = Double(tokens[i]) else { return nil }
            i += 1
            return CGFloat(value)
        }
        func point(_ x:CGFloat,_ y:CGFloat,_ relative:Bool)->CGPoint {
            relative ? CGPoint(x:current.x+x,y:current.y+y) : CGPoint(x:x,y:y)
        }
        while i < tokens.count {
            if isCommand(tokens[i]) { command = tokens[i].first; i += 1 }
            guard let active=command else { break }
            let relative=active.isLowercase
            switch active.uppercased() {
            case "Z":
                path.closeSubpath(); current=start; lastCubic=nil; lastQuad=nil; command=nil
            case "M":
                guard let x=number(),let y=number() else { command=nil; continue }
                let end=point(x,y,relative); path.move(to:end); current=end; start=end
                command = relative ? "l" : "L"; lastCubic=nil; lastQuad=nil
            case "L":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x=number(),let y=number() else { break }
                    let end=point(x,y,relative); path.addLine(to:end); current=end; done=true
                }
                if !done { command=nil }; lastCubic=nil; lastQuad=nil
            case "H":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x=number() else { break }
                    let end=CGPoint(x:relative ? current.x+x : x,y:current.y); path.addLine(to:end); current=end; done=true
                }
                if !done { command=nil }; lastCubic=nil; lastQuad=nil
            case "V":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let y=number() else { break }
                    let end=CGPoint(x:current.x,y:relative ? current.y+y : y); path.addLine(to:end); current=end; done=true
                }
                if !done { command=nil }; lastCubic=nil; lastQuad=nil
            case "C":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x1=number(),let y1=number(),let x2=number(),let y2=number(),let x=number(),let y=number() else { break }
                    let c1=point(x1,y1,relative),c2=point(x2,y2,relative),end=point(x,y,relative)
                    path.addCurve(to:end,control1:c1,control2:c2);current=end;lastCubic=c2;lastQuad=nil;done=true
                }
                if !done { command=nil }
            case "S":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x2=number(),let y2=number(),let x=number(),let y=number() else { break }
                    let c1=lastCubic.map{prior in CGPoint(x:2*current.x-prior.x,y:2*current.y-prior.y)} ?? current
                    let c2=point(x2,y2,relative),end=point(x,y,relative)
                    path.addCurve(to:end,control1:c1,control2:c2);current=end;lastCubic=c2;lastQuad=nil;done=true
                }
                if !done { command=nil }
            case "Q":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x1=number(),let y1=number(),let x=number(),let y=number() else { break }
                    let c=point(x1,y1,relative),end=point(x,y,relative)
                    path.addQuadCurve(to:end,control:c);current=end;lastQuad=c;lastCubic=nil;done=true
                }
                if !done { command=nil }
            case "T":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard let x=number(),let y=number() else { break }
                    let c=lastQuad.map{prior in CGPoint(x:2*current.x-prior.x,y:2*current.y-prior.y)} ?? current
                    let end=point(x,y,relative);path.addQuadCurve(to:end,control:c);current=end;lastQuad=c;lastCubic=nil;done=true
                }
                if !done { command=nil }
            case "A":
                var done=false
                while i<tokens.count && !isCommand(tokens[i]) {
                    guard number() != nil,number() != nil,number() != nil,number() != nil,number() != nil,let x=number(),let y=number() else { break }
                    let end=point(x,y,relative);path.addLine(to:end);current=end;done=true
                }
                if !done { command=nil };lastCubic=nil;lastQuad=nil
            default: command=nil
            }
        }
        return path
    }
    """.trimIndent())
}

@Composable
fun NativeUxUiStudioForm() {
    // Inherit the effective user theme, including an explicit app override.
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val ink = if (dark) Color.White else Color.Black
    val surface = if (dark) Color(0xFF111111) else Color.White
    val muted = if (dark) Color(0xFFBBBBBB) else Color(0xFF555555)
    val soft = if (dark) Color(0xFF252525) else Color(0xFFF0F0F0)
    val outline = if (dark) Color(0xFF555555) else Color(0xFFCCCCCC)
    val scheme = MaterialTheme.colorScheme.copy(
        primary=ink, onPrimary=surface, primaryContainer=soft, onPrimaryContainer=ink,
        secondary=ink, onSecondary=surface, secondaryContainer=soft, onSecondaryContainer=ink,
        tertiary=ink, onTertiary=surface, tertiaryContainer=soft, onTertiaryContainer=ink,
        inversePrimary=surface, inverseSurface=ink, inverseOnSurface=surface,
        background=surface, onBackground=ink, surface=surface, onSurface=ink,
        surfaceVariant=soft, onSurfaceVariant=muted, surfaceTint=ink,
        surfaceDim=soft, surfaceBright=surface, surfaceContainerLowest=surface,
        surfaceContainerLow=surface, surfaceContainer=soft, surfaceContainerHigh=soft,
        surfaceContainerHighest=soft, outline=outline, outlineVariant=outline,
        error=ink, onError=surface, errorContainer=soft, onErrorContainer=ink,
    )
    MaterialTheme(colorScheme=scheme) { NativeUxUiStudioContent() }
}

@Composable
private fun NativeUxUiStudioContent() {
    val context=LocalContext.current;val prefs=remember{context.getSharedPreferences("env.ux-ui-studio",android.content.Context.MODE_PRIVATE)}
    val scope=rememberCoroutineScope()
    var onboarding by remember{mutableStateOf(true)};var target by remember{mutableStateOf("mobile")}
    var projectName by remember{mutableStateOf("Untitled design")};var background by remember{mutableStateOf("#FFFFFF")}
    var customArtboard by remember{mutableStateOf(false)};var customWidth by remember{mutableIntStateOf(390)};var customHeight by remember{mutableIntStateOf(844)}
    var tokenNameDraft by remember{mutableStateOf("brand")};var tokenValueDraft by remember{mutableStateOf("#2563EB")};var spacingDraft by remember{mutableStateOf("20")}
    val colorTokens=remember{mutableStateListOf<Pair<String,String>>("primary" to "#2563EB","surface" to "#FFFFFF","text" to "#111827","muted" to "#64748B","border" to "#E5E7EB")}
    val spacingTokens=remember{mutableStateListOf(4,8,12,16,24,32,48)}
    val reusable=remember{mutableStateListOf<UxUiNativeLayer>()}
    val elements=remember{mutableStateListOf<UxUiNativeLayer>()};var selectedId by remember{mutableStateOf("")}
    val screens=remember{mutableStateListOf<UxUiNativeScreen>(UxUiNativeScreen("screen-home","Screen 1","mobile","#FFFFFF",false,390,844, emptyList()))}
    var activeScreenId by remember{mutableStateOf("screen-home")}
    var prototypePreview by remember{mutableStateOf(false)}
    val prototypeHistory=remember{mutableStateListOf<String>()}
    var prototypeStartScreenId by remember{mutableStateOf("screen-home")}
    var showScreenManager by remember{mutableStateOf(false)}
    val undoHistory=remember{mutableStateListOf<List<UxUiNativeLayer>>()};val redoHistory=remember{mutableStateListOf<List<UxUiNativeLayer>>()}
    var notice by remember{mutableStateOf("")};var showElementTray by remember{mutableStateOf(false)};var toolkitTab by remember{mutableStateOf("All 26")};var toolkitSearch by remember{mutableStateOf("")};var activeToolkitId by remember{mutableStateOf("icons")};var qaReport by remember{mutableStateOf(emptyList<String>())};var showAllLayers by remember{mutableStateOf(false)};var showAdvancedControls by remember{mutableStateOf(false)};var showCanvasSettings by remember{mutableStateOf(false)};var iconQuery by remember{mutableStateOf("")};var iconResults by remember{mutableStateOf(emptyList<String>())};var iconStart by remember{mutableIntStateOf(0)};var iconTotal by remember{mutableIntStateOf(0)};var iconLoadedQuery by remember{mutableStateOf("")};var iconCategory by remember{mutableStateOf("Navigation")};var iconPrefix by remember{mutableStateOf("all")};var fontTargetId by remember{mutableStateOf("")};var fontPreviewWords by remember{mutableStateOf("Make something beautiful")};var animateFontPreviews by remember{mutableStateOf(true)}
    var fontQuery by remember{mutableStateOf("")};var fontCategory by remember{mutableStateOf("All")}
    var iconBrowseLimit by remember{mutableIntStateOf(36)};
    val bundledIconNames=remember{UxNativeArtworkLibrary.names(context)}
    var iconBusy by remember{mutableStateOf(false)};var ready by remember{mutableStateOf(false)};var hasSavedDraft by remember{mutableStateOf(false)}
    var pdfBytes by remember{mutableStateOf<ByteArray?>(null)};var jsonText by remember{mutableStateOf("")}
    var sourceText by remember{mutableStateOf("")};var sourceExtension by remember{mutableStateOf("html")}
    val selected=elements.firstOrNull{it.id==selectedId}
    val hasActivePrototypeLinks=elements.any{layer->layer.prototypeTargetScreenId.isNotBlank()&&screens.any{screen->screen.id==layer.prototypeTargetScreenId}}
    val presetWidth=if(target=="mobile")390 else if(target=="tablet")768 else 1440
    val presetHeight=if(target=="mobile")844 else if(target=="tablet")1024 else 900
    val bw=if(customArtboard)customWidth else presetWidth;val bh=if(customArtboard)customHeight else presetHeight
    val tokenJson=remember(colorTokens.toList(),spacingTokens.toList()){JSONObject().put("colors",JSONArray().apply{colorTokens.forEach{(name,value)->put(JSONObject().put("name",name).put("value",value))}}).put("spacing",JSONArray().apply{spacingTokens.forEach{put(it)}}).put("typography",JSONArray().apply{put(JSONObject().put("name","heading").put("fontFamily","sans-serif").put("fontSize",24).put("fontWeight",700).put("lineHeight",1.2));put(JSONObject().put("name","body").put("fontFamily","sans-serif").put("fontSize",16).put("fontWeight",400).put("lineHeight",1.5))})}
    val signature=elements.joinToString("|"){it.id+":"+it.x+":"+it.y+":"+it.width+":"+it.height+":"+it.rotation+":"+it.opacity+":"+it.shadow+":"+it.text+":"+it.color+":"+it.fill+":"+it.iconName+":"+it.iconSvg.hashCode()+":"+it.imageData.hashCode()+":"+it.fontData.hashCode()+":"+it.horizontalConstraint+":"+it.verticalConstraint+":"+it.visibleOn+":"+it.minWidth+":"+it.maxWidth+":"+it.componentKey}
    val tokenSignature=colorTokens.joinToString("|"){it.first+":"+it.second}+"|"+spacingTokens.joinToString(",")
    val reusableSignature=reusable.joinToString("|"){it.id+":"+it.componentKey+":"+it.name+":"+it.imageData.hashCode()+":"+it.iconSvg.hashCode()+":"+it.fontData.hashCode()}
    val screensSignature=screens.joinToString("||"){screen->screen.id+":"+screen.name+":"+screen.target+":"+screen.background+":"+screen.elements.joinToString("|"){it.id+":"+it.x+":"+it.y+":"+it.width+":"+it.height+":"+it.text+":"+it.fill}}
    val pdfLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")){uri:Uri?->if(uri!=null)runCatching{val bytes=pdfBytes?:error("Export not prepared.");context.contentResolver.openOutputStream(uri)?.use{it.write(bytes)}?:error("No writable destination.")}.onSuccess{notice="PDF saved with visual preview, AI prompt and machine-readable specifications."}.onFailure{notice=it.message?:"PDF export failed."}}
    val jsonLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri:Uri?->if(uri!=null)runCatching{context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(jsonText)}?:error("No writable destination.")}.onSuccess{notice="Project JSON saved."}.onFailure{notice=it.message?:"JSON export failed."}}
    val sourceLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")){uri:Uri?->if(uri!=null)runCatching{context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(sourceText)}?:error("No writable destination.")}.onSuccess{notice="Source file saved."}.onFailure{notice=it.message?:"Source export failed."}}
    LaunchedEffect(Unit){runCatching{val raw=prefs.getString("draft",null)?:return@runCatching;val p=JSONObject(raw);hasSavedDraft=true;projectName=p.optString("name",projectName);target=p.optString("target",target);background=p.optString("background",background);customWidth=p.optJSONObject("viewport")?.optInt("width",customWidth)?:customWidth;customHeight=p.optJSONObject("viewport")?.optInt("height",customHeight)?:customHeight;customArtboard=true
            colorTokens.clear();val savedColors=p.optJSONObject("tokens")?.optJSONArray("colors");if(savedColors!=null){for(index in 0 until savedColors.length()){val t=savedColors.optJSONObject(index)?:continue;colorTokens.add(t.optString("name") to t.optString("value","#2563EB"))}}
            spacingTokens.clear();val savedSpacing=p.optJSONObject("tokens")?.optJSONArray("spacing");if(savedSpacing!=null){for(index in 0 until savedSpacing.length())spacingTokens.add(savedSpacing.optInt(index).coerceAtLeast(1))}
            reusable.clear();reusable.addAll(uxNativeReadJson(p.optJSONArray("reusableComponents")?:JSONArray()))
            val rootElements=uxNativeReadJson(p.optJSONArray("elements")?:JSONArray())
val savedScreens=p.optJSONArray("screens")
screens.clear()
if(savedScreens!=null && savedScreens.length()>0){
  for(i in 0 until savedScreens.length()){
    val item=savedScreens.optJSONObject(i)?:continue
    val screenTarget=item.optString("target",target).takeIf{it in setOf("mobile","tablet","desktop")}?:target
    val screenWidth=item.optInt("customWidth",if(screenTarget=="mobile")390 else if(screenTarget=="tablet")768 else 1440).coerceIn(160,4096)
    val screenHeight=item.optInt("customHeight",if(screenTarget=="mobile")844 else if(screenTarget=="tablet")1024 else 900).coerceIn(240,4096)
    screens.add(UxUiNativeScreen(item.optString("id","screen-"+i),item.optString("name","Screen "+(i+1)),screenTarget,item.optString("background",background),item.optBoolean("customArtboard",true),screenWidth,screenHeight,uxNativeReadJson(item.optJSONArray("elements")?:JSONArray()),item.optLong("updatedAt",System.currentTimeMillis())))
  }
}
if(screens.isEmpty())screens.add(UxUiNativeScreen("screen-home","Screen 1",target,background,true,customWidth,customHeight,rootElements))
activeScreenId=p.optString("activeScreenId",screens.first().id).takeIf{id->screens.any{it.id==id}}?:screens.first().id
val active=screens.first{it.id==activeScreenId}
target=active.target;background=active.background;customArtboard=active.customArtboard;customWidth=active.customWidth;customHeight=active.customHeight
elements.clear();elements.addAll(if(active.elements.isEmpty()&&screens.size==1)rootElements else active.elements)
selectedId=elements.firstOrNull()?.id.orEmpty();notice="Local draft restored."};ready=true}
    LaunchedEffect(elements.toList(),target,background,bw,bh,customArtboard,customWidth,customHeight,activeScreenId){
        val index=screens.indexOfFirst{it.id==activeScreenId}
        if(index>=0){
            val old=screens[index]
            val updated=old.copy(target=target,background=background,customArtboard=customArtboard,customWidth=customWidth,customHeight=customHeight,elements=elements.toList())
            if(old!=updated)screens[index]=updated
        }
    }
    LaunchedEffect(projectName,target,background,signature,tokenSignature,reusableSignature,screensSignature,activeScreenId,bw,bh,customArtboard,ready,onboarding){
        if(ready&&!onboarding&&(elements.isNotEmpty()||screens.size>1||background!="#FFFFFF"||customArtboard))runCatching{
            prefs.edit().putString("draft",uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}},screens.toList(),activeScreenId)).apply()
        }.onSuccess{hasSavedDraft=true}.onFailure{notice="Could not save locally; export a JSON backup."}
    }
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
    fun visualEdit(id:String,change:(UxUiNativeLayer)->UxUiNativeLayer) {
        val index=elements.indexOfFirst{it.id==id};if(index>=0)elements[index]=change(elements[index])
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
            "triangle"->UxUiNativeLayer(id,kind,"Triangle",24,540,96,84,"",fill="#DBEAFE",radius=0,padding=0)
            "diamond"->UxUiNativeLayer(id,kind,"Diamond",24,540,92,92,"",fill="#DBEAFE",radius=0,padding=0)
            "hexagon"->UxUiNativeLayer(id,kind,"Hexagon",24,540,112,96,"",fill="#DBEAFE",radius=0,padding=0)
            "star"->UxUiNativeLayer(id,kind,"Star",24,540,100,100,"",fill="#FDE68A",radius=0,padding=0)
            "line"->UxUiNativeLayer(id,kind,"Line",24,540,180,3,"",fill="#64748B",radius=0,padding=0)
            "pill"->UxUiNativeLayer(id,kind,"Pill shape",24,540,150,52,"",fill="#DBEAFE",radius=26,padding=0)
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
            "chart"->UxUiNativeLayer(id,kind,"Bar chart",24,330,300,170,"Monthly activity\nJan: 36\nFeb: 62\nMar: 46\nApr: 82\nMay: 67",fill="#FFFFFF",borderWidth=1,fontSize=13)
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
        checkpoint();elements.add(if(e.kind=="icon")e.copy(iconSvg=UxNativeArtworkLibrary.icon(context,e.iconName).orEmpty(),padding=0)else e);selectedId=id;notice=e.name+" added."
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
                    val prefixArg=if(iconPrefix=="all")"" else "&prefix="+URLEncoder.encode(iconPrefix,"UTF-8")
                    val payload=JSONObject(URL("https://api.iconify.design/search?query="+q+"&limit=24&start="+offset+prefixArg).readText())
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

    var fontExportBytes by remember{mutableStateOf<ByteArray?>(null)}
    val fontExportLauncher=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("font/ttf")){uri:Uri?->
        if(uri!=null)runCatching{val bytes=fontExportBytes?:error("Choose a font first.");context.contentResolver.openOutputStream(uri)?.use{it.write(bytes)}?:error("Choose a writable destination.")}.onSuccess{notice="Font saved. Bundled font licences are included with the app."}.onFailure{notice=it.message?:"Could not save font."}
    }
    val fontLauncher=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri:Uri?->
        if(uri!=null){
            val layerId=fontTargetId
            scope.launch {
                runCatching {
                    withContext(Dispatchers.IO) {
                        val displayName=context.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{cursor->if(cursor.moveToFirst())cursor.getString(0) else ""}.orEmpty()
                        val extension=displayName.substringAfterLast(".","").lowercase()
                        require(extension in setOf("ttf","otf")){"Choose a TrueType (.ttf) or OpenType (.otf) font."}
                        val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("Could not read the selected font.")
                        require(bytes.size<=4*1024*1024){"Font files must be 4 MB or smaller."}
                        val mime=if(extension=="otf")"font/otf" else "font/ttf"
                        Pair(displayName,"data:"+mime+";base64,"+android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP))
                    }
                }.onSuccess { pair ->
                    val idx=elements.indexOfFirst{it.id==layerId}
                    if(idx>=0){checkpoint();elements[idx]=elements[idx].copy(fontFamily=pair.first.substringBeforeLast(".")+" (local)",fontData=pair.second);notice="Imported "+pair.first+" into this design."}
                }.onFailure{notice=it.message?:"Font import failed."}
            }
        }
    }

    val presetImportLauncher=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri:Uri?->
        if(uri!=null)scope.launch{
            runCatching{
                withContext(Dispatchers.IO){
                    val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("Could not read the selected project file.")
                    require(bytes.size<=8*1024*1024){"Project files must be 8 MB or smaller."}
                    val root=org.json.JSONTokener(String(bytes,Charsets.UTF_8)).nextValue()
                    val project=root as? JSONObject
                    val raw=project?.optJSONArray("elements") ?: (root as? JSONArray) ?: error("Choose a project JSON or an element-list JSON file.")
                    val viewport=project?.optJSONObject("viewport")
                    val importedTarget=project?.optString("target","mobile")?.takeIf{it in setOf("mobile","tablet","desktop")}?:"mobile"
                    val width=viewport?.optInt("width",if(importedTarget=="mobile")390 else if(importedTarget=="tablet")768 else 1440)?:bw
                    val height=viewport?.optInt("height",if(importedTarget=="mobile")844 else if(importedTarget=="tablet")1024 else 900)?:bh
                    val compatible=JSONArray()
                    for(i in 0 until raw.length()){
                        val original=raw.optJSONObject(i)?:continue
                        val layer=JSONObject(original.toString())
                        layer.remove("id")
                        if(!layer.has("fill"))layer.put("fill",layer.optString("background","transparent"))
                        if(!layer.has("imageData"))layer.put("imageData",layer.optString("imageDataUrl",""))
                        if(!layer.has("fontData"))layer.put("fontData",layer.optString("fontDataUrl",""))
                        val visible=layer.opt("visibleOn")
                        if(visible is JSONArray)layer.put("visibleOn",(0 until visible.length()).joinToString(","){visible.optString(it)})
                        layer.put("referenceWidth",layer.optInt("referenceWidth",width))
                        layer.put("referenceHeight",layer.optInt("referenceHeight",height))
                        compatible.put(layer)
                    }
                    val imported=uxNativeReadJson(compatible)
                    require(imported.isNotEmpty()){"No usable design elements were found in this file."}
                    Triple(project,imported,Pair(width,height))
                }
            }.onSuccess{(project,imported,viewport)->
                checkpoint()
                if(project!=null){
                    target=project.optString("target","mobile").takeIf{it in setOf("mobile","tablet","desktop")}?:"mobile"
                    projectName=project.optString("name","Imported design").ifBlank{"Imported design"}
                    background=project.optString("background","#FFFFFF")
                    customWidth=viewport.first.coerceIn(160,4096);customHeight=viewport.second.coerceIn(240,4096)
                    customArtboard=project.has("viewport")
                    elements.clear()
                    elements.addAll(imported.map{it.copy(referenceWidth=customWidth,referenceHeight=customHeight)})
                }else{
                    elements.addAll(imported.map{it.copy(referenceWidth=bw,referenceHeight=bh)})
                }
                selectedId=imported.lastOrNull()?.id.orEmpty()
                showElementTray=false;onboarding=false
                notice="Imported "+imported.size+" design element(s)."
            }.onFailure{notice=it.message?:"Project import failed."}
        }
    }

    val svgIconImportLauncher=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri:Uri?->
        if(uri!=null)scope.launch{
            runCatching{
                withContext(Dispatchers.IO){
                    val name=context.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{cursor->if(cursor.moveToFirst())cursor.getString(0) else "Imported icon"}.orEmpty().ifBlank{"Imported icon"}
                    val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("Could not read the selected SVG icon.")
                    require(bytes.size<=1024*1024){"SVG icons must be 1 MB or smaller."}
                    val svg=uxNativeCleanIconSvg(String(bytes,Charsets.UTF_8))
                    require(svg.contains(Regex("(?is)<svg\\b")) && !svg.contains(Regex("(?is)<script\\b"))){"Choose a valid SVG icon file."}
                    Triple(name.substringAfterLast("/").removeSuffix(".svg"),svg,uxNativeSvgAttribute(svg,"viewBox")?:"0 0 24 24")
                }
            }.onSuccess{(name,svg,viewBox)->
                val current=elements.firstOrNull{it.id==selectedId}
                if(current?.kind=="icon"){
                    edit(current.id){it.copy(name=name.ifBlank{"Imported icon"},iconName="custom:"+(name.ifBlank{"icon"}),iconSvg=svg,iconViewBox=viewBox)}
                }else{
                    add("icon")
                    val newId=selectedId
                    edit(newId){it.copy(name=name.ifBlank{"Imported icon"},iconName="custom:"+(name.ifBlank{"icon"}),iconSvg=svg,iconViewBox=viewBox)}
                }
                showElementTray=false;notice="Imported SVG icon."
            }.onFailure{notice=it.message?:"SVG icon import failed."}
        }
    }

    fun persistActiveScreen(){
        val index=screens.indexOfFirst{it.id==activeScreenId}
        if(index>=0){
            val old=screens[index]
            val updated=old.copy(target=target,background=background,customArtboard=customArtboard,customWidth=customWidth,customHeight=customHeight,elements=elements.toList(),updatedAt=System.currentTimeMillis())
            if(old!=updated)screens[index]=updated
        }
    }
    fun activateScreen(id:String){
        if(id==activeScreenId)return
        persistActiveScreen()
        val next=screens.firstOrNull{it.id==id}?:return
        activeScreenId=next.id;target=next.target;background=next.background;customArtboard=next.customArtboard;customWidth=next.customWidth;customHeight=next.customHeight
        elements.clear();elements.addAll(next.elements);selectedId=elements.firstOrNull()?.id.orEmpty()
        undoHistory.clear();redoHistory.clear();showAdvancedControls=false;notice="Opened "+next.name+"."
    }
    fun startPrototypePreview(){
        persistActiveScreen()
        val hasValidLink=elements.any{layer->layer.prototypeTargetScreenId.isNotBlank()&&screens.any{screen->screen.id==layer.prototypeTargetScreenId}}
        if(!hasValidLink){
            activeToolkitId="flows";showElementTray=true
            notice="Select a layer and assign a destination screen in Prototype Studio before previewing."
            return
        }
        prototypeStartScreenId=activeScreenId;prototypeHistory.clear();prototypePreview=true
        selectedId="";showElementTray=false;showCanvasSettings=false;showAdvancedControls=false;showScreenManager=false
        notice="Prototype preview started. Tap linked elements to navigate."
    }
    fun navigatePrototype(destinationId:String){
        if(destinationId==activeScreenId||screens.none{it.id==destinationId}){notice="This element has no valid screen destination.";return}
        prototypeHistory.add(activeScreenId)
        activateScreen(destinationId);selectedId=""
    }
    fun backPrototypePreview(){
        if(prototypeHistory.isEmpty())return
        val previous=prototypeHistory.removeAt(prototypeHistory.lastIndex)
        activateScreen(previous);selectedId=""
    }
    fun stopPrototypePreview(){
        val start=prototypeStartScreenId
        prototypePreview=false;prototypeHistory.clear()
        if(start!=activeScreenId&&screens.any{it.id==start})activateScreen(start)
        selectedId="";notice="Returned to design editing."
    }
    fun addAppScreen(){
        persistActiveScreen()
        val id="screen-"+System.nanoTime()
        val next=UxUiNativeScreen(id,"Screen "+(screens.size+1),target,background,customArtboard,bw,bh,emptyList())
        screens.add(next);activeScreenId=id;elements.clear();selectedId="";undoHistory.clear();redoHistory.clear();showAdvancedControls=false
        notice=next.name+" added. Add elements to design this screen."
    }
    fun duplicateAppScreen(id:String){
        persistActiveScreen()
        val source=screens.firstOrNull{it.id==id}?:return
        val copy=source.copy(id="screen-"+System.nanoTime(),name=source.name+" copy",elements=source.elements.map{it.copy(id="layer-"+System.nanoTime()+kotlin.random.Random.nextInt(1000),name=it.name+" copy")},updatedAt=System.currentTimeMillis())
        screens.add(copy);activeScreenId=copy.id;target=copy.target;background=copy.background;customArtboard=copy.customArtboard;customWidth=copy.customWidth;customHeight=copy.customHeight
        elements.clear();elements.addAll(copy.elements);selectedId=elements.firstOrNull()?.id.orEmpty();undoHistory.clear();redoHistory.clear();showAdvancedControls=false
        notice=copy.name+" duplicated."
    }
    fun deleteAppScreen(id:String){
        if(screens.size<=1){notice="A project must keep at least one screen.";return}
        val index=screens.indexOfFirst{it.id==id};if(index<0)return
        if(id==activeScreenId)persistActiveScreen()
        screens.removeAt(index)
        for(screenIndex in screens.indices){val screen=screens[screenIndex];screens[screenIndex]=screen.copy(elements=screen.elements.map{layer->if(layer.prototypeTargetScreenId==id)layer.copy(prototypeTargetScreenId="")else layer})}
        for(elementIndex in elements.indices){val layer=elements[elementIndex];if(layer.prototypeTargetScreenId==id)elements[elementIndex]=layer.copy(prototypeTargetScreenId="")}
        prototypeHistory.removeAll{it==id}
        if(id==activeScreenId){val next=screens[maxOf(0,index-1)];activeScreenId=next.id;target=next.target;background=next.background;customArtboard=next.customArtboard;customWidth=next.customWidth;customHeight=next.customHeight;elements.clear();elements.addAll(next.elements);selectedId=elements.firstOrNull()?.id.orEmpty();undoHistory.clear();redoHistory.clear()}
        if(prototypeStartScreenId==id)prototypeStartScreenId=activeScreenId
        notice="Screen deleted. Any links to it were cleared."
    }
    fun reorderAppScreen(id:String,delta:Int){
        persistActiveScreen()
        val from=screens.indexOfFirst{it.id==id};val to=from+delta
        if(from<0||to !in screens.indices)return
        val moving=screens.removeAt(from);screens.add(to,moving)
    }
    fun renameAppScreen(id:String,name:String){
        val index=screens.indexOfFirst{it.id==id};if(index>=0)screens[index]=screens[index].copy(name=name.take(70),updatedAt=System.currentTimeMillis())
    }
    fun chooseIcon(layerId:String, icon:String){
        scope.launch {
            iconBusy=true
            runCatching {
                withContext(Dispatchers.IO) { UxNativeArtworkLibrary.fetchIcon(context,icon) }
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
            Text("Design by eye. Export exact developer and AI handoff.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(onboarding){
                Card { Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(72.dp).border(2.dp,MaterialTheme.colorScheme.onSurface,RoundedCornerShape(50)),contentAlignment=Alignment.Center) {
                        Text("＋",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.Normal)
                    }
                    Text("New project",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
                    Text("Start with a blank design. Add elements only when you need them.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick={target="mobile";customArtboard=false;background="#FFFFFF";projectName="Untitled design";customWidth=390;customHeight=844;elements.clear();selectedId="";undoHistory.clear();redoHistory.clear();showElementTray=false;showScreenManager=false;showCanvasSettings=false;showAdvancedControls=false;showAllLayers=false;val id="screen-"+System.nanoTime();screens.clear();screens.add(UxUiNativeScreen(id,"Screen 1","mobile","#FFFFFF",false,390,844,emptyList()));activeScreenId=id;notice="Your blank canvas is ready. Tap + to add your first element.";onboarding=false},modifier=Modifier.fillMaxWidth()) { Text("New project") }
                }}
                Text("Drafts",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                if(hasSavedDraft) {
                    Card { Column(Modifier.fillMaxWidth().padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) {
                        Text(projectName,style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.SemiBold)
                        Text(if(elements.isEmpty())"Blank canvas" else elements.size.toString()+" design elements",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick={onboarding=false;notice="Draft opened."},modifier=Modifier.fillMaxWidth()){Text("Open draft")}
                    }}
                } else {
                    Card { Column(Modifier.fillMaxWidth().padding(18.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        Text("No drafts yet",fontWeight=FontWeight.SemiBold)
                        Text("Your designs will appear here as you work.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }}
                }
            }else{
                OutlinedTextField(projectName,{projectName=it},label={Text("Project title")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    TextButton(onClick={onboarding=true;showElementTray=false;showCanvasSettings=false;showAdvancedControls=false;showAllLayers=false;selectedId=""}) { Text("← Projects") }
                    Spacer(Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    FilterChip(selected=target=="mobile",onClick={target="mobile";customArtboard=false;customWidth=390;customHeight=844},label={Text("Mobile")},enabled=!prototypePreview)
                    FilterChip(selected=target=="tablet",onClick={target="tablet";customArtboard=false;customWidth=768;customHeight=1024},label={Text("Tablet")},enabled=!prototypePreview)
                    FilterChip(selected=target=="desktop",onClick={target="desktop";customArtboard=false;customWidth=1440;customHeight=900},label={Text("Desktop")},enabled=!prototypePreview)
                    if(prototypePreview){
                        OutlinedButton(onClick={backPrototypePreview()},enabled=prototypeHistory.isNotEmpty()){Text("Back")}
                        Button(onClick={ stopPrototypePreview() }){Text("Exit preview")}
                    }else{
                        OutlinedButton(onClick={ startPrototypePreview() },enabled=hasActivePrototypeLinks){Text("Preview prototype")}
                        OutlinedButton(onClick={selectedId="";showCanvasSettings=!showCanvasSettings}){Text(if(showCanvasSettings)"Hide setup" else "Fine-tune")}
                    }
                }
                Card{Column(Modifier.fillMaxWidth().padding(10.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                    Text(if(target=="mobile")"Phone mockup" else if(target=="tablet")"Tablet mockup" else "Desktop mockup",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                    BoxWithConstraints(Modifier.fillMaxWidth(),contentAlignment=Alignment.TopCenter){
                        val bezel=if(target=="mobile")8f else if(target=="tablet")12f else 10f
                        val width=(maxWidth.value-bezel*2).coerceAtLeast(140f).coerceAtMost(if(target=="mobile")390f else if(target=="tablet")768f else 1040f)
                        val scale=width/bw.toFloat()
                        Column(horizontalAlignment=Alignment.CenterHorizontally){
                            Box(Modifier.width((width+bezel*2).dp).clip(RoundedCornerShape(if(target=="mobile")46.dp else if(target=="tablet")25.dp else 10.dp)).background(Color(0xFF0B0C0E)).clickable(enabled=!prototypePreview){selectedId="";showCanvasSettings=true;showElementTray=false}.padding(bezel.dp)){
                                Box(Modifier.width(width.dp).height((bh*scale).dp).clip(RoundedCornerShape(if(target=="mobile")38.dp else if(target=="tablet")16.dp else 2.dp)).background(uxNativeColor(background)).clickable(enabled=!prototypePreview){selectedId="";showCanvasSettings=true;showElementTray=false}){
                            Box(Modifier.size(bw.dp,bh.dp).graphicsLayer(scaleX=scale,scaleY=scale,transformOrigin=TransformOrigin(0f,0f))){
                                val dragDensity=androidx.compose.ui.platform.LocalDensity.current.density
                        elements.filter{it.visibleOn.split(",").map(String::trim).contains(target)}.forEach{e->
                                    val shape=uxNativeComposeShape(e.kind,e.radius)
                                    Box(Modifier.offset(uxNativeLayerX(e,bw).dp,uxNativeLayerY(e,bh).dp).size(uxNativeLayerWidth(e,bw).dp,uxNativeLayerHeight(e,bh).dp).graphicsLayer(rotationZ=e.rotation,alpha=e.opacity).shadow(if(e.shadow)12.dp else 0.dp,shape).clip(shape).background(uxNativeColor(e.fill,android.graphics.Color.TRANSPARENT)).then(if(selectedId==e.id||e.borderWidth>0)Modifier.border(if(selectedId==e.id)2.dp else e.borderWidth.dp,if(selectedId==e.id)MaterialTheme.colorScheme.primary else uxNativeColor(e.borderColor,android.graphics.Color.LTGRAY),shape)else Modifier).padding(e.padding.dp).clickable(enabled=!prototypePreview){if(e.name=="Background artwork"){selectedId="";showCanvasSettings=true}else{selectedId=e.id;showCanvasSettings=false};showElementTray=false}.pointerInput(e.id,scale,dragDensity,prototypePreview){
                                        if(prototypePreview){
                                            detectTapGestures(onTap={navigatePrototype(e.prototypeTargetScreenId)})
                                        }else if(e.name=="Background artwork"){
                                            detectTapGestures(onTap={selectedId="";showCanvasSettings=true;showElementTray=false})
                                        }else{
                                            val density=dragDensity
                                            detectDragGestures(onDragStart={selectedId=e.id;showCanvasSettings=false;showElementTray=false;checkpoint()}){change,dragAmount->
                                                change.consume()
                                                val index=elements.indexOfFirst{it.id==e.id}
                                                if(index>=0){val current=elements[index];elements[index]=current.copy(x=(current.x+(dragAmount.x/(density*scale)).roundToInt()).coerceAtLeast(0),y=(current.y+(dragAmount.y/(density*scale)).roundToInt()).coerceAtLeast(0))}
                                            }
                                        }
                                    }){
                                        if(e.kind=="chart") {
                                            val chart=uxUiParseChartData(e.text)
                                            Column(Modifier.fillMaxSize().padding(3.dp)) {
                                                Text(chart.title,color=uxNativeColor(e.color,android.graphics.Color.BLACK),fontSize=e.fontSize.coerceIn(8,16).sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                                                if(chart.points.isEmpty()) {
                                                    Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){Text("Enter data as Label: value",fontSize=8.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                                                } else {
                                                    val maxValue=chart.points.maxOfOrNull{it.value}?.coerceAtLeast(1.0)?:1.0
                                                    val barAreaHeight=(e.height-e.padding*2-e.fontSize-28).coerceAtLeast(16)
                                                    Row(Modifier.fillMaxWidth().height((barAreaHeight+24).dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(2.dp)) {
                                                        chart.points.forEach { point ->
                                                            Column(Modifier.weight(1f).fillMaxHeight(),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Bottom) {
                                                                Text(if(point.value%1.0==0.0)point.value.toLong().toString() else String.format(java.util.Locale.US,"%.1f",point.value),fontSize=7.sp,maxLines=1,overflow=TextOverflow.Clip,color=uxNativeColor(e.color,android.graphics.Color.BLACK))
                                                                Spacer(Modifier.height(1.dp))
                                                                val barHeight=if(point.value<=0)0 else (barAreaHeight*point.value/maxValue).roundToInt().coerceIn(2,barAreaHeight)
                                                                Box(Modifier.fillMaxWidth(.62f).height(barHeight.dp).clip(RoundedCornerShape(3.dp)).background(uxNativeColor(e.color,android.graphics.Color.BLACK)))
                                                                Text(point.label,fontSize=6.sp,maxLines=1,overflow=TextOverflow.Ellipsis,color=uxNativeColor(e.color,android.graphics.Color.BLACK))
                                                            }
                                                        }
                                                    }
                                                }
                                                if(chart.invalidRows>0)Text(chart.invalidRows.toString()+" invalid row(s) ignored",fontSize=6.sp,color=Color(0xFFB45309),maxLines=1)
                                            }
                                        } else if((e.kind=="icon" && e.iconSvg.isNotBlank()) || (e.kind=="image" && e.imageData.isNotBlank())) {
                                            UxUiNativeArtworkPreview(e,Modifier.fillMaxSize())
                                        } else {
                                            Text(if(e.kind=="icon")e.iconName.substringAfterLast(":").take(3).uppercase() else e.text,color=uxNativeColor(e.color,android.graphics.Color.BLACK),fontSize=e.fontSize.sp,fontWeight=if(e.fontWeight>=700)FontWeight.Bold else if(e.fontWeight>=600)FontWeight.SemiBold else FontWeight.Normal,fontFamily=FontFamily(uxNativeTypeface(context,e)),maxLines=5,overflow=TextOverflow.Clip)
                                        }
                                    }
                                }
                            }
                                if(target=="mobile")Box(Modifier.align(Alignment.TopCenter).padding(top=4.dp).width((width*0.28f).dp).height((width*0.055f).dp).clip(RoundedCornerShape(99.dp)).background(Color.Black))
                                else if(target=="tablet")Box(Modifier.align(Alignment.TopCenter).padding(top=3.dp).size(6.dp).clip(RoundedCornerShape(99.dp)).background(Color.Black))
                        }
                    }
                        if(target=="desktop"){
                            Column(horizontalAlignment=Alignment.CenterHorizontally){
                                Box(Modifier.width(76.dp).height(25.dp).background(Color(0xFF9BA0A5),RoundedCornerShape(4.dp)))
                                Box(Modifier.width(180.dp).height(7.dp).background(Color(0xFF777C82),RoundedCornerShape(99.dp)))
                            }
                        }
                        }
                    }
                    Text("Your design automatically fits the preview.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }}
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)){
                    Row(horizontalArrangement=Arrangement.spacedBy(3.dp)){
                        OutlinedButton(onClick={undo()},enabled=undoHistory.isNotEmpty(),contentPadding=PaddingValues(8.dp)){Text("↶")}
                        OutlinedButton(onClick={redo()},enabled=redoHistory.isNotEmpty(),contentPadding=PaddingValues(8.dp)){Text("↷")}
                    }
                    Spacer(Modifier.weight(1f))
                    OutlinedButton(onClick={showElementTray=!showElementTray},modifier=Modifier.size(58.dp),shape=RoundedCornerShape(50)){Text("＋",style=MaterialTheme.typography.headlineMedium)}
                    Spacer(Modifier.weight(1f))
                    Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(0.dp)){
                        OutlinedButton(onClick={showScreenManager=!showScreenManager},modifier=Modifier.size(44.dp),contentPadding=PaddingValues(2.dp)){Text("▣")}
                        Text(screens.size.toString(),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if(showScreenManager){
                    Card { Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Column(Modifier.weight(1f)){Text("App screens",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold);Text("Choose which screen is open in the mockup.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                            Button(onClick={addAppScreen()}){Text("＋ New screen")}
                        }
                        screens.forEachIndexed{screenIndex,screen->
                            Card(colors=CardDefaults.cardColors(containerColor=if(screen.id==activeScreenId)MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface)){
                                Column(Modifier.fillMaxWidth().padding(9.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                    OutlinedTextField(value=screen.name,onValueChange={renameAppScreen(screen.id,it)},label={Text("Screen name")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                                    Text(screen.target+" · "+screen.elements.size+" layers · "+screen.customWidth+"×"+screen.customHeight,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp),verticalAlignment=Alignment.CenterVertically){
                                        Button(onClick={activateScreen(screen.id)},enabled=screen.id!=activeScreenId){Text(if(screen.id==activeScreenId)"Editing" else "Open")}
                                        OutlinedButton(onClick={reorderAppScreen(screen.id,-1)},enabled=screenIndex>0,contentPadding=PaddingValues(horizontal=8.dp,vertical=6.dp)){Text("↑")}
                                        OutlinedButton(onClick={reorderAppScreen(screen.id,1)},enabled=screenIndex<screens.lastIndex,contentPadding=PaddingValues(horizontal=8.dp,vertical=6.dp)){Text("↓")}
                                        OutlinedButton(onClick={duplicateAppScreen(screen.id)},contentPadding=PaddingValues(horizontal=8.dp,vertical=6.dp)){Text("Duplicate")}
                                        OutlinedButton(onClick={deleteAppScreen(screen.id)},enabled=screens.size>1,contentPadding=PaddingValues(horizontal=8.dp,vertical=6.dp)){Text("Delete")}
                                    }
                                }
                            }
                        }
                        OutlinedButton(onClick={showScreenManager=false},modifier=Modifier.fillMaxWidth()){Text("Done")}
                    }}
                }
                val selectedElement=selected
                if(selectedElement!=null){
                    Column(Modifier.fillMaxWidth().padding(vertical=4.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                        Text("Move · ${selectedElement.name}",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
                            Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(3.dp)){
                                OutlinedButton(onClick={edit(selectedElement.id){it.copy(y=(it.y-8).coerceAtLeast(0))}},contentPadding=PaddingValues(8.dp),modifier=Modifier.size(44.dp)){Text("↑")}
                                Row(horizontalArrangement=Arrangement.spacedBy(3.dp)){
                                    OutlinedButton(onClick={edit(selectedElement.id){it.copy(x=(it.x-8).coerceAtLeast(0))}},contentPadding=PaddingValues(8.dp),modifier=Modifier.size(44.dp)){Text("←")}
                                    OutlinedButton(onClick={edit(selectedElement.id){it.copy(x=((bw-it.width)/2).coerceAtLeast(0),y=((bh-it.height)/2).coerceAtLeast(0))}},contentPadding=PaddingValues(8.dp),modifier=Modifier.size(44.dp)){Text("•")}
                                    OutlinedButton(onClick={edit(selectedElement.id){it.copy(x=(it.x+8).coerceAtMost((bw-it.width).coerceAtLeast(0)))}},contentPadding=PaddingValues(8.dp),modifier=Modifier.size(44.dp)){Text("→")}
                                }
                                OutlinedButton(onClick={edit(selectedElement.id){it.copy(y=(it.y+8).coerceAtMost((bh-it.height).coerceAtLeast(0)))}},contentPadding=PaddingValues(8.dp),modifier=Modifier.size(44.dp)){Text("↓")}
                            }
                            Spacer(Modifier.weight(1f))
                            Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
                                OutlinedButton(
                                    onClick = {
                                        edit(selectedElement.id) { layer ->
                                            layer.copy(
                                                width = (layer.width * 1.1f).roundToInt().coerceAtLeast(12).coerceAtMost((bw - layer.x).coerceAtLeast(12)),
                                                height = (layer.height * 1.1f).roundToInt().coerceAtLeast(12).coerceAtMost((bh - layer.y).coerceAtLeast(12))
                                            )
                                        }
                                    },
                                    modifier = Modifier.widthIn(min = 100.dp)
                                ) { Text("＋ Size") }
                                OutlinedButton(onClick={edit(selectedElement.id){it.copy(rotation=(it.rotation-15f+360f)%360f)}},modifier=Modifier.widthIn(min=100.dp)){Text("↶ Rotate")}
                                OutlinedButton(onClick={edit(selectedElement.id){it.copy(rotation=(it.rotation+15f)%360f)}},modifier=Modifier.widthIn(min=100.dp)){Text("↻ Rotate")}
                                OutlinedButton(
                                    onClick = {
                                        edit(selectedElement.id) { layer ->
                                            layer.copy(
                                                width = (layer.width * 0.9f).roundToInt().coerceAtLeast(12),
                                                height = (layer.height * 0.9f).roundToInt().coerceAtLeast(12)
                                            )
                                        }
                                    },
                                    modifier = Modifier.widthIn(min = 100.dp)
                                ) { Text("－ Size") }
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
                        Text(selectedElement.name.take(12),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        if(selectedElement.kind !in setOf("icon","ellipse","rect","divider"))OutlinedButton(onClick={showAdvancedControls=false;notice="Edit the text in the Style section below."}){Text("Edit text")}
                        OutlinedButton(onClick={fontTargetId=selectedElement.id;showElementTray=true;toolkitTab="Fonts"}){Text("Fonts")}
                        OutlinedButton(onClick={edit(selectedElement.id){it.copy(width=(it.width*1.1f).roundToInt().coerceAtLeast(12).coerceAtMost((bw-it.x).coerceAtLeast(12)),height=(it.height*1.1f).roundToInt().coerceAtLeast(12).coerceAtMost((bh-it.y).coerceAtLeast(12)))}}){Text("Size +")}
                        OutlinedButton(onClick={edit(selectedElement.id){it.copy(width=(it.width*0.9f).roundToInt().coerceAtLeast(12),height=(it.height*0.9f).roundToInt().coerceAtLeast(12))}}){Text("Size −")}
                        OutlinedButton(onClick={edit(selectedElement.id){it.copy(rotation=(it.rotation+15f)%360f)}}){Text("Rotate")}
                        OutlinedButton(onClick={showAdvancedControls=true}){Text("Style")}
                        OutlinedButton(onClick={selectedId="";showAdvancedControls=false}){Text("Cancel")}
                        OutlinedButton(onClick={checkpoint();elements.removeAll{it.id==selectedElement.id};selectedId="";showAdvancedControls=false}){Text("Delete")}
                    }
                }
                selected?.let{e->
                    Card{Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                        val shortEdge=minOf(e.width,e.height).coerceAtLeast(1)
                        Text("Style · "+e.name,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                        Text("Drag to move. Use these sliders to change the look.",style=MaterialTheme.typography.bodySmall)
                        UxNativeVisualSlider("Size",e.width.toFloat(),12f..(bw-e.x).coerceAtLeast(13).toFloat(),{checkpoint()}){v->visualEdit(e.id){it.copy(width=v.roundToInt(),height=(it.height*v/it.width.coerceAtLeast(1)).roundToInt().coerceAtLeast(12))}}
                        UxNativeVisualSlider("Turn",e.rotation,-180f..180f,{checkpoint()}){v->visualEdit(e.id){it.copy(rotation=v)}}
                        UxNativeVisualSlider("Roundness",e.radius.toFloat(),0f..maxOf(1,e.radius,shortEdge/2).toFloat(),{checkpoint()}){v->visualEdit(e.id){it.copy(radius=v.roundToInt())}}
                        UxNativeVisualSlider("Border",e.borderWidth.toFloat(),0f..20f,{checkpoint()}){v->visualEdit(e.id){it.copy(borderWidth=v.roundToInt())}}
                        if(e.kind !in setOf("image","icon","rect","ellipse","divider","line")){
                            UxNativeVisualSlider("Text size",e.fontSize.toFloat(),8f..maxOf(160,e.fontSize).toFloat(),{checkpoint()}){v->visualEdit(e.id){it.copy(fontSize=v.roundToInt())}}
                            OutlinedButton(onClick={toolkitTab="Fonts";showElementTray=true},modifier=Modifier.fillMaxWidth()){Text("Choose a font")}
                        }
                        Text("Text or icon color",style=MaterialTheme.typography.labelLarge)
                        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            colorTokens.forEach{(name,value)->OutlinedButton(onClick={edit(e.id){it.copy(color=value)}}){Box(Modifier.size(26.dp).background(uxNativeColor(value),CircleShape));Text(name)}}
                        }
                        if(e.kind=="image")OutlinedButton(onClick={imageTargetId=e.id;imageLauncher.launch("image/*")},modifier=Modifier.fillMaxWidth()){Text("Replace image")}
                        if(e.kind=="icon")OutlinedButton(onClick={toolkitTab="Icons";activeToolkitId="icons";showElementTray=true},modifier=Modifier.fillMaxWidth()){Text("Choose icon artwork")}
                        Text("Opacity · "+(e.opacity*100).roundToInt()+"%",style=MaterialTheme.typography.labelLarge)
                        Slider(value=e.opacity,onValueChange={v->edit(e.id){it.copy(opacity=v)}},valueRange=0f..1f)
                        Row(verticalAlignment=Alignment.CenterVertically){Switch(checked=e.shadow,onCheckedChange={v->edit(e.id){it.copy(shadow=v)}});Text("Drop shadow")}
                        Text("Prototype destination",style=MaterialTheme.typography.labelLarge)
                        val prototypeDestinations=screens.filter{it.id!=activeScreenId}
                        if(prototypeDestinations.isEmpty())Text("Add another screen to connect this layer.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                        else Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){ 
                            FilterChip(selected=e.prototypeTargetScreenId.isBlank(),onClick={edit(e.id){it.copy(prototypeTargetScreenId="")}},label={Text("None")})
                            prototypeDestinations.forEach{screen->FilterChip(selected=e.prototypeTargetScreenId==screen.id,onClick={edit(e.id){it.copy(prototypeTargetScreenId=screen.id)}},label={Text(screen.name,maxLines=1)})}
                        }
                        if(hasActivePrototypeLinks)OutlinedButton(onClick={ startPrototypePreview() },modifier=Modifier.fillMaxWidth()){Text("Preview prototype")}
                        if(e.kind !in setOf("icon","ellipse","rect","divider"))OutlinedTextField(e.text,{v->edit(e.id){it.copy(text=v)}},label={Text(if(e.kind=="chart")"Chart data (title, then Label: value)" else "Text on canvas")},modifier=Modifier.fillMaxWidth(),maxLines=if(e.kind=="chart")8 else 3)
                        Text("Corner style",style=MaterialTheme.typography.labelLarge)
                        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            OutlinedButton(onClick={edit(e.id){it.copy(radius=0)}}){Text("Sharp")}
                            OutlinedButton(onClick={edit(e.id){it.copy(radius=minOf(14,shortEdge/4))}}){Text("Soft")}
                            OutlinedButton(onClick={edit(e.id){it.copy(radius=shortEdge/2)}}){Text("Round")}
                        }
                        Text("Fill colour",style=MaterialTheme.typography.labelLarge)
                        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            colorTokens.forEach{(name,value)->OutlinedButton(onClick={edit(e.id){it.copy(fill=value)}}){Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)){Box(Modifier.size(16.dp).clip(RoundedCornerShape(4.dp)).background(uxNativeColor(value)));Text(name)}}}
                        }
                        OutlinedButton(onClick={showAdvancedControls=!showAdvancedControls},modifier=Modifier.fillMaxWidth()){Text(if(showAdvancedControls)"Hide more options" else "More options")}
                        if(showAdvancedControls){
                        Text("More options",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                        OutlinedTextField(e.color,{v->edit(e.id){it.copy(color=v)}},label={Text("Text / icon color")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        OutlinedTextField(e.fill,{v->edit(e.id){it.copy(fill=v)}},label={Text("Fill color / transparent")},modifier=Modifier.fillMaxWidth(),singleLine=true)

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
                        OutlinedTextField(e.fontFamily,{v->edit(e.id){it.copy(fontFamily=v,fontData="")}},label={Text("Font family")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        OutlinedTextField(fontQuery,{fontQuery=it},label={Text("Search all font families")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                            listOf("All","Sans serif","Serif","Monospace","Display","Handwriting").forEach{category->
                                FilterChip(selected=fontCategory==category,onClick={fontCategory=category},label={Text(category)})
                            }
                        }
                        Column(Modifier.fillMaxWidth().heightIn(max=230.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(5.dp)){
                            uxNativeFontFamilies.filter{it.contains(fontQuery,true)&&(fontCategory=="All"||uxNativeFontFamilyCategory(it)==fontCategory)}.forEach{family->
                                OutlinedButton(onClick={edit(e.id){it.copy(fontFamily=family,fontData=uxNativeBundledFontData(context,family))}},modifier=Modifier.fillMaxWidth()){
                                    Column(Modifier.fillMaxWidth()){
                                        Text(family)
                                        Text("Aa Bb Cc 0123",fontFamily=FontFamily(uxNativeTypeface(context,e.copy(fontFamily=family,fontData=""))),fontSize=13.sp)
                                    }
                                }
                            }
                        }
                        OutlinedButton(onClick={fontTargetId=e.id;fontLauncher.launch(arrayOf("*/*"))},modifier=Modifier.fillMaxWidth()){Text(if(e.fontData.isBlank())"Import local TTF / OTF font" else "Replace local font file")}
                        Text("Choose common families above or import a licensed TTF/OTF. Imported font data is preserved in project JSON and native preview/PDF.",style=MaterialTheme.typography.bodySmall)
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
                        Button(onClick={checkpoint();val key=e.componentKey.ifBlank{e.id};reusable.removeAll{it.componentKey==key};reusable.add(e.copy(componentKey=key));notice="Reusable component saved: "+e.name},modifier=Modifier.fillMaxWidth()){Text("Save selected as reusable component")}
                        reusable.forEach{component->OutlinedButton(onClick={checkpoint();val copy=component.copy(id="layer-"+System.nanoTime(),name=component.name+" instance",x=(component.x+16).coerceAtMost((bw-component.width).coerceAtLeast(0)),y=(component.y+16).coerceAtMost((bh-component.height).coerceAtLeast(0)),referenceWidth=bw,referenceHeight=bh);elements.add(copy);selectedId=copy.id;notice="Reusable component added: "+component.name},modifier=Modifier.fillMaxWidth()){Text("Add reusable · "+component.name,maxLines=1)}}
                        if(e.kind=="image"){
                            Button(onClick={imageTargetId=e.id;imageLauncher.launch("image/*")},modifier=Modifier.fillMaxWidth()){Text(if(e.imageData.isBlank())"Import image (PNG, JPEG, WebP or GIF)" else "Replace image")}
                            Text("Raster image assets up to 4 MB are embedded into JSON and rendered in the artboard.",style=MaterialTheme.typography.bodySmall)
                        }
                        if(e.kind=="icon"){
                            Text("Browse icons by category and visual style",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                                (listOf("All bundled")+uxNativeIconCategories.keys).forEach{category->FilterChip(selected=iconCategory==category,onClick={iconCategory=category;iconBrowseLimit=36},label={Text(category)})}
                            }
                            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                                uxNativeIconStyles.forEach{(prefix,label)->FilterChip(selected=iconPrefix==prefix,onClick={iconPrefix=prefix;iconStart=0;iconResults=emptyList();iconTotal=0},label={Text(label)})}
                            }
                            if(iconQuery.isBlank()){
                                uxNativeIconCategories[iconCategory].orEmpty().filter{iconPrefix=="all"||it.startsWith(iconPrefix+":")}.forEach{icon->
                                    OutlinedButton(onClick={chooseIcon(e.id,icon)},modifier=Modifier.fillMaxWidth()){
                                        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                            UxNativeIconThumbnail(icon)
                                            Text(icon,maxLines=1)
                                        }
                                    }
                                }
                            }
                            OutlinedTextField(iconQuery,{iconQuery=it;iconStart=0;iconResults=emptyList()},label={Text("Search icon catalogue")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                            Button(onClick={searchIcons(false)},enabled=!iconBusy&&iconQuery.isNotBlank(),modifier=Modifier.fillMaxWidth()){Text(if(iconBusy)"Searching…" else "Search catalogue")}
                            iconResults.forEach{icon->OutlinedButton(onClick={chooseIcon(e.id,icon)},modifier=Modifier.fillMaxWidth()){
                                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                    UxNativeIconThumbnail(icon)
                                    Text(icon,maxLines=1)
                                }
                            }}
                            if(iconQuery.isNotBlank()&&iconResults.size<iconTotal)OutlinedButton(onClick={searchIcons(true)},enabled=!iconBusy,modifier=Modifier.fillMaxWidth()){Text(if(iconBusy)"Loading…" else "Load more icons · "+iconResults.size+" / "+iconTotal)}
                            Text("The category browser shows curated icon variants immediately. Search pages the online Iconify catalog; selected SVG artwork is embedded in the project. Check each icon set's licence.",style=MaterialTheme.typography.bodySmall)
                        }
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            OutlinedButton(onClick={val copy=e.copy(id="layer-"+System.nanoTime(),name=e.name+" copy",x=e.x+16,y=e.y+16);checkpoint();elements.add(copy);selectedId=copy.id},modifier=Modifier.weight(1f)){Text("Duplicate")}
                            OutlinedButton(onClick={moveLayer(e.id,-1)},modifier=Modifier.weight(1f)){Text("Move up")}
                            OutlinedButton(onClick={moveLayer(e.id,1)},modifier=Modifier.weight(1f)){Text("Move down")}
                            OutlinedButton(onClick={checkpoint();elements.removeAll{it.id==e.id};selectedId=elements.firstOrNull()?.id.orEmpty()},modifier=Modifier.weight(1f)){Text("Delete")}
                        }
                        Text("Exact specification",style=MaterialTheme.typography.labelLarge)
                        Text(uxNativeJson(listOf(e)).toString(2),style=MaterialTheme.typography.bodySmall)
                        }
                    }}
                }
                if(selected==null && showCanvasSettings && !prototypePreview){
                    Card{Column(Modifier.fillMaxWidth().padding(14.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
                        Text("Canvas styling",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                        Text("Tap an object to style it, or tap the screen background to return here.",style=MaterialTheme.typography.bodySmall)
                        OutlinedTextField(background,{background=it},label={Text("Background color · hex")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            listOf("#FFFFFF","#F8FAFC","#DBEAFE","#111827","#000000","#FDF2F8").forEach{value->OutlinedButton(onClick={background=value},contentPadding=PaddingValues(8.dp)){Box(Modifier.size(32.dp).background(uxNativeColor(value),RoundedCornerShape(6.dp)).border(1.dp,MaterialTheme.colorScheme.outline,RoundedCornerShape(6.dp)))}}
                        }
                        Row(verticalAlignment=Alignment.CenterVertically){Switch(checked=customArtboard,onCheckedChange={customArtboard=it});Text("Custom artboard size")}
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            OutlinedTextField(customWidth.toString(),{it.toIntOrNull()?.let{n->customWidth=n.coerceIn(160,4096)}},label={Text("Width px")},enabled=customArtboard,modifier=Modifier.weight(1f),singleLine=true)
                            OutlinedTextField(customHeight.toString(),{it.toIntOrNull()?.let{n->customHeight=n.coerceIn(240,4096)}},label={Text("Height px")},enabled=customArtboard,modifier=Modifier.weight(1f),singleLine=true)
                        }
                        Text("Current size: $bw × $bh px",style=MaterialTheme.typography.labelMedium)
                        OutlinedButton(onClick={activeToolkitId="background";toolkitTab="Details";showElementTray=true},modifier=Modifier.fillMaxWidth()){Text("Gradients & background artwork")}
                        if(elements.any{it.name=="Background artwork"})OutlinedButton(onClick={checkpoint();elements.removeAll{it.name=="Background artwork"}},modifier=Modifier.fillMaxWidth()){Text("Remove background artwork")}

                    }}
                }
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Text("Studio toolkit",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick={showElementTray=!showElementTray}){Text(if(showElementTray)"Close" else "+ Add")}
                }
                if(showElementTray){
                    Dialog(onDismissRequest={showElementTray=false},properties=DialogProperties(usePlatformDefaultWidth=false)){
                    Card(Modifier.fillMaxWidth().padding(horizontal=12.dp).heightIn(max=LocalConfiguration.current.screenHeightDp.dp*.84f)) { Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("Studio toolkit",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f));TextButton(onClick={showElementTray=false}){Text("Done")}}

                        OutlinedTextField(toolkitSearch,{toolkitSearch=it},label={Text("Search tools, fonts and icons")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                            listOf("All 26","Icons","Elements","Presets","Fonts","Tokens").forEach{tab->FilterChip(selected=toolkitTab==tab,onClick={toolkitTab=tab},label={Text(tab)})}
                        }
                        when(toolkitTab){
                            "All 26" -> {
                                Text("All 26 Studio toolkits",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                                Text("Browse visual samples, then open a tool. Changes apply to the selected layer; canvas tools style the screen background.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                uxNativeToolkits.filter{toolkit->toolkitSearch.isBlank()||toolkit.name.contains(toolkitSearch,true)||toolkit.description.contains(toolkitSearch,true)||toolkit.id.contains(toolkitSearch,true)}.forEach{toolkit->
                                    Card { Column(Modifier.fillMaxWidth().padding(10.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
                                        UxNativeToolkitSample(toolkit.id)
                                        Text(toolkit.name,style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.SemiBold)
                                        Text(toolkit.description,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                            Text(toolkit.status,style=MaterialTheme.typography.labelSmall,color=if(toolkit.status=="Not complete")MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,modifier=Modifier.weight(1f))
                                            OutlinedButton(onClick={
                                                activeToolkitId=toolkit.id
                                                when(toolkit.id){
                                                    "icons"->{toolkitTab="Icons"}
                                                    "typography"->{toolkitTab="Fonts"}
                                                    "color","brand","design-system"->{toolkitTab="Tokens"}
                                                    "illustrations","media","components","assets","inspiration"->{toolkitTab="Elements"}
                                                    "projects"->{toolkitTab="Presets"}
                                                    "accessibility","qa"->{
                                                        val findings=mutableListOf<String>()
                                                        if(elements.isEmpty())findings.add("No layers have been added yet.")
                                                        elements.forEach{e->if(e.x<0||e.y<0||e.x+e.width>bw||e.y+e.height>bh)findings.add(e.name+" extends beyond the artboard.");if(e.width<44||e.height<44)findings.add(e.name+" may be smaller than a comfortable touch target.");if(e.name.isBlank())findings.add("An unnamed layer exists.");if(e.kind=="icon"&&e.iconSvg.isBlank())findings.add(e.name+" has no embedded icon SVG.")}
                                                        val decorativeKinds=setOf("image","icon","rect","ellipse","divider","spacer","triangle","diamond","hexagon","star","line")
                                                        elements.filter{it.kind !in decorativeKinds && it.text.isNotBlank()}.forEach{e->
                                                            val rawFill=e.fill.trim()
                                                            val surface=if(rawFill.isEmpty()||rawFill.equals("transparent",true)||rawFill.equals("none",true))background else rawFill
                                                            val ratio=NativeAccessibilityEngine.contrastRatio(e.color,surface)
                                                            if(ratio==null)findings.add(e.name+" text contrast could not be calculated for these colors; manually review contrast.")
                                                            else{
                                                                val large=e.fontSize>=24||(e.fontSize>=19&&e.fontWeight>=700)
                                                                val threshold=if(large)3.0 else 4.5
                                                                if(ratio+1e-9<threshold)findings.add(e.name+" text contrast is "+((ratio*100).roundToInt()/100.0)+":1; WCAG AA "+(if(large)"large-text" else "normal-text")+" requires at least "+threshold+":1 for this solid-color pair.")
                                                            }
                                                        }
                                                        for(i in elements.indices)for(j in i+1 until elements.size){val a=elements[i];val b=elements[j];if(minOf(a.x+a.width,b.x+b.width)>maxOf(a.x,b.x)&&minOf(a.y+a.height,b.y+b.height)>maxOf(a.y,b.y))findings.add(a.name+" overlaps "+b.name+".")}
                                                        qaReport=findings;toolkitTab="All 26";notice="Studio check completed: "+findings.size+" potential finding(s). Solid-color text contrast is included; gradients and images need manual review. This is advisory, not a WCAG certification."
                                                    }
                                                    else->{toolkitTab="Details"}
                                                }
                                            },contentPadding=PaddingValues(horizontal=10.dp,vertical=6.dp)){Text("Open")}
                                        }
                                    }}
                                }
                                if(qaReport.isNotEmpty()||activeToolkitId=="qa"||activeToolkitId=="accessibility"){
                                    Text("Review results · ${qaReport.size}",style=MaterialTheme.typography.titleSmall,fontWeight=FontWeight.SemiBold)
                                    if(qaReport.isEmpty())Text("No findings in the limited checks run.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                    qaReport.take(80).forEach{finding->Text("• "+finding,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                                }
                            }
                            "Details" -> {
                                val tool=uxNativeToolkits.firstOrNull{it.id==activeToolkitId}
                                Text(tool?.name.orEmpty(),style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
                                UxNativeToolkitSample(activeToolkitId)
                                Text(tool?.description.orEmpty(),style=MaterialTheme.typography.bodySmall)
                                when(activeToolkitId){
                                    "effects"->{
                                        Text("Apply an effect to the selected layer. Add a surface to try the samples.",style=MaterialTheme.typography.bodySmall)
                                        if(selectedElement==null)Button(onClick={add("card")},modifier=Modifier.fillMaxWidth()){Text("Add a surface to style")}
                                        listOf("None","Soft shadow","Translucent","Outline","Rounded","Pill","Tilt left","Tilt right").chunked(2).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
                                            row.forEach{effect->OutlinedButton(enabled=selectedElement!=null,onClick={selectedElement?.let{layer->edit(layer.id){item->when(effect){"None"->item.copy(opacity=1f,shadow=false,borderWidth=0,rotation=0f);"Soft shadow"->item.copy(shadow=true);"Translucent"->item.copy(opacity=.5f);"Outline"->item.copy(borderWidth=2,borderColor="#2563EB");"Rounded"->item.copy(radius=18);"Pill"->item.copy(radius=minOf(item.width,item.height)/2);"Tilt left"->item.copy(rotation=-12f);else->item.copy(rotation=12f)}}}},modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),contentPadding=PaddingValues(12.dp)){
                                                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)){
                                                    val shape=RoundedCornerShape(if(effect=="Pill")30.dp else if(effect=="Rounded")14.dp else 6.dp)
                                                    Box(Modifier.size(62.dp,38.dp).graphicsLayer(alpha=if(effect=="Translucent").5f else 1f,rotationZ=if(effect=="Tilt left")-12f else if(effect=="Tilt right")12f else 0f).shadow(if(effect=="Soft shadow")8.dp else 0.dp,shape).background(MaterialTheme.colorScheme.primaryContainer,shape).then(if(effect=="Outline")Modifier.border(2.dp,MaterialTheme.colorScheme.primary,shape)else Modifier))
                                                    Text(effect,fontSize=12.sp,maxLines=2)
                                                }
                                            }}
                                        }}
                                    }
                                    "background","patterns"->{
                                        Text("Portable background artwork is embedded in the project and exports.",style=MaterialTheme.typography.bodySmall)
                                        val samples=if(activeToolkitId=="patterns")listOf("Dots","Grid","Stripes","Checkerboard") else listOf("Ocean","Sunset","Forest","Radial glow")
                                        samples.forEach{sample->OutlinedButton(onClick={
                                            checkpoint()
                                            val artwork=UxUiNativeLayer("background-"+System.nanoTime(),"image","Background artwork",0,0,bw,bh,"",padding=0,radius=0,imageData=uxNativeBackgroundArtwork(sample,bw,bh),referenceWidth=bw,referenceHeight=bh)
                                            elements.removeAll{it.name=="Background artwork"};elements.add(0,artwork);selectedId="";showCanvasSettings=true;notice=sample+" background applied."
                                        },modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(12.dp)){
                                            val preview=remember(sample){uxNativeBackgroundArtwork(sample,280,68)}
                                            Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(5.dp)){UxUiNativeArtworkPreview(UxUiNativeLayer("sample","image",sample,0,0,280,68,"",imageData=preview),Modifier.fillMaxWidth().height(68.dp),monochrome=true);Text(sample)}
                                        }}
                                        OutlinedButton(onClick={checkpoint();elements.removeAll{it.name=="Background artwork"}},modifier=Modifier.fillMaxWidth()){Text("Remove background artwork")}
                                        OutlinedButton(onClick={selectedId="";showCanvasSettings=true;showElementTray=false},modifier=Modifier.fillMaxWidth()){Text("Canvas color & size")}
                                    }
                                    "motion","transform"->{
                                        if(selectedElement==null)Text("Select a layer in the canvas or add a shape to transform.")
                                        else{
                                            Text("Rotation · "+selectedElement.rotation.roundToInt()+"°")
                                            Slider(selectedElement.rotation.coerceIn(-180f,180f),{angle->edit(selectedElement.id){it.copy(rotation=angle)}},valueRange=-180f..180f)
                                            OutlinedButton(onClick={edit(selectedElement.id){it.copy(x=((bw-it.width)/2).coerceAtLeast(0),y=((bh-it.height)/2).coerceAtLeast(0))}},modifier=Modifier.fillMaxWidth()){Text("Center on canvas")}
                                            OutlinedButton(onClick={edit(selectedElement.id){it.copy(rotation=0f)}},modifier=Modifier.fillMaxWidth()){Text("Reset rotation")}
                                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedButton(onClick={edit(selectedElement.id){it.copy(width=(it.width*1.1f).roundToInt(),height=(it.height*1.1f).roundToInt())}},modifier=Modifier.weight(1f)){Text("Size +")};OutlinedButton(onClick={edit(selectedElement.id){it.copy(width=(it.width*.9f).roundToInt().coerceAtLeast(1),height=(it.height*.9f).roundToInt().coerceAtLeast(1))}},modifier=Modifier.weight(1f)){Text("Size −")}}
                                        }
                                        OutlinedButton(onClick={add("rect")},modifier=Modifier.fillMaxWidth()){Text("Add a shape")}
                                        Text("Rotation edits the saved design. Animated timelines are not part of this editor.",style=MaterialTheme.typography.bodySmall)
                                    }
                                    "device","platform"->{
                                        listOf("mobile" to "Phone · 390 × 844","tablet" to "Tablet · 768 × 1024","desktop" to "Desktop · 1440 × 900").forEach{(mode,label)->OutlinedButton(onClick={target=mode;customArtboard=false;customWidth=if(mode=="mobile")390 else if(mode=="tablet")768 else 1440;customHeight=if(mode=="mobile")844 else if(mode=="tablet")1024 else 900},modifier=Modifier.fillMaxWidth()){Text(if(target==mode)"✓ "+label else label)}}
                                        selectedElement?.let{layer->Text("Show selected layer on",style=MaterialTheme.typography.labelLarge);listOf("mobile","tablet","desktop").forEach{mode->Row(verticalAlignment=Alignment.CenterVertically){val visible=layer.visibleOn.split(",");Checkbox(checked=mode in visible,onCheckedChange={checked->val next=if(checked)visible+mode else visible-mode;if(next.isNotEmpty())edit(layer.id){it.copy(visibleOn=next.distinct().joinToString(","))}});Text(mode)}}}
                                    }
                                    "responsive"->{
                                        OutlinedButton(onClick={selectedId="";showCanvasSettings=true;showElementTray=false},modifier=Modifier.fillMaxWidth()){Text("Edit canvas dimensions")}
                                        selectedElement?.let{layer->Text("Horizontal constraint");listOf("left","center","right","stretch").forEach{anchor->FilterChip(selected=layer.horizontalConstraint==anchor,onClick={edit(layer.id){it.copy(horizontalConstraint=anchor,referenceWidth=bw,referenceHeight=bh)}},label={Text(anchor)})};Text("Vertical constraint");listOf("top","center","bottom","stretch").forEach{anchor->FilterChip(selected=layer.verticalConstraint==anchor,onClick={edit(layer.id){it.copy(verticalConstraint=anchor,referenceWidth=bw,referenceHeight=bh)}},label={Text(anchor)})}}
                                    }
                                    "layers"->{
                                        if(elements.isEmpty())Text("Your layers will appear here after you add an element.")
                                        elements.reversed().forEach{layer->OutlinedButton(onClick={selectedId=layer.id;showElementTray=false;showCanvasSettings=false},modifier=Modifier.fillMaxWidth()){Text(layer.name+" · "+layer.kind)}}
                                    }
                                    "flows"->{
                                        if(screens.size<2)Text("Add another screen, then select a layer and choose its tap destination.")
                                        OutlinedButton(onClick={addAppScreen()},modifier=Modifier.fillMaxWidth()){Text("Add screen")}
                                        selectedElement?.let{layer->Text("When ${layer.name} is tapped:");screens.filter{it.id!=activeScreenId}.forEach{screen->OutlinedButton(onClick={edit(layer.id){it.copy(prototypeTargetScreenId=screen.id)}},modifier=Modifier.fillMaxWidth()){Text(if(layer.prototypeTargetScreenId==screen.id)"✓ "+screen.name else screen.name)}}}
                                        Button(onClick={startPrototypePreview()},enabled=hasActivePrototypeLinks,modifier=Modifier.fillMaxWidth()){Text("Preview connected screens")}
                                    }
                                    "content"->{
                                        listOf("Heading" to "Your next idea starts here","Paragraph" to "Tell your story with clear, thoughtful content.","Button" to "Get started").forEach{(label,text)->OutlinedButton(onClick={add(if(label=="Button")"button" else "text");val layer=elements.last();edit(layer.id){it.copy(name=label,text=text,fontSize=if(label=="Heading")26 else 16)}},modifier=Modifier.fillMaxWidth()){Column(Modifier.fillMaxWidth()){Text(text,fontSize=if(label=="Heading")22.sp else 14.sp);Text("Add "+label,style=MaterialTheme.typography.labelSmall)}}}
                                    }
                                    "data-viz"->{
                                        OutlinedButton(onClick={add("chart")},modifier=Modifier.fillMaxWidth()){Text("Add editable bar chart")}
                                        selectedElement?.takeIf{it.kind=="chart"}?.let{layer->OutlinedTextField(layer.text,{v->edit(layer.id){it.copy(text=v)}},label={Text("Title, then Label: value on each line")},modifier=Modifier.fillMaxWidth(),minLines=5)}
                                    }
                                    "handoff"->{
                                        Button(onClick={jsonText=uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}},screens.toList(),activeScreenId);jsonLauncher.launch("design-project.json")},modifier=Modifier.fillMaxWidth()){Text("Save portable project JSON")}
                                        Button(onClick={pdfBytes=UxUiNativePdf.build(context,projectName,target,background,elements,uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson),bw,bh);pdfLauncher.launch("design-preview.pdf")},modifier=Modifier.fillMaxWidth()){Text("Export visual PDF")}
                                        Text("HTML, Kotlin and SwiftUI source exports are also available in Export and handoff below.",style=MaterialTheme.typography.bodySmall)
                                    }
                                    else->Text("Choose an item in this toolkit to edit the design.")
                                }
                                OutlinedButton(onClick={toolkitTab="All 26"},modifier=Modifier.fillMaxWidth()){Text("Back to all 26 tools")}
                            }
                            "Icons" -> {
                                OutlinedTextField(iconQuery,{iconQuery=it;iconStart=0},label={Text("Search icons")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){uxNativeIconCategories.keys.forEach{category->FilterChip(selected=iconCategory==category,onClick={iconCategory=category},label={Text(category)})}}
                                val browseIcons=(if(iconQuery.isBlank()){if(iconCategory=="All bundled")bundledIconNames else uxNativeIconCategories[iconCategory].orEmpty().filter{it in bundledIconNames}}else bundledIconNames.filter{it.contains(iconQuery,true)}+iconResults).distinct().filter{it.contains(toolkitSearch,true)}
                                browseIcons.take(iconBrowseLimit).chunked(3).forEach{row->
                                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                        row.forEach{icon->OutlinedButton(onClick={val id=selectedElement?.takeIf{it.kind=="icon"}?.id?:run{add("icon");selectedId};chooseIcon(id,icon)},modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),contentPadding=PaddingValues(8.dp)){
                                            Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)){
                                                UxNativeIconThumbnail(icon)
                                                Text(icon.substringAfter(":"),fontSize=10.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
                                            }
                                        }}
                                        repeat(3-row.size){Spacer(Modifier.weight(1f))}
                                    }
                                }
                                if(browseIcons.size>iconBrowseLimit)OutlinedButton(onClick={iconBrowseLimit+=36},modifier=Modifier.fillMaxWidth()){Text("Show more icons · $iconBrowseLimit / ${browseIcons.size}")}
                                if(browseIcons.isEmpty())Text("No matching icons. Try another search or browse a category.")
                                Button(onClick={searchIcons(false)},enabled=iconQuery.isNotBlank()&&!iconBusy,modifier=Modifier.fillMaxWidth()){Text(if(iconBusy)"Searching…" else "Search online catalog")}
                                OutlinedButton(onClick={svgIconImportLauncher.launch(arrayOf("image/svg+xml","text/xml"))},modifier=Modifier.fillMaxWidth()){Text("Import SVG icon")}
                                Text("Bundled icons work offline. Tap an icon to add or replace it. Online results show Retry if artwork is unavailable.",style=MaterialTheme.typography.bodySmall)
                            }
                            "Elements" -> {
                                if(activeToolkitId in setOf("illustrations","media","assets","inspiration")){
                                    Text("Import artwork and preview it directly on the canvas.",style=MaterialTheme.typography.bodySmall)
                                    OutlinedButton(onClick={add("image");imageTargetId=selectedId;imageLauncher.launch("image/*")},modifier=Modifier.fillMaxWidth()){Text("Import image / visual reference")}
                                    OutlinedButton(onClick={svgIconImportLauncher.launch(arrayOf("image/svg+xml","text/xml"))},modifier=Modifier.fillMaxWidth()){Text("Import SVG illustration")}
                                }
                                Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(10.dp)){
                                    listOf("text" to "Text","button" to "Button","card" to "Card","input" to "Input","icon" to "Icon","image" to "Image","triangle" to "Triangle","diamond" to "Diamond","hexagon" to "Hexagon","star" to "Star","line" to "Line","pill" to "Pill","navbar" to "Navbar","tabbar" to "Tab bar","tabs" to "Tabs","row" to "Row","avatar" to "Avatar","badge" to "Badge","switch" to "Switch","progress" to "Progress","slider" to "Slider","radio" to "Radio","dropdown" to "Dropdown","search" to "Search","textarea" to "Text area","table" to "Table","chart" to "Chart","modal" to "Modal","breadcrumb" to "Breadcrumb","tooltip" to "Tooltip","list" to "List","video" to "Video","logo" to "Logo","menu" to "Menu","spacer" to "Spacer","rect" to "Rectangle","circle" to "Circle","divider" to "Divider").filter{(kind,label)->label.contains(toolkitSearch,true)||kind.contains(toolkitSearch,true)}.chunked(2).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){row.forEach{(kind,label)->OutlinedButton(onClick={add(if(kind=="circle")"ellipse" else kind);if(kind=="image"){imageTargetId=selectedId;imageLauncher.launch("image/*")}},modifier=Modifier.weight(1f),contentPadding=PaddingValues(9.dp),shape=RoundedCornerShape(12.dp)){Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(7.dp)){UxNativeElementSample(kind,label);Text(label,fontSize=12.sp)}}};repeat(2-row.size){Spacer(Modifier.weight(1f))}}}
                                }
                            }
                            "Presets" -> {
                                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                                    listOf("mobile-dashboard" to "Mobile app","mobile-login" to "Login screen","tablet-dashboard" to "Tablet app","desktop-landing" to "Website").filter{(id,label)->label.contains(toolkitSearch,true)||id.contains(toolkitSearch,true)}.forEach{(id,label)->OutlinedButton(onClick={checkpoint();val newTarget=when{ id.startsWith("tablet")->"tablet";id.startsWith("desktop")->"desktop";else->"mobile"};target=newTarget;customArtboard=false;customWidth=if(newTarget=="mobile")390 else if(newTarget=="tablet")768 else 1440;customHeight=if(newTarget=="mobile")844 else if(newTarget=="tablet")1024 else 900;elements.clear();elements.addAll(uxNativePreset(newTarget,id).map{it.copy(referenceWidth=customWidth,referenceHeight=customHeight)});selectedId=elements.firstOrNull()?.id.orEmpty();projectName=label;notice=label+" loaded."}){Text(label)}}
                                }
                                OutlinedButton(onClick={presetImportLauncher.launch(arrayOf("application/json"))},modifier=Modifier.fillMaxWidth()){Text("Import preset / project JSON")}
                                Text("Presets can be loaded into this project and customised.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            "Fonts" -> {
                                Text("Preview real font faces before applying. Tap a sample to style text or add a text layer.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                OutlinedTextField(fontQuery,{fontQuery=it},label={Text("Search font families")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                                OutlinedTextField(fontPreviewWords,{fontPreviewWords=it.take(80)},label={Text("Try your words")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                                Row(verticalAlignment=Alignment.CenterVertically){Switch(checked=animateFontPreviews,onCheckedChange={animateFontPreviews=it});Text("Play font previews")}
                                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){listOf("All","Sans serif","Serif","Monospace","Display","Handwriting").forEach{category->FilterChip(selected=fontCategory==category,onClick={fontCategory=category},label={Text(category)})}}
                                uxNativeFontFamilies.filter{it.contains(fontQuery,true)&&(fontCategory=="All"||uxNativeFontFamilyCategory(it)==fontCategory)&&it.contains(toolkitSearch,true)}.forEach{family->
                                    OutlinedButton(onClick={val fontLayer=selectedElement?.takeUnless{it.kind in setOf("icon","image","rect","ellipse","divider","line","triangle","diamond","hexagon","star") }?:run{add("text");elements.last()};edit(fontLayer.id){it.copy(fontFamily=family,fontData=uxNativeBundledFontData(context,family))};showElementTray=false},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(12.dp)){
                                        Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                            Text(family,style=MaterialTheme.typography.labelLarge)
                                            UxNativeAnimatedFontSpecimen(family,fontPreviewWords,animateFontPreviews)
                                            Text(if(family in uxNativeBundledFonts)"Bundled font · available offline" else "Android system font",style=MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                    uxNativeBundledFonts[family]?.let{file->OutlinedButton(onClick={fontExportBytes=context.assets.open("fonts/"+file).use{it.readBytes()};fontExportLauncher.launch(file)},modifier=Modifier.fillMaxWidth()){Text("Save "+family+" font · TTF")}}
                                }
                                if(selectedElement!=null)OutlinedButton(onClick={fontTargetId=selectedElement.id;fontLauncher.launch(arrayOf("*/*"))},modifier=Modifier.fillMaxWidth()){Text("Import font (TTF / OTF)")}
                            }
                            "Tokens" -> {
                                Text("Tap a colour to apply it to the selected element.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(5.dp)){colorTokens.filter{it.first.contains(toolkitSearch,true)||it.second.contains(toolkitSearch,true)}.forEach{(name,value)->OutlinedButton(onClick={val colorLayer=selectedElement;if(colorLayer!=null)edit(colorLayer.id){it.copy(fill=value)}else background=value}){Row(verticalAlignment=Alignment.CenterVertically){Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(uxNativeColor(value)));Text(name)}}}}
                            }
                        }
                    }}}
                }
                Text(if(elements.isEmpty())"Layers" else "Layers · "+elements.size,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                elements.take(if(showAllLayers) elements.size else 6).forEach{e->FilterChip(selected=selectedId==e.id,onClick={selectedId=e.id;showCanvasSettings=false;showElementTray=false},label={Text(e.name,maxLines=1)})}
                if(elements.isEmpty())Text("No layers yet. Tap + to add your first element.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                if(elements.size>6)OutlinedButton(onClick={showAllLayers=!showAllLayers}){Text(if(showAllLayers)"see less" else "see more")}
                Card{Column(Modifier.fillMaxWidth().padding(12.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text("Export and handoff",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                    OutlinedTextField(background,{background=it},label={Text("Canvas background hex")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                    Text("Named colour tokens",style=MaterialTheme.typography.labelLarge)
                    colorTokens.forEachIndexed{index,token->Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
                        OutlinedTextField(token.first,{v->colorTokens[index]=v to token.second},label={Text("Name")},modifier=Modifier.weight(1f),singleLine=true)
                        OutlinedTextField(token.second,{v->colorTokens[index]=token.first to v},label={Text("Hex")},modifier=Modifier.weight(1f),singleLine=true)
                        OutlinedButton(onClick={selected?.let{sel->edit(sel.id){layer->if(token.first.contains("background")||token.first.contains("surface"))layer.copy(fill=token.second)else layer.copy(color=token.second)}}},enabled=selected!=null){Text("Apply")}
                    }}
                    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        OutlinedTextField(tokenNameDraft,{tokenNameDraft=it},label={Text("New token name")},modifier=Modifier.weight(1f),singleLine=true)
                        OutlinedTextField(tokenValueDraft,{tokenValueDraft=it},label={Text("Value")},modifier=Modifier.weight(1f),singleLine=true)
                        Button(onClick={val name=tokenNameDraft.trim();if(name.isNotBlank()&&colorTokens.none{it.first==name}){colorTokens.add(name to tokenValueDraft);tokenNameDraft="brand"}},enabled=tokenNameDraft.isNotBlank()){Text("Add")}
                    }
                    Text("Spacing tokens",style=MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)){spacingTokens.forEach{space->OutlinedButton(onClick={selected?.let{sel->edit(sel.id){layer->layer.copy(padding=space)}}}){Text(space.toString()+" px")}}}
                    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        OutlinedTextField(spacingDraft,{spacingDraft=it},label={Text("New spacing px")},modifier=Modifier.weight(1f),singleLine=true)
                        Button(onClick={val value=spacingDraft.toIntOrNull();if(value!=null&&value in 1..256&&value !in spacingTokens){spacingTokens.add(value);spacingTokens.sort()}},enabled=spacingDraft.toIntOrNull() in 1..256){Text("Add spacing")}
                    }
                    Button(onClick={jsonText=uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}},screens.toList(),activeScreenId);jsonLauncher.launch(projectName.lowercase().replace(Regex("[^a-z0-9]+"),"-")+"-design-spec.json")},modifier=Modifier.fillMaxWidth()){Text("Export JSON + generated code + AI prompt")}
                    Button(onClick={pdfBytes=UxUiNativePdf.build(context,projectName,target,background,elements,uxNativeProjectJson(projectName,target,background,elements,bw,bh,tokenJson,JSONArray().apply{reusable.forEach{put(uxNativeJson(listOf(it)).optJSONObject(0))}},screens.toList(),activeScreenId),bw,bh);pdfLauncher.launch(projectName.lowercase().replace(Regex("[^a-z0-9]+"),"-")+"-design-spec.pdf")},modifier=Modifier.fillMaxWidth()){Text("Export visual PDF + specifications")}
                    Button(onClick={sourceText=uxNativeGenerateHtml(projectName,target,background,elements,bw,bh,tokenJson,JSONObject().put("mobile",480).put("tablet",768).put("desktop",1024));sourceLauncher.launch(projectName.lowercase().replace(Regex("[^a-z0-9]+"),"-")+".html")},modifier=Modifier.fillMaxWidth()){Text("Export Web HTML")}
                    Button(onClick={sourceText=uxNativeGenerateKotlin(projectName,target,background,elements,bw,bh);sourceLauncher.launch(uxNativeSafeIdentifier(projectName)+".kt")},modifier=Modifier.fillMaxWidth()){Text("Export Android Kotlin")}
                    Button(onClick={sourceText=uxNativeGenerateSwift(projectName,target,background,elements,bw,bh);sourceLauncher.launch(uxNativeSafeIdentifier(projectName)+"View.swift")},modifier=Modifier.fillMaxWidth()){Text("Export iOS SwiftUI")}
                }}
            }
            if(notice.isNotBlank())Text(notice,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.primary)
        }
    }
}
