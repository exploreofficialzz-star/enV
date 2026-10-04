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
        "birthday-countdown": "birthday", "business-day-calculator": "business-days", "countdown": "countdown",
        "date-difference": "date-diff", "date-formatter": "format", "deadline-calculator": "deadline",
        "leap-year-checker": "leap", "time-until-calculator": "time-until", "timezone-converter": "timezone",
        "week-number-calculator": "week-number", "weekday-calculator": "weekday", "workday-calculator": "workday",
        "world-clock": "world-clock", "unix-timestamp-converter": "unix"
    ]
    public static let supportedToolIDs = [
        "birthday-countdown", "business-day-calculator", "countdown", "date-difference", "date-formatter",
        "deadline-calculator", "leap-year-checker", "time-until-calculator", "timezone-converter",
        "week-number-calculator", "weekday-calculator", "workday-calculator", "world-clock", "unix-timestamp-converter"
    ]
    private static var utc: TimeZone { TimeZone(secondsFromGMT: 0)! }
    public static func operation(forToolID id: String) -> String? { operations[id] }

    public static func run(toolID: String, input: String = "", options: [String: String] = [:], now: Date = Date()) throws -> NativeDateTimeResult {
        guard let operation = operations[toolID] else { throw NativeDateTimeError.unknownTool }
        switch operation {
        case "age":
            let birth = try dateOnly(options["birth"] ?? input, label: "birth date")
            let today = calendar(.gregorian).startOfDay(for: now)
            let years = calendar(.gregorian).dateComponents([.year], from: birth, to: today).year ?? 0
            let days = calendar(.gregorian).dateComponents([.day], from: birth, to: today).day ?? 0
            return result(("Age (years)", String(years)), ("Days lived", String(days)), ("Next birthday in", "\(365 - (days % 365)) days (approx.)"))
        case "date-diff":
            let from = try dateOnly(options["from"] ?? "", label: "start date")
            let to = try dateOnly(options["to"] ?? "", label: "end date")
            let days = calendar(.gregorian).dateComponents([.day], from: from, to: to).day ?? 0
            return result(("Days", String(days)), ("Weeks", String(format: "%.1f", Double(days) / 7)))
        case "workday":
            let start = try dateOnly(options["start"] ?? options["from"] ?? "", label: "start date")
            guard let amount = Double(options["days"] ?? ""), amount.isFinite else { throw NativeDateTimeError.invalidOperation("Enter how many business days to add.") }
            return result(("Result", format(addBusinessDays(start, amount), pattern: "yyyy-MM-dd EEEE")))
        case "business-days":
            let from = try dateOnly(options["from"] ?? "", label: "start date")
            let to = try dateOnly(options["to"] ?? "", label: "end date")
            return result(("Weekdays", String(businessDaysBetween(from, to))))
        case "duration":
            let from = try parseDate(options["from"] ?? "", label: "start")
            let to = try parseDate(options["to"] ?? "", label: "end")
            let seconds = abs(to.timeIntervalSince(from))
            let whole = Int(seconds)
            return result(("Duration", "\(whole / 86400)d \((whole % 86400) / 3600)h \((whole % 3600) / 60)m"), ("Total hours", String(format: "%.2f", seconds / 3600)))
        case "countdown":
            return try countdown(try parseDate(options["target"] ?? "", label: "target date and time"), now: now)
        case "world-clock":
            let zones = (options["zones"] ?? "").split(whereSeparator: { $0 == "," || $0 == "\n" || $0 == "\r" }).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.prefix(20)
            guard !zones.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter at least one IANA time zone.") }
            return NativeDateTimeResult(rows: try zones.map { name in
                guard let zone = TimeZone(identifier: name) else { throw NativeDateTimeError.invalidOperation("Unknown or unsupported time zone: \(name)") }
                return NativeDateTimeRow(label: name, value: localizedMedium(now, zone: zone, locale: Locale(identifier: "en_GB")))
            })
        case "timezone":
            let date = try parseDate(options["time"] ?? isoString(Date()), label: "time")
            let toName = options["toTz"]?.isEmpty == false ? options["toTz"]! : "UTC"
            guard let zone = TimeZone(identifier: toName) else { throw NativeDateTimeError.invalidOperation("Unknown or unsupported time zone: \(toName)") }
            return result(("In \(toName)", localizedMedium(date, zone: zone, locale: Locale(identifier: "en_GB"))), ("Unix", String(Int(date.timeIntervalSince1970))))
        case "unix":
            return try unix(options["value"] ?? input)
        case "format":
            let date = try parseDate(options["value"] ?? input, label: "date")
            return result(("Formatted", format(date, pattern: options["pattern"] ?? "yyyy-MM-dd")))
        case "weekday":
            return result(("Weekday", format(try parseDate(options["value"] ?? input, label: "date"), pattern: "EEEE")))
        case "week-number":
            let date = try parseDate(options["value"] ?? input, label: "date")
            var iso = Calendar(identifier: .iso8601); iso.timeZone = utc
            return result(("ISO week", String(iso.component(.weekOfYear, from: date))))
        case "leap":
            guard let year = Int(options["year"] ?? "") else { throw NativeDateTimeError.invalidOperation("Enter a year.") }
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
            return result((String(year), leap ? "Leap year" : "Not a leap year"))
        case "birthday":
            let birth = try dateOnly(options["birth"] ?? input, label: "birth date")
            var cal = calendar(.gregorian); let today = cal.startOfDay(for: now)
            let components = cal.dateComponents([.month, .day], from: birth)
            var next = cal.date(from: DateComponents(year: cal.component(.year, from: today), month: components.month, day: 1))!
            next = cal.date(byAdding: .day, value: (components.day ?? 1) - 1, to: next)!
            if next <= now {
                next = cal.date(from: DateComponents(year: cal.component(.year, from: today) + 1, month: components.month, day: 1))!
                next = cal.date(byAdding: .day, value: (components.day ?? 1) - 1, to: next)!
            }
            return result(("Days until birthday", String(cal.dateComponents([.day], from: today, to: next).day ?? 0)))
        case "time-until", "deadline":
            let target = try dateOnly(options["target"] ?? options["value"] ?? "", label: "target date")
            let today = calendar(.gregorian).startOfDay(for: now)
            return result(("Calendar days", String(calendar(.gregorian).dateComponents([.day], from: today, to: target).day ?? 0)), ("Weekdays", String(businessDaysBetween(today, target))))
        default: throw NativeDateTimeError.invalidOperation("Unknown date operation.")
        }
    }

    private static func result(_ pairs: (String, String)...) -> NativeDateTimeResult { NativeDateTimeResult(rows: pairs.map { NativeDateTimeRow(label: $0.0, value: $0.1) }) }
    private static func calendar(_ identifier: Calendar.Identifier) -> Calendar { var c = Calendar(identifier: identifier); c.timeZone = utc; c.locale = Locale(identifier: "en_GB"); return c }

    private static func dateOnly(_ value: String, label: String) throws -> Date {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a \(label).") }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar(.gregorian); f.timeZone = utc; f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let date = f.date(from: raw) else { throw NativeDateTimeError.invalidDate(label) }
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
        var cal = calendar(.gregorian); let start = cal.startOfDay(for: from), end = cal.startOfDay(for: to); if start == end { return 0 }
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
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines); guard !raw.isEmpty else { throw NativeDateTimeError.invalidOperation("Enter a date or timestamp.") }
        if raw.range(of: "^\\d+$", options: .regularExpression) != nil {
            guard let number = Int64(raw) else { throw NativeDateTimeError.invalidOperation("That timestamp is out of range.") }
            let seconds = raw.count > 11 ? Double(number) / 1000 : Double(number); let date = Date(timeIntervalSince1970: seconds); guard date.timeIntervalSince1970.isFinite else { throw NativeDateTimeError.invalidOperation("That timestamp is out of range.") }
            return result(("ISO", isoString(date)), ("Local", date.description(with: Locale.current)))
        }
        return result(("Unix seconds", String(Int(try parseDate(raw, label: "date").timeIntervalSince1970))))
    }
    private static func localizedMedium(_ date: Date, zone: TimeZone, locale: Locale) -> String { let f = DateFormatter(); f.locale = locale; f.timeZone = zone; f.dateStyle = .medium; f.timeStyle = .medium; return f.string(from: date) }
    private static func isoString(_ date: Date) -> String { let f = ISO8601DateFormatter(); f.timeZone = utc; f.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime, .withFractionalSeconds]; return f.string(from: date) }
    private static func format(_ date: Date, pattern: String) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.calendar = calendar(.gregorian); f.timeZone = utc; f.dateFormat = pattern.replacingOccurrences(of: "do", with: "d"); return f.string(from: date) }
}
