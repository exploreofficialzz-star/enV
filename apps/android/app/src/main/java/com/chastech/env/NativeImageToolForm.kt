package com.chastech.env

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale

@Composable
fun NativeImageToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val operation = NativeImageEngine.operationFor(tool) ?: return
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<NativeImageEngine.Input?>(null) }
    var output by remember { mutableStateOf<NativeImageEngine.Result?>(null) }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    var working by rememberSaveable(tool.id) { mutableStateOf(false) }
    var width by rememberSaveable(tool.id) { mutableStateOf("1200") }
    var height by rememberSaveable(tool.id) { mutableStateOf("") }
    var quality by rememberSaveable(tool.id) { mutableStateOf("88") }
    var text by rememberSaveable(tool.id) { mutableStateOf("enV") }
    var degrees by rememberSaveable(tool.id) { mutableStateOf("90") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> file = uri?.let { readImage(context, it) }; output = null; error = "" }
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/jpeg")) { uri -> if (uri != null) output?.let { result -> context.contentResolver.openOutputStream(uri)?.use { stream -> stream.write(result.bytes) } } }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Native Kotlin · local image processing", style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { picker.launch(arrayOf("image/*")) }) { Text(file?.name ?: "Choose image") }
        when (operation) {
            "resize" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { NativeImageField(width, { width = it }, "Width", Modifier.weight(1f)); NativeImageField(height, { height = it }, "Height (optional)", Modifier.weight(1f)) }
            "compress" -> NativeImageField(quality, { quality = it }, "JPEG quality (1–100)")
            "watermark" -> NativeImageField(text, { text = it }, "Watermark text")
            "rotate" -> NativeImageField(degrees, { degrees = it }, "Degrees")
            "crop" -> Text("Center crop by default; enter dimensions in Options is not yet required.", style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = file != null && !working, onClick = {
                val input = file ?: return@Button
                working = true; error = ""; output = null
                scope.launch {
                    runCatching { withContext(kotlinx.coroutines.Dispatchers.Default) { NativeImageEngine.run(tool, input.bytes, options(operation, width, height, quality, text, degrees)) } }
                        .fold({ output = it }, { error = it.message ?: "Image operation failed." })
                    working = false
                }
            }) { Text(if (working) "Processing…" else "Run locally") }
            OutlinedButton(onClick = { file = null; output = null; error = "" }) { Text("Reset") }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        output?.let { result ->
            Text("${result.width} × ${result.height} · ${String.format(Locale.US, "%.1f", result.bytes.size / 1024.0)} KB", style = MaterialTheme.typography.bodySmall)
            val bitmap = remember(result) { android.graphics.BitmapFactory.decodeByteArray(result.bytes, 0, result.bytes.size) }
            bitmap?.let { Image(bitmap = it.asImageBitmap(), contentDescription = "Processed image", modifier = Modifier.fillMaxWidth().height(240.dp)) }
            Button(onClick = { saver.launch(result.fileName) }) { Text("Save ${result.fileName}") }
        }
    }
}

private fun readImage(context: Context, uri: Uri): NativeImageEngine.Input? = runCatching {
    val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else "image" } ?: "image"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Could not read image")
    NativeImageEngine.Input(name, bytes)
}.getOrNull()
private fun options(operation: String, width: String, height: String, quality: String, text: String, degrees: String): String = JSONObject().apply {
    if (operation == "resize") { put("width", width.toIntOrNull() ?: 0); put("height", height.toIntOrNull() ?: 0) }
    if (operation == "compress") { put("quality", quality.toIntOrNull() ?: 88) }
    if (operation == "watermark") put("text", text)
    if (operation == "rotate") put("degrees", degrees.toDoubleOrNull() ?: 90.0)
}.toString()
@Composable private fun NativeImageField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) { androidx.compose.material3.OutlinedTextField(value, onChange, label = { Text(label) }, modifier = modifier.fillMaxWidth(), singleLine = true) }
