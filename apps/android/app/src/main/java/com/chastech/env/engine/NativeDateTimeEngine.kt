package com.chastech.env.engine

import java.math.BigInteger
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.Year
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.ResolverStyle
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/** Pure Kotlin implementation of the canonical datetime engine; calculations stay on device. */
object NativeDateTimeEngine {
    data class Row(val label: String, val value: String)
    data class Result(val rows: List<Row>) {
        val output: String get() = rows.joinToString("\n") { "${it.label}: ${it.value}" }
    }
    private data class ZoneChoice(val label: String, val zone: ZoneId)
    private data class ZonedInput(val instant: Instant, val overlap: Boolean)

    private val idToOperation = linkedMapOf(
        "age-calculator" to "age", "birthday-countdown" to "birthday",
        "business-day-calculator" to "business-days", "countdown" to "countdown",
        "date-calculator" to "date-add", "date-difference" to "date-diff",
        "date-formatter" to "format", "deadline-calculator" to "deadline",
        "duration-calculator" to "duration", "leap-year-checker" to "leap",
        "meeting-time-planner" to "meeting-planner", "time-until-calculator" to "time-until",
        "timezone-converter" to "timezone", "week-number-calculator" to "week-number",
        "weekday-calculator" to "weekday", "workday-calculator" to "workday",
        "world-clock" to "world-clock", "unix-timestamp-converter" to "unix"
    )

    val supportedToolIds: Set<String> get() = idToOperation.keys
    fun operationForTool(id: String): String? = idToOperation[id]

    private val cityZones = mapOf(
        "accra" to "Africa/Accra", "amsterdam" to "Europe/Amsterdam", "athens" to "Europe/Athens",
        "auckland" to "Pacific/Auckland", "bangkok" to "Asia/Bangkok", "beijing" to "Asia/Shanghai",
        "berlin" to "Europe/Berlin", "cairo" to "Africa/Cairo", "chicago" to "America/Chicago",
        "delhi" to "Asia/Kolkata", "dubai" to "Asia/Dubai", "dublin" to "Europe/Dublin",
        "hongkong" to "Asia/Hong_Kong", "istanbul" to "Europe/Istanbul", "jakarta" to "Asia/Jakarta",
        "johannesburg" to "Africa/Johannesburg", "lagos" to "Africa/Lagos", "lisbon" to "Europe/Lisbon",
        "london" to "Europe/London", "los angeles" to "America/Los_Angeles", "madrid" to "Europe/Madrid",
        "manila" to "Asia/Manila", "melbourne" to "Australia/Melbourne", "mumbai" to "Asia/Kolkata",
        "nairobi" to "Africa/Nairobi", "new delhi" to "Asia/Kolkata", "new york" to "America/New_York",
        "paris" to "Europe/Paris", "rio de janeiro" to "America/Sao_Paulo", "rome" to "Europe/Rome",
        "singapore" to "Asia/Singapore", "sydney" to "Australia/Sydney", "tokyo" to "Asia/Tokyo",
        "toronto" to "America/Toronto", "san francisco" to "America/Los_Angeles",
        "sao paulo" to "America/Sao_Paulo", "seoul" to "Asia/Seoul",
        "kuala lumpur" to "Asia/Kuala_Lumpur", "cape town" to "Africa/Johannesburg", "utc" to "UTC"
    )

    private fun normalizeCityAlias(value: String): String =
        value.trim().replace('_', ' ').trim().split(Regex("\\s+")).joinToString(" ").lowercase(Locale.ROOT)

    private val ianaCityZones: Map<String, String> by lazy(LazyThreadSafetyMode.PUBLICATION) {
        val grouped = ZoneId.getAvailableZoneIds()
            .asSequence()
            .filter { it.contains("/") && !it.startsWith("Etc/") }
            .groupBy { normalizeCityAlias(it.substringAfterLast('/')) }
        grouped.mapNotNull { (alias, ids) ->
            ids.distinct().singleOrNull()?.let { alias to it }
        }.toMap()
    }

    fun run(
        toolId: String,
        input: String = "",
        options: Map<String, String> = emptyMap(),
        now: Instant = Instant.now(),
        localTimeZone: ZoneId = ZoneId.systemDefault()
    ): Result {
        val op = idToOperation[toolId] ?: throw IllegalArgumentException("Unknown datetime tool: $toolId")
        return when (op) {
            "age" -> age(options["birth"] ?: options["value"] ?: input, now, localTimeZone)
            "date-diff" -> {
                val from = parseDate(options["from"], "start date")
                val to = parseDate(options["to"], "end date")
                val span = calendarSpan(from, to)
                val sign = if (span.totalDays < 0) "-" else ""
                rows(
                    "Calendar span" to "$sign${span.years} years, ${span.months} months, ${span.days} days",
                    "Total days" to span.totalDays.toString(),
                    "Weeks" to "%.2f".format(Locale.ROOT, span.totalDays / 7.0),
                    "Calendar hours (24-hour days)" to (span.totalDays * 24).toString()
                )
            }
            "date-add" -> {
                val start = parseDate(options["start"] ?: options["value"], "start date")
                val values = listOf("years", "months", "weeks", "days").map { key ->
                    val raw = options[key]?.trim().orEmpty()
                    if (raw.isEmpty()) 0 else raw.toIntOrNull()
                        ?: throw IllegalArgumentException("$key must be a whole number.")
                }
                if (values.none { it != 0 }) throw IllegalArgumentException("Enter at least one date unit to add or subtract.")
                val repeatRaw = options["repeatCount"]?.trim().orEmpty()
                val repeatCount = if (repeatRaw.isEmpty()) 1 else repeatRaw.toIntOrNull()?.takeIf { it in 1..100 }
                    ?: throw IllegalArgumentException("Repeat count must be a whole number from 1 to 100.")
                if (repeatCount > 1) {
                    var cursor = start
                    val result = mutableListOf(Row("Start date", formatDate(cursor, "yyyy-MM-dd EEEE")))
                    repeat(repeatCount) { index ->
                        cursor = addDateSpan(cursor, options)
                        result += Row("Occurrence ${index + 1}", formatDate(cursor, "yyyy-MM-dd EEEE"))
                    }
                    Result(result)
                } else {
                    val result = addDateSpan(start, options)
                    rows("Result" to formatDate(result, "yyyy-MM-dd EEEE"), "Date" to result.toString())
                }
            }
            "workday" -> {
                val start = parseDate(options["start"] ?: options["from"], "start date")
                val amount = options["days"]?.toDoubleOrNull()?.takeIf { it.isFinite() && it % 1.0 == 0.0 && abs(it) <= 366_000.0 }
                    ?: throw IllegalArgumentException("Business days must be a whole number between -366000 and 366000.")
                rows("Result" to formatDate(addWorkingDays(start, amount, options), "yyyy-MM-dd EEEE"))
            }
            "business-days" -> {
                val from = parseDate(options["from"], "start date")
                val to = parseDate(options["to"], "end date")
                val includeEnd = options["includeEnd"] != "false"
                val excluded = parseExcludedDates(options["excludedDates"])
                rows(
                    "Working days" to countWorkingDays(from, to, options, includeEnd).toString(),
                    "Range rule" to "Start date excluded; end date ${if (includeEnd) "included" else "excluded"}.",
                    "Custom excluded dates" to if (excluded.isEmpty()) "None supplied" else excluded.size.toString()
                )
            }
            "duration" -> {
                val from = parseInstant(options["from"], "start date and time")
                val to = parseInstant(options["to"], "end date and time")
                val seconds = abs(Duration.between(from, to).toMillis()) / 1000.0
                val whole = seconds.toLong()
                rows(
                    "Elapsed duration" to "${whole / 86400}d ${(whole % 86400) / 3600}h ${(whole % 3600) / 60}m ${whole % 60}s",
                    "Total hours" to "%.3f".format(Locale.ROOT, seconds / 3600.0),
                    "Total seconds" to "%.3f".format(Locale.ROOT, seconds)
                )
            }
            "countdown" -> countdown(parseInstant(options["target"], "target date and time"), now)
            "world-clock" -> {
                val zones = parseZoneList(options["zones"] ?: "", 20)
                Result(zones.map { item -> Row(item.label, "${localizedMedium(now, item.zone, Locale.UK)} · ${offsetLabel(now, item.zone)}") })
            }
            "timezone" -> {
                val from = resolveZone(options["fromTz"]?.takeIf { it.isNotBlank() } ?: "UTC")
                val to = resolveZone(options["toTz"]?.takeIf { it.isNotBlank() } ?: "America/New_York")
                val converted = parseWallTimeInZone(options["time"] ?: "", from.zone)
                val source = converted.instant.atZone(from.zone)
                val destination = converted.instant.atZone(to.zone)
                val dayShift = ChronoUnit.DAYS.between(source.toLocalDate(), destination.toLocalDate())
                val result = mutableListOf(
                    Row("In ${from.label}", "${localizedMedium(converted.instant, from.zone, Locale.UK)} · ${offsetLabel(converted.instant, from.zone)}"),
                    Row("In ${to.label}", "${localizedMedium(converted.instant, to.zone, Locale.UK)} · ${offsetLabel(converted.instant, to.zone)}"),
                    Row("Date change", when { dayShift == 0L -> "Same calendar day"; dayShift > 0 -> "$dayShift day(s) later"; else -> "${-dayShift} day(s) earlier" }),
                    Row("Unix seconds", converted.instant.epochSecond.toString())
                )
                if (converted.overlap) result += Row("DST note", "This local time occurs twice; the earlier occurrence was selected.")
                Result(result)
            }
            "unix" -> {
                val values = (options["value"] ?: input).split(Regex("[\\r\\n,;]+")).map { it.trim() }.filter { it.isNotEmpty() }
                if (values.isEmpty()) throw IllegalArgumentException("Enter a date or Unix timestamp.")
                if (values.size == 1) unixRows(values.first())
                else {
                    if (values.size > 100) throw IllegalArgumentException("Batch conversion is limited to 100 timestamps.")
                    Result(values.mapIndexed { index, value ->
                        val converted = unixRows(value)
                        Row("Timestamp ${index + 1}", "${converted.rows[1].value} | ${converted.rows.last().value} ns")
                    })
                }
            }
            "format" -> {
                val date = parseDate(options["value"] ?: input, "date")
                rows("Formatted" to formatDate(date, options["pattern"] ?: "yyyy-MM-dd"))
            }
            "weekday" -> rows("Weekday" to formatDate(parseDate(options["value"] ?: input, "date"), "EEEE"))
            "week-number" -> {
                val date = parseDate(options["value"] ?: input, "date")
                rows(
                    "ISO week" to date.get(WeekFields.ISO.weekOfWeekBasedYear()).toString(),
                    "ISO week-year" to date.get(WeekFields.ISO.weekBasedYear()).toString()
                )
            }
            "leap" -> {
                val year = options["year"]?.toIntOrNull()?.takeIf { it in 1..9999 }
                    ?: throw IllegalArgumentException("Enter a year from 1 to 9999.")
                rows(year.toString() to if (Year.isLeap(year.toLong())) "Leap year" else "Not a leap year")
            }
            "birthday" -> birthday(options["birth"] ?: input, now, options, localTimeZone)
            "time-until" -> {
                val target = parseDate(options["target"] ?: options["value"], "target date")
                val today = now.atZone(localTimeZone).toLocalDate()
                val span = calendarSpan(today, target)
                val sign = if (span.totalDays < 0) "-" else ""
                rows(
                    "Calendar span" to "$sign${span.years} years, ${span.months} months, ${span.days} days",
                    "Total days" to span.totalDays.toString()
                )
            }
            "deadline" -> {
                val target = parseDate(options["target"] ?: options["value"], "deadline")
                val today = now.atZone(localTimeZone).toLocalDate()
                val includeEnd = options["includeEnd"] == "true"
                rows(
                    "Calendar days remaining" to ChronoUnit.DAYS.between(today, target).toString(),
                    "Working days remaining" to countWorkingDays(today, target, options, includeEnd).toString(),
                    "Deadline weekday" to formatDate(target, "EEEE"),
                    "End-date rule" to if (includeEnd) "Deadline date included" else "Deadline date excluded"
                )
            }
            "meeting-planner" -> meetingSlots(options, now)
            else -> throw IllegalArgumentException("Unknown date operation.")
        }
    }

    private data class CalendarSpan(val years: Long, val months: Long, val days: Long, val totalDays: Long)
    private fun calendarSpan(from: LocalDate, to: LocalDate): CalendarSpan {
        val start = if (from <= to) from else to
        val end = if (from <= to) to else from
        val years = ChronoUnit.YEARS.between(start, end)
        val afterYears = start.plusYears(years)
        val months = ChronoUnit.MONTHS.between(afterYears, end)
        val afterMonths = afterYears.plusMonths(months)
        val days = ChronoUnit.DAYS.between(afterMonths, end)
        return CalendarSpan(years, months, days, ChronoUnit.DAYS.between(from, to))
    }

    private fun age(value: String, now: Instant, localTimeZone: ZoneId): Result {
        val birth = parseDate(value, "birth date")
        val today = now.atZone(localTimeZone).toLocalDate()
        if (birth > today) throw IllegalArgumentException("Birth date cannot be in the future.")
        val years = ChronoUnit.YEARS.between(birth, today)
        val afterYears = birth.plusYears(years)
        val months = ChronoUnit.MONTHS.between(afterYears, today)
        val days = ChronoUnit.DAYS.between(afterYears.plusMonths(months), today)
        return rows("Age" to "$years years, $months months, $days days", "Days lived" to ChronoUnit.DAYS.between(birth, today).toString())
    }

    private fun birthday(value: String, now: Instant, options: Map<String, String>, localTimeZone: ZoneId): Result {
        val birth = parseDate(value, "birth date")
        val today = now.atZone(localTimeZone).toLocalDate()
        var month = birth.monthValue
        var day = birth.dayOfMonth
        if (month == 2 && day == 29 && !Year.isLeap(today.year.toLong()) && options["leapBirthday"] == "mar-1") {
            month = 3; day = 1
        } else if (month == 2 && day == 29 && !Year.isLeap(today.year.toLong())) {
            day = 28
        }
        var next = LocalDate.of(today.year, month, day)
        if (!next.isAfter(today)) {
            val nextYear = today.year + 1
            val nextDay = if (month == 2 && day == 29 && !Year.isLeap(nextYear.toLong())) 28 else day
            next = LocalDate.of(nextYear, month, nextDay)
        }
        return rows("Days until birthday" to ChronoUnit.DAYS.between(today, next).toString())
    }

    private fun addDateSpan(start: LocalDate, options: Map<String, String>): LocalDate {
        val rawDirection = options["direction"]?.trim().orEmpty()
        val direction = when (rawDirection) {
            "", "add" -> 1L
            "subtract" -> -1L
            else -> throw IllegalArgumentException("Direction must be add or subtract.")
        }
        fun amount(key: String): Long = (options[key]?.toLongOrNull() ?: 0L) * direction
        return start.plusYears(amount("years")).plusMonths(amount("months"))
            .plusWeeks(amount("weeks")).plusDays(amount("days"))
    }

    private fun resolveZone(raw: String): ZoneChoice {
        val input = raw.trim()
        if (input.isEmpty()) throw IllegalArgumentException("Enter a time zone or city.")
        val key = normalizeCityAlias(input)
        val id = cityZones[key] ?: ianaCityZones[key] ?: input
        val zone = try { ZoneId.of(id) } catch (_: Exception) {
            throw IllegalArgumentException("Unknown city or time zone: $input. Use a city name or IANA ID such as Africa/Lagos.")
        }
        return ZoneChoice(input, zone)
    }

    private fun parseZoneList(value: String, limit: Int): List<ZoneChoice> {
        val choices = value.split(Regex("[\\r\\n,;]+")).map { it.trim() }.filter { it.isNotEmpty() }
        if (choices.isEmpty()) throw IllegalArgumentException("Enter at least one city or IANA time zone.")
        if (choices.size > limit) throw IllegalArgumentException("Enter no more than $limit cities or time zones.")
        return choices.map { resolveZone(it) }.distinctBy { it.zone.id }
    }

    private fun parseWallTimeInZone(rawValue: String, zone: ZoneId): ZonedInput {
        val raw = rawValue.trim()
        if (raw.endsWith("Z", true) || Regex("[+-]\\d{2}:\\d{2}$").containsMatchIn(raw)) {
            return ZonedInput(parseInstant(raw, "time"), false)
        }
        val local = try { LocalDateTime.parse(raw, DateTimeFormatter.ISO_LOCAL_DATE_TIME) } catch (_: Exception) {
            throw IllegalArgumentException("Enter a local time as YYYY-MM-DDTHH:mm, or include an explicit UTC offset.")
        }
        val offsets = zone.rules.getValidOffsets(local)
        if (offsets.isEmpty()) {
            throw IllegalArgumentException("That local time does not exist in $zone because the clock moves forward for daylight saving time. Choose another time.")
        }
        return ZonedInput(local.toInstant(offsets.first()), offsets.size > 1)
    }

    private fun offsetLabel(instant: Instant, zone: ZoneId): String {
        val offset = zone.rules.getOffset(instant)
        val total = offset.totalSeconds
        val sign = if (total < 0) "-" else "+"
        val absolute = abs(total)
        return "UTC$sign${(absolute / 3600).toString().padStart(2, '0')}:${((absolute % 3600) / 60).toString().padStart(2, '0')}"
    }

    private fun localizedMedium(instant: Instant, zone: ZoneId, locale: Locale): String =
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM).withLocale(locale).withZone(zone).format(instant)

    private fun parseWeekendDays(options: Map<String, String>): Set<Int> {
        val raw = options["weekendDays"]?.trim().orEmpty()
        if (raw.isEmpty()) return setOf(0, 6)
        val days = raw.split(Regex("[,\\s]+")).mapNotNull { it.toIntOrNull() }
        if (days.size != raw.split(Regex("[,\\s]+")).size || days.any { it !in 0..6 }) {
            throw IllegalArgumentException("Weekend days must be numbers from 0 (Sunday) to 6 (Saturday).")
        }
        return days.toSet()
    }

    private fun parseExcludedDates(value: String?): Set<LocalDate> =
        value.orEmpty().split(Regex("[\\r\\n,;]+")).map { it.trim() }.filter { it.isNotEmpty() }.map {
            try { LocalDate.parse(it, dateOnly) } catch (_: Exception) { throw IllegalArgumentException("Invalid custom excluded date: $it") }
        }.toSet()

    private fun isWorkingDate(date: LocalDate, weekends: Set<Int>, excluded: Set<LocalDate>): Boolean =
        (date.dayOfWeek.value % 7) !in weekends && date !in excluded

    private fun countWorkingDays(from: LocalDate, to: LocalDate, options: Map<String, String>, includeEnd: Boolean): Long {
        val weekends = parseWeekendDays(options)
        val excluded = parseExcludedDates(options["excludedDates"])
        val direction = if (to >= from) 1L else -1L
        var cursor = from
        var count = 0L
        repeat(366_000) {
            cursor = cursor.plusDays(direction)
            if (cursor == to && !includeEnd) return count
            if (if (direction > 0) cursor > to else cursor < to) return count
            if (isWorkingDate(cursor, weekends, excluded)) count += direction
            if (cursor == to) return count
        }
        throw IllegalArgumentException("That working-day range is too large.")
    }

    private fun addWorkingDays(start: LocalDate, amount: Double, options: Map<String, String>): LocalDate {
        if (!amount.isFinite() || amount % 1.0 != 0.0 || abs(amount) > 366_000.0) {
            throw IllegalArgumentException("Business days must be a whole number between -366000 and 366000.")
        }
        val weekends = parseWeekendDays(options)
        val excluded = parseExcludedDates(options["excludedDates"])
        var remaining = floor(abs(amount)).toLong()
        val direction = if (amount < 0) -1L else 1L
        var cursor = start
        repeat(366_000) {
            if (remaining <= 0) return cursor
            cursor = cursor.plusDays(direction)
            if (isWorkingDate(cursor, weekends, excluded)) remaining--
            if (remaining <= 0) return cursor
        }
        throw IllegalArgumentException("That workday range is too large.")
    }

    private fun meetingSlots(options: Map<String, String>, now: Instant): Result {
        val zones = parseZoneList(options["zones"] ?: "", 8)
        if (zones.size < 2) throw IllegalArgumentException("Add at least two cities or time zones to compare.")
        val anchor = resolveZone(options["sourceTz"]?.takeIf { it.isNotBlank() } ?: zones.first().zone.id)
        val date = parseDate(options["date"], "meeting date")
        val workStart = options["workStart"] ?: "09:00"
        val workEnd = options["workEnd"] ?: "17:00"
        val startMinutes = parseClock(workStart)
        val endMinutes = parseClock(workEnd)
        if (endMinutes <= startMinutes) {
            throw IllegalArgumentException("The meeting planner requires a daytime work window: end time must be later than start time.")
        }
        fun meetingLimit(key: String, label: String, fallback: Int, minimum: Int, maximum: Int): Int {
            val raw = options[key]?.trim().orEmpty()
            if (raw.isEmpty()) return fallback
            val value = raw.toIntOrNull()
                ?: throw IllegalArgumentException("$label must be a whole number from $minimum to $maximum.")
            if (value !in minimum..maximum) throw IllegalArgumentException("$label must be a whole number from $minimum to $maximum.")
            return value
        }
        val duration = meetingLimit("durationMinutes", "Meeting length", 30, 5, 480)
        val interval = meetingLimit("intervalMinutes", "Slot interval", 30, 5, 120)
        val start = parseWallTimeInZone("${date}T$workStart", anchor.zone).instant
        val end = parseWallTimeInZone("${date}T$workEnd", anchor.zone).instant
        if (end <= start) throw IllegalArgumentException("The reference city's work window is not valid on that date.")
        val slots = mutableListOf<Pair<Instant, String>>()
        var cursor = start
        while (cursor.plusSeconds(duration * 60L) <= end && slots.size < 500) {
            val finish = cursor.plusSeconds(duration * 60L)
            val local = zones.map { choice ->
                val a = cursor.atZone(choice.zone)
                val b = finish.atZone(choice.zone)
                val aMinutes = a.hour * 60 + a.minute
                val bMinutes = b.hour * 60 + b.minute
                val sameDay = a.toLocalDate() == b.toLocalDate()
                Triple(choice, a, sameDay && a.dayOfWeek.value in 1..5 && aMinutes >= startMinutes && bMinutes <= endMinutes)
            }
            if (local.all { it.third }) {
                val label = local.joinToString(" | ") { (choice, time, _) ->
                    "${choice.label}: ${time.format(DateTimeFormatter.ofPattern("HH:mm"))} (${offsetLabel(cursor, choice.zone)})"
                }
                slots += cursor to label
            }
            cursor = cursor.plusSeconds(interval * 60L)
        }
        if (slots.isEmpty()) return rows("Available slots" to "No shared Monday-Friday working-hours slots found. This checks working hours, not personal calendar free/busy.")
        val shown = slots.take(8)
        val rows = mutableListOf(Row("Available slots", "${slots.size} matching Monday-Friday slots; showing the first ${shown.size}. This checks working hours, not personal calendar free/busy."))
        shown.forEachIndexed { index, slot -> rows += Row("Option ${index + 1}", slot.second) }
        val first = shown.first().first
        val finish = first.plusSeconds(duration * 60L)
        val icsFormatter = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
        val ics = listOf(
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//enV//Date Time Planner//EN", "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT", "UID:env-" + icsFormatter.format(first) + "-meeting@envtools.store",
            "DTSTAMP:" + icsFormatter.format(now), "DTSTART:" + icsFormatter.format(first),
            "DTEND:" + icsFormatter.format(finish), "SUMMARY:Meeting", "END:VEVENT", "END:VCALENDAR"
        ).joinToString("\r\n")
        rows += Row("ICS for option 1", ics)
        return Result(rows)
    }

    private fun parseClock(value: String): Int {
        val time = try { LocalTime.parse(value, DateTimeFormatter.ofPattern("HH:mm")) } catch (_: Exception) {
            throw IllegalArgumentException("Enter working hours as HH:mm using a 24-hour clock.")
        }
        return time.hour * 60 + time.minute
    }

    private fun unixRows(value: String): Result {
        val raw = value.trim()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter a date or timestamp.")
        var precision = "date input"
        val instant = if (raw.matches(Regex("^-?\\d+$"))) {
            val digits = raw.removePrefix("-").length
            val number = try { BigInteger(raw) } catch (_: Exception) { throw IllegalArgumentException("That timestamp is out of range.") }
            val multiplier = when {
                digits <= 10 -> { precision = "seconds"; BigInteger("1000000000") }
                digits <= 13 -> { precision = "milliseconds"; BigInteger("1000000") }
                digits <= 16 -> { precision = "microseconds"; BigInteger("1000") }
                digits <= 19 -> { precision = "nanoseconds"; BigInteger.ONE }
                else -> throw IllegalArgumentException("Timestamp is too large.")
            }
            val totalNanos = number.multiply(multiplier)
            val divisor = BigInteger("1000000000")
            val division = totalNanos.divideAndRemainder(divisor)
            var seconds = division[0]
            var nanos = division[1]
            if (nanos.signum() < 0) { seconds = seconds.subtract(BigInteger.ONE); nanos = nanos.add(divisor) }
            if (seconds < BigInteger.valueOf(Long.MIN_VALUE) || seconds > BigInteger.valueOf(Long.MAX_VALUE)) {
                throw IllegalArgumentException("That timestamp is out of range.")
            }
            Instant.ofEpochSecond(seconds.toLong(), nanos.toLong())
        } else parseInstant(raw, "date")
        val totalNanos = BigInteger.valueOf(instant.epochSecond).multiply(BigInteger("1000000000")).add(BigInteger.valueOf(instant.nano.toLong()))
        return rows(
            "Detected precision" to precision,
            "ISO UTC" to DateTimeFormatter.ISO_INSTANT.format(instant),
            "Local" to localizedMedium(instant, ZoneId.systemDefault(), Locale.getDefault()),
            "Unix seconds" to instant.epochSecond.toString(),
            "Unix milliseconds" to totalNanos.divide(BigInteger("1000000")).toString(),
            "Unix microseconds" to totalNanos.divide(BigInteger("1000")).toString(),
            "Unix nanoseconds" to totalNanos.toString()
        )
    }

    private fun countdown(target: Instant, now: Instant): Result {
        val diff = Duration.between(now, target).toMillis()
        if (diff <= 0) return rows("Status" to "The target time has arrived.", "Difference" to "${String.format(Locale.ROOT, "%.0f", abs(diff / 1000.0))} seconds ago")
        val total = diff / 1000
        return rows(
            "Countdown" to "${total / 86_400}d ${(total % 86_400) / 3_600}h ${(total % 3_600) / 60}m ${total % 60}s",
            "Target" to localizedMedium(target, ZoneId.systemDefault(), Locale.getDefault()),
            "Total seconds" to total.toString()
        )
    }

    private val UTC: ZoneId = ZoneOffset.UTC
    private val dateOnly = DateTimeFormatter.ISO_LOCAL_DATE.withResolverStyle(ResolverStyle.STRICT)
    private fun parseDate(value: String?, label: String): LocalDate {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter a $label.")
        return try {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) LocalDate.parse(raw, dateOnly)
            else parseInstant(raw, label).atZone(UTC).toLocalDate()
        } catch (_: Exception) {
            throw IllegalArgumentException("Could not read that $label. Use YYYY-MM-DD.")
        }
    }

    private fun parseInstant(value: String?, label: String): Instant {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter a $label.")
        try {
            if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) return LocalDate.parse(raw, dateOnly).atStartOfDay(UTC).toInstant()
            return try { Instant.parse(raw) } catch (_: Exception) {
                val parsed = DateTimeFormatter.ISO_DATE_TIME.parse(raw)
                val offset = parsed.query(java.time.temporal.TemporalQueries.offset())
                if (offset != null) java.time.OffsetDateTime.from(parsed).toInstant()
                else java.time.LocalDateTime.from(parsed).atZone(ZoneId.systemDefault()).toInstant()
            }
        } catch (_: Exception) {
            throw IllegalArgumentException("Could not read that $label. Use an ISO-8601 date/time.")
        }
    }

    private fun formatDate(date: LocalDate, pattern: String): String {
        val javaPattern = pattern.replace("yyyy", "uuuu").replace("do", "d")
        return try { DateTimeFormatter.ofPattern(javaPattern, Locale.UK).format(date) }
        catch (_: Exception) { throw IllegalArgumentException("Could not apply that date pattern.") }
    }

    private fun rows(vararg values: Pair<String, String>) = Result(values.map { Row(it.first, it.second) })
}