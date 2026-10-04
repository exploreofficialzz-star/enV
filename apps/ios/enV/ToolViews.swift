import SwiftUI
import UIKit

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
                } else if tool.engine.type == "text" {
                    NativeTextToolView(tool: tool)
                } else {
                    Label("Native engine migration in progress", systemImage: "hammer")
                        .font(.headline).foregroundStyle(Color.envTeal)
                    Text("The catalog entry is available offline, but this native tool shell does not claim the web engine is ported. Behavior coverage will be added by engine family in a later migration phase.").foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(tool.description).font(.body)
                    Divider()
                    metadataRow("Status", tool.status.capitalized)
                    metadataRow("Engine", tool.engine.type ?? "Unknown")
                    metadataRow("Popularity", "\(tool.popularity)")
                    metadataRow("Native execution", nativeExecutionStatus)
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

    private var nativeExecutionStatus: String {
        if tool.isPlanned { return "Coming soon" }
        if tool.engine.type == "text" && NativeTextEngine.operation(forToolID: tool.id) != nil { return "Available offline" }
        return "Not ported yet"
    }

    private func metadataRow(_ title: String, _ value: String) -> some View { HStack { Text(title).foregroundStyle(.secondary); Spacer(); Text(value).fontWeight(.medium) } }
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
    private func run() { do { let r = try NativeTextEngine.run(toolID: tool.id, input: input, compare: compare, options: options); output = r.output; diffSummary = isDiff ? "Added: \(r.added) · Removed: \(r.removed) · Unchanged: \(r.unchanged)" : nil; error = nil } catch { output = ""; diffSummary = nil; error = error.localizedDescription } }
    private func reset() { input = ""; compare = ""; output = ""; options = [:]; error = nil; diffSummary = nil }
}

func iconName(for catalogIcon: String) -> String {
    let map = ["Accessibility":"accessibility", "Sparkles":"sparkles", "Calculator":"plus.forwardslash.minus", "Code2":"chevron.left.forwardslash.chevron.right", "Palette":"paintpalette", "Calendar":"calendar", "Heart":"heart", "Search":"magnifyingglass", "Folder":"folder", "Wand2":"wand.and.stars", "Image":"photo", "Shield":"shield", "Type":"textformat", "Plane":"airplane", "Globe":"globe", "Timer":"timer", "Video":"video", "AudioLines":"waveform", "Briefcase":"briefcase", "UserRound":"person", "Dices":"dice", "Gamepad2":"gamecontroller", "ShoppingCart":"cart", "QrCode":"qrcode"]
    return map[catalogIcon] ?? "wrench.and.screwdriver"
}
