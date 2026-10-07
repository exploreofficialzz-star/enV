package com.chastech.env

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

internal data class AssistantChatMessage(val role: String, val content: String) {
    val isUser: Boolean get() = role == "user"
}

private const val ASSISTANT_MESSAGE_MAX = 3_000
private const val ASSISTANT_HISTORY_MAX = 12_000
private const val ASSISTANT_MESSAGE_COUNT_MAX = 12

@Composable
internal fun AssistantScreen(
    messages: List<AssistantChatMessage>,
    onMessagesChange: (List<AssistantChatMessage>) -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var draft by rememberSaveable { mutableStateOf("") }
    var consented by rememberSaveable { mutableStateOf(false) }
    var available by remember { mutableStateOf<Boolean?>(null) }
    var availabilityAttempt by remember { mutableIntStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableStateOf<Pair<List<AssistantChatMessage>, List<AssistantChatMessage>>?>(null) }
    var activeJob by remember { mutableStateOf<Job?>(null) }

    LaunchedEffect(availabilityAttempt) {
        available = null
        available = runCatching { NativeAiClient.availability(context)["assistant.chat"] == true }.getOrDefault(false)
    }
    LaunchedEffect(messages.size, sending) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(if (sending) messages.size else messages.lastIndex)
        }
    }

    fun boundedContext(conversation: List<AssistantChatMessage>): List<AssistantChatMessage> {
        val recent = mutableListOf<AssistantChatMessage>()
        var characters = 0
        for (message in conversation.asReversed().take(ASSISTANT_MESSAGE_COUNT_MAX)) {
            if (characters + message.content.length > ASSISTANT_HISTORY_MAX) break
            recent.add(message)
            characters += message.content.length
        }
        return recent.asReversed()
    }

    fun requestReply(history: List<AssistantChatMessage>, conversation: List<AssistantChatMessage>) {
        activeJob?.cancel()
        sending = true
        errorMessage = null
        retry = history to conversation
        activeJob = scope.launch {
            try {
                val input = JSONObject().put("messages", JSONArray().apply {
                    history.forEach { message ->
                        put(JSONObject().put("role", message.role).put("content", message.content))
                    }
                })
                val response = NativeAiClient.run(context, "assistant.chat", input)
                val reply = response.optString("reply").trim()
                if (reply.isBlank()) throw NativeAiClient.AiError("AI_PROVIDER_BAD_RESPONSE", "The assistant returned an empty reply.", true)
                onMessagesChange(conversation + AssistantChatMessage("assistant", reply))
                retry = null
            } catch (cancelled: CancellationException) {
                // A closed screen or replaced request should not become a visible error.
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
        if (content.isBlank() || content.length > ASSISTANT_MESSAGE_MAX || sending || available != true || !consented) return
        val conversation = messages + AssistantChatMessage("user", content)
        onMessagesChange(conversation)
        draft = ""
        requestReply(boundedContext(conversation), conversation)
    }

    Column(
        modifier = Modifier.fillMaxSize().imePadding().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("AI assistant", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text("Questions, planning, writing, and everyday work.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = {
                activeJob?.cancel()
                errorMessage = null
                retry = null
                draft = ""
                onMessagesChange(emptyList())
            }, enabled = messages.isNotEmpty() && !sending) { Text("New chat") }
        }

        Text(
            "Messages and recent context are sent to enV’s configured AI provider to generate replies. Avoid passwords and sensitive or confidential information. This chat is not saved to an account.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (available == null) {
            Text("Checking assistant availability…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (available == false) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("The AI assistant is not available on this server right now.", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { availabilityAttempt += 1 }) { Text("Check again") }
                }
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (messages.isEmpty()) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("How can I help?", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            Text("Choose a starting point or write your own message.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            FlowRow(horizontalArrangement = Arrangement.Center, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                listOf("Help me plan my day", "Explain a difficult idea", "Draft a professional email").forEach { prompt ->
                                    AssistChip(onClick = { draft = prompt }, label = { Text(prompt) }, enabled = !sending)
                                }
                            }
                        }
                    }
                }
            }
            itemsIndexed(messages) { index, message ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (message.isUser) Arrangement.End else Arrangement.Start) {
                    Card(
                        modifier = Modifier.fillMaxWidth(0.9f),
                        colors = CardDefaults.cardColors(containerColor = if (message.isUser) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Column(Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(if (message.isUser) "You" else "enV assistant", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            Text(message.content, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            if (sending) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text("Thinking…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        errorMessage?.let { message ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(message, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    retry?.let { pending -> TextButton(onClick = { requestReply(pending.first, pending.second) }, enabled = !sending) { Text("Retry") } }
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = consented, onCheckedChange = { consented = it }, enabled = available == true && !sending)
            Text("I agree that my message and recent chat context are sent to the configured AI provider.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it.take(ASSISTANT_MESSAGE_MAX) },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message the enV assistant…") },
                supportingText = { Text("${draft.length}/$ASSISTANT_MESSAGE_MAX") },
                minLines = 1,
                maxLines = 4,
                enabled = available == true && !sending,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Send),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { sendDraft() }),
                shape = RoundedCornerShape(14.dp),
            )
            Button(onClick = { sendDraft() }, enabled = draft.isNotBlank() && consented && available == true && !sending, modifier = Modifier.height(56.dp)) {
                Text("Send")
            }
        }
        Spacer(Modifier.height(2.dp))
        Text("AI responses can be inaccurate. Verify important information. Requests follow the service’s configured usage limits.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
    }
}
