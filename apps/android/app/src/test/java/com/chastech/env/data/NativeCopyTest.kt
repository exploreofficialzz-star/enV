package com.chastech.env.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCopyTest {
    @Test fun rewritesWebsiteCopyWithoutTouchingProductBrowserNames() {
        assertEquals("Encode text to Base64 locally on this device.", NativeCopy.text("Encode text to Base64 locally in your browser."))
        assertEquals("Data stays on this device.", NativeCopy.text("Data stays in the browser."))
        assertEquals("Percentages, loans, areas, and more — all on this device.", NativeCopy.text("Percentages, loans, areas, and more — all in the browser."))
        assertEquals("On-device PDF utilities where this device allows it.", NativeCopy.text("Client-side PDF utilities where the browser allows it."))
        assertEquals("Requires a headless browser on a server.", NativeCopy.text("Requires a headless browser on a server."))
        assertEquals("Place a screenshot inside a Chrome Browser frame. Processed locally.", NativeCopy.text("Place a screenshot inside a Chrome Browser frame. Processed locally."))
        assertEquals("Parse a user-agent string into browser, OS, and device hints.", NativeCopy.text("Parse a user-agent string into browser, OS, and device hints."))
        assertEquals("Browser frames, phone frames, and screenshot presentation.", NativeCopy.text("Browser frames, phone frames, and screenshot presentation."))
        assertFalse(NativeCopy.text("Pretty-print JSON entirely in your browser.").contains("browser"))
    }

    @Test fun dropsWebRuntimeOnlyToolsFromTheNativeCatalog() {
        val catalog = Catalog.fromJson(
            """
            {"schemaVersion":1,"catalogVersion":"test","counts":{"total":2,"active":2,"planned":0,"categories":1},
             "categories":[{"id":"network","name":"Network","description":"All in the browser","blurb":"in-browser checks","icon":"Globe"}],
             "tools":[
               {"id":"json-formatter","name":"JSON Formatter","slug":"json-formatter","description":"Pretty-print JSON entirely in your browser.","category":"network","keywords":[],"tags":[],"icon":"Code2","popularity":1,"featured":false,"clientSide":true,"requiresBackend":false,"requiresAuth":false,"status":"active","related":[],"engine":{"type":"developer","id":"json-formatter"}},
               {"id":"connection-info","name":"Browser Connection Info","slug":"connection-info","description":"Show browser-exposed online status.","category":"network","keywords":["browser"],"tags":[],"icon":"Globe","popularity":1,"featured":false,"clientSide":true,"requiresBackend":false,"requiresAuth":false,"status":"active","related":[],"engine":{"type":"network","id":"connection-info"}}
             ]}
            """.trimIndent()
        )
        assertEquals(listOf("json-formatter"), catalog.tools.map { it.id })
        assertEquals("Pretty-print JSON entirely on this device.", catalog.tools.single().description)
        assertEquals("All on this device", catalog.categories.single().description)
        assertEquals("on-device checks", catalog.categories.single().blurb)
        assertEquals(1, catalog.counts.total)
        assertTrue(NativeCopy.isWebRuntimeOnly("webcodecs-video-checker"))
    }
}
