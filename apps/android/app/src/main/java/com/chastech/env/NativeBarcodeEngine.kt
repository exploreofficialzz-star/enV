package com.chastech.env

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.Base64
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeNumberParser
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.WriterException
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.URLEncoder
import java.util.EnumMap

data class NativeBarcodeField(
    val key: String,
    val label: String,
    val defaultValue: String = "",
    val multiline: Boolean = false,
    val options: List<String> = emptyList(),
)

data class NativeBarcodeExecution(
    val text: String,
    val images: List<Bitmap> = emptyList(),
    val exportText: String? = null,
    val exportFileName: String? = null,
    val exportMimeType: String? = null,
)

/** On-device QR and linear-barcode behavior mirrored from the Web QR engine. */
object NativeBarcodeEngine {
    private val validatorIds = setOf("ean13-check-digit", "upc-check-digit", "gtin-validator", "isbn-check-digit")
    private val qrPresets = mapOf(
        "app-store-qr-generator" to "url", "bitcoin-qr-generator" to "bitcoin", "calendar-qr-generator" to "calendar",
        "crypto-wallet-qr-generator" to "crypto", "discord-invite-qr-generator" to "url", "email-qr-generator" to "email",
        "ethereum-qr-generator" to "ethereum", "event-qr-generator" to "event", "facebook-link-qr-generator" to "url",
        "google-play-qr-generator" to "url", "instagram-link-qr-generator" to "url", "linkedin-link-qr-generator" to "url",
        "location-qr-generator" to "geo", "mecard-qr-generator" to "mecard", "phone-qr-generator" to "phone",
        "qr-batch-generator" to "batch", "qr-capacity-helper" to "capacity", "qr-code-high-error-correction" to "high-error",
        "qr-code-low-error-correction" to "low-error", "qr-code-styled" to "styled", "qr-data-url-generator" to "data-url",
        "qr-generator" to "text", "qr-payload-encoder" to "payload", "qr-payload-inspector" to "inspect",
        "qr-size-calculator" to "size", "qr-svg-generator" to "svg", "qr-version-helper" to "version",
        "sms-qr-generator" to "sms", "telegram-link-qr-generator" to "url", "text-qr-generator" to "text",
        "url-qr-generator" to "url", "vcard-qr-generator" to "vcard", "whatsapp-qr-generator" to "whatsapp",
        "wifi-qr-generator" to "wifi", "x-link-qr-generator" to "url", "youtube-link-qr-generator" to "url",
    )
    private val barcodeFormats = mapOf(
        "barcode-label-generator" to BarcodeFormat.CODE_128,
        "barcode-svg-generator" to BarcodeFormat.CODE_128,
        "code128-barcode" to BarcodeFormat.CODE_128,
        "code39-barcode" to BarcodeFormat.CODE_39,
        "ean13-barcode" to BarcodeFormat.EAN_13,
        "ean8-barcode" to BarcodeFormat.EAN_8,
        "upc-barcode" to BarcodeFormat.UPC_A,
        "itf14-barcode" to BarcodeFormat.ITF,
        "codabar-barcode" to BarcodeFormat.CODABAR,
        "isbn-barcode" to BarcodeFormat.EAN_13,
    )
    private val customBarcodeIds = setOf("msi-barcode", "pharmacode-barcode")
    private val supportedIds = validatorIds + qrPresets.keys + barcodeFormats.keys + customBarcodeIds

    fun supports(tool: ToolRecord): Boolean = tool.engine.type in setOf("barcode", "qr") && tool.id in supportedIds
    fun generatesImage(toolId: String): Boolean = toolId in qrPresets.keys && qrPresets[toolId] !in setOf("capacity", "inspect", "size", "version") || toolId in barcodeFormats.keys || toolId in customBarcodeIds

    fun fieldsFor(toolId: String): List<NativeBarcodeField> {
        val text = listOf(NativeBarcodeField("text", "Text or URL", multiline = true))
        return when (qrPresets[toolId]) {
            "url" -> listOf(NativeBarcodeField("url", "URL", "https://example.com"))
            "wifi" -> listOf(NativeBarcodeField("ssid", "Network name (SSID)"), NativeBarcodeField("password", "Password"), NativeBarcodeField("security", "Security (WPA, WEP or nopass)", "WPA", options = listOf("WPA", "WEP", "nopass")), NativeBarcodeField("hidden", "Hidden network (true or false)", "false", options = listOf("false", "true")))
            "whatsapp" -> listOf(NativeBarcodeField("phone", "Phone with country code"), NativeBarcodeField("text", "Message", multiline = true))
            "email" -> listOf(NativeBarcodeField("to", "Email address"), NativeBarcodeField("subject", "Subject"), NativeBarcodeField("body", "Message", multiline = true))
            "phone" -> listOf(NativeBarcodeField("phone", "Phone number"))
            "sms" -> listOf(NativeBarcodeField("phone", "Phone number"), NativeBarcodeField("body", "Message", multiline = true))
            "vcard" -> listOf(NativeBarcodeField("name", "Name"), NativeBarcodeField("phone", "Phone"), NativeBarcodeField("email", "Email"), NativeBarcodeField("org", "Organization"))
            "mecard" -> listOf(NativeBarcodeField("name", "Name"), NativeBarcodeField("phone", "Phone"), NativeBarcodeField("email", "Email"))
            "geo" -> listOf(NativeBarcodeField("lat", "Latitude"), NativeBarcodeField("lng", "Longitude"))
            "event", "calendar" -> listOf(NativeBarcodeField("title", "Title"), NativeBarcodeField("start", "Start (YYYYMMDDTHHMMSS)"), NativeBarcodeField("end", "End (YYYYMMDDTHHMMSS)"), NativeBarcodeField("location", "Location"))
            "bitcoin" -> listOf(NativeBarcodeField("address", "Bitcoin address"), NativeBarcodeField("amount", "Amount (optional BTC)"), NativeBarcodeField("label", "Label"))
            "ethereum", "crypto" -> listOf(NativeBarcodeField("address", "Wallet address"))
            "styled" -> listOf(NativeBarcodeField("text", "Text or URL", multiline = true), NativeBarcodeField("dark", "Dark color", "#16181d"), NativeBarcodeField("light", "Light color", "#ffffff"), NativeBarcodeField("size", "Size (px)", "512"), NativeBarcodeField("margin", "Margin", "1"))
            "batch" -> listOf(NativeBarcodeField("items", "One value per line (up to 50)", multiline = true))
            "payload" -> listOf(NativeBarcodeField("kind", "Payload type (wifi, email, phone, sms or geo)", "wifi", options = listOf("wifi", "email", "phone", "sms", "geo")), NativeBarcodeField("a", "Primary value"), NativeBarcodeField("b", "Secondary value"), NativeBarcodeField("c", "Third value"))
            "inspect" -> listOf(NativeBarcodeField("payload", "QR payload", multiline = true))
            "size" -> listOf(NativeBarcodeField("modules", "QR modules", "21"), NativeBarcodeField("modulePx", "Module size (px)", "4"))
            "version" -> listOf(NativeBarcodeField("level", "Error correction (L, M, Q or H)", "M", options = listOf("L", "M", "Q", "H")), NativeBarcodeField("text", "Payload", multiline = true))
            "capacity" -> listOf(NativeBarcodeField("version", "Version (1–40)", "1"), NativeBarcodeField("level", "Error correction (L, M, Q or H)", "M", options = listOf("L", "M", "Q", "H")))
            "text", "high-error", "low-error", "svg", "data-url" -> text
            else -> listOf(NativeBarcodeField("value", "Value", when (toolId) {
                "ean13-barcode", "isbn-barcode", "ean13-check-digit", "isbn-check-digit", "gtin-validator" -> "9780143127741"
                "ean8-barcode" -> "96385074"
                "upc-barcode", "upc-check-digit" -> "036000291452"
                "itf14-barcode" -> "10000000000007"
                "msi-barcode", "pharmacode-barcode" -> "12345"
                else -> "12345"
            }))
        }
    }

    fun initialValues(toolId: String): Map<String, String> = fieldsFor(toolId).associate { it.key to it.defaultValue }

    /** Construct the same URI/vCard/Wi-Fi/calendar payloads used by the TypeScript QR engine. */
    fun payloadFor(toolId: String, values: Map<String, String>): String {
        fun v(key: String) = values[key].orEmpty()
        fun esc(value: String) = value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(":", "\\:")
        fun enc(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20").replace("%7E", "~")
        return when (qrPresets[toolId]) {
            "wifi" -> "WIFI:T:${v("security").ifBlank { "WPA" }};S:${esc(v("ssid"))};P:${esc(v("password"))};H:${v("hidden") == "true"};"
            "whatsapp" -> "https://wa.me/${v("phone").filter(Char::isDigit)}?text=${enc(v("text"))}"
            "email" -> "mailto:${v("to")}?subject=${enc(v("subject"))}&body=${enc(v("body"))}"
            "phone" -> "tel:${v("phone")}"
            "sms" -> "sms:${v("phone")}?body=${enc(v("body"))}"
            "vcard" -> "BEGIN:VCARD\nVERSION:3.0\nFN:${v("name")}\nORG:${v("org")}\nTEL:${v("phone")}\nEMAIL:${v("email")}\nEND:VCARD"
            "mecard" -> "MECARD:N:${esc(v("name"))};TEL:${esc(v("phone"))};EMAIL:${esc(v("email"))};;"
            "geo" -> "geo:${v("lat").ifBlank { "0" }},${v("lng").ifBlank { "0" }}"
            "event", "calendar" -> "BEGIN:VEVENT\nSUMMARY:${v("title")}\nDTSTART:${v("start")}\nDTEND:${v("end")}\nLOCATION:${v("location")}\nEND:VEVENT"
            "bitcoin" -> {
                val params = listOfNotNull(v("amount").takeIf(String::isNotBlank)?.let { "amount=${enc(it)}" }, v("label").takeIf(String::isNotBlank)?.let { "label=${enc(it)}" }).joinToString("&")
                "bitcoin:${v("address")}${if (params.isEmpty()) "" else "?$params"}"
            }
            "ethereum" -> "ethereum:${v("address")}"
            "crypto" -> v("address")
            "url" -> v("url")
            "payload" -> when (v("kind")) {
                "wifi" -> "WIFI:T:WPA;S:${esc(v("a"))};P:${esc(v("b"))};H:false;"
                "email" -> "mailto:${v("a")}?subject=${enc(v("b"))}&body=${enc(v("c"))}"
                "phone" -> "tel:${v("a")}"
                "sms" -> "sms:${v("a")}?body=${enc(v("b"))}"
                "geo" -> "geo:${v("a").ifBlank { "0" }},${v("b").ifBlank { "0" }}"
                else -> v("a")
            }
            else -> v("text")
        }
    }

    fun execute(toolId: String, values: Map<String, String>): NativeBarcodeExecution {
        if (toolId in validatorIds) return NativeBarcodeExecution(run(toolId, values["value"].orEmpty()))
        val preset = qrPresets[toolId]
        val inputError = inputError(toolId, preset, values)
        require(inputError == null) { inputError ?: "Enter a value." }
        when (preset) {
            "size" -> {
                val modules = (values["modules"]?.toIntOrNull() ?: 21); val px = (values["modulePx"]?.toDoubleOrNull() ?: 4.0)
                return NativeBarcodeExecution("$modules modules × ${NativeNumberParser.format(px)}px = ${NativeNumberParser.format(modules * px)}px before quiet-zone margin.")
            }
            "version" -> {
                val text = values["text"].orEmpty(); val level = values["level"].orEmpty().ifBlank { "M" }
                return NativeBarcodeExecution("Estimated QR version: ${approxVersion(text.length, level)} for $level error correction. Actual version depends on encoding mode and content.")
            }
            "capacity" -> {
                val version = (values["version"]?.toIntOrNull() ?: 1).coerceIn(1, 40); val level = values["level"].orEmpty().ifBlank { "M" }
                val factor = mapOf("L" to 1.0, "M" to .8, "Q" to .65, "H" to .5).getValue(level)
                return NativeBarcodeExecution("Approximate alphanumeric capacity for version $version / $level: about ${maxOf(10, (version * version * 18 * factor).toInt())} characters. This is a planning estimate, not the QR standard's exact byte table.")
            }
            "inspect" -> {
                val payload = values["payload"].orEmpty(); val kind = detectPayload(payload)
                return NativeBarcodeExecution("Detected payload type: $kind. Length: ${payload.length} characters.")
            }
            "batch" -> {
                val items = values["items"].orEmpty().lineSequence().map(String::trim).filter(String::isNotEmpty).toList()
                val images = items.map { encode("qr-batch-generator", it, 320, 320).bitmap }
                return NativeBarcodeExecution("Generated ${images.size} QR codes locally.", images)
            }
        }
        if (toolId in validatorIds) return NativeBarcodeExecution(run(toolId, values["value"].orEmpty()))
        val payload = if (preset != null) payloadFor(toolId, values) else values["value"].orEmpty()
        require(payload.isNotBlank()) { "Enter something to encode." }
        val size = values["size"]?.toIntOrNull()?.coerceIn(128, 2048) ?: if (preset == "styled") 512 else 512
        val margin = values["margin"]?.toIntOrNull()?.coerceIn(0, 16) ?: 1
        val dark = parseColor(values["dark"], Color.BLACK)
        val light = parseColor(values["light"], Color.WHITE)
        val encoded = encode(toolId, payload, if (preset != null) size else 768, if (preset != null) size else 320, margin, dark, light)
        val labeled = if (toolId == "barcode-label-generator") addLabel(encoded.bitmap, payload) else encoded.bitmap
        if (toolId == "qr-data-url-generator") {
            val bytes = ByteArrayOutputStream().use { stream -> labeled.compress(Bitmap.CompressFormat.PNG, 100, stream); stream.toByteArray() }
            val dataUrl = "data:image/png;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
            return NativeBarcodeExecution("Generated QR data URL (${dataUrl.length} characters).", listOf(labeled), dataUrl, "env-qr-data-url.txt", "text/plain")
        }
        if (toolId == "qr-svg-generator" || toolId == "barcode-svg-generator") {
            val svg = svgFromMatrix(encoded.matrix, values["dark"].orEmpty().ifBlank { "#000000" }, values["light"].orEmpty().ifBlank { "#ffffff" })
            return NativeBarcodeExecution("Generated SVG locally · ${payload.length} payload characters.", listOf(labeled), svg, "env-code.svg", "image/svg+xml")
        }
        val text = if (toolId == "barcode-label-generator") "Label: $payload\nGenerated locally on this device." else "Generated locally on this device."
        return NativeBarcodeExecution(text, listOf(labeled))
    }

    fun generate(toolId: String, input: String, width: Int = 768, height: Int = 320): Bitmap = encode(toolId, input, width, height).bitmap

    fun run(toolId: String, input: String): String {
        require(toolId in validatorIds) { "Unknown barcode validation operation." }
        val digits = input.filter(Char::isDigit)
        if (toolId == "gtin-validator") {
            require(digits.length in setOf(8, 12, 13, 14)) { "GTIN must contain 8, 12, 13 or 14 digits." }
            val expected = checkDigit(digits.dropLast(1))
            return "${if (expected == digits.last().digitToInt()) "Valid" else "Invalid"}: Expected check digit: $expected. Supplied: ${digits.last()}."
        }
        if (toolId == "isbn-check-digit") {
            require(digits.length == 13) { "ISBN-13 must contain 13 digits." }
            val expected = isbn13CheckDigit(digits.dropLast(1))
            return "${if (expected == digits.last().digitToInt()) "Valid" else "Invalid"}: Expected check digit: $expected. Supplied: ${digits.last()}."
        }
        require(digits.isNotEmpty()) { "Enter numeric digits." }
        val body = if (toolId == "upc-check-digit") digits.take(11) else digits.take(12)
        require(body.isNotEmpty()) { "Enter numeric digits." }
        val expected = checkDigit(body)
        return "Calculated check digit: $expected. Supplied check digit: ${digits.last()}."
    }

    private data class Encoded(val bitmap: Bitmap, val matrix: BitMatrix)

    private fun encode(toolId: String, input: String, width: Int, height: Int, margin: Int = 1, dark: Int = Color.BLACK, light: Int = Color.WHITE): Encoded {
        require(toolId in supportedIds && toolId !in validatorIds && qrPresets[toolId] !in setOf("capacity", "inspect", "size", "version")) { "This barcode operation does not generate an image." }
        require(input.isNotBlank()) { "Enter a value to encode." }
        val safeWidth = width.coerceIn(128, 2048); val safeHeight = if (toolId in qrPresets) safeWidth else height.coerceIn(96, 768)
        val matrix = when (toolId) {
            "msi-barcode" -> matrixFromPattern(encodeMsi(normalizeDigits(input)), safeHeight)
            "pharmacode-barcode" -> matrixFromPattern(encodePharmacode(input), safeHeight)
            else -> {
                val format = barcodeFormats[toolId] ?: BarcodeFormat.QR_CODE
                val clean = normalizeForWriter(toolId, input)
                val hints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java).apply {
                    put(EncodeHintType.MARGIN, margin.coerceIn(0, 16))
                    if (format == BarcodeFormat.QR_CODE) {
                        put(EncodeHintType.CHARACTER_SET, "UTF-8")
                        put(EncodeHintType.ERROR_CORRECTION, when (qrPresets[toolId]) { "high-error" -> ErrorCorrectionLevel.H; "low-error" -> ErrorCorrectionLevel.L; else -> ErrorCorrectionLevel.M })
                    }
                }
                try { MultiFormatWriter().encode(clean, format, safeWidth, safeHeight, hints) }
                catch (_: WriterException) { throw IllegalArgumentException("The value is not valid for this barcode format.") }
            }
        }
        val bitmap = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
        for (x in 0 until matrix.width) for (y in 0 until matrix.height) bitmap.setPixel(x, y, if (matrix[x, y]) dark else light)
        return Encoded(bitmap, matrix)
    }

    private fun normalizeForWriter(toolId: String, input: String): String {
        // Generic QR and Code 128 payloads are opaque text: preserve every character.
        // Only symbologies with numeric data fields normalize human display separators.
        var clean = input
        when (toolId) {
            "ean13-barcode" -> {
                clean = clean.trim().filterNot { it == '-' || it.isWhitespace() }
                require(clean.length in 12..13 && clean.all(Char::isDigit)) { "EAN-13 requires 12 data digits or 13 digits with a check digit." }
                if (clean.length == 13) { require(lastDigitValid(clean)) { "EAN-13 check digit is invalid." }; clean = clean.dropLast(1) }
            }
            "ean8-barcode" -> {
                clean = clean.trim().filterNot { it == '-' || it.isWhitespace() }
                require(clean.length in 7..8 && clean.all(Char::isDigit)) { "EAN-8 requires 7 data digits or 8 digits with a check digit." }
                if (clean.length == 8) { require(lastDigitValid(clean)) { "EAN-8 check digit is invalid." }; clean = clean.dropLast(1) }
            }
            "upc-barcode" -> {
                clean = clean.trim().filterNot { it == '-' || it.isWhitespace() }
                require(clean.length in 11..12 && clean.all(Char::isDigit)) { "UPC-A requires 11 data digits or 12 digits with a check digit." }
                if (clean.length == 12) { require(lastDigitValid(clean)) { "UPC-A check digit is invalid." }; clean = clean.dropLast(1) }
            }
            "isbn-barcode" -> {
                clean = clean.trim().replace(Regex("(?i)^ISBN(?:-13)?:?"), "").filter(Char::isDigit)
                require(clean.length == 13 && lastDigitValid(clean)) { "ISBN barcode requires a valid 13-digit ISBN." }
                clean = clean.dropLast(1)
            }
            "itf14-barcode" -> {
                clean = clean.trim().filterNot { it == '-' || it.isWhitespace() }
                require(clean.length in 13..14 && clean.all(Char::isDigit)) { "ITF-14 requires 13 data digits or 14 digits with a check digit." }
                if (clean.length == 13) clean += gtinCheckDigit(clean) else require(lastDigitValid(clean)) { "ITF-14 check digit is invalid." }
            }
            "msi-barcode" -> {
                clean = clean.trim()
                require(clean.isNotEmpty() && clean.all(Char::isDigit)) { "MSI accepts digits only." }
            }
            "pharmacode-barcode" -> {
                clean = clean.trim()
                val n = clean.toIntOrNull()
                require(n != null && n in 3..131070) { "Pharmacode must be an integer from 3 to 131070." }
            }
            "codabar-barcode" -> {
                clean = clean.trim()
                require(clean.isNotEmpty() && clean.all { it in "0123456789-$:./+" }) { "Codabar accepts digits and - $ : . / + characters." }
            }
        }
        return clean
    }

    private fun inputError(toolId: String, preset: String?, values: Map<String, String>): String? {
        fun req(key: String, label: String) = if (values[key].isNullOrBlank()) "Enter $label." else null
        fun digits(key: String, label: String) = req(key, label) ?: if (values[key].orEmpty().count(Char::isDigit) >= 3) null else "Enter a valid ${label.lowercase()}."
        fun email(key: String, label: String) = req(key, label) ?: if (Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(values[key].orEmpty().trim())) null else "Enter a valid ${label.lowercase()}."
        fun coord(key: String, label: String, min: Double, max: Double): String? { val raw = values[key].orEmpty(); if (raw.isBlank()) return "Enter $label."; val d = raw.toDoubleOrNull(); return if (d != null && d in min..max) null else "$label must be between ${min.toInt()} and ${max.toInt()}." }
        fun first(vararg errors: String?) = errors.firstOrNull { it != null }
        if (preset == null) return if (values["value"].isNullOrBlank()) "Enter a value to encode." else null
        return when (preset) {
            "size" -> { val a = values["modules"]?.toIntOrNull() ?: 21; val b = values["modulePx"]?.toDoubleOrNull() ?: 4.0; if (a > 0 && b > 0) null else "Modules and module size must be positive numbers." }
            "version" -> req("text", "a QR payload to estimate")
            "capacity" -> { val n = values["version"]?.toIntOrNull() ?: 1; if (n in 1..40 && values["level"].orEmpty().ifBlank { "M" } in setOf("L", "M", "Q", "H")) null else "Choose a QR version from 1 to 40 and a valid error-correction level." }
            "inspect" -> req("payload", "a QR payload to inspect")
            "batch" -> { val count = values["items"].orEmpty().lineSequence().count { it.isNotBlank() }; when { count == 0 -> "Enter at least one value."; count > 50 -> "Batch generation is limited to 50 values at a time."; else -> null } }
            "high-error", "low-error", "text", "styled", "svg", "data-url" -> req("text", "something to encode")
            "url" -> { val raw = values["url"].orEmpty().trim(); if (raw.isEmpty()) "Enter a URL." else try { val u = URI(raw); if (u.scheme != null && u.host != null) null else "Enter a complete URL including its host." } catch (_: Exception) { "Enter a complete URL including https://." } }
            "wifi" -> first(req("ssid", "a network name"), if (values["security"] != "nopass") req("password", "a Wi-Fi password or choose No password") else null)
            "whatsapp" -> digits("phone", "phone number")
            "email" -> email("to", "email address")
            "phone", "sms" -> digits("phone", "phone number")
            "vcard", "mecard" -> req("name", "a contact name")
            "geo" -> first(coord("lat", "Latitude", -90.0, 90.0), coord("lng", "Longitude", -180.0, 180.0))
            "event", "calendar" -> first(req("title", "an event title"), req("start", "a start time"), req("end", "an end time"))
            "bitcoin" -> { if (values["address"].isNullOrBlank()) "Enter a Bitcoin address." else if (!values["amount"].isNullOrBlank() && (values["amount"]?.toDoubleOrNull() == null || values["amount"]!!.toDouble() < 0)) "Amount must be a non-negative number." else null }
            "ethereum", "crypto" -> req("address", "a wallet address")
            "payload" -> when (values["kind"]) { "wifi" -> req("a", "a network name"); "email" -> email("a", "email address"); "phone", "sms" -> digits("a", "phone number"); "geo" -> first(coord("a", "Latitude", -90.0, 90.0), coord("b", "Longitude", -180.0, 180.0)); else -> req("a", "a payload value") }
            else -> null
        }
    }

    private fun detectPayload(p: String): String = when {
        p.startsWith("WIFI:") -> "Wi-Fi"
        p.startsWith("BEGIN:VCARD") -> "vCard"
        p.startsWith("BEGIN:VEVENT") -> "Calendar event"
        p.startsWith("mailto:") -> "Email"
        p.startsWith("tel:") -> "Phone"
        p.startsWith("sms:") -> "SMS"
        p.startsWith("geo:") -> "Location"
        p.startsWith("bitcoin:") -> "Bitcoin payment"
        p.startsWith("http://", true) || p.startsWith("https://", true) -> "URL"
        else -> "Plain text"
    }

    private fun approxVersion(length: Int, level: String): Int {
        val factor = when (level) { "H" -> .7; "Q" -> .78; "M" -> .88; else -> 1.0 }
        return (kotlin.math.ceil(length / (factor * 20)).toInt()).coerceIn(1, 40)
    }

    private fun encodeMsi(digits: String): String {
        require(digits.isNotEmpty() && digits.all(Char::isDigit)) { "MSI accepts digits only." }
        return buildString {
            append("110")
            for (char in digits) {
                val binary = char.digitToInt().toString(2).padStart(4, '0')
                binary.forEach { append(if (it == '0') "100" else "110") }
            }
            append("1001")
        }
    }

    private fun encodePharmacode(input: String): String {
        var n = input.toIntOrNull() ?: error("Pharmacode must be an integer from 3 to 131070.")
        require(n in 3..131070) { "Pharmacode must be an integer from 3 to 131070." }
        var result = ""
        while (n != 0) {
            if (n % 2 == 0) { result = "11100$result"; n = (n - 2) / 2 }
            else { result = "100$result"; n = (n - 1) / 2 }
        }
        return result.dropLast(2)
    }

    private fun matrixFromPattern(pattern: String, height: Int): BitMatrix {
        val quiet = 10; val scale = 3; val matrix = BitMatrix(pattern.length * scale + quiet * 2, height)
        for ((index, bit) in pattern.withIndex()) if (bit == '1') for (dx in 0 until scale) for (y in 8 until height - 8) matrix.set(quiet + index * scale + dx, y)
        return matrix
    }

    private fun svgFromMatrix(matrix: BitMatrix, dark: String, light: String): String {
        val path = StringBuilder()
        for (y in 0 until matrix.height) {
            var x = 0
            while (x < matrix.width) {
                if (!matrix[x, y]) { x++; continue }
                val start = x
                while (x < matrix.width && matrix[x, y]) x++
                path.append('M').append(start).append(' ').append(y).append('h').append(x - start).append("v1H").append(start).append('z')
            }
        }
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${matrix.width} ${matrix.height}\" role=\"img\"><rect width=\"100%\" height=\"100%\" fill=\"$light\"/><path d=\"$path\" fill=\"$dark\"/></svg>"
    }

    private fun addLabel(source: Bitmap, label: String): Bitmap {
        val height = source.height + 44; val output = Bitmap.createBitmap(source.width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output); canvas.drawColor(Color.WHITE); canvas.drawBitmap(source, 0f, 0f, null)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 24f; textAlign = Paint.Align.CENTER }
        canvas.drawText(label.take(60), output.width / 2f, source.height + 30f, paint)
        return output
    }

    private fun parseColor(value: String?, fallback: Int): Int = try { if (value.isNullOrBlank()) fallback else Color.parseColor(value) } catch (_: IllegalArgumentException) { fallback }
    private fun normalizeDigits(input: String) = input.filter(Char::isDigit)

    private fun gtinCheckDigit(body: String): Int { var sum = 0; body.forEachIndexed { index, c -> sum += c.digitToInt() * if ((body.length - 1 - index) % 2 == 0) 3 else 1 }; return (10 - sum % 10) % 10 }
    private fun lastDigitValid(value: String): Boolean = value.isNotEmpty() && value.last().digitToIntOrNull() == gtinCheckDigit(value.dropLast(1))
    private fun isbn13CheckDigit(value: String): Int { require(value.length == 12 && value.all(Char::isDigit)) { "ISBN-13 requires 12 data digits." }; val sum = value.mapIndexed { index, c -> c.digitToInt() * if (index % 2 == 0) 1 else 3 }.sum(); return (10 - sum % 10) % 10 }
    private fun checkDigit(value: String): Int { var sum = 0; value.reversed().forEachIndexed { index, char -> sum += char.digitToInt() * if (index % 2 == 0) 3 else 1 }; return (10 - sum % 10) % 10 }
}
