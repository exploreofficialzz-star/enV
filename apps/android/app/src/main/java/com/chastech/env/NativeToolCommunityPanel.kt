package com.chastech.env

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

private data class NativeCommunityComment(
    val id: String,
    val parentId: String?,
    val body: String,
    val author: String,
    val isMine: Boolean,
)

private data class NativeCommunityFeed(
    val comments: List<NativeCommunityComment>,
    val commentCount: Int,
    val likes: Int,
    val dislikes: Int,
    val views: Int,
    val myReaction: String?,
)

private object NativeCommunityApi {
    private val base get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/')

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        require(base.startsWith("https://")) { "enV community requires a secure API connection." }
        val connection = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 25_000
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
            val envelope = runCatching { JSONObject(payload) }.getOrElse { JSONObject() }
            if (status !in 200..299 || !envelope.optBoolean("ok")) {
                throw IllegalStateException(envelope.optString("message").ifBlank { "Community service is unavailable (HTTP $status)." })
            }
            return envelope.optJSONObject("data") ?: JSONObject()
        } finally {
            connection.disconnect()
        }
    }

    fun feed(toolId: String, visitorId: String): NativeCommunityFeed {
        val data = request("/api/community?toolId=${java.net.URLEncoder.encode(toolId, "UTF-8")}&visitorId=${java.net.URLEncoder.encode(visitorId, "UTF-8")}")
        val counts = data.optJSONObject("counts") ?: JSONObject()
        val rows = data.optJSONArray("comments") ?: JSONArray()
        val comments = (0 until rows.length()).mapNotNull { index ->
            val item = rows.optJSONObject(index) ?: return@mapNotNull null
            NativeCommunityComment(
                id = item.optString("id"),
                parentId = item.optString("parentId").takeIf { it.isNotBlank() && it != "null" },
                body = item.optString("body"),
                author = item.optString("authorLabel", "Anonymous"),
                isMine = item.optBoolean("isMine"),
            )
        }
        return NativeCommunityFeed(
            comments = comments,
            commentCount = counts.optInt("comments"),
            likes = counts.optInt("likes"),
            dislikes = counts.optInt("dislikes"),
            views = counts.optInt("views"),
            myReaction = data.optString("myReaction").takeIf { it.isNotBlank() && it != "null" },
        )
    }

    fun post(path: String, payload: JSONObject): JSONObject = request(path, "POST", payload)
}

@Composable
fun NativeToolCommunityPanel(toolId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val visitorId = remember {
        val store = context.getSharedPreferences("env.community.identity", Context.MODE_PRIVATE)
        store.getString("visitor_id", null)?.takeIf { it.matches(Regex("[0-9a-fA-F-]{36}")) }
            ?: UUID.randomUUID().toString().also { store.edit().putString("visitor_id", it).apply() }
    }
    var feed by remember(toolId) { mutableStateOf<NativeCommunityFeed?>(null) }
    var loading by rememberSaveable(toolId) { mutableStateOf(true) }
    var enabled by remember(toolId) { mutableStateOf(true) }
    var sending by rememberSaveable(toolId) { mutableStateOf(false) }
    var commentText by rememberSaveable(toolId) { mutableStateOf("") }
    var publicIdentity by rememberSaveable(toolId) { mutableStateOf(false) }
    var displayName by rememberSaveable(toolId) { mutableStateOf("") }
    var replyTo by rememberSaveable(toolId) { mutableStateOf<String?>(null) }
    var reportMenuFor by remember { mutableStateOf<String?>(null) }
    var notice by remember(toolId) { mutableStateOf<String?>(null) }
    var error by remember(toolId) { mutableStateOf<String?>(null) }

    fun refresh() {
        scope.launch {
            loading = true
            try {
                val fresh = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
                feed = fresh
                error = null
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/view", JSONObject().put("toolId", toolId).put("visitorId", visitorId))
                }
            } catch (failure: Exception) {
                val message = failure.message ?: "Community is temporarily unavailable."
                if (message.contains("not enabled", ignoreCase = true)) enabled = false
                else error = message
            } finally { loading = false }
        }
    }

    LaunchedEffect(toolId) { refresh() }
    if (!enabled) return

    fun sendReaction(reaction: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/reactions", JSONObject().put("toolId", toolId).put("visitorId", visitorId).put("reaction", reaction))
                }
                refresh()
            } catch (failure: Exception) { error = failure.message ?: "Your reaction could not be saved." }
        }
    }

    fun report(commentId: String, reason: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/reports", JSONObject().put("commentId", commentId).put("visitorId", visitorId).put("reason", reason))
                }
                notice = "Report sent to the moderation team."
                reportMenuFor = null
            } catch (failure: Exception) { error = failure.message ?: "The report could not be sent." }
        }
    }

    fun block(commentId: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/blocks", JSONObject().put("commentId", commentId).put("visitorId", visitorId))
                }
                notice = "The author is now hidden from your view."
                refresh()
            } catch (failure: Exception) { error = failure.message ?: "The author could not be blocked." }
        }
    }

    fun delete(commentId: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/comments/delete", JSONObject().put("commentId", commentId).put("visitorId", visitorId))
                }
                notice = "Your comment was removed."
                refresh()
            } catch (failure: Exception) { error = failure.message ?: "The comment could not be removed." }
        }
    }

    fun submitComment() {
        if (commentText.isBlank() || sending || (publicIdentity && displayName.trim().length < 2)) return
        sending = true
        scope.launch {
            try {
                val payload = JSONObject()
                    .put("toolId", toolId)
                    .put("visitorId", visitorId)
                    .put("idempotencyKey", UUID.randomUUID().toString())
                    .put("body", commentText.trim())
                    .put("identityMode", if (publicIdentity) "public" else "anonymous")
                    .put("displayName", if (publicIdentity) displayName.trim() else JSONObject.NULL)
                    .put("parentId", replyTo ?: JSONObject.NULL)
                withContext(Dispatchers.IO) { NativeCommunityApi.post("/api/community/comments", payload) }
                commentText = ""
                replyTo = null
                notice = "Your comment was posted."
                refresh()
            } catch (failure: Exception) { error = failure.message ?: "Your comment could not be posted." }
            finally { sending = false }
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Community", style = MaterialTheme.typography.titleMedium)
                    Text("Discuss this tool with other users.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = ::refresh, enabled = !loading) { Text("Refresh") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { sendReaction("like") }) { Text("👍 ${feed?.likes ?: 0}") }
                OutlinedButton(onClick = { sendReaction("dislike") }) { Text("👎 ${feed?.dislikes ?: 0}") }
                Text("• ${feed?.views ?: 0} views", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (replyTo == null) "Join the discussion" else "Write a reply", style = MaterialTheme.typography.titleSmall)
                if (replyTo != null) {
                    TextButton(onClick = { replyTo = null }) { Text("Cancel reply") }
                }
                OutlinedTextField(
                    value = commentText,
                    onValueChange = { commentText = it.take(2000) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 6,
                    label = { Text("Your comment") },
                    placeholder = { Text("Keep it helpful and respectful…") },
                    supportingText = { Text("${commentText.length}/2000") },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { publicIdentity = !publicIdentity }) {
                        Text(if (publicIdentity) "Use a display name" else "Post anonymously")
                    }
                    if (publicIdentity) {
                        Text("Public label", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
                    }
                }
                if (publicIdentity) {
                    OutlinedTextField(
                        value = displayName,
                        onValueChange = { displayName = it.take(32) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("Display name") },
                    )
                }
                Button(
                    onClick = ::submitComment,
                    enabled = !sending && commentText.isNotBlank() && (!publicIdentity || displayName.trim().length >= 2),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (sending) "Posting…" else "Post comment") }
                Text(
                    "Anonymous hides your display name, not the private abuse-prevention record. Never post passwords or payment details.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (loading && feed == null) Text("Loading discussion…", style = MaterialTheme.typography.bodySmall)
            val current = feed
            if (current != null) {
                Text("${current.commentCount} comments", style = MaterialTheme.typography.titleSmall)
                val roots = current.comments.filter { it.parentId == null }
                if (roots.isEmpty()) Text("No comments yet. Start the discussion.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                roots.forEach { comment ->
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(comment.author, style = MaterialTheme.typography.labelMedium)
                        Text(comment.body, style = MaterialTheme.typography.bodyMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (comment.isMine) TextButton(onClick = { delete(comment.id) }) { Text("Remove") }
                            else {
                                TextButton(onClick = { replyTo = comment.id }) { Text("Reply") }
                                Box {
                                    TextButton(onClick = { reportMenuFor = comment.id }) { Text("Report") }
                                    DropdownMenu(expanded = reportMenuFor == comment.id, onDismissRequest = { reportMenuFor = null }) {
                                        listOf("spam", "harassment", "misinformation", "inappropriate", "other").forEach { reason ->
                                            DropdownMenuItem(text = { Text(reason.replaceFirstChar { it.uppercase() }) }, onClick = { report(comment.id, reason) })
                                        }
                                    }
                                }
                                TextButton(onClick = { block(comment.id) }) { Text("Block") }
                            }
                        }
                        current.comments.filter { it.parentId == comment.id }.forEach { reply ->
                            Column(
                                Modifier.fillMaxWidth().padding(start = 16.dp, top = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(reply.author, style = MaterialTheme.typography.labelSmall)
                                Text(reply.body, style = MaterialTheme.typography.bodySmall)
                                if (reply.isMine) TextButton(onClick = { delete(reply.id) }) { Text("Remove") }
                                else {
                                    Row {
                                        Box {
                                            TextButton(onClick = { reportMenuFor = reply.id }) { Text("Report") }
                                            DropdownMenu(expanded = reportMenuFor == reply.id, onDismissRequest = { reportMenuFor = null }) {
                                                listOf("spam", "harassment", "misinformation", "inappropriate", "other").forEach { reason ->
                                                    DropdownMenuItem(text = { Text(reason.replaceFirstChar { it.uppercase() }) }, onClick = { report(reply.id, reason) })
                                                }
                                            }
                                        }
                                        TextButton(onClick = { block(reply.id) }) { Text("Block") }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}
