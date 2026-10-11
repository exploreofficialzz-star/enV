package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp

@Composable
fun NativeEventToolForm(toolId: String) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var values by remember(toolId) { mutableStateOf(NativeEventEngine.initialValues(toolId)) }
    var output by remember(toolId) { mutableStateOf("") }
    var error by remember(toolId) { mutableStateOf("") }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(NativeEventEngine.mimeType(toolId))) { uri ->
        if (uri != null) {
            runCatching {
                val stream = context.contentResolver.openOutputStream(uri) ?: throw IllegalStateException("Unable to open the selected file.")
                stream.use { it.write(output.toByteArray(Charsets.UTF_8)) }
            }.onFailure { error = it.message ?: "Could not save the event output." }
        }
    }
    val operation = NativeEventEngine.templateFor(toolId)?.operation
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text(
            if (operation == NativeEventEngine.Operation.RSVP || operation == NativeEventEngine.Operation.CHECK_IN)
                "Static HTML template only. It does not publish a page, collect RSVP responses, or record live check-ins."
            else "Runs locally. Date and time are kept exactly as entered; no time-zone conversion or calendar service is used.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        NativeEventEngine.fieldsFor(toolId).forEach { field ->
            OutlinedTextField(
                value = values[field.name] ?: field.defaultValue,
                onValueChange = { values = values + (field.name to it) },
                label = { Text(field.label) },
                modifier = Modifier.fillMaxWidth(),
                minLines = if (field.multiline) 3 else 1,
                maxLines = if (field.multiline) 6 else 1,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                runCatching { NativeEventEngine.generate(toolId, values) }
                    .onSuccess { output = it; error = "" }
                    .onFailure { output = ""; error = it.message ?: "Could not generate the event template." }
            }) { Text("Generate") }
            OutlinedButton(onClick = { values = NativeEventEngine.initialValues(toolId); output = ""; error = "" }) { Text("Reset") }
            if (output.isNotEmpty()) {
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(output)) }) { Text("Copy output") }
                OutlinedButton(onClick = { saveLauncher.launch(NativeEventEngine.fileName(toolId)) }) { Text("Save output") }
            }
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
        if (output.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(output, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
