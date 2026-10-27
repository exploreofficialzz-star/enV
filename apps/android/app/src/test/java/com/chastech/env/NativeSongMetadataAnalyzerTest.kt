package com.chastech.env

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertNotNull
import org.junit.Test

class NativeSongMetadataAnalyzerTest {
    @Test
    fun keyAnalysisIncludesAudioNearTheEndOfTheTrack() {
        val rate = 16_000
        val samples = FloatArray(rate * 96)
        for (index in rate * 90 until samples.size) {
            val time = index.toDouble() / rate
            samples[index] = (0.2 * kotlin.math.sin(2 * kotlin.math.PI * 261.626 * time) + 0.2 * kotlin.math.sin(2 * kotlin.math.PI * 329.628 * time) + 0.2 * kotlin.math.sin(2 * kotlin.math.PI * 391.995 * time)).toFloat()
        }
        assertNotNull(NativeSongSignalAnalysis.estimateKey(samples, rate))
    }

    @Test
    fun stemArtifactPathsRejectTraversal() {
        val id = "1".repeat(32)
        assertEquals(true, NativeSongBackend.artifactUrl(id, "stems/source/vocals.wav").endsWith("/v1/jobs/$id/artifacts/stems/source/vocals.wav"))
        assertThrows(IllegalArgumentException::class.java) { NativeSongBackend.artifactUrl(id, "../secret") }
        assertThrows(IllegalArgumentException::class.java) { NativeSongBackend.artifactUrl("bad", "vocals.wav") }
    }
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
        assertArrayEquals(audio, result.single().bytes!!)
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
