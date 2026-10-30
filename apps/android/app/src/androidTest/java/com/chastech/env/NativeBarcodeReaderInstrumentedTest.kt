package com.chastech.env

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/** Runs bitmap creation and decoding on Android rather than the mocked local JVM android.jar. */
@RunWith(AndroidJUnit4::class)
class NativeBarcodeReaderInstrumentedTest {
    @Test fun readsGeneratedQrAndCode128ImagesOnDevice() {
        val qrPayload = "https://example.com/env-android-qr-reader"
        val qrBitmap = NativeBarcodeEngine.execute("qr-generator", mapOf("text" to qrPayload)).images.single()
        val qrResult = NativeBarcodeImageDecoder.decode(qrBitmap)
        assertNotNull("Generated QR image must decode", qrResult)
        assertEquals(qrPayload, qrResult?.text)
        assertEquals("QR_CODE", qrResult?.format)

        val barcodePayload = "ENV-CODE128-READER-2026"
        val barcodeBitmap = NativeBarcodeEngine.execute("code128-barcode", mapOf("value" to barcodePayload)).images.single()
        val barcodeResult = NativeBarcodeImageDecoder.decode(barcodeBitmap)
        assertNotNull("Generated Code 128 image must decode", barcodeResult)
        assertEquals(barcodePayload, barcodeResult?.text)
        assertEquals("CODE_128", barcodeResult?.format)
    }
}
