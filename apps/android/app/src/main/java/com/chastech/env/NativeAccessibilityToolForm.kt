package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord

@Composable
fun NativeAccessibilityToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val kind = NativeAccessibilityEngine.kind(tool.id)
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
    val saveReport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(output.toByteArray(Charsets.UTF_8)) } }
    }
    val colorTool = kind in setOf("contrast", "accessible-color", "color-blindness")
    val textTool = kind == "text-readability"
    val sizeTool = kind == "font-size" || kind == "line-height"
    val focusGenerator = tool.id == "focus-state-generator"
    val altCoach = tool.id == "alt-text-helper"
    val markupTool = kind !in setOf("contrast", "accessible-color", "color-blindness", "font-size", "line-height") && !textTool && !altCoach && !tool.id.endsWith("-generator")
    val sample = when (kind) {
        "alt-text" -> "<img src=\"logo.svg\" alt=\"\">\n<img src=\"event.jpg\">"
        "aria" -> "<button aria-label=\"\" aria-expanded=\"false\">Open</button>"
        "focus-state" -> "button:focus { outline: none; }"
        "keyboard-navigation" -> "<div tabindex=\"4\" onclick=\"openMenu()\">Menu</div>"
        "form" -> "<form><input type=\"email\"><button>Submit</button></form>"
        "motion" -> "button { animation: pulse 1s infinite; }"
        else -> ""
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(tool.description, style = MaterialTheme.typography.bodyMedium)
        Text("Runs on this device. Your text and markup are not uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (colorTool) {
            OutlinedTextField(foreground, { foreground = it }, label = { Text("Foreground / first color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Example: #2457C5") })
            OutlinedTextField(background, { background = it }, label = { Text("Background / second color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Example: #FFFFFF") })
        }
        if (focusGenerator) {
            OutlinedTextField(foreground, { foreground = it }, label = { Text("Focus ring color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, supportingText = { Text("Choose a ring visible against your interface.") })
            OutlinedTextField(background, { background = it }, label = { Text("Dark-mode ring color (HEX)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(focusWidth, { focusWidth = it }, label = { Text("Ring width (CSS px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(focusOffset, { focusOffset = it }, label = { Text("Ring offset (CSS px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        if (tool.id == "aria-generator") {
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
                label = { Text(when { altCoach -> "Describe the image and its purpose"; textTool -> "English text"; tool.id == "alt-text-simulator" -> "Paste multiple image tags"; else -> "HTML / CSS snippet" }) },
                placeholder = { Text(when { altCoach -> "What is in the image, and why is it included?"; textTool -> "Paste text to estimate readability…"; tool.id == "alt-text-simulator" -> "Paste up to 50 <img> tags…"; else -> "Paste the relevant markup or styles…" }) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                minLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = if (markupTool) KeyboardCapitalization.None else KeyboardCapitalization.Sentences),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (textTool || altCoach) MaterialTheme.typography.bodyMedium.fontFamily else FontFamily.Monospace),
            )
        }
        if (markupTool || textTool) {
            OutlinedButton(onClick = { if (sample.isNotEmpty()) markup = sample }, enabled = sample.isNotEmpty(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Load sample") }
        }
        Button(
            onClick = { output = NativeAccessibilityEngine.analyze(tool.id, if (tool.id == "aria-generator") ariaPattern else markup, foreground, background, fontSize, lineHeight, focusWidth, focusOffset) },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) { Text(if (tool.id.endsWith("-generator")) "Generate locally" else "Run local review") }
        OutlinedButton(
            onClick = { markup = ""; foreground = "#000000"; background = "#ffffff"; fontSize = "16px"; lineHeight = "1.5"; focusWidth = "3px"; focusOffset = "3px"; ariaPattern = "button"; output = "" },
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
}
