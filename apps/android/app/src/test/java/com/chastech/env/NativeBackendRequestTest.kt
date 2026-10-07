package com.chastech.env

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeBackendRequestTest {
    @Test
    fun urlMediaDownloadFieldsAreTopLevelAndPreserveSelections() {
        val body = NativeBackendEngine.urlMediaRequestBody(
            "https://www.youtube.com/watch?v=example",
            JSONObject().put("provider", "youtube").put("format", "mp3").put("audioOnly", true),
        )

        assertEquals("https://www.youtube.com/watch?v=example", body.getString("url"))
        assertEquals("youtube", body.getString("provider"))
        assertEquals("mp3", body.getString("format"))
        assertTrue(body.getBoolean("audioOnly"))
        assertFalse(body.has("options"))
    }

    @Test
    fun urlMediaInfoCanSendProviderAtTopLevelWithoutNestedOptions() {
        val body = NativeBackendEngine.urlMediaRequestBody(
            "https://example.com/video.mp4",
            JSONObject().put("provider", "generic"),
        )

        assertEquals("generic", body.getString("provider"))
        assertFalse(body.has("options"))
    }
}
