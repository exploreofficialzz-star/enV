package com.chastech.env

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeBarcodeEngineTest {
    private fun tool(id: String, type: String = "barcode", category: String = "qr") = ToolRecord(id, id, id, "", category, emptyList(), emptyList(), "Barcode", 0, false, true, false, false, "active", emptyList(), EngineInfo(type, id, emptyMap()))

    @Test fun gtinValidationMatchesTheWebContract() {
        assertTrue(NativeBarcodeEngine.run("gtin-validator", "4006381333931").startsWith("Valid: Expected check digit: 1. Supplied: 1."))
        assertTrue(NativeBarcodeEngine.run("gtin-validator", "4006381333930").startsWith("Invalid: Expected check digit: 1. Supplied: 0."))
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

    @Test fun supportedImageOperationsBypassGenericBackend() {
        for (id in listOf("image-resizer", "image-compressor", "image-grayscale", "image-blur", "image-cropper", "image-watermark")) {
            val image = tool(id, type = "image", category = "images")
            assertTrue(NativeImageEngine.supports(image))
            assertFalse(NativeBackendEngine.supports(image))
        }
    }
}
