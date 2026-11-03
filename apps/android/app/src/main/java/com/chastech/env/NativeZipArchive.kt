package com.chastech.env

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.lingala.zip4j.io.inputstream.ZipInputStream
import net.lingala.zip4j.io.outputstream.ZipOutputStream
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.ZipParameters
import java.io.IOException
import java.util.Locale

private const val MAX_NATIVE_ARCHIVE_ENTRIES = 100_000
private const val MAX_NATIVE_EXTRACT_BYTES = 100L * 1024L * 1024L * 1024L
private const val ARCHIVE_BUFFER_SIZE = 1024 * 1024

private val nativePrecompressedExtensions = setOf(
    "7z", "aac", "avif", "bz2", "flac", "gif", "gz", "heic", "jpeg", "jpg",
    "m4a", "mkv", "mov", "mp3", "mp4", "ogg", "opus", "pdf", "png", "rar",
    "webm", "webp", "woff", "woff2", "xz", "zip", "zst",
)

private fun safeNativeArchivePath(value: String): List<String>? {
    if (value.isBlank() || value.contains('\u0000')) return null
    val normalized = value.replace('\\', '/')
    if (normalized.startsWith('/') || Regex("^[A-Za-z]:").containsMatchIn(normalized)) return null
    val segments = normalized.split('/').filter { it.isNotBlank() && it != "." }
    if (segments.isEmpty() || segments.any { it == ".." || it.contains(':') }) return null
    return segments
}

private fun uriDisplayName(context: Context, uri: Uri): String {
    return context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }?.takeIf { it.isNotBlank() } ?: (uri.lastPathSegment ?: "file")
}

private fun uriSize(context: Context, uri: Uri): Long {
    return context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getLong(0).takeIf { it > 0L } ?: 0L else 0L
    } ?: 0L
}

private fun uniqueDocumentName(parent: DocumentFile, requested: String): String {
    if (parent.findFile(requested) == null) return requested
    val dot = requested.lastIndexOf('.').takeIf { it > 0 } ?: requested.length
    val base = requested.substring(0, dot)
    val extension = requested.substring(dot)
    var suffix = 2
    while (parent.findFile(base + " (" + suffix + ")" + extension) != null) suffix += 1
    return base + " (" + suffix + ")" + extension
}

@Composable
fun NativeZipArchiveScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf("compress") }
    var selectedFiles by remember { mutableStateOf(emptyList<Uri>()) }
    var selectedArchive by remember { mutableStateOf<Uri?>(null) }
    var compressionMaximum by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var status by remember { mutableStateOf("") }
    var failure by remember { mutableStateOf("") }

    val chooseFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        selectedFiles = uris
        failure = ""
        status = if (uris.isNotEmpty()) uris.size.toString() + " file(s) selected" else ""
    }
    val createArchive = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { outputUri ->
        if (outputUri != null && selectedFiles.isNotEmpty()) {
            scope.launch {
                busy = true
                progress = 0f
                failure = ""
                status = "Creating ZIP archive on this device…"
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val total = selectedFiles.sumOf { uriSize(context, it) }.coerceAtLeast(1L)
                        val names = selectedFiles.map { uriDisplayName(context, it) }
                        if (names.distinct().size != names.size) throw IOException("Some selected files have the same name. Rename one of them and try again.")
                        val output = context.contentResolver.openOutputStream(outputUri, "w")
                            ?: throw IOException("The selected destination could not be opened.")
                        var processed = 0L
                        ZipOutputStream(output).use { zip ->
                            selectedFiles.forEachIndexed { index, uri ->
                                val name = names[index]
                                val safeName = safeNativeArchivePath(name)?.joinToString("/")
                                    ?: throw IOException("Unsafe source file name rejected: " + name)
                                val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
                                val sourceSize = uriSize(context, uri)
                                val stored = extension in nativePrecompressedExtensions && sourceSize > 0L
                                val parameters = ZipParameters().apply {
                                    fileNameInZip = safeName
                                    isSourceExternalStream = true
                                    compressionMethod = if (stored) CompressionMethod.STORE else CompressionMethod.DEFLATE
                                    if (stored) entrySize = sourceSize
                                    else compressionLevel = if (compressionMaximum) CompressionLevel.MAXIMUM else CompressionLevel.NORMAL
                                }
                                zip.putNextEntry(parameters)
                                context.contentResolver.openInputStream(uri)?.use { input ->
                                    val buffer = ByteArray(ARCHIVE_BUFFER_SIZE)
                                    while (true) {
                                        val count = input.read(buffer)
                                        if (count < 0) break
                                        zip.write(buffer, 0, count)
                                        processed += count
                                        progress = (processed.toDouble() / total).toFloat().coerceIn(0f, 0.99f)
                                        status = "Adding " + name
                                    }
                                } ?: throw IOException("Could not read " + name + ".")
                                zip.closeEntry()
                            }
                        }
                        progress = 1f
                        "ZIP archive created successfully."
                    }
                }
                result.onSuccess { status = it; selectedFiles = emptyList() }
                    .onFailure { failure = it.message ?: "The ZIP archive could not be created."; status = "" }
                busy = false
            }
        }
    }
    val chooseArchive = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        selectedArchive = uri
        failure = ""
        status = if (uri != null) uriDisplayName(context, uri) else ""
    }
    val chooseDestination = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { destinationUri ->
        val sourceUri = selectedArchive
        if (destinationUri != null && sourceUri != null) {
            scope.launch {
                busy = true
                progress = 0f
                failure = ""
                status = "Extracting files on this device…"
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val root = DocumentFile.fromTreeUri(context, destinationUri)
                            ?: throw IOException("The selected destination folder is unavailable.")
                        val input = context.contentResolver.openInputStream(sourceUri)
                            ?: throw IOException("The selected ZIP archive could not be opened.")
                        var written = 0L
                        var entries = 0
                        ZipInputStream(input).use { zip ->
                            while (true) {
                                val header = zip.nextEntry ?: break
                                entries += 1
                                if (entries > MAX_NATIVE_ARCHIVE_ENTRIES) throw IOException("This archive contains too many entries.")
                                val path = safeNativeArchivePath(header.fileName)
                                    ?: throw IOException("Unsafe archive path rejected: " + header.fileName)
                                var parent = root
                                for (folder in path.dropLast(1)) {
                                    parent = parent.findFile(folder) ?: parent.createDirectory(folder)
                                        ?: throw IOException("Could not create the extraction folder.")
                                }
                                if (header.isDirectory) {
                                    parent.findFile(path.last()) ?: parent.createDirectory(path.last())
                                    continue
                                }
                                val outputName = uniqueDocumentName(parent, path.last())
                                val outputFile = parent.createFile("application/octet-stream", outputName)
                                    ?: throw IOException("Could not create " + outputName + ".")
                                context.contentResolver.openOutputStream(outputFile.uri, "w")?.use { output ->
                                    val buffer = ByteArray(ARCHIVE_BUFFER_SIZE)
                                    while (true) {
                                        val count = zip.read(buffer)
                                        if (count < 0) break
                                        written += count
                                        if (written > MAX_NATIVE_EXTRACT_BYTES) throw IOException("The archive expands beyond the 100 GB safety limit.")
                                        output.write(buffer, 0, count)
                                        status = "Extracted " + entries + " item(s)"
                                    }
                                } ?: throw IOException("Could not write " + outputName + ".")
                            }
                        }
                        progress = 1f
                        "Extraction completed. Files were saved in your selected folder."
                    }
                }
                result.onSuccess { status = it; selectedArchive = null }
                    .onFailure { failure = it.message ?: "The archive could not be extracted."; status = "" }
                busy = false
            }
        }
    }

    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = mode == "compress", onClick = { if (!busy) { mode = "compress"; failure = ""; status = "" } }, label = { Text("Compress") })
            FilterChip(selected = mode == "extract", onClick = { if (!busy) { mode = "extract"; failure = ""; status = "" } }, label = { Text("Extract") })
        }
        if (mode == "compress") {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Create a ZIP archive", style = MaterialTheme.typography.titleMedium)
                    Text("Choose one file or select many files together. Large files are streamed directly into the archive.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { if (!busy) chooseFiles.launch(arrayOf("*/*")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                        Text(if (selectedFiles.isEmpty()) "Choose files" else "Change selected files")
                    }
                    if (selectedFiles.isNotEmpty()) {
                        Text(selectedFiles.size.toString() + " selected", style = MaterialTheme.typography.labelLarge)
                        LazyColumn(Modifier.fillMaxWidth().height(120.dp)) {
                            itemsIndexed(selectedFiles) { index, uri ->
                                Text((index + 1).toString() + ". " + uriDisplayName(context, uri), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 3.dp))
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = !compressionMaximum, onClick = { compressionMaximum = false }, label = { Text("Balanced") })
                            FilterChip(selected = compressionMaximum, onClick = { compressionMaximum = true }, label = { Text("Maximum") })
                        }
                        Button(onClick = { if (!busy) createArchive.launch("enV-archive.zip") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                            Text("Create ZIP archive")
                        }
                    }
                }
            }
        } else {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Extract a ZIP archive", style = MaterialTheme.typography.titleMedium)
                    Text("Open an archive and choose where the extracted files should go.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { if (!busy) chooseArchive.launch(arrayOf("application/zip", "application/octet-stream")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                        Text(if (selectedArchive == null) "Choose ZIP archive" else "Change ZIP archive")
                    }
                    if (selectedArchive != null) {
                        Text(uriDisplayName(context, selectedArchive!!), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Button(onClick = { if (!busy) chooseDestination.launch(null) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                            Text("Choose folder and extract")
                        }
                    }
                }
            }
        }
        if (busy) {
            if (mode == "compress") {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
        if (status.isNotBlank()) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (failure.isNotBlank()) Text(failure, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text("Private and on-device", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text("Your files are processed locally and are never uploaded. ZIP64 supports files and archives larger than 4 GB. Real compression depends on the file type, free storage and device speed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Text("Photos, music and videos are already compressed, so they may not get much smaller. Text and some documents can shrink significantly.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
