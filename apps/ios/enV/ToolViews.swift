import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct ToolCard: View {
    @EnvironmentObject private var store: CatalogStore
    let tool: Tool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NavigationLink(value: tool) {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        iconTile(tool.icon)
                        Text(tool.name)
                            .font(.system(size: 14, weight: .semibold))
                            .tracking(-0.15)
                            .foregroundStyle(Color.envInk)
                            .lineLimit(1)
                            .padding(.top, 12)
                        Text(tool.description)
                            .font(.system(size: 12))
                            .foregroundStyle(Color.envMuted)
                            .lineLimit(2)
                            .lineSpacing(2)
                            .padding(.top, 4)
                        if NativeBackendEngine.supports(tool) {
                            StatusPill(text: "ONLINE", color: .envMuted).padding(.top, 10)
                        } else if NativeCoverage.isLocallyExecutable(tool) {
                            Text("ON DEVICE").font(.system(size: 9, weight: .medium)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10)
                        } else if tool.isPlanned { StatusPill(text: "Coming soon", color: .envMuted).padding(.top, 10)
                        } else {
                            StatusPill(text: "WEB ONLY", color: .envMuted).padding(.top, 10)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    HStack {
                        Spacer(minLength: 0)
                        EnVIcon(name: "ArrowRight", size: 16, tint: .primary)
                    }
                    .padding(.top, 10)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                store.toggleFavorite(tool)
            } label: {
                EnVIcon(name: "Heart", size: 18, tint: store.isFavorite(tool) ? .envAccent : .envMuted)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(store.isFavorite(tool) ? "Remove \(tool.name) from saved" : "Save \(tool.name)")
        }
        .padding(16)
        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
        .opacity(tool.isPlanned ? 0.72 : 1)
        .accessibilityElement(children: .contain)
    }
}

struct StatusPill: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.system(size: 10, weight: .medium)).foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 4).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 5))
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
                    EnVIcon(name: tool.icon, size: 26, tint: .envAccent).frame(width: 56, height: 56).background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 6) { Text(tool.name).font(.title2.bold()); Text(store.category(named: tool.category)?.name ?? tool.category).foregroundStyle(.secondary) }
                    Spacer()
                }
                let backend = NativeBackendEngine.supports(tool)
                let local = NativeCoverage.isLocallyExecutable(tool)
                if backend {
                    NativeBackendToolView(tool: tool)
                } else if local {
                    NativeFamilyToolView(tool: tool)
                } else {
                    HStack(spacing: 8) { EnVIcon(name: tool.isPlanned ? "Clock3" : "Globe", size: 16, tint: .envMuted); Text(tool.isPlanned ? "Coming soon" : "Web only").font(.subheadline.weight(.semibold)).foregroundStyle(Color.envMuted) }
                    Text(tool.isPlanned ? "This tool is not yet implemented natively or through the enV backend." : "This tool remains available in the Web product but has no native implementation in this standalone iOS app.").foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text(tool.description).font(.body)
                    Divider()
                    metadataRow("Status", tool.status.capitalized)
                    metadataRow("Engine", tool.engine.type ?? "Unknown")
                    metadataRow("Popularity", "\(tool.popularity)")
                    metadataRow("Native execution", NativeCoverage.status(for: tool))
                    metadataRow("Processing", tool.clientSide ? "Runs on this device" : "Uses backend services")
                    if tool.requiresBackend { metadataRow("Backend", "Required") }
                }
                .padding(16).background(.background, in: RoundedRectangle(cornerRadius: 18))
                Button { store.toggleFavorite(tool) } label: {
                    HStack(spacing: 8) {
                        EnVIcon(name: "Heart", size: 16, tint: .white)
                        Text(store.isFavorite(tool) ? "Remove from Saved" : "Save tool")
                    }
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(store.isFavorite(tool) ? "Remove \(tool.name) from saved" : "Save \(tool.name)")
            }
            .padding()
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func metadataRow(_ title: String, _ value: String) -> some View { HStack { Text(title).foregroundStyle(.secondary); Spacer(); Text(value).fontWeight(.medium) } }
}

/// The native surface is deliberately keyed by the catalog's engine type and
/// then checked against the exact operation map in that engine. This prevents
/// a similarly named catalog entry from being presented as locally executable.
enum NativeCoverage {
    static func usesBackend(_ tool: Tool) -> Bool { NativeBackendEngine.supports(tool) }
    static func isLocallyExecutable(_ tool: Tool) -> Bool {
        if usesBackend(tool) || tool.isPlanned { return false }
        switch tool.engine.type {
        case "text": return NativeTextEngine.operation(forToolID: tool.id) != nil
        case "codec": return NativeCodecEngine.operation(forToolID: tool.id) != nil
        case "color": return NativeColorEngine.operation(forToolID: tool.id) != nil
        case "datetime": return NativeDateTimeEngine.operation(forToolID: tool.id) != nil
        case "barcode": return NativeBarcodeEngine.supports(tool)
        case "mime": return NativeMimeEngine.operation(forToolID: tool.id) != nil
        case "converter": return NativeConverterEngine.operation(for: tool) != nil
        case "calculator": return NativeCalculatorEngine.operation(for: tool.id) != nil || NativeExpansionCalculatorEngine.operation(for: tool.id) != nil || NativeMathExerciseEngine.operation(for: tool.id) != nil
        case "generator", "network", "seo", "developer", "cssgen": return NativeUtilityEngine.supports(tool)
        case "custom": return tool.category == "productivity"
        default: return false
        }
    }
    static func status(for tool: Tool) -> String {
        if usesBackend(tool) { return "Available online via enV backend" }
        if isLocallyExecutable(tool) { return "Available offline" }
        if tool.isPlanned { return "Coming soon" }
        return "Web only — no native implementation"
    }
    static func canonicalActiveToolCount(in catalog: Catalog) -> Int { catalog.tools.filter { $0.status == "active" || $0.status == "beta" }.count }
    static func localActiveToolCount(in catalog: Catalog) -> Int { catalog.tools.filter { ($0.status == "active" || $0.status == "beta") && isLocallyExecutable($0) }.count }
}

struct NativeFamilyToolView: View {
    let tool: Tool
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch tool.engine.type {
            case "text": if NativeTextEngine.operation(forToolID: tool.id) != nil { NativeTextToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "codec": if NativeCodecEngine.operation(forToolID: tool.id) != nil { NativeCodecToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "color": if NativeColorEngine.operation(forToolID: tool.id) != nil { NativeColorToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "datetime": if NativeDateTimeEngine.operation(forToolID: tool.id) != nil { NativeDateTimeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "barcode": if NativeBarcodeEngine.supports(tool) { NativeBarcodeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "mime": if NativeMimeEngine.operation(forToolID: tool.id) != nil { NativeMimeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "converter": if NativeConverterEngine.operation(for: tool) != nil { NativeConverterToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "calculator": if NativeCalculatorEngine.operation(for: tool.id) != nil { NativeCalculatorToolView(tool: tool) } else if NativeExpansionCalculatorEngine.operation(for: tool.id) != nil { NativeExpansionCalculatorToolView(tool: tool) } else if NativeMathExerciseEngine.operation(for: tool.id) != nil { NativeMathExerciseToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "generator", "network", "seo", "cssgen": if NativeUtilityEngine.supports(tool) { NativeUtilityToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "developer": if NativeUtilityEngine.supports(tool) { NativeDeveloperToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "custom": if tool.category == "productivity" { NativeProductivityToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            default: NativeUnavailableToolView(tool: tool, backend: NativeBackendEngine.supports(tool))
            }
            if NativeAiEngine.supports(tool.id) {
                NativeAiToolView(tool: tool)
            }
        }
    }
}

private struct NativeBackendToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var options = "{}"
    @State private var files: [NativeBackendFile] = []
    @State private var output = ""
    @State private var error: String?
    @State private var working = false
    @State private var showImporter = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Native Swift · enV backend API").font(.subheadline.weight(.semibold))
            NativeInputField(title: "Input", text: $input)
            NativeInputField(title: "Options JSON", text: $options)
            HStack {
                if !["custom","developer"].contains(tool.engine.type ?? "") { Button("Choose file") { showImporter = true }.buttonStyle(.bordered) }
                Button("Run") { Task { await run() } }.buttonStyle(.borderedProminent).disabled(working)
                if !files.isEmpty { Text("Selected \(files.count) file(s)").font(.caption).foregroundStyle(.secondary) }
            }
            if !output.isEmpty { NativeOutputView(output: output, error: error) }
            else if let error { NativeOutputView(output: "", error: error) }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { files = urls.compactMap { url in try? NativeBackendFile(name: url.lastPathComponent, mimeType: "application/octet-stream", data: Data(contentsOf: url)) } }
        }
    }
    private func run() async {
        working = true; defer { working = false }
        do { let r = try await NativeBackendEngine.execute(tool,input:input,options:options,files:files); if let text=r.text { output=text } else { output="Output ready: \(r.fileName ?? tool.id) · \(r.data?.count ?? 0) bytes" }; error=nil }
        catch let caughtError { output=""; error=caughtError.localizedDescription }
    }
}

private struct NativeProductivityToolView: View {
    let tool: Tool
    @State private var running = false
    @State private var elapsed = 0
    @State private var remaining = 1500
    @State private var phase = "focus"
    let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    var body: some View { VStack(spacing: 14) { Text(tool.id == "stopwatch" ? "Stopwatch" : tool.id == "pomodoro-timer" ? "Pomodoro · \(phase.capitalized)" : "Focus Timer").font(.headline); Text(format(tool.id == "stopwatch" ? elapsed : remaining)).font(.system(size: 56, weight: .medium, design: .monospaced)); HStack { Button(running ? "Pause" : "Start") { running.toggle() }.buttonStyle(.borderedProminent); Button("Reset") { running=false; elapsed=0; remaining=tool.id=="pomodoro-timer" ? 1500 : 3000; phase="focus" }.buttonStyle(.bordered) } }.onReceive(timer) { _ in guard running else { return }; if tool.id == "stopwatch" { elapsed += 1 } else if remaining <= 1 { phase = phase == "focus" ? "break" : "focus"; remaining = tool.id=="pomodoro-timer" ? (phase == "focus" ? 1500 : 300) : (phase == "focus" ? 3000 : 600) } else { remaining -= 1 } } }
    private func format(_ s:Int)->String { String(format:"%02d:%02d",s/60,s%60) }
}

private struct NativeUtilityToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var optionsJSON = "{}"
    @State private var output = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Native \(tool.engine.type ?? "utility") engine · op \(tool.engine.op ?? tool.engine.id ?? tool.id)")
                .font(.subheadline.weight(.semibold))
            Text("Uses the catalog engine.op contract. Input is optional; structured parameters are supplied as JSON to preserve the web engine's flexible option model.")
                .font(.caption).foregroundStyle(.secondary)
            NativeInputField(title: "Input", text: $input)
            NativeInputField(title: "Options JSON", text: $optionsJSON)
            NativeActionRow(output: output, run: {
                do { let result = try NativeUtilityEngine.run(tool, input: input, optionsJSON: optionsJSON); output = result.text; error = nil }
                catch let caughtError { output = ""; error = caughtError.localizedDescription }
            }, reset: { input = ""; optionsJSON = "{}"; output = ""; error = nil })
            NativeOutputView(output: output, error: error)
        }
    }
}

enum NativeDeveloperToolFormPolicy {
    static func needsSecondInput(_ op:String) -> Bool { ["diff","regex","replace","compare"].contains { op.contains($0) } }
    static func needsRegexFlags(_ op:String) -> Bool { op.contains("regex") }
}

private struct NativePlainTextDocument: FileDocument {
    static var readableContentTypes:[UTType] { [.plainText] }
    let text:String
    init(text:String) { self.text=text }
    init(configuration:ReadConfiguration) throws { text=String(decoding:configuration.file.regularFileContents ?? Data(),as:UTF8.self) }
    func fileWrapper(configuration:WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents:Data(text.utf8)) }
}

private struct NativeDeveloperTextArea: View {
    let title:String
    @Binding var text:String
    var placeholder:String=""
    var body:some View {
        VStack(alignment:.leading,spacing:6) {
            Text(title).font(.footnote.weight(.medium))
            TextEditor(text:$text).font(.system(.body,design:.monospaced)).scrollContentBackground(.hidden)
                .frame(minHeight:170).padding(4)
                .overlay(RoundedRectangle(cornerRadius:10).stroke(Color.envTeal.opacity(0.35)))
                .overlay(alignment:.topLeading) {
                    if text.isEmpty && !placeholder.isEmpty { Text(placeholder).font(.system(.body,design:.monospaced)).foregroundStyle(.secondary).padding(.leading,10).padding(.top,12).allowsHitTesting(false) }
                }
        }
    }
}

private struct NativeDeveloperToolView: View {
    let tool:Tool
    @State private var input=""
    @State private var secondary=""
    @State private var flags="g"
    @State private var output=""
    @State private var error:String?
    @State private var isExporting=false
    private var op:String { tool.engine.op ?? tool.engine.id ?? tool.id }

    var body:some View {
        VStack(alignment:.leading,spacing:12) {
            NativeDeveloperTextArea(title:"Input",text:$input,placeholder:"Paste your code, data, token, URL, or text here…")
            if NativeDeveloperToolFormPolicy.needsSecondInput(op) { NativeDeveloperTextArea(title:"Second input / test string",text:$secondary) }
            if NativeDeveloperToolFormPolicy.needsRegexFlags(op) { NativeInputField(title:"Regex flags",text:$flags) }
            HStack(spacing:10) {
                Button("Run tool",action:run).buttonStyle(.borderedProminent)
                Button("Reset",action:reset).buttonStyle(.bordered)
            }
            if !output.isEmpty {
                HStack(spacing:10) {
                    Button("Copy") { UIPasteboard.general.string=output }.buttonStyle(.bordered)
                    Button("Download") { isExporting=true }.buttonStyle(.bordered)
                }
            }
            NativeOutputView(output:output,error:error)
        }
        .fileExporter(isPresented:$isExporting,document:NativePlainTextDocument(text:output),contentType:.plainText,defaultFilename:"env-\(op).txt") { result in
            if case let .failure(caughtError)=result { error=caughtError.localizedDescription }
        }
    }

    private func run() {
        var options=[String:String]()
        if NativeDeveloperToolFormPolicy.needsSecondInput(op) { options["secondary"]=secondary }
        if NativeDeveloperToolFormPolicy.needsRegexFlags(op) { options["flags"]=flags }
        do {
            let data=try JSONSerialization.data(withJSONObject:options,options:[.sortedKeys])
            let raw=String(data:data,encoding:.utf8) ?? "{}"
            output=try NativeUtilityEngine.run(tool,input:input,optionsJSON:raw).text; error=nil
        } catch let caughtError { output=""; error=caughtError.localizedDescription }
    }
    private func reset() { input=""; secondary=""; output=""; error=nil }
}

private struct NativeConverterToolView: View {
    let tool: Tool
    @State private var value = "1"
    @State private var from = ""
    @State private var to = ""
    @State private var output = ""
    @State private var error = ""

    init(tool: Tool) {
        self.tool = tool
        let units = NativeConverterEngine.operation(for: tool).map { NativeConverterEngine.units(for: $0) } ?? []
        _from = State(initialValue: units.first?.id ?? "")
        _to = State(initialValue: units.dropFirst().first?.id ?? units.first?.id ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let op = NativeConverterEngine.operation(for: tool) {
                Text("System: \(op.systemID) · mode: \(op.mode)").font(.caption).foregroundStyle(.secondary)
                NativeInputField(title: "Value", text: $value)
                Text("Unit IDs are the same IDs used by the web engine (examples: \(NativeConverterEngine.units(for: op).prefix(5).map(\.id).joined(separator: ", ")) …)").font(.caption).foregroundStyle(.secondary)
                NativeInputField(title: "From unit", text: $from)
                NativeInputField(title: "To unit", text: $to)
                NativeActionRow(output: output, run: {
                    do { output = try NativeConverterEngine.run(op, valueText: value, from: from.trimmingCharacters(in: .whitespaces), to: to.trimmingCharacters(in: .whitespaces)); error = "" }
                    catch let caughtError { output = ""; error = caughtError.localizedDescription }
                }, reset: { value = "1"; from = NativeConverterEngine.units(for: op).first?.id ?? ""; to = NativeConverterEngine.units(for: op).dropFirst().first?.id ?? from; output = ""; error = "" })
                NativeOutputView(output: output, error: error)
            }
        }
    }
}

private struct NativeCalculatorToolView: View {
    let tool: Tool
    @State private var values: [String: String]
    @State private var output = ""
    @State private var error: String?

    init(tool: Tool) {
        self.tool = tool
        let op = NativeCalculatorEngine.operation(for: tool.id)
        _values = State(initialValue: Dictionary(uniqueKeysWithValues: (op?.fields ?? []).map { ($0.name, $0.defaultValue) }))
        _error = State(initialValue: nil)
    }

    var body: some View {
        if let op = NativeCalculatorEngine.operation(for: tool.id) {
            VStack(alignment: .leading, spacing: 12) {
                if let formula = op.formula, !formula.isEmpty { Text("Formula: \(formula)").font(.subheadline.weight(.semibold)) }
                ForEach(op.fields, id: \.name) { field in
                    NativeInputField(title: field.suffix.map { "\(field.label) (\($0))" } ?? field.label, text: binding(for: field.name))
                }
                NativeActionRow(output: output, run: {
                    do {
                        let rows = try NativeCalculatorEngine.run(op, values: values)
                        output = rows.map { "\($0.label): \($0.value)\($0.hint.map { " \($0)" } ?? "")" }.joined(separator: "\n")
                        error = nil
                    } catch let caughtError { output = ""; error = caughtError.localizedDescription }
                }, reset: { values = Dictionary(uniqueKeysWithValues: op.fields.map { ($0.name, $0.defaultValue) }); output = ""; error = nil })
                NativeOutputView(output: output, error: error)
            }
        } else { EmptyView() }
    }

    private func binding(for key: String) -> Binding<String> { Binding(get: { values[key] ?? "" }, set: { values[key] = $0 }) }
}

private struct NativeExpansionCalculatorToolView: View {
    let tool: Tool
    @State private var values: [Character: String]
    @State private var output = ""
    @State private var error: String?

    init(tool: Tool) {
        self.tool = tool
        let op = NativeExpansionCalculatorEngine.operation(for: tool.id)
        var initial: [Character: String] = ["a": "2", "b": "3", "c": "6"]
        if let op { initial[op.target] = "" }
        _values = State(initialValue: initial)
        _error = State(initialValue: nil)
    }

    var body: some View {
        if let op = NativeExpansionCalculatorEngine.operation(for: tool.id) {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(op.cLabel) = \(op.aLabel) \(op.family == "product" ? "×" : op.family == "ratio" ? "÷" : "+") \(op.bLabel)").font(.subheadline.weight(.semibold))
                if op.target != "a" { NativeInputField(title: op.aLabel, text: binding(for: "a")) }
                if op.target != "b" { NativeInputField(title: op.bLabel, text: binding(for: "b")) }
                if op.target != "c" { NativeInputField(title: op.cLabel, text: binding(for: "c")) }
                NativeActionRow(output: output, run: {
                    do {
                        let numericValues = values.compactMapValues { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        let result = try NativeExpansionCalculatorEngine.run(op, values: numericValues)
                        output = "\(result.0): \(result.1)"; error = nil
                    } catch let caughtError { output = ""; error = caughtError.localizedDescription }
                }, reset: { values = ["a": "2", "b": "3", "c": "6"]; values[op.target] = ""; output = ""; error = nil })
                NativeOutputView(output: output, error: error)
            }
        } else { EmptyView() }
    }

    private func binding(for key: Character) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }
}

private struct NativeMathExerciseToolView: View {
    let tool: Tool
    @State private var values: [String: String]
    @State private var output = ""
    @State private var error: String?

    init(tool: Tool) {
        self.tool = tool
        let op = NativeMathExerciseEngine.operation(for: tool.id)
        _values = State(initialValue: Dictionary(uniqueKeysWithValues: (op?.fields ?? []).map { ($0.name, "1") }))
        _error = State(initialValue: nil)
    }

    var body: some View {
        if let op = NativeMathExerciseEngine.operation(for: tool.id) {
            VStack(alignment: .leading, spacing: 12) {
                Text(op.formula).font(.subheadline.weight(.semibold))
                ForEach(op.fields, id: \.name) { field in NativeInputField(title: field.label, text: binding(for: field.name)) }
                NativeActionRow(output: output, run: {
                    do {
                        let rows = try NativeMathExerciseEngine.run(op, values: values)
                        output = rows.map { "\($0.label): \($0.value)\($0.hint.map { " \($0)" } ?? "")" }.joined(separator: "\n"); error = nil
                    } catch let caughtError { output = ""; error = caughtError.localizedDescription }
                }, reset: { values = Dictionary(uniqueKeysWithValues: op.fields.map { ($0.name, "1") }); output = ""; error = nil })
                NativeOutputView(output: output, error: error)
            }
        } else { EmptyView() }
    }

    private func binding(for key: String) -> Binding<String> { Binding(get: { values[key] ?? "" }, set: { values[key] = $0 }) }
}

private struct NativeInputField: View {
    let title: String
    @Binding var text: String
    var body: some View { TextField(title, text: $text).textFieldStyle(.roundedBorder) }
}

private enum NativeSimpleError: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
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
                HStack(spacing: 6) { EnVIcon(name: "Copy", size: 14, tint: .envAccent); Text("Copy") }
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
                HStack(spacing: 8) { EnVIcon(name: "FilePlus2", size: 16, tint: .envAccent); Text(fileName.isEmpty ? "Choose a local file" : "Choose another file") }
            }.buttonStyle(.bordered)
            TextField("File name", text: $fileName).textFieldStyle(.roundedBorder)
            TextField("Declared MIME", text: $browserMime).textFieldStyle(.roundedBorder)
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
            HStack {
                Button(action: run) { HStack(spacing: 6) { EnVIcon(name: "Play", size: 14, tint: .white); Text("Run") } }.buttonStyle(.borderedProminent)
                Button(action: reset) { HStack(spacing: 6) { EnVIcon(name: "RotateCcw", size: 14, tint: .envMuted); Text("Reset") } }.buttonStyle(.bordered)
                Button { UIPasteboard.general.string = output } label: { HStack(spacing: 6) { EnVIcon(name: "Copy", size: 14, tint: .envAccent); Text("Copy output") } }.disabled(output.isEmpty)
            }
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

struct NativeBackendFile { let name:String; let mimeType:String; let data:Data }
private struct NativeBackendResult { let text:String?; let data:Data?; let mimeType:String?; let fileName:String? }

enum NativeBackendEngine {
    static var baseURL: URL? {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return raw.isEmpty ? nil : URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
    static let backendIDs:Set<String> = ["youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader"]
    static let categoryBackend:Set<String> = ["personal","marketing","communication","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators","developer","business","celebrations","events","food","travel","photography","ai","qr","random","mockups","screenshots","files","converters","image","audio","video"]
    static func supports(_ tool:Tool)->Bool {
        if tool.engine.type=="developer" && NativeUtilityEngine.supports(tool) { return false }
        if tool.engine.type=="mime" && NativeMimeEngine.operation(forToolID:tool.id) != nil { return false }
        if tool.engine.type=="datetime" && NativeDateTimeEngine.operation(forToolID: tool.id) != nil { return false }
        if NativeBarcodeEngine.supports(tool) { return false }
        return backendIDs.contains(tool.id) || categoryBackend.contains(tool.category) || ["developer","image","audio","video","mockup","post","pdf","document-backend"].contains(tool.engine.type)
    }
    fileprivate static func execute(_ tool:Tool,input:String,options:String,files:[NativeBackendFile]) async throws -> NativeBackendResult {
        let opt=(try? JSONSerialization.jsonObject(with:Data(options.utf8)) as? [String:Any]) ?? [:]
        if ["audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles"].contains(tool.id) { guard let f=files.first else{throw NativeNativeError.message("Choose an audio or video file first.")}; return try await multipart("/api/backend/transcribe",fields:["mode":tool.id.hasPrefix("video-") ? "video":"audio","format":tool.id.hasSuffix("-subtitles") ? "srt":"txt","language":(opt["language"] as? String) ?? "auto"],files:[f]) }
        if tool.id=="ocr-tool" { return try await multipart("/api/backend/ocr",fields:["language":(opt["language"] as? String) ?? "eng"],files:files) }
        if tool.id=="pdf-to-word" { guard let f=files.first else{throw NativeNativeError.message("Choose a PDF first.")}; return try await multipart("/api/backend/pdf",fields:["operation":"pdf-to-word","params":options,"outputName":"pdf-to-word.docx"],files:[f]) }
        if tool.id=="dns-lookup" || tool.id=="whois-lookup" { return try await json("/api/backend/network",body:["operation":tool.id=="dns-lookup" ? "dns":"whois","domain":input,"recordType":opt["recordType"] as? String ?? "A"]) }
        if tool.id=="website-screenshot" { return try await json("/api/backend/website-screenshot",body:["url":input,"options":opt]) }
        if tool.engine.type=="url-media" || tool.engine.type=="url-media-info" { return try await json("/api/backend/url-media/\(tool.engine.type=="url-media-info" ? "info":"download")",body:urlMediaRequestBody(input: input, options: opt)) }
        if tool.category=="qr" || tool.category=="barcode" { return try await json("/api/backend/barcodes",body:["format":tool.id,"toolId":tool.id,"value":input]) }
        if tool.category=="mockups" { return try await json("/api/backend/mockups",body:["toolId":tool.id]) }
        if tool.category=="screenshots" { guard let f=files.first else { throw NativeNativeError.message("Choose a screenshot first.") }; return try await multipart("/api/backend/screenshots",fields:["operation":tool.id],files:[f]) }
        if tool.engine.type=="image" { guard let f=files.first else { throw NativeNativeError.message("Choose an image first.") }; return try await multipart("/api/backend/images",fields:["operation":tool.engine.op ?? tool.id,"params":options,"outputName":"\(tool.id)-output"],files:[f]) }
        if tool.engine.type=="audio" || tool.engine.type=="video" { guard let f=files.first else { throw NativeNativeError.message("Choose an audio or video file first.") }; return try await multipart("/api/backend/media",fields:["operation":tool.engine.op ?? tool.id,"params":options],files:[f]) }
        if tool.engine.type=="pdf" { return try await multipart("/api/backend/pdf",fields:["operation":tool.engine.op ?? "metadata","params":options,"outputName":"\(tool.id).pdf"],files:files) }
        if tool.engine.type=="custom" || tool.engine.type=="developer" { return try await json("/api/backend/tool",body:["toolId":tool.id,"category":tool.category,"input":input,"options":opt]) }
        if categoryBackend.contains(tool.category) { return try await json("/api/backend/tool",body:["toolId":tool.id,"category":tool.category,"input":input,"options":opt]) }
        if tool.engine.type=="document-backend" { return try await multipart("/api/backend/documents",fields:["operation":tool.engine.op ?? tool.id,"params":options,"outputName":"\(tool.id)-output"],files:files) }
        return try await multipart("/api/backend/media",fields:["operation":tool.engine.op ?? tool.engine.id ?? tool.id,"params":options],files:files)
    }
    static func urlMediaRequestBody(input: String, options: [String: Any]) -> [String: Any] {
        var body = options
        body["url"] = input
        return body
    }
    private static func json(_ path:String,body:[String:Any]) async throws -> NativeBackendResult {
        guard let baseURL else { throw NativeNativeError.message("AI/backend API is not configured for this build.") }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try parse(data, response)
    }
    private static func multipart(_ path:String,fields:[String:String],files:[NativeBackendFile]) async throws -> NativeBackendResult {
        guard let baseURL else { throw NativeNativeError.message("AI/backend API is not configured for this build.") }
        let boundary = "enV-\(UUID().uuidString)"
        var body = Data()
        for (name, value) in fields {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        for file in files {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(file.name)\"\r\nContent-Type: \(file.mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(file.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        return try parse(data, response)
    }
    private static func parse(_ d:Data,_ res:URLResponse)throws->NativeBackendResult{guard let h=res as? HTTPURLResponse else{throw NativeNativeError.message("Invalid backend response.")};if !(200...299).contains(h.statusCode){throw NativeNativeError.message(String(data:d,encoding:.utf8) ?? "Backend request failed.")};let m=h.mimeType ?? "application/octet-stream";return m.contains("json") ? NativeBackendResult(text:String(data:d,encoding:.utf8),data:nil,mimeType:m,fileName:nil) : NativeBackendResult(text:nil,data:d,mimeType:m,fileName:nil)}
}

enum NativeBarcodeEngine {
    private static let ids: Set<String> = ["ean13-check-digit", "upc-check-digit", "gtin-validator"]
    static func supports(_ tool: Tool) -> Bool { ids.contains(tool.id) && tool.engine.type == "barcode" }
    static func run(toolID: String, input: String) throws -> String {
        guard ids.contains(toolID) else { throw NativeNativeError.message("Unknown barcode operation.") }
        let digits = input.filter(\.isNumber)
        if toolID == "gtin-validator" {
            guard [8, 12, 13, 14].contains(digits.count) else { throw NativeNativeError.message("GTIN must contain 8, 12, 13 or 14 digits.") }
            let expected = checkDigit(String(digits.dropLast()))
            let supplied = Int(String(digits.last!))!
            return "\(expected == supplied ? "Valid" : "Invalid"): Expected check digit: \(expected). Supplied: \(supplied)."
        }
        guard !digits.isEmpty else { throw NativeNativeError.message("Enter numeric digits.") }
        let body = toolID == "upc-check-digit" ? String(digits.prefix(11)) : String(digits.prefix(12))
        guard !body.isEmpty else { throw NativeNativeError.message("Enter numeric digits.") }
        return "Calculated check digit: \(checkDigit(body)). Supplied check digit: \(digits.last!)."
    }
    private static func checkDigit(_ value: String) -> Int { var sum = 0; for (index, scalar) in value.unicodeScalars.reversed().enumerated() { sum += Int(scalar.value - 48) * (index % 2 == 0 ? 3 : 1) }; return (10 - sum % 10) % 10 }
}

enum NativeNativeError:LocalizedError{case message(String);var errorDescription:String?{if case .message(let s)=self{return s};return nil}}

private struct NativeBarcodeToolView: View {
    let tool: Tool
    @State private var value = ""
    @State private var output = ""
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeInputField(title: "Value", text: $value)
            NativeActionRow(output: output, run: { do { output = try NativeBarcodeEngine.run(toolID: tool.id, input: value); error = nil } catch let caughtError { output = ""; error = caughtError.localizedDescription } }, reset: { value = ""; output = ""; error = nil })
            NativeOutputView(output: output, error: error)
        }
        .onAppear { if tool.id == "gtin-validator" && value.isEmpty { value = "ENV-12345" } }
    }
}

private struct NativeUnavailableToolView: View {
    let tool: Tool
    let backend: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(backend ? "Native Swift · enV backend API" : "Not implemented natively")
                .font(.subheadline.weight(.semibold))
            Text(backend ? "This operation is executed by the configured enV backend." : "This catalog entry is not advertised as a native capability until a real implementation is connected.")
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Native AI infrastructure client and UI

enum NativeAiEngine {
    static let captionTools: Set<String> = ["instagram-caption-generator", "tiktok-caption-generator", "x-caption-generator", "youtube-caption-generator", "linkedin-caption-generator", "facebook-caption-generator", "caption-generator"]
    static let promptTools: Set<String> = ["prompt-generator"]
    static let bioTools: Set<String> = ["bio-generator"]
    static let titleTools: Set<String> = ["youtube-title-generator", "tiktok-title-generator", "instagram-title-generator", "podcast-title-generator", "title-generator"]
    static let exactTasks: [String:String] = ["regex-tester":"developer.regex.explain", "sql-formatter":"developer.sql.explain", "json-validator":"developer.json.explain", "alt-text-generator":"image.alt.generate", "video-audio-extractor":"video.transcript.generate"]

    static func supports(_ toolID: String) -> Bool { captionTools.contains(toolID) || promptTools.contains(toolID) || bioTools.contains(toolID) || titleTools.contains(toolID) || exactTasks[toolID] != nil }
    static func isLocalCaption(_ toolID: String) -> Bool { captionTools.contains(toolID) }
    static func isLocalPrompt(_ toolID: String) -> Bool { promptTools.contains(toolID) }
    static func isLocalBio(_ toolID: String) -> Bool { bioTools.contains(toolID) }
    static func localCaption(topic rawTopic: String, audience rawAudience: String, count rawCount: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let count = min(15, max(1, Int(rawCount) ?? 5))
        let lines = [
            "\(topic) made simple. Save this for later.",
            "If you're into \(topic), this one is for you.",
            "A quick reminder for \(audience): you don't need to overcomplicate \(topic).",
            "Learning \(topic) one step at a time. What would you add?",
            "Here's the part about \(topic) people usually skip.",
            "Small steps, better results. That's the goal with \(topic).",
            "Trying to understand \(topic)? Start here."
        ]
        return lines.prefix(count).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localPrompt(task rawTask: String, audience rawAudience: String, tone rawTone: String) -> String {
        let task = rawTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Complete the requested task" : rawTask.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let tone = ["professional": "clear and professional", "bold": "confident and direct", "playful": "light and playful", "friendly": "warm and friendly"][rawTone] ?? "natural and conversational"
        return "ROLE\nYou are a helpful specialist supporting \(audience).\n\nTASK\n\(task).\n\nSTYLE\nUse a \(tone) style.\n\nCONTEXT\nFocus on practical, accurate output. Avoid unnecessary filler and clearly state assumptions.\n\nOUTPUT\nReturn a useful, structured answer with headings or bullets where they improve readability.\n\nCHECK\nBefore answering, verify that the response directly addresses the task and is suitable for \(audience)."
    }
    static func localBio(role rawRole: String, audience rawAudience: String, count rawCount: String) -> String {
        let role = rawRole.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "creator" : rawRole.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let count = min(5, max(1, Int(rawCount) ?? 5))
        let topic = "your topic"
        let lines = ["\(role) | Helping \(audience) learn, create & grow.", "\(role) • \(topic) • Building in public.", "Creating around \(topic). Sharing what I learn along the way.", "\(role) | Making \(topic) easier to understand.", "\(role) focused on practical ideas for \(audience)."]
        return lines.prefix(count).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func task(for toolID: String) -> String? { captionTools.contains(toolID) ? "creator.caption.generate" : promptTools.contains(toolID) ? "local.prompt" : bioTools.contains(toolID) ? "local.bio" : titleTools.contains(toolID) ? "creator.title.generate" : exactTasks[toolID] }
    static func platform(for toolID: String) -> String {
        switch toolID {
        case "instagram-caption-generator", "instagram-title-generator": return "instagram"
        case "tiktok-caption-generator", "tiktok-title-generator": return "tiktok"
        case "youtube-caption-generator", "youtube-title-generator": return "youtube"
        case "linkedin-caption-generator": return "linkedin"
        case "facebook-caption-generator": return "facebook"
        case "x-caption-generator": return "x"
        case "podcast-title-generator": return "podcast"
        default: return "generic"
        }
    }

    static func input(toolID: String, values: [String:Any], file: NativeBackendFile?) -> [String:Any] {
        switch task(for: toolID) {
        case "creator.caption.generate": return ["topic": values["topic"] ?? "", "tone": values["tone"] ?? "friendly", "language": values["language"] ?? "en", "variants": values["variants"] ?? 3, "includeHashtags": values["includeHashtags"] ?? true, "platform": platform(for: toolID)]
        case "creator.title.generate": return ["topic": values["topic"] ?? "", "tone": values["tone"] ?? "friendly", "language": values["language"] ?? "en", "variants": values["variants"] ?? 5, "platform": platform(for: toolID)]
        case "developer.regex.explain": return ["pattern": values["pattern"] ?? "", "flags": values["flags"] ?? "", "sampleText": values["sampleText"] ?? ""]
        case "developer.sql.explain": return ["sql": values["sql"] ?? "", "dialect": values["dialect"] ?? "generic"]
        case "developer.json.explain": return ["json": values["json"] ?? "", "goal": values["goal"] ?? "describe"]
        case "image.alt.generate":
            guard let file else { return values }
            return ["imageBase64": file.data.base64EncodedString(), "mimeType": file.mimeType, "context": values["context"] ?? "", "style": values["style"] ?? "concise", "language": values["language"] ?? "en"]
        case "video.transcript.generate":
            guard let file else { return values }
            return ["audioBase64": file.data.base64EncodedString(), "mimeType": file.mimeType, "filename": file.name, "language": values["language"] ?? ""]
        default: return values
        }
    }

    static func format(task: String, result: [String:Any]) -> String {
        switch task {
        case "creator.caption.generate":
            let variants = result["variants"] as? [[String:Any]] ?? []
            return variants.enumerated().map { index, item in
                let caption = item["caption"] as? String ?? ""
                let tags = (item["hashtags"] as? [String] ?? []).joined(separator: " ")
                return tags.isEmpty ? "\(index + 1). \(caption)" : "\(index + 1). \(caption)\n\(tags)"
            }.joined(separator: "\n\n")
        case "creator.title.generate": return (result["titles"] as? [String] ?? []).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
        case "developer.regex.explain":
            var text = result["summary"] as? String ?? ""
            if let parts = result["parts"] as? [[String:Any]], !parts.isEmpty { text += "\n\nParts\n" + parts.map { "• \($0["token"] as? String ?? ""): \($0["meaning"] as? String ?? "")" }.joined(separator: "\n") }
            if let pitfalls = result["pitfalls"] as? [String], !pitfalls.isEmpty { text += "\n\nPitfalls\n" + pitfalls.map { "• \($0)" }.joined(separator: "\n") }
            return text
        case "developer.sql.explain":
            var text = result["summary"] as? String ?? ""
            if let steps = result["steps"] as? [[String:Any]], !steps.isEmpty { text += "\n\nSteps\n" + steps.map { "• \($0["clause"] as? String ?? ""): \($0["explanation"] as? String ?? "")" }.joined(separator: "\n") }
            if let warnings = result["warnings"] as? [String], !warnings.isEmpty { text += "\n\nWarnings\n" + warnings.map { "• \($0)" }.joined(separator: "\n") }
            return text
        case "developer.json.explain":
            var text = result["summary"] as? String ?? ""
            if let structure = result["structure"] as? [[String:Any]], !structure.isEmpty { text += "\n\nStructure\n" + structure.map { "• \($0["path"] as? String ?? ""): \($0["type"] as? String ?? "") — \($0["note"] as? String ?? "")" }.joined(separator: "\n") }
            if let issues = result["issues"] as? [String], !issues.isEmpty { text += "\n\nIssues\n" + issues.map { "• \($0)" }.joined(separator: "\n") }
            return text
        case "image.alt.generate":
            var text = result["altText"] as? String ?? ""
            if let long = result["longDescription"] as? String, !long.isEmpty { text += "\n\n\(long)" }
            if result["containsText"] as? Bool == true, let found = result["textInImage"] as? String, !found.isEmpty { text += "\n\nText in image: \(found)" }
            return text
        case "video.transcript.generate": return result["text"] as? String ?? ""
        default: return ""
        }
    }
}

private enum NativeAiClient {
    private static let cookieKey = "env.ai.cookie"
    private static var baseURL: URL? { NativeBackendEngine.baseURL }

    private static func cookie() -> String? { UserDefaults.standard.string(forKey: cookieKey) }
    private static func saveCookie(_ value: String?) {
        guard let value, let first = value.split(separator: ";", maxSplits: 1).first, first.hasPrefix("env_ai_sid=") else { return }
        UserDefaults.standard.set(String(first), forKey: cookieKey)
    }

    static func availability() async throws -> [String:Bool] {
        let (data, response) = try await request(path: "/api/ai/status", method: "GET", body: nil)
        guard let http = response as? HTTPURLResponse else { throw NativeNativeError.message("Invalid AI response.") }
        guard (200...299).contains(http.statusCode) else { return [:] }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String:Any]
        let tasks = object?["tasks"] as? [String:[String:Any]] ?? [:]
        return tasks.reduce(into: [:]) { $0[$1.key] = $1.value["available"] as? Bool == true }
    }

    static func run(task: String, input: [String:Any]) async throws -> [String:Any] {
        let body = try JSONSerialization.data(withJSONObject: ["task":task, "input":input], options: [])
        let (data, response) = try await request(path: "/api/ai/run", method: "POST", body: body)
        guard let http = response as? HTTPURLResponse else { throw NativeNativeError.message("Invalid AI response.") }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String:Any] ?? [:]
        if !(200...299).contains(http.statusCode) {
            let error = object["error"] as? [String:Any]
            throw NativeNativeError.message(error?["message"] as? String ?? "AI request failed.")
        }
        guard let payload = object["data"] as? [String:Any], let result = payload["result"] as? [String:Any] else { throw NativeNativeError.message("The AI response was not usable.") }
        return result
    }

    static func prepareImage(_ file: NativeBackendFile) throws -> NativeBackendFile {
        guard let original = UIImage(data: file.data) else { throw NativeNativeError.message("The selected file is not a supported image.") }
        let qualities: [CGFloat] = [0.82, 0.68, 0.60, 0.55]
        for maxSide in [1280.0, 1024.0, 768.0] {
            let scale = min(1, maxSide / max(original.size.width, original.size.height))
            let size = CGSize(width: max(1, original.size.width * scale), height: max(1, original.size.height * scale))
            let renderer = UIGraphicsImageRenderer(size: size)
            let scaled = renderer.image { _ in original.draw(in: CGRect(origin: .zero, size: size)) }
            for q in qualities {
                if let data = scaled.jpegData(compressionQuality: q), data.count <= 2_400_000 { return NativeBackendFile(name: file.name, mimeType: "image/jpeg", data: data) }
            }
        }
        throw NativeNativeError.message("That image is too large for AI. Try a smaller image.")
    }

    static func prepareAudio(_ file: NativeBackendFile) throws -> NativeBackendFile {
        guard file.data.count <= 2_800_000 else { throw NativeNativeError.message("That audio file is too large for AI. Keep it under 2.8 MB.") }
        let ext = URL(fileURLWithPath: file.name).pathExtension.lowercased()
        let mime = ["mp3":"audio/mpeg","m4a":"audio/x-m4a","mp4":"audio/mp4","wav":"audio/wav","webm":"audio/webm","ogg":"audio/ogg","oga":"audio/ogg","flac":"audio/flac"][ext] ?? file.mimeType
        guard mime.hasPrefix("audio/") else { throw NativeNativeError.message("Use an MP3, M4A, WAV, WebM, OGG or FLAC audio file.") }
        return NativeBackendFile(name: file.name, mimeType: mime, data: file.data)
    }

    private static func request(path: String, method: String, body: Data?) async throws -> (Data, URLResponse) {
        guard let baseURL else { throw NativeNativeError.message("AI/backend API is not configured for this build.") }
        var request = URLRequest(url: baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path))
        request.httpMethod = method
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie = cookie() { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let body { request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse { saveCookie(http.value(forHTTPHeaderField: "Set-Cookie")) }
        return (data, response)
    }
}

private struct NativeAiToolView: View {
    let tool: Tool
    @State private var available: Bool? = nil
    @State private var working = false
    @State private var error = ""
    @State private var output = ""
    @State private var consent = false
    @State private var topic = ""
    @State private var audience = "creators and small businesses"
    @State private var tone = "friendly"
    @State private var language = "en"
    @State private var variants = "3"
    @State private var includeHashtags = true
    @State private var pattern = ""
    @State private var flags = ""
    @State private var sampleText = ""
    @State private var sql = ""
    @State private var dialect = "generic"
    @State private var json = ""
    @State private var goal = "describe"
    @State private var contextText = ""
    @State private var style = "concise"
    @State private var file: NativeBackendFile?
    @State private var picker = false

    init(tool: Tool) { self.tool = tool; _topic = State(initialValue: tool.id.contains("caption") ? "AI tools for creators" : tool.id == "prompt-generator" ? "Create a launch plan for a digital product" : tool.id == "bio-generator" ? "AI music creator" : ""); _variants = State(initialValue: tool.id.contains("title") || tool.id == "bio-generator" ? "5" : "5") }

    private var task: String? { NativeAiEngine.task(for: tool.id) }
    private var needsConsent: Bool { ["json-validator","alt-text-generator","video-audio-extractor"].contains(tool.id) }
    private var needsFile: Bool { ["alt-text-generator","video-audio-extractor"].contains(tool.id) }
    private var localCaption: Bool { NativeAiEngine.isLocalCaption(tool.id) }
    private var localPrompt: Bool { NativeAiEngine.isLocalPrompt(tool.id) }
    private var localBio: Bool { NativeAiEngine.isLocalBio(tool.id) }
    private var localDeterministic: Bool { localCaption || localPrompt || localBio }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(localDeterministic ? "Runs locally with deterministic templates" : "AI assistance · native Swift → enV AI API").font(.subheadline.weight(.semibold))
            if !localDeterministic && available == false { Text("AI is currently unavailable on this deployment. The local/native tool still works.").font(.caption).foregroundStyle(.secondary) }
            if let task {
                if localPrompt { NativeInputField(title: "Task", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone) }
                else if localBio { NativeInputField(title: "Role / what you do", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Options", text: $variants) }
                else if NativeAiEngine.captionTools.contains(tool.id) || NativeAiEngine.titleTools.contains(tool.id) {
                    NativeInputField(title: "Topic", text: $topic); if localCaption { NativeInputField(title: "Audience", text: $audience) }; NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Language", text: $language); NativeInputField(title: "Options", text: $variants)
                    if NativeAiEngine.captionTools.contains(tool.id) { Toggle("Include hashtags", isOn: $includeHashtags) }
                } else if tool.id == "regex-tester" { NativeInputField(title: "Pattern", text: $pattern); NativeInputField(title: "Flags", text: $flags); NativeInputField(title: "Sample text", text: $sampleText) }
                else if tool.id == "sql-formatter" { NativeInputField(title: "SQL", text: $sql); NativeInputField(title: "Dialect", text: $dialect) }
                else if tool.id == "json-validator" { NativeInputField(title: "JSON", text: $json); NativeInputField(title: "Focus", text: $goal) }
                else if tool.id == "alt-text-generator" { Button(file == nil ? "Choose image" : file!.name) { picker = true }.buttonStyle(.bordered); NativeInputField(title: "Page context", text: $contextText); NativeInputField(title: "Style", text: $style); NativeInputField(title: "Language", text: $language) }
                else if tool.id == "video-audio-extractor" { Button(file == nil ? "Choose audio" : file!.name) { picker = true }.buttonStyle(.bordered); NativeInputField(title: "Language code", text: $language) }
                if needsConsent { Toggle("I understand this input is sent to an external AI service.", isOn: $consent) }
                HStack { Button(working ? "Working…" : "Generate") { run(task: task) }.buttonStyle(.borderedProminent).disabled(working || (!localDeterministic && available != true) || needsConsent && !consent || needsFile && file == nil || requiredMissing); Button("Reset") { output=""; error=""; topic=localCaption ? "AI tools for creators" : localPrompt ? "Create a launch plan for a digital product" : localBio ? "AI music creator" : ""; audience="creators and small businesses";pattern="";sql="";json="";file=nil }.buttonStyle(.bordered) }
                if !output.isEmpty { TextEditor(text: .constant(output)).frame(minHeight: 150).textSelection(.enabled).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3))) }
                if !error.isEmpty { Text(error).foregroundStyle(.red).font(.footnote) }
                Text("AI output can be wrong. Review it before you use it. Native deterministic tools remain available offline.").font(.caption).foregroundStyle(.secondary)
                    .onAppear { if !localDeterministic { Task { available = (try? await NativeAiClient.availability()[task]) ?? false } } }
                    .fileImporter(isPresented: $picker, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in if case .success(let urls) = result, let url = urls.first { let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; if let data = try? Data(contentsOf: url) { file = NativeBackendFile(name: url.lastPathComponent, mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", data: data) } } }
            }
        }.padding(.vertical, 4)
    }

    private var requiredMissing: Bool {
        if tool.id == "regex-tester" { return pattern.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if tool.id == "sql-formatter" { return sql.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if tool.id == "json-validator" { return json.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if NativeAiEngine.captionTools.contains(tool.id) || NativeAiEngine.titleTools.contains(tool.id) || localPrompt || localBio { return topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return false
    }

    private func run(task: String) {
        working = true; error = ""; output = ""
        if localCaption { output = NativeAiEngine.localCaption(topic: topic, audience: audience, count: variants); working = false; return }
        if localPrompt { output = NativeAiEngine.localPrompt(task: topic, audience: audience, tone: tone); working = false; return }
        if localBio { output = NativeAiEngine.localBio(role: topic, audience: audience, count: variants); working = false; return }
        Task {
            do {
                let prepared: NativeBackendFile?
                if tool.id == "alt-text-generator", let file { prepared = try NativeAiClient.prepareImage(file) }
                else if tool.id == "video-audio-extractor", let file { prepared = try NativeAiClient.prepareAudio(file) }
                else { prepared = nil }
                var values: [String:Any] = ["topic":topic,"tone":tone,"language":language,"variants":Int(variants) ?? 3,"includeHashtags":includeHashtags,"pattern":pattern,"flags":flags,"sampleText":sampleText,"sql":sql,"dialect":dialect,"json":json,"goal":goal,"context":contextText,"style":style]
                let input = NativeAiEngine.input(toolID: tool.id, values: values, file: prepared)
                let result = try await NativeAiClient.run(task: task, input: input)
                let text = NativeAiEngine.format(task: task, result: result)
                await MainActor.run { output = text; working = false }
            } catch let caughtError { await MainActor.run { error = caughtError.localizedDescription; working = false } }
        }
    }
}
