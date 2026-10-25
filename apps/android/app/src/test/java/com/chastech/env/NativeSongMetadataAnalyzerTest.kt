package com.chastech.env

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeSongMetadataAnalyzerTest {
    private fun makeZip(entries: List<Pair<String, ByteArray>>): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            entries.forEach { (name, data) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(data)
                zip.closeEntry()
            }
        }
        return output.toByteArray()
    }

    @Test
    fun extractsDeflatedAudioAndIgnoresUnrelatedFiles() {
        val audio = byteArrayOf(0x49, 0x44, 0x33, 0x03, 0x00)
        val zip = makeZip(listOf("album/track.mp3" to audio, "README.txt" to "not audio".toByteArray()))
        val result = extractNativeSongZip(zip)
        assertEquals(1, result.size)
        assertEquals("album — track.mp3", result.single().name)
        assertArrayEquals(audio, result.single().bytes)
    }

    @Test
    fun rejectsTraversalPathsBeforeReturningEntries() {
        val zip = makeZip(listOf("../outside.mp3" to byteArrayOf(1, 2, 3)))
        assertThrows(IllegalArgumentException::class.java) { extractNativeSongZip(zip) }
    }

    @Test
    fun rejectsInvalidZipBytes() {
        assertThrows(IllegalArgumentException::class.java) { extractNativeSongZip(byteArrayOf(1, 2, 3, 4)) }
    }
}
