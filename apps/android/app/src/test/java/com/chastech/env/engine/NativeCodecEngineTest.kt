package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCodecEngineTest {
    private val allIds = setOf(
        "ascii-converter", "base64-decoder", "base64-encoder", "binary-converter", "hash-compare",
        "hex-converter", "html-decoder", "html-encoder", "md5-hash", "sha1-hash", "sha256-hash",
        "sha512-hash", "unicode-converter", "url-decoder", "url-encoder", "hash-generator", "number-base-converter"
    )

    @Test
    fun canonicalCodecIdsAreFullyLocalAndMapped() {
        assertEquals(allIds, NativeCodecEngine.canonicalToolIds)
        assertEquals(allIds, NativeCodecEngine.supportedToolIds)
        for (id in allIds) assertTrue(NativeCodecEngine.operationForTool(id) != null)
    }

    @Test
    fun encodingsMatchWebSemanticsForUnicodeAndEntities() {
        assertEquals("SGVsbG8g8J+MjQ==", NativeCodecEngine.run("base64-encoder", "Hello 🌍").output)
        assertEquals("Hello 🌍", NativeCodecEngine.run("base64-decoder", "SGVsbG8g8J+MjQ==").output)
        assertEquals("a%20b%3Ac!~*'()", NativeCodecEngine.run("url-encoder", "a b:c!~*'()").output)
        assertEquals("a b+c", NativeCodecEngine.run("url-decoder", "a+b%2Bc").output)
        assertEquals("&lt;x a=&#39;y&#39;&gt;&amp;quot;", NativeCodecEngine.run("html-encoder", "<x a='y'>&quot;").output)
        assertEquals("<x a='y'>&quot; & <", NativeCodecEngine.run("html-decoder", "&lt;x a=&#39;y&#39;&gt;&amp;quot; &#x26; &#60;").output)
    }

    @Test
    fun dumpsAndHashesAreDeterministic() {
        assertEquals("UTF-8: 41 f0 9f 8c 8d\nU+0041 A\nU+1F30D 🌍", NativeCodecEngine.run("unicode-converter", "A🌍").output)
        assertEquals("A\t65\n🌍\t127757", NativeCodecEngine.run("ascii-converter", "A🌍").output)
        assertEquals("01000001 11110000 10011111 10001100 10001101", NativeCodecEngine.run("binary-converter", "A🌍").output)
        assertEquals("41f09f8c8d", NativeCodecEngine.run("hex-converter", "A🌍").output)
        assertEquals("900150983cd24fb0d6963f7d28e17f72", NativeCodecEngine.run("md5-hash", "abc").output)
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", NativeCodecEngine.run("sha1-hash", "abc").output)
        assertEquals("match", NativeCodecEngine.run("hash-compare", options = mapOf("a" to " ABC ", "b" to "abc")).output)
        assertEquals("different", NativeCodecEngine.run("hash-compare", options = mapOf("a" to "abc", "b" to "abd")).output)
    }

    @Test
    fun baseConvertUsesArbitraryPrecisionAndRejectsInvalidInputs() {
        assertEquals("ff", NativeCodecEngine.run("number-base-converter", "255", options = mapOf("fromBase" to "10", "toBase" to "16")).output)
        assertEquals("-11111111", NativeCodecEngine.run("number-base-converter", "-ff", options = mapOf("fromBase" to "16", "toBase" to "2")).output)
        assertEquals("byw97um9s91dlz68tsi", NativeCodecEngine.run("number-base-converter", "123456789012345678901234567890", options = mapOf("fromBase" to "10", "toBase" to "36")).output)
        try {
            NativeCodecEngine.run("number-base-converter", "12z", options = mapOf("fromBase" to "10", "toBase" to "16"))
            throw AssertionError("invalid number accepted")
        } catch (error: IllegalArgumentException) { assertEquals("Invalid number", error.message) }
        try {
            NativeCodecEngine.run("base64-decoder", "%%%")
            throw AssertionError("invalid Base64 accepted")
        } catch (error: IllegalArgumentException) { assertEquals("Invalid Base64", error.message) }
    }
}
