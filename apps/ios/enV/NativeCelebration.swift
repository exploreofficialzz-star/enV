import Combine
import Foundation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum NativeCelebrationEngine {
    struct Parsed {
        let occasion: String
        let experience: String
    }
    struct Result {
        let text: String
        let html: String
        let checks: [String]
    }
    struct Countdown {
        let days: Int
        let hours: Int
        let minutes: Int
        let seconds: Int
        let complete: Bool
    }

    static let occasions: [String] = [
        "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
        "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party"
    ]
    static let experiences: Set<String> = [
        "page-generator", "interactive-card", "invitation-generator", "countdown",
        "memory-page", "reveal-page", "quiz-generator", "surprise-page"
    ]
    private static let labels: [String: String] = [
        "birthday": "Birthday", "anniversary": "Anniversary", "graduation": "Graduation",
        "valentine": "Valentine's Day", "christmas": "Christmas", "new-year": "New Year",
        "congratulations": "Congratulations", "thank-you": "Thank You", "appreciation": "Appreciation",
        "farewell": "Farewell", "achievement": "Achievement", "party": "Party"
    ]
    private static let messages: [String: String] = [
        "birthday": "Another year, another reason to celebrate.",
        "anniversary": "A meaningful milestone in a story worth celebrating.",
        "graduation": "A milestone earned through effort, growth and persistence.",
        "valentine": "A moment to celebrate care, connection and the people who matter.",
        "christmas": "Wishing you a season filled with warmth and good company.",
        "new-year": "A fresh chapter, new possibilities and a reason to gather.",
        "congratulations": "Recognising a milestone and the work that made it possible.",
        "thank-you": "A thoughtful moment to recognise someone's kindness and support.",
        "appreciation": "Taking time to recognise the people who make a difference.",
        "farewell": "Celebrating the memories made and the next chapter ahead.",
        "achievement": "A milestone worth recognising and remembering.",
        "party": "Good people, a shared moment and a reason to celebrate."
    ]
    private static let themes: [String: (accent: String, background: String, ink: String)] = [
        "Classic": ("#4b5563", "#f8fafc", "#202833"),
        "Rose": ("#9f4564", "#fff6f8", "#39232d"),
        "Gold": ("#946b12", "#fffaf0", "#332a18"),
        "Garden": ("#35745a", "#f4fbf5", "#1c3328"),
        "Ocean": ("#246d91", "#f1f9fc", "#18313d"),
        "Midnight": ("#6579d9", "#10172a", "#f4f5fb")
    ]

    static func parse(_ toolID: String) -> Parsed? {
        let normalized = toolID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for occasion in occasions where normalized.hasPrefix(occasion + "-") {
            let experience = String(normalized.dropFirst(occasion.count + 1))
            if experiences.contains(experience) { return Parsed(occasion: occasion, experience: experience) }
            return nil
        }
        return nil
    }

    static func initialValues(_ toolID: String) -> [String: String] {
        let parsed = parse(toolID) ?? Parsed(occasion: "party", experience: "page-generator")
        return [
            "timezone": TimeZone.current.identifier,
            "theme": "Classic",
            "title": (labels[parsed.occasion] ?? "Celebration") + " celebration"
        ]
    }

    static func eventInstant(_ value: String, timeZoneName: String) throws -> Date {
        guard let zone = TimeZone(identifier: timeZoneName.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw NativeSimpleError.message("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.")
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        formatter.isLenient = false
        guard let local = formatter.date(from: value.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw NativeSimpleError.message("Enter a valid date and time in YYYY-MM-DDTHH:mm format.")
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: local)
        guard let dayStart = calendar.date(from: DateComponents(year: components.year, month: components.month, day: components.day)) else {
            throw NativeSimpleError.message("Enter a real calendar date and time.")
        }
        let first = calendar.nextDate(after: dayStart.addingTimeInterval(-1), matching: components, matchingPolicy: .strict, repeatedTimePolicy: .first, direction: .forward)
        let last = calendar.nextDate(after: dayStart.addingTimeInterval(-1), matching: components, matchingPolicy: .strict, repeatedTimePolicy: .last, direction: .forward)
        guard let first else {
            throw NativeSimpleError.message("That local time does not exist because the clocks change. Choose another time.")
        }
        if let last, abs(last.timeIntervalSince(first)) > 60 {
            throw NativeSimpleError.message("That local time occurs twice because the clocks change. Choose another time.")
        }
        let actual = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: first)
        guard actual.year == components.year, actual.month == components.month, actual.day == components.day,
              actual.hour == components.hour, actual.minute == components.minute else {
            throw NativeSimpleError.message("Enter a real calendar date and time.")
        }
        return first
    }

    static func countdown(_ values: [String: String], now: Date = Date()) -> Countdown? {
        guard let target = try? eventInstant(values["date"] ?? "", timeZoneName: values["timezone"] ?? "") else { return nil }
        let remaining = target.timeIntervalSince(now)
        if remaining <= 0 { return Countdown(days: 0, hours: 0, minutes: 0, seconds: 0, complete: true) }
        let seconds = Int(remaining)
        return Countdown(days: seconds / 86400, hours: (seconds % 86400) / 3600, minutes: (seconds % 3600) / 60, seconds: seconds % 60, complete: false)
    }

    private static func value(_ values: [String: String], _ key: String) -> String {
        values[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }
    private static func safeURL(_ value: String) -> String {
        guard let components = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              components.host != nil else { return "" }
        return components.url?.absoluteString ?? ""
    }
    private static func lines(_ value: String) -> [String] {
        value.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    private static func dateLabel(_ values: [String: String]) -> String {
        let raw = value(values, "date")
        guard !raw.isEmpty, let date = try? eventInstant(raw, timeZoneName: value(values, "timezone")) else { return raw }
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.timeZone = TimeZone(identifier: value(values, "timezone"))
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    private static func photoMarkup(_ values: [String: String]) -> String {
        lines(value(values, "photosData")).prefix(8).enumerated().compactMap { index, item in
            guard item.range(of: #"^data:image/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$"#, options: .regularExpression) != nil,
                  item.count <= 3_500_000 else { return nil }
            return "<figure><img src=\"\(item)\" alt=\"Celebration memory \(index + 1)\"><figcaption>Memory \(index + 1)</figcaption></figure>"
        }.joined()
    }

    static func checks(_ parsed: Parsed, values: [String: String]) -> [String] {
        var result: [String] = []
        if value(values, "title").isEmpty { result.append("Add a title guests or the recipient will recognise.") }
        if value(values, "honoree").isEmpty && parsed.experience != "countdown" { result.append("Add the person or group being celebrated.") }
        if value(values, "date").isEmpty {
            if ["invitation-generator", "countdown"].contains(parsed.experience) { result.append("Add the date and time.") }
        } else {
            do { _ = try eventInstant(value(values, "date"), timeZoneName: value(values, "timezone")) }
            catch { result.append(error.localizedDescription) }
        }
        if !value(values, "date").isEmpty && value(values, "timezone").isEmpty { result.append("Add the IANA time zone so the displayed local time is clear.") }
        if parsed.experience == "invitation-generator" {
            if value(values, "rsvpUrl").isEmpty && value(values, "contactMethod").isEmpty { result.append("Add an RSVP link or a contact method guests can use to reply.") }
            else if !value(values, "rsvpUrl").isEmpty && safeURL(value(values, "rsvpUrl")).isEmpty { result.append("Use a complete http or https RSVP link.") }
            if value(values, "rsvpBy").isEmpty { result.append("Add an RSVP deadline, or state that replies are open.") }
        }
        if parsed.experience == "quiz-generator" {
            let options = lines(value(values, "quizOptions"))
            if value(values, "quizQuestion").isEmpty { result.append("Add the question.") }
            if !(2...6).contains(options.count) { result.append("Add between 2 and 6 answer choices.") }
            if value(values, "quizAnswer").isEmpty { result.append("Choose the correct answer so the quiz can grade responses.") }
            if !value(values, "quizAnswer").isEmpty && !options.contains(where: { $0.caseInsensitiveCompare(value(values, "quizAnswer")) == .orderedSame }) {
                result.append("The correct answer must match one of the answer choices.")
            }
        }
        if parsed.experience == "memory-page" && value(values, "memories").isEmpty && value(values, "photosData").isEmpty {
            result.append("Add a memory note or at least one photo.")
        }
        if ["reveal-page", "surprise-page", "interactive-card"].contains(parsed.experience) && value(values, "revealMessage").isEmpty {
            result.append("Add the message that will be revealed.")
        }
        return Array(NSOrderedSet(array: result).array as? [String] ?? result)
    }

    static func build(_ toolID: String, values: [String: String]) throws -> Result {
        guard let parsed = parse(toolID) else { throw NativeSimpleError.message("This celebration tool is not supported.") }
        let occasion = labels[parsed.occasion] ?? "Celebration"
        let title = value(values, "title").isEmpty ? occasion + " celebration" : value(values, "title")
        let honoree = value(values, "honoree"), host = value(values, "host")
        let date = dateLabel(values), location = value(values, "location")
        let message = value(values, "message").isEmpty ? (messages[parsed.occasion] ?? "A reason to celebrate.") : value(values, "message")
        let details = value(values, "details"), rsvp = safeURL(value(values, "rsvpUrl"))
        let rsvpBy = value(values, "rsvpBy"), reveal = value(values, "revealMessage")
        let textSections = [
            title, occasion + " · " + parsed.experience.replacingOccurrences(of: "-", with: " "),
            honoree.isEmpty ? "" : "For: " + honoree,
            host.isEmpty ? "" : "Hosted by: " + host,
            date.isEmpty ? "" : "When: " + date + " (" + value(values, "timezone") + ")",
            location.isEmpty ? "" : "Where: " + location,
            "", message, details,
            lines(value(values, "schedule")).isEmpty ? "" : "Programme\n" + lines(value(values, "schedule")).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"),
            value(values, "memories").isEmpty ? "" : "Memories\n" + value(values, "memories"),
            value(values, "dressCode").isEmpty ? "" : "Dress code: " + value(values, "dressCode"),
            value(values, "contactMethod").isEmpty ? "" : "RSVP contact: " + value(values, "contactMethod"),
            rsvpBy.isEmpty ? "" : "Please reply by: " + rsvpBy,
            rsvp.isEmpty ? "" : "RSVP: " + rsvp,
            reveal.isEmpty ? "" : "The reveal\n" + reveal,
            value(values, "quizQuestion").isEmpty ? "" : "Quiz\n" + value(values, "quizQuestion") + "\n" + lines(value(values, "quizOptions")).joined(separator: "\n"),
            value(values, "photosData").isEmpty ? "" : "Photos included: " + String(lines(value(values, "photosData")).count),
            "", "Created locally with enV. This file does not send invitations or collect guest responses."
        ]
        let text = textSections.filter { !$0.isEmpty }.joined(separator: "\n")
        let photos = photoMarkup(values)
        let content: String
        switch parsed.experience {
        case "interactive-card":
            content = "<p class=\"eyebrow\">\(escape(occasion))</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><button type=\"button\" data-reveal>Open your card</button><div hidden data-content><p>\(escape(reveal))</p></div>"
        case "invitation-generator":
            let rows = (date.isEmpty ? "" : "<div><dt>When</dt><dd>\(escape(date))</dd></div>") +
                (location.isEmpty ? "" : "<div><dt>Where</dt><dd>\(escape(location))</dd></div>") +
                (host.isEmpty ? "" : "<div><dt>Hosted by</dt><dd>\(escape(host))</dd></div>") +
                (honoree.isEmpty ? "" : "<div><dt>Celebrating</dt><dd>\(escape(honoree))</dd></div>") +
                (value(values, "dressCode").isEmpty ? "" : "<div><dt>Dress code</dt><dd>\(escape(value(values, "dressCode")))</dd></div>")
            content = "<p class=\"eyebrow\">You are invited</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><dl>\(rows)</dl>\(rsvp.isEmpty ? "<p>Contact the host to reply.</p>" : "<a class=\"button\" href=\"\(escape(rsvp))\" rel=\"noopener noreferrer\">Reply to invitation</a>")\(rsvpBy.isEmpty ? "" : "<p>Reply by \(escape(rsvpBy))</p>")"
        case "countdown":
            let target = (try? eventInstant(value(values, "date"), timeZoneName: value(values, "timezone")).ISO8601Format()) ?? ""
            content = "<p class=\"eyebrow\">\(escape(occasion))</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><div class=\"countdown\" data-countdown=\"\(escape(target))\"><div><strong id=\"days\">—</strong><span>Days</span></div><div><strong id=\"hours\">—</strong><span>Hours</span></div><div><strong id=\"minutes\">—</strong><span>Minutes</span></div><div><strong id=\"seconds\">—</strong><span>Seconds</span></div></div>"
        case "memory-page":
            content = "<p class=\"eyebrow\">A collection of memories</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><p>\(escape(value(values, "memories")))</p><div class=\"gallery\">\(photos)</div>"
        case "reveal-page", "surprise-page":
            content = "<p class=\"eyebrow\">\(escape(occasion))</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><button type=\"button\" data-reveal>Open the reveal</button><div hidden data-content><p>\(escape(reveal))</p></div>"
        case "quiz-generator":
            let options = lines(value(values, "quizOptions")).prefix(6).map { option in
                "<button type=\"button\" data-correct=\"\(option.caseInsensitiveCompare(value(values, "quizAnswer")) == .orderedSame)\">\(escape(option))</button>"
            }.joined()
            content = "<p class=\"eyebrow\">Celebration quiz</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(value(values, "quizQuestion")))</p><div id=\"choices\">\(options)</div><p id=\"feedback\" aria-live=\"polite\">Choose an answer.</p>"
        default:
            content = "<p class=\"eyebrow\">\(escape(occasion))</p><h1>\(escape(title))</h1><p class=\"lead\">\(escape(message))</p><p>For <strong>\(escape(honoree))</strong></p><p>\(escape(details))</p>\(location.isEmpty ? "" : "<p>Where: \(escape(location))</p>")"
        }
        let theme = themes[value(values, "theme")] ?? themes["Classic"]!
        let css = "*,*:before,*:after{box-sizing:border-box}body{margin:0;padding:24px;background:\(theme.background);color:\(theme.ink);font:16px/1.6 system-ui,sans-serif}.wrap{max-width:760px;margin:6vh auto;padding:clamp(22px,6vw,56px);border-radius:24px;background:\(theme.background);box-shadow:0 18px 55px rgba(20,30,45,.12)}.eyebrow{color:\(theme.accent);text-transform:uppercase;letter-spacing:.12em;font-size:.8rem;font-weight:700}h1{font-size:clamp(2rem,7vw,3.5rem);line-height:1.08}button,.button{display:inline-block;background:\(theme.accent);color:white;border:0;border-radius:999px;padding:12px 20px;font:inherit;text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid \(theme.accent);outline-offset:3px}.lead{font-size:1.2rem}dl{display:grid;gap:10px}dl div,.countdown div{padding:12px;background:rgba(120,120,120,.12);border-radius:12px}dt{font-size:.8rem;opacity:.7}dd{margin:0;font-weight:600}.countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.countdown div{text-align:center}.countdown strong{display:block;font-size:2rem}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}@media(max-width:420px){body{padding:10px}.wrap{margin:2vh auto;border-radius:16px}.countdown{gap:4px}}@media(prefers-reduced-motion:no-preference){.wrap{animation:appear .3s ease-out}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}"
        let script = "<script>(function(){document.querySelectorAll('[data-reveal]').forEach(function(b){b.addEventListener('click',function(){var c=b.parentElement.querySelector('[data-content]');if(c)c.hidden=!c.hidden;});});var q=document.getElementById('choices');if(q)q.addEventListener('click',function(e){var b=e.target.closest('button[data-correct]');if(b)document.getElementById('feedback').textContent=b.dataset.correct==='true'?'That is right!':'Not quite. Try again.';});var t=document.querySelector('[data-countdown]');if(t){var target=Date.parse(t.dataset.countdown);function tick(){if(!Number.isFinite(target))return;var n=Math.max(0,target-Date.now()),s=Math.floor(n/1000);document.getElementById('days').textContent=Math.floor(s/86400);document.getElementById('hours').textContent=String(Math.floor(s%86400/3600)).padStart(2,'0');document.getElementById('minutes').textContent=String(Math.floor(s%3600/60)).padStart(2,'0');document.getElementById('seconds').textContent=String(s%60).padStart(2,'0');}tick();setInterval(tick,1000);}})();</script>"
        let html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>\(escape(title))</title><style>\(css)</style></head><body><main class=\"wrap\">\(content)<p class=\"note\">Made with enV · This page is a local export. Guest responses are not collected.</p></main>\(script)</body></html>"
        return Result(text: text, html: html, checks: checks(parsed, values: values))
    }
}

private struct NativeCelebrationDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText, .html] }
    let data: Data
    init(_ text: String) { data = Data(text.utf8) }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct NativeCelebrationToolView: View {
    let tool: Tool
    @Environment(\.nativeToolExecutionTracker) private var executionTracker
    @State private var values: [String: String]
    @State private var output: NativeCelebrationEngine.Result?
    @State private var error: String?
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var exportHTML = true
    @State private var now = Date()

    init(tool: Tool) {
        self.tool = tool
        _values = State(initialValue: NativeCelebrationEngine.initialValues(tool.id))
    }

    private var parsed: NativeCelebrationEngine.Parsed {
        NativeCelebrationEngine.parse(tool.id) ?? NativeCelebrationEngine.Parsed(occasion: "party", experience: "page-generator")
    }
    private var title: String { values["title"]?.isEmpty == false ? values["title"]! : (parsed.occasion.capitalized + " celebration") }
    private var label: String { parsed.occasion.replacingOccurrences(of: "-", with: " ").capitalized }
    private var invite: Bool { parsed.experience == "invitation-generator" }
    private var memory: Bool { parsed.experience == "memory-page" }
    private var quiz: Bool { parsed.experience == "quiz-generator" }
    private var reveal: Bool { ["interactive-card", "reveal-page", "surprise-page"].contains(parsed.experience) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Create a personal \(label.lowercased()) experience. Preview and export it on this device.")
                .font(.footnote).foregroundStyle(Color.envMuted)
            input("title", "Title")
            input("honoree", "Person or group being celebrated")
            input("host", "Host / organiser")
            VStack(alignment: .leading, spacing: 5) {
                enVCharacterSpacedText("Theme").font(.subheadline.weight(.medium))
                Picker("Theme", selection: binding("theme", fallback: "Classic")) {
                    ForEach(["Classic", "Rose", "Gold", "Garden", "Ocean", "Midnight"], id: \.self) { Text($0).tag($0) }
                }.pickerStyle(.segmented)
            }
            if !["interactive-card", "reveal-page", "surprise-page", "quiz-generator", "memory-page"].contains(parsed.experience) {
                input("date", "Date and time (YYYY-MM-DDTHH:mm)")
                input("timezone", "Time zone (IANA, e.g. Africa/Lagos)")
            }
            if ["page-generator", "invitation-generator", "countdown"].contains(parsed.experience) {
                input("location", "Location / venue")
            }
            if invite {
                input("rsvpUrl", "RSVP link (http or https)")
                input("contactMethod", "RSVP contact (phone or email)")
                input("rsvpBy", "Reply by")
                input("dressCode", "Dress code / theme")
            }
            if parsed.experience == "page-generator" { input("schedule", "Programme (one item per line)", multiline: true) }
            if memory {
                input("memories", "Memory notes", multiline: true)
                Button("Add photos") { showImporter = true }.buttonStyle(.bordered)
                enVCharacterSpacedText("\((values["photosData"] ?? "").components(separatedBy: "\n").filter { !$0.isEmpty }.count) photo(s) selected")
                    .font(.caption).foregroundStyle(Color.envMuted)
            }
            if reveal { input("revealMessage", "Message to reveal", multiline: true) }
            if quiz {
                input("quizQuestion", "Question", multiline: true)
                input("quizOptions", "Answer choices (one per line)", multiline: true)
                input("quizAnswer", "Correct answer")
            }
            input("message", "Main message", multiline: true)
            if !["interactive-card", "reveal-page", "surprise-page", "quiz-generator"].contains(parsed.experience) {
                input("details", "Extra details", multiline: true)
            }
            if parsed.experience == "countdown" {
                if let countdown = NativeCelebrationEngine.countdown(values, now: now) {
                    Text(countdown.complete ? "The celebration has started" : "\(countdown.days) days · \(countdown.hours) hours · \(countdown.minutes) minutes · \(countdown.seconds) seconds")
                        .font(.headline).foregroundStyle(Color.envInk)
                    Text("Time zone: \(values["timezone"] ?? TimeZone.current.identifier)").font(.caption).foregroundStyle(Color.envMuted)
                } else {
                    Text("Add a valid date, time and IANA time zone to start the countdown.").font(.caption).foregroundStyle(Color.envMuted)
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Preview").font(.caption.weight(.semibold)).foregroundStyle(Color.envMuted)
                Text(title).font(.title3.weight(.semibold)).foregroundStyle(Color.envInk)
                Text(values["message"]?.isEmpty == false ? values["message"]! : "Your personal message will appear here.")
                    .font(.subheadline).foregroundStyle(Color.envMuted)
                if let person = values["honoree"], !person.isEmpty { Text("For \(person)").font(.caption).foregroundStyle(Color.envMuted) }
                if let date = values["date"], !date.isEmpty { Text("\(date) · \(values["timezone"] ?? "")").font(.caption).foregroundStyle(Color.envMuted) }
                if let location = values["location"], !location.isEmpty { Text(location).font(.caption).foregroundStyle(Color.envMuted) }
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 10) {
                Button("Generate") {
                    executionTracker?.start()
                    do {
                        output = try NativeCelebrationEngine.build(tool.id, values: values)
                        error = nil
                        executionTracker?.finish(success: true)
                    } catch {
                        self.error = error.localizedDescription
                        output = nil
                        executionTracker?.finish(success: false)
                    }
                }.buttonStyle(.borderedProminent)
                Button("Reset") {
                    values = NativeCelebrationEngine.initialValues(tool.id)
                    output = nil; error = nil
                }.buttonStyle(.bordered)
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            if let output, !output.checks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Review before sharing").font(.subheadline.weight(.medium))
                    ForEach(output.checks, id: \.self) { check in
                        Text("• " + check).font(.footnote).foregroundStyle(Color.envMuted)
                    }
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
            }
            if let output {
                HStack(spacing: 8) {
                    Button("Copy text") { UIPasteboard.general.string = output.text }.buttonStyle(.bordered)
                    Button("Save page") { exportHTML = true; showExporter = true }.buttonStyle(.bordered)
                    Button("Save text") { exportHTML = false; showExporter = true }.buttonStyle(.bordered)
                }
                Text(output.text).font(.system(.footnote, design: .monospaced)).foregroundStyle(Color.envInk)
                    .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("Local export only. enV does not send invitations, host the event or collect guest responses.")
                .font(.caption).foregroundStyle(Color.envMuted)
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
            do {
                let urls = try result.get()
                guard urls.count <= 8 else { throw NativeSimpleError.message("Choose up to eight photos.") }
                var encoded: [String] = []
                var total = 0
                for url in urls {
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let data = try Data(contentsOf: url)
                    guard data.count <= 2 * 1024 * 1024 else { throw NativeSimpleError.message("Each photo must be 2 MB or smaller.") }
                    total += data.count
                    let ext = url.pathExtension.lowercased()
                    let mime = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "avif": "image/avif"][ext]
                    guard let mime else { throw NativeSimpleError.message("Use JPG, PNG, WebP or AVIF photos.") }
                    encoded.append("data:\(mime);base64,\(data.base64EncodedString())")
                }
                guard total <= 8 * 1024 * 1024 else { throw NativeSimpleError.message("Keep the selected photos under 8 MB in total.") }
                values["photosData"] = encoded.joined(separator: "\n")
                output = nil; error = nil
            } catch { self.error = error.localizedDescription }
        }
        .fileExporter(
            isPresented: $showExporter,
            document: NativeCelebrationDocument(exportHTML ? (output?.html ?? "") : (output?.text ?? "")),
            contentType: exportHTML ? .html : .plainText,
            defaultFilename: "env-\(tool.id).\(exportHTML ? "html" : "txt")"
        ) { result in
            if case .failure(let caught) = result { error = caught.localizedDescription }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func input(_ key: String, _ title: String, multiline: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(Color.envInk)
            if multiline {
                TextEditor(text: binding(key)).frame(minHeight: 88).padding(6)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
            } else {
                TextField(title, text: binding(key)).textFieldStyle(.roundedBorder)
            }
        }
    }

    private func binding(_ key: String, fallback: String = "") -> Binding<String> {
        Binding(get: { values[key] ?? fallback }, set: { values[key] = $0; output = nil })
    }
}
