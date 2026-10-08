package com.chastech.env

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun NativeAiToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var available by remember(tool.id) { mutableStateOf<Boolean?>(null) }
    var working by remember(tool.id) { mutableStateOf(false) }
    var error by remember(tool.id) { mutableStateOf("") }
    var output by remember(tool.id) { mutableStateOf("") }
    var consent by remember(tool.id) { mutableStateOf(false) }
    var topic by remember(tool.id) { mutableStateOf(if (tool.id.contains("caption") || tool.id == "title-generator" || tool.id == "idea-generator") "AI tools for creators" else if (tool.id == "prompt-generator") "Create a launch plan for a digital product" else if (tool.id == "bio-generator") "AI music creator" else if (tool.id == "product-description-generator") "AI Music Generator Class" else if (tool.id == "resume-bullet-generator") "Managed social media content and improved engagement" else if (tool.id == "rewrite-helper") "We are launching a new product that helps people create useful content faster." else "") }
    var resultMetric by remember(tool.id) { mutableStateOf(if (tool.id == "resume-bullet-generator") "increased engagement" else "") }
    var features by remember(tool.id) { mutableStateOf(if (tool.id == "product-description-generator") "Beginner friendly\nWorks from a smartphone\nUses accessible tools" else "") }
    var audience by remember(tool.id) { mutableStateOf("creators and small businesses") }
    var tone by remember(tool.id) { mutableStateOf("friendly") }
    var language by remember(tool.id) { mutableStateOf("en") }
    var variants by remember(tool.id) { mutableStateOf(if (tool.id == "title-generator") "8" else if (tool.id.contains("title") || tool.id.contains("caption")) "5" else "3") }
    var includeHashtags by remember(tool.id) { mutableStateOf(true) }
    var pattern by remember(tool.id) { mutableStateOf("") }
    var flags by remember(tool.id) { mutableStateOf("") }
    var sampleText by remember(tool.id) { mutableStateOf("") }
    var sql by remember(tool.id) { mutableStateOf("") }
    var dialect by remember(tool.id) { mutableStateOf("generic") }
    var json by remember(tool.id) { mutableStateOf("") }
    var goal by remember(tool.id) { mutableStateOf("describe") }
    var contextText by remember(tool.id) { mutableStateOf("") }
    var style by remember(tool.id) { mutableStateOf("concise") }
    var selectedFile by remember(tool.id) { mutableStateOf<NativeBackendEngine.InputFile?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) readFile(context, uri)?.let { selectedFile = it }
    }

    LaunchedEffect(tool.id) {
        if (!NativeAiEngine.isLocalCaption(tool.id) && !NativeAiEngine.isLocalPrompt(tool.id) && !NativeAiEngine.isLocalBio(tool.id) && !NativeAiEngine.isLocalTitle(tool.id) && !NativeAiEngine.isLocalProduct(tool.id) && !NativeAiEngine.isLocalIdea(tool.id) && !NativeAiEngine.isLocalResume(tool.id) && !NativeAiEngine.isLocalRewrite(tool.id)) available = runCatching { NativeAiClient.availability(context)[NativeAiEngine.taskFor(tool.id)] == true }.getOrDefault(false)
    }

    val task = NativeAiEngine.taskFor(tool.id) ?: return
    val localCaption = NativeAiEngine.isLocalCaption(tool.id)
    val localPrompt = NativeAiEngine.isLocalPrompt(tool.id)
    val localBio = NativeAiEngine.isLocalBio(tool.id)
    val localTitle = NativeAiEngine.isLocalTitle(tool.id)
    val localProduct = NativeAiEngine.isLocalProduct(tool.id)
    val localIdea = NativeAiEngine.isLocalIdea(tool.id)
    val localResume = NativeAiEngine.isLocalResume(tool.id)
    val localRewrite = NativeAiEngine.isLocalRewrite(tool.id)
    val localDeterministic = localCaption || localPrompt || localBio || localTitle || localProduct || localIdea || localResume || localRewrite
    val needsConsent = tool.id == "json-validator" || tool.id == "alt-text-generator" || tool.id == "video-audio-extractor"
    val isFileTool = tool.id == "alt-text-generator" || tool.id == "video-audio-extractor"
    val buttonEnabled = !working && (localDeterministic || available == true) && (!needsConsent || consent) && (!isFileTool || selectedFile != null) && when {
        tool.id in setOf("regex-tester") -> pattern.isNotBlank()
        tool.id == "sql-formatter" -> sql.isNotBlank()
        tool.id == "json-validator" -> json.isNotBlank()
        else -> topic.isNotBlank() || isFileTool
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Text(if (localDeterministic) "Runs locally with deterministic templates" else "AI assistance · native Kotlin → enV AI API", style = MaterialTheme.typography.labelLarge)
        when {
            tool.id == "rewrite-helper" -> {
                NativeAiField("Text", topic) { topic = it }
                NativeAiField("Tone", tone) { tone = it }
            }
            tool.id == "resume-bullet-generator" -> {
                NativeAiField("Duty / responsibility", topic) { topic = it }
                NativeAiField("Result or metric (optional)", resultMetric) { resultMetric = it }
                NativeAiField("Tone", tone) { tone = it }
            }
            tool.id == "idea-generator" -> {
                NativeAiField("Topic / subject", topic) { topic = it }
                NativeAiField("Audience", audience) { audience = it }
                NativeAiField("Tone", tone) { tone = it }
                NativeAiField("Goal", goal) { goal = it }
            }
            tool.id == "product-description-generator" -> {
                NativeAiField("Product name", topic) { topic = it }
                NativeAiField("Features / benefits", features) { features = it }
                NativeAiField("Audience", audience) { audience = it }
                NativeAiField("Tone", tone) { tone = it }
            }
            tool.id == "prompt-generator" -> {
                NativeAiField("Task", topic) { topic = it }
                NativeAiField("Audience", audience) { audience = it }
                NativeAiField("Tone", tone) { tone = it }
            }
            tool.id == "bio-generator" -> {
                NativeAiField("Role / what you do", topic) { topic = it }
                NativeAiField("Audience", audience) { audience = it }
                NativeAiField("Tone", tone) { tone = it }
                NativeAiField("Options", variants) { variants = it }
            }
            tool.id in setOf("instagram-caption-generator","tiktok-caption-generator","x-caption-generator","youtube-caption-generator","linkedin-caption-generator","facebook-caption-generator","caption-generator","youtube-title-generator","tiktok-title-generator","instagram-title-generator","podcast-title-generator","title-generator") -> {
                NativeAiField("Topic", topic) { topic = it }
                if (localCaption) NativeAiField("Audience", audience) { audience = it }
                NativeAiField("Tone", tone) { tone = it }
                NativeAiField("Language", language) { language = it }
                NativeAiField("Options", variants) { variants = it }
                if (tool.id.contains("caption")) {
                    androidx.compose.material3.Checkbox(checked = includeHashtags, onCheckedChange = { includeHashtags = it })
                    Text("Include hashtags", style = MaterialTheme.typography.bodyMedium)
                }
            }
            tool.id == "regex-tester" -> { NativeAiField("Pattern", pattern) { pattern = it }; NativeAiField("Flags", flags) { flags = it }; NativeAiField("Sample text (optional)", sampleText) { sampleText = it } }
            tool.id == "sql-formatter" -> { NativeAiField("SQL", sql) { sql = it }; NativeAiField("Dialect", dialect) { dialect = it } }
            tool.id == "json-validator" -> { NativeAiField("JSON", json) { json = it }; NativeAiField("Focus", goal) { goal = it } }
            tool.id == "alt-text-generator" -> { OutlinedButton(onClick = { picker.launch(arrayOf("image/jpeg","image/png","image/webp")) }) { Text(selectedFile?.name ?: "Choose image") }; NativeAiField("Page context (optional)", contextText) { contextText = it }; NativeAiField("Style", style) { style = it }; NativeAiField("Language", language) { language = it } }
            tool.id == "video-audio-extractor" -> { OutlinedButton(onClick = { picker.launch(arrayOf("audio/*")) }) { Text(selectedFile?.name ?: "Choose audio") }; NativeAiField("Language code (optional)", language) { language = it } }
        }
        if (needsConsent) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                androidx.compose.material3.Checkbox(checked = consent, onCheckedChange = { consent = it })
                Text("I understand this input is sent to an external AI service.", style = MaterialTheme.typography.bodySmall)
            }
        }
        if (!localDeterministic && available == false) Text("AI is currently unavailable on this deployment. The local/native tool still works.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = buttonEnabled, onClick = {
                error = ""; output = ""; working = true
                if (localDeterministic) {
                    output = when { localCaption -> NativeAiEngine.localCaption(mapOf("topic" to topic, "audience" to audience, "count" to variants.toIntOrNull())); localPrompt -> NativeAiEngine.localPrompt(mapOf("task" to topic, "audience" to audience, "tone" to tone)); localBio -> NativeAiEngine.localBio(mapOf("role" to topic, "audience" to audience, "count" to variants.toIntOrNull())); localTitle -> NativeAiEngine.localTitle(mapOf("topic" to topic, "audience" to audience, "count" to variants.toIntOrNull())); localProduct -> NativeAiEngine.localProduct(mapOf("product" to topic, "features" to features, "audience" to audience, "tone" to tone)); localIdea -> NativeAiEngine.localIdea(mapOf("topic" to topic, "audience" to audience)); localResume -> NativeAiEngine.localResume(mapOf("duty" to topic, "result" to resultMetric)); else -> NativeAiEngine.localRewrite(mapOf("text" to topic, "tone" to tone)) }
                    working = false
                    return@Button
                }
                scope.launch {
                    runCatching {
                        val preparedFile = selectedFile?.let { when(tool.id) { "alt-text-generator" -> withContext(Dispatchers.Default) { NativeAiClient.prepareImage(it) }; "video-audio-extractor" -> NativeAiClient.prepareAudio(it); else -> it } }
                        val values = mutableMapOf<String, Any?>("topic" to topic, "tone" to tone, "language" to language, "variants" to variants.toIntOrNull(), "includeHashtags" to includeHashtags, "pattern" to pattern, "flags" to flags, "sampleText" to sampleText, "sql" to sql, "dialect" to dialect, "json" to json, "goal" to goal, "context" to contextText, "style" to style)
                        if (preparedFile != null) values[if (tool.id == "alt-text-generator") "image" else "audio"] = NativeAiClient.fileInput(preparedFile)
                        val result = withContext(Dispatchers.IO) { NativeAiClient.run(context, task, NativeAiEngine.buildInput(tool, values)) }
                        NativeAiEngine.formatResult(task, result)
                    }.fold({ output = it; working = false }, { error = it.message ?: "AI request failed."; working = false })
                }
            }) { Text(if (working) "Working…" else "Generate") }
            OutlinedButton(onClick = { topic=when { localCaption || localTitle || localIdea -> "AI tools for creators"; localPrompt -> "Create a launch plan for a digital product"; localBio -> "AI music creator"; localProduct -> "AI Music Generator Class"; localResume -> "Managed social media content and improved engagement"; localRewrite -> "We are launching a new product that helps people create useful content faster."; else -> "" }; resultMetric=if (localResume) "increased engagement" else ""; features=if (localProduct) "Beginner friendly\nWorks from a smartphone\nUses accessible tools" else ""; goal=if (localIdea) "Educate and give the reader a practical next step" else goal; audience="creators and small businesses"; pattern="";sql="";json="";output="";error="";selectedFile=null }) { Text("Reset") }
        }
        if (output.isNotBlank()) Text(output, style = MaterialTheme.typography.bodyMedium)
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.padding(1.dp))
        Text("AI output can be wrong. Review it before you use it. Native deterministic tools remain available offline.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NativeAiField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), minLines = if (label in setOf("SQL","JSON","Sample text (optional)","Pattern","Topic")) 2 else 1)
}

private fun readFile(context: Context, uri: android.net.Uri): NativeBackendEngine.InputFile? = runCatching {
    val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "upload.bin"
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
    NativeBackendEngine.InputFile(name, mime, bytes)
}.getOrNull()
