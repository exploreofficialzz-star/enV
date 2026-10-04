package com.chastech.env.engine

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.abs

/** Numeric rules mirrored from the web calculator numeric layer. */
object NativeNumberParser {
    private val plain = Regex("(?:\\d+\\.?\\d*|\\.\\d+)")
    private val exponent = Regex("^(.*?)([eE][+-]?\\d+)?$")

    fun parse(raw: String?, label: String = "value"): Double {
        val original = raw ?: ""
        val text = original.trim()
            .replace('\u2212', '-')
            .replace('\u2012', '-')
            .replace('\u2013', '-')
            .replace('\u2014', '-')
            .replace('\u00A0', ' ')
            .replace('\u2009', ' ')
            .replace('\u202F', ' ')
        if (text.isBlank()) error("Enter a value for $label.")
        val match = exponent.matchEntire(text) ?: error("Enter a valid number for $label.")
        val mantissa = normalizeMantissa(match.groupValues[1]) ?: error("Enter a valid number for $label.")
        val value = (mantissa + (match.groupValues.getOrNull(2) ?: "")).toDoubleOrNull()
            ?: error("Enter a valid number for $label.")
        if (!value.isFinite()) error("$label is too large to calculate with.")
        return if (value == 0.0) 0.0 else value
    }

    private fun normalizeMantissa(input: String): String? {
        var sign = ""
        var body = input
        if (body.startsWith('+') || body.startsWith('-')) {
            if (body.startsWith('-')) sign = "-"
            body = body.drop(1)
        }
        if (body.isEmpty()) return null
        val hasComma = ',' in body
        val hasDot = '.' in body
        val hasSpace = ' ' in body
        if (!hasComma && !hasSpace) return if (plain.matches(body)) sign + body else null

        var decimal: Char? = null
        if (hasComma && hasDot) decimal = if (body.lastIndexOf(',') > body.lastIndexOf('.')) ',' else '.'
        else if (hasDot) decimal = '.'
        else if (hasComma && !hasSpace) {
            val pieces = body.split(',')
            if (pieces.size == 2) {
                val before = pieces[0]; val after = pieces[1]
                val loneThousands = after.length == 3 && Regex("[1-9]\\d{0,2}").matches(after) && before.isNotEmpty()
                if (before.matches(Regex("\\d*")) && after.matches(Regex("\\d+")) && !loneThousands) decimal = ','
            }
        } else if (hasComma && hasSpace) decimal = ','

        var integer = body
        var fraction = ""
        if (decimal != null) {
            val at = body.lastIndexOf(decimal)
            integer = body.substring(0, at)
            fraction = body.substring(at + 1)
            if (!fraction.matches(Regex("\\d+"))) return null
        }
        val digits = when {
            integer.matches(Regex("\\d+")) -> integer
            integer.matches(Regex("\\d{1,3}(?: \\d{3})+")) -> integer.replace(" ", "")
            integer.matches(Regex("\\d{1,3}(?:,\\d{3})+")) && decimal != ',' -> integer.replace(",", "")
            integer.matches(Regex("\\d{1,2}(?:,\\d{2})+,\\d{3}")) && decimal != ',' -> integer.replace(",", "")
            integer.matches(Regex("\\d{1,3}(?:\\.\\d{3})+")) && decimal == ',' -> integer.replace(".", "")
            integer.isEmpty() && decimal != null -> "0"
            else -> return null
        }
        return sign + digits + if (fraction.isNotEmpty()) ".${fraction}" else ""
    }

    fun format(value: Double): String {
        if (!value.isFinite()) return "—"
        if (value == 0.0) return "0"
        val a = abs(value)
        if (a >= 1e15 || a < 1e-6) {
            val raw = String.format(Locale.US, "%.12e", value)
            val parts = raw.split('e')
            val mantissa = parts[0].trimEnd('0').trimEnd('.')
            val exp = parts[1].toIntOrNull()?.toString() ?: parts[1]
            return "${mantissa}e$exp"
        }
        val formatter = DecimalFormat("#,##0.############", DecimalFormatSymbols(Locale.getDefault()))
        formatter.isGroupingUsed = true
        return formatter.format(value)
    }
}
