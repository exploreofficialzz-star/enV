package com.chastech.env

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.lingala.zip4j.io.outputstream.ZipOutputStream
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.CompressionMethod
import java.io.IOException
import java.security.MessageDigest
import java.util.Locale

private data class WorkspaceFile(val path: String, val file: DocumentFile) {
    val name: String get() = file.name ?: path.substringAfterLast('/')
    val size: Long get() = file.length().coerceAtLeast(0L)
}
private data class WorkspaceLine(val label: String, val detail: String = "")

private fun workspaceName(context: Context, uri: Uri): String =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }?.takeIf { it.isNotBlank() } ?: (uri.lastPathSegment ?: "file")

private fun workspaceGroup(name: String): String = when (name.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
    "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic", "bmp", "tif", "tiff" -> "Images"
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus" -> "Audio"
    "mp4", "mov", "mkv", "webm", "avi", "m4v" -> "Video"
    "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "xls", "xlsx", "ppt", "pptx" -> "Documents"
    "zip", "7z", "rar", "tar", "gz", "bz2", "xz", "zst" -> "Archives"
    "js", "ts", "tsx", "jsx", "html", "htm", "css", "json", "xml", "yaml", "yml", "toml", "py", "kt", "swift", "java", "c", "cpp", "h", "sh", "sql" -> "Code"
    else -> "Other"
}
private fun isWorkspaceText(name: String): Boolean = name.substringAfterLast('.', "").lowercase(Locale.ROOT) in setOf(
    "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "html", "htm",
    "css", "js", "mjs", "ts", "tsx", "jsx", "sql", "log", "ini", "toml", "sh", "properties", "conf", "cfg"
)
private fun scanWorkspaceFolder(root: DocumentFile): List<WorkspaceFile> {
    val result = mutableListOf<WorkspaceFile>()
    val stack = ArrayDeque<Pair<DocumentFile, String>>()
    stack.add(root to "")
    while (stack.isNotEmpty()) {
        val (directory, prefix) = stack.removeLast()
        for (child in directory.listFiles()) {
            val name = child.name?.takeIf { it.isNotBlank() } ?: continue
            val path = if (prefix.isEmpty()) name else prefix + "/" + name
            if (child.isDirectory) stack.add(child to path)
            else if (child.isFile) {
                result.add(WorkspaceFile(path, child))
                if (result.size > 100_000) throw IOException("This folder has more than 100,000 files. Select a smaller folder.")
            }
        }
    }
    return result
}
private fun workspaceHash(context: Context, file: DocumentFile): String {
    val digest = MessageDigest.getInstance("SHA-256")
    context.contentResolver.openInputStream(file.uri)?.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
        }
    } ?: throw IOException("Could not read " + (file.name ?: "a selected file") + ".")
    return digest.digest().joinToString("") { "%02x".format(it) }
}
private fun workspaceUniqueName(parent: DocumentFile, requested: String): String {
    if (parent.findFile(requested) == null) return requested
    val dot = requested.lastIndexOf('.').takeIf { it > 0 } ?: requested.length
    val base = requested.substring(0, dot)
    val ext = requested.substring(dot)
    for (n in 2..10000) {
        val candidate = base + " (" + n + ")" + ext
        if (parent.findFile(candidate) == null) return candidate
    }
    throw IOException("A safe unused filename could not be created.")
}
private fun copyWorkspaceFile(context: Context, source: DocumentFile, parent: DocumentFile) {
    val name = workspaceUniqueName(parent, source.name ?: "file")
    val target = parent.createFile(source.type ?: "application/octet-stream", name)
        ?: throw IOException("Could not create " + name + ".")
    context.contentResolver.openInputStream(source.uri)?.use { input ->
        context.contentResolver.openOutputStream(target.uri, "w")?.use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                output.write(buffer, 0, count)
            }
            output.flush()
        } ?: throw IOException("Could not write " + name + ".")
    } ?: throw IOException("Could not read " + (source.name ?: "a selected file") + ".")
}

@Composable
fun NativeFileWorkspaceScreen(toolId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selected by remember(toolId) { mutableStateOf<List<Uri>>(emptyList()) }
    var folderUri by remember(toolId) { mutableStateOf<Uri?>(null) }
    var secondFolderUri by remember(toolId) { mutableStateOf<Uri?>(null) }
    var prefix by remember(toolId) { mutableStateOf("") }
    var suffix by remember(toolId) { mutableStateOf("") }
    var find by remember(toolId) { mutableStateOf("") }
    var replacement by remember(toolId) { mutableStateOf("") }
    var query by remember(toolId) { mutableStateOf("") }
    var busy by remember(toolId) { mutableStateOf(false) }
    var status by remember(toolId) { mutableStateOf("") }
    var error by remember(toolId) { mutableStateOf("") }
    var rows by remember(toolId) { mutableStateOf<List<WorkspaceLine>>(emptyList()) }

    val pickFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        selected = uris
        rows = emptyList()
        error = ""
        status = if (uris.isEmpty()) "" else uris.size.toString() + " files selected."
    }
    val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) { folderUri = uri; rows = emptyList(); error = ""; status = "Folder selected." }
    }
    val pickSecondFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) { secondFolderUri = uri; rows = emptyList(); error = ""; status = "Second folder selected." }
    }
    val pickOrganizerDestination = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null && toolId == "file-organizer") {
            val sources = selected
            scope.launch {
                busy = true
                error = ""
                status = "Copying files into type folders…"
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val root = DocumentFile.fromTreeUri(context, uri) ?: throw IOException("The destination folder is unavailable.")
                        var copied = 0
                        for (sourceUri in sources) {
                            val name = workspaceName(context, sourceUri)
                            val group = workspaceGroup(name)
                            val folder = root.findFile(group) ?: root.createDirectory(group)
                                ?: throw IOException("Could not create the " + group + " folder.")
                            val source = DocumentFile.fromSingleUri(context, sourceUri) ?: throw IOException("A selected file is unavailable.")
                            copyWorkspaceFile(context, source, folder)
                            copied += 1
                        }
                        copied.toString() + " organized copies saved. Original files were not moved or deleted."
                    }
                }
                result.onSuccess { status = it; selected = emptyList() }
                    .onFailure { error = it.message ?: "File organization failed."; status = "" }
                busy = false
            }
        }
    }
    val saveRenamedZip = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null && selected.isNotEmpty()) {
            val sources = selected
            val pfx = prefix
            val sfx = suffix
            val old = find
            val new = replacement
            scope.launch {
                busy = true
                error = ""
                status = "Creating renamed copies…"
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val output = context.contentResolver.openOutputStream(uri, "w")
                            ?: throw IOException("Could not open the ZIP destination.")
                        val used = mutableSetOf<String>()
                        ZipOutputStream(output).use { zip ->
                            sources.forEachIndexed { index, sourceUri ->
                                val source = DocumentFile.fromSingleUri(context, sourceUri)
                                    ?: throw IOException("A selected file is unavailable.")
                                val original = source.name ?: ("file-" + (index + 1))
                                val dot = original.lastIndexOf('.').takeIf { it > 0 } ?: original.length
                                val base = original.substring(0, dot)
                                val ext = original.substring(dot)
                                val changed = if (old.isEmpty()) base else base.replace(old, new)
                                val raw = pfx + (index + 1).toString().padStart(3, '0') + "-" + changed + sfx + ext
                                var name = raw.replace(Regex("[\\\\u0000-\\\\u001f<>:\"/\\\\\\\\|?*]"), "_").trimEnd('.', ' ')
                                if (name.isBlank()) name = "file-" + (index + 1)
                                val candidateBase = name.substringBeforeLast('.', name)
                                val candidateExt = name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else "." + it }
                                var candidate = name
                                var collision = 2
                                while (!used.add(candidate.lowercase(Locale.ROOT))) {
                                    candidate = candidateBase + " (" + collision + ")" + candidateExt
                                    collision += 1
                                }
                                zip.putNextEntry(ZipParameters().apply {
                                    fileNameInZip = candidate
                                    compressionMethod = CompressionMethod.DEFLATE
                                })
                                context.contentResolver.openInputStream(sourceUri)?.use { input ->
                                    val buffer = ByteArray(64 * 1024)
                                    while (true) {
                                        val count = input.read(buffer)
                                        if (count < 0) break
                                        zip.write(buffer, 0, count)
                                    }
                                } ?: throw IOException("Could not read " + original + ".")
                                zip.closeEntry()
                            }
                        }
                        "Renamed copies exported to ZIP. Original filenames are unchanged."
                    }
                }
                result.onSuccess { status = it; selected = emptyList() }
                    .onFailure { error = it.message ?: "The renamed archive could not be created."; status = "" }
                busy = false
            }
        }
    }

    val title = when (toolId) {
        "file-organizer" -> "File Organizer"
        "batch-file-renamer" -> "Batch File Renamer"
        "duplicate-file-finder" -> "Duplicate File Finder"
        "folder-size-analyzer" -> "Folder Size Analyzer"
        "file-search" -> "File Search"
        else -> "File & Folder Compare"
    }
    val description = when (toolId) {
        "file-organizer" -> "Copy files into clear type-based folders. Original files are never moved or deleted."
        "batch-file-renamer" -> "Preview consistent names and export renamed copies."
        "duplicate-file-finder" -> "Find identical files using streaming SHA-256 verification."
        "folder-size-analyzer" -> "Review folder size, file-type totals and the largest files."
        "file-search" -> "Search filenames and supported text contents without typing shell commands."
        else -> "Compare two folders and verify identical files using SHA-256."
    }

    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Local processing · Uses files and folders you explicitly select", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        when (toolId) {
            "file-compare" -> {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { if (!busy) pickFolder.launch(null) }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("First folder") }
                    OutlinedButton(onClick = { if (!busy) pickSecondFolder.launch(null) }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Second folder") }
                }
                NativeExecutionButton(onAuthorized = {
                    val leftUri = folderUri
                    val rightUri = secondFolderUri
                    if (leftUri == null || rightUri == null) { error = "Choose both folders first."; return@Button }
                    scope.launch {
                        busy = true
                        error = ""
                        val result = withContext(Dispatchers.IO) {
                            runCatching {
                                val leftRoot = DocumentFile.fromTreeUri(context, leftUri) ?: throw IOException("The first folder is unavailable.")
                                val rightRoot = DocumentFile.fromTreeUri(context, rightUri) ?: throw IOException("The second folder is unavailable.")
                                val left = scanWorkspaceFolder(leftRoot).associateBy { it.path }
                                val right = scanWorkspaceFolder(rightRoot).associateBy { it.path }
                                val output = mutableListOf<WorkspaceLine>()
                                left.forEach { (path, file) ->
                                    val other = right[path]
                                    if (other == null) output.add(WorkspaceLine(file.path, "Missing from second folder"))
                                    else if (file.size != other.size) output.add(WorkspaceLine(file.path, "Changed · size differs"))
                                    else {
                                        val same = workspaceHash(context, file.file) == workspaceHash(context, other.file)
                                        output.add(WorkspaceLine(file.path, if (same) "Verified identical" else "Changed · content differs"))
                                    }
                                }
                                right.forEach { (path, file) -> if (!left.containsKey(path)) output.add(WorkspaceLine(file.path, "Only in second folder")) }
                                output.sortedBy { it.label }
                            }
                        }
                        result.onSuccess { rows = it; status = it.size.toString() + " comparison results. Same-size matches were verified by SHA-256." }
                            .onFailure { error = it.message ?: "Folder comparison failed."; status = "" }
                        busy = false
                    }
                }, enabled = !busy, modifier = Modifier.fillMaxWidth(), text = "Compare folders")
            }
            "folder-size-analyzer" -> {
                OutlinedButton(onClick = { if (!busy) pickFolder.launch(null) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (folderUri == null) "Choose folder" else "Change folder") }
                NativeExecutionButton(onAuthorized = {
                    val uri = folderUri ?: run { error = "Choose a folder first."; return@Button }
                    scope.launch {
                        busy = true
                        error = ""
                        val result = withContext(Dispatchers.IO) {
                            runCatching {
                                val root = DocumentFile.fromTreeUri(context, uri) ?: throw IOException("The selected folder is unavailable.")
                                val files = scanWorkspaceFolder(root)
                                val grouped = files.groupBy { workspaceGroup(it.name) + " · ." + it.name.substringAfterLast('.', "none") }
                                val total = files.sumOf { it.size }
                                buildList {
                                    add(WorkspaceLine("Files", files.size.toString()))
                                    add(WorkspaceLine("Total size", android.text.format.Formatter.formatFileSize(context, total)))
                                    grouped.entries.sortedByDescending { entry -> entry.value.sumOf { it.size } }.forEach { (type, group) ->
                                        add(WorkspaceLine(type, group.size.toString() + " files · " + android.text.format.Formatter.formatFileSize(context, group.sumOf { it.size })))
                                    }
                                    add(WorkspaceLine("Largest files", ""))
                                    files.sortedByDescending { it.size }.take(10).forEach { add(WorkspaceLine(it.path, android.text.format.Formatter.formatFileSize(context, it.size))) }
                                }
                            }
                        }
                        result.onSuccess { rows = it; status = "Inventory complete. Files were only read." }
                            .onFailure { error = it.message ?: "Folder analysis failed."; status = "" }
                        busy = false
                    }
                }, enabled = !busy, modifier = Modifier.fillMaxWidth(), text = "Analyze storage")
            }
            "file-search" -> {
                OutlinedButton(onClick = { if (!busy) pickFolder.launch(null) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (folderUri == null) "Choose folder" else "Change folder") }
                OutlinedTextField(value = query, onValueChange = { query = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Search names or text") }, singleLine = true)
                NativeExecutionButton(onAuthorized = {
                    val uri = folderUri ?: run { error = "Choose a folder first."; return@Button }
                    val needle = query.trim()
                    if (needle.isEmpty()) { error = "Enter a search term."; return@Button }
                    scope.launch {
                        busy = true
                        error = ""
                        val result = withContext(Dispatchers.IO) {
                            runCatching {
                                val root = DocumentFile.fromTreeUri(context, uri) ?: throw IOException("The selected folder is unavailable.")
                                val output = mutableListOf<WorkspaceLine>()
                                scanWorkspaceFolder(root).forEach { file ->
                                    if (file.path.contains(needle, ignoreCase = true)) output.add(WorkspaceLine(file.path, "Filename match"))
                                    if (isWorkspaceText(file.name) && file.size in 1..(2L * 1024L * 1024L)) {
                                        context.contentResolver.openInputStream(file.file.uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                                            reader.lineSequence().forEachIndexed { lineNumber, line ->
                                                if (line.contains(needle, ignoreCase = true)) output.add(WorkspaceLine(file.path + ":" + (lineNumber + 1), line.trim().take(180)))
                                            }
                                        }
                                    }
                                }
                                output
                            }
                        }
                        result.onSuccess { rows = it; status = "Search complete. Text files larger than 2 MB were skipped." }
                            .onFailure { error = it.message ?: "File search failed."; status = "" }
                        busy = false
                    }
                }, enabled = !busy && query.isNotBlank(), modifier = Modifier.fillMaxWidth(), text = "Search folder")
            }
            else -> {
                OutlinedButton(onClick = { if (!busy) pickFiles.launch(arrayOf("*/*")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Text(if (selected.isEmpty()) "Choose files" else "Change " + selected.size + " files")
                }
                if (selected.isNotEmpty()) Text(selected.size.toString() + " selected", style = MaterialTheme.typography.labelMedium)
                when (toolId) {
                    "file-organizer" -> NativeExecutionButton(text = "Choose destination and organize copies", enabled = !busy && selected.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { if (!busy && selected.isNotEmpty()) pickOrganizerDestination.launch(null) }
                    "batch-file-renamer" -> {
                        OutlinedTextField(value = prefix, onValueChange = { prefix = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Prefix") }, singleLine = true)
                        OutlinedTextField(value = suffix, onValueChange = { suffix = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Suffix") }, singleLine = true)
                        OutlinedTextField(value = find, onValueChange = { find = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Find in names") }, singleLine = true)
                        OutlinedTextField(value = replacement, onValueChange = { replacement = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Replace with") }, singleLine = true)
                        LazyColumn(Modifier.height(120.dp)) {
                            items(selected) { uri ->
                                val name = workspaceName(context, uri)
                                val dot = name.lastIndexOf('.').takeIf { it > 0 } ?: name.length
                                Text(prefix + name.substring(0, dot).replace(find, replacement) + suffix + name.substring(dot), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        NativeExecutionButton(text = "Export renamed copies", enabled = !busy && selected.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { if (!busy && selected.isNotEmpty()) saveRenamedZip.launch("enV-renamed-files.zip") }
                    }
                    "duplicate-file-finder" -> NativeExecutionButton(onAuthorized = {
                        val sources = selected
                        if (sources.size < 2) { error = "Select at least two files."; return@Button }
                        scope.launch {
                            busy = true
                            error = ""
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    val items = sources.map { uri -> WorkspaceFile(workspaceName(context, uri), DocumentFile.fromSingleUri(context, uri) ?: throw IOException("A selected file is unavailable.")) }
                                    val candidates = items.groupBy { it.size }.filterValues { it.size > 1 }.values.flatten()
                                    val grouped = mutableMapOf<String, MutableList<WorkspaceFile>>()
                                    candidates.forEach { file -> grouped.getOrPut(workspaceHash(context, file.file)) { mutableListOf() }.add(file) }
                                    grouped.filterValues { it.size > 1 }.flatMap { (hash, group) ->
                                        listOf(WorkspaceLine("SHA-256 " + hash)) + group.map { WorkspaceLine(it.path, android.text.format.Formatter.formatFileSize(context, it.size)) }
                                    }
                                }
                            }
                            result.onSuccess { rows = it.ifEmpty { listOf(WorkspaceLine("No identical files found.")) }; status = "Scan complete. No files were deleted." }
                                .onFailure { error = it.message ?: "Duplicate verification failed."; status = "" }
                            busy = false
                        }
                    }, enabled = !busy && selected.size >= 2, modifier = Modifier.fillMaxWidth(), text = "Find identical files")
                }
            }
        }

        if (busy) Text("Processing locally…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (status.isNotBlank()) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        if (rows.isNotEmpty()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                LazyColumn(Modifier.fillMaxWidth().height(250.dp).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(rows) { row ->
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(row.label, style = MaterialTheme.typography.bodySmall)
                            if (row.detail.isNotBlank()) Text(row.detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        Text("Original files are never automatically moved or deleted.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
