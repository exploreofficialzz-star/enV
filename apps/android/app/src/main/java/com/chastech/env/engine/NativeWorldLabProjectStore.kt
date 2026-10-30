package com.chastech.env.engine

import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Private-device World Lab project store. Explicit local-only storage:
 * no account, network calls, cloud merge, or silent last-write-wins.
 * All imported/on-disk bytes are revalidated against the portable schema.
 */
class NativeWorldLabProjectStore(private val appFilesDir: File) {
    private val storageDir = File(appFilesDir, "world-lab-v1")
    companion object { const val MAX_LOCAL_PROJECTS = 50 }
    private fun safeFileName(id: String): String {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,120}"))) { "Invalid World Lab local project ID." }
        return "$id.json"
    }
    private fun projectFile(id: String): File = File(storageDir, safeFileName(id))
    private fun writeAtomically(target: File, bytes: ByteArray) {
        val tmp = File.createTempFile(".world-lab-writing-", ".tmp", storageDir)
        try {
            FileOutputStream(tmp).use { stream ->
                stream.write(bytes)
                stream.fd.sync()
            }
            try {
                Files.move(tmp.toPath(), target.toPath(),
                    StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            tmp.delete()
        }
    }

    @Synchronized fun save(json: String): WorldLabSavedLocal {
        val bytes = json.toByteArray(StandardCharsets.UTF_8)
        require(bytes.size <= NativeWorldLabProjectCodec.MAX_BYTES) { "World Lab local project exceeds 1 MB." }
        val project = NativeWorldLabProjectCodec.decode(json)
        require(storageDir.isDirectory || storageDir.mkdirs()) { "Cannot create private World Lab folder." }
        val dest = projectFile(project.id)
        if (dest.exists()) {
            val previousBytes = dest.readBytes()
            require(previousBytes.size <= NativeWorldLabProjectCodec.MAX_BYTES) { "Existing local project is oversized." }
            val previousJson = String(previousBytes, StandardCharsets.UTF_8)
            val previous = NativeWorldLabProjectCodec.decode(previousJson)
            require(project.revision > previous.revision || (project.revision == previous.revision && json == previousJson)) {
                "This project has a newer local revision. Export or resolve the conflict before replacing it."
            }
        } else {
            val count = storageDir.listFiles()?.count { it.isFile && it.extension == "json" } ?: 0
            require(count < MAX_LOCAL_PROJECTS) { "The device has reached its 50-project limit. Export projects first." }
        }
        writeAtomically(dest, bytes)
        writeAtomically(File(storageDir, "recent-id"), project.id.toByteArray(StandardCharsets.US_ASCII))
        return WorldLabSavedLocal(project.id, project.title, project.revision, json)
    }

    @Synchronized fun loadLatest(): WorldLabSavedLocal? {
        val pointer = File(storageDir, "recent-id")
        if (!pointer.isFile) return null
        require(pointer.length() <= 120) { "Corrupt saved-project pointer." }
        val id = pointer.readText(StandardCharsets.US_ASCII)
        return read(id)
    }

    @Synchronized fun read(id: String): WorldLabSavedLocal {
        val file = projectFile(id)
        require(file.isFile) { "Saved World Lab project not found on this device." }
        require(file.length() <= NativeWorldLabProjectCodec.MAX_BYTES) { "Saved project exceeds the 1 MB limit." }
        val json = file.readText(StandardCharsets.UTF_8)
        val p = NativeWorldLabProjectCodec.decode(json)
        require(p.id == id) { "Saved project identifier does not match its filename." }
        return WorldLabSavedLocal(p.id, p.title, p.revision, json)
    }
}
data class WorldLabSavedLocal(val id: String, val title: String, val revision: Int, val json: String)
