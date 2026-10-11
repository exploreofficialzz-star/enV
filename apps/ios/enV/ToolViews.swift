import SwiftUI
import UIKit
import CoreImage
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
                        enVCharacterSpacedText(tool.name)
                            .font(.envScaled(size: 14, weight: .semibold))
                            .tracking(-0.15)
                            .foregroundStyle(Color.envInk)
                            .lineLimit(1)
                            .padding(.top, 12)
                        enVCharacterSpacedText(tool.description)
                            .font(.envScaled(size: 12, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                            .lineLimit(2)
                            .lineSpacing(2)
                            .padding(.top, 4)
                        if !NativeCopy.isWebRuntimeOnly(tool.id), NativeBackendEngine.supports(tool) {
                            StatusPill(text: "ONLINE", color: .envMuted).padding(.top, 10)
                        } else if !NativeCopy.isWebRuntimeOnly(tool.id), NativeCoverage.isLocallyExecutable(tool) {
                            enVCharacterSpacedText("ON DEVICE").font(.envScaled(size: 9, weight: .medium)).tracking(0.5).foregroundStyle(Color.envSubtle).padding(.top, 10)
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
        enVCharacterSpacedText(text).font(.envScaled(size: 10, weight: .medium)).foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 4).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 5))
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
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("env.selectedTab") private var selectedTab = NativeTab.home.rawValue
    @AppStorage("env.homeNavigationReset") private var homeNavigationReset = 0
    @AppStorage("env.toolsNavigationReset") private var toolsNavigationReset = 0
    @State private var visibleRelatedCount = 6
    let tool: Tool

    private var compact: Bool { horizontalSizeClass != .regular }
    private var backend: Bool { !NativeCopy.isWebRuntimeOnly(tool.id) && NativeBackendEngine.supports(tool) }
    private var local: Bool { !NativeCopy.isWebRuntimeOnly(tool.id) && NativeCoverage.isLocallyExecutable(tool) }
    private var relatedTools: [Tool] { store.catalog.relatedTools(for: tool, limit: Int.max) }
    private var categoryName: String { store.category(named: tool.category)?.name ?? tool.category }
    private var relatedColumns: [GridItem] { Array(repeating: GridItem(.flexible(), spacing: 8), count: compact ? 1 : 2) }

    var body: some View {
        let allRelatedTools = relatedTools
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Button("Home") { homeNavigationReset += 1; selectedTab = NativeTab.home.rawValue }
                    enVCharacterSpacedText("/").foregroundStyle(Color.envSubtle)
                    Button("Tools") { toolsNavigationReset += 1; selectedTab = NativeTab.tools.rawValue }
                    enVCharacterSpacedText("/").foregroundStyle(Color.envSubtle)
                    NavigationLink(value: tool.category) { enVCharacterSpacedText(categoryName) }
                    enVCharacterSpacedText("/").foregroundStyle(Color.envSubtle)
                    enVCharacterSpacedText(tool.name).foregroundStyle(Color.envInk).lineLimit(1)
                }
                .font(.envScaled(size: 12, weight: .regular))
                .foregroundStyle(Color.envMuted)
                .buttonStyle(.plain)
                .padding(.bottom, 24)

                HStack(alignment: .top, spacing: compact ? 8 : 16) {
                    toolHeading.frame(maxWidth: .infinity, alignment: .leading)
                    saveButton
                }

                if let notice = tool.nativeDisclaimerText {
                    enVCharacterSpacedText(notice)
                        .font(.envScaled(size: 14, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                        .padding(.top, 12)
                }

                VStack(alignment: .leading, spacing: 12) {
                    if backend {
                        NativeBackendToolView(tool: tool)
                    } else if local {
                        NativeFamilyToolView(tool: tool)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            StatusPill(text: tool.isPlanned ? "Coming soon" : "Web only", color: .envMuted)
                            enVCharacterSpacedText(tool.isPlanned
                                ? "This tool is not yet implemented natively."
                                : "This tool is available in the Web product and is not executable natively.")
                                .font(.envScaled(size: 14, weight: .regular))
                                .foregroundStyle(Color.envMuted)
                            if !tool.isPlanned, let webURL = URL(string: "https://en-v.vercel.app/tools/\(tool.category)/\(tool.slug)") {
                                Link("Open in Web", destination: webURL)
                                    .font(.envScaled(size: 14, weight: .semibold))
                                    .accessibilityHint("Opens this tool in your default web browser")
                            }
                        }
                    }
                }
                .padding(compact ? 16 : 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder.opacity(0.5), lineWidth: 1))
                .padding(.top, 24)

                if let assistFeature = NativeAiAssistFeatureRegistry.feature(toolID: tool.id) {
                    NativeAiAssistPanel(tool: tool, feature: assistFeature)
                        .padding(.top, 16)
                }

                VStack(alignment: .leading, spacing: 12) {
                    enVCharacterSpacedText("What this tool does")
                        .font(.envScaled(size: 18, weight: .semibold))
                        .foregroundStyle(Color.envInk)
                    enVCharacterSpacedText("\(tool.description) Results can be copied or downloaded from this page.")
                        .font(.envScaled(size: 14, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }
                .padding(.top, 40)

                if !allRelatedTools.isEmpty {
                    enVCharacterSpacedText("Related tools")
                        .font(.envScaled(size: 18, weight: .semibold))
                        .foregroundStyle(Color.envAccent)
                        .padding(.top, 40)
                        .padding(.bottom, 16)
                    LazyVGrid(columns: relatedColumns, alignment: .leading, spacing: 8) {
                        ForEach(allRelatedTools.prefix(visibleRelatedCount)) { related in
                            NavigationLink(value: related) { RelatedToolDetailCard(tool: related) }
                                .buttonStyle(.plain)
                        }
                    }
                    if allRelatedTools.count > visibleRelatedCount {
                        HStack {
                            Spacer()
                            Button {
                                visibleRelatedCount = min(visibleRelatedCount + 6, allRelatedTools.count)
                            } label: {
                                HStack(spacing: 6) {
                                    enVCharacterSpacedText("See more")
                                        .font(.envScaled(size: 14, weight: .medium))
                                    EnVIcon(name: "ChevronDown", size: 16, tint: .envAccent)
                                }
                                .foregroundStyle(Color.envAccent)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("See more related tools")
                        }
                        .padding(.top, 8)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, compact ? 32 : 40)
            .frame(maxWidth: 1024, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .modifier(Screen())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { store.recordRecent(tool.id) }
    }

    private var toolHeading: some View {
        HStack(alignment: .top, spacing: 12) {
            EnVIcon(name: tool.icon, size: 20, tint: .envAccent)
                .frame(width: 44, height: 44)
                .background(Color.envAccentSoft, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    enVCharacterSpacedText(tool.name)
                        .font(.envScaled(size: compact ? 24 : 30, weight: .semibold))
                        .tracking(-0.35)
                        .foregroundStyle(Color.envInk)
                        .fixedSize(horizontal: false, vertical: true)
                    if tool.isPlanned { StatusPill(text: "Coming soon", color: .envMuted) }
                }
                enVCharacterSpacedText(tool.description)
                    .font(.envScaled(size: 14, weight: .regular))
                    .foregroundStyle(Color.envMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var saveButton: some View {
        Button { store.toggleFavorite(tool) } label: {
            HStack(spacing: 8) {
                EnVIcon(name: "Heart", size: 16, tint: store.isFavorite(tool) ? .white : .envInk)
                enVCharacterSpacedText(store.isFavorite(tool) ? "Saved" : "Save")
                    .font(.envScaled(size: 14, weight: .medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(store.isFavorite(tool) ? Color.envAccent : Color.envCard, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(store.isFavorite(tool) ? Color.envAccent : Color.envBorder, lineWidth: 1))
            .foregroundStyle(store.isFavorite(tool) ? Color.white : Color.envInk)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(store.isFavorite(tool) ? "Remove \(tool.name) from saved" : "Save \(tool.name)")
    }
}

private struct RelatedToolDetailCard: View {
    let tool: Tool
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            enVCharacterSpacedText(tool.name).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(tool.description).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted).lineLimit(2)
            HStack {
                Spacer()
                EnVIcon(name: "ArrowRight", size: 16, tint: .envInk)
                    .accessibilityHidden(true)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
    }
}

/// The native surface is deliberately keyed by the catalog's engine type and
/// then checked against the exact operation map in that engine. This prevents
/// a similarly named catalog entry from being presented as locally executable.
enum NativeCoverage {
    static func usesBackend(_ tool: Tool) -> Bool { NativeBackendEngine.supports(tool) }
    static func isLocallyExecutable(_ tool: Tool) -> Bool {
        if usesBackend(tool) || tool.isPlanned { return false }
        switch tool.engine.type {
        case "business": return NativeBusinessEngine.supports(tool)
        case "ai": return NativeAiEngine.supports(tool.id) || NativeAiMicroEngine.supports(tool.id)
        case "file-converter", "document-backend": return NativeFileConverterEngine.supports(tool)
        case "text": return NativeTextEngine.operation(forToolID: tool.id) != nil
        case "codec": return NativeCodecEngine.operation(forToolID: tool.id) != nil
        case "color": return NativeColorEngine.operation(forToolID: tool.id) != nil
        case "datetime": return NativeDateTimeEngine.operation(forToolID: tool.id) != nil
        case "barcode", "qr": return NativeBarcodeEngine.supports(tool)
        case "image": return NativeImageEngine.supports(tool)
        case "mime": return NativeMimeEngine.operation(forToolID: tool.id) != nil
        case "converter": return NativeConverterEngine.operation(for: tool) != nil
        case "calculator": return NativeCalculatorEngine.operation(for: tool.id) != nil || NativeExpansionCalculatorEngine.operation(for: tool.id) != nil || NativeMathExerciseEngine.operation(for: tool.id) != nil
        case "generator", "network", "seo", "developer", "cssgen": return NativeUtilityEngine.supports(tool)
        case "custom": return NativeProductivityEngine.supports(tool.id) || NativeAccessibilityEngine.supports(tool) || NativeEventEngine.supports(tool.id)
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
            case "business": if NativeBusinessEngine.supports(tool) { NativeBusinessToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "ai": if NativeAiMicroEngine.supports(tool.id) { NativeAiMicroToolView(tool: tool) } else if NativeAiEngine.supports(tool.id) { NativeAiToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "file-converter", "document-backend": if NativeFileConverterEngine.supports(tool) { NativeFileConverterToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "text": if NativeTextEngine.operation(forToolID: tool.id) != nil { NativeTextToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "codec": if NativeCodecEngine.operation(forToolID: tool.id) != nil { NativeCodecToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "color": if NativeColorEngine.operation(forToolID: tool.id) != nil { NativeColorToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "datetime": if NativeDateTimeEngine.operation(forToolID: tool.id) != nil { NativeDateTimeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "barcode", "qr": if NativeBarcodeEngine.supports(tool) { NativeBarcodeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "image": if NativeImageEngine.supports(tool) { NativeImageToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "mime": if NativeMimeEngine.operation(forToolID: tool.id) != nil { NativeMimeToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "converter": if NativeConverterEngine.operation(for: tool) != nil { NativeConverterToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "calculator": if NativeCalculatorEngine.operation(for: tool.id) != nil { NativeCalculatorToolView(tool: tool) } else if NativeExpansionCalculatorEngine.operation(for: tool.id) != nil { NativeExpansionCalculatorToolView(tool: tool) } else if NativeMathExerciseEngine.operation(for: tool.id) != nil { NativeMathExerciseToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "generator", "network", "seo", "cssgen": if NativeUtilityEngine.supports(tool) { NativeUtilityToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "developer": if NativeUtilityEngine.supports(tool) { NativeDeveloperToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            case "custom": if NativeProductivityEngine.supports(tool.id) { NativeProductivityToolView(tool: tool) } else if NativeAccessibilityEngine.supports(tool) { NativeAccessibilityToolView(tool: tool) } else if NativeEventEngine.supports(tool.id) { NativeEventToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
            default: NativeUnavailableToolView(tool: tool, backend: NativeBackendEngine.supports(tool))
            }
        }
    }
}

private struct NativeBackendExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    static var writableContentTypes: [UTType] {
        [.data] + ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "tsv", "json", "xml", "yaml", "html", "txt", "png", "jpg", "jpeg", "webp", "svg", "zip"].compactMap { UTType(filenameExtension: $0) }
    }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

private struct NativeBackendToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var options = "{}"
    @State private var pages = "1"
    @State private var watermarkText = "enV"
    @State private var files: [NativeBackendFile] = []
    @State private var output = ""
    @State private var outputData: Data?
    @State private var outputFileName = "env-output"
    @State private var outputMimeType = "application/octet-stream"
    @State private var error: String?
    @State private var working = false
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var showTextExporter = false

    private var isDocument: Bool { tool.engine.type == "document-backend" }
    private var operation: String { tool.engine.op ?? tool.id }
    private var allowsMultipleDocuments: Bool { operation.range(of: "merger|comparison|splitter", options: .regularExpression) != nil }
    private var needsPages: Bool { operation.contains("page-") || operation.hasSuffix("splitter") }
    private var needsWatermark: Bool { operation.contains("watermark") }
    private var documentTypes: [UTType] {
        [UTType.pdf, UTType.png, UTType.jpeg, UTType(filenameExtension: "docx"), UTType(filenameExtension: "pptx"), UTType(filenameExtension: "xlsx"), UTType(filenameExtension: "xls")].compactMap { $0 }
    }
    private var outputContentType: UTType {
        let ext = URL(fileURLWithPath: outputFileName).pathExtension
        if !ext.isEmpty, let type = UTType(filenameExtension: ext) { return type }
        if let type = UTType(mimeType: outputMimeType) { return type }
        return .data
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isDocument {
                enVCharacterSpacedText("Real document processing through the enV document backend. The selected file is processed for the requested operation and the resulting file is returned.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button(files.isEmpty ? (allowsMultipleDocuments ? "Choose files" : "Choose file") : "Selected \(files.count) file(s)") { showImporter = true }
                    .buttonStyle(.bordered)
                if needsPages { NativeInputField(title: "Pages / range", text: $pages) }
                if needsWatermark { NativeInputField(title: "Watermark text", text: $watermarkText) }
                HStack {
                    Button(working ? "Processing…" : "Run \(operationLabel(operation))") { Task { await run() } }
                        .buttonStyle(.borderedProminent).disabled(working)
                    Button("Reset", action: reset).buttonStyle(.bordered)
                }
                if !output.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        enVCharacterSpacedText(output).font(.subheadline)
                        if outputData != nil {
                            Button("Save \(outputFileName)") { showExporter = true }.buttonStyle(.bordered)
                        }
                    }
                } else if let error { NativeOutputView(output: "", error: error) }
            } else {
                enVCharacterSpacedText("Native Swift · enV backend API").font(.subheadline.weight(.semibold))
                if tool.engine.type == "custom" {
                    VStack(alignment: .leading, spacing: 6) {
                        TextEditor(text: $input).frame(minHeight: 150)
                            .overlay(alignment: .topLeading) {
                                if input.isEmpty { enVCharacterSpacedText("Enter the input required by this tool…").foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false) }
                            }
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.secondary.opacity(0.25)))
                    }
                } else {
                    NativeInputField(title: "Input", text: $input)
                    NativeInputField(title: "Options JSON", text: $options)
                }
                HStack {
                    if !["custom","developer"].contains(tool.engine.type ?? "") { Button("Choose file") { showImporter = true }.buttonStyle(.bordered) }
                    Button(working && tool.engine.type == "custom" ? "Running…" : tool.engine.type == "custom" ? "Run tool" : "Run") { Task { await run() } }.buttonStyle(.borderedProminent).disabled(working)
                    if !files.isEmpty { enVCharacterSpacedText("Selected \(files.count) file(s)").font(.caption).foregroundStyle(.secondary) }
                }
                if tool.engine.type == "custom" && !output.isEmpty {
                    HStack {
                        Button("Copy") { UIPasteboard.general.string = output }.buttonStyle(.bordered)
                        Button("Download") { showTextExporter = true }.buttonStyle(.bordered)
                    }
                }
                if !output.isEmpty { NativeOutputView(output: output, error: error) }
                else if let error { NativeOutputView(output: "", error: error) }
            }
        }
        .font(.envScaled(size: 14, weight: .regular))
        .fileImporter(isPresented: $showImporter, allowedContentTypes: isDocument ? documentTypes : [.data], allowsMultipleSelection: isDocument ? allowsMultipleDocuments : true) { result in
            switch result {
            case .success(let urls): files = nativeBackendFiles(from: urls)
            case .failure(let caughtError): error = caughtError.localizedDescription
            }
        }
        .fileExporter(isPresented: $showExporter, document: NativeBackendExportDocument(data: outputData ?? Data()), contentType: outputContentType, defaultFilename: outputFileName) { result in
            if case .failure(let caughtError) = result { error = caughtError.localizedDescription }
        }
        .fileExporter(isPresented: $showTextExporter, document: NativePlainTextDocument(text: output), contentType: .plainText, defaultFilename: "env-\(tool.id).txt") { result in
            if case .failure(let caughtError) = result { error = caughtError.localizedDescription }
        }
    }

    private func operationLabel(_ value: String) -> String { value.replacingOccurrences(of: "-", with: " ").capitalized }
    private func reset() { files = []; output = ""; outputData = nil; error = nil }
    private func run() async {
        if isDocument && files.isEmpty { error = "Choose the document or file required by this tool."; return }
        working = true; defer { working = false }; output = ""; outputData = nil; error = nil
        do {
            let requestOptions: String
            if isDocument {
                let data = try JSONSerialization.data(withJSONObject: ["pages": pages, "text": watermarkText])
                requestOptions = String(decoding: data, as: UTF8.self)
            } else { requestOptions = tool.engine.type == "custom" ? "{}" : options }
            let result = try await NativeBackendEngine.execute(tool, input: input, options: requestOptions, files: files)
            if isDocument {
                outputData = result.data
                outputFileName = result.fileName ?? "\(operation)-output"
                outputMimeType = result.mimeType ?? "application/octet-stream"
                output = "\(operationLabel(operation)) completed · \(String(format: "%.1f", Double(result.data?.count ?? 0) / 1024.0)) KB"
            } else if let text = result.text { output = text }
            else { output = "Output ready: \(result.fileName ?? tool.id) · \(result.data?.count ?? 0) bytes" }
            error = nil
        } catch let caughtError { output = ""; outputData = nil; error = caughtError.localizedDescription }
    }
}

private func nativeBackendFiles(from urls: [URL]) -> [NativeBackendFile] {
    urls.compactMap { url in
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
        let mime = (try? url.resourceValues(forKeys: [.contentTypeKey]))?.contentType?.preferredMIMEType
        return try? NativeBackendFile(name: url.lastPathComponent, mimeType: mime ?? "application/octet-stream", data: Data(contentsOf: url))
    }
}

enum NativeProductivityMode: String { case stopwatch, focus, pomodoro }
enum NativeProductivityPhase: String { case focus, pause = "break" }

struct NativeProductivityTimerState: Equatable {
    var mode: NativeProductivityMode
    var running = false
    var hasStarted = false
    /// Accumulated stopwatch time, or remaining time in the current countdown phase.
    var valueMs: Int64
    var anchorMs: Int64? = nil
    var phase: NativeProductivityPhase = .focus
    var round = 1
    var focusMinutes = 50
    var breakMinutes = 10
    var lapsMs: [Int64] = []
}

enum NativeProductivityEngine {
    static let supportedToolIDs: Set<String> = ["focus-timer", "pomodoro-timer", "stopwatch"]
    static func supports(_ toolID: String) -> Bool { supportedToolIDs.contains(toolID) }
    static func mode(for toolID: String) -> NativeProductivityMode? {
        switch toolID {
        case "stopwatch": return .stopwatch
        case "pomodoro-timer": return .pomodoro
        case "focus-timer": return .focus
        default: return nil
        }
    }

    static func create(mode: NativeProductivityMode, focusMinutes: Int = 50, breakMinutes: Int = 10) -> NativeProductivityTimerState {
        let focus = min(240, max(1, focusMinutes))
        let pause = min(240, max(1, breakMinutes))
        return NativeProductivityTimerState(mode: mode, valueMs: mode == .stopwatch ? 0 : duration(mode, .focus, focus, pause), focusMinutes: focus, breakMinutes: pause)
    }
    static func create(toolID: String) -> NativeProductivityTimerState {
        create(mode: mode(for: toolID) ?? .focus)
    }
    private static func duration(_ mode: NativeProductivityMode, _ phase: NativeProductivityPhase, _ focus: Int, _ pause: Int) -> Int64 {
        let minutes: Int
        if mode == .pomodoro { minutes = phase == .focus ? 25 : 5 }
        else { minutes = phase == .focus ? focus : pause }
        return Int64(minutes) * 60_000
    }
    private static func duration(_ state: NativeProductivityTimerState, _ phase: NativeProductivityPhase? = nil) -> Int64 {
        duration(state.mode, phase ?? state.phase, state.focusMinutes, state.breakMinutes)
    }

    static func advance(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        guard state.running, let anchor = state.anchorMs else { return state }
        let delta = max(0, nowMs - anchor)
        if state.mode == .stopwatch {
            var next = state
            next.valueMs += delta
            next.anchorMs = nowMs
            return next
        }
        var next = state
        next.valueMs -= delta
        while next.valueMs <= 0 {
            next.phase = next.phase == .focus ? .pause : .focus
            if next.phase == .focus && next.mode == .pomodoro { next.round += 1 }
            next.valueMs += duration(next, next.phase)
        }
        next.anchorMs = nowMs
        return next
    }
    static func start(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        guard !state.running else { return advance(state, nowMs: nowMs) }
        var next = state
        next.running = true
        next.hasStarted = true
        next.anchorMs = nowMs
        return next
    }
    static func pause(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        var next = advance(state, nowMs: nowMs)
        guard next.running else { return next }
        next.running = false
        next.anchorMs = nil
        return next
    }
    static func toggle(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        state.running ? pause(state, nowMs: nowMs) : start(state, nowMs: nowMs)
    }
    static func skip(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        guard state.mode != .stopwatch else { return state }
        var next = advance(state, nowMs: nowMs)
        next.phase = next.phase == .focus ? .pause : .focus
        if next.phase == .focus && next.mode == .pomodoro { next.round += 1 }
        next.hasStarted = true
        next.valueMs = duration(next, next.phase)
        next.anchorMs = next.running ? nowMs : nil
        return next
    }
    static func reset(_ state: NativeProductivityTimerState) -> NativeProductivityTimerState {
        var next = state
        next.running = false
        next.hasStarted = false
        next.valueMs = state.mode == .stopwatch ? 0 : duration(state, .focus)
        next.anchorMs = nil
        next.phase = .focus
        next.round = 1
        next.lapsMs = []
        return next
    }
    static func setFocusDurations(_ state: NativeProductivityTimerState, focusMinutes: Int, breakMinutes: Int) -> NativeProductivityTimerState {
        guard state.mode == .focus else { return state }
        let elapsed = max(0, duration(state) - state.valueMs)
        var next = state
        next.focusMinutes = min(240, max(1, focusMinutes))
        next.breakMinutes = min(240, max(1, breakMinutes))
        if !state.running { next.valueMs = max(0, duration(next) - elapsed) }
        return next
    }
    static func lap(_ state: NativeProductivityTimerState, nowMs: Int64) -> NativeProductivityTimerState {
        guard state.mode == .stopwatch, state.running else { return state }
        var next = advance(state, nowMs: nowMs)
        next.lapsMs.append(next.valueMs)
        return next
    }
    static func displayedMs(_ state: NativeProductivityTimerState, nowMs: Int64) -> Int64 {
        guard state.running, let anchor = state.anchorMs else { return state.valueMs }
        let delta = max(0, nowMs - anchor)
        return state.mode == .stopwatch ? state.valueMs + delta : max(0, state.valueMs - delta)
    }
    static func formatStopwatch(_ milliseconds: Int64) -> String {
        let centiseconds = max(0, milliseconds) / 10
        return String(format: "%02lld:%02lld.%02lld", centiseconds / 6_000, centiseconds / 100 % 60, centiseconds % 100)
    }
    static func formatCountdown(_ milliseconds: Int64) -> String {
        let seconds = (max(0, milliseconds) + 999) / 1_000
        return String(format: "%02lld:%02lld", seconds / 60, seconds % 60)
    }
}

private struct NativeProductivityToolView: View {
    let tool: Tool
    @Environment(\.scenePhase) private var scenePhase
    @State private var timerState: NativeProductivityTimerState
    @State private var focusInput: String
    @State private var breakInput: String
    private let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()

    init(tool: Tool) {
        self.tool = tool
        let initial = NativeProductivityEngine.create(toolID: tool.id)
        _timerState = State(initialValue: initial)
        _focusInput = State(initialValue: String(initial.focusMinutes))
        _breakInput = State(initialValue: String(initial.breakMinutes))
    }

    private var nowMs: Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1_000) }
    private var display: String {
        let value = NativeProductivityEngine.displayedMs(timerState, nowMs: nowMs)
        return timerState.mode == .stopwatch ? NativeProductivityEngine.formatStopwatch(value) : NativeProductivityEngine.formatCountdown(value)
    }
    private var cycleTitle: String {
        if timerState.mode == .stopwatch { return "Stopwatch" }
        if timerState.mode == .pomodoro { return "Round \(timerState.round) · \(timerState.phase.rawValue.capitalized)" }
        return timerState.phase.rawValue.capitalized
    }

    var body: some View {
        VStack(spacing: 14) {
            if timerState.mode == .focus {
                HStack(spacing: 10) {
                    TextField("Focus minutes", text: $focusInput).keyboardType(.numberPad).textFieldStyle(.roundedBorder).accessibilityLabel("Focus minutes (1–240)")
                    TextField("Break minutes", text: $breakInput).keyboardType(.numberPad).textFieldStyle(.roundedBorder).accessibilityLabel("Break minutes (1–240)")
                }
                .onChange(of: focusInput) { value in
                    timerState = NativeProductivityEngine.setFocusDurations(timerState, focusMinutes: Int(value) ?? timerState.focusMinutes, breakMinutes: Int(breakInput) ?? timerState.breakMinutes)
                }
                .onChange(of: breakInput) { value in
                    timerState = NativeProductivityEngine.setFocusDurations(timerState, focusMinutes: Int(focusInput) ?? timerState.focusMinutes, breakMinutes: Int(value) ?? timerState.breakMinutes)
                }
            }
            enVCharacterSpacedText(cycleTitle).font(.headline)
            enVCharacterSpacedText(display).font(.envScaled(size: 56, weight: .medium, design: .monospaced)).accessibilityLabel("Time remaining or elapsed: \(display)")
            HStack {
                Button(timerState.running ? "Pause" : timerState.hasStarted ? "Resume" : "Start") {
                    timerState = NativeProductivityEngine.toggle(timerState, nowMs: nowMs)
                }.buttonStyle(.borderedProminent)
                if timerState.mode == .stopwatch {
                    Button("Lap") { timerState = NativeProductivityEngine.lap(timerState, nowMs: nowMs) }
                        .buttonStyle(.bordered).disabled(!timerState.running)
                } else if timerState.mode == .pomodoro {
                    Button("Skip") { timerState = NativeProductivityEngine.skip(timerState, nowMs: nowMs) }.buttonStyle(.bordered)
                }
                Button("Reset") { timerState = NativeProductivityEngine.reset(timerState) }.buttonStyle(.bordered)
            }
            if !timerState.lapsMs.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    enVCharacterSpacedText("Laps").font(.subheadline.weight(.semibold))
                    ForEach(Array(timerState.lapsMs.enumerated()), id: \.offset) { index, value in
                        HStack { enVCharacterSpacedText("Lap \(index + 1)"); Spacer(); enVCharacterSpacedText(NativeProductivityEngine.formatStopwatch(value)).monospacedDigit() }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            enVCharacterSpacedText(timerState.mode == .pomodoro ? "Standard 25-minute focus and 5-minute break cycle. No background alert is promised." : timerState.mode == .focus ? "Use whole-minute focus and break durations from 1 to 240 minutes. No background alert is promised." : "Uses a monotonic clock for elapsed time. Keep enV open to view live updates.")
                .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
        }
        .onReceive(timer) { _ in timerState = NativeProductivityEngine.advance(timerState, nowMs: nowMs) }
        .onChange(of: scenePhase) { phase in
            if phase == .active { timerState = NativeProductivityEngine.advance(timerState, nowMs: nowMs) }
        }
    }
}

private struct NativeUtilityToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var optionsJSON = "{}"
    @State private var output = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Native \(tool.engine.type ?? "utility") engine · op \(tool.engine.op ?? tool.engine.id ?? tool.id)")
                .font(.subheadline.weight(.semibold))
            enVCharacterSpacedText("Uses the catalog engine.op contract. Input is optional; structured parameters are supplied as JSON to preserve the web engine's flexible option model.")
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
            enVCharacterSpacedText(title).font(.footnote.weight(.medium))
            TextEditor(text:$text).font(.system(.body,design:.monospaced)).scrollContentBackground(.hidden)
                .frame(minHeight:170).padding(4)
                .overlay(RoundedRectangle(cornerRadius:10).stroke(Color.envTeal.opacity(0.35)))
                .overlay(alignment:.topLeading) {
                    if text.isEmpty && !placeholder.isEmpty { enVCharacterSpacedText(placeholder).font(.system(.body,design:.monospaced)).foregroundStyle(.secondary).padding(.leading,10).padding(.top,12).allowsHitTesting(false) }
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
                enVCharacterSpacedText("System: \(op.systemID) · mode: \(op.mode)").font(.caption).foregroundStyle(.secondary)
                NativeInputField(title: "Value", text: $value)
                enVCharacterSpacedText("Unit IDs are the same IDs used by the web engine (examples: \(NativeConverterEngine.units(for: op).prefix(5).map(\.id).joined(separator: ", ")) …)").font(.caption).foregroundStyle(.secondary)
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
                if let formula = op.formula, !formula.isEmpty { enVCharacterSpacedText("Formula: \(formula)").font(.subheadline.weight(.semibold)) }
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
                enVCharacterSpacedText("\(op.cLabel) = \(op.aLabel) \(op.family == "product" ? "×" : op.family == "ratio" ? "÷" : "+") \(op.bLabel)").font(.subheadline.weight(.semibold))
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
                enVCharacterSpacedText(op.formula).font(.subheadline.weight(.semibold))
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
                HStack(spacing: 6) { EnVIcon(name: "Copy", size: 14, tint: .envAccent); enVCharacterSpacedText("Copy") }
            }.buttonStyle(.bordered).disabled(output.isEmpty)
        }
    }
}

private struct NativeOutputView: View {
    let output: String
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
            if !output.isEmpty {
                enVCharacterSpacedText("Result").font(.subheadline.weight(.semibold))
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
                enVCharacterSpacedText("Input").font(.subheadline.weight(.semibold))
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
                enVCharacterSpacedText("Palette swatches · tap to apply").font(.subheadline).foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 8) {
                    ForEach(palette, id: \.self) { swatch in
                        Button { input = swatch; run() } label: {
                            HStack(spacing: 8) {
                                Circle().fill(color(for: swatch)).frame(width: 20, height: 20)
                                enVCharacterSpacedText(swatch).font(.system(.footnote, design: .monospaced))
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
            enVCharacterSpacedText(label).foregroundStyle(.secondary)
            enVCharacterSpacedText(value).font(.system(.body, design: .monospaced))
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
            enVCharacterSpacedText("Optional signature inspection").font(.subheadline.weight(.semibold))
            Button { showingFileImporter = true } label: {
                HStack(spacing: 8) { EnVIcon(name: "FilePlus2", size: 16, tint: .envAccent); enVCharacterSpacedText(fileName.isEmpty ? "Choose a local file" : "Choose another file") }
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
            if isDiff { enVCharacterSpacedText("Original text").font(.subheadline.weight(.semibold)); editor($input); enVCharacterSpacedText("New text").font(.subheadline.weight(.semibold)); editor($compare) }
            else { enVCharacterSpacedText("Input").font(.subheadline.weight(.semibold)); editor($input) }
            ForEach(optionNames, id: \.self) { name in TextField(label(name), text: Binding(get: { options[name, default: defaultValue(name)] }, set: { options[name] = $0 })).textFieldStyle(.roundedBorder) }
            if isCounter { let s = NativeTextEngine.statistics(input, wpm: options["wpm"] ?? "200"); LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], alignment: .leading) { stat("Words", s.words); stat("Characters", s.characters); stat("No spaces", s.charactersWithoutSpaces); stat("Sentences", s.sentences); stat("Paragraphs", s.paragraphs); stat("Reading", "\(s.readingMinutes) min") } }
            if tool.id == "word-counter" || tool.id == "character-counter" { let s = NativeTextEngine.statistics(input); let metric = tool.id == "word-counter" ? s.words : s.characters; let limit = max(1, Int(options["limit"] ?? "1") ?? 1); enVCharacterSpacedText(metric <= limit ? "\(limit - metric) remaining" : "\(metric - limit) over").font(.subheadline).foregroundStyle(.secondary) }
            HStack {
                Button(action: run) { HStack(spacing: 6) { EnVIcon(name: "Play", size: 14, tint: .white); enVCharacterSpacedText("Run") } }.buttonStyle(.borderedProminent)
                Button(action: reset) { HStack(spacing: 6) { EnVIcon(name: "RotateCcw", size: 14, tint: .envMuted); enVCharacterSpacedText("Reset") } }.buttonStyle(.bordered)
                Button { UIPasteboard.general.string = output } label: { HStack(spacing: 6) { EnVIcon(name: "Copy", size: 14, tint: .envAccent); enVCharacterSpacedText("Copy output") } }.disabled(output.isEmpty)
            }
            if let error { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
            if let diffSummary { enVCharacterSpacedText(diffSummary).font(.subheadline.weight(.semibold)).foregroundStyle(Color.envTeal) }
            if !output.isEmpty { TextEditor(text: .constant(output)).font(.system(.body, design: .monospaced)).frame(minHeight: 150).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.35))) }
        }
        .onChange(of: input) { _ in if isCounter { run() } }
        .onChange(of: compare) { _ in if isDiff { run() } }
        .onAppear { for name in optionNames where options[name] == nil { options[name] = defaultValue(name) } }
    }
    private func editor(_ text: Binding<String>) -> some View { TextEditor(text: text).frame(minHeight: 150).overlay(RoundedRectangle(cornerRadius: 10).stroke(.secondary.opacity(0.25))) }
    @ViewBuilder private func stat(_ name: String, _ value: some CustomStringConvertible) -> some View { VStack(alignment: .leading) { enVCharacterSpacedText(name).font(.caption).foregroundStyle(.secondary); enVCharacterSpacedText(value.description).font(.headline) }.padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8)) }
    private func label(_ name: String) -> String { ["find":"Find", "replace":"Replace", "flags":"Regex flags", "width":"Width", "style":"Style (bullets, numbered, comma)", "keyword":"Keyword (optional)", "wpm":"Reading speed (words/min)", "limit":"Target limit"][name] ?? name.capitalized }
    private func defaultValue(_ name: String) -> String { name == "flags" ? "g" : name == "width" ? "80" : name == "wpm" ? "200" : name == "limit" ? "280" : name == "style" ? "bullets" : "" }
    private func run() { do { let r = try NativeTextEngine.run(toolID: tool.id, input: input, compare: compare, options: options); output = r.output; diffSummary = isDiff ? "Added: \(r.added) · Removed: \(r.removed) · Unchanged: \(r.unchanged)" : nil; error = nil } catch let caughtError { output = ""; diffSummary = nil; error = caughtError.localizedDescription } }
    private func reset() { input = ""; compare = ""; output = ""; options = [:]; error = nil; diffSummary = nil }
}

struct NativeAccessibilityToolView: View {
    let tool: Tool
    @State private var input = ""
    @State private var foreground = "#000000"
    @State private var background = "#ffffff"
    @State private var fontSize = "16px"
    @State private var lineHeight = "1.5"
    @State private var output = ""
    private var kind: String { NativeAccessibilityEngine.kind(tool.id) }
    private var colorTool: Bool { ["contrast", "accessible-color", "color-blindness"].contains(kind) }
    private var sizeTool: Bool { ["font-size", "line-height"].contains(kind) }
    private var textTool: Bool { kind == "text-readability" }
    private var codeTool: Bool { !colorTool && !sizeTool && !textTool }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("On-device accessibility review · no snippet is uploaded.")
                .font(.envScaled(size: 13, weight: .regular)).foregroundStyle(Color.envMuted)
            if colorTool {
                NativeInputField(title: "Foreground color", text: $foreground)
                NativeInputField(title: "Background color", text: $background)
            }
            if sizeTool {
                NativeInputField(title: "Font size (CSS px/rem)", text: $fontSize)
                if kind == "line-height" { NativeInputField(title: "Line height", text: $lineHeight) }
            }
            if codeTool || textTool {
                enVCharacterSpacedText(textTool ? "English text" : "HTML / CSS snippet")
                    .font(.envScaled(size: 13, weight: .semibold))
                TextEditor(text: $input)
                    .font(.system(size: 14, design: codeTool ? .monospaced : .default))
                    .frame(minHeight: 160)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                    .accessibilityLabel(textTool ? "English text for readability analysis" : "HTML or CSS snippet to analyze")
            }
            HStack(spacing: 8) {
                Button { output = NativeAccessibilityEngine.analyze(toolID: tool.id, input: input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight) } label: {
                    HStack(spacing: 6) { EnVIcon(name: "Play", size: 14, tint: .white); enVCharacterSpacedText("Analyze locally") }
                }.buttonStyle(.borderedProminent)
                Button { input = ""; foreground = "#000000"; background = "#ffffff"; fontSize = "16px"; lineHeight = "1.5"; output = "" } label: {
                    HStack(spacing: 6) { EnVIcon(name: "RotateCcw", size: 14, tint: .envMuted); enVCharacterSpacedText("Reset") }
                }.buttonStyle(.bordered)
                Button { UIPasteboard.general.string = output } label: {
                    HStack(spacing: 6) { EnVIcon(name: "Copy", size: 14, tint: .envAccent); enVCharacterSpacedText("Copy report") }
                }.disabled(output.isEmpty)
                if !output.isEmpty { ShareLink(item: output) { enVCharacterSpacedText("Export") } }
            }
            if !output.isEmpty {
                TextEditor(text: .constant(output)).font(.system(size: 12, design: .monospaced)).frame(minHeight: 190)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.35)))
                    .accessibilityLabel("Accessibility analysis report")
            }
            enVCharacterSpacedText("Static snippet checks only. Manually test keyboard order, browser zoom, screen readers, and the complete page; results do not certify WCAG conformance.")
                .font(.envScaled(size: 11, weight: .regular)).foregroundStyle(Color.envMuted)
        }
    }
}

struct NativeBackendFile { let name:String; let mimeType:String; let data:Data }
private struct NativeBackendResult { let text:String?; let data:Data?; let mimeType:String?; let fileName:String? }

enum NativeBackendEngine {
    static var baseURL: URL? {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "ENV_API_BASE_URL") as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return raw.isEmpty ? nil : URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
    static func endpointURL(_ path: String) -> URL? {
        guard let baseURL, var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return nil }
        let prefix = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let route = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + ([prefix, route].filter { !$0.isEmpty }.joined(separator: "/"))
        return components.url
    }
    static let backendIDs:Set<String> = ["youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader"]
    // Must match server/routes/api/backend/tool.post.ts CUSTOM_CATEGORIES exactly.
    // Unsupported tools must not appear executable in the native app.
    static let categoryBackend:Set<String> = ["personal","marketing","communication","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators"]
    static func supports(_ tool:Tool)->Bool {
        if NativeAccessibilityEngine.supports(tool) { return false }
        if NativeImageEngine.supports(tool) { return false }
        if tool.engine.type=="developer" && NativeUtilityEngine.supports(tool) { return false }
        if tool.engine.type=="mime" && NativeMimeEngine.operation(forToolID:tool.id) != nil { return false }
        if tool.engine.type=="datetime" && NativeDateTimeEngine.operation(forToolID: tool.id) != nil { return false }
        if NativeBarcodeEngine.supports(tool) { return false }
        if NativeFileConverterEngine.supports(tool) { return false }
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
        if tool.engine.type=="document-backend" {
            let operation = tool.engine.op ?? tool.id
            return try await multipart("/api/backend/documents",fields:["operation":operation,"params":options,"outputName":"\(operation)-output"],files:files,downloadResponse:true,documentResponse:true)
        }
        return try await multipart("/api/backend/media",fields:["operation":tool.engine.op ?? tool.engine.id ?? tool.id,"params":options],files:files)
    }
    static func urlMediaRequestBody(input: String, options: [String: Any]) -> [String: Any] {
        var body = options
        body["url"] = input
        return body
    }
    static func backendErrorMessage(_ data: Data, statusCode: Int, documentResponse: Bool = false) -> String {
        if let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            for key in ["error", "message"] {
                if let message = payload[key] as? String {
                    let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty && !trimmed.hasPrefix("<") { return String(trimmed.prefix(1200)) }
                }
            }
        } else if let raw = String(data: data, encoding: .utf8) {
            let plain = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !plain.isEmpty && !plain.hasPrefix("<") && plain.count <= 1200 && !["true", "false", "null"].contains(plain.lowercased()) { return plain }
        }
        return documentResponse ? "Document service returned HTTP \(statusCode)." : "Backend request failed (\(statusCode))."
    }
    private static func json(_ path:String,body:[String:Any]) async throws -> NativeBackendResult {
        guard let endpoint = endpointURL(path) else { throw NativeNativeError.message("AI/backend API is not configured for this build.") }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try parse(data, response)
    }
    private static func multipart(_ path:String,fields:[String:String],files:[NativeBackendFile],downloadResponse:Bool=false,documentResponse:Bool=false) async throws -> NativeBackendResult {
        guard let endpoint = endpointURL(path) else { throw NativeNativeError.message("AI/backend API is not configured for this build.") }
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
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        return try parse(data, response, downloadResponse: downloadResponse, documentResponse: documentResponse)
    }
    private static func parse(_ d:Data,_ res:URLResponse,downloadResponse:Bool=false,documentResponse:Bool=false)throws->NativeBackendResult{
        guard let h=res as? HTTPURLResponse else{throw NativeNativeError.message("Invalid backend response.")}
        if !(200...299).contains(h.statusCode) {
            throw NativeNativeError.message(backendErrorMessage(d, statusCode: h.statusCode, documentResponse: documentResponse))
        }
        let mime=h.mimeType ?? "application/octet-stream"
        let disposition=h.value(forHTTPHeaderField:"Content-Disposition")
        let quote = Character(UnicodeScalar(34)!)
        let filename: String?
        if let disposition, let range = disposition.range(of:"filename=") {
            let remainder = disposition[range.upperBound...]
            let value: Substring = remainder.first == quote ? remainder.dropFirst() : remainder
            filename = String(value.prefix(while: { $0 != quote }))
        } else { filename = nil }
        if !downloadResponse && mime.contains("json") { return NativeBackendResult(text:String(data:d,encoding:.utf8),data:nil,mimeType:mime,fileName:nil) }
        return NativeBackendResult(text:nil,data:d,mimeType:mime,fileName:filename)
    }
}

enum NativeImageEngine {
    private static let operations: Set<String> = ["resize", "compress", "grayscale", "invert", "blur", "sharpen", "crop", "watermark", "rotate", "flip"]
    private static let aliases: [String:String] = ["image-resizer":"resize", "image-compressor":"compress", "image-grayscale":"grayscale", "image-invert":"invert", "image-blur":"blur", "image-sharpen":"sharpen", "image-cropper":"crop", "image-watermark":"watermark", "image-rotator":"rotate", "image-flipper":"flip"]
    static func operation(for tool: Tool) -> String? { guard tool.engine.type == "image" else { return nil }; let op = tool.engine.op ?? tool.engine.id ?? tool.id; return aliases[tool.id] ?? (operations.contains(op) ? op : nil) }
    static func supports(_ tool: Tool) -> Bool { operation(for: tool) != nil }
    static func run(tool: Tool, data: Data, width: Int, height: Int?, quality: CGFloat, text: String, degrees: CGFloat) throws -> (data: Data, width: Int, height: Int, ext: String) {
        guard let op = operation(for: tool), let source = UIImage(data: data), let cg = source.cgImage else { throw NativeNativeError.message("Choose a supported PNG, JPEG, or WebP image.") }
        let size = CGSize(width: cg.width, height: cg.height)
        var image = source
        switch op {
        case "resize":
            guard width > 0 || (height ?? 0) > 0 else { throw NativeNativeError.message("Enter a target width or height.") }
            let scale = width > 0 && (height ?? 0) > 0 ? min(CGFloat(width) / size.width, CGFloat(height!) / size.height) : width > 0 ? CGFloat(width) / size.width : CGFloat(height!) / size.height
            image = render(source, size: CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale)))
        case "grayscale", "invert", "blur", "sharpen":
            let names = ["grayscale":"CIColorControls", "invert":"CIColorInvert", "blur":"CIGaussianBlur", "sharpen":"CISharpenLuminance"]
            guard let filter = CIFilter(name: names[op]!), let ci = CIImage(image: source) else { throw NativeNativeError.message("Could not process this image.") }
            filter.setValue(ci, forKey: kCIInputImageKey); if op == "grayscale" { filter.setValue(0, forKey: kCIInputSaturationKey) }; if op == "blur" { filter.setValue(4.0, forKey: kCIInputRadiusKey) }; if op == "sharpen" { filter.setValue(0.7, forKey: kCIInputSharpnessKey) }
            guard let filtered = filter.outputImage, let rendered = CIContext().createCGImage(filtered, from: filtered.extent) else { throw NativeNativeError.message("Could not render the filter output.") }; image = UIImage(cgImage: rendered)
        case "crop":
            let w = min(CGFloat(width > 0 ? width : Int(size.width)), size.width), h = min(CGFloat(height ?? Int(size.height)), size.height); image = render(source, crop: CGRect(x: (size.width-w)/2, y: (size.height-h)/2, width: w, height: h))
        case "watermark": image = watermark(source, text: text)
        case "rotate": image = render(source, angle: degrees * .pi / 180)
        case "flip": image = render(source, flipHorizontal: true)
        default: break
        }
        let out = (op == "compress" ? image.jpegData(compressionQuality: quality) : image.jpegData(compressionQuality: quality)) ?? image.pngData() ?? Data()
        return (out, Int(image.size.width), Int(image.size.height), "jpg")
    }
    private static func render(_ image: UIImage, size: CGSize) -> UIImage { UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) } }
    private static func render(_ image: UIImage, crop: CGRect) -> UIImage { guard let cg = image.cgImage?.cropping(to: crop) else { return image }; return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation) }
    private static func render(_ image: UIImage, angle: CGFloat) -> UIImage { let box = CGRect(origin: .zero, size: image.size).applying(CGAffineTransform(rotationAngle: angle)); return UIGraphicsImageRenderer(size: CGSize(width: abs(box.width), height: abs(box.height))).image { c in c.cgContext.translateBy(x: abs(box.width)/2, y: abs(box.height)/2); c.cgContext.rotate(by: angle); image.draw(in: CGRect(x: -image.size.width/2, y: -image.size.height/2, width: image.size.width, height: image.size.height)) } }
    private static func render(_ image: UIImage, flipHorizontal: Bool) -> UIImage { UIGraphicsImageRenderer(size: image.size).image { c in c.cgContext.translateBy(x: image.size.width, y: 0); c.cgContext.scaleBy(x: -1, y: 1); image.draw(in: CGRect(origin: .zero, size: image.size)) } }
    private static func watermark(_ image: UIImage, text: String) -> UIImage { UIGraphicsImageRenderer(size: image.size).image { _ in image.draw(at: .zero); let attrs: [NSAttributedString.Key:Any] = [.font:UIFont.boldSystemFont(ofSize:max(18,image.size.width/18)), .foregroundColor:UIColor.white, .shadow:NSShadow()]; (text.isEmpty ? "enV" : text).draw(at: CGPoint(x:24,y:image.size.height-max(48,image.size.height/10)), withAttributes: attrs) } }
}

private struct NativeImageToolView: View {
    let tool: Tool
    @State private var file: NativeBackendFile?
    @State private var outputData: Data?
    @State private var output = ""
    @State private var error: String?
    @State private var importing = false
    @State private var exporting = false
    @State private var width = "1200"
    @State private var height = ""
    @State private var quality = "88"
    @State private var text = "enV"
    @State private var degrees = "90"
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(file?.name ?? "Choose image") { importing = true }.buttonStyle(.bordered)
            if let op = NativeImageEngine.operation(for: tool) {
                if op == "resize" { NativeInputField(title:"Width", text:$width); NativeInputField(title:"Height (optional)", text:$height) }
                if op == "compress" { NativeInputField(title:"JPEG quality (1–100)", text:$quality) }
                if op == "watermark" { NativeInputField(title:"Watermark text", text:$text) }
                if op == "rotate" { NativeInputField(title:"Degrees", text:$degrees) }
            }
            HStack { Button("Run locally") { run() }.buttonStyle(.borderedProminent).disabled(file == nil); Button("Reset") { file=nil; outputData=nil; output=""; error=nil }.buttonStyle(.bordered) }
            NativeOutputView(output: output, error: error)
            if outputData != nil { Button("Save output") { exporting = true }.buttonStyle(.bordered) }
        }
        .fileImporter(isPresented:$importing, allowedContentTypes:[.data], allowsMultipleSelection:false) { result in if case .success(let urls)=result, let url=urls.first { file = nativeBackendFiles(from:[url]).first; error=nil } }
        .fileExporter(isPresented:$exporting, document:outputData.map(NativeBinaryDocument.init), contentType:.jpeg, defaultFilename:"env-image.jpg") { result in if case .failure(let e)=result { error=e.localizedDescription } }
    }
    private func run() { guard let file else { return }; do { let result=try NativeImageEngine.run(tool:tool,data:file.data,width:Int(width) ?? 0,height:Int(height),quality:CGFloat(Int(quality) ?? 88)/100,text:text,degrees:CGFloat(Double(degrees) ?? 90)); outputData=result.data; output="Processed locally · \(result.width) × \(result.height) · \(result.data.count/1024) KB"; error=nil } catch let caughtError { output=""; outputData=nil; error=caughtError.localizedDescription } }
}

enum NativeBarcodeEngine {
    private static let validatorIDs: Set<String> = ["ean13-check-digit", "upc-check-digit", "gtin-validator", "isbn-check-digit"]
    private static let qrIDs: Set<String> = ["app-store-qr-generator", "bitcoin-qr-generator", "calendar-qr-generator", "crypto-wallet-qr-generator", "discord-invite-qr-generator", "email-qr-generator", "ethereum-qr-generator", "event-qr-generator", "facebook-link-qr-generator", "google-play-qr-generator", "instagram-link-qr-generator", "linkedin-link-qr-generator", "location-qr-generator", "mecard-qr-generator", "phone-qr-generator", "qr-batch-generator", "qr-capacity-helper", "qr-code-high-error-correction", "qr-code-low-error-correction", "qr-code-styled", "qr-data-url-generator", "qr-generator", "qr-payload-encoder", "qr-payload-inspector", "qr-size-calculator", "qr-svg-generator", "qr-version-helper", "sms-qr-generator", "telegram-link-qr-generator", "text-qr-generator", "url-qr-generator", "vcard-qr-generator", "whatsapp-qr-generator", "wifi-qr-generator", "x-link-qr-generator", "youtube-link-qr-generator"]
    private static let helperIDs: Set<String> = ["qr-capacity-helper", "qr-payload-inspector", "qr-size-calculator", "qr-version-helper"]
    private static let linearIDs: Set<String> = ["barcode-label-generator", "barcode-svg-generator", "codabar-barcode", "code128-barcode", "code39-barcode", "ean13-barcode", "ean8-barcode", "isbn-barcode", "itf14-barcode", "msi-barcode", "pharmacode-barcode", "upc-barcode"]
    static func supports(_ tool: Tool) -> Bool { (validatorIDs.contains(tool.id) || qrIDs.contains(tool.id) || linearIDs.contains(tool.id)) && (tool.engine.type == "barcode" || tool.engine.type == "qr") }
    static let supportedToolIDs = validatorIDs.union(qrIDs).union(linearIDs)
    static func generatesImage(_ toolID: String) -> Bool { (qrIDs.contains(toolID) && !helperIDs.contains(toolID)) || linearIDs.contains(toolID) }
    static func generate(toolID: String, input: String) throws -> UIImage {
        try generateFull(toolID: toolID, input: input, size: 512, dark: "#16181d", light: "#ffffff")
    }
    private static func generateEAN(toolID: String, input: String) throws -> UIImage {
        var digits = input.filter(\.isNumber)
        if toolID == "isbn-barcode" { digits = digits.replacingOccurrences(of: "ISBN", with: "", options: .caseInsensitive).filter(\.isNumber) }
        let expectedLength = toolID == "ean8-barcode" ? 8 : toolID == "upc-barcode" ? 12 : 13
        guard digits.count == expectedLength else { throw NativeNativeError.message("This barcode requires exactly \(expectedLength) digits.") }
        let expected = checkDigit(String(digits.dropLast()), ean: toolID != "upc-barcode")
        guard Int(String(digits.last!)) == expected else { throw NativeNativeError.message("The barcode check digit is invalid.") }
        let patternDigits = toolID == "upc-barcode" ? "0" + digits : digits
        let pattern = try eanPattern(patternDigits, kind: toolID == "ean8-barcode" ? "ean8" : "ean13")
        return renderBars(pattern)
    }
    private static let lCodes = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
    private static let gCodes = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]
    private static let rCodes = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]
    private static let parity = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
    private static func eanPattern(_ digits: String, kind: String) throws -> String {
        let d = Array(digits).compactMap { $0.wholeNumberValue }
        var result = "101"
        if kind == "ean8" { for n in d.prefix(4) { result += lCodes[n] }; result += "01010"; for n in d.suffix(4) { result += rCodes[n] } }
        else { result += parity[d[0]].enumerated().map { $0.element == "L" ? lCodes[d[$0.offset + 1]] : gCodes[d[$0.offset + 1]] }.joined(); result += "01010"; for n in d.suffix(6) { result += rCodes[n] } }
        return result + "101"
    }
    private static func renderBars(_ pattern: String) -> UIImage { let width: CGFloat = 3, height: CGFloat = 180; return UIGraphicsImageRenderer(size: CGSize(width: CGFloat(pattern.count) * width + 32, height: height)).image { c in c.cgContext.setFillColor(UIColor.black.cgColor); for (i, bit) in pattern.enumerated() where bit == "1" { c.cgContext.fill(CGRect(x: 16 + CGFloat(i) * width, y: 10, width: width, height: height - 20)) } } }
    static func run(toolID: String, input: String) throws -> String {
        guard validatorIDs.contains(toolID) else { throw NativeNativeError.message("Unknown barcode validation operation.") }
        let digits = input.filter(\.isNumber)
        if toolID == "gtin-validator" {
            guard [8, 12, 13, 14].contains(digits.count) else { throw NativeNativeError.message("GTIN must contain 8, 12, 13 or 14 digits.") }
            let expected = checkDigit(String(digits.dropLast()))
            let supplied = Int(String(digits.last!))!
            return "\(expected == supplied ? "Valid" : "Invalid"): Expected check digit: \(expected). Supplied: \(supplied)."
        }
        if toolID == "isbn-check-digit" {
            guard digits.count == 13 else { throw NativeNativeError.message("ISBN-13 must contain 13 digits.") }
            let expected = checkDigit(String(digits.dropLast()), ean: true)
            let supplied = Int(String(digits.last!))!
            return "\(expected == supplied ? "Valid" : "Invalid"): Expected check digit: \(expected). Supplied: \(supplied)."
        }
        guard !digits.isEmpty else { throw NativeNativeError.message("Enter numeric digits.") }
        let body = toolID == "upc-check-digit" ? String(digits.prefix(11)) : String(digits.prefix(12))
        guard !body.isEmpty else { throw NativeNativeError.message("Enter numeric digits.") }
        return "Calculated check digit: \(checkDigit(body)). Supplied check digit: \(digits.last!)."
    }
    private static func checkDigit(_ value: String, ean: Bool = false) -> Int { var sum = 0; if ean { for (index, scalar) in value.unicodeScalars.enumerated() { sum += Int(scalar.value - 48) * (index % 2 == 0 ? 1 : 3) } } else { for (index, scalar) in value.unicodeScalars.reversed().enumerated() { sum += Int(scalar.value - 48) * (index % 2 == 0 ? 3 : 1) } }; return (10 - sum % 10) % 10 }
}

enum NativeNativeError:LocalizedError{case message(String);var errorDescription:String?{if case .message(let s)=self{return s};return nil}}

private struct NativeBarcodeToolView: View {
    let tool: Tool
    @State private var values: [String:String]
    @State private var output = ""
    @State private var error: String?
    @State private var images: [UIImage] = []
    @State private var exportText: String?
    @State private var exportData = Data()
    @State private var exportName = "env-code"
    @State private var exportingImage = false
    @State private var exportingText = false

    init(tool:Tool) { self.tool=tool; _values=State(initialValue:NativeBarcodeEngine.initialValues(for:tool.id)) }

    private func binding(_ key:String)->Binding<String> { Binding(get:{values[key] ?? ""},set:{values[key]=$0}) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(NativeBarcodeEngine.fieldsFor(tool.id), id:\.key) { field in
                if field.options.isEmpty {
                    VStack(alignment:.leading,spacing:6) {
                        Text(field.title).font(.footnote.weight(.medium))
                        if field.multiline {
                            TextEditor(text:binding(field.key)).frame(minHeight:90).scrollContentBackground(.hidden).overlay(RoundedRectangle(cornerRadius:8).stroke(Color.secondary.opacity(0.25)))
                        } else {
                            TextField(field.title,text:binding(field.key)).textFieldStyle(.roundedBorder)
                        }
                    }
                } else {
                    Picker(field.title,selection:binding(field.key)) { ForEach(field.options,id:\.self) { option in Text(option).tag(option) } }.pickerStyle(.menu)
                }
            }
            NativeActionRow(output: output, run: {
                do {
                    let result=try NativeBarcodeEngine.execute(toolID:tool.id,values:values)
                    output=result.text; images=result.images; exportText=result.exportText; exportName=result.exportName ?? "env-code"
                    error = nil
                } catch let caughtError { output = ""; images=[]; exportText=nil; error = caughtError.localizedDescription }
            }, reset: { values=NativeBarcodeEngine.initialValues(for:tool.id); output = ""; images=[]; exportText=nil; error = nil })
            NativeOutputView(output: output, error: error)
            ForEach(Array(images.enumerated()),id:\.offset) { index,image in
                Image(uiImage:image).resizable().interpolation(.none).scaledToFit().frame(maxHeight:280).background(Color.white).clipShape(RoundedRectangle(cornerRadius:8))
                Button("Save PNG \(index+1)") { if let data=image.pngData() { exportData=data; exportName="env-code-\(index+1)"; exportingImage=true } }.buttonStyle(.bordered)
            }
            if let exportText {
                Text("Export data").font(.footnote.weight(.medium))
                Text(String(exportText.prefix(512)) + (exportText.count > 512 ? "…" : "")).font(.system(.caption,design:.monospaced)).textSelection(.enabled).lineLimit(6)
                HStack { Button("Copy export") { UIPasteboard.general.string=exportText }.buttonStyle(.bordered); Button("Save export") { exportingText=true }.buttonStyle(.bordered) }
            }
        }
        .fileExporter(isPresented:$exportingImage,document:NativeBinaryDocument(data:exportData),contentType:.data,defaultFilename:exportName) { _ in }
        .fileExporter(isPresented:$exportingText,document:NativePlainTextDocument(text:exportText ?? ""),contentType:.plainText,defaultFilename:exportName) { _ in }
    }
}

private struct NativeUnavailableToolView: View {
    let tool: Tool
    let backend: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            enVCharacterSpacedText(backend ? "Native Swift · enV backend API" : "Not implemented natively")
                .font(.subheadline.weight(.semibold))
            enVCharacterSpacedText(backend ? "This operation is executed by the configured enV backend." : "This catalog entry is not advertised as a native capability until a real implementation is connected.")
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Native AI infrastructure client and UI

enum NativeAiEngine {
    static let captionTools: Set<String> = ["instagram-caption-generator", "tiktok-caption-generator", "x-caption-generator", "youtube-caption-generator", "linkedin-caption-generator", "facebook-caption-generator", "caption-generator"]
    static let promptTools: Set<String> = ["prompt-generator"]
    static let bioTools: Set<String> = ["bio-generator"]
    static let productTools: Set<String> = ["product-description-generator"]
    static let ideaTools: Set<String> = ["idea-generator"]
    static let resumeTools: Set<String> = ["resume-bullet-generator"]
    static let rewriteTools: Set<String> = ["rewrite-helper"]
    static let emailTools: Set<String> = ["email-generator"]
    static let metaTools: Set<String> = ["meta-description-generator"]
    static let hookTools: Set<String> = ["social-hook-generator"]
    static let improverTools: Set<String> = ["prompt-improver"]
    static let contentBriefTools: Set<String> = ["content-brief-generator"]
    static let adCopyTools: Set<String> = ["ad-copy-generator"]
    static let titleTools: Set<String> = ["youtube-title-generator", "tiktok-title-generator", "instagram-title-generator", "podcast-title-generator", "title-generator"]
    static let exactTasks: [String:String] = ["regex-tester":"developer.regex.explain", "sql-formatter":"developer.sql.explain", "json-validator":"developer.json.explain", "alt-text-generator":"image.alt.generate", "video-audio-extractor":"video.transcript.generate"]

    static func supports(_ toolID: String) -> Bool { captionTools.contains(toolID) || promptTools.contains(toolID) || bioTools.contains(toolID) || productTools.contains(toolID) || ideaTools.contains(toolID) || resumeTools.contains(toolID) || rewriteTools.contains(toolID) || emailTools.contains(toolID) || metaTools.contains(toolID) || hookTools.contains(toolID) || improverTools.contains(toolID) || contentBriefTools.contains(toolID) || adCopyTools.contains(toolID) || titleTools.contains(toolID) || exactTasks[toolID] != nil || NativeAiMicroEngine.supports(toolID) }
    static func isLocalCaption(_ toolID: String) -> Bool { captionTools.contains(toolID) }
    static func isLocalPrompt(_ toolID: String) -> Bool { promptTools.contains(toolID) }
    static func isLocalBio(_ toolID: String) -> Bool { bioTools.contains(toolID) }
    static func isLocalTitle(_ toolID: String) -> Bool { toolID == "title-generator" }
    static func isLocalProduct(_ toolID: String) -> Bool { productTools.contains(toolID) }
    static func isLocalIdea(_ toolID: String) -> Bool { ideaTools.contains(toolID) }
    static func isLocalResume(_ toolID: String) -> Bool { resumeTools.contains(toolID) }
    static func isLocalRewrite(_ toolID: String) -> Bool { rewriteTools.contains(toolID) }
    static func isLocalEmail(_ toolID: String) -> Bool { emailTools.contains(toolID) }
    static func isLocalMeta(_ toolID: String) -> Bool { metaTools.contains(toolID) }
    static func isLocalHook(_ toolID: String) -> Bool { hookTools.contains(toolID) }
    static func isLocalImprover(_ toolID: String) -> Bool { improverTools.contains(toolID) }
    static func isLocalContentBrief(_ toolID: String) -> Bool { contentBriefTools.contains(toolID) }
    static func isLocalAdCopy(_ toolID: String) -> Bool { adCopyTools.contains(toolID) }
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
    static func localTitle(topic rawTopic: String, audience rawAudience: String, count rawCount: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let count = min(8, max(1, Int(rawCount) ?? 8))
        let lines = ["\(topic): What \(audience) Should Know", "How to Get Better Results With \(topic)", "The Simple Guide to \(topic)", "I Tried \(topic) — Here’s What I Learned", "\(topic) Explained Without the Jargon", "5 Things \(audience) Should Know About \(topic)", "Before You Start With \(topic), Read This", "A Practical \(topic) Guide for \(audience)"]
        return lines.prefix(count).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localProduct(product rawProduct: String, features rawFeatures: String, audience rawAudience: String, tone rawTone: String) -> String {
        let product = rawProduct.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Your product" : rawProduct.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let tone = ["professional": "clear and professional", "bold": "confident and direct", "playful": "light and playful", "friendly": "warm and friendly"][rawTone] ?? "natural and conversational"
        let bullets = rawFeatures.split(whereSeparator: \.isNewline).map { "• \($0.trimmingCharacters(in: .whitespacesAndNewlines))" }.joined(separator: "\n")
        return "\(product)\n\nA practical option for \(audience) who want a simple way to get started.\n\nKey benefits:\n\(bullets)\n\nPositioning style: \(tone).\n\nCTA: Get started and see what \(product) can help you create."
    }
    static func localIdea(topic rawTopic: String, audience rawAudience: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = ["How-to: \(topic) for \(audience)", "Common mistake: \(topic)", "Case study: a real example of \(topic)", "Checklist: getting started with \(topic)", "Myth vs fact: \(topic)", "Quick tips: \(topic)", "Beginner guide: \(topic)", "Behind the scenes: working on \(topic)"]
        return lines.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localResume(duty rawDuty: String, result rawResult: String) -> String {
        let duty = rawDuty.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "managed responsibilities" : rawDuty.trimmingCharacters(in: .whitespacesAndNewlines)
        let result = rawResult.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "measurable progress" : rawResult.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = ["\(duty), contributing to \(result).", "Led \(duty) and delivered measurable progress toward \(result).", "Executed \(duty), helping the team achieve \(result).", "Owned \(duty) with a focus on \(result)."]
        return lines.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localRewrite(text rawText: String, tone rawTone: String) -> String {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Enter text to rewrite." : rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        let tone = ["professional": "clear and professional", "bold": "confident and direct", "playful": "light and playful", "friendly": "warm and friendly"][rawTone] ?? "natural and conversational"
        return "Rewritten in a \(tone) tone:\n\n\(text)\n\nEdit for clarity, natural flow, and consistent tone before publishing."
    }
    static func localEmail(purpose rawPurpose: String, points rawPoints: String) -> String {
        let purpose = rawPurpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your update" : rawPurpose.trimmingCharacters(in: .whitespacesAndNewlines)
        let points = rawPoints.split(whereSeparator: \.isNewline).map { "• \($0.trimmingCharacters(in: .whitespacesAndNewlines))" }.joined(separator: "\n")
        return "Subject: \(purpose)\n\nHi,\n\nI wanted to reach out about \(purpose).\n\n\(points)\n\nIf this is relevant to you, take a look and let me know what you think.\n\nBest,"
    }
    static func localMeta(topic rawTopic: String, page rawPage: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let page = rawPage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Explain the product, key benefits, and how visitors can get started." : rawPage.trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(topic) — \(page) Start here for a concise overview and useful guidance."
    }
    static func localHook(topic rawTopic: String, audience rawAudience: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = ["Most people overcomplicate \(topic).", "Before you try \(topic), know this.", "Here's what I wish I knew about \(topic).", "If you're a \(audience), save this.", "The simple way to approach \(topic)."]
        return lines.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localContentBrief(topic rawTopic: String, audience rawAudience: String, goal rawGoal: String, tone rawTone: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let goal = rawGoal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Educate and help the reader act" : rawGoal.trimmingCharacters(in: .whitespacesAndNewlines)
        let tone = ["professional": "clear and professional", "bold": "confident and direct", "playful": "light and playful", "friendly": "warm and friendly"][rawTone] ?? "natural and conversational"
        return "Content brief\nTopic: \(topic)\nAudience: \(audience)\nGoal: \(goal)\nTone: \(tone)\n\nCore question: What does the reader need to know or do?\nPrimary sections: problem → context → solution → examples → next step\nCTA: Give the reader one clear action to take."
    }
    static func localAdCopy(topic rawTopic: String, audience rawAudience: String, benefit rawBenefit: String) -> String {
        let topic = rawTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your topic" : rawTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let benefit = rawBenefit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "a useful result" : rawBenefit.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = ["Stop overcomplicating \(topic). Get \(benefit) with a simple approach.", "\(topic) for \(audience): practical, clear, and built around \(benefit).", "Ready to make \(topic) easier? Start with \(benefit) and take the next step today."]
        return lines.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n")
    }
    static func localImprover(task rawTask: String, audience rawAudience: String, tone rawTone: String) -> String {
        let task = rawTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your request" : rawTask.trimmingCharacters(in: .whitespacesAndNewlines)
        let audience = rawAudience.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "your audience" : rawAudience.trimmingCharacters(in: .whitespacesAndNewlines)
        let tone = ["professional": "clear and professional", "bold": "confident and direct", "playful": "light and playful", "friendly": "warm and friendly"][rawTone] ?? "natural and conversational"
        return "Improved prompt:\n\nRewrite the following request into a precise, \(tone) instruction for an AI assistant serving \(audience). Preserve the original intent, add useful context placeholders where information is missing, specify the desired output format, and avoid inventing facts.\n\nOriginal request:\n\(task)\n\nSuggested output format:\n1. Goal\n2. Context\n3. Constraints\n4. Tone\n5. Deliverable\n6. Quality checks"
    }
    static func task(for toolID: String) -> String? { captionTools.contains(toolID) ? "creator.caption.generate" : promptTools.contains(toolID) ? "local.prompt" : bioTools.contains(toolID) ? "local.bio" : productTools.contains(toolID) ? "local.product" : ideaTools.contains(toolID) ? "local.idea" : resumeTools.contains(toolID) ? "local.resume" : rewriteTools.contains(toolID) ? "local.rewrite" : emailTools.contains(toolID) ? "local.email" : metaTools.contains(toolID) ? "local.meta" : hookTools.contains(toolID) ? "local.hook" : improverTools.contains(toolID) ? "local.improver" : contentBriefTools.contains(toolID) ? "local.contentBrief" : adCopyTools.contains(toolID) ? "local.adCopy" : titleTools.contains(toolID) ? "creator.title.generate" : exactTasks[toolID] }
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
        case "creator.caption.generate": return ["topic": (values["topic"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", "tone": values["tone"] ?? "friendly", "language": values["language"] ?? "en", "variants": values["variants"] ?? 3, "includeHashtags": values["includeHashtags"] ?? true, "platform": platform(for: toolID)]
        case "creator.title.generate": return ["topic": (values["topic"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", "tone": values["tone"] ?? "friendly", "language": values["language"] ?? "en", "variants": values["variants"] ?? 5, "platform": platform(for: toolID)]
        case "developer.regex.explain":
            var input: [String:Any] = ["pattern": values["pattern"] ?? ""]
            if let flags = values["flags"] as? String, !flags.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["flags"] = flags.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let sample = values["sampleText"] as? String, !sample.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["sampleText"] = sample }
            return input
        case "developer.sql.explain": return ["sql": (values["sql"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", "dialect": values["dialect"] ?? "generic"]
        case "developer.json.explain": return ["json": (values["json"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "", "goal": values["goal"] ?? "describe"]
        case "image.alt.generate":
            guard let file else { return values }
            var input: [String:Any] = ["imageBase64": file.data.base64EncodedString(), "mimeType": file.mimeType, "style": values["style"] ?? "concise", "language": values["language"] ?? "en"]
            if let context = values["context"] as? String, !context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["context"] = context.trimmingCharacters(in: .whitespacesAndNewlines) }
            return input
        case "video.transcript.generate":
            guard let file else { return values }
            var input: [String:Any] = ["audioBase64": file.data.base64EncodedString(), "mimeType": file.mimeType, "filename": file.name]
            if let language = values["language"] as? String, !language.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { input["language"] = language.trimmingCharacters(in: .whitespacesAndNewlines) }
            return input
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
            if let examples = result["suggestedTests"] as? [[String:Any]], !examples.isEmpty {
                let lines = examples.map { item -> String in
                    let rawInput = item["input"] as? String ?? ""
                    let displayInput = rawInput.isEmpty ? "(empty)" : rawInput
                    let verdict = (item["shouldMatch"] as? Bool) == true ? "should match" : "should not match"
                    return "• \(displayInput): \(verdict)"
                }
                text += "\n\nSuggested examples (AI guesses, not verified)\n" + lines.joined(separator: "\n") + "\nTry these in the regex tester above before relying on them."
            }
            return text
        case "developer.sql.explain":
            var text = result["summary"] as? String ?? ""
            if let steps = result["steps"] as? [[String:Any]], !steps.isEmpty { text += "\n\nSteps\n" + steps.map { "• \($0["clause"] as? String ?? ""): \($0["explanation"] as? String ?? "")" }.joined(separator: "\n") }
            if let warnings = result["warnings"] as? [String], !warnings.isEmpty { text += "\n\nWarnings\n" + warnings.map { "• \($0)" }.joined(separator: "\n") }
            if let notes = result["performanceNotes"] as? [String], !notes.isEmpty { text += "\n\nPerformance notes\n" + notes.map { "• \($0)" }.joined(separator: "\n") }
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

struct NativeAiMicroField: Identifiable {
    let name: String
    let label: String
    let defaultValue: String
    let multiline: Bool
    var id: String { name }
}

enum NativeAiMicroEngine {
    static let operations: [String: String] = [
        "ai-meeting-agenda-generator": "agenda", "blog-outline-generator": "blog-outline",
        "call-to-action-generator": "cta", "expand-helper": "expand", "faq-generator": "faq",
        "feature-benefit-generator": "feature-benefit", "meeting-action-items": "actions",
        "product-title-generator": "product-title", "pros-cons-generator": "pros-cons",
        "shorten-helper": "shorten", "tiktok-caption-helper": "tt-caption",
        "youtube-description-helper": "yt-desc", "youtube-title-helper": "yt-title"
    ]

    static func supports(_ toolID: String) -> Bool { operations[toolID] != nil }
    static func operation(for toolID: String) -> String? { operations[toolID] }

    static func fields(for toolID: String) -> [NativeAiMicroField] {
        switch operation(for: toolID) {
        case "blog-outline": return [topic(), audience(), field("goal", "Goal", "Educate and give the reader a practical next step")]
        case "cta": return [topic()]
        case "expand", "shorten": return [field("text", "Text", "We are launching a new product that helps people create useful content faster.", multiline: true)]
        case "faq": return [topic(), audience(), field("points", "Key points", "What it is\nWho it is for\nHow it works\nPricing or access", multiline: true)]
        case "feature-benefit": return [topic(), audience(), field("benefit", "Main benefit", "Save time and get started quickly")]
        case "agenda": return [field("goal", "Meeting goal", "Plan the next launch"), field("topics", "Topics", "Progress\nBlockers\nDecisions\nNext steps", multiline: true)]
        case "actions": return [field("notes", "Rough notes", "John — finish landing page by Friday\nAda — confirm pricing\nTeam — test checkout", multiline: true)]
        case "product-title": return [topic(), field("benefit", "Main benefit", "Save time and get started quickly")]
        case "pros-cons": return [topic(), field("option", "Option / decision", "Launch now vs wait for more features")]
        case "tt-caption": return [topic(), audience(), field("count", "Options", "5")]
        case "yt-desc": return [topic(), audience(), field("tone", "Tone", "natural"), field("points", "Key points", "Problem\nSolution\nPractical examples\nCall to action", multiline: true)]
        case "yt-title": return [topic(), audience(), field("count", "Options", "8")]
        default: return []
        }
    }

    static func initialValues(_ toolID: String) -> [String: String] { Dictionary(uniqueKeysWithValues: fields(for: toolID).map { ($0.name, $0.defaultValue) }) }

    static func generate(toolID: String, values: [String: String]) throws -> String {
        guard let operation = operation(for: toolID) else { throw NSError(domain: "NativeAiMicroEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported AI micro-tool: \(toolID)"]) }
        let topic = clean(values["topic"], "your topic")
        let audience = clean(values["audience"], "your audience")
        let style = tonePhrase(clean(values["tone"], "natural"))
        let parsed = Double(values["count"] ?? "5") ?? 5
        let count = parsed.isFinite ? Int(min(20, max(1, parsed))) : 5

        switch operation {
        case "title", "yt-title": return numbered(["\(topic): What \(audience) Should Know", "How to Get Better Results With \(topic)", "The Simple Guide to \(topic)", "I Tried \(topic) — Here’s What I Learned", "\(topic) Explained Without the Jargon", "5 Things \(audience) Should Know About \(topic)", "Before You Start With \(topic), Read This", "A Practical \(topic) Guide for \(audience)"], count: count)
        case "tt-caption": return numbered(["\(topic) made simple. Save this for later.", "If you're into \(topic), this one is for you.", "A quick reminder for \(audience): you don't need to overcomplicate \(topic).", "Learning \(topic) one step at a time. What would you add?", "Here's the part about \(topic) people usually skip.", "Small steps, better results. That's the goal with \(topic).", "Trying to understand \(topic)? Start here."], count: count)
        case "blog-outline": return "Title: \(topic)\nAudience: \(audience)\nGoal: \(clean(values["goal"], "Educate the reader"))\n\nOutline\n1. Introduction — the problem and why it matters\n2. What \(topic) means\n3. The key ideas \(audience) should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA"
        case "cta": return numbered(["Get started with \(topic)", "Try \(topic) today", "See how \(topic) can help", "Learn more about \(topic)", "Start creating with \(topic)"], count: 5)
        case "expand": return "\(clean(values["text"], "Your notes").appending("."))\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step."
        case "faq": return splitList(clean(values["points"], "What it is\nHow it works")).map { "Q: \($0) about \(topic)?\nA: Explain \($0.lowercased()) in a concise, factual way for \(audience)." }.joined(separator: "\n\n")
        case "feature-benefit": return splitList(clean(values["benefit"], "Saves time")).map { "Feature: \($0)\nBenefit: Helps \(audience) get a clearer result with less friction." }.joined(separator: "\n\n")
        case "agenda":
            let points = splitList(clean(values["topics"], "Progress\nBlockers\nDecisions\nNext steps"))
            return "Meeting goal: \(clean(values["goal"], "Make a clear decision"))\n\nAgenda\n\(points.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))\n\nClose with owners, deadlines, and unresolved questions."
        case "actions":
            let notes = clean(values["notes"], "Person — task — deadline").components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            return "Action items\n\(notes.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))\n\nBefore sharing, confirm each owner and deadline."
        case "product-title":
            let benefit = clean(values["benefit"], "Simple and practical")
            return numbered(["\(topic) — \(benefit)", "\(topic): \(clean(values["benefit"], "A better way to get started"))", "The \(topic) Starter Guide", "\(topic) Made Simple", "\(topic) Toolkit"], count: 5)
        case "pros-cons": return "Decision worksheet: \(clean(values["option"], "your option"))\n\nPros\n• Potential upside: \(topic) may help achieve the stated goal.\n• Can be tested with a small, measurable experiment.\n• Creates information for the next decision.\n\nCons / risks\n• Requires time, money, or attention.\n• Results may differ from assumptions.\n• A larger commitment may reduce flexibility.\n\nQuestions to verify\n• What is the smallest useful test?\n• What metric decides whether to continue?\n• What would make you stop or change direction?"
        case "shorten":
            let text = clean(values["text"], "Your original text")
            let words = text.split(whereSeparator: { $0.isWhitespace })
            return words.count > 28 ? words.prefix(28).joined(separator: " ") + "…" : text
        case "yt-desc":
            let points = splitList(clean(values["points"], "Key points and practical examples"))
            return "\(topic)\n\nIn this video, we break down \(topic) for \(audience) in a \(style) way.\n\nWhat you'll cover:\n\(points.map { "• \($0)" }.joined(separator: "\n"))\n\nIf you found this useful, save it for later and share it with someone working on the same goal."
        default: throw NSError(domain: "NativeAiMicroEngine", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported AI micro-tool operation: \(operation)"])
        }
    }

    private static func field(_ name: String, _ label: String, _ value: String, multiline: Bool = false) -> NativeAiMicroField { NativeAiMicroField(name: name, label: label, defaultValue: value, multiline: multiline) }
    private static func topic() -> NativeAiMicroField { field("topic", "Topic / subject", "AI tools for creators") }
    private static func audience() -> NativeAiMicroField { field("audience", "Audience", "creators and small businesses") }
    private static func clean(_ value: String?, _ fallback: String) -> String { let cleaned = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines); return cleaned.isEmpty ? fallback : cleaned }
    private static func tonePhrase(_ tone: String) -> String { ["professional":"clear and professional", "bold":"confident and direct", "playful":"light and playful", "friendly":"warm and friendly"][tone] ?? "natural and conversational" }
    private static func numbered(_ lines: [String], count: Int) -> String { lines.prefix(min(lines.count, max(1, count))).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n\n") }
    private static func splitList(_ value: String) -> [String] { value.components(separatedBy: CharacterSet.newlines.union(CharacterSet(charactersIn: ","))).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
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
        try await runWithMetadata(task: task, input: input).result
    }

    static func runWithMetadata(task: String, input: [String:Any]) async throws -> NativeAiResponse {
        let body = try JSONSerialization.data(withJSONObject: ["task":task, "input":input], options: [])
        let (data, response) = try await request(path: "/api/ai/run", method: "POST", body: body)
        guard let http = response as? HTTPURLResponse else { throw NativeNativeError.message("Invalid AI response.") }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String:Any] ?? [:]
        if !(200...299).contains(http.statusCode) {
            let error = object["error"] as? [String:Any]
            let retry = error?["retryAfterSeconds"] as? Int
            throw NativeAiRequestError(message: error?["message"] as? String ?? "AI request failed.", retryAfterSeconds: retry)
        }
        guard let payload = object["data"] as? [String:Any], let result = payload["result"] as? [String:Any] else { throw NativeAiRequestError(message: "The AI response was not usable.", retryAfterSeconds: nil) }
        let meta = payload["meta"] as? [String:Any] ?? [:]
        return NativeAiResponse(result: result, warnings: meta["warnings"] as? [String] ?? [], requestId: meta["requestId"] as? String ?? "", cached: meta["cached"] as? Bool ?? false)
    }

    static func prepareImage(_ file: NativeBackendFile) throws -> NativeBackendFile {
        let ext = URL(fileURLWithPath: file.name).pathExtension.lowercased()
        let mime = file.mimeType.lowercased().split(separator: ";", maxSplits: 1).first.map(String.init) ?? ""
        let imageTypes = Set(["image/jpeg", "image/png", "image/webp"])
        let extensionTypes = ["jpg":"image/jpeg", "jpeg":"image/jpeg", "png":"image/png", "webp":"image/webp"]
        guard imageTypes.contains(mime) || mime.isEmpty && extensionTypes[ext] != nil else { throw NativeNativeError.message("Use a JPEG, PNG or WebP image.") }
        guard let original = UIImage(data: file.data) else { throw NativeNativeError.message("The selected file is not a supported image.") }
        let attempts: [(CGFloat, CGFloat)] = [(1280, 0.82), (1280, 0.68), (1024, 0.60), (768, 0.55)]
        for (maxSide, quality) in attempts {
            let scale = min(1, maxSide / max(original.size.width, original.size.height))
            let size = CGSize(width: max(1, original.size.width * scale), height: max(1, original.size.height * scale))
            let renderer = UIGraphicsImageRenderer(size: size)
            let scaled = renderer.image { _ in original.draw(in: CGRect(origin: .zero, size: size)) }
            if let data = scaled.jpegData(compressionQuality: quality), data.count <= 2_400_000 { return NativeBackendFile(name: file.name, mimeType: "image/jpeg", data: data) }
        }
        throw NativeNativeError.message("That image is too large for AI. Try a smaller image.")
    }

    static func prepareAudio(_ file: NativeBackendFile) throws -> NativeBackendFile {
        let ext = URL(fileURLWithPath: file.name).pathExtension.lowercased()
        let aliases = ["audio/mp3":"audio/mpeg","audio/mpeg3":"audio/mpeg","audio/wave":"audio/wav","audio/x-flac":"audio/flac","audio/m4a":"audio/x-m4a"]
        let source = file.mimeType.lowercased().split(separator: ";", maxSplits: 1).first.map(String.init) ?? ""
        let extensions = ["mp3":"audio/mpeg","m4a":"audio/x-m4a","mp4":"audio/mp4","wav":"audio/wav","webm":"audio/webm","ogg":"audio/ogg","oga":"audio/ogg","flac":"audio/flac"]
        let accepted = Set(["audio/mpeg","audio/mp4","audio/x-m4a","audio/wav","audio/x-wav","audio/webm","audio/ogg","audio/flac"])
        guard let mime = aliases[source] ?? (accepted.contains(source) ? source : nil) ?? extensions[ext] else { throw NativeNativeError.message("Use an MP3, M4A, WAV, WebM, OGG or FLAC audio file.") }
        guard file.data.count <= 2_800_000 else { throw NativeNativeError.message("That file is \(String(format: "%.1f", Double(file.data.count) / 1_000_000)) MB. AI transcription currently accepts audio up to 2.8 MB. Trim or compress it first.") }
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
    @State private var resultMetric = ""
    @State private var emailPoints = ""
    @State private var pageSummary = ""
    @State private var benefit = ""
    @State private var existingPrompt = ""
    @State private var features = ""
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

    init(tool: Tool) { self.tool = tool; _topic = State(initialValue: tool.id.contains("caption") || tool.id == "title-generator" || tool.id == "idea-generator" || tool.id == "meta-description-generator" || tool.id == "social-hook-generator" || tool.id == "content-brief-generator" || tool.id == "ad-copy-generator" ? "AI tools for creators" : tool.id == "prompt-generator" ? "Create a launch plan for a digital product" : tool.id == "bio-generator" ? "AI music creator" : tool.id == "product-description-generator" ? "AI Music Generator Class" : tool.id == "resume-bullet-generator" ? "Managed social media content and improved engagement" : tool.id == "rewrite-helper" ? "We are launching a new product that helps people create useful content faster." : tool.id == "email-generator" ? "Introduce a new digital product" : ""); _resultMetric = State(initialValue: tool.id == "resume-bullet-generator" ? "increased engagement" : ""); _emailPoints = State(initialValue: tool.id == "email-generator" ? "What it does\nWho it is for\nHow to get started" : ""); _pageSummary = State(initialValue: tool.id == "meta-description-generator" ? "Explain the product, key benefits, and how visitors can get started." : ""); _benefit = State(initialValue: tool.id == "social-hook-generator" || tool.id == "ad-copy-generator" ? "Save time and get started quickly" : ""); _existingPrompt = State(initialValue: tool.id == "prompt-improver" ? "Write a good social media post about my product." : ""); _features = State(initialValue: tool.id == "product-description-generator" ? "Beginner friendly\nWorks from a smartphone\nUses accessible tools" : ""); _variants = State(initialValue: tool.id == "title-generator" ? "8" : tool.id.contains("title") || tool.id == "bio-generator" ? "5" : "5"); _goal = State(initialValue: tool.id == "content-brief-generator" || tool.id == "idea-generator" ? "Educate and give the reader a practical next step" : "describe") }

    private var task: String? { NativeAiEngine.task(for: tool.id) }
    private var needsConsent: Bool { ["json-validator","alt-text-generator","video-audio-extractor"].contains(tool.id) }
    private var needsFile: Bool { ["alt-text-generator","video-audio-extractor"].contains(tool.id) }
    private var localCaption: Bool { NativeAiEngine.isLocalCaption(tool.id) }
    private var localPrompt: Bool { NativeAiEngine.isLocalPrompt(tool.id) }
    private var localBio: Bool { NativeAiEngine.isLocalBio(tool.id) }
    private var localTitle: Bool { NativeAiEngine.isLocalTitle(tool.id) }
    private var localProduct: Bool { NativeAiEngine.isLocalProduct(tool.id) }
    private var localIdea: Bool { NativeAiEngine.isLocalIdea(tool.id) }
    private var localResume: Bool { NativeAiEngine.isLocalResume(tool.id) }
    private var localRewrite: Bool { NativeAiEngine.isLocalRewrite(tool.id) }
    private var localEmail: Bool { NativeAiEngine.isLocalEmail(tool.id) }
    private var localMeta: Bool { NativeAiEngine.isLocalMeta(tool.id) }
    private var localHook: Bool { NativeAiEngine.isLocalHook(tool.id) }
    private var localImprover: Bool { NativeAiEngine.isLocalImprover(tool.id) }
    private var localContentBrief: Bool { NativeAiEngine.isLocalContentBrief(tool.id) }
    private var localAdCopy: Bool { NativeAiEngine.isLocalAdCopy(tool.id) }
    private var localDeterministic: Bool { localCaption || localPrompt || localBio || localTitle || localProduct || localIdea || localResume || localRewrite || localEmail || localMeta || localHook || localImprover || localContentBrief || localAdCopy }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText(localDeterministic ? "Runs locally with deterministic templates" : "AI assistance · native Swift → enV AI API").font(.subheadline.weight(.semibold))
            if !localDeterministic && available == false { enVCharacterSpacedText("AI is currently unavailable on this deployment. The local/native tool still works.").font(.caption).foregroundStyle(.secondary) }
            if let task {
                if localAdCopy { NativeInputField(title: "Topic / subject", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Main benefit", text: $benefit) }
                else if localContentBrief { NativeInputField(title: "Topic / subject", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Goal", text: $goal) }
                else if localImprover { NativeInputField(title: "Existing prompt", text: $existingPrompt); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone) }
                else if localHook { NativeInputField(title: "Topic / subject", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Main benefit", text: $benefit) }
                else if localMeta { NativeInputField(title: "Topic / subject", text: $topic); NativeInputField(title: "Page purpose", text: $pageSummary); NativeInputField(title: "Tone", text: $tone) }
                else if localEmail { NativeInputField(title: "Email purpose", text: $topic); NativeInputField(title: "Key points", text: $emailPoints); NativeInputField(title: "Tone", text: $tone) }
                else if localRewrite { NativeInputField(title: "Text", text: $topic); NativeInputField(title: "Tone", text: $tone) }
                else if localResume { NativeInputField(title: "Duty / responsibility", text: $topic); NativeInputField(title: "Result or metric (optional)", text: $resultMetric); NativeInputField(title: "Tone", text: $tone) }
                else if localIdea { NativeInputField(title: "Topic / subject", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone); NativeInputField(title: "Goal", text: $goal) }
                else if localProduct { NativeInputField(title: "Product name", text: $topic); NativeInputField(title: "Features / benefits", text: $features); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone) }
                else if localPrompt { NativeInputField(title: "Task", text: $topic); NativeInputField(title: "Audience", text: $audience); NativeInputField(title: "Tone", text: $tone) }
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
                HStack { Button(working ? "Working…" : "Generate") { run(task: task) }.buttonStyle(.borderedProminent).disabled(working || (!localDeterministic && available != true) || needsConsent && !consent || needsFile && file == nil || requiredMissing); Button("Reset") { output=""; error=""; existingPrompt=localImprover ? "Write a good social media post about my product." : existingPrompt; topic=localCaption || localTitle || localIdea || localHook || localContentBrief || localAdCopy ? "AI tools for creators" : localPrompt ? "Create a launch plan for a digital product" : localBio ? "AI music creator" : localProduct ? "AI Music Generator Class" : localResume ? "Managed social media content and improved engagement" : localRewrite ? "We are launching a new product that helps people create useful content faster." : ""; resultMetric=localResume ? "increased engagement" : ""; features=localProduct ? "Beginner friendly\nWorks from a smartphone\nUses accessible tools" : ""; benefit=localHook || localAdCopy ? "Save time and get started quickly" : ""; goal=localIdea || localContentBrief ? "Educate and give the reader a practical next step" : goal; audience="creators and small businesses";pattern="";sql="";json="";file=nil }.buttonStyle(.bordered) }
                if !output.isEmpty { TextEditor(text: .constant(output)).frame(minHeight: 150).textSelection(.enabled).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3))) }
                if !error.isEmpty { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
                enVCharacterSpacedText("AI output can be wrong. Review it before you use it. Native deterministic tools remain available offline.").font(.caption).foregroundStyle(.secondary)
                    .onAppear { if !localDeterministic { Task { available = (try? await NativeAiClient.availability()[task]) ?? false } } }
                    .fileImporter(isPresented: $picker, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in if case .success(let urls) = result, let url = urls.first { let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; if let data = try? Data(contentsOf: url) { file = NativeBackendFile(name: url.lastPathComponent, mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", data: data) } } }
            }
        }.padding(.vertical, 4)
    }

    private var requiredMissing: Bool {
        if tool.id == "regex-tester" { return pattern.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if tool.id == "sql-formatter" { return sql.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if tool.id == "json-validator" { return json.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if localAdCopy { return topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if localContentBrief { return topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if localImprover { return existingPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if NativeAiEngine.captionTools.contains(tool.id) || NativeAiEngine.titleTools.contains(tool.id) || localPrompt || localBio || localProduct || localIdea || localResume || localRewrite || localEmail || localMeta || localHook { return topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return false
    }

    private func run(task: String) {
        working = true; error = ""; output = ""
        if localCaption { output = NativeAiEngine.localCaption(topic: topic, audience: audience, count: variants); working = false; return }
        if localPrompt { output = NativeAiEngine.localPrompt(task: topic, audience: audience, tone: tone); working = false; return }
        if localBio { output = NativeAiEngine.localBio(role: topic, audience: audience, count: variants); working = false; return }
        if localTitle { output = NativeAiEngine.localTitle(topic: topic, audience: audience, count: variants); working = false; return }
        if localProduct { output = NativeAiEngine.localProduct(product: topic, features: features, audience: audience, tone: tone); working = false; return }
        if localIdea { output = NativeAiEngine.localIdea(topic: topic, audience: audience); working = false; return }
        if localResume { output = NativeAiEngine.localResume(duty: topic, result: resultMetric); working = false; return }
        if localRewrite { output = NativeAiEngine.localRewrite(text: topic, tone: tone); working = false; return }
        if localEmail { output = NativeAiEngine.localEmail(purpose: topic, points: emailPoints); working = false; return }
        if localMeta { output = NativeAiEngine.localMeta(topic: topic, page: pageSummary); working = false; return }
        if localAdCopy { output = NativeAiEngine.localAdCopy(topic: topic, audience: audience, benefit: benefit); working = false; return }
        if localContentBrief { output = NativeAiEngine.localContentBrief(topic: topic, audience: audience, goal: goal, tone: tone); working = false; return }
        if localHook { output = NativeAiEngine.localHook(topic: topic, audience: audience); working = false; return }
        if localImprover { output = NativeAiEngine.localImprover(task: existingPrompt, audience: audience, tone: tone); working = false; return }
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

private struct NativeAiMicroToolView: View {
    let tool: Tool
    @State private var values: [String: String]
    @State private var output = ""
    @State private var error = ""

    init(tool: Tool) {
        self.tool = tool
        _values = State(initialValue: NativeAiMicroEngine.initialValues(tool.id))
    }

    private var fields: [NativeAiMicroField] { NativeAiMicroEngine.fields(for: tool.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Runs locally with deterministic templates. This tool does not send your text to an AI service.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(fields) { field in
                if field.name == "tone" {
                    Picker(field.label, selection: binding(for: field)) {
                        Text("Natural").tag("natural")
                        Text("Professional").tag("professional")
                        Text("Friendly").tag("friendly")
                        Text("Bold").tag("bold")
                        Text("Playful").tag("playful")
                    }
                    .pickerStyle(.menu)
                } else if field.multiline {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(field.label).font(.caption).foregroundStyle(.secondary)
                        TextEditor(text: binding(for: field))
                            .frame(minHeight: 96)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3)))
                    }
                } else {
                    TextField(field.label, text: binding(for: field))
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(field.name == "count" ? .numberPad : .default)
                }
            }
            HStack {
                Button("Generate") {
                    do { output = try NativeAiMicroEngine.generate(toolID: tool.id, values: values); error = "" }
                    catch { output = ""; self.error = error.localizedDescription }
                }
                .buttonStyle(.borderedProminent)
                Button("Clear") { output = ""; error = "" }
                    .buttonStyle(.bordered)
                if !output.isEmpty {
                    Button("Copy output") { UIPasteboard.general.string = output }
                        .buttonStyle(.bordered)
                }
            }
            if !output.isEmpty {
                TextEditor(text: .constant(output))
                    .frame(minHeight: 150)
                    .textSelection(.enabled)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3)))
            }
            if !error.isEmpty { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
        }
        .padding(.vertical, 4)
    }

    private func binding(for field: NativeAiMicroField) -> Binding<String> {
        Binding(get: { values[field.name] ?? field.defaultValue }, set: { values[field.name] = $0 })
    }
}

enum NativeEventEngine {
    enum Operation: Equatable { case agenda, schedule, rsvp, checkIn }
    struct Template { let operation: Operation; let theme: String }
    struct Field: Identifiable { let name: String; let label: String; let defaultValue: String; var multiline = false; var id: String { name } }

    private static let agendaThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "party", "sports-event", "webinar", "wedding", "workshop"]
    private static let scheduleThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"]
    private static let pageThemes = scheduleThemes
    private static let templates: [String: Template] = {
        var result: [String: Template] = [:]
        for theme in agendaThemes { result["\(theme)-agenda-generator"] = Template(operation: .agenda, theme: Self.titleCase(theme)) }
        for theme in scheduleThemes { result["\(theme)-schedule-builder"] = Template(operation: .schedule, theme: Self.titleCase(theme)) }
        for theme in pageThemes {
            result["\(theme)-rsvp-page"] = Template(operation: .rsvp, theme: Self.titleCase(theme))
            result["\(theme)-check-in-page"] = Template(operation: .checkIn, theme: Self.titleCase(theme))
        }
        return result
    }()
    static let supportedToolIDs = Set(templates.keys)

    static func supports(_ toolID: String) -> Bool { templates[toolID] != nil }
    static func template(for toolID: String) -> Template? { templates[toolID] }

    static func fields(for toolID: String) -> [Field] {
        guard let template = template(for: toolID) else { return [] }
        switch template.operation {
        case .agenda, .schedule:
            let label = template.operation == .agenda ? "agenda" : "schedule"
            return [Field(name: "title", label: "Title", defaultValue: "Event \(label)"), Field(name: "dateTime", label: "Date / time (optional)", defaultValue: ""), Field(name: "location", label: "Location (optional)", defaultValue: ""), Field(name: "items", label: "Agenda items (one per line)", defaultValue: "Welcome\nMain activity\nBreak\nClosing", multiline: true)]
        case .rsvp:
            return [Field(name: "title", label: "Page title", defaultValue: "\(template.theme) event"), Field(name: "dateTime", label: "Date / time (optional)", defaultValue: ""), Field(name: "location", label: "Location (optional)", defaultValue: ""), Field(name: "body", label: "Event details", defaultValue: "You're invited to the \(template.theme.lowercased()) event.", multiline: true), Field(name: "contact", label: "Organizer / RSVP contact", defaultValue: "the event organizer")]
        case .checkIn:
            return [Field(name: "title", label: "Page title", defaultValue: "\(template.theme) check-in"), Field(name: "dateTime", label: "Date / time (optional)", defaultValue: ""), Field(name: "location", label: "Location (optional)", defaultValue: ""), Field(name: "body", label: "Event details", defaultValue: "Welcome to the \(template.theme.lowercased()) event.", multiline: true), Field(name: "guest", label: "Guest name", defaultValue: "Guest")]
        }
    }

    static func initialValues(_ toolID: String) -> [String: String] { Dictionary(uniqueKeysWithValues: fields(for: toolID).map { ($0.name, $0.defaultValue) }) }
    static func fileName(_ toolID: String) -> String {
        let isHTML = template(for: toolID).map { $0.operation == .rsvp || $0.operation == .checkIn } ?? false
        return "env-\(toolID).\(isHTML ? "html" : "txt")"
    }
    static func contentType(_ toolID: String) -> UTType {
        let isHTML = template(for: toolID).map { $0.operation == .rsvp || $0.operation == .checkIn } ?? false
        return isHTML ? .html : .plainText
    }

    static func generate(toolID: String, values: [String: String]) throws -> String {
        guard let template = template(for: toolID) else { throw NSError(domain: "NativeEventEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported event template: \(toolID)"]) }
        switch template.operation {
        case .agenda, .schedule: return generateList(template, values: values)
        case .rsvp: return generateRsvp(template, values: values)
        case .checkIn: return generateCheckIn(template, values: values)
        }
    }

    private static func generateList(_ template: Template, values: [String: String]) -> String {
        let operation = template.operation == .agenda ? "agenda" : "schedule"
        let title = clean(values["title"], template.operation == .agenda ? "Event agenda" : "Event schedule")
        let rawItems = clean(values["items"], "Welcome\nMain activity\nBreak\nClosing")
        let items = rawItems.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        var details: [String] = []
        if let date = values["dateTime"]?.trimmingCharacters(in: .whitespacesAndNewlines), !date.isEmpty { details.append("Date / time: \(date)") }
        if let location = values["location"]?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty { details.append("Location: \(location)") }
        let header = "\(template.theme) \(operation)"
        return "\(header)\n\n\(title)\(details.isEmpty ? "" : "\n\(details.joined(separator: "\n"))")\n\n\(items.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))"
    }

    private static func generateRsvp(_ template: Template, values: [String: String]) -> String {
        let title = htmlEscape(clean(values["title"], "\(template.theme) event"))
        let body = htmlEscape(clean(values["body"], "You're invited to the \(template.theme.lowercased()) event."))
        let date = htmlParagraph("Date / time", values["dateTime"])
        let location = htmlParagraph("Location", values["location"])
        let contact = htmlEscape(clean(values["contact"], "the event organizer"))
        let theme = htmlEscape(template.theme)
        return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>\(title)</title></head>\n<body><main><h1>\(title)</h1><p>\(body)</p>\(date)\(location)<section aria-labelledby=\"rsvp-heading\"><h2 id=\"rsvp-heading\">How to RSVP</h2><p>Contact \(contact) to respond. This static page does not collect or store RSVPs.</p></section><p>Event type: \(theme)</p></main></body>\n</html>"
    }

    private static func generateCheckIn(_ template: Template, values: [String: String]) -> String {
        let title = htmlEscape(clean(values["title"], "\(template.theme) check-in"))
        let body = htmlEscape(clean(values["body"], "Welcome to the \(template.theme.lowercased()) event."))
        let date = htmlParagraph("Date / time", values["dateTime"])
        let location = htmlParagraph("Location", values["location"])
        let guest = htmlEscape(clean(values["guest"], "Guest"))
        let theme = htmlEscape(template.theme)
        return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>\(title)</title></head>\n<body><main><h1>\(title)</h1><p>\(body)</p>\(date)\(location)<section aria-labelledby=\"checkin-heading\"><h2 id=\"checkin-heading\">Check-in information</h2><p>Guest: \(guest)</p><p>Please check in with event staff on arrival. This static page does not verify or record arrivals.</p></section><p>Event type: \(theme)</p></main></body>\n</html>"
    }

    private static func clean(_ value: String?, _ fallback: String) -> String { value?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? fallback }
    private static func htmlParagraph(_ label: String, _ value: String?) -> String {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return "" }
        return "<p><strong>\(label):</strong> \(htmlEscape(value))</p>"
    }
    private static func titleCase(_ slug: String) -> String { slug.split(separator: "-").map { $0.capitalized }.joined(separator: " ") }
    private static func htmlEscape(_ value: String) -> String { value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&#39;") }
}

private extension String { var nonEmpty: String? { isEmpty ? nil : self } }

private struct NativeEventTextDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText, .html] }
    var text: String
    init(text: String) { self.text = text }
    init(configuration: ReadConfiguration) throws { text = configuration.file.regularFileContents.map { String(decoding: $0, as: UTF8.self) } ?? "" }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: Data(text.utf8)) }
}

private struct NativeEventToolView: View {
    let tool: Tool
    @State private var values: [String: String]
    @State private var output = ""
    @State private var error = ""
    @State private var exporting = false

    init(tool: Tool) { self.tool = tool; _values = State(initialValue: NativeEventEngine.initialValues(tool.id)) }
    private var fields: [NativeEventEngine.Field] { NativeEventEngine.fields(for: tool.id) }
    private var isStaticPage: Bool { NativeEventEngine.template(for: tool.id).map { $0.operation == .rsvp || $0.operation == .checkIn } ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText(isStaticPage ? "Static HTML template only. It does not publish a page, collect RSVP responses, or record live check-ins." : "Runs locally. Date and time are kept exactly as entered; no time-zone conversion or calendar service is used.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(fields) { field in
                if field.multiline {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(field.label).font(.caption).foregroundStyle(.secondary)
                        TextEditor(text: binding(for: field)).frame(minHeight: 96).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3)))
                    }
                } else {
                    TextField(field.label, text: binding(for: field)).textFieldStyle(.roundedBorder)
                }
            }
            HStack {
                Button("Generate") {
                    do { output = try NativeEventEngine.generate(toolID: tool.id, values: values); error = "" }
                    catch { output = ""; self.error = error.localizedDescription }
                }.buttonStyle(.borderedProminent)
                Button("Reset") { values = NativeEventEngine.initialValues(tool.id); output = ""; error = "" }.buttonStyle(.bordered)
                if !output.isEmpty {
                    Button("Copy output") { UIPasteboard.general.string = output }.buttonStyle(.bordered)
                    Button("Save output") { exporting = true }.buttonStyle(.bordered)
                }
            }
            if !output.isEmpty {
                TextEditor(text: .constant(output)).frame(minHeight: 160).textSelection(.enabled).overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envTeal.opacity(0.3)))
            }
            if !error.isEmpty { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
        }
        .padding(.vertical, 4)
        .fileExporter(isPresented: $exporting, document: NativeEventTextDocument(text: output), contentType: NativeEventEngine.contentType(tool.id), defaultFilename: NativeEventEngine.fileName(tool.id), onCompletion: { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
        })
    }

    private func binding(for field: NativeEventEngine.Field) -> Binding<String> {
        Binding(get: { values[field.name] ?? field.defaultValue }, set: { values[field.name] = $0 })
    }
}

private struct NativeBusinessToolView: View {
    let tool: Tool
    @State private var a = "1000"
    @State private var b = "600"
    @State private var c = "50"
    @State private var d = "10"
    @State private var e = "12"
    @State private var seed = "technology"
    @State private var audience = "customers"
    @State private var output = ""
    @State private var error: String?
    private var options: [String:String] { ["a":a,"b":b,"c":c,"d":d,"e":e,"seed":seed,"audience":audience] }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Native business engine · \(tool.engine.op ?? tool.engine.id ?? tool.id)").font(.subheadline.weight(.semibold))
            NativeInputField(title: "Revenue / amount", text: $a)
            NativeInputField(title: "Cost / rate / second value", text: $b)
            NativeInputField(title: "Variable cost / third value", text: $c)
            NativeInputField(title: "Fourth value", text: $d)
            NativeInputField(title: "Fifth value", text: $e)
            NativeInputField(title: "Seed / topic", text: $seed)
            NativeInputField(title: "Audience", text: $audience)
            NativeActionRow(output: output, run: {
                do { output = try NativeBusinessEngine.run(tool, options: options); error = nil }
                catch let caught { output = ""; error = caught.localizedDescription }
            }, reset: { a="1000"; b="600"; c="50"; d="10"; e="12"; seed="technology"; audience="customers"; output=""; error=nil })
            NativeOutputView(output: output, error: error)
        }
    }
}


private struct NativeBinaryDocument: FileDocument {
    static var readableContentTypes:[UTType] { [.data] }
    let data:Data
    init(data:Data){self.data=data}
    init(configuration:ReadConfiguration)throws{data=configuration.file.regularFileContents ?? Data()}
    func fileWrapper(configuration:WriteConfiguration)throws->FileWrapper{FileWrapper(regularFileWithContents:data)}
}

private struct NativeFileConverterToolView: View {
    let tool:Tool
    @State private var file:NativeBackendFile?
    @State private var output:String=""
    @State private var outputData:Data?
    @State private var outputExt="txt"
    @State private var error=""
    @State private var importing=false
    @State private var exporting=false
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            enVCharacterSpacedText("Native Swift · local file conversion").font(.subheadline.weight(.semibold))
            Button(file == nil ? "Choose file" : file!.name) { importing=true }.buttonStyle(.bordered)
            HStack { Button("Convert") { run() }.buttonStyle(.borderedProminent).disabled(file == nil); Button("Reset") { file=nil;output="";outputData=nil;error="" }.buttonStyle(.bordered) }
            if !output.isEmpty { TextEditor(text:.constant(output)).frame(minHeight:150).textSelection(.enabled) }
            if outputData != nil { Button("Save \(outputExt.uppercased())") { exporting=true }.buttonStyle(.bordered) }
            if !error.isEmpty { enVCharacterSpacedText(error).foregroundStyle(.red).font(.footnote) }
        }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.data],allowsMultipleSelection:false) { result in
            if case .success(let urls)=result,let url=urls.first { let access=url.startAccessingSecurityScopedResource(); defer{if access{url.stopAccessingSecurityScopedResource()}}; if let data=try? Data(contentsOf:url){file=NativeBackendFile(name:url.lastPathComponent,mimeType:UTType(filenameExtension:url.pathExtension)?.preferredMIMEType ?? "application/octet-stream",data:data)} }
        }
        .fileExporter(isPresented:$exporting,document:outputData.map(NativeBinaryDocument.init),contentType:.data,defaultFilename:"env-\(tool.id).\(outputExt)") { result in if case .failure(let e)=result{error=e.localizedDescription} }
    }
    private func run(){ guard let file else{return}; do { let r=try NativeFileConverterEngine.run(tool,file:file);output=r.text ?? "";outputData=r.data;outputExt=r.ext;error="" } catch let caughtError { output="";outputData=nil;error=caughtError.localizedDescription } }
}


private enum NativeAiAssistFieldKind: Equatable {
    case text, textarea, number, select, checkbox, image, audio
}

private struct NativeAiAssistOption: Identifiable {
    let value: String
    let label: String
    var id: String { value }
}

private struct NativeAiAssistField: Identifiable {
    let name: String
    let label: String
    let kind: NativeAiAssistFieldKind
    var required = false
    var maxLength: Int? = nil
    var min: Int? = nil
    var max: Int? = nil
    var placeholder: String? = nil
    var help: String? = nil
    var monospace = false
    var preserveWhitespace = false
    var options: [NativeAiAssistOption] = []
    var defaultValue: String? = nil
    var defaultBool: Bool? = nil
    var id: String { name }
    var wide: Bool { kind == .textarea || kind == .image || kind == .audio }
}

private struct NativeAiAssistFeature {
    let toolID: String
    let taskID: String
    let title: String
    let description: String
    let actionLabel: String
    let resultKind: String
    let fields: [NativeAiAssistField]
    var requiresConsent = false
    var consentLabel: String? = nil
}

private enum NativeAiAssistFeatureRegistry {
    private static let tones = ["friendly", "professional", "playful", "bold", "inspirational", "witty"].map { NativeAiAssistOption(value: $0, label: $0.capitalized) }
    private static let languages = [NativeAiAssistOption(value: "en", label: "English"), NativeAiAssistOption(value: "fr", label: "French"), NativeAiAssistOption(value: "es", label: "Spanish"), NativeAiAssistOption(value: "pt", label: "Portuguese")]
    private static let topic = NativeAiAssistField(name: "topic", label: "What is it about?", kind: .textarea, required: true, maxLength: 600, placeholder: "Describe the post, video or product in a sentence or two.")
    private static let tone = NativeAiAssistField(name: "tone", label: "Tone", kind: .select, options: tones, defaultValue: "friendly")
    private static let language = NativeAiAssistField(name: "language", label: "Language", kind: .select, options: languages, defaultValue: "en")

    private static func caption(_ id: String, _ placement: String) -> NativeAiAssistFeature {
        NativeAiAssistFeature(toolID: id, taskID: "creator.caption.generate", title: "Write captions with AI", description: "Get caption ideas for \(placement). The generator above keeps working without AI.", actionLabel: "Generate captions", resultKind: "captions", fields: [topic, tone, language, NativeAiAssistField(name: "variants", label: "How many options?", kind: .number, min: 1, max: 5, defaultValue: "3"), NativeAiAssistField(name: "includeHashtags", label: "Include hashtags", kind: .checkbox, defaultBool: true)])
    }

    private static func title(_ id: String, _ placement: String) -> NativeAiAssistFeature {
        NativeAiAssistFeature(toolID: id, taskID: "creator.title.generate", title: "Get title ideas with AI", description: "Get title ideas for \(placement). The generator above keeps working without AI.", actionLabel: "Suggest titles", resultKind: "titles", fields: [topic, tone, language, NativeAiAssistField(name: "variants", label: "How many options?", kind: .number, min: 1, max: 8, defaultValue: "5")])
    }

    private static let all: [NativeAiAssistFeature] = [
        caption("instagram-caption-generator", "Instagram"), caption("tiktok-caption-generator", "TikTok"), caption("x-caption-generator", "X"), caption("youtube-caption-generator", "YouTube"), caption("linkedin-caption-generator", "LinkedIn"), caption("facebook-caption-generator", "Facebook"), caption("caption-generator", "social posts"),
        title("youtube-title-generator", "YouTube videos"), title("tiktok-title-generator", "TikTok videos"), title("instagram-title-generator", "Instagram posts"), title("podcast-title-generator", "podcast episodes"), title("title-generator", "videos, posts and articles"),
        NativeAiAssistFeature(toolID: "regex-tester", taskID: "developer.regex.explain", title: "Explain this regex with AI", description: "Get a plain-language explanation and common pitfalls. The explanation is AI-written and may be wrong, so confirm it with the tester above.", actionLabel: "Explain pattern", resultKind: "regex", fields: [NativeAiAssistField(name: "pattern", label: "Pattern", kind: .text, required: true, maxLength: 1000, placeholder: "^[\\w.+-]+@[\\w-]+\\.[\\w.]+$", monospace: true, preserveWhitespace: true), NativeAiAssistField(name: "flags", label: "Flags", kind: .text, maxLength: 8, placeholder: "gi", monospace: true), NativeAiAssistField(name: "sampleText", label: "Sample text (optional)", kind: .textarea, maxLength: 2000, preserveWhitespace: true)]),
        NativeAiAssistFeature(toolID: "sql-formatter", taskID: "developer.sql.explain", title: "Explain this SQL with AI", description: "Get a clause-by-clause explanation and risk warnings. The statement is never executed.", actionLabel: "Explain SQL", resultKind: "sql", fields: [NativeAiAssistField(name: "sql", label: "SQL statement", kind: .textarea, required: true, maxLength: 6000, monospace: true), NativeAiAssistField(name: "dialect", label: "Dialect", kind: .select, options: ["generic", "postgresql", "mysql", "sqlite", "sqlserver"].map { NativeAiAssistOption(value: $0, label: $0.capitalized) }, defaultValue: "generic")]),
        NativeAiAssistFeature(toolID: "json-validator", taskID: "developer.json.explain", title: "Describe this JSON with AI", description: "Get a summary of the structure and likely issues. Secret-looking values are masked before sending, but avoid pasting real personal data.", actionLabel: "Describe JSON", resultKind: "json", fields: [NativeAiAssistField(name: "json", label: "JSON", kind: .textarea, required: true, maxLength: 20_000, monospace: true), NativeAiAssistField(name: "goal", label: "Focus", kind: .select, options: [NativeAiAssistOption(value: "describe", label: "Describe"), NativeAiAssistOption(value: "find-issues", label: "Find issues")], defaultValue: "describe")], requiresConsent: true, consentLabel: "I understand this JSON is sent to an external AI service."),
        NativeAiAssistFeature(toolID: "alt-text-generator", taskID: "image.alt.generate", title: "Write alt text from an image with AI", description: "Upload an image and get alt text plus a longer description. Large images are shrunk in your browser first. Review the result before publishing.", actionLabel: "Write alt text", resultKind: "alt-text", fields: [NativeAiAssistField(name: "image", label: "Image", kind: .image, required: true, help: "JPEG, PNG or WebP."), NativeAiAssistField(name: "context", label: "Page context (optional)", kind: .text, maxLength: 300, placeholder: "Where will this image appear?"), NativeAiAssistField(name: "style", label: "Style", kind: .select, options: [NativeAiAssistOption(value: "concise", label: "Concise"), NativeAiAssistOption(value: "descriptive", label: "Descriptive")], defaultValue: "concise"), language], requiresConsent: true, consentLabel: "I understand this image is sent to an external AI service."),
        NativeAiAssistFeature(toolID: "video-audio-extractor", taskID: "video.transcript.generate", title: "Transcribe audio with AI", description: "Upload a short audio clip (up to about 2.8 MB) to get a transcript with timestamps. Longer recordings are not supported yet. Extract and compress the audio first.", actionLabel: "Transcribe", resultKind: "transcript", fields: [NativeAiAssistField(name: "audio", label: "Audio file", kind: .audio, required: true, help: "MP3, M4A, WAV, WebM, OGG or FLAC, up to 2.8 MB."), NativeAiAssistField(name: "language", label: "Language code (optional)", kind: .text, maxLength: 3, placeholder: "auto-detect", help: "Two letters, for example en or fr.")], requiresConsent: true, consentLabel: "I understand this recording is sent to an external AI service.")
    ]

    static func feature(toolID: String) -> NativeAiAssistFeature? { all.first { $0.toolID == toolID } }
    static var toolIDs: Set<String> { Set(all.map(\.toolID)) }
}

private struct NativeAiRequestError: LocalizedError {
    let message: String
    let retryAfterSeconds: Int?
    var errorDescription: String? { message }
}

private struct NativeAiResponse {
    let result: [String:Any]
    let warnings: [String]
    let requestId: String
    let cached: Bool
}

private struct NativeAiAssistPanel: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let tool: Tool
    let feature: NativeAiAssistFeature
    @State private var available = false
    @State private var values: [String:String]
    @State private var includeHashtags: Bool
    @State private var consent = false
    @State private var selectedFile: NativeBackendFile?
    @State private var preparing = false
    @State private var importing = false
    @State private var working = false
    @State private var error = ""
    @State private var notice = ""
    @State private var result: [String:Any]?
    @State private var resultWarnings: [String] = []
    @State private var requestTask: Task<Void, Never>?
    @State private var captionDrafts: [String] = []
    @State private var exporting = false
    @State private var exportData: Data?
    @State private var exportFilename = "transcript.txt"

    init(tool: Tool, feature: NativeAiAssistFeature) {
        self.tool = tool
        self.feature = feature
        _values = State(initialValue: Dictionary(uniqueKeysWithValues: feature.fields.compactMap { field in field.defaultValue.map { (field.name, $0) } }))
        _includeHashtags = State(initialValue: feature.fields.first(where: { $0.name == "includeHashtags" })?.defaultBool ?? true)
    }

    private var compact: Bool { horizontalSizeClass != .regular }
    private var fileField: NativeAiAssistField? { feature.fields.first { $0.kind == .image || $0.kind == .audio } }
    private var validationIssue: String? {
        for field in feature.fields {
            if field.kind == .image || field.kind == .audio {
                if field.required && selectedFile == nil { return "Choose a file for \"\(field.label)\"." }
                continue
            }
            if field.kind == .checkbox { continue }
            let value = values[field.name] ?? ""
            if field.required && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "\(field.label) is required." }
            if let maxLength = field.maxLength, value.count > maxLength { return "\(field.label) is too long (maximum \(maxLength) characters)." }
            if field.kind == .number, !value.isEmpty {
                guard let number = Double(value), (field.min == nil || number >= Double(field.min!)), (field.max == nil || number <= Double(field.max!)) else { return "\(field.label) must be between \(field.min ?? 0) and \(field.max ?? 99)." }
            }
        }
        return nil
    }

    var body: some View {
        Group {
            if available { panel }
            else { EmptyView() }
        }
        .task(id: feature.taskID) { available = (try? await NativeAiClient.availability()[feature.taskID]) == true }
        .fileImporter(isPresented: $importing, allowedContentTypes: fileTypes, allowsMultipleSelection: false) { picked in
            guard case .success(let urls) = picked, let url = urls.first else { return }
            preparing = true
            notice = ""
            do {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let raw = NativeBackendFile(name: url.lastPathComponent, mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", data: try Data(contentsOf: url))
                if fileField?.kind == .image { selectedFile = try NativeAiClient.prepareImage(raw) }
                else { selectedFile = try NativeAiClient.prepareAudio(raw) }
            } catch { selectedFile = nil; notice = error.localizedDescription }
            preparing = false
        }
        .fileExporter(isPresented: $exporting, document: exportData.map(NativeBinaryDocument.init), contentType: .data, defaultFilename: exportFilename) { saved in
            if case .failure(let failure) = saved { error = failure.localizedDescription }
        }
        .onDisappear { requestTask?.cancel() }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                enVCharacterSpacedText("✦").font(.envScaled(size: 16, weight: .semibold)).foregroundStyle(Color.envAccent)
                enVCharacterSpacedText(feature.title).font(.envScaled(size: 18, weight: .semibold)).foregroundStyle(Color.envInk)
                enVCharacterSpacedText("AI").font(.envScaled(size: 11, weight: .medium)).tracking(0.7).foregroundStyle(Color.envMuted).padding(.horizontal, 8).padding(.vertical, 3).background(Color.envSurface2, in: Capsule())
            }
            enVCharacterSpacedText(feature.description).font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
            let columns = compact ? [GridItem(.flexible())] : [GridItem(.flexible()), GridItem(.flexible())]
            LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                ForEach(feature.fields.filter { $0.kind != .checkbox }) { field in
                    fieldView(field).gridCellColumns(!compact && field.wide ? 2 : 1)
                }
            }
            ForEach(feature.fields.filter { $0.kind == .checkbox }) { field in
                Toggle(field.label, isOn: $includeHashtags).font(.envScaled(size: 14, weight: .regular)).tint(Color.envAccent)
            }
            if feature.requiresConsent {
                Toggle(feature.consentLabel ?? "I understand my input is sent to an external AI service.", isOn: $consent)
                    .font(.envScaled(size: 14, weight: .regular)).tint(Color.envAccent)
            }
            HStack(spacing: 8) {
                if working {
                    Button("Cancel") { requestTask?.cancel(); requestTask = nil; working = false }.buttonStyle(.bordered)
                } else {
                    Button {
                        if let issue = validationIssue { notice = issue; return }
                        run()
                    } label: {
                        HStack(spacing: 6) { enVCharacterSpacedText("✦"); enVCharacterSpacedText(result == nil ? feature.actionLabel : "Try again") }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.envAccent)
                    .disabled(validationIssue != nil || feature.requiresConsent && !consent || preparing)
                }
                if working || preparing {
                    ProgressView().tint(Color.envAccent)
                    enVCharacterSpacedText(preparing ? "Preparing your file…" : "Working on it. This can take up to a minute.")
                        .font(.envScaled(size: 13, weight: .regular)).foregroundStyle(Color.envMuted)
                }
            }
            enVCharacterSpacedText("AI-assisted. Nothing is sent until you press the button; then your input goes to an external AI service to produce the result. AI can be wrong, so review it before you use it. Use is limited per person and per day to keep it available for everyone.")
                .font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted)
            if !notice.isEmpty { enVCharacterSpacedText(notice).font(.envScaled(size: 13, weight: .regular)).foregroundStyle(.red) }
            if !error.isEmpty { enVCharacterSpacedText(error).font(.envScaled(size: 13, weight: .regular)).foregroundStyle(.red) }
            if let result { resultView(result) }
        }
        .padding(compact ? 16 : 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.envSurface, in: RoundedRectangle(cornerRadius: 32))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(Color.envBorder.opacity(0.5), lineWidth: 1))
    }

    private var fileTypes: [UTType] {
        if fileField?.kind == .image { return [.jpeg, .png, UTType(filenameExtension: "webp") ?? .image] }
        return [.audio] + ["mp3", "m4a", "wav", "webm", "ogg", "flac"].compactMap { UTType(filenameExtension: $0) }
    }

    @ViewBuilder private func fieldView(_ field: NativeAiAssistField) -> some View {
        let binding = valueBinding(field)
        VStack(alignment: .leading, spacing: 6) {
            switch field.kind {
            case .textarea:
                enVCharacterSpacedText("\(field.label)\(field.required ? " *" : "")").font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
                ZStack(alignment: .topLeading) {
                    if (values[field.name] ?? "").isEmpty, let placeholder = field.placeholder { enVCharacterSpacedText(placeholder).font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envSubtle).padding(.horizontal, 5).padding(.vertical, 8) }
                    TextEditor(text: binding).font(field.monospace ? .envScaled(size: 14, design: .monospaced) : .envScaled(size: 14, weight: .regular)).frame(minHeight: 104, maxHeight: 180).scrollContentBackground(.hidden)
                }
                .padding(6).background(Color.envCard, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
            case .text:
                TextField(field.placeholder ?? "", text: binding).font(field.monospace ? .envScaled(size: 14, design: .monospaced) : .envScaled(size: 14, weight: .regular)).textFieldStyle(.roundedBorder).accessibilityLabel("\(field.label)\(field.required ? " required" : "")")
                    .overlay(alignment: .topLeading) { if (values[field.name] ?? "").isEmpty { enVCharacterSpacedText("\(field.label)\(field.required ? " *" : "")").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted).padding(.horizontal, 8).padding(.top, -8) } }
                    .keyboardType(field.name == "language" ? .asciiCapable : .default)
            case .number:
                enVCharacterSpacedText(field.label).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
                TextField("", text: binding).textFieldStyle(.roundedBorder).keyboardType(.numberPad)
            case .select:
                enVCharacterSpacedText(field.label).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
                Picker(field.label, selection: binding) { ForEach(field.options) { option in enVCharacterSpacedText(option.label).tag(option.value) } }
                    .pickerStyle(.menu).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).padding(.vertical, 7)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
            case .image, .audio:
                enVCharacterSpacedText(field.label + (field.required ? " *" : "")).font(.envScaled(size: 14, weight: .medium)).foregroundStyle(Color.envInk)
                Button(selectedFile?.name ?? "Choose \(field.kind == .image ? "image" : "audio")") { importing = true }.buttonStyle(.bordered)
                if let selectedFile { enVCharacterSpacedText("\(selectedFile.name) · \(String(format: "%.1f", Double(selectedFile.data.count) / 1_000_000)) MB ready to send").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
            case .checkbox: EmptyView()
            }
            if let help = field.help { enVCharacterSpacedText(help).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
        }
    }

    private func valueBinding(_ field: NativeAiAssistField) -> Binding<String> {
        Binding(get: { values[field.name] ?? "" }, set: { next in values[field.name] = field.maxLength.map { String(next.prefix($0)) } ?? next })
    }

    private func run() {
        guard NativeAiEngine.task(for: tool.id) != nil else { return }
        working = true; error = ""; notice = ""; result = nil; resultWarnings = []
        requestTask = Task {
            do {
                var inputValues: [String:Any] = values.mapValues { $0 as Any }
                inputValues["includeHashtags"] = includeHashtags
                if let field = feature.fields.first(where: { $0.kind == .number }) { inputValues[field.name] = Int(values[field.name] ?? "") ?? (feature.taskID == "creator.title.generate" ? 5 : 3) }
                let input = NativeAiEngine.input(toolID: tool.id, values: inputValues, file: selectedFile)
                let response = try await NativeAiClient.runWithMetadata(task: feature.taskID, input: input)
                await MainActor.run {
                    result = response.result
                    resultWarnings = response.warnings
                    captionDrafts = (response.result["variants"] as? [[String:Any]] ?? []).map { $0["caption"] as? String ?? "" }
                    working = false; requestTask = nil
                }
            } catch is CancellationError {
                await MainActor.run { working = false; requestTask = nil }
            } catch {
                await MainActor.run {
                    if let apiError = error as? NativeAiRequestError {
                        self.error = apiError.message + (apiError.retryAfterSeconds.map { " Try again in about \($0) seconds." } ?? "")
                    } else { self.error = error.localizedDescription }
                    working = false; requestTask = nil
                }
            }
        }
    }

    @ViewBuilder private func resultView(_ result: [String:Any]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if feature.resultKind == "captions" {
                let variants = result["variants"] as? [[String:Any]] ?? []
                ForEach(variants.indices, id: \.self) { index in
                    let hashtags = (variants[index]["hashtags"] as? [String] ?? []).map { "#\($0)" }.joined(separator: " ")
                    VStack(alignment: .leading, spacing: 8) {
                        TextEditor(text: Binding(get: { captionDrafts.indices.contains(index) ? captionDrafts[index] : (variants[index]["caption"] as? String ?? "") }, set: { value in if captionDrafts.indices.contains(index) { captionDrafts[index] = value } })).font(.envScaled(size: 14, weight: .regular)).frame(minHeight: 92).scrollContentBackground(.hidden).padding(4).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 8))
                        if !hashtags.isEmpty { enVCharacterSpacedText(hashtags).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
                        HStack { enVCharacterSpacedText("\((captionDrafts.indices.contains(index) ? captionDrafts[index] : "").count) characters").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted); Spacer(); Button("Copy") { UIPasteboard.general.string = (captionDrafts.indices.contains(index) ? captionDrafts[index] : "") + (hashtags.isEmpty ? "" : "\n\n\(hashtags)") }.buttonStyle(.bordered) }
                    }.padding(12).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 10))
                }
            } else if feature.resultKind == "titles" {
                ForEach(Array((result["titles"] as? [String] ?? []).enumerated()), id: \.offset) { pair in
                    let title = pair.element
                    HStack(spacing: 10) { VStack(alignment: .leading, spacing: 3) { enVCharacterSpacedText(title).font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envInk); enVCharacterSpacedText("\(title.count) characters").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }; Spacer(); Button("Copy") { UIPasteboard.general.string = title }.buttonStyle(.bordered) }
                        .padding(12).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 8))
                }
            } else if feature.resultKind == "regex" {
                enVCharacterSpacedText(result["summary"] as? String ?? "").font(.envScaled(size: 14, weight: .regular))
                NativeAiStructuredSection(title: "Breakdown", entries: (result["parts"] as? [[String:Any]] ?? []).map { "\($0["token"] as? String ?? "") — \($0["meaning"] as? String ?? "")" })
                NativeAiStructuredSection(title: "Watch out for", entries: result["pitfalls"] as? [String] ?? [])
                NativeAiStructuredSection(title: "Suggested examples (AI guesses, not verified)", entries: (result["suggestedTests"] as? [[String:Any]] ?? []).map { item in "\((item["input"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "(empty)") — \((item["shouldMatch"] as? Bool ?? false) ? "should match" : "should not match")" })
                if !(result["suggestedTests"] as? [[String:Any]] ?? []).isEmpty { enVCharacterSpacedText("Try these in the regex tester above before relying on them.").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
            } else if feature.resultKind == "sql" {
                enVCharacterSpacedText(result["summary"] as? String ?? "").font(.envScaled(size: 14, weight: .regular))
                NativeAiStructuredSection(title: "Step by step", entries: (result["steps"] as? [[String:Any]] ?? []).enumerated().map { "\($0.offset + 1). \($0.element["clause"] as? String ?? "") — \($0.element["explanation"] as? String ?? "")" })
                NativeAiStructuredSection(title: "Warnings", entries: result["warnings"] as? [String] ?? [])
                NativeAiStructuredSection(title: "Performance notes", entries: result["performanceNotes"] as? [String] ?? [])
            } else if feature.resultKind == "json" {
                enVCharacterSpacedText(result["summary"] as? String ?? "").font(.envScaled(size: 14, weight: .regular))
                NativeAiStructuredSection(title: "Structure", entries: (result["structure"] as? [[String:Any]] ?? []).map { item in "\(item["path"] as? String ?? "") · \(item["type"] as? String ?? "")\((item["note"] as? String).flatMap { $0.isEmpty ? nil : $0 }.map { " — \($0)" } ?? "")" })
                NativeAiStructuredSection(title: "Possible issues", entries: result["issues"] as? [String] ?? [])
            } else if feature.resultKind == "alt-text" {
                let alt = result["altText"] as? String ?? ""
                NativeAiStructuredSection(title: "Alt text", entries: [alt])
                enVCharacterSpacedText("\(alt.count) characters").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted)
                NativeAiStructuredSection(title: "Longer description", entries: [result["longDescription"] as? String ?? ""])
                if result["containsText"] as? Bool == true { NativeAiStructuredSection(title: "Text found in the image", entries: [result["textInImage"] as? String ?? ""]) }
            } else {
                let text = NativeAiEngine.format(task: feature.taskID, result: result)
                TextEditor(text: .constant(text)).font(.envScaled(size: 14, weight: .regular)).frame(minHeight: feature.resultKind == "transcript" ? 160 : 120).textSelection(.enabled).padding(4).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envBorder, lineWidth: 1))
                HStack(spacing: 8) {
                    Button("Copy") { UIPasteboard.general.string = text }.buttonStyle(.bordered)
                    if feature.resultKind == "transcript" {
                        Button("Download .txt") { beginExport(text, filename: "transcript.txt") }.buttonStyle(.bordered).disabled(text.isEmpty)
                        if let segments = result["segments"] as? [[String:Any]], !segments.isEmpty {
                            Button("Download .srt") { beginExport(subtitles(segments, webVtt: false), filename: "transcript.srt") }.buttonStyle(.bordered)
                            Button("Download .vtt") { beginExport(subtitles(segments, webVtt: true), filename: "transcript.vtt") }.buttonStyle(.bordered)
                        }
                    }
                }
                if feature.resultKind == "transcript", let language = result["language"] as? String { enVCharacterSpacedText("Detected language: \(language)").font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
            }
            if !resultWarnings.isEmpty { enVCharacterSpacedText(resultWarnings.joined(separator: " ")).font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted) }
        }
    }

    private func beginExport(_ text: String, filename: String) { exportData = Data(text.utf8); exportFilename = filename; exporting = true }
    private func subtitles(_ segments: [[String:Any]], webVtt: Bool) -> String {
        let rows = segments.enumerated().compactMap { index, item -> String? in
            guard let start = item["start"] as? Double, let end = item["end"] as? Double, let text = item["text"] as? String else { return nil }
            let arrow = webVtt ? " --> " : " --> "
            return "\(webVtt ? "" : "\(index + 1)\n")\(subtitleTime(start, webVtt: webVtt))\(arrow)\(subtitleTime(end, webVtt: webVtt))\n\(text)"
        }
        return (webVtt ? "WEBVTT\n\n" : "") + rows.joined(separator: "\n\n") + "\n"
    }
    private func subtitleTime(_ value: Double, webVtt: Bool) -> String {
        let milliseconds = Int((max(0, value) * 1000).rounded())
        let h = milliseconds / 3_600_000, m = (milliseconds % 3_600_000) / 60_000, s = (milliseconds % 60_000) / 1000, ms = milliseconds % 1000
        return String(format: "%02d:%02d:%02d%@%03d", h, m, s, webVtt ? "." : ",", ms)
    }
}

private struct NativeAiStructuredSection: View {
    let title: String
    let entries: [String]

    var body: some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                enVCharacterSpacedText(title).font(.envScaled(size: 14, weight: .semibold)).foregroundStyle(Color.envInk)
                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                    HStack(alignment: .top, spacing: 8) {
                        enVCharacterSpacedText("• \(entry)")
                            .font(.envScaled(size: 14, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                        Button("Copy") { UIPasteboard.general.string = entry }
                            .buttonStyle(.bordered)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}


struct NativeBarcodeField {
    let key: String
    let title: String
    var initial: String = ""
    var multiline: Bool = false
    var options: [String] = []
}

struct NativeBarcodeExecution {
    let text: String
    var images: [UIImage] = []
    var exportText: String? = nil
    var exportName: String? = nil
}

extension NativeBarcodeEngine {
    private static var presetMap: [String:String] {
        ["app-store-qr-generator":"url", "bitcoin-qr-generator":"bitcoin", "calendar-qr-generator":"calendar", "crypto-wallet-qr-generator":"crypto", "discord-invite-qr-generator":"url", "email-qr-generator":"email", "ethereum-qr-generator":"ethereum", "event-qr-generator":"event", "facebook-link-qr-generator":"url", "google-play-qr-generator":"url", "instagram-link-qr-generator":"url", "linkedin-link-qr-generator":"url", "location-qr-generator":"geo", "mecard-qr-generator":"mecard", "phone-qr-generator":"phone", "qr-batch-generator":"batch", "qr-capacity-helper":"capacity", "qr-code-high-error-correction":"high-error", "qr-code-low-error-correction":"low-error", "qr-code-styled":"styled", "qr-data-url-generator":"data-url", "qr-generator":"text", "qr-payload-encoder":"payload", "qr-payload-inspector":"inspect", "qr-size-calculator":"size", "qr-svg-generator":"svg", "qr-version-helper":"version", "sms-qr-generator":"sms", "telegram-link-qr-generator":"url", "text-qr-generator":"text", "url-qr-generator":"url", "vcard-qr-generator":"vcard", "whatsapp-qr-generator":"whatsapp", "wifi-qr-generator":"wifi", "x-link-qr-generator":"url", "youtube-link-qr-generator":"url"]
    }

    static func fieldsFor(_ toolID:String) -> [NativeBarcodeField] {
        switch presetMap[toolID] ?? "" {
        case "url": return [NativeBarcodeField(key:"url", title:"URL", initial:"https://example.com")]
        case "wifi": return [NativeBarcodeField(key:"ssid", title:"Network name (SSID)"), NativeBarcodeField(key:"password", title:"Password"), NativeBarcodeField(key:"security", title:"Security", initial:"WPA", options:["WPA","WEP","nopass"]), NativeBarcodeField(key:"hidden", title:"Hidden network", initial:"false", options:["false","true"])]
        case "whatsapp": return [NativeBarcodeField(key:"phone", title:"Phone with country code"), NativeBarcodeField(key:"text", title:"Message", multiline:true)]
        case "email": return [NativeBarcodeField(key:"to", title:"Email address"), NativeBarcodeField(key:"subject", title:"Subject"), NativeBarcodeField(key:"body", title:"Message", multiline:true)]
        case "phone": return [NativeBarcodeField(key:"phone", title:"Phone number")]
        case "sms": return [NativeBarcodeField(key:"phone", title:"Phone number"), NativeBarcodeField(key:"body", title:"Message", multiline:true)]
        case "vcard": return [NativeBarcodeField(key:"name", title:"Name"), NativeBarcodeField(key:"phone", title:"Phone"), NativeBarcodeField(key:"email", title:"Email"), NativeBarcodeField(key:"org", title:"Organization")]
        case "mecard": return [NativeBarcodeField(key:"name", title:"Name"), NativeBarcodeField(key:"phone", title:"Phone"), NativeBarcodeField(key:"email", title:"Email")]
        case "geo": return [NativeBarcodeField(key:"lat", title:"Latitude"), NativeBarcodeField(key:"lng", title:"Longitude")]
        case "event", "calendar": return [NativeBarcodeField(key:"title", title:"Title"), NativeBarcodeField(key:"start", title:"Start (YYYYMMDDTHHMMSS)"), NativeBarcodeField(key:"end", title:"End (YYYYMMDDTHHMMSS)"), NativeBarcodeField(key:"location", title:"Location")]
        case "bitcoin": return [NativeBarcodeField(key:"address", title:"Bitcoin address"), NativeBarcodeField(key:"amount", title:"Amount (optional BTC)"), NativeBarcodeField(key:"label", title:"Label")]
        case "ethereum", "crypto": return [NativeBarcodeField(key:"address", title:"Wallet address")]
        case "styled": return [NativeBarcodeField(key:"text", title:"Text or URL", multiline:true), NativeBarcodeField(key:"dark", title:"Dark color", initial:"#16181d"), NativeBarcodeField(key:"light", title:"Light color", initial:"#ffffff"), NativeBarcodeField(key:"size", title:"Size (px)", initial:"512"), NativeBarcodeField(key:"margin", title:"Margin", initial:"1")]
        case "batch": return [NativeBarcodeField(key:"items", title:"One value per line (up to 50)", multiline:true)]
        case "payload": return [NativeBarcodeField(key:"kind", title:"Payload type", initial:"wifi", options:["wifi","email","phone","sms","geo"]), NativeBarcodeField(key:"a", title:"Primary value"), NativeBarcodeField(key:"b", title:"Secondary value"), NativeBarcodeField(key:"c", title:"Third value")]
        case "inspect": return [NativeBarcodeField(key:"payload", title:"QR payload", multiline:true)]
        case "size": return [NativeBarcodeField(key:"modules", title:"QR modules", initial:"21"), NativeBarcodeField(key:"modulePx", title:"Module size (px)", initial:"4")]
        case "version": return [NativeBarcodeField(key:"level", title:"Error correction", initial:"M", options:["L","M","Q","H"]), NativeBarcodeField(key:"text", title:"Payload", multiline:true)]
        case "capacity": return [NativeBarcodeField(key:"version", title:"Version (1–40)", initial:"1"), NativeBarcodeField(key:"level", title:"Error correction", initial:"M", options:["L","M","Q","H"])]
        case "text", "high-error", "low-error", "svg", "data-url": return [NativeBarcodeField(key:"text", title:"Text or URL", multiline:true)]
        default:
            let initial = ["ean13-barcode","isbn-barcode","ean13-check-digit","isbn-check-digit","gtin-validator"].contains(toolID) ? "9780143127741" : toolID == "ean8-barcode" ? "96385074" : ["upc-barcode","upc-check-digit"].contains(toolID) ? "036000291452" : toolID == "itf14-barcode" ? "10000000000007" : "12345"
            return [NativeBarcodeField(key:"value", title:"Value", initial:initial)]
        }
    }

    static func initialValues(for toolID:String) -> [String:String] { Dictionary(uniqueKeysWithValues:fieldsFor(toolID).map{($0.key,$0.initial)}) }
    private static func v(_ values:[String:String],_ key:String)->String { values[key] ?? "" }
    private static func escapeQR(_ text:String)->String { text.replacingOccurrences(of:"\\",with:"\\\\").replacingOccurrences(of:";",with:"\\;").replacingOccurrences(of:",",with:"\\,").replacingOccurrences(of:":",with:"\\:") }
    private static func encodeQRComponent(_ text:String)->String { text.addingPercentEncoding(withAllowedCharacters:CharacterSet(charactersIn:"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.!~*'()")) ?? text }

    static func payloadFor(_ toolID:String,values:[String:String])->String {
        switch presetMap[toolID] ?? "" {
        case "wifi": return "WIFI:T:\(v(values,"security").isEmpty ? "WPA" : v(values,"security"));S:\(escapeQR(v(values,"ssid")));P:\(escapeQR(v(values,"password")));H:\(v(values,"hidden") == "true");"
        case "whatsapp": return "https://wa.me/\(v(values,"phone").filter(\.isNumber))?text=\(encodeQRComponent(v(values,"text")))"
        case "email": return "mailto:\(v(values,"to"))?subject=\(encodeQRComponent(v(values,"subject")))&body=\(encodeQRComponent(v(values,"body")))"
        case "phone": return "tel:\(v(values,"phone"))"
        case "sms": return "sms:\(v(values,"phone"))?body=\(encodeQRComponent(v(values,"body")))"
        case "vcard": return "BEGIN:VCARD\nVERSION:3.0\nFN:\(v(values,"name"))\nORG:\(v(values,"org"))\nTEL:\(v(values,"phone"))\nEMAIL:\(v(values,"email"))\nEND:VCARD"
        case "mecard": return "MECARD:N:\(escapeQR(v(values,"name")));TEL:\(escapeQR(v(values,"phone")));EMAIL:\(escapeQR(v(values,"email")));;"
        case "geo": return "geo:\(v(values,"lat").isEmpty ? "0" : v(values,"lat")),\(v(values,"lng").isEmpty ? "0" : v(values,"lng"))"
        case "event", "calendar": return "BEGIN:VEVENT\nSUMMARY:\(v(values,"title"))\nDTSTART:\(v(values,"start"))\nDTEND:\(v(values,"end"))\nLOCATION:\(v(values,"location"))\nEND:VEVENT"
        case "bitcoin":
            var query:[String]=[]; if !v(values,"amount").isEmpty { query.append("amount=\(encodeQRComponent(v(values,"amount")))") }; if !v(values,"label").isEmpty { query.append("label=\(encodeQRComponent(v(values,"label")))") }
            return "bitcoin:\(v(values,"address"))\(query.isEmpty ? "" : "?"+query.joined(separator:"&"))"
        case "ethereum": return "ethereum:\(v(values,"address"))"
        case "crypto": return v(values,"address")
        case "url": return v(values,"url")
        case "payload":
            switch v(values,"kind") {
            case "wifi": return "WIFI:T:WPA;S:\(escapeQR(v(values,"a")));P:\(escapeQR(v(values,"b")));H:false;"
            case "email": return "mailto:\(v(values,"a"))?subject=\(encodeQRComponent(v(values,"b")))&body=\(encodeQRComponent(v(values,"c")))"
            case "phone": return "tel:\(v(values,"a"))"
            case "sms": return "sms:\(v(values,"a"))?body=\(encodeQRComponent(v(values,"b")))"
            case "geo": return "geo:\(v(values,"a").isEmpty ? "0" : v(values,"a")),\(v(values,"b").isEmpty ? "0" : v(values,"b"))"
            default: return v(values,"a")
            }
        default: return v(values,"text")
        }
    }

    static func execute(toolID:String,values:[String:String]) throws -> NativeBarcodeExecution {
        if validatorIDs.contains(toolID) { return NativeBarcodeExecution(text:try run(toolID:toolID,input:v(values,"value"))) }
        if let message=qrInputError(toolID:toolID,values:values) { throw NativeNativeError.message(message) }
        switch presetMap[toolID] ?? "" {
        case "size": let modules=Double(v(values,"modules")) ?? 21, px=Double(v(values,"modulePx")) ?? 4; return NativeBarcodeExecution(text:"\(Int(modules)) modules × \(px)px = \(modules*px)px before quiet-zone margin.")
        case "version": let text=v(values,"text"), level=v(values,"level").isEmpty ? "M" : v(values,"level"); return NativeBarcodeExecution(text:"Estimated QR version: \(approximateVersion(text.count,level:level)) for \(level) error correction. Actual version depends on encoding mode and content.")
        case "capacity": let version=Int(v(values,"version")) ?? 1, level=v(values,"level").isEmpty ? "M" : v(values,"level"), factor:[String:Double] = ["L":1,"M":0.8,"Q":0.65,"H":0.5]; return NativeBarcodeExecution(text:"Approximate alphanumeric capacity for version \(version) / \(level): about \(max(10,Int(Double(version*version*18)*(factor[level] ?? 0.8))) characters. This is a planning estimate, not the QR standard's exact byte table.")
        case "inspect": let payload=v(values,"payload"); return NativeBarcodeExecution(text:"Detected payload type: \(payloadKind(payload)). Length: \(payload.count) characters.")
        case "batch":
            let items=v(values,"items").components(separatedBy:.newlines).map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{!$0.isEmpty}
            let images=try items.map{try generateFull(toolID:"qr-generator",input:$0,size:320,dark:"#16181d",light:"#ffffff")}
            return NativeBarcodeExecution(text:"Generated \(images.count) QR codes locally.",images:images)
        default: break
        }
        let payload=presetMap[toolID] == nil ? v(values,"value") : payloadFor(toolID,values:values)
        let image=try generateFull(toolID:toolID,input:payload,size:Int(v(values,"size")) ?? 512,dark:v(values,"dark").isEmpty ? "#16181d" : v(values,"dark"),light:v(values,"light").isEmpty ? "#ffffff" : v(values,"light"))
        if toolID == "qr-data-url-generator" {
            guard let data=image.pngData() else { throw NativeNativeError.message("Could not encode PNG data.") }
            let uri="data:image/png;base64,\(data.base64EncodedString())"
            return NativeBarcodeExecution(text:"Generated QR data URL (\(uri.count) characters).",images:[image],exportText:uri,exportName:"env-qr-data-url.txt")
        }
        if toolID == "qr-svg-generator" || toolID == "barcode-svg-generator" {
            guard let data=image.pngData() else { throw NativeNativeError.message("Could not encode PNG data.") }
            let svg="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(Int(image.size.width)) \(Int(image.size.height))\"><image width=\"100%\" height=\"100%\" href=\"data:image/png;base64,\(data.base64EncodedString())\"/></svg>"
            return NativeBarcodeExecution(text:"Generated SVG locally · \(payload.count) payload characters.",images:[image],exportText:svg,exportName:"env-code.svg")
        }
        let labeled=toolID == "barcode-label-generator" ? addHumanLabel(image,payload) : image
        return NativeBarcodeExecution(text:toolID == "barcode-label-generator" ? "Label: \(payload)\nGenerated locally on this device." : "Generated locally on this device.",images:[labeled])
    }

    private static func qrInputError(toolID:String,values:[String:String])->String? {
        func req(_ key:String,_ label:String)->String? { v(values,key).trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? "Enter \(label)." : nil }
        func phone(_ key:String)->String? { req(key,"a phone number") ?? (v(values,key).filter(\.isNumber).count >= 3 ? nil : "Enter a valid phone number.") }
        func email(_ key:String)->String? { req(key,"an email address") ?? (v(values,key).range(of:"^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",options:.regularExpression) != nil ? nil : "Enter a valid email address.") }
        func coordinate(_ key:String,_ label:String,_ low:Double,_ high:Double)->String? { guard let n=Double(v(values,key)) else { return "Enter \(label)." }; return n >= low && n <= high ? nil : "\(label) must be between \(Int(low)) and \(Int(high))." }
        guard let preset=presetMap[toolID] else { return req("value","a value to encode") }
        switch preset {
        case "size": return (Double(v(values,"modules")) ?? 21) > 0 && (Double(v(values,"modulePx")) ?? 4) > 0 ? nil : "Modules and module size must be positive numbers."
        case "version": return req("text","a QR payload to estimate")
        case "capacity": let n=Int(v(values,"version")) ?? 1; return (1...40).contains(n) && ["L","M","Q","H"].contains(v(values,"level").isEmpty ? "M" : v(values,"level")) ? nil : "Choose a QR version from 1 to 40 and a valid error-correction level."
        case "inspect": return req("payload","a QR payload to inspect")
        case "batch": let count=v(values,"items").components(separatedBy:.newlines).filter{!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}.count; return count == 0 ? "Enter at least one value." : count > 50 ? "Batch generation is limited to 50 values at a time." : nil
        case "text","high-error","low-error","styled","svg","data-url": return req("text","something to encode")
        case "url": guard let parts=URLComponents(string:v(values,"url")), parts.scheme != nil, parts.host != nil else { return "Enter a complete URL including https://." }; return nil
        case "wifi": return req("ssid","a network name") ?? (v(values,"security") != "nopass" ? req("password","a Wi-Fi password or choose No password") : nil)
        case "whatsapp","phone","sms": return phone("phone")
        case "email": return email("to")
        case "vcard","mecard": return req("name","a contact name")
        case "geo": return coordinate("lat","Latitude",-90,90) ?? coordinate("lng","Longitude",-180,180)
        case "event","calendar": return req("title","an event title") ?? req("start","a start time") ?? req("end","an end time")
        case "bitcoin": if req("address","a Bitcoin address") != nil { return "Enter a Bitcoin address." }; if let amount=Double(v(values,"amount")), amount < 0 { return "Amount must be a non-negative number." }; return nil
        case "ethereum","crypto": return req("address","a wallet address")
        case "payload": switch v(values,"kind") { case "wifi": return req("a","a network name"); case "email": return email("a"); case "phone","sms": return phone("a"); case "geo": return coordinate("a","Latitude",-90,90) ?? coordinate("b","Longitude",-180,180); default: return req("a","a payload value") }
        default: return nil
        }
    }

    private static func approximateVersion(_ length:Int,level:String)->Int { let factor:Double=level == "H" ? 0.7 : level == "Q" ? 0.78 : level == "M" ? 0.88 : 1; return min(40,max(1,Int(ceil(Double(length)/(factor*20))))) }
    private static func payloadKind(_ p:String)->String { if p.hasPrefix("WIFI:"){return "Wi-Fi"}; if p.hasPrefix("BEGIN:VCARD"){return "vCard"}; if p.hasPrefix("BEGIN:VEVENT"){return "Calendar event"}; if p.hasPrefix("mailto:"){return "Email"}; if p.hasPrefix("tel:"){return "Phone"}; if p.hasPrefix("sms:"){return "SMS"}; if p.hasPrefix("geo:"){return "Location"}; if p.hasPrefix("bitcoin:"){return "Bitcoin payment"}; if p.lowercased().hasPrefix("http://") || p.lowercased().hasPrefix("https://"){return "URL"}; return "Plain text" }

    private static func generateFull(toolID:String,input:String,size:Int,dark:String,light:String)throws->UIImage {
        guard !input.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else { throw NativeNativeError.message("Enter something to encode.") }
        if qrIDs.contains(toolID) {
            let filter=CIFilter(name:"CIQRCodeGenerator")!; filter.setValue(Data(input.utf8),forKey:"inputMessage")
            filter.setValue(toolID == "qr-code-high-error-correction" ? "H" : toolID == "qr-code-low-error-correction" ? "L" : "M",forKey:"inputCorrectionLevel")
            guard var output=filter.outputImage else { throw NativeNativeError.message("The value could not be encoded.") }
            if toolID == "qr-code-styled" {
                let falseColor=CIFilter(name:"CIFalseColor")!; falseColor.setValue(output,forKey:"inputImage"); falseColor.setValue(CIColor(color:uiColor(dark,fallback:.black)),forKey:"inputColor0"); falseColor.setValue(CIColor(color:uiColor(light,fallback:.white)),forKey:"inputColor1"); output=falseColor.outputImage ?? output
            }
            let side=CGFloat(min(2048,max(128,size))); let scale=side/max(output.extent.width,output.extent.height)
            guard let cg=CIContext().createCGImage(output.transformed(by:CGAffineTransform(scaleX:scale,y:scale)),from:output.transformed(by:CGAffineTransform(scaleX:scale,y:scale)).extent) else { throw NativeNativeError.message("Could not render the generated code.") }
            return UIImage(cgImage:cg)
        }
        if ["ean13-barcode","ean8-barcode","upc-barcode","isbn-barcode"].contains(toolID) { return try generateEAN(toolID:toolID,input:input) }
        if toolID == "code128-barcode" || toolID == "barcode-label-generator" || toolID == "barcode-svg-generator" {
            guard let filter=CIFilter(name:"CICode128BarcodeGenerator") else { throw NativeNativeError.message("Code 128 is unavailable on this iOS version.") }
            filter.setValue(Data(input.utf8),forKey:"inputMessage"); guard let output=filter.outputImage else { throw NativeNativeError.message("The value could not be encoded.") }
            let transformed=output.transformed(by:CGAffineTransform(scaleX:3,y:3)); guard let cg=CIContext().createCGImage(transformed,from:transformed.extent) else { throw NativeNativeError.message("Could not render the barcode.") }; return UIImage(cgImage:cg)
        }
        let pattern=try linearPattern(toolID:toolID,input:input)
        return renderFullBars(pattern)
    }

    private static func linearPattern(toolID:String,input:String)throws->String {
        let clean=input.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:" ",with:"").replacingOccurrences(of:"-",with:"")
        if toolID == "msi-barcode" {
            guard !clean.isEmpty && clean.allSatisfy(\.isNumber) else { throw NativeNativeError.message("MSI accepts digits only.") }
            return "110" + clean.map{String($0.wholeNumberValue!,radix:2).leftPadded(to:4,with:"0").map{$0 == "0" ? "100" : "110"}.joined()}.joined() + "1001"
        }
        if toolID == "pharmacode-barcode" {
            guard var number=Int(clean), (3...131070).contains(number) else { throw NativeNativeError.message("Pharmacode must be an integer from 3 to 131070.") }
            var result=""; while number != 0 { if number%2 == 0 { result="11100"+result; number=(number-2)/2 } else { result="100"+result; number=(number-1)/2 } }; return String(result.dropLast(2))
        }
        if toolID == "itf14-barcode" {
            var digits=clean
            guard digits.count == 13 || digits.count == 14, digits.allSatisfy(\.isNumber) else { throw NativeNativeError.message("ITF-14 requires 13 data digits or 14 digits with a check digit.") }
            if digits.count == 13 { digits += String(checkDigit(String(digits),ean:false)) } else if Int(String(digits.last!)) != checkDigit(String(digits.dropLast())) { throw NativeNativeError.message("ITF-14 check digit is invalid.") }
            let table=["NNWWN","WNNNW","NWNNW","WWNNN","NNWNW","WNWNN","NWWNN","NNNWW","WNNWN","NWNWN"]
            let values=Array(digits).compactMap(\.wholeNumberValue); var result="1010"
            for pair in stride(from:0,to:values.count,by:2) { let bars=Array(table[values[pair]]), spaces=Array(table[values[pair+1]]); for i in 0..<5 { result += bars[i] == "W" ? "111" : "1"; result += spaces[i] == "W" ? "000" : "0" } }
            return result+"1101"
        }
        if toolID == "codabar-barcode" {
            var text=clean.uppercased(); if text.first.map({"ABCD".contains($0)}) != true || text.last.map({"ABCD".contains($0)}) != true { text="A"+text+"A" }
            let table:[Character:String]=["0":"101010011","1":"101011001","2":"101001011","3":"110010101","4":"101101001","5":"110101001","6":"100101011","7":"100101101","8":"100110101","9":"110100101","-":"101001101","$":"101100101",":":"1101011011","/":"1101101011",".":"1101101101","+":"1011011011","A":"1011001001","B":"1001001011","C":"1010010011","D":"1010011001"]
            guard text.count >= 3, text.allSatisfy({table[$0] != nil}) else { throw NativeNativeError.message("Codabar accepts digits, - $ : . / + and A–D start/stop characters.") }
            return text.enumerated().map{table[$0.element]! + ($0.offset == text.count-1 ? "" : "0")}.joined()
        }
        if toolID == "code39-barcode" {
            let chars=Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*"); let enc:[Int]=[20957,29783,23639,30485,20951,29813,23669,20855,29789,23645,29975,23831,30533,22295,30149,24005,21623,29981,23837,22301,30023,23879,30545,22343,30161,24017,21959,30065,23921,22385,29015,18263,29141,17879,29045,18293,17783,29021,18269,17477,17489,17681,20753,35770]
            let text="*"+clean.uppercased()+"*"; guard text.allSatisfy({chars.contains($0)}) else { throw NativeNativeError.message("Code 39 accepts uppercase letters, digits, spaces and - . $ / + %.") }
            return text.enumerated().map{index,char in let value=enc[chars.firstIndex(of:char)!]; let bits=String(value,radix:2).leftPadded(to:12,with:"0"); return bits+(index == text.count-1 ? "" : "0")}.joined()
        }
        throw NativeNativeError.message("This barcode format is not supported.")
    }

    private static func renderFullBars(_ pattern:String)->UIImage {
        let unit:CGFloat=3, quiet:CGFloat=18, height:CGFloat=210
        return UIGraphicsImageRenderer(size:CGSize(width:CGFloat(pattern.count)*unit+quiet*2,height:height)).image { context in
            let rect=CGRect(origin:.zero,size:context.format.bounds.size); UIColor.white.setFill(); context.fill(rect); UIColor.black.setFill()
            for (index,bit) in pattern.enumerated() where bit == "1" { context.fill(CGRect(x:quiet+CGFloat(index)*unit,y:10,width:unit,height:height-20)) }
        }
    }

    private static func addHumanLabel(_ image:UIImage,_ label:String)->UIImage {
        let size=CGSize(width:image.size.width,height:image.size.height+40)
        return UIGraphicsImageRenderer(size:size).image { context in UIColor.white.setFill(); context.fill(CGRect(origin:.zero,size:size)); image.draw(in:CGRect(x:0,y:0,width:image.size.width,height:image.size.height)); let style=NSMutableParagraphStyle(); style.alignment = .center; (String(label.prefix(64)) as NSString).draw(in:CGRect(x:4,y:image.size.height+8,width:size.width-8,height:28),withAttributes:[.font:UIFont.monospacedSystemFont(ofSize:14,weight:.regular),.foregroundColor:UIColor.black,.paragraphStyle:style]) }
    }

    private static func uiColor(_ hex:String,fallback:UIColor)->UIColor {
        var text=hex.trimmingCharacters(in:CharacterSet(charactersIn:"# ")); if text.count == 3 { text=String(text.map{[$0,$0]}.joined()) }
        guard text.count == 6, let value=UInt32(text,radix:16) else { return fallback }
        return UIColor(red:CGFloat((value>>16)&255)/255,green:CGFloat((value>>8)&255)/255,blue:CGFloat(value&255)/255,alpha:1)
    }
}

private extension String {
    func leftPadded(to length:Int,with character:Character)->String { String(repeating:String(character),count:max(0,length-count))+self }
}
