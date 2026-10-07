package com.chastech.env

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.chastech.env.data.Catalog
import com.chastech.env.data.ToolRecord
import com.chastech.env.ui.EnVIcon
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

internal data class AssistantChatMessage(
    val role: String,
    val content: String,
    val recommendedToolIds: List<String> = emptyList(),
) {
    val isUser: Boolean get() = role == "user"
}

private data class PendingAssistantRequest(
    val history: List<AssistantChatMessage>,
    val conversation: List<AssistantChatMessage>,
    val candidates: List<ToolRecord>,
)

private data class ScoredTool(val tool: ToolRecord, val score: Int)
private const val ASSISTANT_MESSAGE_MAX = 3_000
private const val ASSISTANT_HISTORY_MAX = 12_000
private const val ASSISTANT_MESSAGE_COUNT_MAX = 12
private const val ASSISTANT_CANDIDATE_COUNT_MAX = 8

private val assistantSynonyms = mapOf(
    "photo" to listOf("image", "picture", "pic"), "picture" to listOf("image", "photo"), "pic" to listOf("image", "photo"),
    "img" to listOf("image"), "compress" to listOf("minify", "shrink", "optimize", "size"),
    "resize" to listOf("scale", "dimensions", "size"), "json" to listOf("javascript object"),
    "pwd" to listOf("password"), "pass" to listOf("password"), "bmi" to listOf("body mass", "weight"),
    "percent" to listOf("percentage", "%"), "qr" to listOf("qrcode", "barcode"), "uuid" to listOf("guid"),
    "hash" to listOf("checksum", "digest", "sha", "md5"), "color" to listOf("colour", "hex", "rgb"),
    "mockup" to listOf("fake", "demo", "chat", "screenshot"), "invoice" to listOf("bill", "receipt"),
    "pdf" to listOf("document"), "encode" to listOf("encoding", "base64"), "decode" to listOf("decoding"),
)

private fun assistantCandidates(catalog: Catalog, conversation: List<AssistantChatMessage>): List<ToolRecord> {
    val query = conversation.filter { it.role == "user" }.takeLast(3).joinToString(" ") { it.content }.trim().lowercase()
    if (query.isBlank()) return emptyList()
    val baseTokens = Regex("[^a-z0-9%+]+").split(query).filter { it.length > 1 || it == "%" }
    val tokens = (baseTokens + baseTokens.flatMap { assistantSynonyms[it].orEmpty() }).distinct()
    val ranked = catalog.tools.asSequence()
        .filter { it.status == "active" || it.status == "beta" }
        .mapNotNull { tool ->
            val name = tool.name.lowercase()
            val id = tool.id.lowercase()
            val score = when {
                name == query || id == query -> 2_000 + tool.popularity
                name.startsWith(query) -> 1_400 + tool.popularity
                name.contains(query) || id.contains(query) -> 1_000 + tool.popularity
                else -> {
                    val haystack = sequenceOf(tool.name, tool.description, tool.category, id).plus(tool.keywords.asSequence()).plus(tool.tags.asSequence()).joinToString(" ").lowercase()
                    var hits = 0
                    tokens.forEach { token ->
                        hits += when {
                            name.contains(token) -> 8
                            tool.keywords.any { it.lowercase().contains(token) } -> 5
                            haystack.contains(token) -> 2
                            else -> 0
                        }
                    }
                    if (hits == 0) return@mapNotNull null
                    hits * 40 + tool.popularity
                }
            }
            ScoredTool(tool, score)
        }
        .sortedWith(compareByDescending<ScoredTool> { it.score }.thenByDescending { it.tool.popularity }.thenBy { it.tool.name })
        .take(ASSISTANT_CANDIDATE_COUNT_MAX)
        .map { it.tool }
        .toList()
    return ranked
}

@Composable
internal fun AssistantScreen(
    catalog: Catalog,
    messages: List<AssistantChatMessage>,
    onMessagesChange: (List<AssistantChatMessage>) -> Unit,
    onTool: (String) -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val toolsById = remember(catalog) { catalog.tools.associateBy { it.id } }
    var draft by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableStateOf<PendingAssistantRequest?>(null) }
    var activeJob by remember { mutableStateOf<Job?>(null) }

    LaunchedEffect(messages.size, sending) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(if (sending) messages.size else messages.lastIndex)
    }

    fun boundedContext(conversation: List<AssistantChatMessage>): List<AssistantChatMessage> {
        val recent = mutableListOf<AssistantChatMessage>()
        var characters = 0
        for (message in conversation.asReversed().take(ASSISTANT_MESSAGE_COUNT_MAX)) {
            if (characters + message.content.length > ASSISTANT_HISTORY_MAX) break
            recent.add(message.copy(recommendedToolIds = emptyList()))
            characters += message.content.length
        }
        return recent.asReversed()
    }

    fun requestReply(request: PendingAssistantRequest) {
        activeJob?.cancel()
        sending = true
        errorMessage = null
        retry = request
        activeJob = scope.launch {
            try {
                val input = JSONObject().apply {
                    put("messages", JSONArray().apply {
                        request.history.forEach { message -> put(JSONObject().put("role", message.role).put("content", message.content)) }
                    })
                    put("candidates", JSONArray().apply {
                        request.candidates.forEach { tool ->
                            put(JSONObject().put("id", tool.id).put("name", tool.name).put("description", tool.description).put("category", tool.category))
                        }
                    })
                }
                val response = NativeAiClient.run(context, "assistant.chat", input)
                val reply = response.optString("reply").trim()
                if (reply.isBlank()) throw NativeAiClient.AiError("AI_PROVIDER_BAD_RESPONSE", "The assistant returned an empty reply.", true)
                val candidateIds = request.candidates.mapTo(mutableSetOf()) { it.id }
                val recommendations = NativeAiClient.toList(response, "recommendedToolIds").filter { it in candidateIds }
                onMessagesChange(request.conversation + AssistantChatMessage("assistant", reply, recommendations))
                retry = null
            } catch (cancelled: CancellationException) {
                // A cancelled request should not become a visible error.
            } catch (failure: Exception) {
                errorMessage = failure.message ?: "The assistant could not respond. Please try again."
            } finally {
                sending = false
                activeJob = null
            }
        }
    }

    fun sendDraft() {
        val content = draft.trim()
        if (content.isBlank() || content.length > ASSISTANT_MESSAGE_MAX || sending) return
        val conversation = messages + AssistantChatMessage("user", content)
        val history = boundedContext(conversation)
        val request = PendingAssistantRequest(history, conversation, assistantCandidates(catalog, history))
        onMessagesChange(conversation)
        draft = ""
        requestReply(request)
    }

    Column(
        modifier = Modifier.fillMaxSize().imePadding().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EnVIcon("Sparkles", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                Text("AI assistant", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = {
                activeJob?.cancel()
                activeJob = null
                sending = false
                errorMessage = null
                retry = null
                draft = ""
                onMessagesChange(emptyList())
            }, enabled = messages.isNotEmpty() && !sending) { Text("New chat") }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (messages.isEmpty()) {
                item {
                    Text("What can I help with?", modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            itemsIndexed(messages) { _, message ->
                val tools = if (message.isUser) emptyList() else message.recommendedToolIds.mapNotNull { id -> toolsById[id]?.takeIf { it.status != "planned" } }
                Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.isUser) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Card(
                        modifier = Modifier.fillMaxWidth(0.92f),
                        colors = CardDefaults.cardColors(containerColor = if (message.isUser) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(if (message.isUser) "You" else "enV", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            Text(message.content, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    tools.forEach { tool -> AssistantRecommendationCard(tool) { onTool(tool.id) } }
                }
            }
            if (sending) item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text("Thinking…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { activeJob?.cancel() }) { Text("Stop") }
                }
            }
        }

        errorMessage?.let { message ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(message, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    retry?.let { pending -> TextButton(onClick = { requestReply(pending) }, enabled = !sending) { Text("Retry") } }
                }
            }
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it.take(ASSISTANT_MESSAGE_MAX) },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Ask about enV tools or the brand…") },
                minLines = 1,
                maxLines = 4,
                enabled = !sending,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { sendDraft() }),
                shape = RoundedCornerShape(14.dp),
            )
            Button(onClick = { sendDraft() }, enabled = draft.isNotBlank() && !sending, modifier = Modifier.height(56.dp)) { Text("Send") }
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun AssistantRecommendationCard(tool: ToolRecord, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(0.92f).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            EnVIcon(tool.icon, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface)
            Column(Modifier.weight(1f)) {
                Text(tool.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            }
            EnVIcon("ArrowRight", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
