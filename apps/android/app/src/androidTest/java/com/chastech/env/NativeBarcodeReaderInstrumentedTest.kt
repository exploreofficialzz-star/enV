package com.chastech.env

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/** Runs bitmap creation and decoding on Android rather than the mocked local JVM android.jar. */
@RunWith(AndroidJUnit4::class)
class NativeBarcodeReaderInstrumentedTest {
    @Test fun readsMultipleCodesFromOneUploadedImage() {
        val qrPayload = "https://example.com/env-android-batch-qr"
        val qr = NativeBarcodeEngine.execute("qr-generator", mapOf("text" to qrPayload)).images.single()
        val barcodePayload = "ENV-CODE128-BATCH-2026"
        val barcode = NativeBarcodeEngine.execute("code128-barcode", mapOf("value" to barcodePayload)).images.single()
        val combined = Bitmap.createBitmap(
            qr.width + barcode.width,
            maxOf(qr.height, barcode.height),
            Bitmap.Config.ARGB_8888,
        )
        Canvas(combined).apply {
            drawColor(Color.WHITE)
            drawBitmap(qr, 0f, 0f, null)
            drawBitmap(barcode, qr.width.toFloat(), 0f, null)
        }

        val decoded = NativeBarcodeImageDecoder.decodeAll(combined)
        assertEquals(setOf(qrPayload, barcodePayload), decoded.map { it.text }.toSet())

        combined.recycle()
        qr.recycle()
        barcode.recycle()
    }

    @Test fun scanHistoryPersistsAcrossScannerRecreation() {
        val context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences(NATIVE_BARCODE_SCAN_HISTORY_PREFERENCES, android.content.Context.MODE_PRIVATE)
        preferences.edit().clear().commit()
        try {
            val expected = listOf(
                NativeBarcodeScan("SKU, \"Blue\" box", "CODE_128", 1_800_000_000_000L),
                NativeBarcodeScan("https://example.com/item", "QR_CODE", 1_800_000_000_001L),
            )
            saveNativeBarcodeScanHistory(context, expected)
            assertEquals(expected, loadNativeBarcodeScanHistory(context))
        } finally {
            preferences.edit().clear().commit()
        }
    }

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
