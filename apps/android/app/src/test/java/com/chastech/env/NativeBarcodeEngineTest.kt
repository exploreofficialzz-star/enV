package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class NativeBarcodeEngineTest {
    private fun tool(id: String, type: String = "barcode", category: String = "qr") = ToolRecord(id, id, id, "", category, emptyList(), emptyList(), "Barcode", 0, false, true, false, false, "active", emptyList(), EngineInfo(type, id, emptyMap()))

    @Test fun gtinValidationMatchesTheWebContract() {
        assertTrue(NativeBarcodeEngine.run("gtin-validator", "4006381333931").startsWith("Valid: Expected check digit: 1. Supplied: 1."))
        assertTrue(NativeBarcodeEngine.run("gtin-validator", "4006381333930").startsWith("Invalid: Expected check digit: 1. Supplied: 0."))
    }

    @Test fun barcodeDefaultsUseValidExamples() {
        assertEquals("9780143127741", NativeBarcodeEngine.initialValues("gtin-validator")["value"])
        assertEquals("036000291452", NativeBarcodeEngine.initialValues("upc-check-digit")["value"])
        assertEquals("10000000000007", NativeBarcodeEngine.initialValues("itf14-barcode")["value"])
    }

    @Test fun implementedRecordsBypassGenericBackend() {
        assertFalse(NativeBackendEngine.supports(tool("gtin-validator")))
        assertFalse(NativeBackendEngine.supports(tool("unix-timestamp-converter", type = "datetime", category = "developer")))
    }

    @Test fun qrAndBarcodeFormatsAreAdvertisedAsLocalCapabilities() {
        assertTrue(NativeBarcodeEngine.generatesImage("qr-generator"))
        assertTrue(NativeBarcodeEngine.generatesImage("wifi-qr-generator"))
        assertTrue(NativeBarcodeEngine.generatesImage("code128-barcode"))
        assertTrue(NativeBarcodeEngine.generatesImage("ean8-barcode"))
        assertTrue(NativeBarcodeEngine.supports(tool("wifi-qr-generator", type = "qr")))
        assertTrue(NativeBarcodeEngine.supports(tool("code128-barcode")))
        assertTrue(NativeBarcodeEngine.supports(tool("isbn-check-digit")))
        assertTrue(NativeBarcodeEngine.run("isbn-check-digit", "9780143127741").startsWith("Valid"))
    }

    @Test fun decodedLinksAllowOnlyHttpAndHttpsHosts() {
        assertEquals("https://example.com/path", safeBarcodeHttpUrl("https://example.com/path"))
        assertEquals("http://example.com", safeBarcodeHttpUrl("http://example.com"))
        assertEquals(null, safeBarcodeHttpUrl("javascript:alert(1)"))
        assertEquals(null, safeBarcodeHttpUrl("file:///private/data"))
        assertEquals(null, safeBarcodeHttpUrl("plain text"))
    }

    @Test fun cameraLuminanceFramesRotateForPortraitAndUpsideDownDevices() {
        val source = byteArrayOf(1, 2, 3, 4, 5, 6)
        val clockwise = NativeBarcodeImageDecoder.rotateLumaFrame(source, 2, 3, 90)
        assertEquals(3, clockwise.width)
        assertEquals(2, clockwise.height)
        assertArrayEquals(byteArrayOf(5, 3, 1, 6, 4, 2), clockwise.data)

        val upsideDown = NativeBarcodeImageDecoder.rotateLumaFrame(source, 2, 3, 180)
        assertEquals(2, upsideDown.width)
        assertEquals(3, upsideDown.height)
        assertArrayEquals(byteArrayOf(6, 5, 4, 3, 2, 1), upsideDown.data)

        val counterClockwise = NativeBarcodeImageDecoder.rotateLumaFrame(source, 2, 3, 270)
        assertEquals(3, counterClockwise.width)
        assertEquals(2, counterClockwise.height)
        assertArrayEquals(byteArrayOf(2, 4, 6, 1, 3, 5), counterClockwise.data)
    }

    @Test fun supportedImageOperationsBypassGenericBackend() {
        for (id in listOf("image-resizer", "image-compressor", "image-grayscale", "image-blur", "image-cropper", "image-watermark")) {
            val image = tool(id, type = "image", category = "images")
            assertTrue(NativeImageEngine.supports(image))
            assertFalse(NativeBackendEngine.supports(image))
        }
    }

    @Test fun everyCatalogQrAndBarcodeRecordHasARealLocalHandler() {
        val qr = listOf("app-store-qr-generator", "bitcoin-qr-generator", "calendar-qr-generator", "crypto-wallet-qr-generator", "discord-invite-qr-generator", "email-qr-generator", "ethereum-qr-generator", "event-qr-generator", "facebook-link-qr-generator", "google-play-qr-generator", "instagram-link-qr-generator", "linkedin-link-qr-generator", "location-qr-generator", "mecard-qr-generator", "phone-qr-generator", "qr-batch-generator", "qr-capacity-helper", "qr-code-high-error-correction", "qr-code-low-error-correction", "qr-code-styled", "qr-data-url-generator", "qr-generator", "qr-payload-encoder", "qr-payload-inspector", "qr-size-calculator", "qr-svg-generator", "qr-version-helper", "sms-qr-generator", "telegram-link-qr-generator", "text-qr-generator", "url-qr-generator", "vcard-qr-generator", "whatsapp-qr-generator", "wifi-qr-generator", "x-link-qr-generator", "youtube-link-qr-generator")
        val barcode = listOf("barcode-label-generator", "barcode-svg-generator", "codabar-barcode", "code128-barcode", "code39-barcode", "ean13-barcode", "ean13-check-digit", "ean8-barcode", "gtin-validator", "isbn-check-digit", "isbn-barcode", "itf14-barcode", "msi-barcode", "pharmacode-barcode", "upc-barcode", "upc-check-digit")
        assertEquals(52, qr.size + barcode.size)
        qr.forEach { assertTrue("$it", NativeBarcodeEngine.supports(tool(it, type = "qr"))) }
        barcode.forEach { assertTrue("$it", NativeBarcodeEngine.supports(tool(it, type = "barcode"))) }
    }

    @Test fun structuredQrPresetsBuildExpectedPayloadsAndRequireMeaningfulValues() {
        assertEquals(listOf("ssid", "password", "security", "hidden"), NativeBarcodeEngine.fieldsFor("wifi-qr-generator").map { it.key })
        assertEquals("WIFI:T:WPA;S:Office\\;Net;P:a\\:b;H:false;", NativeBarcodeEngine.payloadFor("wifi-qr-generator", mapOf("ssid" to "Office;Net", "password" to "a:b", "security" to "WPA", "hidden" to "false")))
        assertEquals("BEGIN:VEVENT\nSUMMARY:Launch\nDTSTART:20261011T100000\nDTEND:20261011T110000\nLOCATION:HQ\nEND:VEVENT", NativeBarcodeEngine.payloadFor("event-qr-generator", mapOf("title" to "Launch", "start" to "20261011T100000", "end" to "20261011T110000", "location" to "HQ")))
        assertThrows(IllegalArgumentException::class.java) { NativeBarcodeEngine.execute("wifi-qr-generator", NativeBarcodeEngine.initialValues("wifi-qr-generator")) }
        assertThrows(IllegalArgumentException::class.java) { NativeBarcodeEngine.execute("qr-payload-inspector", mapOf("payload" to "")) }
    }

    @Test fun helperOperationsReturnUsefulOutputWithoutTryingToDrawAnImage() {
        assertEquals("21 modules × 4px = 84px before quiet-zone margin.", NativeBarcodeEngine.execute("qr-size-calculator", mapOf("modules" to "21", "modulePx" to "4")).text)
        assertTrue(NativeBarcodeEngine.execute("qr-version-helper", mapOf("level" to "M", "text" to "Hello")).text.contains("Estimated QR version:"))
        assertTrue(NativeBarcodeEngine.execute("qr-capacity-helper", mapOf("version" to "2", "level" to "H")).text.contains("Approximate alphanumeric capacity"))
    }
}
