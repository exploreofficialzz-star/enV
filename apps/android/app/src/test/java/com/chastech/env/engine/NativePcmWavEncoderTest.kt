package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class NativePcmWavEncoderTest {
    @Test fun writesCorrectMonoPcmWavHeaderAndPayload() {
        val pcm = byteArrayOf(0, 0, 0xff.toByte(), 0x7f)
        val wav = NativePcmWavEncoder.encodeMonoPcm16Wav(pcm, 44_100)
        assertEquals("RIFF", String(wav.copyOfRange(0, 4), Charsets.US_ASCII))
        assertEquals("WAVE", String(wav.copyOfRange(8, 12), Charsets.US_ASCII))
        assertEquals("fmt ", String(wav.copyOfRange(12, 16), Charsets.US_ASCII))
        assertEquals("data", String(wav.copyOfRange(36, 40), Charsets.US_ASCII))
        val ints = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(40, ints.getInt(4))
        assertEquals(1, ints.getShort(20).toInt())
        assertEquals(1, ints.getShort(22).toInt())
        assertEquals(44_100, ints.getInt(24))
        assertEquals(88_200, ints.getInt(28))
        assertEquals(4, ints.getInt(40))
        assertTrue(wav.copyOfRange(44, wav.size).contentEquals(pcm))
    }

    @Test fun rejectsInvalidRateOddPayloadAndOversizedDuration() {
        assertThrows(IllegalArgumentException::class.java) { NativePcmWavEncoder.encodeMonoPcm16Wav(byteArrayOf(0, 0), 7_999) }
        assertThrows(IllegalArgumentException::class.java) { NativePcmWavEncoder.encodeMonoPcm16Wav(byteArrayOf(0), 44_100) }
        assertThrows(IllegalArgumentException::class.java) { NativePcmWavEncoder.encodeMonoPcm16Wav(ByteArray(44_100 * 2 * 2 + 2), 44_100, 2) }
    }
}
