package com.chastech.env

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.chastech.env.NativeBackendEngine.InputFile
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class AssistKind { TEXT, TEXTAREA, NUMBER, SELECT, CHECKBOX, IMAGE, AUDIO }
private data class AssistOption(val value: String, val label: String)
private data class AssistField(
    val name: String,
    val label: String,
    val kind: AssistKind,
    val required: Boolean = false,
    val maxLength: Int? = null,
    val min: Int? = null,
    val max: Int? = null,
    val placeholder: String? = null,
    val help: String? = null,
    val monospace: Boolean = false,
    val preserveWhitespace: Boolean = false,
    val options: List<AssistOption> = emptyList(),
    val default: Any? = null,
    val accept: String? = null,
)
private data class AssistFeature(
    val toolId: String,
    val title: String,
    val description: String,
    val action: String,
    val resultKind: String,
    val fields: List<AssistField>,
    val requiresConsent: Boolean = false,
    val consentLabel: String? = null,
)
private data class AssistExport(val text: String)

private object NativeAiAssistFeatures {
    private val tones = listOf("friendly", "professional", "playful", "bold", "inspirational", "witty").map { AssistOption(it, it.replaceFirstChar { char -> char.uppercase() }) }
    private val languages = listOf(AssistOption("en", "English"), AssistOption("fr", "French"), AssistOption("es", "Spanish"), AssistOption("pt", "Portuguese"))
    private val topic = AssistField("topic", "What is it about?", AssistKind.TEXTAREA, required = true, maxLength = 600, placeholder = "Describe the post, video or product in a sentence or two.")
    private val tone = AssistField("tone", "Tone", AssistKind.SELECT, options = tones, default = "friendly")
    private val language = AssistField("language", "Language", AssistKind.SELECT, options = languages, default = "en")
    private val features: List<AssistFeature> = buildList {
        fun caption(id: String, where: String) = AssistFeature(
            id, "Write captions with AI", "Get caption ideas for $where. The generator above keeps working without AI.",
            "Generate captions", "creator.caption.generate",
            listOf(topic, tone, language,
                AssistField("variants", "How many options?", AssistKind.NUMBER, min = 1, max = 5, default = "3"),
                AssistField("includeHashtags", "Include hashtags", AssistKind.CHECKBOX, default = true)),
        )
        fun title(id: String, where: String) = AssistFeature(
            id, "Get title ideas with AI", "Get title ideas for $where. The generator above keeps working without AI.",
            "Suggest titles", "creator.title.generate",
            listOf(topic, tone, language, AssistField("variants", "How many options?", AssistKind.NUMBER, min = 1, max = 8, default = "5")),
        )
        add(caption("instagram-caption-generator", "Instagram"))
        add(caption("tiktok-caption-generator", "TikTok"))
        add(caption("x-caption-generator", "X"))
        add(caption("youtube-caption-generator", "YouTube"))
        add(caption("linkedin-caption-generator", "LinkedIn"))
        add(caption("facebook-caption-generator", "Facebook"))
        add(caption("caption-generator", "social posts"))
        add(title("youtube-title-generator", "YouTube videos"))
        add(title("tiktok-title-generator", "TikTok videos"))
        add(title("instagram-title-generator", "Instagram posts"))
        add(title("podcast-title-generator", "podcast episodes"))
        add(title("title-generator", "videos, posts and articles"))
        add(AssistFeature(
            "regex-tester", "Explain this regex with AI", "Get a plain-language explanation and common pitfalls. The explanation is AI-written and may be wrong, so confirm it with the tester above.",
            "Explain pattern", "developer.regex.explain",
            listOf(
                AssistField("pattern", "Pattern", AssistKind.TEXT, required = true, maxLength = 1000, placeholder = "^[\\w.+-]+@[\\w-]+\\.[\\w.]+$", monospace = true, preserveWhitespace = true),
                AssistField("flags", "Flags", AssistKind.TEXT, maxLength = 8, placeholder = "gi", monospace = true),
                AssistField("sampleText", "Sample text (optional)", AssistKind.TEXTAREA, maxLength = 2000, preserveWhitespace = true),
            ),
        ))
        add(AssistFeature(
            "sql-formatter", "Explain this SQL with AI", "Get a clause-by-clause explanation and risk warnings. The statement is never executed.",
            "Explain SQL", "developer.sql.explain",
            listOf(
                AssistField("sql", "SQL statement", AssistKind.TEXTAREA, required = true, maxLength = 6000, monospace = true),
                AssistField("dialect", "Dialect", AssistKind.SELECT, options = listOf("generic", "postgresql", "mysql", "sqlite", "sqlserver").map { AssistOption(it, it.replaceFirstChar(Char::uppercase)) }, default = "generic"),
            ),
        ))
        add(AssistFeature(
            "json-validator", "Describe this JSON with AI", "Get a summary of the structure and likely issues. Secret-looking values are masked before sending, but avoid pasting real personal data.",
            "Describe JSON", "developer.json.explain",
            listOf(
                AssistField("json", "JSON", AssistKind.TEXTAREA, required = true, maxLength = 20000, monospace = true),
                AssistField("goal", "Focus", AssistKind.SELECT, options = listOf(AssistOption("describe", "Describe"), AssistOption("find-issues", "Find issues")), default = "describe"),
            ),
            true, "I understand this JSON is sent to an external AI service.",
        ))
        add(AssistFeature(
            "alt-text-generator", "Write alt text from an image with AI", "Upload an image and get alt text plus a longer description. Large images are shrunk in your browser first. Review the result before publishing.",
            "Write alt text", "image.alt.generate",
            listOf(
                AssistField("image", "Image", AssistKind.IMAGE, required = true, accept = "image/jpeg,image/png,image/webp", help = "JPEG, PNG or WebP."),
                AssistField("context", "Page context (optional)", AssistKind.TEXT, maxLength = 300, placeholder = "Where will this image appear?"),
                AssistField("style", "Style", AssistKind.SELECT, options = listOf(AssistOption("concise", "Concise"), AssistOption("descriptive", "Descriptive")), default = "concise"),
                language,
            ),
            true, "I understand this image is sent to an external AI service.",
        ))
        add(AssistFeature(
            "video-audio-extractor", "Transcribe audio with AI", "Upload a short audio clip (up to about 2.8 MB) to get a transcript with timestamps. Longer recordings are not supported yet. Extract and compress the audio first.",
            "Transcribe", "video.transcript.generate",
            listOf(
                AssistField("audio", "Audio file", AssistKind.AUDIO, required = true, accept = "audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac", help = "MP3, M4A, WAV, WebM, OGG or FLAC, up to 2.8 MB."),
                AssistField("language", "Language code (optional)", AssistKind.TEXT, maxLength = 3, placeholder = "auto-detect", help = "Two letters, for example en or fr."),
            ),
            true, "I understand this recording is sent to an external AI service.",
        ))
    }
    fun feature(toolId: String): AssistFeature? = features.firstOrNull { it.toolId == toolId }
    fun ids(): Set<String> = features.mapTo(linkedSetOf()) { it.toolId }
}

fun hasNativeAiAssist(toolId: String): Boolean = NativeAiAssistFeatures.feature(toolId) != null

@Composable
fun NativeAiAssistPanel(tool: ToolRecord) {
    val feature = NativeAiAssistFeatures.feature(tool.id) ?: return
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var available by remember(feature.toolId) { mutableStateOf(false) }
    var values by remember(feature.toolId) { mutableStateOf(feature.fields.associate { field -> field.name to (field.default ?: "") }) }
    var consent by remember(feature.toolId) { mutableStateOf(false) }
    var selectedFile by remember(feature.toolId) { mutableStateOf<InputFile?>(null) }
    var preparing by remember(feature.toolId) { mutableStateOf(false) }
    var working by remember(feature.toolId) { mutableStateOf(false) }
    var error by remember(feature.toolId) { mutableStateOf("") }
    var notice by remember(feature.toolId) { mutableStateOf("") }
    var result by remember(feature.toolId) { mutableStateOf<org.json.JSONObject?>(null) }
    var resultWarnings by remember(feature.toolId) { mutableStateOf<List<String>>(emptyList()) }
    var currentHandle by remember(feature.toolId) { mutableStateOf<NativeAiClient.RequestHandle?>(null) }
    var requestJob by remember(feature.toolId) { mutableStateOf<Job?>(null) }
    val task = NativeAiEngine.taskFor(tool.id) ?: return

    var pendingExport by remember(feature.toolId) { mutableStateOf<AssistExport?>(null) }
    fun persistExport(uri: Uri?) {
        val target = uri ?: return
        val export = pendingExport ?: return
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(target)?.use { it.write(export.text.toByteArray(Charsets.UTF_8)) }
                        ?: error("Could not save the transcript file.")
                }
            }.onFailure { notice = it.message ?: "Could not save the transcript file." }
        }
    }
    val txtExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { persistExport(it) }
    val srtExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/x-subrip")) { persistExport(it) }
    val vttExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/vtt")) { persistExport(it) }

    LaunchedEffect(task) { available = runCatching { NativeAiClient.availability(context)[task] == true }.getOrDefault(false) }

    val fileField = feature.fields.firstOrNull { it.kind == AssistKind.IMAGE || it.kind == AssistKind.AUDIO }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null && fileField != null) {
            notice = ""; error = ""; selectedFile = null; preparing = true
            scope.launch {
                runCatching {
                    withContext(Dispatchers.IO) {
                        val raw = readAssistFile(context, uri) ?: error("That file could not be read.")
                        when (fileField.kind) {
                            AssistKind.IMAGE -> NativeAiClient.prepareImage(raw)
                            AssistKind.AUDIO -> NativeAiClient.prepareAudio(raw)
                            else -> raw
                        }
                    }
                }.fold({ selectedFile = it }, { notice = it.message ?: "That file could not be prepared." })
                preparing = false
            }
        }
    }
    if (!available) return

    val validation = validateAssist(feature, values, selectedFile)
    val blocked = validation != null || (feature.requiresConsent && !consent) || working || preparing
    val panelPadding = if (LocalConfiguration.current.screenWidthDp >= 640) 24.dp else 16.dp
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(32.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(panelPadding), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("✦", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
                Text(feature.title, style = MaterialTheme.typography.titleMedium)
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(99.dp)) { Text("AI", modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text(feature.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val columns = if (maxWidth >= 640.dp) 2 else 1
                val fields = feature.fields.filter { it.kind != AssistKind.CHECKBOX }
                val fieldRows = if (columns == 1) fields.map { listOf(it) } else {
                    val rows = mutableListOf<List<AssistField>>()
                    val regularRow = mutableListOf<AssistField>()
                    fields.forEach { field ->
                        val fullWidth = field.kind in setOf(AssistKind.TEXTAREA, AssistKind.IMAGE, AssistKind.AUDIO)
                        if (fullWidth) {
                            if (regularRow.isNotEmpty()) { rows += regularRow.toList(); regularRow.clear() }
                            rows += listOf(field)
                        } else {
                            regularRow += field
                            if (regularRow.size == columns) { rows += regularRow.toList(); regularRow.clear() }
                        }
                    }
                    if (regularRow.isNotEmpty()) rows += regularRow.toList()
                    rows
                }
                fieldRows.forEach { rowFields ->
                    val fullWidth = rowFields.size == 1 && rowFields.first().kind in setOf(AssistKind.TEXTAREA, AssistKind.IMAGE, AssistKind.AUDIO)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        rowFields.forEach { field ->
                            Box(if (columns == 2 && !fullWidth) Modifier.weight(1f) else Modifier.fillMaxWidth()) {
                                NativeAiAssistField(
                                    field = field,
                                    value = values[field.name] ?: "",
                                    file = if (field.kind == AssistKind.IMAGE || field.kind == AssistKind.AUDIO) selectedFile else null,
                                    preparing = preparing,
                                    onValue = { next -> values = values + (field.name to next); error = "" },
                                    onPick = { picker.launch(if (field.kind == AssistKind.IMAGE) arrayOf("image/jpeg", "image/png", "image/webp") else arrayOf("audio/*")) },
                                )
                            }
                        }
                        if (columns == 2 && rowFields.size == 1 && !fullWidth) Spacer(Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
            feature.fields.filter { it.kind == AssistKind.CHECKBOX }.forEach { field ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = values[field.name] as? Boolean ?: false, onCheckedChange = { values = values + (field.name to it) })
                    Text(field.label, style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (feature.requiresConsent) {
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = consent, onCheckedChange = { consent = it })
                    Text(feature.consentLabel ?: "I understand my input is sent to an external AI service.", modifier = Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodySmall)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (working) OutlinedButton(onClick = { currentHandle?.cancel(); requestJob?.cancel(); currentHandle = null; requestJob = null; working = false }) { Text("Cancel") }
                else Button(enabled = !blocked, onClick = {
                    val issue = validateAssist(feature, values, selectedFile)
                    if (issue != null) { notice = issue; return@Button }
                    notice = ""; error = ""; result = null; resultWarnings = emptyList(); working = true
                    val handle = NativeAiClient.RequestHandle(); currentHandle = handle
                    requestJob = scope.launch {
                        try {
                            val inputValues = values.toMutableMap()
                            inputValues["variants"] = (inputValues["variants"]?.toString()?.toIntOrNull() ?: if (feature.resultKind == "creator.title.generate") 5 else 3)
                            if (selectedFile != null && fileField != null) inputValues[if (fileField.kind == AssistKind.IMAGE) "image" else "audio"] = NativeAiClient.fileInput(selectedFile!!)
                            val json = NativeAiEngine.buildInput(tool, inputValues)
                            val response = withContext(Dispatchers.IO) { NativeAiClient.runWithMetadata(context, task, json, handle) }
                            result = response.result
                            resultWarnings = response.warnings
                        } catch (cancelled: CancellationException) {
                            // Cancellation is an idle transition, matching the web task hook.
                        } catch (failure: Throwable) {
                            error = (failure as? NativeAiClient.AiError)?.let { api -> api.message + (api.retryAfterSeconds?.let { " Try again in about $it seconds." } ?: "") }
                                ?: failure.message ?: "Something went wrong. The local tool still works."
                        } finally {
                            working = false; currentHandle = null; requestJob = null
                        }
                    }
                }) {
                    Text(if (result != null) "Try again" else feature.action)
                }
                if (working || preparing) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Text(if (preparing) "Preparing your file…" else "Working on it. This can take up to a minute.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text("AI-assisted. Nothing is sent until you press the button; then your input goes to an external AI service to produce the result. AI can be wrong, so review it before you use it. Use is limited per person and per day to keep it available for everyone.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (notice.isNotBlank()) Text(notice, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            result?.let { response ->
                NativeAiAssistResult(task, response, resultWarnings, clipboard) { kind, text ->
                    when (kind) {
                        "txt" -> { pendingExport = AssistExport(text); txtExporter.launch("transcript.txt") }
                        "srt" -> { pendingExport = AssistExport(text); srtExporter.launch("transcript.srt") }
                        else -> { pendingExport = AssistExport(text); vttExporter.launch("transcript.vtt") }
                    }
                }
            }
            // Keep the inline first-fix validation identical to the browser's feature schema.
            validation?.let { issue -> Text(issue, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun NativeAiAssistField(
    field: AssistField,
    value: Any,
    file: InputFile?,
    preparing: Boolean,
    onValue: (Any) -> Unit,
    onPick: () -> Unit,
) {
    var expanded by remember(field.name) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
        when (field.kind) {
            AssistKind.TEXT, AssistKind.TEXTAREA -> {
                val text = value as? String ?: ""
                OutlinedTextField(
                    value = text,
                    onValueChange = { next -> onValue(field.maxLength?.let { next.take(it) } ?: next) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(field.label + if (field.required) " *" else "") },
                    placeholder = field.placeholder?.let { placeholder -> { Text(placeholder) } },
                    minLines = if (field.kind == AssistKind.TEXTAREA) 4 else 1,
                    maxLines = if (field.kind == AssistKind.TEXTAREA) 8 else 1,
                    singleLine = field.kind == AssistKind.TEXT,
                    keyboardOptions = if (field.monospace) KeyboardOptions(keyboardType = KeyboardType.Ascii) else KeyboardOptions.Default,
                    textStyle = if (field.monospace) MaterialTheme.typography.bodyMedium.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace) else MaterialTheme.typography.bodyMedium,
                )
            }
            AssistKind.NUMBER -> OutlinedTextField(
                value = value as? String ?: "",
                onValueChange = { next -> onValue(next.filter { it.isDigit() }.take(4)) },
                modifier = Modifier.fillMaxWidth(), label = { Text(field.label) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
                    AssistKind.SELECT -> Box {
                val selected = value as? String ?: field.options.firstOrNull()?.value.orEmpty()
                OutlinedTextField(value = field.options.firstOrNull { it.value == selected }?.label ?: selected, onValueChange = {}, readOnly = true, modifier = Modifier.fillMaxWidth(), label = { Text(field.label) }, trailingIcon = { Text("▾") })
                Box(Modifier.matchParentSize().padding(top = 22.dp).clickableNoRipple { expanded = true })
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    field.options.forEach { option -> DropdownMenuItem(text = { Text(option.label) }, onClick = { onValue(option.value); expanded = false }) }
                }
            }
            AssistKind.CHECKBOX -> Unit
            AssistKind.IMAGE, AssistKind.AUDIO -> {
                OutlinedButton(onClick = onPick, modifier = Modifier.fillMaxWidth()) { Text(file?.name ?: "Choose ${if (field.kind == AssistKind.IMAGE) "image" else "audio"}") }
                if (preparing) Text("Preparing your file…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (file != null) Text("${file.name} · ${(file.bytes.size / 1_000_000.0).let { String.format("%.1f", it) }} MB ready to send", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        field.help?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)

private fun validateAssist(feature: AssistFeature, values: Map<String, Any?>, file: InputFile?): String? {
    for (field in feature.fields) {
        val value = values[field.name]
        if (field.kind == AssistKind.IMAGE || field.kind == AssistKind.AUDIO) {
            if (field.required && file == null) return "Choose a file for \"${field.label}\"."
            continue
        }
        if (field.kind == AssistKind.CHECKBOX) continue
        val text = value?.toString().orEmpty()
        if (field.required && text.trim().isEmpty()) return "${field.label} is required."
        if (field.maxLength != null && text.length > field.maxLength) return "${field.label} is too long (maximum ${field.maxLength} characters)."
        if (field.kind == AssistKind.NUMBER && text.isNotEmpty()) {
            val number = text.toDoubleOrNull()
            if (number == null || (field.min != null && number < field.min) || (field.max != null && number > field.max)) return "${field.label} must be between ${field.min ?: 0} and ${field.max ?: 99}."
        }
    }
    return null
}

private fun readAssistFile(context: Context, uri: Uri): InputFile? = runCatching {
    val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: "upload.bin"
    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
    InputFile(name, mime, bytes)
}.getOrNull()

@Composable
private fun NativeAiAssistResult(
    task: String,
    result: org.json.JSONObject,
    warnings: List<String>,
    clipboard: androidx.compose.ui.platform.ClipboardManager,
    onExport: (String, String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        when (task) {
            "creator.caption.generate" -> {
                val variants = result.optJSONArray("variants")
                if (variants == null || variants.length() == 0) Text("No captions were returned.", style = MaterialTheme.typography.bodyMedium)
                else for (index in 0 until variants.length()) {
                    val variant = variants.optJSONObject(index) ?: continue
                    val original = variant.optString("caption")
                    var caption by remember(result.toString(), index) { mutableStateOf(original) }
                    val tags = variant.optJSONArray("hashtags")?.let { array -> (0 until array.length()).joinToString(" ") { "#${array.optString(it)}" } }.orEmpty()
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(10.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(10.dp)) {
                            OutlinedTextField(caption, { caption = it }, modifier = Modifier.fillMaxWidth(), minLines = 3, label = { Text("Caption ${index + 1}") })
                            if (tags.isNotEmpty()) Text(tags, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("${caption.length} characters", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(caption + if (tags.isEmpty()) "" else "\n\n$tags")) }) { Text("Copy") }
                            }
                        }
                    }
                }
            }
            "creator.title.generate" -> {
                val titles = result.optJSONArray("titles")
                if (titles == null || titles.length() == 0) Text("No titles were returned.", style = MaterialTheme.typography.bodyMedium)
                else for (index in 0 until titles.length()) {
                    val title = titles.optString(index)
                    Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(title, style = MaterialTheme.typography.bodyMedium)
                            Text("${title.length} characters", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(onClick = { clipboard.setText(AnnotatedString(title)) }) { Text("Copy") }
                    }
                }
            }
            "video.transcript.generate" -> {
                val transcript = result.optString("text")
                val segments = result.optJSONArray("segments")
                OutlinedTextField(transcript.ifEmpty { "No speech was detected." }, {}, modifier = Modifier.fillMaxWidth(), readOnly = true, minLines = 6, label = { Text("Transcript") })
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { clipboard.setText(AnnotatedString(transcript)) }, enabled = transcript.isNotEmpty()) { Text("Copy") }
                        OutlinedButton(onClick = { onExport("txt", transcript) }, enabled = transcript.isNotEmpty()) { Text("Download .txt") }
                    }
                    if (segments != null && segments.length() > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { onExport("srt", assistSubtitleExport(segments, false)) }) { Text("Download .srt") }
                            OutlinedButton(onClick = { onExport("vtt", assistSubtitleExport(segments, true)) }) { Text("Download .vtt") }
                        }
                    }
                }
                result.optString("language").takeIf { it.isNotBlank() && it != "null" }?.let { Text("Detected language: $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            "developer.regex.explain" -> {
                Text(result.optString("summary"), style = MaterialTheme.typography.bodyMedium)
                val parts = result.optJSONArray("parts")
                AssistResultSection("Breakdown", (0 until (parts?.length() ?: 0)).mapNotNull { index -> parts?.optJSONObject(index)?.let { "${it.optString("token")} — ${it.optString("meaning")}" } }, clipboard)
                val pitfalls = result.optJSONArray("pitfalls")
                AssistResultSection("Watch out for", (0 until (pitfalls?.length() ?: 0)).mapNotNull { pitfalls?.optString(it) }, clipboard)
                val tests = result.optJSONArray("suggestedTests")
                AssistResultSection("Suggested examples (AI guesses, not verified)", (0 until (tests?.length() ?: 0)).mapNotNull { index -> tests?.optJSONObject(index)?.let { "${it.optString("input").ifEmpty { "(empty)" }} — ${if (it.optBoolean("shouldMatch")) "should match" else "should not match"}" } }, clipboard)
                if (tests != null && tests.length() > 0) Text("Try these in the regex tester above before relying on them.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            "developer.sql.explain" -> {
                Text(result.optString("summary"), style = MaterialTheme.typography.bodyMedium)
                val steps = result.optJSONArray("steps")
                AssistResultSection("Step by step", (0 until (steps?.length() ?: 0)).mapNotNull { index -> steps?.optJSONObject(index)?.let { "${index + 1}. ${it.optString("clause")} — ${it.optString("explanation")}" } }, clipboard)
                val warnings = result.optJSONArray("warnings")
                AssistResultSection("Warnings", (0 until (warnings?.length() ?: 0)).mapNotNull { warnings?.optString(it) }, clipboard)
                val notes = result.optJSONArray("performanceNotes")
                AssistResultSection("Performance notes", (0 until (notes?.length() ?: 0)).mapNotNull { notes?.optString(it) }, clipboard)
            }
            "developer.json.explain" -> {
                Text(result.optString("summary"), style = MaterialTheme.typography.bodyMedium)
                val structure = result.optJSONArray("structure")
                AssistResultSection("Structure", (0 until (structure?.length() ?: 0)).mapNotNull { index -> structure?.optJSONObject(index)?.let { "${it.optString("path")} · ${it.optString("type")}${it.optString("note").takeIf { note -> note.isNotEmpty() }?.let { note -> " — $note" }.orEmpty()}" } }, clipboard)
                val issues = result.optJSONArray("issues")
                AssistResultSection("Possible issues", (0 until (issues?.length() ?: 0)).mapNotNull { issues?.optString(it) }, clipboard)
            }
            "image.alt.generate" -> {
                val alt = result.optString("altText")
                AssistResultSection("Alt text", listOf(alt), clipboard)
                Text("${alt.length} characters", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AssistResultSection("Longer description", listOf(result.optString("longDescription")), clipboard)
                if (result.optBoolean("containsText")) AssistResultSection("Text found in the image", listOf(result.optString("textInImage")), clipboard)
            }
            else -> {
                val output = NativeAiEngine.formatResult(task, result).ifBlank { "No result was returned." }
                Text(output, style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(output)) }) { Text("Copy") }
            }
        }
        if (warnings.isNotEmpty()) Text(warnings.joinToString(" "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AssistResultSection(title: String, entries: List<String>, clipboard: androidx.compose.ui.platform.ClipboardManager) {
    if (entries.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        entries.forEach { entry ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Text("• $entry", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(entry)) }) { Text("Copy") }
            }
        }
    }
}

private fun assistSubtitleExport(segments: org.json.JSONArray, webVtt: Boolean): String = buildString {
    if (webVtt) append("WEBVTT\n\n")
    for (index in 0 until segments.length()) {
        val segment = segments.optJSONObject(index) ?: continue
        if (!webVtt) append(index + 1).append('\n')
        append(assistSubtitleTime(segment.optDouble("start"), webVtt)).append(" --> ").append(assistSubtitleTime(segment.optDouble("end"), webVtt)).append('\n')
        append(segment.optString("text")).append("\n\n")
    }
}

private fun assistSubtitleTime(seconds: Double, webVtt: Boolean): String {
    val millis = (seconds.coerceAtLeast(0.0) * 1000).toLong()
    val hours = millis / 3_600_000; val minutes = (millis % 3_600_000) / 60_000; val secs = (millis % 60_000) / 1000; val ms = millis % 1000
    return java.lang.String.format(java.util.Locale.US, "%02d:%02d:%02d%s%03d", hours, minutes, secs, if (webVtt) "." else ",", ms)
}
