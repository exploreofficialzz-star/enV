import Foundation

public struct NativeDateTimeRow: Equatable {
    public let label: String
    public let value: String
    public init(label: String, value: String) { self.label = label; self.value = value }
}

public struct NativeDateTimeResult: Equatable {
    public let rows: [NativeDateTimeRow]
    public var output: String { rows.map { "\($0.label): \($0.value)" }.joined(separator: "\n") }
    public init(rows: [NativeDateTimeRow]) { self.rows = rows }
}

public enum NativeDateTimeError: LocalizedError {
    case unknownTool, invalidDate(String), invalidOperation(String)
    public var errorDescription: String? {
        switch self {
        case .unknownTool: return "Unknown datetime tool."
        case .invalidDate(let label): return "Could not read that \(label). Use YYYY-MM-DD."
        case .invalidOperation(let message): return message
        }
    }
}

/** Pure Swift implementation of the canonical datetime engine; it never uses a backend. */
public enum NativeDateTimeEngine {
    private static let operations: [String: String] = [
        "age-calculator": "age", "birthday-countdown": "birthday", "business-day-calculator": "business-days", "countdown": "countdown",
        "date-calculator": "date-add", "duration-calculator": "duration", "meeting-time-planner": "meeting-planner",
        "date-difference": "date-diff", "date-formatter": "format", "deadline-calculator": "deadline",
        "leap-year-checker": "leap", "time-until-calculator": "time-until", "timezone-converter": "timezone",
        "week-number-calculator": "week-number", "weekday-calculator": "weekday", "workday-calculator": "workday",
        "world-clock": "world-clock", "unix-timestamp-converter": "unix"
    ]
    public static let supportedToolIDs = [
        "age-calculator", "birthday-countdown", "business-day-calculator", "countdown", "date-calculator", "date-difference", "date-formatter", "duration-calculator",
        "deadline-calculator", "leap-year-checker", "time-until-calculator", "timezone-converter",
        "week-number-calculator", "weekday-calculator", "workday-calculator", "meeting-time-planner", "world-clock", "unix-timestamp-converter"
    ]
    private static var utc: TimeZone { TimeZone(secondsFromGMT: 0)! }
    public static func operation(forToolID id: String) -> String? { operations[id] }

    public static func run(toolID: String, input: String = "", options: [String: String] = [:], now: Date = Date(), localTimeZone: TimeZone = .current) throws -> NativeDateTimeResult {
        guard let operation = operations[toolID] else { throw NativeDateTimeError.unknownTool }
        switch operation {
        case "age":
            let birth = try dateOnly(options["birth"] ?? input, label: "birth date")
            let cal = calendar(.gregorian)
            let today = deviceToday(now, in: localTimeZone)
            guard birth <= today else { throw NativeDateTimeError.invalidOperation("Birth date cannot be in the future.") }
            let span = calendarSpan(birth, today)
            let lived = cal.dateComponents([.day], from: birth, to: today).day ?? 0
            return result(("Age", "\(span.years) years, \(span.months) months, \(span.days) days"), ("Days lived", String(lived)))
        case "date-diff":
            let from = try dateOnly(options["from"] ?? "", label: "start date")
            let to = try dateOnly(options["to"] ?? "", label: "end date")
            let span = calendarSpan(from, to)
            let sign = span.totalDays < 0 ? "-" : ""
            return result(("Calendar span", "\(sign)\(span.years) years, \(span.months) months, \(span.days) days"), ("Total days", String(span.totalDays)), ("Weeks", String(format: "%.2f", Double(span.totalDays) / 7)), ("Calendar hours (24-hour days)", String(span.totalDays * 24)))
        case "date-add":
            let start = try dateOnly(options["start"] ?? options["value"] ?? "", label: "start date")
            let unitValues = try ["years", "months", "weeks", "days"].map { key -> Int in
                let raw = (options[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if raw.isEmpty { return 0 }
                guard let value = Int(raw) else { throw NativeDateTimeError.invalidOperation("\(key) must be a whole number.") }
                return value
            }
            guard unitValues.contains(where: { $0 != 0 }) else { throw NativeDateTimeError.invalidOperation("Enter at least one date unit to add or subtract.") }
            let repeatRaw = (options["repeatCount"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let repeatCount = repeatRaw.isEmpty ? 1 : Int(repeatRaw)
            guard let repeatCount, (1...100).contains(repeatCount) else {
                throw NativeDateTimeError.invalidOperation("Repeat count must be a whole number from 1 to 100.")
            }
            if repeatCount > 1 {
                var cursor = start
                var rows: [(String, String)] = [("Start date", format(cursor, pattern: "yyyy-MM-dd EEEE"))]
                for index in 1...repeatCount {
                    cursor = try addDateSpan(cursor, options: options)
                    rows.append(("Occurrence \(index)", format(cursor, pattern: "yyyy-MM-dd EEEE")))
                }
                return NativeDateTimeResult(rows: rows.map { NativeDateTimeRow(label: $0.0, value: $0.1) })
            }
            let calculated = try addDateSpan(start, options: options)
            return result(("Result", format(calculated, pattern: "yyyy-MM-dd EEEE")), ("Date", format(calculated, pattern: "yyyy-MM-dd")))
        case "workday":
            let start = try dateOnly(options["start"] ?? options["from"] ?? "", label: "start date")
            guard let amount = Double(options["days"] ?? ""), amount.isFinite,
                  amount.rounded(.towardZero) == amount, abs(amount) <= 366_000 else {
                throw NativeDateTimeError.invalidOperation("Business days must be a whole number between -366000 and 366000.")
            }
            return result(("Result", format(try addWorkingDays(start, amount, options: options), pattern: "yyyy-MM-dd EEEE")))
        case "business-days":
            let from = try dateOnly(options["from"] ?? "", label: "start date")
            let to = try dateOnly(options["to"] ?? "", label: "end date")
            let includeEnd = options["includeEnd"] != "false"
            let excluded = try excludedDates(options["excludedDates"] ?? "")
            let count = try countWorkingDays(from: from, to: to, options: options, includeEnd: includeEnd)
            return result(("Working days", String(count)), ("Range rule", "Start date excluded; end date \(includeEnd ? "included" : "excluded")."), ("Custom excluded dates", excluded.isEmpty ? "None supplied" : String(excluded.count)))
        case "duration":
            let from = try parseDate(options["from"] ?? "", label: "start date and time")
            let to = try parseDate(options["to"] ?? "", label: "end date and time")
            let seconds = abs(to.timeIntervalSince(from))
            let whole = Int(seconds)
            return result(("Elapsed duration", "\(whole / 86400)d \((whole % 86400) / 3600)h \((whole % 3600) / 60)m \(whole % 60)s"), ("Total hours", String(format: "%.3f", seconds / 3600)), ("Total seconds", String(format: "%.3f", seconds)))
        case "countdown":
            return try countdown(try parseDate(options["target"] ?? "", label: "target date and time"), now: now)
        case "world-clock":
            let zones = try parseZoneList(options["zones"] ?? "", limit: 20)
            return NativeDateTimeResult(rows: try zones.map { item in
                NativeDateTimeRow(label: item.label, value: "\(localizedMedium(now, zone: item.zone, locale: Locale(identifier: "en_GB"))) · \(offsetLabel(now, zone: item.zone))")
            })
        case "timezone":
            let fromName = options["fromTz"]?.isEmpty == false ? options["fromTz"]! : "UTC"
            let toName = options["toTz"]?.isEmpty == false ? options["toTz"]! : "America/New_York"
            let fromChoice = try resolveZone(fromName)
            let toChoice = try resolveZone(toName)
            let converted = try parseWallTimeInZone(options["time"] ?? "", zone: fromChoice.zone)
            let instant = converted.instant
            var sourceCalendar = Calendar(identifier: .gregorian); sourceCalendar.timeZone = fromChoice.zone
            var destinationCalendar = Calendar(identifier: .gregorian); destinationCalendar.timeZone = toChoice.zone
            let source = sourceCalendar.dateComponents([.year, .month, .day], from: instant)
            let destination = destinationCalendar.dateComponents([.year, .month, .day], from: instant)
            var utcCalendar = Calendar(identifier: .gregorian); utcCalendar.timeZone = utc
            let sourceDay = utcCalendar.date(from: source)!
            let destinationDay = utcCalendar.date(from: destination)!
            let dayShift = calendar(.gregorian).dateComponents([.day], from: sourceDay, to: destinationDay).day ?? 0
            let dayText = dayShift == 0 ? "Same calendar day" : dayShift > 0 ? "\(dayShift) day(s) later" : "\(-dayShift) day(s) earlier"
            var rows: [(String, String)] = [
                ("In \(fromName)", "\(localizedMedium(instant, zone: fromChoice.zone, locale: Locale(identifier: "en_GB"))) · \(offsetLabel(instant, zone: fromChoice.zone))"),
                ("In \(toName)", "\(localizedMedium(instant, zone: toChoice.zone, locale: Locale(identifier: "en_GB"))) · \(offsetLabel(instant, zone: toChoice.zone))"),
                ("Date change", dayText),
                ("Unix seconds", String(Int(instant.timeIntervalSince1970)))
            ]
            if converted.overlap {
                rows.append(("DST note", "This local time occurs twice; the earlier occurrence was selected."))
            }
            return NativeDateTimeResult(rows: rows.map { NativeDateTimeRow(label: $0.0, value: $0.1) })
        case "unix":
            let values = (options["value"] ?? input)
                .components(separatedBy: CharacterSet(charactersIn: ",;\n\r"))
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            guard !values.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a date or Unix timestamp.") }
            guard values.count <= 100 else { throw NativeDateTimeError.invalidOperation("Batch conversion is limited to 100 timestamps.") }
            if values.count == 1 { return try unix(values[0]) }
            var rows: [NativeDateTimeRow] = []
            for (index, value) in values.enumerated() {
                let converted = try unix(value)
                guard converted.rows.count >= 7 else { throw NativeDateTimeError.invalidOperation("Could not convert timestamp batch item.") }
                rows.append(NativeDateTimeRow(
                    label: "Timestamp \(index + 1)",
                    value: "\(converted.rows[1].value) | \(converted.rows[6].value) ns"
                ))
            }
            return NativeDateTimeResult(rows: rows)
        case "format":
            let date = try parseDate(options["value"] ?? input, label: "date")
            return result(("Formatted", format(date, pattern: options["pattern"] ?? "yyyy-MM-dd")))
        case "weekday":
            return result(("Weekday", format(try parseDate(options["value"] ?? input, label: "date"), pattern: "EEEE")))
        case "week-number":
            let date = try parseDate(options["value"] ?? input, label: "date")
            var iso = Calendar(identifier: .iso8601); iso.timeZone = utc
            return result(("ISO week", String(iso.component(.weekOfYear, from: date))), ("ISO week-year", String(iso.component(.yearForWeekOfYear, from: date))))
        case "leap":
            guard let year = Int(options["year"] ?? ""), (1...9999).contains(year) else { throw NativeDateTimeError.invalidOperation("Enter a year from 1 to 9999.") }
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
            return result((String(year), leap ? "Leap year" : "Not a leap year"))
        case "birthday":
            let birth = try dateOnly(options["birth"] ?? input, label: "birth date")
            let today = deviceToday(now, in: localTimeZone)
            let parts = calendar(.gregorian).dateComponents([.month, .day], from: birth)
            var month = parts.month ?? 1
            var day = parts.day ?? 1
            let year = calendar(.gregorian).component(.year, from: today)
            if month == 2 && day == 29 && !isLeapYear(year) && options["leapBirthday"] == "mar-1" {
                month = 3; day = 1
            } else if month == 2 && day == 29 && !isLeapYear(calendar(.gregorian).component(.year, from: today)) {
                day = 28
            }
            var next = calendar(.gregorian).date(from: DateComponents(year: year, month: month, day: day))!
            if next < today {
                let nextYear = year + 1
                if month == 2 && day == 29 && !isLeapYear(nextYear) { day = 28 }
                next = calendar(.gregorian).date(from: DateComponents(year: nextYear, month: month, day: day))!
            }
            return result(("Days until birthday", String(calendar(.gregorian).dateComponents([.day], from: today, to: next).day ?? 0)))
        case "time-until":
            let target = try dateOnly(options["target"] ?? options["value"] ?? "", label: "target date")
            let today = deviceToday(now, in: localTimeZone)
            let span = calendarSpan(today, target)
            let sign = span.totalDays < 0 ? "-" : ""
            return result(("Calendar span", "\(sign)\(span.years) years, \(span.months) months, \(span.days) days"), ("Total days", String(span.totalDays)))
        case "deadline":
            let target = try dateOnly(options["target"] ?? options["value"] ?? "", label: "deadline")
            let today = deviceToday(now, in: localTimeZone)
            let includeEnd = options["includeEnd"] == "true"
            let working = try countWorkingDays(from: today, to: target, options: options, includeEnd: includeEnd)
            return result(("Calendar days remaining", String(calendar(.gregorian).dateComponents([.day], from: today, to: target).day ?? 0)), ("Working days remaining", String(working)), ("Deadline weekday", format(target, pattern: "EEEE")), ("End-date rule", includeEnd ? "Deadline date included" : "Deadline date excluded"))
        case "meeting-planner":
            return try meetingSlots(options, now: now)
        default: throw NativeDateTimeError.invalidOperation("Unknown date operation.")
        }
    }

    private static func result(_ pairs: (String, String)...) -> NativeDateTimeResult { NativeDateTimeResult(rows: pairs.map { NativeDateTimeRow(label: $0.0, value: $0.1) }) }
    private static func deviceToday(_ instant: Date, in timeZone: TimeZone) -> Date {
        var localCalendar = Calendar(identifier: .gregorian)
        localCalendar.timeZone = timeZone
        let parts = localCalendar.dateComponents([.year, .month, .day], from: instant)
        return calendar(.gregorian).date(from: parts)!
    }

    private static func isLeapYear(_ year: Int) -> Bool {
        year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    }

    private static func calendar(_ identifier: Calendar.Identifier) -> Calendar { var c = Calendar(identifier: identifier); c.timeZone = utc; c.locale = Locale(identifier: "en_GB"); return c }

    private static func dateOnly(_ value: String, label: String) throws -> Date {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a \(label).") }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar(.gregorian); f.timeZone = utc; f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let date = f.date(from: raw), f.string(from: date) == raw else { throw NativeDateTimeError.invalidDate(label) }
        return date
    }

    private static func parseDate(_ value: String, label: String) throws -> Date {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a \(label).") }
        if raw.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil { return try dateOnly(raw, label: label) }
        let iso = ISO8601DateFormatter(); iso.timeZone = utc; iso.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
        if let date = iso.date(from: raw) { return date }
        for pattern in ["yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX", "yyyy-MM-dd'T'HH:mm:ssXXXXX", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm"] {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar(.gregorian); f.timeZone = pattern.contains("X") ? utc : TimeZone.current; f.dateFormat = pattern; f.isLenient = false
            if let date = f.date(from: raw) { return date }
        }
        throw NativeDateTimeError.invalidDate(label)
    }

    private static func addBusinessDays(_ start: Date, _ amount: Double) -> Date {
        var left = Int(abs(amount).rounded(.towardZero)); let direction = amount < 0 ? -1 : 1; var date = start; var cal = calendar(.gregorian)
        while left > 0 { date = cal.date(byAdding: .day, value: direction, to: date)!; let weekday = cal.component(.weekday, from: date); if weekday != 1 && weekday != 7 { left -= 1 } }
        return date
    }
    private static func businessDaysBetween(_ from: Date, _ to: Date) -> Int {
        let cal = calendar(.gregorian); let start = cal.startOfDay(for: from), end = cal.startOfDay(for: to); if start == end { return 0 }
        let direction = end > start ? 1 : -1; var date = start; var count = 0
        while date != end { date = cal.date(byAdding: .day, value: direction, to: date)!; let weekday = cal.component(.weekday, from: date); if weekday != 1 && weekday != 7 { count += direction } }
        return count
    }
    private static func countdown(_ target: Date, now: Date) throws -> NativeDateTimeResult {
        let difference = target.timeIntervalSince(now)
        if difference <= 0 { return result(("Status", "The target time has arrived."), ("Difference", String(format: "%.0f seconds ago", abs(difference)))) }
        let total = Int(difference); return result(("Countdown", "\(total / 86400)d \((total % 86400) / 3600)h \((total % 3600) / 60)m \(total % 60)s"), ("Target", localizedMedium(target, zone: TimeZone.current, locale: Locale.current)), ("Total seconds", String(total)))
    }
    private static func unix(_ value: String) throws -> NativeDateTimeResult {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a date or timestamp.") }
        let isInteger = raw.range(of: "^-?\\d+$", options: .regularExpression) != nil
        var totalNanos: Int64
        var precision = "date input"
        if isInteger {
            guard let number = Int64(raw) else { throw NativeDateTimeError.invalidOperation("That timestamp is out of range.") }
            let digits = raw.replacingOccurrences(of: "-", with: "").count
            let multiplier: Int64
            switch digits {
            case 0...10: multiplier = 1_000_000_000; precision = "seconds"
            case 11...13: multiplier = 1_000_000; precision = "milliseconds"
            case 14...16: multiplier = 1_000; precision = "microseconds"
            case 17...19: multiplier = 1; precision = "nanoseconds"
            default: throw NativeDateTimeError.invalidOperation("Timestamp is too large.")
            }
            let multiplied = number.multipliedReportingOverflow(by: multiplier)
            guard !multiplied.overflow else { throw NativeDateTimeError.invalidOperation("That timestamp is out of range.") }
            totalNanos = multiplied.partialValue
        } else {
            let date = try parseDate(raw, label: "date")
            let nanos = date.timeIntervalSince1970 * 1_000_000_000
            guard nanos.isFinite, nanos >= Double(Int64.min), nanos <= Double(Int64.max) else {
                throw NativeDateTimeError.invalidOperation("That timestamp is out of range.")
            }
            totalNanos = Int64(nanos.rounded())
        }
        let divisor: Int64 = 1_000_000_000
        var wholeSeconds = totalNanos / divisor
        var nanosRemainder = totalNanos % divisor
        if nanosRemainder < 0 {
            wholeSeconds -= 1
            nanosRemainder += divisor
        }
        let date = Date(timeIntervalSince1970: Double(totalNanos) / 1_000_000_000)
        return result(
            ("Detected precision", precision),
            ("ISO UTC", isoStringFromUnixNanoseconds(totalNanos)),
            ("Local", date.description(with: Locale.current)),
            ("Unix seconds", String(wholeSeconds)),
            ("Unix milliseconds", String(floorDivide(totalNanos, by: 1_000_000))),
            ("Unix microseconds", String(floorDivide(totalNanos, by: 1_000))),
            ("Unix nanoseconds", String(totalNanos))
        )
    }
    private static func floorDivide(_ value: Int64, by divisor: Int64) -> Int64 {
        let quotient = value / divisor
        let remainder = value % divisor
        return remainder < 0 ? quotient - 1 : quotient
    }
    private static func isoStringFromUnixNanoseconds(_ value: Int64) -> String {
        let divisor: Int64 = 1_000_000_000
        var wholeSeconds = value / divisor
        var nanos = value % divisor
        if nanos < 0 {
            wholeSeconds -= 1
            nanos += divisor
        }
        let baseDate = Date(timeIntervalSince1970: Double(wholeSeconds))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar(.gregorian)
        formatter.timeZone = utc
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        let fraction = String(nanos).padding(toLength: 9, withPad: "0", startingAt: 0)
        return "\(formatter.string(from: baseDate)).\(fraction)Z"
    }
    private static func localizedMedium(_ date: Date, zone: TimeZone, locale: Locale) -> String { let f = DateFormatter(); f.locale = locale; f.timeZone = zone; f.dateStyle = .medium; f.timeStyle = .medium; return f.string(from: date) }
    private static func isoString(_ date: Date) -> String { let f = ISO8601DateFormatter(); f.timeZone = utc; f.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime, .withFractionalSeconds]; return f.string(from: date) }
    private static func format(_ date: Date, pattern: String) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.calendar = calendar(.gregorian); f.timeZone = utc; f.dateFormat = pattern.replacingOccurrences(of: "do", with: "d"); return f.string(from: date) }

    private struct ZonedWallTime {
        let instant: Date
        let overlap: Bool
    }

    private static func parseWallTimeInZone(_ rawValue: String, zone: TimeZone) throws -> ZonedWallTime {
        let raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasSuffix("Z") || raw.range(of: "[+-]\\d{2}:\\d{2}$", options: .regularExpression) != nil {
            return ZonedWallTime(instant: try parseDate(raw, label: "time"), overlap: false)
        }
        let parts = raw.split(separator: "T", maxSplits: 1).map(String.init)
        guard parts.count == 2,
              parts[1].range(of: "^\\d{2}:\\d{2}(:\\d{2})?$", options: .regularExpression) != nil else {
            throw NativeDateTimeError.invalidOperation("Enter a local time as YYYY-MM-DDTHH:mm, or include an explicit UTC offset.")
        }
        let date = try dateOnly(parts[0], label: "time")
        let time = parts[1].split(separator: ":").compactMap { Int($0) }
        guard time.count == 2 || time.count == 3,
              time[0] <= 23, time[1] <= 59, (time.count == 2 || time[2] <= 59) else {
            throw NativeDateTimeError.invalidOperation("Enter a valid local time.")
        }
        let dateParts = calendar(.gregorian).dateComponents([.year, .month, .day], from: date)
        let second = time.count == 3 ? time[2] : 0
        var wallCalendar = Calendar(identifier: .gregorian)
        wallCalendar.timeZone = zone
        let matching = DateComponents(
            year: dateParts.year, month: dateParts.month, day: dateParts.day,
            hour: time[0], minute: time[1], second: second
        )
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = utc
        guard let naive = utcCalendar.date(from: matching) else {
            throw NativeDateTimeError.invalidOperation("Enter a valid local date and time.")
        }
        let searchStart = naive.addingTimeInterval(-48 * 60 * 60)
        func matchesLocalWallTime(_ candidate: Date) -> Bool {
            let resolved = wallCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: candidate)
            return resolved.year == dateParts.year && resolved.month == dateParts.month &&
                resolved.day == dateParts.day && resolved.hour == time[0] &&
                resolved.minute == time[1] && resolved.second == second
        }
        guard let first = wallCalendar.nextDate(
            after: searchStart, matching: matching,
            matchingPolicy: .strict, repeatedTimePolicy: .first, direction: .forward
        ), abs(first.timeIntervalSince(naive)) < 48 * 60 * 60, matchesLocalWallTime(first) else {
            throw NativeDateTimeError.invalidOperation("That local time does not exist in this time zone because the clock moves forward for daylight saving time. Choose another time.")
        }
        let last = wallCalendar.nextDate(
            after: searchStart, matching: matching,
            matchingPolicy: .strict, repeatedTimePolicy: .last, direction: .forward
        )
        let overlap = last.map { $0 != first && abs($0.timeIntervalSince(naive)) < 48 * 60 * 60 && matchesLocalWallTime($0) } ?? false
        return ZonedWallTime(instant: first, overlap: overlap)
    }

    private struct ZoneChoice {
        let label: String
        let zone: TimeZone
    }

    private static let cityZones: [String: String] = [
        "accra": "Africa/Accra", "amsterdam": "Europe/Amsterdam", "athens": "Europe/Athens",
        "auckland": "Pacific/Auckland", "bangkok": "Asia/Bangkok", "beijing": "Asia/Shanghai",
        "berlin": "Europe/Berlin", "cairo": "Africa/Cairo", "chicago": "America/Chicago",
        "delhi": "Asia/Kolkata", "dubai": "Asia/Dubai", "dublin": "Europe/Dublin",
        "hong kong": "Asia/Hong_Kong", "istanbul": "Europe/Istanbul", "jakarta": "Asia/Jakarta",
        "kathmandu": "Asia/Katmandu", "johannesburg": "Africa/Johannesburg", "lagos": "Africa/Lagos", "lisbon": "Europe/Lisbon",
        "london": "Europe/London", "los angeles": "America/Los_Angeles", "madrid": "Europe/Madrid",
        "manila": "Asia/Manila", "melbourne": "Australia/Melbourne", "mumbai": "Asia/Kolkata",
        "nairobi": "Africa/Nairobi", "new delhi": "Asia/Kolkata", "new york": "America/New_York",
        "paris": "Europe/Paris", "rio de janeiro": "America/Sao_Paulo", "rome": "Europe/Rome",
        "san francisco": "America/Los_Angeles", "sao paulo": "America/Sao_Paulo",
        "seoul": "Asia/Seoul", "singapore": "Asia/Singapore", "sydney": "Australia/Sydney",
        "tokyo": "Asia/Tokyo", "toronto": "America/Toronto", "kuala lumpur": "Asia/Kuala_Lumpur",
        "cape town": "Africa/Johannesburg", "utc": "UTC"
    ]

    private static func normalizeCityAlias(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ")
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .lowercased()
    }

    private static let ianaCityZones: [String: String] = {
        var grouped: [String: Set<String>] = [:]
        for identifier in TimeZone.knownTimeZoneIdentifiers where identifier.contains("/") && !identifier.hasPrefix("Etc/") {
            guard let city = identifier.split(separator: "/").last else { continue }
            let key = normalizeCityAlias(String(city))
            guard !key.isEmpty else { continue }
            grouped[key, default: []].insert(identifier)
        }
        return grouped.compactMapValues { identifiers in
            identifiers.count == 1 ? identifiers.first : nil
        }
    }()

    private static func resolveZone(_ raw: String) throws -> ZoneChoice {
        let label = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !label.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a city or IANA time zone.") }
        let key = normalizeCityAlias(label)
        let identifier = cityZones[key] ?? ianaCityZones[key] ?? label
        guard let zone = TimeZone(identifier: identifier) else {
            throw NativeDateTimeError.invalidOperation("Unknown city or time zone: \(label). Use a city name or IANA ID such as Africa/Lagos.")
        }
        return ZoneChoice(label: label, zone: zone)
    }

    private static func parseZoneList(_ value: String, limit: Int) throws -> [ZoneChoice] {
        let raw = value.components(separatedBy: CharacterSet(charactersIn: ",;\n\r"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter at least one city or IANA time zone.") }
        guard raw.count <= limit else { throw NativeDateTimeError.invalidOperation("Enter no more than \(limit) cities or time zones.") }
        var seen = Set<String>()
        var result: [ZoneChoice] = []
        for item in raw {
            let zone = try resolveZone(item)
            if seen.insert(zone.zone.identifier).inserted { result.append(zone) }
            if result.count >= limit { break }
        }
        return result
    }

    private static func offsetLabel(_ date: Date, zone: TimeZone) -> String {
        let seconds = zone.secondsFromGMT(for: date)
        let sign = seconds < 0 ? "-" : "+"
        let value = abs(seconds)
        return String(format: "UTC%@%02d:%02d", sign, value / 3600, (value % 3600) / 60)
    }

    private static func calendarSpan(_ from: Date, _ to: Date) -> (years: Int, months: Int, days: Int, totalDays: Int) {
        let cal = calendar(.gregorian)
        let start = min(from, to)
        let end = max(from, to)
        var years = cal.component(.year, from: end) - cal.component(.year, from: start)
        var afterYears = cal.date(byAdding: .year, value: years, to: start)!
        if afterYears > end {
            years -= 1
            afterYears = cal.date(byAdding: .year, value: years, to: start)!
        }
        let afterYearComponents = cal.dateComponents([.year, .month], from: afterYears)
        let endComponents = cal.dateComponents([.year, .month], from: end)
        var months = ((endComponents.year ?? 0) - (afterYearComponents.year ?? 0)) * 12 +
            (endComponents.month ?? 1) - (afterYearComponents.month ?? 1)
        var afterMonths = cal.date(byAdding: .month, value: months, to: afterYears)!
        if afterMonths > end {
            months -= 1
            afterMonths = cal.date(byAdding: .month, value: months, to: afterYears)!
        }
        let days = cal.dateComponents([.day], from: afterMonths, to: end).day ?? 0
        let total = cal.dateComponents([.day], from: from, to: to).day ?? 0
        return (years, months, days, total)
    }

    private static func addDateSpan(_ start: Date, options: [String: String]) throws -> Date {
        let rawDirection = (options["direction"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let direction: Int
        switch rawDirection {
        case "", "add": direction = 1
        case "subtract": direction = -1
        default: throw NativeDateTimeError.invalidOperation("Direction must be add or subtract.")
        }
        let cal = calendar(.gregorian)
        var result = start
        for component in [Calendar.Component.year, .month, .weekOfYear, .day] {
            let key: String
            switch component {
            case .year: key = "years"
            case .month: key = "months"
            case .weekOfYear: key = "weeks"
            default: key = "days"
            }
            guard let amount = Int(options[key] ?? "0") else {
                throw NativeDateTimeError.invalidOperation("Enter a whole number for \(key).")
            }
            guard let calculated = cal.date(byAdding: component, value: amount * direction, to: result) else {
                throw NativeDateTimeError.invalidOperation("That date calculation is outside the supported range.")
            }
            result = calculated
        }
        return result
    }

    private static func weekendDays(_ options: [String: String]) throws -> Set<Int> {
        let raw = (options["weekendDays"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return [1, 7] }
        let parts = raw.split(whereSeparator: { $0 == "," || $0.isWhitespace })
        guard !parts.isEmpty else {
            throw NativeDateTimeError.invalidOperation("Weekend days must be numbers from 0 (Sunday) to 6 (Saturday).")
        }
        var days = Set<Int>()
        for part in parts {
            guard let value = Int(part), (0...6).contains(value) else {
                throw NativeDateTimeError.invalidOperation("Weekend days must be numbers from 0 (Sunday) to 6 (Saturday).")
            }
            days.insert(value)
        }
        return days
    }

    private static func excludedDates(_ raw: String) throws -> Set<Date> {
        let values = raw.components(separatedBy: CharacterSet(charactersIn: ",;\n\r"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return Set(try values.map { try dateOnly($0, label: "excluded date") })
    }

    private static func isWorkingDay(_ date: Date, weekends: Set<Int>, excluded: Set<Date>) -> Bool {
        let cal = calendar(.gregorian)
        // Public inputs and the Web/Android engines number Sunday as 0 through Saturday as 6.
        // Foundation's Calendar uses Sunday=1 through Saturday=7, so normalize before matching.
        let weekendIndex = cal.component(.weekday, from: date) - 1
        return !weekends.contains(weekendIndex) && !excluded.contains(cal.startOfDay(for: date))
    }

    private static func countWorkingDays(from: Date, to: Date, options: [String: String], includeEnd: Bool) throws -> Int {
        let cal = calendar(.gregorian)
        let weekends = try weekendDays(options)
        let excluded = try excludedDates(options["excludedDates"] ?? "")
        let direction = to >= from ? 1 : -1
        var cursor = cal.startOfDay(for: from)
        let end = cal.startOfDay(for: to)
        var count = 0
        for _ in 0..<366_000 {
            cursor = cal.date(byAdding: .day, value: direction, to: cursor)!
            if cursor == end && !includeEnd { return count }
            if direction > 0 ? cursor > end : cursor < end { return count }
            if isWorkingDay(cursor, weekends: weekends, excluded: excluded) { count += direction }
            if cursor == end { return count }
        }
        throw NativeDateTimeError.invalidOperation("That working-day range is too large.")
    }

    private static func addWorkingDays(_ start: Date, _ amount: Double, options: [String: String]) throws -> Date {
        guard amount.isFinite, amount.rounded(.towardZero) == amount, abs(amount) <= 366_000 else {
            throw NativeDateTimeError.invalidOperation("Business days must be a whole number between -366000 and 366000.")
        }
        let cal = calendar(.gregorian)
        let weekends = try weekendDays(options)
        let excluded = try excludedDates(options["excludedDates"] ?? "")
        var remaining = Int(abs(amount).rounded(.towardZero))
        let direction = amount < 0 ? -1 : 1
        var date = cal.startOfDay(for: start)
        for _ in 0..<366_000 {
            if remaining <= 0 { return date }
            date = cal.date(byAdding: .day, value: direction, to: date)!
            if isWorkingDay(date, weekends: weekends, excluded: excluded) { remaining -= 1 }
            if remaining <= 0 { return date }
        }
        throw NativeDateTimeError.invalidOperation("That workday range is too large.")
    }

    private static func parseClock(_ raw: String) throws -> Int {
        let pieces = raw.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2, (0...23).contains(pieces[0]), (0...59).contains(pieces[1]) else {
            throw NativeDateTimeError.invalidOperation("Enter working hours as HH:mm using a 24-hour clock.")
        }
        return pieces[0] * 60 + pieces[1]
    }

    private static func meetingSlots(_ options: [String: String], now: Date) throws -> NativeDateTimeResult {
        let zones = try parseZoneList(options["zones"] ?? "", limit: 8)
        guard zones.count >= 2 else { throw NativeDateTimeError.invalidOperation("Add at least two cities or time zones to compare.") }
        let anchor = try resolveZone(options["sourceTz"]?.isEmpty == false ? options["sourceTz"]! : zones[0].zone.identifier)
        let date = try dateOnly(options["date"] ?? "", label: "meeting date")
        let workStart = options["workStart"] ?? "09:00"
        let workEnd = options["workEnd"] ?? "17:00"
        let startMinutes = try parseClock(workStart)
        let endMinutes = try parseClock(workEnd)
        guard endMinutes > startMinutes else {
            throw NativeDateTimeError.invalidOperation("The meeting planner requires a daytime work window: end time must be later than start time.")
        }
        func meetingLimit(_ key: String, label: String, fallback: Int, minimum: Int, maximum: Int) throws -> Int {
            let raw = (options[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { return fallback }
            guard let value = Int(raw), (minimum...maximum).contains(value) else {
                throw NativeDateTimeError.invalidOperation("\(label) must be a whole number from \(minimum) to \(maximum).")
            }
            return value
        }
        let duration = try meetingLimit("durationMinutes", label: "Meeting length", fallback: 30, minimum: 5, maximum: 480)
        let interval = try meetingLimit("intervalMinutes", label: "Slot interval", fallback: 30, minimum: 5, maximum: 120)
        let dayText = format(date, pattern: "yyyy-MM-dd")
        let localFormatter = DateFormatter()
        localFormatter.locale = Locale(identifier: "en_US_POSIX")
        localFormatter.timeZone = anchor.zone
        localFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        localFormatter.isLenient = false
        guard let start = localFormatter.date(from: "\(dayText) \(workStart):00"),
              localFormatter.string(from: start) == "\(dayText) \(workStart):00" else {
            throw NativeDateTimeError.invalidOperation("The reference city's work start is not a valid local time.")
        }
        guard var end = localFormatter.date(from: "\(dayText) \(workEnd):00"),
              localFormatter.string(from: end) == "\(dayText) \(workEnd):00" else {
            throw NativeDateTimeError.invalidOperation("The reference city's work end is not a valid local time.")
        }
        guard end > start else {
            throw NativeDateTimeError.invalidOperation("The reference city's work window is not valid on that date.")
        }
        var slots: [(Date, String)] = []
        var cursor = start
        while cursor.addingTimeInterval(Double(duration * 60)) <= end && slots.count < 500 {
            let finish = cursor.addingTimeInterval(Double(duration * 60))
            var localValues: [(String, String)] = []
            var suitable = true
            for item in zones {
                var cal = Calendar(identifier: .gregorian); cal.timeZone = item.zone
                let a = cal.dateComponents([.year, .month, .day, .hour, .minute], from: cursor)
                let b = cal.dateComponents([.year, .month, .day, .hour, .minute], from: finish)
                let sameDay = a.year == b.year && a.month == b.month && a.day == b.day
                let localStart = (a.hour ?? 0) * 60 + (a.minute ?? 0)
                let localEnd = (b.hour ?? 0) * 60 + (b.minute ?? 0)
                let weekday = cal.component(.weekday, from: cursor)
                if !sameDay || !(2...6).contains(weekday) || localStart < startMinutes || localEnd > endMinutes {
                    suitable = false
                    break
                }
                let time = String(format: "%02d:%02d", a.hour ?? 0, a.minute ?? 0)
                localValues.append((item.label, "\(time) (\(offsetLabel(cursor, zone: item.zone)))"))
            }
            if suitable {
                slots.append((cursor, localValues.map { "\($0.0): \($0.1)" }.joined(separator: " | ")))
            }
            cursor = cursor.addingTimeInterval(Double(interval * 60))
        }
        guard !slots.isEmpty else {
            return result(("Available slots", "No shared Monday-Friday working-hours slots found. This checks working hours, not personal calendar free/busy."))
        }
        let shown = Array(slots.prefix(8))
        var output: [(String, String)] = [
            ("Available slots", "\(slots.count) matching Monday-Friday slots; showing the first \(shown.count). This checks working hours, not personal calendar free/busy.")
        ]
        for (index, slot) in shown.enumerated() { output.append(("Option \(index + 1)", slot.1)) }
        let first = shown[0].0
        let last = first.addingTimeInterval(Double(duration * 60))
        let stamp = ISO8601DateFormatter()
        stamp.timeZone = utc
        stamp.formatOptions = [.withInternetDateTime]
        let icsDate: (Date) -> String = { stamp.string(from: $0).replacingOccurrences(of: "-", with: "").replacingOccurrences(of: ":", with: "") }
        let ics = [
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//enV//Date Time Planner//EN", "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT", "UID:env-" + icsDate(first) + "-meeting@envtools.store", "DTSTAMP:" + icsDate(now),
            "DTSTART:" + icsDate(first), "DTEND:" + icsDate(last), "SUMMARY:Meeting", "END:VEVENT", "END:VCALENDAR"
        ].joined(separator: "\r\n")
        output.append(("ICS for option 1", ics))
        return NativeDateTimeResult(rows: output.map { NativeDateTimeRow(label: $0.0, value: $0.1) })
    }
}
