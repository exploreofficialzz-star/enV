package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chastech.env.data.ToolRecord

private const val APCA_WEB_URL = "https://en-v.vercel.app/tools/accessibility/color-contrast-studio"
private const val APCA_WEB_HOST = "en-v.vercel.app"

@Composable
fun NativeAccessibilityToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val kind = NativeAccessibilityEngine.kind(tool.id)
    val studioKind = when (kind) { "accessible-color", "color-blindness" -> "contrast"; "font-size", "line-height" -> "text-readability"; else -> kind }
    val modes = if (studioKind == "contrast") listOf("checker", "generator", "helper", "preview", "simulator", "vision") else listOf("checker", "generator", "helper", "preview", "simulator")
    var studioMode by rememberSaveable(tool.id) { mutableStateOf(if (kind == "color-blindness") "vision" else tool.id.substringAfterLast('-', "checker").takeIf { it in modes } ?: "checker") }
    val engineToolId = if (studioMode == "vision") "color-blindness-preview" else "$studioKind-$studioMode"
    var markup by rememberSaveable(tool.id) { mutableStateOf("") }
    var foreground by rememberSaveable(tool.id) { mutableStateOf("#000000") }
    var background by rememberSaveable(tool.id) { mutableStateOf("#ffffff") }
    var fontSize by rememberSaveable(tool.id) { mutableStateOf("16px") }
    var lineHeight by rememberSaveable(tool.id) { mutableStateOf("1.5") }
    var focusWidth by rememberSaveable(tool.id) { mutableStateOf("3px") }
    var focusOffset by rememberSaveable(tool.id) { mutableStateOf("3px") }
    var ariaPattern by rememberSaveable(tool.id) { mutableStateOf("button") }
    var ariaPatternExpanded by rememberSaveable(tool.id) { mutableStateOf(false) }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var apcaWebOpen by remember { mutableStateOf(false) }
    var previewSize by rememberSaveable(tool.id) { mutableStateOf(18f) }
    var previewLeading by rememberSaveable(tool.id) { mutableStateOf(1.5f) }
    var demoEmail by rememberSaveable(tool.id) { mutableStateOf("") }
    var demoSubmitted by rememberSaveable(tool.id) { mutableStateOf(false) }
    var demoValid by rememberSaveable(tool.id) { mutableStateOf(false) }
    val saveReport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(output.toByteArray(Charsets.UTF_8)) } }
    }
    val colorTool = studioKind == "contrast"
    val textTool = studioKind == "text-readability"
    val sizeTool = textTool
    val focusGenerator = kind == "focus-state" && studioMode == "generator"
    val altCoach = kind == "alt-text" && studioMode == "helper"
    val markupTool = studioKind !in setOf("contrast", "text-readability") && !altCoach && studioMode != "generator" && !(kind == "form" && studioMode == "simulator")
    val sample = when (studioKind) {
        "alt-text" -> "<img src=\"logo.svg\" alt=\"\">\n<img src=\"event.jpg\">"
        "aria" -> "<button aria-label=\"\" aria-expanded=\"false\">Open</button>"
        "focus-state" -> "button:focus { outline: none; }"
        "keyboard-navigation" -> "<div tabindex=\"4\" onclick=\"openMenu()\">Menu</div>"
        "form" -> "<form><input type=\"email\"><button>Submit</button></form>"
        "motion" -> "button { animation: pulse 1s infinite; }"
        else -> ""
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${tool.name} Studio", style = MaterialTheme.typography.headlineSmall)
        Text(tool.description, style = MaterialTheme.typography.bodyMedium)
        Text(if (colorTool) "Native contrast checks run on this device; APCA opens the web implementation." else "Runs on this device. Your text and markup are not uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            modes.forEach { mode ->
                val label = when (mode) { "checker" -> "Check"; "generator" -> "Generate"; "helper" -> "Coach / fix"; "preview" -> "Preview"; "simulator" -> "Test"; else -> "Color vision" }
                if (studioMode == mode) Button(onClick = { studioMode = mode }, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) }
                else OutlinedButton(onClick = { studioMode = mode }, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) }
            }
        }
        if (colorTool) {
            OutlinedButton(onClick = { apcaWebOpen = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Open APCA in web view")
            }
            Text("APCA runs in the web Color Contrast Studio. It requires a connection; colors entered in this native form are not copied over.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (colorTool) {
            OutlinedTextField(foreground, { foreground = it }, label = { Text("Foreground / first color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Example: #2457C5") })
            OutlinedTextField(background, { background = it }, label = { Text("Background / second color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Example: #FFFFFF") })
            if (studioMode == "helper") {
                Text("Tap a WCAG AA candidate to apply it as the foreground.", style = MaterialTheme.typography.bodySmall)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NativeAccessibilityEngine.passingForegroundColors(background).forEach { candidate ->
                        OutlinedButton(onClick = { foreground = candidate; output = "" }, modifier = Modifier.heightIn(min = 48.dp)) { Text(candidate) }
                    }
                }
            }
        }
        if (focusGenerator || (kind == "focus-state" && studioMode in setOf("preview", "simulator"))) {
            OutlinedTextField(foreground, { foreground = it }, label = { Text("Focus ring color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Choose a ring visible against your interface.") })
            OutlinedTextField(background, { background = it }, label = { Text("Dark-mode ring color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(focusWidth, { focusWidth = it }, label = { Text("Ring width (CSS px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(focusOffset, { focusOffset = it }, label = { Text("Ring offset (CSS px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        if (kind == "aria" && studioMode == "generator") {
            Box {
                OutlinedButton(onClick = { ariaPatternExpanded = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Pattern: ${ariaPattern.replaceFirstChar { it.uppercase() }}") }
                DropdownMenu(expanded = ariaPatternExpanded, onDismissRequest = { ariaPatternExpanded = false }) {
                    listOf("button", "dialog", "disclosure", "tabs", "checkbox", "link").forEach { pattern ->
                        DropdownMenuItem(text = { Text(pattern.replaceFirstChar { it.uppercase() }) }, onClick = { ariaPattern = pattern; ariaPatternExpanded = false })
                    }
                }
            }
        }
        if (sizeTool) {
            OutlinedTextField(fontSize, { fontSize = it }, label = { Text("Font size (CSS px/rem)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (kind == "line-height") OutlinedTextField(lineHeight, { lineHeight = it }, label = { Text("Line height (unitless or px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        if (markupTool || textTool || altCoach) {
            OutlinedTextField(
                value = markup,
                onValueChange = { markup = it },
                label = { Text(when { altCoach -> "Describe the image and its purpose"; textTool -> "English text"; kind == "alt-text" && studioMode == "simulator" -> "Paste multiple image tags"; else -> "HTML / CSS snippet" }) },
                placeholder = { Text(when { altCoach -> "What is in the image, and why is it included?"; textTool -> "Paste text to estimate readability…"; kind == "alt-text" && studioMode == "simulator" -> "Paste up to 50 <img> tags…"; else -> "Paste the relevant markup or styles…" }) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                minLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = if (markupTool) KeyboardCapitalization.None else KeyboardCapitalization.Sentences),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (textTool || altCoach) MaterialTheme.typography.bodyMedium.fontFamily else FontFamily.Monospace),
            )
        }
        if (markupTool || textTool) {
            OutlinedButton(onClick = { if (sample.isNotEmpty()) markup = sample }, enabled = sample.isNotEmpty(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Load sample") }
        }
        if (colorTool && studioMode == "preview") {
            Surface(color = previewColor(background, MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Live color preview · sample text", color = previewColor(foreground, MaterialTheme.colorScheme.onSurface), style = MaterialTheme.typography.titleLarge)
                    Text("Check text, large text, a border, and interactive states on the actual background.", color = previewColor(foreground, MaterialTheme.colorScheme.onSurface))
                    OutlinedButton(onClick = {}, modifier = Modifier.heightIn(min = 48.dp)) { Text("Sample action") }
                }
            }
        }
        if (colorTool && studioMode == "vision") {
            Text("Approximation only—not a clinical simulator. Never convey meaning through color alone.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            NativeAccessibilityEngine.colorVisionPreviewPairs(foreground, background).forEach { row ->
                Surface(color = previewColor(row.background, MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Text("${row.label}\nSample text · ${row.foreground} on ${row.background}", modifier = Modifier.padding(14.dp), color = previewColor(row.foreground, MaterialTheme.colorScheme.onSurface))
                }
            }
        }
        if (textTool && studioMode in setOf("preview", "simulator")) {
            Text("Type-size preview · ${previewSize.toInt()} sp · line height ${"%.2f".format(previewLeading)}", style = MaterialTheme.typography.labelLarge)
            Slider(value = previewSize, onValueChange = { previewSize = it }, valueRange = 12f..40f, steps = 27, modifier = Modifier.fillMaxWidth())
            Slider(value = previewLeading, onValueChange = { previewLeading = it }, valueRange = 1f..2.5f, steps = 29, modifier = Modifier.fillMaxWidth())
            Text(markup.ifBlank { "Accessible content should remain readable when people enlarge text and adjust spacing." }, fontSize = previewSize.sp, lineHeight = (previewSize * previewLeading).sp)
        }
        if (kind == "focus-state" && studioMode in setOf("preview", "simulator") || kind == "keyboard-navigation" && studioMode in setOf("preview", "simulator")) NativeFocusPlayground(foreground, background)
        if (kind == "motion" && studioMode in setOf("preview", "simulator")) NativeMotionPlayground()
        if (kind == "form" && studioMode == "simulator") {
            Text("Interactive validation demo · data stays in this screen", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = demoEmail,
                onValueChange = { demoEmail = it; if (demoSubmitted) demoValid = it.contains('@') && it.substringAfter('@').contains('.') },
                label = { Text("Email address") },
                isError = demoSubmitted && !demoValid,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, capitalization = KeyboardCapitalization.None),
                supportingText = { if (demoSubmitted && !demoValid) Text("Enter an email address such as name@example.com.") else Text("Required · only checked in this local demo.") },
                modifier = Modifier.fillMaxWidth(),
            )
            if (demoSubmitted && !demoValid) Text("Email address is required or invalid.", color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            Button(onClick = { demoSubmitted = true; demoValid = demoEmail.contains('@') && demoEmail.substringAfter('@').contains('.') }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Validate sample form") }
            if (demoValid) Text("Demo form is valid. No data was sent.", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, color = MaterialTheme.colorScheme.primary)
        }
        Button(
            onClick = { output = NativeAccessibilityEngine.analyze(engineToolId, if (kind == "aria" && studioMode == "generator") ariaPattern else markup, foreground, background, fontSize, lineHeight, focusWidth, focusOffset) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) { Text(if (studioMode == "generator") "Generate locally" else if (studioMode == "preview" || studioMode == "simulator" || studioMode == "vision") "Run local preview / test" else if (studioMode == "helper") "Get local coaching" else "Run local review") }
        OutlinedButton(
            onClick = { markup = ""; foreground = "#000000"; background = "#ffffff"; fontSize = "16px"; lineHeight = "1.5"; focusWidth = "3px"; focusOffset = "3px"; ariaPattern = "button"; previewSize = 18f; previewLeading = 1.5f; demoEmail = ""; demoSubmitted = false; demoValid = false; output = "" },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) { Text("Reset fields") }
        if (output.isNotEmpty()) {
            Text("Result", style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("Accessibility report", output))
                Toast.makeText(context, "Report copied", Toast.LENGTH_SHORT).show()
            }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Copy report") }
            OutlinedButton(onClick = { saveReport.launch("env-${tool.id}-report.txt") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Save report") }
            Text(output, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace))
        }
        Text("Static snippet checks cannot inspect the full live page or certify conformance. Verify keyboard use, zoom, and screen-reader behavior with real devices and users.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (apcaWebOpen) ApcaWebDialog(onDismiss = { apcaWebOpen = false })
}

@Composable
private fun ApcaWebDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("APCA · Web view", style = MaterialTheme.typography.titleMedium)
                    Text("Loads the existing web contrast panel. A connection is required; native color inputs are not transferred.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Close") }
            }
            AndroidView(
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.setSupportMultipleWindows(false)
                        settings.cacheMode = WebSettings.LOAD_NO_CACHE
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest): Boolean {
                                val target = request.url
                                if (target.scheme == "https" && target.host == APCA_WEB_HOST) return false
                                if (target.scheme == "https") runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, target)) }
                                return true
                            }
                        }
                        loadUrl(APCA_WEB_URL)
                    }
                },
                modifier = Modifier.fillMaxWidth().weight(1f),
                onRelease = { view -> view.stopLoading(); view.destroy() },
            )
        }
    }
}

private fun previewColor(value: String, fallback: Color): Color = runCatching { Color(android.graphics.Color.parseColor(value.trim())) }.getOrDefault(fallback)

@Composable
private fun NativeFocusPlayground(lightRing: String, darkRing: String) {
    var dark by rememberSaveable { mutableStateOf(false) }
    var forced by rememberSaveable { mutableStateOf(false) }
    val surface = if (forced) Color.Black else if (dark) Color(0xFF111827) else MaterialTheme.colorScheme.surfaceVariant
    val foreground = if (forced || dark) Color.White else MaterialTheme.colorScheme.onSurface
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Keyboard focus playground", style = MaterialTheme.typography.titleMedium)
        Text("Use a hardware keyboard or accessibility switch to move through these controls; also try Shift+Tab.", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { dark = !dark; forced = false }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(if (dark) "Light surface" else "Dark surface") }
            OutlinedButton(onClick = { forced = !forced; dark = false }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Forced-colors mock") }
        }
        Surface(color = surface, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {}, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Keyboard focus sample") }
                OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Second focus target", color = foreground) }
                Text("Ring samples: ${if (dark) darkRing else lightRing} · offset and contrast need real-device verification", color = foreground, style = MaterialTheme.typography.bodySmall)
            }
        }
        Text("Forced-colors is a visual mock; verify actual Android device accessibility contrast settings.", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun NativeMotionPlayground() {
    var running by rememberSaveable { mutableStateOf(false) }
    var reduce by rememberSaveable { mutableStateOf(false) }
    val position by animateFloatAsState(targetValue = if (running && !reduce) 1f else 0f, animationSpec = androidx.compose.animation.core.tween(durationMillis = if (reduce) 0 else 900), label = "accessibility-motion-preview")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Reduced-motion playground", style = MaterialTheme.typography.titleMedium)
        androidx.compose.material3.Switch(checked = reduce, onCheckedChange = { reduce = it }, modifier = Modifier.semantics { contentDescription = "Reduce this local motion demo" })
        Text(if (reduce) "Reduced motion is on." else "Reduced motion is off.")
        OutlinedButton(onClick = { running = !running }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (running) "Stop motion" else "Play motion") }
        Box(Modifier.fillMaxWidth().heightIn(min = 64.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))) {
            Text("●", modifier = Modifier.align(androidx.compose.ui.Alignment.CenterStart).offset(x = (position * 120).dp).padding(12.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineMedium)
        }
        Text("Local sample only. Compare the toggle with the operating-system reduced-animation preference.", style = MaterialTheme.typography.labelSmall)
    }
}
