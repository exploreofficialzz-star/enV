import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct ToolCard: View {
    @EnvironmentObject private var store: CatalogStore
    let tool: Tool

    var body: some View {
        HStack(spacing: 10) {
            NavigationLink(value: tool) {
                HStack(spacing: 14) {
                    Image(systemName: iconName(for: tool.icon))
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Color.envTeal)
                        .frame(width: 42, height: 42)
                        .background(Color.envTeal.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(tool.name).font(.headline).foregroundStyle(Color.envInk)
                            if tool.isPlanned { StatusPill(text: "Coming soon", color: .orange) }
                        }
                        Text(tool.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                store.toggleFavorite(tool)
            } label: {
                Image(systemName: store.isFavorite(tool) ? "heart.fill" : "heart")
                    .foregroundStyle(store.isFavorite(tool) ? .pink : .secondary)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(store.isFavorite(tool) ? "Remove \(tool.name) from saved" : "Save \(tool.name)")
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .contain)
    }
}

struct StatusPill: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.caption2.weight(.semibold)).foregroundStyle(color).padding(.horizontal, 7).padding(.vertical, 4).background(color.opacity(0.12), in: Capsule())
    }
}

struct ToolList: View {
    let tools: [Tool]
    var body: some View {
        LazyVStack(spacing: 10) { ForEach(tools) { ToolCard(tool: $0) } }
    }
}

struct ToolDetailView: View {
    @EnvironmentObject private var store: CatalogStore
    let tool: Tool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 14) {
                    Image(systemName: iconName(for: tool.icon)).font(.largeTitle).foregroundStyle(Color.envTeal).frame(width: 64, height: 64).background(Color.envTeal.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                    VStack(alignment: .leading, spacing: 6) { Text(tool.name).font(.title2.bold()); Text(store.category(named: tool.category)?.name ?? tool.category).foregroundStyle(.secondary) }
                    Spacer()
                }
                if tool.isPlanned {
                    Label("Coming soon", systemImage: "clock")
                        .font(.headline).foregroundStyle(.orange)
                    Text("This entry is planned. Its engine is not available in the native iOS app yet.").foregroundStyle(.secondary)
                } else {
                    NativeFamilyToolView(tool: tool)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(tool.description).font(.body)
                    Divider()
                    metadataRow("Status", tool.status.capitalized)
                    metadataRow("Engine", tool.engine.type ?? "Unknown")
                    metadataRow("Popularity", "\(tool.popularity)")
                    metadataRow("Native execution", NativeCoverage.status(for: tool))
                    metadataRow("Web version", tool.clientSide ? "Runs in the browser" : "Uses backend services")
                    if tool.requiresBackend { metadataRow("Backend", "Required") }
                }
                .padding(16).background(.background, in: RoundedRectangle(cornerRadius: 18))
                Button { store.toggleFavorite(tool) } label: {
                    Label(store.isFavorite(tool) ? "Remove from Saved" : "Save tool", systemImage: store.isFavorite(tool) ? "heart.fill" : "heart")
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(store.isFavorite(tool) ? "Remove \(tool.name) from saved" : "Save \(tool.name)")
            }
            .padding()
        }
        .navigationTitle("Tool details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func metadataRow(_ title: String, _ value: String) -> some View { HStack { Text(title).foregroundStyle(.secondary); Spacer(); Text(value).fontWeight(.medium) } }
}

/// The native surface is deliberately keyed by the catalog's engine type and
/// then checked against the exact operation map in that engine. This prevents
/// a similarly named catalog entry from being presented as locally executable.
enum NativeCoverage {
    static let canonicalActiveToolCount = 8_790
    static let localActiveToolCount = NativeTextEngine.supportedToolIDs.count
        + NativeCodecEngine.supportedToolIDs.count
        + NativeColorEngine.supportedToolIDs.count
        + NativeDateTimeEngine.supportedToolIDs.count
        + NativeMimeEngine.supportedToolIDs.count

    static func isLocallyExecutable(_ tool: Tool) -> Bool {
        guard !tool.isPlanned else { return false }
        switch tool.engine.type {
        case "text": return NativeTextEngine.operation(forToolID: tool.id) != nil
        case "codec": return NativeCodecEngine.operation(forToolID: tool.id) != nil
        case "color": return NativeColorEngine.operation(forToolID: tool.id) != nil
        case "datetime": return NativeDateTimeEngine.operation(forToolID: tool.id) != nil
        case "mime": return NativeMimeEngine.operation(forToolID: tool.id) != nil
        case "url-media-info": return false
        default: return false
        }
    }

    static func status(for tool: Tool) -> String {
        if tool.isPlanned { return "Coming soon" }
        if tool.engine.type == "url-media-info" || NativeUrlMediaInfoEngine.canonicalToolIDs.contains(tool.id) {
            return "Remote metadata service required"
        }
        return isLocallyExecutable(tool) ? "Available offline" : "Not ported yet"
    }
}

struct NativeFamilyToolView: View {
    let tool: Tool

    var body: some View {
        Group {
            switch tool.engine.type {
            case "text": NativeTextToolView(tool: tool)
            case "codec": NativeCodecToolView(tool: tool)
            case "color": NativeColorToolView(tool: tool)
            case "datetime": NativeDateTimeToolView(tool: tool)
            case "mime": NativeMimeToolView(tool: tool)
            case "url-media-info":
                VStack(alignment: .leading, spacing: 10) {
                    Label("Remote service required", systemImage: "network")
                        .font(.headline).foregroundStyle(.orange)
                    Text("URL media inspection is not available offline. The remote metadata service is required for title, duration, codecs, thumbnails, and formats.")
                        .foregroundStyle(.secondary)
                }
            default:
                VStack(alignment: .leading, spacing: 10) {
                    Label("Native engine migration in progress", systemImage: "hammer")
                        .font(.headline).foregroundStyle(Color.envTeal)
                    Text("This catalog entry is not yet implemented as a native iOS engine.").foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct NativeActionRow: View {
    let output: String
    let run: () -> Void
    let reset: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button("Run", action: run).buttonStyle(.borderedProminent)
            Button("Reset", action: reset).buttonStyle(.bordered)
            Button { UIPasteboard.general.string = output } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }.buttonStyle(.bordered).disabled(output.isEmpty)
        }
    }
}

private struct NativeOutputView: View {
    let output: String
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            if !output.isEmpty {
                Text("Result").font(.subheadline.weight(.semibold))
                TextEditor(text: .constant(output))
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 130)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.35)))
            }
        }
    }
}

struct NativeCodecToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var firstHash = ""
    @State private var secondHash = ""
    @State private var value = ""
    @State private var fromBase = "10"
    @State private var toBase = "16"
    @State private var output = ""
    @State private var error: String?

    private var isHashCompare: Bool { tool.id == "hash-compare" }
    private var isBaseConverter: Bool { tool.id == "number-base-converter" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isHashCompare {
                TextField("Hash A", text: $firstHash).textFieldStyle(.roundedBorder)
                TextField("Hash B", text: $secondHash).textFieldStyle(.roundedBorder)
            } else if isBaseConverter {
                TextField("Value", text: $value).textFieldStyle(.roundedBorder)
                HStack {
                    TextField("From base", text: $fromBase).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    TextField("To base", text: $toBase).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                }
            } else {
                Text("Input").font(.subheadline.weight(.semibold))
                TextEditor(text: $input).frame(minHeight: 130).overlay(RoundedRectangle(cornerRadius: 10).stroke(.secondary.opacity(0.25)))
            }
            NativeActionRow(output: output, run: run, reset: reset)
            NativeOutputView(output: output, error: error)
        }
    }

    private func run() {
        do {
            var options: [String: String] = [:]
            if isHashCompare { options = ["a": firstHash, "b": secondHash] }
            if isBaseConverter { options = ["value": value, "fromBase": fromBase, "toBase": toBase] }
            output = try NativeCodecEngine.run(toolID: tool.id, input: input, options: options).output
            error = nil
        } catch let caughtError { output = ""; error = caughtError.localizedDescription }
    }

    private func reset() {
        input = ""; firstHash = ""; secondHash = ""; value = ""; fromBase = "10"; toBase = "16"; output = ""; error = nil
    }
}

struct NativeColorToolView: View {
    let tool: Tool
    @State private var input = "#0d9f8a"
    @State private var foreground = "#16181d"
    @State private var background = "#ffffff"
    @State private var output = ""
    @State private var error: String?
    @State private var palette: [String] = []

    private var isContrast: Bool { NativeColorEngine.operation(forToolID: tool.id) == "contrast" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isContrast {
                TextField("Foreground hex", text: $foreground).textFieldStyle(.roundedBorder)
                TextField("Background hex", text: $background).textFieldStyle(.roundedBorder)
                colorSwatchRow(foreground, label: "Foreground")
                colorSwatchRow(background, label: "Background")
            } else {
                TextField("Color hex", text: $input).textFieldStyle(.roundedBorder)
                colorSwatchRow(input, label: "Color")
                ColorPicker("Adjust preview", selection: Binding(get: { color(for: input) }, set: { input = hex(for: $0) }))
            }
            NativeActionRow(output: output, run: run, reset: reset)
            NativeOutputView(output: output, error: error)
            if !palette.isEmpty {
                Text("Palette swatches · tap to apply").font(.subheadline).foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 8) {
                    ForEach(palette, id: \.self) { swatch in
                        Button { input = swatch; run() } label: {
                            HStack(spacing: 8) {
                                Circle().fill(color(for: swatch)).frame(width: 20, height: 20)
                                Text(swatch).font(.system(.footnote, design: .monospaced))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(9)
                            .background(.background, in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Use palette color \(swatch)")
                    }
                }
            }
        }
    }

    @ViewBuilder private func colorSwatchRow(_ value: String, label: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color(for: value)).frame(width: 24, height: 24)
            Text(label).foregroundStyle(.secondary)
            Text(value).font(.system(.body, design: .monospaced))
        }
    }

    private func run() {
        do {
            let result = try NativeColorEngine.run(toolID: tool.id, input: input, foreground: foreground, background: background)
            output = result.output; palette = result.palette; error = nil
        } catch let caughtError { output = ""; palette = []; error = caughtError.localizedDescription }
    }

    private func reset() { input = "#0d9f8a"; foreground = "#16181d"; background = "#ffffff"; output = ""; error = nil; palette = [] }

    private func color(for value: String) -> Color {
        guard let rgb = try? NativeColorEngine.parseHex(value) else { return .gray }
        return Color(red: Double(rgb.r) / 255, green: Double(rgb.g) / 255, blue: Double(rgb.b) / 255)
    }

    private func hex(for color: Color) -> String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return String(format: "#%02x%02x%02x", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}

struct NativeDateTimeToolView: View {
    let tool: Tool
    @State private var values: [String: String] = [:]
    @State private var output = ""
    @State private var error: String?

    private var fields: [String] {
        switch tool.id {
        case "date-difference", "business-day-calculator": return ["from", "to"]
        case "workday-calculator": return ["start", "days"]
        case "countdown": return ["target"]
        case "world-clock": return ["zones"]
        case "timezone-converter": return ["time", "toTz"]
        case "unix-timestamp-converter": return ["value"]
        case "date-formatter": return ["value", "pattern"]
        case "weekday-calculator", "week-number-calculator": return ["value"]
        case "leap-year-checker": return ["year"]
        case "birthday-countdown": return ["birth"]
        case "time-until-calculator", "deadline-calculator": return ["target"]
        default: return []
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(fields, id: \.self) { key in
                TextField(label(for: key), text: Binding(get: { values[key, default: defaultValue(for: key)] }, set: { values[key] = $0 }))
                    .textFieldStyle(.roundedBorder)
            }
            NativeActionRow(output: output, run: run, reset: reset)
            NativeOutputView(output: output, error: error)
        }
        .onAppear { for key in fields where values[key] == nil { values[key] = defaultValue(for: key) } }
    }

    private func run() {
        do { output = try NativeDateTimeEngine.run(toolID: tool.id, options: values).output; error = nil }
        catch let caughtError { output = ""; error = caughtError.localizedDescription }
    }

    private func reset() { values = [:]; output = ""; error = nil }
    private func label(for key: String) -> String { ["from": "From date (YYYY-MM-DD)", "to": "To date (YYYY-MM-DD)", "start": "Start date (YYYY-MM-DD)", "days": "Business days", "target": "Target (ISO date/time)", "zones": "IANA zones (comma separated)", "time": "Time (ISO date/time)", "toTz": "To time zone", "value": "Value or date", "pattern": "Date format pattern", "year": "Year", "birth": "Birth date (YYYY-MM-DD)"][key] ?? key.capitalized }
    private func defaultValue(for key: String) -> String {
        switch key {
        case "zones": return "UTC, America/New_York"
        case "toTz": return "UTC"
        case "pattern": return "yyyy-MM-dd EEEE"
        case "days": return "1"
        case "time": return ISO8601DateFormatter().string(from: Date())
        default: return ""
        }
    }
}

struct NativeMimeToolView: View {
    let tool: Tool
    @State private var query = ""
    @State private var fileName = ""
    @State private var browserMime = ""
    @State private var bytesHex = ""
    @State private var showingFileImporter = false
    @State private var output = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Search extension, MIME, name, or group", text: $query).textFieldStyle(.roundedBorder)
            Text("Optional signature inspection").font(.subheadline.weight(.semibold))
            Button { showingFileImporter = true } label: {
                Label(fileName.isEmpty ? "Choose a local file" : "Choose another file", systemImage: "doc.badge.plus")
            }.buttonStyle(.bordered)
            TextField("File name", text: $fileName).textFieldStyle(.roundedBorder)
            TextField("Browser MIME", text: $browserMime).textFieldStyle(.roundedBorder)
            TextField("Bytes as hex (e.g. 89 50 4e 47)", text: $bytesHex).textFieldStyle(.roundedBorder)
            NativeActionRow(output: output, run: run, reset: reset)
            NativeOutputView(output: output, error: error)
        }
        .fileImporter(isPresented: $showingFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: false, onCompletion: importFile)
    }

    private func run() {
        do {
            var options = ["query": query]
            if !fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { options["fileName"] = fileName }
            if !browserMime.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { options["browserMime"] = browserMime }
            if !bytesHex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { options["bytesHex"] = bytesHex }
            output = try NativeMimeEngine.run(toolID: tool.id, options: options).output; error = nil
        } catch let caughtError { output = ""; error = caughtError.localizedDescription }
    }

    private func reset() { query = ""; fileName = ""; browserMime = ""; bytesHex = ""; output = ""; error = nil }

    private func importFile(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let importError):
            // User cancellation is a normal dismissal, not a failed inspection.
            if (importError as NSError).code != NSUserCancelledError { error = importError.localizedDescription }
        case .success(let urls):
            guard let url = urls.first else { return }
            let secured = url.startAccessingSecurityScopedResource()
            defer { if secured { url.stopAccessingSecurityScopedResource() } }
            do {
                let handle = try FileHandle(forReadingFrom: url)
                defer { try? handle.close() }
                let prefix = handle.readData(ofLength: 64)
                fileName = url.lastPathComponent
                browserMime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "unknown"
                bytesHex = prefix.map { String(format: "%02x", $0) }.joined(separator: " ")
                error = nil
            } catch let caughtError { error = "Could not read file: \(caughtError.localizedDescription)" }
        }
    }
}

struct NativeTextToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var compare = ""
    @State private var output = ""
    @State private var error: String?
    @State private var diffSummary: String?
    @State private var options: [String: String] = [:]
    private var isDiff: Bool { tool.id == "text-diff" }
    private var isCounter: Bool { ["word-counter", "character-counter", "sentence-counter", "paragraph-counter", "reading-time-calculator"].contains(tool.id) }
    private var optionNames: [String] {
        switch tool.id { case "find-and-replace": return ["find", "replace", "flags"]; case "wrap-text": return ["width"]; case "list-generator": return ["style"]; case "keyword-density-calculator": return ["keyword"]; case "reading-time-calculator": return ["wpm"]; case "word-counter", "character-counter": return ["limit"]; default: return [] }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isDiff { Text("Original text").font(.subheadline.weight(.semibold)); editor($input); Text("New text").font(.subheadline.weight(.semibold)); editor($compare) }
            else { Text("Input").font(.subheadline.weight(.semibold)); editor($input) }
            ForEach(optionNames, id: \.self) { name in TextField(label(name), text: Binding(get: { options[name, default: defaultValue(name)] }, set: { options[name] = $0 })).textFieldStyle(.roundedBorder) }
            if isCounter { let s = NativeTextEngine.statistics(input, wpm: options["wpm"] ?? "200"); LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], alignment: .leading) { stat("Words", s.words); stat("Characters", s.characters); stat("No spaces", s.charactersWithoutSpaces); stat("Sentences", s.sentences); stat("Paragraphs", s.paragraphs); stat("Reading", "\(s.readingMinutes) min") } }
            if tool.id == "word-counter" || tool.id == "character-counter" { let s = NativeTextEngine.statistics(input); let metric = tool.id == "word-counter" ? s.words : s.characters; let limit = max(1, Int(options["limit"] ?? "1") ?? 1); Text(metric <= limit ? "\(limit - metric) remaining" : "\(metric - limit) over").font(.subheadline).foregroundStyle(.secondary) }
            HStack { Button("Run", action: run).buttonStyle(.borderedProminent); Button("Reset", action: reset).buttonStyle(.bordered); Button { UIPasteboard.general.string = output } label: { Label("Copy output", systemImage: "doc.on.doc") }.disabled(output.isEmpty) }
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            if let diffSummary { Text(diffSummary).font(.subheadline.weight(.semibold)).foregroundStyle(Color.envTeal) }
            if !output.isEmpty { TextEditor(text: .constant(output)).font(.system(.body, design: .monospaced)).frame(minHeight: 150).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.35))) }
        }
        .onChange(of: input) { _ in if isCounter { run() } }
        .onChange(of: compare) { _ in if isDiff { run() } }
        .onAppear { for name in optionNames where options[name] == nil { options[name] = defaultValue(name) } }
    }
    private func editor(_ text: Binding<String>) -> some View { TextEditor(text: text).frame(minHeight: 150).overlay(RoundedRectangle(cornerRadius: 10).stroke(.secondary.opacity(0.25))) }
    @ViewBuilder private func stat(_ name: String, _ value: some CustomStringConvertible) -> some View { VStack(alignment: .leading) { Text(name).font(.caption).foregroundStyle(.secondary); Text(value.description).font(.headline) }.padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8)) }
    private func label(_ name: String) -> String { ["find":"Find", "replace":"Replace", "flags":"Regex flags", "width":"Width", "style":"Style (bullets, numbered, comma)", "keyword":"Keyword (optional)", "wpm":"Reading speed (words/min)", "limit":"Target limit"][name] ?? name.capitalized }
    private func defaultValue(_ name: String) -> String { name == "flags" ? "g" : name == "width" ? "80" : name == "wpm" ? "200" : name == "limit" ? "280" : name == "style" ? "bullets" : "" }
    private func run() { do { let r = try NativeTextEngine.run(toolID: tool.id, input: input, compare: compare, options: options); output = r.output; diffSummary = isDiff ? "Added: \(r.added) · Removed: \(r.removed) · Unchanged: \(r.unchanged)" : nil; error = nil } catch let caughtError { output = ""; diffSummary = nil; error = caughtError.localizedDescription } }
    private func reset() { input = ""; compare = ""; output = ""; options = [:]; error = nil; diffSummary = nil }
}

func iconName(for catalogIcon: String) -> String {
    let map = ["Accessibility":"accessibility", "Sparkles":"sparkles", "Calculator":"plus.forwardslash.minus", "Code2":"chevron.left.forwardslash.chevron.right", "Palette":"paintpalette", "Calendar":"calendar", "Heart":"heart", "Search":"magnifyingglass", "Folder":"folder", "Wand2":"wand.and.stars", "Image":"photo", "Shield":"shield", "Type":"textformat", "Plane":"airplane", "Globe":"globe", "Timer":"timer", "Video":"video", "AudioLines":"waveform", "Briefcase":"briefcase", "UserRound":"person", "Dices":"dice", "Gamepad2":"gamecontroller", "ShoppingCart":"cart", "QrCode":"qrcode"]
    return map[catalogIcon] ?? "wrench.and.screwdriver"
}
