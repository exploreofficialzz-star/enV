package com.chastech.env.engine

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.Year
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.FormatStyle
import java.time.format.ResolverStyle
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/** Pure Kotlin implementation of the canonical datetime engine; it never uses a backend. */
object NativeDateTimeEngine {
    data class Row(val label: String, val value: String)
    data class Result(val rows: List<Row>) {
        val output: String get() = rows.joinToString("\n") { "${it.label}: ${it.value}" }
    }

    private val idToOperation = linkedMapOf(
        "birthday-countdown" to "birthday", "business-day-calculator" to "business-days",
        "countdown" to "countdown", "date-difference" to "date-diff", "date-formatter" to "format",
        "deadline-calculator" to "deadline", "leap-year-checker" to "leap", "time-until-calculator" to "time-until",
        "timezone-converter" to "timezone", "week-number-calculator" to "week-number", "weekday-calculator" to "weekday",
        "workday-calculator" to "workday", "world-clock" to "world-clock", "unix-timestamp-converter" to "unix"
    )

    val supportedToolIds: Set<String> get() = idToOperation.keys
    fun operationForTool(id: String): String? = idToOperation[id]

    fun run(
        toolId: String,
        input: String = "",
        options: Map<String, String> = emptyMap(),
        now: Instant = Instant.now()
    ): Result {
        val op = idToOperation[toolId] ?: throw IllegalArgumentException("Unknown datetime tool: $toolId")
        return when (op) {
            "age" -> {
                val birth = parseDate(options["birth"] ?: input, "birth date")
                val today = now.atZone(UTC).toLocalDate()
                val years = if (today >= birth) birth.until(today).years else -today.until(birth).years
                val days = ChronoUnit.DAYS.between(birth, today)
                rows("Age (years)" to years.toString(), "Days lived" to days.toString(), "Next birthday in" to "${365 - (days % 365)} days (approx.)")
            }
            "date-diff" -> {
                val from = parseDate(options["from"], "start date")
                val to = parseDate(options["to"], "end date")
                val days = ChronoUnit.DAYS.between(from, to)
                rows("Days" to days.toString(), "Weeks" to "%.1f".format(Locale.ROOT, days / 7.0))
            }
            "workday" -> {
                val start = parseDate(options["start"] ?: options["from"], "start date")
                val days = options["days"]?.toDoubleOrNull()?.takeIf { it.isFinite() }
                    ?: throw IllegalArgumentException("Enter how many business days to add.")
                rows("Result" to formatDate(addBusinessDays(start, days), "yyyy-MM-dd EEEE"))
            }
            "business-days" -> {
                val from = parseDate(options["from"], "start date")
                val to = parseDate(options["to"], "end date")
                rows("Weekdays" to businessDaysBetween(from, to).toString())
            }
            "duration" -> {
                val from = parseInstant(options["from"], "start")
                val to = parseInstant(options["to"], "end")
                val seconds = abs(Duration.between(from, to).seconds)
                val days = seconds / 86_400
                val hours = (seconds % 86_400) / 3_600
                val minutes = (seconds % 3_600) / 60
                rows("Duration" to "${days}d ${hours}h ${minutes}m", "Total hours" to "%.2f".format(Locale.ROOT, seconds / 3600.0))
            }
            "countdown" -> countdown(parseInstant(options["target"], "target date and time"), now)
            "world-clock" -> {
                val zones = (options["zones"] ?: "").split(Regex("\\r?\\n|,"))
                    .map { it.trim() }.filter { it.isNotEmpty() }.take(20)
                if (zones.isEmpty()) throw IllegalArgumentException("Enter at least one IANA time zone.")
                Result(zones.map { zoneName ->
                    val zone = try { ZoneId.of(zoneName) } catch (_: Exception) {
                        throw IllegalArgumentException("Unknown or unsupported time zone: $zoneName")
                    }
                    Row(zoneName, localizedMedium(now, zone, Locale.UK))
                })
            }
            "timezone" -> {
                val date = parseInstant(options["time"] ?: Instant.now().toString(), "time")
                val toTz = options["toTz"]?.takeIf { it.isNotBlank() } ?: "UTC"
                val zone = try { ZoneId.of(toTz) } catch (_: Exception) {
                    throw IllegalArgumentException("Unknown or unsupported time zone: $toTz")
                }
                rows("In $toTz" to localizedMedium(date, zone, Locale.UK), "Unix" to date.epochSecond.toString())
            }
            "unix" -> unix(options["value"] ?: input)
            "format" -> {
                val date = parseInstant(options["value"] ?: input, "date")
                rows("Formatted" to formatDate(date.atZone(UTC).toLocalDateTime(), options["pattern"] ?: "yyyy-MM-dd"))
            }
            "weekday" -> rows("Weekday" to formatDate(parseInstant(options["value"] ?: input, "date").atZone(UTC).toLocalDate(), "EEEE"))
            "week-number" -> {
                val date = parseInstant(options["value"] ?: input, "date").atZone(UTC).toLocalDate()
                rows("ISO week" to date.get(WeekFields.ISO.weekOfWeekBasedYear()).toString())
            }
            "leap" -> {
                val year = options["year"]?.toIntOrNull() ?: throw IllegalArgumentException("Enter a year.")
                rows(year.toString() to if (Year.isLeap(year.toLong())) "Leap year" else "Not a leap year")
            }
            "birthday" -> {
                val birth = parseDate(options["birth"] ?: input, "birth date")
                val today = now.atZone(UTC).toLocalDate()
                var next = LocalDate.of(today.year, birth.monthValue, 1).plusDays((birth.dayOfMonth - 1).toLong())
                if (!next.atStartOfDay(UTC).toInstant().isAfter(now)) {
                    next = LocalDate.of(today.year + 1, birth.monthValue, 1).plusDays((birth.dayOfMonth - 1).toLong())
                }
                rows("Days until birthday" to ChronoUnit.DAYS.between(today, next).toString())
            }
            "time-until", "deadline" -> {
                val target = parseDate(options["target"] ?: options["value"], "target date")
                val today = now.atZone(UTC).toLocalDate()
                rows("Calendar days" to ChronoUnit.DAYS.between(today, target).toString(), "Weekdays" to businessDaysBetween(today, target).toString())
            }
            else -> throw IllegalArgumentException("Unknown date operation.")
        }
    }

    private fun rows(vararg values: Pair<String, String>) = Result(values.map { Row(it.first, it.second) })

    private val UTC: ZoneId = ZoneOffset.UTC
    private val dateOnly = DateTimeFormatter.ISO_LOCAL_DATE.withResolverStyle(ResolverStyle.STRICT)
    private fun parseDate(value: String?, label: String): LocalDate = parseInstant(value, label).atZone(UTC).toLocalDate()

    private fun parseInstant(value: String?, label: String): Instant {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter a $label.")
        try {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) return LocalDate.parse(raw, dateOnly).atStartOfDay(UTC).toInstant()
            return try { Instant.parse(raw) } catch (_: Exception) {
                val parsed = DateTimeFormatter.ISO_DATE_TIME.parse(raw)
                    java.time.temporal.TemporalQueries.offset().queryFrom(parsed)?.let {
                        java.time.OffsetDateTime.from(parsed).toInstant()
                    } ?: java.time.LocalDateTime.from(parsed).atZone(ZoneId.systemDefault()).toInstant()
            }
        } catch (_: Exception) {
            throw IllegalArgumentException("Could not read that $label. Use YYYY-MM-DD.")
        }
    }

    private fun addBusinessDays(start: LocalDate, amount: Double): LocalDate {
        var remaining = floor(abs(amount)).toLong()
        var date = start
        val direction = if (amount < 0) -1L else 1L
        while (remaining > 0) {
            date = date.plusDays(direction)
            if (date.dayOfWeek.value <= 5) remaining--
        }
        return date
    }

    private fun businessDaysBetween(from: LocalDate, to: LocalDate): Long {
        if (from == to) return 0
        val direction = if (to.isAfter(from)) 1L else -1L
        var date = from
        var count = 0L
        while (date != to) {
            date = date.plusDays(direction)
            if (date.dayOfWeek.value <= 5) count += direction
        }
        return count
    }

    private fun countdown(target: Instant, now: Instant): Result {
        val diff = Duration.between(now, target).toMillis()
        if (diff <= 0) return rows("Status" to "The target time has arrived.", "Difference" to "${String.format(Locale.ROOT, "%.0f", abs(diff / 1000.0))} seconds ago")
        val total = diff / 1000
        return rows("Countdown" to "${total / 86_400}d ${(total % 86_400) / 3_600}h ${(total % 3_600) / 60}m ${total % 60}s", "Target" to localizedMedium(target, ZoneId.systemDefault(), Locale.getDefault()), "Total seconds" to total.toString())
    }

    private fun unix(value: String): Result {
        val raw = value.trim()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter a date or timestamp.")
        if (raw.matches(Regex("^\\d+$"))) {
            val number = raw.toLongOrNull() ?: throw IllegalArgumentException("That timestamp is out of range.")
            val millis = if (raw.length > 11) number else number * 1000
            val date = try { Instant.ofEpochMilli(millis) } catch (_: Exception) { throw IllegalArgumentException("That timestamp is out of range.") }
            return rows("ISO" to date.toString(), "Local" to date.atZone(ZoneId.systemDefault()).toString())
        }
        return rows("Unix seconds" to parseInstant(raw, "date").epochSecond.toString())
    }

    private fun localizedMedium(instant: Instant, zone: ZoneId, locale: Locale): String =
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(locale).withZone(zone).format(instant)

    private fun formatDate(date: LocalDate, pattern: String): String = formatDate(date.atStartOfDay(), pattern)
    private fun formatDate(date: LocalDateTime, pattern: String): String {
        val javaPattern = translatePattern(pattern)
        return try { DateTimeFormatter.ofPattern(javaPattern, Locale.UK).format(date) }
        catch (_: Exception) { throw IllegalArgumentException("Could not apply that date pattern.") }
    }

    private fun translatePattern(pattern: String): String {
        val tokens = Regex("('(?:''|[^'])*')|([A-Za-z]+)|([^A-Za-z']+)").findAll(pattern)
        return tokens.joinToString("") { match ->
            val quoted = match.groups[1]?.value
            if (quoted != null) quoted else when (val token = match.groups[2]?.value ?: match.value) {
                "yyyy" -> "uuuu"; "yy" -> "uu"; "do" -> "d"; "D" -> "D"; "DD" -> "DD"
                "E", "EE", "EEE", "EEEE", "EEEEE", "EEEEEE" -> token
                "a" -> "a"; "X", "XX", "XXX", "x", "xx", "xxx" -> token
                else -> token
            }
        }
    }
}
