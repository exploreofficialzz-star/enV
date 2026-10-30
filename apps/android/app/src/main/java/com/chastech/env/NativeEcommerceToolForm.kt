package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

@Composable
fun NativeEcommerceToolForm(toolId: String) {
    val context = LocalContext.current
    val fields = remember(toolId) { NativeEcommerceEngine.fieldsFor(toolId) }
    var values by rememberSaveable(toolId) { mutableStateOf(NativeEcommerceEngine.initialValues(toolId)) }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    var outputFileName by rememberSaveable(toolId) { mutableStateOf("") }
    val saveOutputLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain"),
    ) { uri ->
        if (uri != null) {
            runCatching {
                val stream = context.contentResolver.openOutputStream(uri)
                    ?: throw IllegalStateException("Could not open the selected file for writing.")
                stream.use { it.write(output.toByteArray(Charsets.UTF_8)) }
            }.fold(
                onSuccess = { Toast.makeText(context, "Saved $outputFileName", Toast.LENGTH_SHORT).show() },
                onFailure = { failure -> error = failure.message ?: "Could not save the output file." },
            )
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "Runs on this Android device. No store or carrier account is connected by this local tool.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        fields.forEach { field ->
            OutlinedTextField(
                value = values[field.key] ?: field.defaultValue,
                onValueChange = { values = values + (field.key to it) },
                label = { Text(field.label) },
                modifier = Modifier.fillMaxWidth(),
                minLines = if (field.multiline) 3 else 1,
                maxLines = if (field.multiline) 6 else 1,
                singleLine = !field.multiline,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                runCatching { NativeEcommerceEngine.execute(toolId, values) }.fold(
                    { result -> output = result.text; outputFileName = result.fileName; error = "" },
                    { failure -> output = ""; outputFileName = ""; error = failure.message ?: "Unable to run this E-commerce operation." },
                )
            }) { Text("Run") }
            OutlinedButton(onClick = {
                values = NativeEcommerceEngine.initialValues(toolId)
                output = ""
                outputFileName = ""
                error = ""
            }) { Text("Reset") }
            if (output.isNotBlank()) {
                OutlinedButton(onClick = {
                    context.getSystemService(ClipboardManager::class.java)
                        ?.setPrimaryClip(ClipData.newPlainText("enV E-commerce output", output))
                }) { Text("Copy") }
                OutlinedButton(onClick = { saveOutputLauncher.launch(outputFileName.ifBlank { "env-$toolId.txt" }) }) {
                    Text("Save")
                }
            }
        }
        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        if (output.isNotBlank()) {
            Text(outputFileName, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(
                    output,
                    modifier = Modifier.padding(14.dp).heightIn(min = 64.dp, max = 440.dp).verticalScroll(rememberScrollState()),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
            }
        }
    }
}
