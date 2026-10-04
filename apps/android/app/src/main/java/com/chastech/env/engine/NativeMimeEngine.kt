package com.chastech.env.engine

/** Local-only implementation of the catalog's mime/lookup operation. */
object NativeMimeEngine {
    data class Entry(
        val ext: String,
        val mime: String,
        val name: String,
        val group: String,
        val magic: IntArray? = null
    ) {
        override fun equals(other: Any?): Boolean = other is Entry && ext == other.ext && mime == other.mime && name == other.name && group == other.group && (magic?.contentEquals(other.magic) ?: (other.magic == null))
        override fun hashCode(): Int = (((ext.hashCode() * 31 + mime.hashCode()) * 31 + name.hashCode()) * 31 + group.hashCode()) * 31 + (magic?.contentHashCode() ?: 0)
    }

    data class Row(val ext: String, val mime: String, val name: String, val group: String)
    data class Inspection(
        val fileName: String,
        val browserMime: String,
        val extension: String,
        val bytesHex: String,
        val entry: Entry?,
        val mismatch: Boolean
    )
    data class Result(
        val rows: List<Row>,
        val inspection: Inspection? = null,
        val output: String = ""
    )

    private val idToOperation = mapOf("mime-lookup" to "lookup", "mime-type-lookup" to "lookup")
    val supportedToolIds: Set<String> get() = idToOperation.keys
    fun operationForTool(toolId: String): String? = idToOperation[toolId]

    private val types = listOf(
        Entry("txt", "text/plain", "Plain text", "text"), Entry("html", "text/html", "HTML", "text"),
        Entry("css", "text/css", "CSS", "text"), Entry("csv", "text/csv", "CSV", "text"),
        Entry("xml", "application/xml", "XML", "application"), Entry("json", "application/json", "JSON", "application"),
        Entry("js", "text/javascript", "JavaScript", "text"), Entry("mjs", "text/javascript", "JavaScript module", "text"),
        Entry("ts", "text/typescript", "TypeScript", "text"), Entry("md", "text/markdown", "Markdown", "text"),
        Entry("pdf", "application/pdf", "PDF", "application", intArrayOf(0x25, 0x50, 0x44, 0x46)),
        Entry("zip", "application/zip", "ZIP archive", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("gz", "application/gzip", "GZIP archive", "application", intArrayOf(0x1f, 0x8b)),
        Entry("rar", "application/vnd.rar", "RAR archive", "application", intArrayOf(0x52, 0x61, 0x72, 0x21)),
        Entry("7z", "application/x-7z-compressed", "7-Zip archive", "application", intArrayOf(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)),
        Entry("doc", "application/msword", "Word document", "application", intArrayOf(0xd0, 0xcf, 0x11, 0xe0)),
        Entry("xls", "application/vnd.ms-excel", "Excel workbook", "application", intArrayOf(0xd0, 0xcf, 0x11, 0xe0)),
        Entry("ppt", "application/vnd.ms-powerpoint", "PowerPoint presentation", "application", intArrayOf(0xd0, 0xcf, 0x11, 0xe0)),
        Entry("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel workbook", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint presentation", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("epub", "application/epub+zip", "EPUB ebook", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("apk", "application/vnd.android.package-archive", "Android package", "application", intArrayOf(0x50, 0x4b, 0x03, 0x04)),
        Entry("png", "image/png", "PNG image", "image", intArrayOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
        Entry("jpg", "image/jpeg", "JPEG image", "image", intArrayOf(0xff, 0xd8, 0xff)),
        Entry("jpeg", "image/jpeg", "JPEG image", "image", intArrayOf(0xff, 0xd8, 0xff)),
        Entry("gif", "image/gif", "GIF image", "image", intArrayOf(0x47, 0x49, 0x46, 0x38)),
        Entry("webp", "image/webp", "WebP image", "image", intArrayOf(0x52, 0x49, 0x46, 0x46)),
        Entry("bmp", "image/bmp", "Bitmap image", "image", intArrayOf(0x42, 0x4d)),
        Entry("svg", "image/svg+xml", "SVG image", "image"), Entry("ico", "image/x-icon", "Icon", "image", intArrayOf(0, 0, 1, 0)),
        Entry("avif", "image/avif", "AVIF image", "image"), Entry("mp3", "audio/mpeg", "MP3 audio", "audio", intArrayOf(0x49, 0x44, 0x33)),
        Entry("wav", "audio/wav", "WAV audio", "audio", intArrayOf(0x52, 0x49, 0x46, 0x46)),
        Entry("ogg", "audio/ogg", "Ogg audio", "audio", intArrayOf(0x4f, 0x67, 0x67, 0x53)),
        Entry("flac", "audio/flac", "FLAC audio", "audio", intArrayOf(0x66, 0x4c, 0x61, 0x43)),
        Entry("mp4", "video/mp4", "MPEG-4 video", "video"), Entry("webm", "video/webm", "WebM video", "video", intArrayOf(0x1a, 0x45, 0xdf, 0xa3)),
        Entry("mov", "video/quicktime", "QuickTime video", "video"), Entry("woff", "font/woff", "WOFF font", "font", intArrayOf(0x77, 0x4f, 0x46, 0x46)),
        Entry("woff2", "font/woff2", "WOFF2 font", "font", intArrayOf(0x77, 0x4f, 0x46, 0x32)), Entry("ttf", "font/ttf", "TrueType font", "font", intArrayOf(0, 1, 0, 0)),
        Entry("otf", "font/otf", "OpenType font", "font", intArrayOf(0x4f, 0x54, 0x54, 0x4f)), Entry("wasm", "application/wasm", "WebAssembly", "application", intArrayOf(0, 0x61, 0x73, 0x6d)),
        Entry("sqlite", "application/vnd.sqlite3", "SQLite database", "application", intArrayOf(0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0)),
        Entry("psd", "image/vnd.adobe.photoshop", "Photoshop document", "image", intArrayOf(0x38, 0x42, 0x50, 0x53)),
        Entry("tar", "application/x-tar", "TAR archive", "application")
    )

    fun run(toolId: String, input: String = "", options: Map<String, String> = emptyMap()): Result {
        val operation = operationForTool(toolId) ?: throw IllegalArgumentException("Unknown MIME tool: $toolId")
        if (operation != "lookup") throw IllegalArgumentException("Unknown MIME operation: $operation")
        val query = (options["query"] ?: input).trim().lowercase()
        val rows = types.filter { query.isEmpty() || it.ext.contains(query) || it.mime.contains(query) || it.name.lowercase().contains(query) || it.group.contains(query) }.take(80)
            .map { Row(it.ext, it.mime, it.name, it.group) }
        val bytes = parseBytes(options["bytesHex"] ?: options["bytes"] ?: "")
        val inspection = if (options.containsKey("fileName") || bytes.isNotEmpty()) {
            inspect(options["fileName"] ?: "", options["browserMime"] ?: "unknown", bytes)
        } else null
        val output = buildString {
            rows.forEach { append(".").append(it.ext).append("\t").append(it.mime).append("\t").append(it.name).append("\t").append(it.group).append("\n") }
            inspection?.let { i ->
                append("Filename: ").append(i.fileName).append("\nBrowser MIME: ").append(i.browserMime).append("\nExtension: .").append(if (i.extension.isEmpty()) "none" else i.extension)
                append("\nSignature match: ").append(i.entry?.let { "${it.name} (${it.mime})" } ?: "Unknown signature")
                append("\nBytes: ").append(i.bytesHex)
                if (i.mismatch) append("\nThe detected signature does not match the filename extension.")
            }
        }.trimEnd()
        return Result(rows, inspection, output)
    }

    fun inspect(fileName: String, browserMime: String = "unknown", bytes: ByteArray): Inspection {
        val limited = bytes.copyOf(minOf(bytes.size, 64))
        val entry = types.firstOrNull { magic -> magic.magic != null && magic.magic!!.indices.all { i -> i < limited.size && (limited[i].toInt() and 0xff) == magic.magic!![i] } }
        val ext = fileName.substringAfterLast('.', "").lowercase()
        val mismatch = entry != null && ext.isNotEmpty() && entry.ext != ext && !(entry.ext == "jpg" && ext == "jpeg")
        return Inspection(fileName, browserMime, ext, limited.joinToString(" ") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }, entry, mismatch)
    }

    private fun parseBytes(value: String): ByteArray {
        if (value.isBlank()) return byteArrayOf()
        val tokens = value.trim().split(Regex("[\\s,]+"))
        return tokens.mapNotNull { token -> token.removePrefix("0x").removePrefix("0X").takeIf { it.isNotEmpty() }?.toIntOrNull(16)?.takeIf { it in 0..255 }?.toByte() }.toByteArray()
    }
}
