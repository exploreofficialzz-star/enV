package com.chastech.env

import com.chastech.env.billing.OfflineWalletNativeApi

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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

private data class NativeCommunityIdentityState(val signedIn: Boolean, val displayName: String?)

private fun compactCommunityCount(value: Int): String {
    val count = value.coerceAtLeast(0).toLong()
    if (count < 1_000) return count.toString()
    val divisor = if (count >= 1_000_000) 1_000_000.0 else 1_000.0
    val suffix = if (count >= 1_000_000) "M" else "K"
    val rounded = kotlin.math.round((count / divisor) * 10.0) / 10.0
    val number = if (rounded % 1.0 == 0.0) rounded.toLong().toString()
        else String.format(java.util.Locale.US, "%.1f", rounded)
    return number + suffix
}

private object NativeCommunityApi {
    private val base get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
    @Volatile private var bearerToken: String? = null

    fun configureAuth(token: String?) { bearerToken = token }

    fun identity(): NativeCommunityIdentityState {
        val data = request("/api/community/identity")
        return NativeCommunityIdentityState(
            signedIn = data.optBoolean("signedIn"),
            displayName = data.optString("displayName").takeIf { it.isNotBlank() && it != "null" },
        )
    }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        require(base.startsWith("https://")) { "enV engagement requires a secure API connection." }
        val connection = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 25_000
            setRequestProperty("Accept", "application/json")
            bearerToken?.let { setRequestProperty("Authorization", "Bearer $it") }
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
                throw IllegalStateException(envelope.optString("message").ifBlank { "Engagement is unavailable (HTTP $status)." })
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
    var showComments by rememberSaveable(toolId) { mutableStateOf(false) }
    var commentText by rememberSaveable(toolId) { mutableStateOf("") }
    var publicIdentity by rememberSaveable(toolId) { mutableStateOf(false) }
    var accountSignedIn by rememberSaveable(toolId) { mutableStateOf(false) }
    var identityLoading by rememberSaveable(toolId) { mutableStateOf(true) }
    var identityMenuOpen by remember { mutableStateOf(false) }
    var displayName by rememberSaveable(toolId) { mutableStateOf("") }
    var replyTo by rememberSaveable(toolId) { mutableStateOf<String?>(null) }
    var reportMenuFor by remember { mutableStateOf<String?>(null) }
    var notice by remember(toolId) { mutableStateOf<String?>(null) }
    var error by remember(toolId) { mutableStateOf<String?>(null) }
    val accountBearerToken = remember { OfflineWalletNativeApi.communityBearerToken(context) }

    fun refresh() {
        scope.launch {
            loading = true
            try {
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/view", JSONObject().put("toolId", toolId).put("visitorId", visitorId))
                }
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
                error = null
            } catch (failure: Exception) {
                val message = failure.message ?: "Engagement is temporarily unavailable."
                if (message.contains("not enabled", ignoreCase = true)) enabled = false
                else error = message
            } finally { loading = false }
        }
    }

    LaunchedEffect(toolId) {
        NativeCommunityApi.configureAuth(accountBearerToken)
        try {
            val identity = withContext(Dispatchers.IO) { NativeCommunityApi.identity() }
            accountSignedIn = identity.signedIn
            displayName = identity.displayName.orEmpty()
            publicIdentity = identity.signedIn
        } catch (_: Exception) {
            accountSignedIn = false
            displayName = ""
            publicIdentity = false
        } finally {
            identityLoading = false
        }
        refresh()
    }
    if (!enabled) return

    fun sendReaction(reaction: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/reactions", JSONObject().put("toolId", toolId).put("visitorId", visitorId).put("reaction", reaction))
                }
                NativeAnalytics.record(context, "reaction_created", toolId, "success")
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
                error = null
            } catch (failure: Exception) { error = failure.message ?: "Your reaction could not be saved." }
        }
    }

    fun report(commentId: String, reason: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/reports", JSONObject().put("commentId", commentId).put("visitorId", visitorId).put("reason", reason))
                }
                notice = "Report sent."
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
                notice = "Author hidden."
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
            } catch (failure: Exception) { error = failure.message ?: "The author could not be blocked." }
        }
    }

    fun delete(commentId: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    NativeCommunityApi.post("/api/community/comments/delete", JSONObject().put("commentId", commentId).put("visitorId", visitorId))
                }
                notice = "Comment removed."
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
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
                NativeAnalytics.record(context, "comment_created", toolId, "success")
                commentText = ""
                replyTo = null
                notice = "Comment posted."
                feed = withContext(Dispatchers.IO) { NativeCommunityApi.feed(toolId, visitorId) }
                error = null
            } catch (failure: Exception) { error = failure.message ?: "Your comment could not be posted." }
            finally { sending = false }
        }
    }

    val current = feed
    val roots = current?.comments?.filter { it.parentId == null }.orEmpty()

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { sendReaction("like") },
                    enabled = !loading,
                    modifier = Modifier.weight(1f),
                    shape = CircleShape,
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 12.dp),
                ) { Text("👍 ${compactCommunityCount(current?.likes ?: 0)}", maxLines = 1, style = MaterialTheme.typography.labelLarge, color = if (current?.myReaction == "like") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) }
                OutlinedButton(
                    onClick = {
                        showComments = true
                        refresh()
                    },
                    modifier = Modifier.weight(1f),
                    shape = CircleShape,
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 12.dp),
                ) { Text("💬 ${compactCommunityCount(current?.commentCount ?: 0)}", maxLines = 1, style = MaterialTheme.typography.labelLarge) }
                OutlinedButton(
                    onClick = { sendReaction("dislike") },
                    enabled = !loading,
                    modifier = Modifier.weight(1f),
                    shape = CircleShape,
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 12.dp),
                ) { Text("👎 ${compactCommunityCount(current?.dislikes ?: 0)}", maxLines = 1, style = MaterialTheme.typography.labelLarge, color = if (current?.myReaction == "dislike") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) }
            }
            if (error != null && !showComments) {
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    if (showComments) {
        Dialog(
            onDismissRequest = { showComments = false; replyTo = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                modifier = Modifier.fillMaxSize().imePadding(),
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(18.dp),
            ) {
                Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text("Comments", style = MaterialTheme.typography.titleLarge)
                            Text("${compactCommunityCount(current?.commentCount ?: 0)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Row {
                            TextButton(onClick = ::refresh, enabled = !loading) { Text("Refresh") }
                            TextButton(onClick = { showComments = false; replyTo = null }) { Text("Close") }
                        }
                    }
                    if (loading && current == null) {
                        Text("Loading…", style = MaterialTheme.typography.bodySmall)
                    }
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (roots.isEmpty() && !loading) {
                            item { Text("No comments yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        items(roots, key = { it.id }) { comment ->
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(comment.author, style = MaterialTheme.typography.labelMedium)
                                Text(comment.body, style = MaterialTheme.typography.bodyMedium)
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    if (comment.isMine) {
                                        TextButton(onClick = { delete(comment.id) }) { Text("Remove") }
                                    } else {
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
                                current?.comments?.filter { it.parentId == comment.id }?.forEach { reply ->
                                    Column(Modifier.fillMaxWidth().padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(reply.author, style = MaterialTheme.typography.labelSmall)
                                        Text(reply.body, style = MaterialTheme.typography.bodySmall)
                                        if (reply.isMine) TextButton(onClick = { delete(reply.id) }) { Text("Remove") }
                                    }
                                }
                            }
                        }
                    }
                    replyTo?.let {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Replying to a comment", style = MaterialTheme.typography.labelSmall)
                            TextButton(onClick = { replyTo = null }) { Text("Cancel") }
                        }
                    }
                    Text(
                        "Comments are public and may appear in search results. Do not include private information.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = commentText,
                        onValueChange = { commentText = it.take(2000) },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        label = { Text(if (replyTo == null) "Write a comment" else "Write a reply") },
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box {
                            TextButton(onClick = { identityMenuOpen = true }, enabled = !identityLoading) {
                                Text(
                                    when {
                                        publicIdentity && accountSignedIn -> "Display as ${displayName.ifBlank { "enV member" }}"
                                        publicIdentity -> "Display name"
                                        else -> "Anonymous"
                                    },
                                    maxLines = 1,
                                )
                            }
                            DropdownMenu(expanded = identityMenuOpen, onDismissRequest = { identityMenuOpen = false }) {
                                if (accountSignedIn) {
                                    DropdownMenuItem(
                                        text = { Text("Display as ${displayName.ifBlank { "enV member" }}") },
                                        onClick = { publicIdentity = true; identityMenuOpen = false },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Anonymous") },
                                        onClick = { publicIdentity = false; identityMenuOpen = false },
                                    )
                                } else {
                                    DropdownMenuItem(
                                        text = { Text("Anonymous") },
                                        onClick = { publicIdentity = false; identityMenuOpen = false },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Display name") },
                                        onClick = { publicIdentity = true; identityMenuOpen = false },
                                    )
                                }
                            }
                        }
                        if (publicIdentity && !accountSignedIn) {
                            OutlinedTextField(
                                value = displayName,
                                onValueChange = { displayName = it.take(32) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                label = { Text("Display name") },
                            )
                        } else {
                            Spacer(Modifier.weight(1f))
                        }
                        Button(
                            onClick = ::submitComment,
                            enabled = !sending && !identityLoading && commentText.isNotBlank() && (!publicIdentity || accountSignedIn || displayName.trim().length >= 2),
                        ) { Text(if (sending) "Posting…" else "Post") }
                    }
                    notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}
