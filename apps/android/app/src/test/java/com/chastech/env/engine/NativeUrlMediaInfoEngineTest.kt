package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeUrlMediaInfoEngineTest {
    @Test
    fun canonicalActiveIdIsExplicitlyNotClaimedOffline() {
        assertEquals(setOf("url-media-inspector"), NativeUrlMediaInfoEngine.canonicalToolIds)
        assertTrue(NativeUrlMediaInfoEngine.supportedToolIds.isEmpty())
        assertNull(NativeUrlMediaInfoEngine.operationForTool("url-media-inspector"))
    }

    @Test
    fun executionFailsWithoutNetworkOrGuessedMetadata() {
        try {
            NativeUrlMediaInfoEngine.run(
                toolId = "url-media-inspector",
                input = "https://example.com/video.mp4",
                options = mapOf("provider" to "generic")
            )
            throw AssertionError("backend-dependent URL media inspection was accepted offline")
        } catch (error: UnsupportedOperationException) {
            assertTrue(error.message!!.contains("not available offline"))
            assertTrue(error.message!!.contains("remote metadata service"))
        }
    }

    @Test
    fun unknownIdsAreNotSilentlyMappedToAnOperation() {
        assertNull(NativeUrlMediaInfoEngine.operationForTool("future-url-media-tool"))
        try {
            NativeUrlMediaInfoEngine.run("future-url-media-tool")
            throw AssertionError("unknown URL media tool was accepted")
        } catch (_: UnsupportedOperationException) {
            // Deliberate refusal for every ID keeps this engine offline-only.
        }
    }
}
