package com.chastech.env

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeGameProjectCodec
import com.chastech.env.ui.EnVTheme
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** A native player for projects made in the web 3D studio. Editing remains on the web. */
class NativeGamePreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { EnVTheme { GamePreviewScreen() } }
    }

    private fun readProject(uri: Uri): String {
        val output = ByteArrayOutputStream()
        contentResolver.openInputStream(uri)?.use { input ->
            val buffer = ByteArray(16 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                require(output.size().toLong() + count <= NativeGameProjectCodec.MAX_PROJECT_BYTES) {
                    "Project files must be 100 MB or smaller."
                }
                output.write(buffer, 0, count)
            }
        } ?: error("Could not open the selected project.")
        return output.toString(Charsets.UTF_8.name())
    }

    private fun prepareProject(json: String) {
        val normalized = NativeGameProjectCodec.encode(NativeGameProjectCodec.decode(json))
        val directory = File(filesDir, "game-preview")
        check(directory.isDirectory || directory.mkdirs()) { "Could not prepare the preview." }
        val temporary = File(directory, "project.tmp")
        temporary.writeText(normalized, Charsets.UTF_8)
        check(temporary.renameTo(File(directory, "project.json"))) { "Could not save the preview." }
    }

    @Composable
    private fun GamePreviewScreen() {
        val scope = rememberCoroutineScope()
        var busy by remember { mutableStateOf(false) }
        var notice by remember { mutableStateOf("") }
        var presetIndex by remember { mutableStateOf(0) }
        val presets = listOf("starter" to "Starter world", "courtyard" to "Courtyard explorer", "gallery" to "Gallery room")
        fun play(source: () -> String) {
            scope.launch {
                busy = true
                notice = "Preparing preview…"
                runCatching { withContext(Dispatchers.IO) { prepareProject(source()) } }
                    .onSuccess {
                        runCatching { startActivity(Intent(this@NativeGamePreviewActivity, NativeGameRuntimeActivity::class.java)) }
                            .onSuccess { notice = "" }
                            .onFailure { notice = it.message ?: "Could not start the game preview." }
                    }
                    .onFailure { notice = it.message ?: "Could not open this project." }
                busy = false
            }
        }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) play { readProject(uri) }
        }
        @Composable fun PresetPicker() {
            Row(Modifier.fillMaxWidth()) {
                TextButton(onClick = { presetIndex = (presetIndex + presets.size - 1) % presets.size }, enabled = !busy,
                    modifier = Modifier.semantics { contentDescription = "Previous preset" }) { Text("‹") }
                Text(presets[presetIndex].second, modifier = Modifier.weight(1f).padding(top = 12.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelLarge)
                TextButton(onClick = { presetIndex = (presetIndex + 1) % presets.size }, enabled = !busy,
                    modifier = Modifier.semantics { contentDescription = "Next preset" }) { Text("›") }
            }
        }
        fun playPreset() {
            val selected = presets[presetIndex].first
            play { assets.open("game-presets/$selected.json").bufferedReader(Charsets.UTF_8).use { it.readText() } }
        }
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val compact = maxHeight < 420.dp
                Column(Modifier.fillMaxSize().padding(if (compact) 8.dp else 16.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 8.dp)) {
                    if (compact) {
                        Row(Modifier.fillMaxWidth()) {
                            Text("enV  /  Artboard Studio", modifier = Modifier.weight(1f).padding(top = 8.dp), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            TextButton(onClick = { finish() }) { Text("Back") }
                        }
                    } else {
                        Text("enV  /  Artboard Studio", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    }
                    if (compact) {
                        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Play your world", style = MaterialTheme.typography.titleMedium)
                                Text("Open a project exported from enV 3D Studio, or choose a preset.", style = MaterialTheme.typography.bodySmall)
                                if (notice.isNotBlank()) Text(notice, style = MaterialTheme.typography.bodySmall)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Button(onClick = { picker.launch(arrayOf("application/json", "text/plain", "*/*")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Open project") }
                                PresetPicker()
                                OutlinedButton(onClick = { playPreset() }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Play preset") }
                            }
                        }
                    } else {
                        Text("Play your world", style = MaterialTheme.typography.headlineSmall)
                        Text("Open a project exported from enV 3D Studio, or choose a preset.", style = MaterialTheme.typography.bodyMedium)
                        if (notice.isNotBlank()) Text(notice, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.weight(1f))
                        Button(onClick = { picker.launch(arrayOf("application/json", "text/plain", "*/*")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Open project") }
                        PresetPicker()
                        OutlinedButton(onClick = { playPreset() }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Play preset") }
                        OutlinedButton(onClick = { finish() }, modifier = Modifier.fillMaxWidth()) { Text("Back") }
                    }
                }
            }
        }
    }
}
