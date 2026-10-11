package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    val saveReport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(output.toByteArray(Charsets.UTF_8)) } }
    }
    val colorTool = kind in setOf("contrast", "accessible-color", "color-blindness")
    val textTool = kind == "text-readability"
    val sizeTool = kind == "font-size" || kind == "line-height"
    val markupTool = kind !in setOf("contrast", "accessible-color", "color-blindness", "font-size", "line-height") && !textTool

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("On-device accessibility review · no snippet is uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (colorTool) {
            OutlinedTextField(foreground, { foreground = it }, label = { Text("Foreground color") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(background, { background = it }, label = { Text("Background color") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        if (sizeTool) {
            OutlinedTextField(fontSize, { fontSize = it }, label = { Text("Font size (CSS px/rem)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (kind == "line-height") OutlinedTextField(lineHeight, { lineHeight = it }, label = { Text("Line height (unitless or px)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        if (markupTool || textTool) {
            OutlinedTextField(
                value = markup,
                onValueChange = { markup = it },
                label = { Text(if (textTool) "English text" else "HTML / CSS snippet") },
                placeholder = { Text(if (textTool) "Paste text to estimate readability…" else "Paste the relevant markup or styles…") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
                minLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = if (textTool) MaterialTheme.typography.bodyMedium.fontFamily else FontFamily.Monospace),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { output = NativeAccessibilityEngine.analyze(tool.id, markup, foreground, background, fontSize, lineHeight) }) { Text("Analyze locally") }
            OutlinedButton(onClick = {
                markup = ""; foreground = "#000000"; background = "#ffffff"; fontSize = "16px"; lineHeight = "1.5"; output = ""
            }) { Text("Reset") }
        }
        if (output.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("Accessibility report", output)) }) { Text("Copy report") }
                OutlinedButton(onClick = { saveReport.launch("env-${tool.id}-report.txt") }) { Text("Download report") }
            }
            Text(output, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace))
        }
        Text("Static snippet review only. Manually test keyboard order, browser zoom, screen readers, and the complete page; results do not certify WCAG conformance.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
