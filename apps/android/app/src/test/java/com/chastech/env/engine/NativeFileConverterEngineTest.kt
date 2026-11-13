package com.chastech.env.engine

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class NativeFileConverterEngineTest {
    private val tool = ToolRecord(
        id = "file-to-txt",
        name = "File to TXT Converter",
        slug = "file-to-txt",
        description = "",
        category = "files",
        keywords = emptyList(),
        tags = emptyList(),
        icon = "FileText",
        popularity = 0,
        featured = false,
        clientSide = true,
        requiresBackend = false,
        requiresAuth = false,
        status = "active",
        related = emptyList(),
        engine = EngineInfo("file-converter", "file-to-txt", emptyMap()),
    )

    @Test
    fun plainTextRemovesBomAndWritesARealLineEnding() {
        val input = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "enV text".toByteArray(Charsets.UTF_8)
        val result = NativeFileConverterEngine.run(tool, "notes.txt", input)
        assertEquals("enV text\n", result.text)
        assertEquals("txt", result.extension)
        assertEquals("text/plain", result.mime)
    }

    @Test
    fun htmlExtractionDropsExecutableAndStyleContentAndNormalizesSpacing() {
        val html = "<html><body>Hello <b>enV</b><script>alert(1)</script><style>.x{}</style> world</body></html>"
        val result = NativeFileConverterEngine.run(tool, "page.html", html.toByteArray(Charsets.UTF_8))
        assertEquals("Hello enV world\n", result.text)
    }

    @Test
    fun docxExtractionReadsOnlyTheDocumentXmlEntry() {
        val bytes = ByteArrayOutputStream().also { buffer ->
            ZipOutputStream(buffer).use { archive ->
                archive.putNextEntry(ZipEntry("word/document.xml"))
                archive.write(
                    """<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>"""
                        .toByteArray(Charsets.UTF_8),
                )
                archive.closeEntry()
            }
        }.toByteArray()
        val result = NativeFileConverterEngine.run(tool, "document.docx", bytes)
        assertEquals("Hello DOCX\n", result.text)
    }

    @Test
    fun malformedUtf8IsRejectedInsteadOfSilentlyReplaced() {
        val failure = runCatching {
            NativeFileConverterEngine.run(tool, "notes.txt", byteArrayOf(0xC3.toByte(), 0x28))
        }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException)
        assertEquals("This file is not valid UTF-8 text.", failure?.message)
    }
}
