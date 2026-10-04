package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeMimeEngineTest {
    private val activeIds = setOf("mime-lookup", "mime-type-lookup")

    @Test fun canonicalActiveMimeIdsHaveTheSameLocalLookupOperation() {
        assertEquals(activeIds, NativeMimeEngine.supportedToolIds)
        activeIds.forEach { assertEquals("lookup", NativeMimeEngine.operationForTool(it)) }
    }

    @Test fun lookupSearchesExtensionMimeNameAndGroupOffline() {
        assertEquals(listOf("png"), NativeMimeEngine.run("mime-lookup", input = "png").rows.map { it.ext })
        assertEquals(listOf("json"), NativeMimeEngine.run("mime-type-lookup", input = "application/json").rows.map { it.ext })
        assertEquals(listOf("doc", "docx"), NativeMimeEngine.run("mime-lookup", input = "word document").rows.map { it.ext })
        assertTrue(NativeMimeEngine.run("mime-lookup", input = "audio").rows.map { it.ext }.containsAll(listOf("mp3", "wav", "ogg", "flac")))
        assertEquals("image/png", NativeMimeEngine.run("mime-lookup", input = "png").rows.single().mime)
    }

    @Test fun localSignatureInspectionMatchesWebTableAndReportsMislabeledFiles() {
        val png = NativeMimeEngine.run(
            "mime-type-lookup",
            options = mapOf("fileName" to "photo.png", "browserMime" to "image/png", "bytesHex" to "89 50 4e 47 0d 0a 1a 0a 00")
        ).inspection
        assertNotNull(png)
        assertEquals("png", png!!.entry!!.ext)
        assertEquals("89 50 4e 47 0d 0a 1a 0a 00", png.bytesHex)
        assertFalse(png.mismatch)
        val mislabeled = NativeMimeEngine.inspect("photo.txt", bytes = byteArrayOf(0x25, 0x50, 0x44, 0x46))
        assertEquals("pdf", mislabeled.entry!!.ext)
        assertTrue(mislabeled.mismatch)
        val unknown = NativeMimeEngine.inspect("note.txt", bytes = byteArrayOf(1, 2, 3))
        assertNull(unknown.entry)
        assertEquals("01 02 03", unknown.bytesHex)
    }

    @Test fun sharedMagicUsesTheCanonicalFirstEntryAndUnknownToolsFail() {
        assertEquals("webp", NativeMimeEngine.inspect("sound.wav", bytes = byteArrayOf(0x52, 0x49, 0x46, 0x46)).entry!!.ext)
        assertNull(NativeMimeEngine.operationForTool("mime-encoder"))
        try {
            NativeMimeEngine.run("mime-encoder")
            throw AssertionError("unsupported MIME tool accepted")
        } catch (_: IllegalArgumentException) { }
    }
}
