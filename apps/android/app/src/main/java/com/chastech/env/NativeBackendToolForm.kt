package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale

private val DOCUMENT_MIME_TYPES = arrayOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
)

@Composable
fun NativeBackendToolForm(tool: ToolRecord, backend: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isDocument = tool.engine.type == "document-backend"
    val operation = tool.engine.extras["op"] ?: tool.engine.id ?: tool.id
    val allowsMultipleDocuments = Regex("merger|comparison|splitter").containsMatchIn(operation)
    val needsPages = operation.contains("page-") || operation.endsWith("splitter")
    val needsWatermark = operation.contains("watermark")
    var input by rememberSaveable(tool.id) { mutableStateOf("") }
    var options by rememberSaveable(tool.id) { mutableStateOf("{}") }
    var pages by rememberSaveable(tool.id) { mutableStateOf("1") }
    var watermarkText by rememberSaveable(tool.id) { mutableStateOf("enV") }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    var working by rememberSaveable(tool.id) { mutableStateOf(false) }
    var files by remember { mutableStateOf<List<NativeBackendEngine.InputFile>>(emptyList()) }
    var bytes by remember { mutableStateOf<ByteArray?>(null) }
    var mime by remember { mutableStateOf("application/octet-stream") }
    var filename by remember { mutableStateOf("env-output.bin") }

    val multiplePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        files = uris.mapNotNull { readFile(context, it) }
    }
    val singlePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        files = listOfNotNull(uri?.let { readFile(context, it) })
    }
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { uri ->
        if (uri != null && bytes != null) context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (isDocument) {
            Text(
                "Real document processing through the enV document backend. The selected file is processed for the requested operation and the resulting file is returned.",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedButton(onClick = {
                if (allowsMultipleDocuments) multiplePicker.launch(arrayOf("*/*"))
                else singlePicker.launch(DOCUMENT_MIME_TYPES)
            }) {
                Text(when {
                    files.isEmpty() && allowsMultipleDocuments -> "Choose files"
                    files.isEmpty() -> "Choose file"
                    else -> "Selected ${files.size} file(s)"
                })
            }
            if (needsPages) {
                OutlinedTextField(
                    value = pages,
                    onValueChange = { pages = it },
                    label = { Text("Pages / range") },
                    placeholder = { Text("1,3-5") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (needsWatermark) {
                OutlinedTextField(
                    value = watermarkText,
                    onValueChange = { watermarkText = it },
                    label = { Text("Watermark text") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        } else {
            Text("Native Kotlin · enV backend API", style = MaterialTheme.typography.labelLarge)
            if (backend || tool.engine.type in setOf("image", "video", "audio", "pdf", "file-converter", "mockup", "post") || tool.category.equals("screenshots", true)) {
                OutlinedButton(onClick = { multiplePicker.launch(arrayOf("*/*")) }) {
                    Text(if (files.isEmpty()) "Choose file(s)" else "Selected ${files.size} file(s)")
                }
            }
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text(if (tool.id.contains("url")) "URL" else "Input") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            if (backend || tool.engine.type == "custom") {
                OutlinedTextField(
                    value = options,
                    onValueChange = { options = it },
                    label = { Text("Options JSON") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !working,
                onClick = {
                    if (isDocument && files.isEmpty()) {
                        error = "Choose the document or file required by this tool."
                        return@Button
                    }
                    working = true
                    output = ""
                    bytes = null
                    error = ""
                    val requestOptions = if (isDocument) {
                        JSONObject().put("pages", pages).put("text", watermarkText).toString()
                    } else options
                    scope.launch {
                        runCatching {
                            withContext(Dispatchers.IO) {
                                NativeBackendEngine.execute(tool, input, requestOptions, files)
                            }
                        }.fold(
                            { result ->
                                bytes = result.bytes
                                mime = result.mimeType ?: "application/octet-stream"
                                filename = result.fileName ?: "$operation-output"
                                output = if (isDocument) {
                                    val sizeKb = (result.bytes?.size ?: 0) / 1024.0
                                    "${nativeOperationLabel(operation)} completed · ${String.format(Locale.US, "%.1f", sizeKb)} KB"
                                } else {
                                    result.text ?: "Output ready: ${result.fileName ?: tool.id}"
                                }
                            },
                            { caught ->
                                error = caught.message ?: "Tool failed"
                                output = ""
                            },
                        )
                        working = false
                    }
                },
            ) {
                Text(
                    when {
                        working && isDocument -> "Processing…"
                        working -> "Running…"
                        isDocument -> "Run ${nativeOperationLabel(operation)}"
                        else -> "Run"
                    },
                )
            }
            OutlinedButton(onClick = {
                input = ""
                options = "{}"
                pages = "1"
                watermarkText = "enV"
                output = ""
                error = ""
                bytes = null
                files = emptyList()
            }) {
                Text("Reset")
            }
        }

        if (bytes != null) OutlinedButton(onClick = { saver.launch(filename) }) { Text("Save $filename") }
        if (output.isNotBlank()) {
            Text(output)
            if (!isDocument) {
                OutlinedButton(onClick = {
                    context.getSystemService(ClipboardManager::class.java)
                        ?.setPrimaryClip(ClipData.newPlainText("enV output", output))
                }) { Text("Copy") }
            }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
    }
}

private fun nativeOperationLabel(operation: String): String = operation
    .split('-')
    .joinToString(" ") { word -> word.replaceFirstChar { it.titlecase(Locale.US) } }

private fun readFile(context: Context, uri: Uri): NativeBackendEngine.InputFile? {
    val name = context.contentResolver.query(
        uri,
        arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
    )?.use { if (it.moveToFirst()) it.getString(0) else "input" } ?: "input"
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    val data = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
        .getOrNull() ?: return null
    return NativeBackendEngine.InputFile(name, mime, data)
}
