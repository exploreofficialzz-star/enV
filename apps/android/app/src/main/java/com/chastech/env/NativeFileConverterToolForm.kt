package com.chastech.env

import com.chastech.env.ui.CharacterSpacedText as Text

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeFileConverterEngine
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException

private const val MAX_NATIVE_CONVERTER_INPUT_BYTES = 200L * 1024L * 1024L

@Composable
fun NativeFileConverterToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<NativeBackendEngine.InputFile?>(null) }
    var output by remember { mutableStateOf<NativeFileConverterEngine.Result?>(null) }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    var status by rememberSaveable(tool.id) { mutableStateOf("") }
    var working by rememberSaveable(tool.id) { mutableStateOf(false) }

    LaunchedEffect(Unit) { PDFBoxResourceLoader.init(context) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            working = true
            output = null
            error = ""
            status = ""
            val loaded = withContext(Dispatchers.IO) {
                runCatching { readConverterFile(context, uri) }
            }
            loaded.onSuccess {
                file = it
                status = "File ready for local conversion."
            }.onFailure {
                file = null
                error = it.message ?: "The selected file could not be read."
            }
            working = false
        }
    }

    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val selectedOutput = output
        if (uri != null && selectedOutput != null) scope.launch {
            working = true
            val saved = withContext(Dispatchers.IO) {
                runCatching {
                    val stream = context.contentResolver.openOutputStream(uri)
                        ?: throw IOException("The selected destination could not be opened.")
                    stream.use { destination ->
                        when {
                            selectedOutput.bytes != null -> destination.write(selectedOutput.bytes)
                            selectedOutput.text != null -> destination.write(selectedOutput.text.toByteArray(Charsets.UTF_8))
                            else -> throw IOException("The conversion did not produce a saveable file.")
                        }
                        destination.flush()
                    }
                }
            }
            saved.onSuccess {
                error = ""
                status = "File saved successfully."
            }.onFailure {
                error = it.message ?: "The converted file could not be saved."
                status = ""
            }
            working = false
        }
    }

    val baseName = file?.name?.substringBeforeLast('.') ?: "output"
    val hasOutput = output?.bytes != null || output?.text != null
    val outputExtension = output?.extension ?: "txt"

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Native Kotlin · local file conversion", style = MaterialTheme.typography.labelLarge)
        Button(enabled = !working, onClick = { picker.launch(arrayOf("*/*")) }) {
            Text(if (file == null) "Choose file" else file!!.name)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = file != null && !working,
                onClick = {
                    val selected = file ?: return@Button
                    scope.launch {
                        working = true
                        val converted = withContext(Dispatchers.Default) {
                            runCatching { NativeFileConverterEngine.run(tool, selected.name, selected.bytes) }
                        }
                        converted.onSuccess {
                            output = it
                            error = ""
                            status = "Conversion complete. Save the TXT file to keep a copy."
                        }.onFailure {
                            output = null
                            error = it.message ?: "Conversion failed."
                            status = ""
                        }
                        working = false
                    }
                },
            ) { Text(if (working) "Working…" else "Convert") }
            OutlinedButton(enabled = !working, onClick = {
                file = null
                output = null
                error = ""
                status = ""
            }) { Text("Reset") }
        }
        output?.text?.let { value ->
            Text(
                if (value.length > 12_000) value.take(12_000) + "\n\nPreview limited to 12,000 characters. Save the file to keep the full text." else value,
                modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (hasOutput) {
            OutlinedButton(
                enabled = !working,
                onClick = { saver.launch("$baseName.$outputExtension") },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save " + outputExtension.uppercase()) }
        }
        if (status.isNotBlank()) Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
    }
}

private fun readConverterFile(context: Context, uri: Uri): NativeBackendEngine.InputFile {
    val name = context.contentResolver.query(
        uri,
        arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
    )?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
        ?.takeIf { it.isNotBlank() } ?: "input"
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    val input = context.contentResolver.openInputStream(uri)
        ?: throw IOException("The selected file could not be opened.")
    val bytes = input.use { source ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val count = source.read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_NATIVE_CONVERTER_INPUT_BYTES) {
                throw IOException("The selected file exceeds the 200 MB local conversion limit.")
            }
            output.write(buffer, 0, count)
        }
        output.toByteArray()
    }
    return NativeBackendEngine.InputFile(name, mime, bytes)
}
