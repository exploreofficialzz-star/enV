import SwiftUI
import AVFoundation
import AVKit
import AudioToolbox
import UIKit
import WebKit
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
    private var parentDeveloperStudio: Tool? { store.catalog.developerStudio(forLegacyTool: tool) }
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

                if let parentDeveloperStudio {
                    NavigationLink(value: parentDeveloperStudio) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                enVCharacterSpacedText("Part of \(parentDeveloperStudio.name)")
                                    .font(.envScaled(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.envInk)
                                enVCharacterSpacedText("Switch between related local developer tasks in the grouped Studio workspace.")
                                    .font(.envScaled(size: 12, weight: .regular))
                                    .foregroundStyle(Color.envMuted)
                            }
                            Spacer(minLength: 8)
                            enVCharacterSpacedText("Open Studio")
                                .font(.envScaled(size: 13, weight: .semibold))
                                .foregroundStyle(Color.envAccent)
                            EnVIcon(name: "ArrowRight", size: 16, tint: .envAccent)
                        }
                        .padding(14)
                        .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder.opacity(0.6), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 16)
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
                    if tool.category == "accessibility" {
                        enVCharacterSpacedText("Each tool has a distinct job: checkers flag snippet issues, generators create starting output, helpers guide fixes, previews show examples, and simulators walk through user scenarios.")
                            .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envMuted)
                            .padding(.bottom, 10)
                    }
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
        case "audio": return NativeAudioEngine.supports(tool)
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
        case "calculator": return NativeAudioEngine.supports(tool) || NativeCalculatorEngine.operation(for: tool.id) != nil || NativeExpansionCalculatorEngine.operation(for: tool.id) != nil || NativeMathExerciseEngine.operation(for: tool.id) != nil
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
            case "audio": if tool.id == "music-live-video-studio" { NativeMusicLiveVideoStudioView() } else if NativeAudioEngine.supports(tool) { NativeAudioToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
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
            case "calculator": if NativeAudioEngine.supports(tool) { NativeAudioToolView(tool: tool) } else if NativeCalculatorEngine.operation(for: tool.id) != nil { NativeCalculatorToolView(tool: tool) } else if NativeExpansionCalculatorEngine.operation(for: tool.id) != nil { NativeExpansionCalculatorToolView(tool: tool) } else if NativeMathExerciseEngine.operation(for: tool.id) != nil { NativeMathExerciseToolView(tool: tool) } else { NativeUnavailableToolView(tool: tool, backend: false) }
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
    static func needsSecondInput(_ op:String) -> Bool { ["diff","regex","replace","compare","json-path","jsonpath","uuid-generator","uuid-batch","http-request-builder"].contains { op.localizedCaseInsensitiveContains($0) } }
    static func needsRegexFlags(_ op:String) -> Bool { op.localizedCaseInsensitiveContains("regex") }
    static func needsReplacement(_ op:String) -> Bool { op.localizedCaseInsensitiveContains("regex-replace") }
    static func isFileHash(_ op:String) -> Bool { op.localizedCaseInsensitiveContains("file-hash") }
    static func actionLabel(_ op:String) -> String {
        if op.localizedCaseInsensitiveContains("formatter") || op.localizedCaseInsensitiveContains("beautifier") { return "Format" }
        if op.localizedCaseInsensitiveContains("minifier") { return "Minify" }
        if op.localizedCaseInsensitiveContains("validator") { return "Validate" }
        if op.localizedCaseInsensitiveContains("regex-tester") { return "Test pattern" }
        if op.localizedCaseInsensitiveContains("encoder") { return "Encode" }
        if op.localizedCaseInsensitiveContains("decoder") { return "Decode" }
        if op.localizedCaseInsensitiveContains("generator") || op.localizedCaseInsensitiveContains("builder") { return "Generate" }
        if op.localizedCaseInsensitiveContains("parser") { return "Parse" }
        if op.localizedCaseInsensitiveContains("diff") || op.localizedCaseInsensitiveContains("compare") { return "Compare" }
        if op.localizedCaseInsensitiveContains("explainer") { return "Explain" }
        if op.localizedCaseInsensitiveContains("hash") { return "Calculate hash" }
        return "Run"
    }
    static func example(_ op:String) -> (input:String, secondary:String) {
        let lower=op.lowercased()
        let uuid="550e8400-e29b-41d4-a716-446655440000"
        let sha256="2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        let jwt="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJleGFtcGxlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9."
        if lower == "developer-recipe-runner" { return (#"{"input":"  <p>Hello   <strong>enV</strong> 🚀</p>\r\n","steps":[{"name":"Normalize line endings","op":"normalize-newlines"},{"name":"Remove paragraph tag","op":"replace-literal","find":"<p>","replacement":""},{"name":"Remove closing paragraph tag","op":"replace-literal","find":"</p>","replacement":""},{"name":"Collapse whitespace","op":"collapse-whitespace"},{"name":"Trim","op":"trim"}]}"#, "") }
        if lower.contains("file-hash") { return ("","") }
        if lower.contains("json-path") || lower.contains("jsonpath") { return ("{\"user\":{\"name\":\"Ada\"},\"items\":[{\"id\":1},{\"id\":2}]}", "$.items[0].id") }
        if lower.contains("json-diff") { return ("{\"name\":\"Ada\",\"active\":true}", "{\"name\":\"Ada Lovelace\",\"active\":true}") }
        if lower.contains("json") && lower.hasSuffix("-decoder") { return ("eyJuYW1lIjoiQWRhIiwiaXRlbXMiOlsxLDJdfQ==", "") }
        if lower.contains("hash-compare") || lower.contains("hash-diff") { return (sha256,sha256) }
        if lower.hasSuffix("-diff") { return ("before\nold-value\n", "after\nnew-value\n") }
        if lower.contains("json") { return ("{\"name\":\"Ada\",\"items\":[1,2],\"active\":true}", "") }
        if lower.contains("query-string-parser") || lower.contains("query-parser") { return ("q=one&q=two&space=hello+world","") }
        if lower.contains("query-string-builder") || lower.contains("url-query-builder") { return ("{\"q\":\"hello world\",\"tag\":[\"a\",\"b\"]}","") }
        if lower.contains("developer-sql-query-builder") || lower.contains("sql-query-builder") { return ("{\"table\":\"users\",\"columns\":[\"id\",\"email\"],\"filters\":[{\"column\":\"active\",\"operator\":\"=\",\"value\":true}],\"limit\":25}","") }
        if lower.contains("graphql-variables-builder") { return ("{\"id\":\"example-123\",\"active\":true}","") }
        if lower.contains("graphql-query-builder") { return ("Example","") }
        if lower.contains("api-mock-response") { return ("{\"id\":\"example-1\",\"message\":\"Mock response\"}","") }
        if lower.contains("webhook") && (lower.contains("generator") || lower.contains("builder")) { return ("order.paid","") }
        if lower.contains("jwt-claim-builder") || lower.contains("jwt-payload-generator") || lower=="jwt-encoder" || lower=="jwt-generator" { return ("{\"sub\":\"example-user\",\"iat\":1700000000,\"exp\":4102444800}","") }
        if lower.contains("jwt") { return (jwt,"") }
        if lower.contains("regex-replace") { return (#"\bcat\b"#, "cat CAT catalog") }
        if lower.contains("regex") { return (#"\bcat\b"#, "A cat, a CAT, and a catalog.") }
        if lower.contains("cron") && lower.hasSuffix("-decoder") { return ("Ki8xNSAqICogKiAq","") }
        if lower.contains("cron") { return ("*/15 * * * *","") }
        if lower.contains("timestamp") || lower.contains("epoch") { return ("1700000000","") }
        if lower.contains("uuid-generator") || lower.contains("uuid-batch-generator") { return ("","10") }
        if lower.contains("uuid-decoder") { return (uuid.replacingOccurrences(of:"-",with:""),"") }
        if lower.contains("uuid") { return (uuid,"") }
        if lower.contains("hash-compare") || lower.contains("hash-diff") { return (sha256,sha256) }
        if lower.contains("hash-decoder") { return (sha256,"") }
        if lower.contains("hash") && ["validator","tester","formatter","beautifier","minifier","parser","inspector"].contains(where:{lower.hasSuffix("-\($0)")}) { return (sha256,"") }
        if lower.contains("hash") { return ("hello","") }
        if lower.contains("base64") && ["decoder","formatter","beautifier","minifier","converter","parser","inspector","preview","validator","tester"].contains(where:{lower.hasSuffix("-\($0)")}) { return ("SGk=","") }
        if lower.contains("base64") { return ("enV 🚀 — local and private","") }
        if lower.contains("ascii") && ["decoder","validator","tester","parser"].contains(where:{lower.hasSuffix("-\($0)")}) { return ("72 105","") }
        if lower.contains("ascii") { return ("Hello","") }
        if lower.contains("binary") && ["decoder","validator","tester","parser"].contains(where:{lower.hasSuffix("-\($0)")}) { return ("01001000 01101001","") }
        if lower.contains("binary") { return ("Hi","") }
        if lower.contains("hex") && ["decoder","validator","tester","parser"].contains(where:{lower.hasSuffix("-\($0)")}) { return ("48 69","") }
        if lower.contains("hex") { return ("Hello","") }
        if lower.contains("unicode") && ["decoder","validator","tester"].contains(where:{lower.hasSuffix("-\($0)")}) { return (#"\u0041\u0020\ud83d\ude80"#,"") }
        if lower.contains("unicode") { return ("A 🚀","") }
        if ["docker","git","graphql","http","javascript","kubernetes","markdown","nginx","openapi","sql","typescript","yaml","csv","mime"].contains(where:{lower.hasPrefix("\($0)-") || lower.hasPrefix("developer-\($0)-")}) && lower.hasSuffix("-decoder") { return ("SGk=","") }
        if lower.contains("data-uri") && lower.contains("decoder") { return ("data:text/plain;base64,SGk=","") }
        if (lower.contains("html") || lower.contains("xml") || lower.contains("svg")) && lower.hasSuffix("-decoder") { return ("&lt;root&gt;Hi&lt;/root&gt;","") }
        if lower.contains("css") && lower.hasSuffix("-decoder") { return ("hello\\a world","") }
        if lower.contains("data-uri") { return ("Hello from enV","") }
        if (lower.contains("url") || lower.contains("uri")) && lower.contains("decoder") { return ("hello%20world%20%26%20tea","") }
        if (lower.contains("url") || lower.contains("uri")) && lower.contains("encoder") { return ("hello world & tea","") }
        if lower.contains("url") || lower.contains("uri") { return ("https://example.com/path?q=one&q=two#section","") }
        if lower.contains("cookie-parser") { return ("session=abc123; theme=dark; consent=yes","") }
        if lower.contains("header-builder") { return ("{\"Accept\":\"application/json\",\"X-Example\":\"enV\"}","") }
        if lower.contains("ip-header-parser") { return ("X-Forwarded-For: 192.0.2.1, 10.0.0.2","") }
        if lower.contains("status-code") || lower.contains("http-status") { return ("404","") }
        if lower.contains("mime") || lower.contains("content-type") { return ("json","") }
        if lower.contains("csv") && lower.hasSuffix("-decoder") { return ("SGk=","") }
        if lower.contains("csv") && ["validator","tester","parser","formatter","beautifier","minifier","inspector"].contains(where:{lower.hasSuffix("-\($0)")}) { return ("name,quote\nAda,\"Hello, world\"\nGrace,\"She said \"\"hi\"\"\"","") }
        if lower.contains("csv") { return ("[{\"name\":\"Ada\",\"age\":36},{\"name\":\"Grace\",\"age\":37}]","") }
        if lower.contains("xml") || lower.contains("html") || lower.contains("svg") { return ("<root><name>Ada</name></root>","") }
        if lower.contains("css") { return (".card { color: #0d9f8a; padding: 16px; }","") }
        if lower.contains("sql") { return ("SELECT id, name FROM users WHERE active = true ORDER BY name;","") }
        if lower.contains("yaml") { return ("app:\n  name: enV\n  enabled: true","") }
        if lower.contains("graphql") { return ("query Example($id: ID!) { user(id: $id) { id name } }","") }
        if lower.contains("markdown-to-html") { return ("# Hello\n\nA paragraph with **bold** and [a link](https://example.test).","") }
        if lower.contains("markdown") { return ("# Hello\n\nA paragraph with **bold**.","") }
        if lower.contains("gitignore") { return ("node","") }
        if lower.contains("docker") { return ("node","") }
        if lower.contains("nginx") { return ("server { listen 80; server_name example.test; }","") }
        if lower.contains("readme") { return ("enV Developer Studio","") }
        if lower.contains("environment-variable") { return ("APP_ENV\nAPI_BASE_URL\nLOG_LEVEL","") }
        if lower.contains("openapi") { return ("enV Example API","") }
        if lower.contains("branch-name") { return ("Add local hash utilities","") }
        if lower.contains("commit-message") { return ("fix: handle empty input safely","") }
        if lower.contains("changelog") { return ("Unreleased\nImprove local developer utilities\nFix invalid input errors","") }
        if lower.contains("user-agent") { return ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36","") }
        if lower.contains("http-request-builder") { return ("https://api.example.test/v1?q=hi","POST") }
        if lower.contains("http") && !lower.contains("encoder") && !lower.contains("decoder") { return ("GET /health HTTP/1.1\nHost: api.example.test\nAccept: application/json","") }
        if lower.contains("semantic-version") { return ("1.2.3 patch","") }
        return ("Example input for \(op)","")
    }
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

private struct NativeDeveloperStackPreset: Identifiable {
    let id: String
    let label: String
}

private struct NativeDeveloperToolView: View {
    @EnvironmentObject private var store: CatalogStore
    let tool:Tool
    @State private var studioModeKey = ""
    @State private var detectedHint: DeveloperInputHint?
    @State private var detectionMessage = ""
    @State private var encodingDirection = "encode"
    @State private var devopsPreset = "node"
    @State private var input=""
    @State private var secondary=""
    @State private var recipeSource="  <p>Hello   <strong>enV</strong> 🚀</p>\r\n"
    @State private var recipeSteps=["normalize-newlines", "replace-literal", "replace-literal", "collapse-whitespace", "trim"]
    @State private var recipeFind="<p>"
    @State private var recipeReplacementText=""
    @State private var recipePointer="/user/id"
    @State private var flags="g"
    @State private var replacement=""
    @State private var regexMode="test"
    @State private var sqlDialect="postgresql"
    @State private var output=""
    @State private var error:String?
    @State private var isExporting=false
    @State private var isImporting=false
    @State private var selectedFileName=""
    private var studioSpec: NativeDeveloperStudioSpec? { nativeDeveloperStudioSpecs.first { $0.id == tool.id || $0.slug == tool.slug } }
    private var selectedStudioMode: NativeDeveloperStudioMode? { studioSpec?.modes.first { $0.key == studioModeKey } ?? studioSpec?.modes.first }
    private var op:String {
        guard let mode = selectedStudioMode else { return tool.engine.op ?? tool.engine.id ?? tool.id }
        if encodingDirection == "decode", let decodeOp = mode.decodeOp { return decodeOp }
        return mode.op
    }
    private var activeTool: Tool {
        Tool(id: tool.id, name: tool.name, slug: tool.slug, description: tool.description, category: tool.category, subcategory: tool.subcategory,
             keywords: tool.keywords, tags: tool.tags, icon: tool.icon, popularity: tool.popularity, featured: tool.featured,
             clientSide: tool.clientSide, requiresBackend: tool.requiresBackend, requiresAuth: tool.requiresAuth, status: tool.status,
             disclaimer: tool.disclaimer, related: tool.related, engine: ToolEngine(type: tool.engine.type, id: tool.engine.id, op: op, configuration: tool.engine.configuration))
    }
    private var isFileHash:Bool { NativeDeveloperToolFormPolicy.isFileHash(op) }
    private var isRecipeRunner:Bool { op == "developer-recipe-runner" }
    private var isRegexStudio:Bool { op.localizedCaseInsensitiveContains("regex") && !op.localizedCaseInsensitiveContains("regex-generator") }
    private var isSQLFormatter:Bool { op.localizedCaseInsensitiveContains("sql") && (op.localizedCaseInsensitiveContains("formatter") || op.localizedCaseInsensitiveContains("beautifier")) }
    private var isDevopsPresetMode:Bool { studioSpec?.id == "devops-studio" && ["gitignore", "dockerfile"].contains(studioModeKey) }

    init(tool: Tool) {
        self.tool = tool
        let operation = tool.engine.op ?? tool.engine.id ?? tool.id
        _regexMode = State(initialValue: operation.localizedCaseInsensitiveContains("explainer") ? "flavors" : "test")
        let spec = nativeDeveloperStudioSpecs.first(where: { $0.id == tool.id || $0.slug == tool.slug })
        let storedMode = spec.flatMap { UserDefaults.standard.string(forKey: "env.developer.mode.\($0.id)") }
        let initialMode = spec?.modes.first(where: { $0.key == storedMode })?.key ?? spec?.modes.first?.key ?? ""
        _studioModeKey = State(initialValue: initialMode)
    }

    var body:some View {
        VStack(alignment:.leading,spacing:12) {
            Text("Runs entirely on this device. Nothing is uploaded.").font(.footnote).foregroundStyle(.secondary).frame(maxWidth:.infinity,alignment:.leading).padding(10).background(Color.envSurface2,in:RoundedRectangle(cornerRadius:10))
            if let studioSpec {
                Text(studioSpec.name).font(.title2.weight(.semibold)).foregroundStyle(Color.envInk)
                Text(studioSpec.description).font(.footnote).foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(studioSpec.modes) { mode in
                            Button(mode.label) { studioModeKey = mode.key; encodingDirection = "encode"; output = ""; error = nil }
                                .buttonStyle(.bordered).tint(studioModeKey == mode.key ? Color.envAccent : Color.envMuted)
                                .frame(minHeight: 40)
                        }
                    }.padding(.vertical, 2)
                }.accessibilityLabel("\(studioSpec.name) modes")
                if selectedStudioMode?.decodeOp != nil {
                    Picker("Encoding direction", selection: $encodingDirection) {
                        Text("Encode").tag("encode")
                        Text("Decode").tag("decode")
                    }.pickerStyle(.segmented)
                }
            }
            if isDevopsPresetMode {
                Text("Stack preset").font(.subheadline.weight(.semibold))
                let presets = [NativeDeveloperStackPreset(id:"node",label:"Node.js"), NativeDeveloperStackPreset(id:"python",label:"Python"), NativeDeveloperStackPreset(id:"go",label:"Go"), NativeDeveloperStackPreset(id:"java",label:"Java"), NativeDeveloperStackPreset(id:"rust",label:"Rust"), NativeDeveloperStackPreset(id:"swift",label:"Swift"), NativeDeveloperStackPreset(id:"android",label:"Android"), NativeDeveloperStackPreset(id:"static",label:"Static site"), NativeDeveloperStackPreset(id:"generic",label:"Generic")]
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(presets) { preset in
                            Button(preset.label) { devopsPreset = preset.id; output = ""; error = nil }
                                .buttonStyle(.bordered).tint(devopsPreset == preset.id ? Color.envAccent : Color.envMuted)
                                .frame(minHeight: 40)
                        }
                    }
                }
                Text("Selects stack-specific ignore rules or a starter container build. Review paths, commands, base images, and runtime assumptions before deployment.").font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 10) {
                Button("Detect from clipboard") {
                    // UIPasteboard is read only from this explicit, user-initiated action.
                    detectedHint = NativeDeveloperClipboardSuggest.suggestFromPasteboard()
                    if let clipboardText = UIPasteboard.general.string, !clipboardText.isEmpty {
                        input = clipboardText
                        detectionMessage = detectedHint == nil ? "Clipboard text copied into input; no confident Studio match found." : "Detected from clipboard locally. Nothing was uploaded."
                    } else {
                        detectedHint = nil
                        detectionMessage = "Clipboard has no readable text."
                    }
                }.buttonStyle(.bordered)
                Text("Reads clipboard only when tapped.").font(.caption).foregroundStyle(.secondary)
            }
            if !detectionMessage.isEmpty {
                Text(detectionMessage).font(.caption).foregroundStyle(.secondary)
            }
            if let detectedHint, let targetStudio = store.catalog.developerStudio(for: detectedHint.studioSlug) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Suggested: \(targetStudio.name) · \(detectedHint.modeKey)").font(.subheadline.weight(.semibold))
                    Text("\(detectedHint.reason) Confidence: \(detectedHint.confidence).").font(.caption).foregroundStyle(.secondary)
                    NavigationLink(value: targetStudio) {
                        Text("Open suggested Studio")
                    }
                    .buttonStyle(.bordered)
                    .simultaneousGesture(TapGesture().onEnded {
                        UserDefaults.standard.set(detectedHint.modeKey, forKey: "env.developer.mode.\(targetStudio.id)")
                    })
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 10))
            }
            HStack(spacing:10) {
                Button("Load example") {
                    let sample=NativeDeveloperToolFormPolicy.example(op)
                    if isRecipeRunner {
                        recipeSource="  <p>Hello   <strong>enV</strong> 🚀</p>\r\n"
                        recipeSteps=["normalize-newlines", "replace-literal", "replace-literal", "collapse-whitespace", "trim"]
                        recipeFind="<p>"; recipeReplacementText=""; recipePointer="/user/id"
                    } else if isDevopsPresetMode { input=""; secondary="" }
                    else { input=sample.input; secondary=sample.secondary }
                    flags=op.contains("regex") ? "gi" : "g"; replacement=op.contains("replace") ? "dog" : ""; regexMode="test"; sqlDialect="postgresql"; output=""; error=nil
                }.buttonStyle(.bordered)
                Text("Text tools process locally on this device.").font(.caption).foregroundStyle(.secondary)
            }
            if isFileHash {
                HStack(spacing:10) {
                    Button("Choose local file") { isImporting=true }.buttonStyle(.bordered)
                    Text(selectedFileName.isEmpty ? "Select a file to hash locally" : selectedFileName).font(.footnote).lineLimit(2).truncationMode(.middle)
                }
            }
            if isRecipeRunner {
                VStack(alignment:.leading,spacing:10) {
                    Text("Recipe Pipeline").font(.headline).foregroundStyle(Color.envTeal)
                    Text("Compose a deterministic, bounded transformation chain. Each step runs in order; inputs and intermediate output stay on this device.").font(.footnote).foregroundStyle(.secondary)
                    NativeDeveloperTextArea(title:"Source text",text:$recipeSource,placeholder:"Paste text, JSON, CSV, or encoded data…")
                    HStack {
                        Menu("Add step") {
                            ForEach(NativeDeveloperRecipe.supportedOperations,id: \.self) { operation in
                                Button(operation) { if recipeSteps.count < 16 { recipeSteps.append(operation) } }
                            }
                        }.disabled(recipeSteps.count >= 16)
                        Spacer()
                        Text("\(recipeSteps.count)/16 steps").font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(recipeSteps.indices,id: \.self) { index in
                        HStack(spacing:6) {
                            Text("\(index + 1). \(recipeSteps[index])").font(.system(.footnote,design:.monospaced)).frame(maxWidth:.infinity,alignment:.leading)
                            Button("↑") { if index > 0 { recipeSteps.swapAt(index,index - 1) } }.disabled(index == 0)
                            Button("↓") { if index + 1 < recipeSteps.count { recipeSteps.swapAt(index,index + 1) } }.disabled(index + 1 >= recipeSteps.count)
                            Button("×") { recipeSteps.remove(at:index) }.accessibilityLabel("Remove \(recipeSteps[index]) step")
                        }.buttonStyle(.borderless)
                    }
                    if recipeSteps.contains("replace-literal") {
                        NativeInputField(title:"Literal text to find",text:$recipeFind)
                        NativeInputField(title:"Replacement text (empty removes matches)",text:$recipeReplacementText)
                        Text("These values apply to each Replace Literal step in the native builder.").font(.caption).foregroundStyle(.secondary)
                    }
                    if recipeSteps.contains("json-pointer-get") { NativeInputField(title:"RFC 6901 JSON Pointer",text:$recipePointer) }
                    Button("Copy recipe JSON") {
                        do { UIPasteboard.general.string = try recipeConfiguration(); error = nil }
                        catch let caughtError { error = caughtError.localizedDescription }
                    }.buttonStyle(.bordered)
                }
            } else if isDevopsPresetMode {
                NativeDeveloperTextArea(title:"Optional stack override (blank uses \(devopsPreset))",text:$input,placeholder:"Leave blank to use the selected stack preset")
            } else {
                NativeDeveloperTextArea(title:isRegexStudio && regexMode == "pipeline" ? "Default pattern (unused by layers)" : op.contains("regex") ? "Regular expression" : "Input",text:$input,placeholder:"Paste your code, data, token, URL, or text here…")
            }
            if isRegexStudio {
                Picker("Regex Studio mode", selection:$regexMode) {
                    Text("Test / assertions").tag("test"); Text("Benchmark").tag("benchmark"); Text("Substitution pipeline").tag("pipeline"); Text("Format regex").tag("format"); Text("Flavor hints").tag("flavors")
                }.pickerStyle(.menu).accessibilityLabel("Regex Studio mode")
                Text("iOS uses Foundation ICU (NSRegularExpression). Conservative risk checks and bounded workloads are used; a single in-process match cannot be force-cancelled, so risky near-miss cases are skipped.").font(.footnote).foregroundStyle(.secondary)
            }
            if (!isRegexStudio && NativeDeveloperToolFormPolicy.needsSecondInput(op)) || (isRegexStudio && ["test", "benchmark", "pipeline"].contains(regexMode)) {
                NativeDeveloperTextArea(title:isRegexStudio && regexMode == "pipeline" ? "Pipeline JSON (input + ordered layers)" : isRegexStudio && regexMode == "benchmark" ? "Test strings JSON" : isRegexStudio ? "Test text or batch JSON" : op.contains("json-path") || op.contains("jsonpath") ? "JSON path (e.g. $.items[0].id)" : op.contains("uuid") ? "Batch count" : "Second input",text:$secondary)
            }
            if isSQLFormatter {
                Picker("SQL dialect", selection:$sqlDialect) { Text("Generic SQL").tag("sql"); Text("PostgreSQL").tag("postgresql"); Text("MySQL").tag("mysql"); Text("MariaDB").tag("mariadb"); Text("SQLite").tag("sqlite"); Text("SQL Server / T-SQL").tag("transactsql"); Text("BigQuery").tag("bigquery"); Text("Snowflake").tag("snowflake"); Text("Oracle").tag("oracle"); Text("Redshift").tag("redshift"); Text("DuckDB").tag("duckdb") }.pickerStyle(.menu).accessibilityLabel("SQL dialect")
                Text("Uses a local dialect-aware lexer, not a full SQL grammar parser or query validator.").font(.footnote).foregroundStyle(.secondary)
            }
            if isRegexStudio || NativeDeveloperToolFormPolicy.needsRegexFlags(op) {
                Text("Regex flags").font(.subheadline.weight(.semibold))
                HStack(spacing: 8) {
                    ForEach(Array("gimsu"), id: \.self) { flag in
                        Button(String(flag)) {
                            if flags.contains(flag) { flags.removeAll(where: { $0 == flag }) }
                            else { flags.append(flag) }
                        }
                        .buttonStyle(.bordered).tint(flags.contains(flag) ? Color.envAccent : Color.envMuted)
                        .frame(minHeight: 40)
                    }
                }
                NativeInputField(title:"Flags (editable; ICU regex semantics)",text:$flags)
            }
            if (isRegexStudio && ["test", "benchmark"].contains(regexMode)) || (!isRegexStudio && NativeDeveloperToolFormPolicy.needsReplacement(op)) { NativeInputField(title:"Replacement preview (optional)",text:$replacement) }
            if isRegexStudio && regexMode == "test" && !secondary.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Live match preview").font(.subheadline.weight(.semibold))
                    Text("Engine: NSRegularExpression (ICU) · bounded sample; engine behavior differs from JavaScript RegExp.").font(.caption).foregroundStyle(.secondary)
                    if let result = regexPreviewResult, let data = result.data {
                        Text(highlightedPreview(from: data))
                            .font(.system(.body, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 8))
                        if let first = (data["matches"] as? [[String: Any]])?.first,
                           let groups = first["groups"] as? [[String: Any]], !groups.isEmpty {
                            Text("Capture groups").font(.subheadline.weight(.semibold))
                            ForEach(Array(groups.prefix(12).enumerated()), id: \.offset) { entry in
                                let group = entry.element
                                let index = group["groupIndex"] as? Int ?? 0
                                let name = (group["groupName"] as? String).map { " · \($0)" } ?? ""
                                let value = group["text"] as? String ?? "(unmatched)"
                                Text("group \(index)\(name): \(value)").font(.system(.caption, design: .monospaced))
                            }
                        }
                        let matchCount = data["matchCount"] as? Int ?? 0
                        let truncated = data["truncated"] as? Bool ?? false
                        Text("\(matchCount) match(es)\(truncated ? " · preview capped at 100" : "")").font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text(regexPreviewResult?.error ?? "Enter a pattern and sample text to see highlighted matches.").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            HStack(spacing:10) {
                Button(isRecipeRunner ? "Run recipe" : isRegexStudio ? (regexMode == "test" ? "Run tests" : regexMode == "benchmark" ? "Benchmark" : regexMode == "pipeline" ? "Run pipeline" : regexMode == "format" ? "Format regex" : "Analyze flavors") : NativeDeveloperToolFormPolicy.actionLabel(op),action:run).buttonStyle(.borderedProminent)
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
        .onChange(of: studioModeKey) { newValue in
            if let studioSpec { UserDefaults.standard.set(newValue, forKey: "env.developer.mode.\(studioSpec.id)") }
        }
        .onChange(of: input) { newValue in
            detectedHint = NativeDeveloperSmartDetect.detect(newValue)
            detectionMessage = detectedHint == nil ? "" : "Detected a likely input type locally."
        }
        .fileImporter(isPresented:$isImporting,allowedContentTypes:[.data],allowsMultipleSelection:false) { result in
            do {
                let urls=try result.get()
                guard let url=urls.first else { throw NativeSimpleError.message("No file was selected.") }
                let gotAccess=url.startAccessingSecurityScopedResource()
                defer { if gotAccess { url.stopAccessingSecurityScopedResource() } }
                let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
                let size=(attributes[.size] as? NSNumber)?.int64Value ?? 0
                guard size <= 2 * 1024 * 1024 * 1024 else { throw NativeSimpleError.message("File exceeds the 2 GiB local hashing safety limit.") }
                let data=try Data(contentsOf:url,options:.mappedIfSafe)
                output=NativeUtilityEngine.hashDeveloperFileData(op:op,data:data)
                selectedFileName=url.lastPathComponent; error=nil
            } catch let caughtError { output=""; error=caughtError.localizedDescription }
        }
        .fileExporter(isPresented:$isExporting,document:NativePlainTextDocument(text:output),contentType:.plainText,defaultFilename:"env-\(op).txt") { result in
            if case let .failure(caughtError)=result { error=caughtError.localizedDescription }
        }
    }

    private var regexPreviewResult: (data: [String: Any]?, error: String?)? {
        guard isRegexStudio, regexMode == "test", !input.isEmpty, !secondary.isEmpty else { return nil }
        do {
            let raw = try NativeRegexHighlight.build(pattern: input, sample: secondary, flags: flags)
            guard let data = raw.data(using: .utf8), let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return (nil, "Could not decode the bounded regex preview.")
            }
            return (object, nil)
        } catch { return (nil, error.localizedDescription) }
    }

    private func highlightedPreview(from data: [String: Any]) -> AttributedString {
        let segments = data["segments"] as? [[String: Any]] ?? []
        var combined = AttributedString()
        for segment in segments {
            var item = AttributedString(segment["text"] as? String ?? "")
            if segment["isMatch"] as? Bool == true {
                item.foregroundColor = Color.envInk
                item.backgroundColor = Color.envAccent.opacity(0.25)
                item.font = .system(.body, design: .monospaced).bold()
            }
            combined.append(item)
        }
        return combined
    }

    private func recipeConfiguration() throws -> String {
        let steps:[[String:Any]] = recipeSteps.enumerated().map { index, operation in
            var step:[String:Any] = ["name":"\(index + 1). \(operation)", "op":operation]
            if operation == "replace-literal" { step["find"] = recipeFind; step["replacement"] = recipeReplacementText }
            if operation == "json-pointer-get" { step["pointer"] = recipePointer }
            return step
        }
        let data = try JSONSerialization.data(withJSONObject:["input":recipeSource,"steps":steps],options:[.sortedKeys])
        guard let configuration=String(data:data,encoding:.utf8) else { throw NativeSimpleError.message("Could not encode recipe configuration as UTF-8.") }
        return configuration
    }

    private func run() {
        var options=[String:String]()
        if isRegexStudio || NativeDeveloperToolFormPolicy.needsSecondInput(op) { options["secondary"]=secondary }
        if isRegexStudio || NativeDeveloperToolFormPolicy.needsRegexFlags(op) { options["flags"]=flags }
        if isRegexStudio || NativeDeveloperToolFormPolicy.needsReplacement(op) { options["replacement"]=replacement }
        if isRegexStudio { options["mode"]=regexMode }
        if isSQLFormatter { options["dialect"]=sqlDialect }
        do {
            if isFileHash {
                if selectedFileName.isEmpty { throw NativeSimpleError.message("Choose a local file first. File bytes are never uploaded.") }
                return
            }
            let data=try JSONSerialization.data(withJSONObject:options,options:[.sortedKeys])
            let raw=String(data:data,encoding:.utf8) ?? "{}"
            let engineInput = isRecipeRunner ? try recipeConfiguration() : (isDevopsPresetMode && input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? devopsPreset : input)
            output=try NativeUtilityEngine.run(activeTool,input:engineInput,optionsJSON:raw).text; error=nil
        } catch let caughtError { output=""; error=caughtError.localizedDescription }
    }
    private func reset() { input=""; secondary=""; recipeSource=""; recipeSteps=[]; recipeFind=""; recipeReplacementText=""; recipePointer="/"; flags="g"; replacement=""; regexMode="test"; sqlDialect="postgresql"; output=""; error=nil; selectedFileName="" }
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

/// Pure PCM contracts for local native audio analysis/edit operations.
/// Native file-import and recording views can call these helpers directly.
enum NativeAudioDsp {
    static func peakAmplitude(_ samples: [Float]) -> Double {
        samples.reduce(0.0) { max($0, abs(Double($1))) }
    }

    static func rmsAmplitude(_ samples: [Float]) -> Double {
        guard !samples.isEmpty else { return 0 }
        return sqrt(samples.reduce(0.0) { $0 + Double($1) * Double($1) } / Double(samples.count))
    }

    static func dcOffset(_ samples: [Float]) -> Double {
        guard !samples.isEmpty else { return 0 }
        return samples.reduce(0.0) { $0 + Double($1) } / Double(samples.count)
    }

    static func amplitudeDbfs(_ amplitude: Double) -> Double {
        guard amplitude > 0, amplitude.isFinite else { return -.infinity }
        return 20 * log10(amplitude)
    }

    /// Soft gate only: this primitive is not a neural noise suppressor.
    static func noiseGate(_ samples: [Float], thresholdDB: Double = -42, attenuation: Double = 0) -> [Float] {
        let threshold = pow(10.0, thresholdDB / 20.0)
        return samples.map { sample in
            let value = Double(sample)
            let gain = abs(value) >= threshold ? 1.0 : attenuation + (1.0 - attenuation) * min(1.0, max(0.0, abs(value) / threshold))
            return Float(value * gain)
        }
    }

    static func reverse(_ samples: [Float]) -> [Float] { Array(samples.reversed()) }

    /// Leaves headroom before integer PCM export.
    static func normalizePeak(_ samples: [Float], targetPeak: Double = 0.98) -> [Float] {
        let peak = peakAmplitude(samples)
        guard peak > 0 else { return samples }
        let gain = targetPeak / peak
        return samples.map { Float(Double($0) * gain) }
    }

    static func toMono(_ channels: [[Float]]) throws -> [Float] {
        guard let first = channels.first else { throw NativeSimpleError.message("At least one channel is required.") }
        guard channels.allSatisfy({ $0.count == first.count }) else { throw NativeSimpleError.message("All channels must have the same frame count.") }
        return first.indices.map { frame in (channels.reduce(0.0) { $0 + Double($1[frame]) } / Double(channels.count)).asFloat }
    }

    static func totalSilentDurationSeconds(channels: [[Float]], sampleRateHz: Int, thresholdDB: Double = -60) throws -> Double {
        guard sampleRateHz > 0 else { throw NativeSimpleError.message("Sample rate must be positive.") }
        guard let first = channels.first else { throw NativeSimpleError.message("At least one channel is required.") }
        guard channels.allSatisfy({ $0.count == first.count }) else { throw NativeSimpleError.message("All channels must have the same frame count.") }
        let threshold = pow(10.0, thresholdDB / 20.0)
        let silentFrames = first.indices.reduce(0) { count, frame in
            count + (channels.allSatisfy { abs(Double($0[frame])) < threshold } ? 1 : 0)
        }
        return Double(silentFrames) / Double(sampleRateHz)
    }

    static func trim(_ samples: [Float], sampleRateHz: Int, startSeconds: Double, endSeconds: Double) throws -> [Float] {
        guard sampleRateHz > 0, startSeconds.isFinite, endSeconds.isFinite, startSeconds >= 0, endSeconds > startSeconds else {
            throw NativeSimpleError.message("Trim range must have a non-negative start and a larger end.")
        }
        let start = Int((startSeconds * Double(sampleRateHz)).rounded(.down))
        let end = Int((endSeconds * Double(sampleRateHz)).rounded(.down))
        guard start < samples.count, end <= samples.count else { throw NativeSimpleError.message("Trim range exceeds the decoded audio duration.") }
        return Array(samples[start..<end])
    }

    static func fade(_ samples: [Float], sampleRateHz: Int, durationMs: Double, fadeIn: Bool) throws -> [Float] {
        guard sampleRateHz > 0, durationMs.isFinite, durationMs > 0 else { throw NativeSimpleError.message("Sample rate and fade duration must be positive.") }
        guard !samples.isEmpty else { return samples }
        let fadeFrames = min(samples.count, max(1, Int(durationMs * Double(sampleRateHz) / 1000)))
        var output = samples
        for i in 0..<fadeFrames {
            let fraction = fadeFrames <= 1 ? 1.0 : Double(i) / Double(fadeFrames - 1)
            let index = fadeIn ? i : samples.count - fadeFrames + i
            output[index] = Float(Double(samples[index]) * (fadeIn ? fraction : 1 - fraction))
        }
        return output
    }

    /// One-pole high-pass cleanup suitable for rumble reduction, not a neural denoiser.
    static func highPass(_ samples: [Float], sampleRateHz: Int, cutoffHz: Double = 80) throws -> [Float] {
        guard sampleRateHz > 0, cutoffHz.isFinite, cutoffHz >= 1, cutoffHz <= Double(sampleRateHz) / 2 else {
            throw NativeSimpleError.message("High-pass cutoff must be within the Nyquist range.")
        }
        let rc = 1.0 / (2 * Double.pi * cutoffHz)
        let alpha = rc / (rc + 1.0 / Double(sampleRateHz))
        var previousInput = 0.0, previousOutput = 0.0
        return samples.map { sample in
            let input = Double(sample)
            let output = alpha * (previousOutput + input - previousInput)
            previousInput = input; previousOutput = output
            return Float(output)
        }
    }

    static func noiseReduce(_ samples: [Float], sampleRateHz: Int, cutoffHz: Double = 80, thresholdDB: Double = -48, attenuation: Double = 0.12) throws -> [Float] {
        guard thresholdDB.isFinite, (-100...0).contains(thresholdDB), attenuation.isFinite, (0...1).contains(attenuation) else {
            throw NativeSimpleError.message("Noise-reduction controls are out of range.")
        }
        return noiseGate(try highPass(samples, sampleRateHz: sampleRateHz, cutoffHz: cutoffHz), thresholdDB: thresholdDB, attenuation: attenuation)
    }

    /// Cascaded mains-frequency notch filters; choose the local 50/60 Hz power frequency.
    static func humReduce(_ samples: [Float], sampleRateHz: Int, mainsFrequency: Int = 50) throws -> [Float] {
        guard sampleRateHz > 0, [50, 60].contains(mainsFrequency) else { throw NativeSimpleError.message("Choose 50 or 60 Hz and a positive sample rate.") }
        var current = samples
        for frequency in [mainsFrequency, mainsFrequency * 2].filter({ Double($0) < Double(sampleRateHz) / 2 }) {
            let w0 = 2 * Double.pi * Double(frequency) / Double(sampleRateHz)
            let alpha = sin(w0) / 24.0
            let a0 = 1 + alpha
            let b0 = 1 / a0, b1 = -2 * cos(w0) / a0, b2 = b0
            let a1 = -2 * cos(w0) / a0, a2 = (1 - alpha) / a0
            var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
            current = current.map { sample in
                let x = Double(sample)
                let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
                x2 = x1; x1 = x; y2 = y1; y1 = y
                return Float(y)
            }
        }
        return current
    }

    /// Three-band low/mid/high split EQ. This is a light offline primitive, not a mastering EQ.
    static func threeBandEQ(_ samples: [Float], sampleRateHz: Int, lowGainDB: Double = 0, midGainDB: Double = 0, highGainDB: Double = 0) throws -> [Float] {
        let gains = [lowGainDB, midGainDB, highGainDB]
        guard sampleRateHz > 0, gains.allSatisfy({ $0.isFinite && (-24...24).contains($0) }) else { throw NativeSimpleError.message("EQ gains must be between -24 and +24 dB.") }
        let lowA = min(1.0, max(0.0, 1 - exp(-2 * Double.pi * min(200, Double(sampleRateHz) * 0.2) / Double(sampleRateHz))))
        let midA = min(1.0, max(0.0, 1 - exp(-2 * Double.pi * min(2500, Double(sampleRateHz) * 0.4) / Double(sampleRateHz))))
        let gain = gains.map { pow(10.0, $0 / 20.0) }
        var lowState = 0.0, midState = 0.0
        return samples.map { sample in
            let input = Double(sample)
            lowState += lowA * (input - lowState); midState += midA * (input - midState)
            let low = lowState, mid = midState - lowState, high = input - midState
            return Float(low * gain[0] + mid * gain[1] + high * gain[2])
        }
    }

    /// Static-ratio compressor proxy. It has no attack/release envelope.
    static func compress(_ samples: [Float], thresholdDB: Double = -18, ratio: Double = 4, makeupDB: Double = 0) throws -> [Float] {
        guard thresholdDB.isFinite, (-60...0).contains(thresholdDB), ratio.isFinite, (1...20).contains(ratio), makeupDB.isFinite, (-24...24).contains(makeupDB) else {
            throw NativeSimpleError.message("Compressor settings are out of range.")
        }
        let threshold = pow(10.0, thresholdDB / 20), makeup = pow(10.0, makeupDB / 20)
        return samples.map { sample in
            let value = Double(sample), amplitude = abs(value)
            let compressed = amplitude <= threshold ? amplitude : threshold + (amplitude - threshold) / ratio
            return Float((value < 0 ? -compressed : compressed) * makeup)
        }
    }

    /// Resampling changes pitch and duration together; it is not pitch-locked time stretching.
    static func resampleAtPlaybackRate(_ samples: [Float], playbackRate: Double) throws -> [Float] {
        guard playbackRate.isFinite, (0.25...3).contains(playbackRate) else { throw NativeSimpleError.message("Playback rate must be between 0.25× and 3×.") }
        guard !samples.isEmpty else { return samples }
        let count = max(1, Int(Double(samples.count) / playbackRate))
        return (0..<count).map { i in
            let position = Double(i) * playbackRate
            let left = min(samples.count - 1, max(0, Int(position)))
            let right = min(samples.count - 1, left + 1)
            let fraction = position - Double(left)
            return Float(Double(samples[left]) * (1 - fraction) + Double(samples[right]) * fraction)
        }
    }

    /// RMS-derived proxy only; it is not an EBU R128 / BS.1770 integrated LUFS measurement.
    static func approximateLUFS(_ samples: [Float]) -> Double {
        let amplitude = rmsAmplitude(samples)
        return amplitude <= 0 ? -.infinity : -0.691 + 20 * log10(amplitude)
    }
}

private extension Double {
    var asFloat: Float { Float(self) }
}

/// Offline native audio estimates and platform guidance. Heavy stem AI and browser-only formats remain web-first.
enum NativeAudioEngine {
    private static let nativeWavOperations: [String: String] = [
        "audio-file-inspector": "inspector", "audio-duration-tool": "duration", "audio-trimmer": "trim", "audio-to-wav": "to-wav",
        "audio-peak-meter": "peak", "audio-rms-meter": "rms", "audio-silence-detector": "silence", "audio-dc-offset-checker": "dc-offset",
        "audio-to-mono": "mono", "audio-to-stereo": "stereo", "audio-reverser": "reverse", "audio-normalizer": "normalize",
        "voice-noise-reducer": "voice-noise-reducer", "voice-noise-gate": "voice-noise-gate", "audio-hum-reducer": "audio-hum-reducer",
        "audio-trim-silence": "audio-trim-silence", "audio-fade-in": "fade-in", "audio-fade-out": "fade-out", "audio-lufs-meter": "audio-lufs-meter",
        "audio-compressor": "audio-compressor", "audio-eq-simple": "audio-eq-simple", "audio-pitch-shift": "audio-pitch-shift", "audio-tempo-change": "audio-tempo-change",
        "audio-volume-control": "volume-local", "audio-sample-rate-converter": "resample-local", "audio-channel-converter": "channels-local", "audio-joiner-local": "joiner",
        "audio-tone-generator": "generate-tone", "audio-metronome": "generate-metronome"
    ]

    static func operation(for tool: Tool) -> String? {
        if tool.id == "music-live-video-studio" { return "live-video-studio" }
        if tool.id == "audio-recorder" { return "record-mic" }
        if let fileOp = nativeWavOperations[tool.id] { return "file:\(fileOp)" }
        if tool.id == "audio-calc-studio" { return "calc" }
        if tool.id == "audio-platform-guide-studio" { return "guide" }
        if tool.id == "audio-bitrate-calculator" { return "calc" }
        if tool.id == "audio-file-size-calculator" { return "calc" }
        if tool.id == "audio-duration-tool" { return "duration" }
        let op = tool.engine.op?.split(separator: ":").last.map(String.init) ?? ""
        if ["bitrate", "file-size", "bpm", "loudness", "sample-rate", "format-guide", "export-preset"].contains(op) { return op == "export-preset" ? "format-guide" : op }
        let id = tool.id
        if id.contains("bitrate-calculator") { return "bitrate" }
        if id.contains("file-size-calculator") { return "file-size" }
        if id.contains("bpm-helper") { return "bpm" }
        if id.contains("loudness-helper") { return "loudness" }
        if id.contains("sample-rate-helper") { return "sample-rate" }
        if id.contains("format-guide") || id.contains("export-preset") { return "format-guide" }
        return nil
    }

    static func supports(_ tool: Tool) -> Bool {
        (tool.engine.type == "audio" || ["audio-bitrate-calculator", "audio-file-size-calculator"].contains(tool.id)) && operation(for: tool) != nil
    }

    static func calculate(operation: String, platform: String, duration: Double, bitrate: Double, sampleRate: Double, channels: Int, bits: Int, bpm: Double, bars: Int, targetSizeMegabytes: Double = 0.96) throws -> String {
        guard duration.isFinite, duration > 0 else { throw NativeSimpleError.message("Duration must be positive.") }
        guard bitrate.isFinite, bitrate > 0 else { throw NativeSimpleError.message("Bitrate must be positive.") }
        guard sampleRate.isFinite, sampleRate > 0, (1...32).contains(channels), (8...64).contains(bits) else { throw NativeSimpleError.message("Sample rate, channel count or bit depth is invalid.") }
        let compressed = duration * bitrate * 1000 / 8
        let pcm = duration * sampleRate * Double(channels * bits) / 8
        let selected = platform.lowercased()
        switch operation {
        case "duration": return "Duration: \(String(format: "%.3f", duration)) seconds\nEstimated compressed size at selected bitrate: \(bytes(compressed))"
        case "bitrate": return "Estimated compressed file size: \(decimalMegabytes(compressed))\nBytes (decimal): \(String(format: "%.0f", compressed))\nFormula: duration × bitrate × 1,000 ÷ 8; container overhead is excluded."
        case "bitrate-from-size":
            guard targetSizeMegabytes.isFinite, targetSizeMegabytes > 0 else { throw NativeSimpleError.message("Target size must be a positive decimal MB value.") }
            let targetBytes = targetSizeMegabytes * 1_000_000
            let inferredKbps = targetBytes * 8 / duration / 1000
            return "Required average bitrate: \(String(format: "%.2f", inferredKbps)) kbps\nTarget size: \(decimalMegabytes(targetBytes))\nFormula: target bytes × 8 ÷ duration ÷ 1,000; container overhead is excluded."
        case "pcm-size": return "Estimated uncompressed PCM size: \(decimalMegabytes(pcm))\nFormula: duration × sample rate × channels × bit depth ÷ 8."
        case "file-size": return "Estimated compressed size at selected bitrate: \(decimalMegabytes(compressed))\nBytes (decimal): \(String(format: "%.0f", compressed))\nFormula: duration × bitrate × 1,000 ÷ 8; container overhead is excluded."
        case "bpm":
            guard bpm > 0, bars > 0 else { throw NativeSimpleError.message("BPM and bars must be positive.") }
            return "Beat duration: \(String(format: "%.3f", 60 / bpm)) seconds\n\(bars) bars in 4/4: \(String(format: "%.3f", 60 / bpm * 4 * Double(bars))) seconds"
        case "loudness":
            let note = selected == "spotify" ? "−14 LUFS is a playback-normalization reference, not a required mastering target." : selected == "podcast" ? "−16 LUFS stereo / −19 LUFS mono are common podcast targets." : "There is no universal loudness target for every delivery workflow."
            return "\(label(platform)) loudness guidance\n\(note)\nGuidance only — not an acceptance guarantee."
        case "sample-rate": return "Sample rate: \(String(format: "%.0f", sampleRate)) Hz\nSamples for selected duration: \(String(format: "%.0f", duration * sampleRate))\nPreserve the original master resolution unless the delivery workflow requires conversion."
        case "format-guide", "guide", "calc":
            let note: String
            switch selected {
            case "podcast": note = "44.1 or 48 kHz; MP3/AAC for distribution; WAV masters; 128–192 kbps stereo is common."
            case "discord": note = "Call/channel configuration affects voice quality; 44.1/48 kHz sources are common; Opus is used in voice paths."
            case "spotify": note = "Keep a lossless master (WAV/FLAC when requested); −14 LUFS is playback normalization, not a mastering requirement."
            case "instagram": note = "Keep a high-quality source; AAC is common in video delivery paths and services may transcode."
            case "apple-music", "apple music": note = "Follow the distributor's requested lossless delivery format and supported master resolution."
            default: note = "Keep a high-quality source and confirm the destination's current published delivery specifications."
            }
            return "\(label(platform)) audio guidance\n\(note)\nGuidance only — not an acceptance guarantee."
        default: throw NativeSimpleError.message("This native audio mode is not implemented offline.")
        }
    }

    private static func label(_ value: String) -> String { value.replacingOccurrences(of: "-", with: " ").capitalized }
    private static func decimalMegabytes(_ value: Double) -> String { String(format: "%.2f MB", value / 1_000_000) }
    private static func bytes(_ value: Double) -> String {
        var amount = value; let units = ["B", "KB", "MB", "GB", "TB"]; var index = 0
        while amount >= 1024 && index < units.count - 1 { amount /= 1024; index += 1 }
        return String(format: index == 0 ? "%.0f %@" : "%.2f %@", amount, units[index])
    }
}

struct NativeDecodedWav {
    let sampleRateHz: Int
    let channels: [[Float]]
    let sourceBits: Int
    let sourceEncoding: Int
    var frames: Int { channels.first?.count ?? 0 }
    var durationSeconds: Double { sampleRateHz > 0 ? Double(frames) / Double(sampleRateHz) : 0 }
}

struct NativeAudioWavResult {
    let report: String
    let outputWav: Data?
    let durationSeconds: Double?
}

/// Conservative, offline RIFF/WAVE PCM processor. Compressed media and neural stem separation remain web-first.
enum NativeAudioWavProcessor {
    private static let maxSourceBytes = 250 * 1024 * 1024
    private static let maxFloatSamples = 30_000_000

    static func decode(_ data: Data) throws -> NativeDecodedWav {
        guard data.count >= 44, data.count <= maxSourceBytes else { throw NativeSimpleError.message("Choose a WAV file between 44 bytes and 250 MB.") }
        let bytes = [UInt8](data)
        guard ascii(bytes, 0, 4) == "RIFF", ascii(bytes, 8, 4) == "WAVE" else {
            throw NativeSimpleError.message("This native offline tool currently accepts RIFF/WAVE audio. Use the browser-local tool for MP3, M4A or OGG.")
        }
        var offset = 12, format: Int?, channelCount: Int?, sampleRate: Int?, bits: Int?, blockAlign: Int?, dataStart: Int?, dataLength = 0
        while offset + 8 <= bytes.count {
            let id = ascii(bytes, offset, 4)
            let size = u32(bytes, offset + 4)
            guard Int(size) <= bytes.count - offset - 8 else { throw NativeSimpleError.message("The WAV contains a truncated or oversized chunk.") }
            let count = Int(size), start = offset + 8
            if id == "fmt " {
                guard count >= 16 else { throw NativeSimpleError.message("The WAV format chunk is incomplete.") }
                format = Int(u16(bytes, start)); channelCount = Int(u16(bytes, start + 2)); sampleRate = Int(u32(bytes, start + 4)); blockAlign = Int(u16(bytes, start + 12)); bits = Int(u16(bytes, start + 14))
            } else if id == "data", dataStart == nil { dataStart = start; dataLength = count }
            offset = start + count + (count & 1)
        }
        guard let encoding = format, let count = channelCount, let rate = sampleRate, let bitDepth = bits, let align = blockAlign, let start = dataStart else {
            throw NativeSimpleError.message("WAV format or data chunk is missing.")
        }
        guard (1...8).contains(count), (8_000...192_000).contains(rate) else { throw NativeSimpleError.message("Native WAV processing supports 1–8 channels and 8,000–192,000 Hz.") }
        guard encoding == 1 || encoding == 3, ((encoding == 1 && [8,16,24,32].contains(bitDepth)) || (encoding == 3 && bitDepth == 32)) else {
            throw NativeSimpleError.message("Supported samples are 8/16/24/32-bit PCM or 32-bit float WAV.")
        }
        let bytesPerSample = bitDepth / 8
        guard align >= count * bytesPerSample, align > 0, dataLength > 0, dataLength % align == 0 else { throw NativeSimpleError.message("WAV data chunk or block alignment is invalid.") }
        let frames = dataLength / align
        guard frames > 0, frames <= maxFloatSamples / count else { throw NativeSimpleError.message("This WAV exceeds the native memory safety limit. Choose a shorter excerpt.") }
        var channels = Array(repeating: [Float](repeating: 0, count: frames), count: count)
        for frame in 0..<frames {
            let base = start + frame * align
            for channel in 0..<count {
                let at = base + channel * bytesPerSample
                let value: Float
                if encoding == 3 { value = Float(bitPattern: u32(bytes, at)).isFinite ? Float(bitPattern: u32(bytes, at)) : 0 }
                else if bitDepth == 8 { value = Float(Int(bytes[at]) - 128) / 128 }
                else if bitDepth == 16 { value = Float(Int16(bitPattern: u16(bytes, at))) / 32768 }
                else if bitDepth == 24 {
                    var raw = Int32(bytes[at]) | (Int32(bytes[at + 1]) << 8) | (Int32(bytes[at + 2]) << 16)
                    if (raw & 0x800000) != 0 { raw |= ~0xFFFFFF }
                    value = Float(raw) / 8_388_608
                } else { value = Float(Double(Int32(bitPattern: u32(bytes, at))) / 2_147_483_648) }
                channels[channel][frame] = min(1, max(-1, value.isFinite ? value : 0))
            }
        }
        return NativeDecodedWav(sampleRateHz: rate, channels: channels, sourceBits: bitDepth, sourceEncoding: encoding)
    }

    static func generateTone(sampleRateHz: Int = 44_100, durationSeconds: Double = 2, frequencyHz: Double = 440, waveform: String = "sine", levelDBFS: Double = -12) throws -> NativeAudioWavResult {
        guard (8_000...192_000).contains(sampleRateHz) else { throw NativeSimpleError.message("Sample rate must be 8,000–192,000 Hz.") }
        guard durationSeconds.isFinite, (0.05...300).contains(durationSeconds) else { throw NativeSimpleError.message("Tone duration must be 0.05–300 seconds.") }
        guard frequencyHz.isFinite, frequencyHz >= 1, frequencyHz < Double(sampleRateHz) / 2 else { throw NativeSimpleError.message("Frequency must be positive and below Nyquist (\(sampleRateHz / 2) Hz).") }
        guard ["sine", "square", "saw", "noise"].contains(waveform) else { throw NativeSimpleError.message("Choose sine, square, saw or noise.") }
        guard levelDBFS.isFinite, (-60...0).contains(levelDBFS) else { throw NativeSimpleError.message("Level must be −60 to 0 dBFS.") }
        let frames = Int(durationSeconds * Double(sampleRateHz))
        guard frames > 0, frames <= maxFloatSamples else { throw NativeSimpleError.message("Generated tone exceeds the native sample limit.") }
        let amplitude = pow(10, levelDBFS / 20), fadeFrames = min(frames / 2, max(1, sampleRateHz / 100))
        let samples = (0..<frames).map { index -> Float in
            let phase = (frequencyHz * Double(index) / Double(sampleRateHz)).truncatingRemainder(dividingBy: 1)
            let sine = sin(2 * Double.pi * phase)
            let raw: Double
            switch waveform { case "sine": raw = sine; case "square": raw = sine >= 0 ? 1 : -1; case "saw": raw = 2 * phase - 1; default: raw = Double.random(in: -1...1) }
            let edge = min(1, max(0, min(Double(index + 1) / Double(fadeFrames), Double(frames - index) / Double(fadeFrames))))
            return Float(raw * amplitude * edge)
        }
        let encoded = try encodePCM16(sampleRateHz: sampleRateHz, channels: [samples])
        return NativeAudioWavResult(report: "Generated \(waveform) tone\nFrequency: \(String(format: "%.3f", frequencyHz)) Hz\nDuration: \(String(format: "%.3f", durationSeconds)) s\nLevel: \(levelDBFS) dBFS\nOutput: 16-bit PCM WAV with short edge fades.", outputWav: encoded, durationSeconds: durationSeconds)
    }

    static func generateMetronome(sampleRateHz: Int = 44_100, bpm: Double = 120, beatsPerBar: Int = 4, bars: Int = 4, denominator: Int = 4) throws -> NativeAudioWavResult {
        guard (8_000...192_000).contains(sampleRateHz), bpm.isFinite, (40...240).contains(bpm) else { throw NativeSimpleError.message("Sample rate must be 8,000–192,000 Hz and BPM must be 40–240.") }
        guard (1...12).contains(beatsPerBar), (1...100).contains(bars), [2,4,8].contains(denominator) else { throw NativeSimpleError.message("Use 1–12 beats per bar, 1–100 bars and a denominator of 2, 4 or 8.") }
        let beatSeconds = 60 / bpm * 4 / Double(denominator), beats = beatsPerBar * bars
        let frames = Int(beatSeconds * Double(beats) * Double(sampleRateHz))
        guard frames > 0, frames <= maxFloatSamples else { throw NativeSimpleError.message("Metronome export exceeds the native sample limit.") }
        var samples = [Float](repeating: 0, count: frames)
        let clickFrames = max(1, Int(Double(sampleRateHz) * 0.025))
        for beat in 0..<beats {
            let start = Int(Double(beat) * beatSeconds * Double(sampleRateHz)), accent = beat % beatsPerBar == 0
            let frequency = accent ? 1_600.0 : 1_000.0, amplitude = accent ? 0.85 : 0.45
            for i in 0..<min(clickFrames, frames - start) {
                let edge = min(1, max(0, min(Double(i + 1) / (Double(sampleRateHz) * 0.002), Double(clickFrames - i) / (Double(sampleRateHz) * 0.004))))
                let decay = exp(-Double(i) / (Double(sampleRateHz) * 0.007))
                samples[start + i] = Float(min(1, max(-1, Double(samples[start + i]) + amplitude * edge * decay * sin(2 * Double.pi * frequency * Double(i) / Double(sampleRateHz)))))
            }
        }
        let encoded = try encodePCM16(sampleRateHz: sampleRateHz, channels: [samples]), duration = Double(frames) / Double(sampleRateHz)
        return NativeAudioWavResult(report: "Generated metronome click track\nTempo: \(String(format: "%.3f", bpm)) quarter-note BPM\nTime signature: \(beatsPerBar)/\(denominator)\nBars: \(bars) · Total beats: \(beats)\nBeat interval: \(String(format: "%.3f", beatSeconds)) s\nDuration: \(String(format: "%.3f", duration)) s\nDownbeats accented.", outputWav: encoded, durationSeconds: duration)
    }

    static func join(_ files: [Data]) throws -> NativeAudioWavResult {
        guard (2...32).contains(files.count) else { throw NativeSimpleError.message("Choose 2–32 WAV files to join.") }
        guard files.reduce(0, { $0 + $1.count }) <= 100 * 1024 * 1024 else { throw NativeSimpleError.message("Combined WAV input size must not exceed 100 MB for safe local joining.") }
        let decoded = try files.map { try decode($0) }
        guard let first = decoded.first else { throw NativeSimpleError.message("Choose at least two WAV files.") }
        guard decoded.allSatisfy({ $0.sampleRateHz == first.sampleRateHz && $0.channels.count == first.channels.count }) else {
            throw NativeSimpleError.message("To keep joining predictable, all WAV files must have the same sample rate and channel count. Convert them first if necessary.")
        }
        let totalFrames = decoded.reduce(0) { $0 + $1.frames }
        guard totalFrames <= maxFloatSamples / first.channels.count else { throw NativeSimpleError.message("The joined audio exceeds the native memory safety limit. Join shorter excerpts.") }
        let joinedChannels = first.channels.indices.map { channel in decoded.flatMap { $0.channels[channel] } }
        let output = try encodePCM16(sampleRateHz: first.sampleRateHz, channels: joinedChannels)
        let duration = Double(totalFrames) / Double(first.sampleRateHz)
        return NativeAudioWavResult(report: "Joined \(files.count) WAV files in selected order\nSample rate: \(first.sampleRateHz) Hz\nChannels: \(first.channels.count)\nDuration: \(String(format: "%.3f", duration)) s\nOutput: 16-bit PCM WAV\nProcessed on this device; no upload performed.", outputWav: output, durationSeconds: duration)
    }

    static func process(_ data: Data, operation: String, startSeconds: Double = 0, endSeconds: Double? = nil,
                        gainPercent: Double = 100, semitones: Double = 2, playbackRate: Double = 1,
                        targetSampleRateHz: Int = 44_100, noiseStrength: Double = 0.8, gateThresholdDB: Double = -42,
                        humFrequencyHz: Int = 50, silenceThresholdDB: Double = -50, fadeDurationMs: Double = 1000,
                        eqLowDB: Double = 0, eqMidDB: Double = 0, eqHighDB: Double = 0,
                        compressorThresholdDB: Double = -18, compressorRatio: Double = 4, targetChannels: Int = 2) throws -> NativeAudioWavResult {
        let input = try decode(data), duration = input.durationSeconds
        let peak = input.channels.map { NativeAudioDsp.peakAmplitude($0) }.max() ?? 0
        let rms = sqrt(input.channels.reduce(0.0) { $0 + $1.reduce(0.0) { $0 + Double($1) * Double($1) } } / max(1, Double(input.frames * input.channels.count)))
        let dc = input.channels.reduce(0.0) { $0 + $1.reduce(0.0) { $0 + Double($1) } } / max(1, Double(input.frames * input.channels.count))
        func number(_ value: Double) -> String { value.isFinite ? String(format: "%.3f", value) : "unavailable" }
        switch operation {
        case "inspector": return NativeAudioWavResult(report: "WAV inspector\nDuration: \(number(duration)) s\nSample rate: \(input.sampleRateHz) Hz\nChannels: \(input.channels.count)\nFrames per channel: \(input.frames)\nSource encoding: \(input.sourceBits)-bit \(input.sourceEncoding == 3 ? "IEEE float" : "PCM")\nSource size: \(data.count) bytes", outputWav: nil, durationSeconds: duration)
        case "duration": return NativeAudioWavResult(report: "Duration: \(number(duration)) seconds\nSample rate: \(input.sampleRateHz) Hz", outputWav: nil, durationSeconds: duration)
        case "peak": return NativeAudioWavResult(report: "Peak amplitude: \(number(peak))\nPeak level: \(number(NativeAudioDsp.amplitudeDbfs(peak))) dBFS\nSource channels: \(input.channels.count)", outputWav: nil, durationSeconds: duration)
        case "rms": return NativeAudioWavResult(report: "RMS amplitude: \(number(rms))\nRMS level: \(number(NativeAudioDsp.amplitudeDbfs(rms))) dBFS", outputWav: nil, durationSeconds: duration)
        case "silence": return NativeAudioWavResult(report: "Estimated silent duration: \(number(try NativeAudioDsp.totalSilentDurationSeconds(channels: input.channels, sampleRateHz: input.sampleRateHz, thresholdDB: silenceThresholdDB))) s\nThreshold: \(silenceThresholdDB) dBFS. Quiet material near the threshold may be counted as silent.", outputWav: nil, durationSeconds: duration)
        case "dc-offset": return NativeAudioWavResult(report: "Mean sample offset: \(number(dc))\nInterpretation: \(abs(dc) < 0.001 ? "very small" : "noticeable; inspect the source")", outputWav: nil, durationSeconds: duration)
        case "audio-lufs-meter": return NativeAudioWavResult(report: "RMS-based loudness estimate: \(number(NativeAudioDsp.approximateLUFS(try NativeAudioDsp.toMono(input.channels)))) LUFS-like\nSample peak: \(number(NativeAudioDsp.amplitudeDbfs(peak))) dBFS\nNot standards-compliant BS.1770 LUFS: K-weighting and gating are not implemented.", outputWav: nil, durationSeconds: duration)
        default: break
        }
        var rate = input.sampleRateHz, channels = input.channels, detail = ""
        switch operation {
        case "to-wav": detail = "Converted PCM WAV to 16-bit PCM WAV"
        case "trim":
            guard startSeconds.isFinite, startSeconds >= 0 else { throw NativeSimpleError.message("Trim start must be non-negative.") }
            let start = min(duration, startSeconds), end = min(duration, endSeconds ?? duration)
            guard end.isFinite, end > start else { throw NativeSimpleError.message("Trim end must exceed start and fit within the file duration.") }
            channels = try channels.map { try NativeAudioDsp.trim($0, sampleRateHz: rate, startSeconds: start, endSeconds: end) }; detail = "Trimmed \(number(start))–\(number(end)) s"
        case "reverse": channels = channels.map { NativeAudioDsp.reverse($0) }; detail = "Reversed audio"
        case "normalize": guard peak > 0 else { throw NativeSimpleError.message("The selected audio is silent.") }; channels = channels.map { NativeAudioDsp.normalizePeak($0, targetPeak: 0.98) }; detail = "Peak-normalized to approximately 98% amplitude"
        case "fade-in", "fade-out": channels = try channels.map { try NativeAudioDsp.fade($0, sampleRateHz: rate, durationMs: min(fadeDurationMs, duration * 1000), fadeIn: operation == "fade-in") }; detail = "Applied \(number(min(fadeDurationMs, duration * 1000))) ms fade"
        case "mono": channels = [try NativeAudioDsp.toMono(channels)]; detail = "Downmixed to mono"
        case "stereo": channels = channels.count == 1 ? [channels[0], channels[0]] : Array(channels.prefix(2)); detail = "Exported stereo using the first two channels or duplicated the mono channel"
        case "channels-local":
            guard (1...2).contains(targetChannels) else { throw NativeSimpleError.message("Choose mono (1) or stereo (2) output.") }
            channels = targetChannels == 1 ? [try NativeAudioDsp.toMono(channels)] : (channels.count == 1 ? [channels[0], channels[0]] : Array(channels.prefix(2)))
            detail = "Converted to \(targetChannels == 1 ? "mono" : "stereo")"
        case "voice-noise-reducer":
            guard noiseStrength.isFinite, (0...1).contains(noiseStrength) else { throw NativeSimpleError.message("Noise strength must be 0–1.") }
            channels = try channels.map { try NativeAudioDsp.noiseReduce($0, sampleRateHz: rate, thresholdDB: gateThresholdDB, attenuation: min(1, max(0.05, 1 - noiseStrength * 0.9))) }; detail = "Applied high-pass and soft-gate cleanup; not AI noise separation"
        case "voice-noise-gate": channels = channels.map { NativeAudioDsp.noiseGate($0, thresholdDB: gateThresholdDB, attenuation: 0.03) }; detail = "Applied soft noise gate"
        case "audio-hum-reducer": channels = try channels.map { try NativeAudioDsp.humReduce($0, sampleRateHz: rate, mainsFrequency: humFrequencyHz) }; detail = "Applied \(humFrequencyHz) Hz and harmonic notch filters"
        case "audio-trim-silence":
            let bounds = trimSilenceBounds(channels, thresholdDB: silenceThresholdDB, sampleRateHz: rate)
            guard bounds.1 > bounds.0 else { throw NativeSimpleError.message("No active audio was detected; adjust the silence threshold or check the file.") }
            channels = channels.map { Array($0[bounds.0..<bounds.1]) }; detail = "Removed leading/trailing silence"
        case "volume-local":
            guard gainPercent.isFinite, (0...500).contains(gainPercent) else { throw NativeSimpleError.message("Volume must be 0–500%.") }
            channels = channels.map { $0.map { Float(Double($0) * gainPercent / 100) } }; detail = "Applied \(number(gainPercent))% gain; values may clip"
        case "audio-pitch-shift":
            guard semitones.isFinite, (-12...12).contains(semitones) else { throw NativeSimpleError.message("Pitch shift must be −12 to +12 semitones.") }
            let speed = pow(2, semitones / 12); channels = try channels.map { try NativeAudioDsp.resampleAtPlaybackRate($0, playbackRate: speed) }; detail = "Pitch shifted with coupled duration change; no pitch-locked time stretching"
        case "audio-tempo-change":
            guard playbackRate.isFinite, (0.5...1.5).contains(playbackRate) else { throw NativeSimpleError.message("Speed must be 0.5×–1.5×.") }
            channels = try channels.map { try NativeAudioDsp.resampleAtPlaybackRate($0, playbackRate: playbackRate) }; detail = "Speed changed with coupled pitch; no pitch-locked time stretching"
        case "audio-compressor": channels = try channels.map { try NativeAudioDsp.compress($0, thresholdDB: compressorThresholdDB, ratio: compressorRatio) }; detail = "Applied static compressor approximation without attack/release envelope"
        case "audio-eq-simple": channels = try channels.map { try NativeAudioDsp.threeBandEQ($0, sampleRateHz: rate, lowGainDB: eqLowDB, midGainDB: eqMidDB, highGainDB: eqHighDB) }; detail = "Applied three-band EQ"
        case "resample-local":
            guard (8_000...192_000).contains(targetSampleRateHz) else { throw NativeSimpleError.message("Target sample rate must be 8,000–192,000 Hz.") }
            channels = try channels.map { try resample($0, from: rate, to: targetSampleRateHz) }; detail = "Resampled from \(rate) Hz to \(targetSampleRateHz) Hz"; rate = targetSampleRateHz
        default: throw NativeSimpleError.message("This native offline audio operation is not implemented; use the browser version for this tool.")
        }
        let output = try encodePCM16(sampleRateHz: rate, channels: channels)
        let outDuration = Double(channels.first?.count ?? 0) / Double(rate)
        return NativeAudioWavResult(report: "\(detail)\nOutput: 16-bit PCM WAV\nSample rate: \(rate) Hz\nChannels: \(channels.count)\nDuration: \(number(outDuration)) s\nOutput size: \(output.count) bytes\nProcessed on this device; no upload performed.", outputWav: output, durationSeconds: outDuration)
    }

    private static func trimSilenceBounds(_ channels: [[Float]], thresholdDB: Double, sampleRateHz: Int) -> (Int, Int) {
        guard let frames = channels.first?.count, frames > 0 else { return (0, 0) }
        let threshold = pow(10, thresholdDB / 20), window = max(1, sampleRateHz / 100)
        var first = -1, end = -1, start = 0
        while start < frames {
            let stop = min(frames, start + window)
            var sum = 0.0, count = 0
            for channel in channels { for i in start..<stop { let v = Double(channel[i]); sum += v * v; count += 1 } }
            if sqrt(sum / max(1, Double(count))) >= threshold { if first < 0 { first = start }; end = stop }
            start = stop
        }
        return first >= 0 && end > first ? (first, end) : (0, 0)
    }

    private static func resample(_ samples: [Float], from source: Int, to target: Int) throws -> [Float] {
        guard source > 0, target > 0 else { throw NativeSimpleError.message("Sample rates must be positive.") }
        guard source != target, !samples.isEmpty else { return samples }
        let count = max(1, Int((Double(samples.count) * Double(target) / Double(source)).rounded()))
        return (0..<count).map { index in
            let p = Double(index) * Double(source) / Double(target), left = min(samples.count - 1, Int(p)), right = min(samples.count - 1, left + 1), f = p - Double(left)
            return Float(Double(samples[left]) * (1 - f) + Double(samples[right]) * f)
        }
    }

    static func encodePCM16(sampleRateHz: Int, channels: [[Float]]) throws -> Data {
        guard (8_000...192_000).contains(sampleRateHz), (1...8).contains(channels.count), let frames = channels.first?.count, channels.allSatisfy({ $0.count == frames }) else { throw NativeSimpleError.message("Invalid WAV output dimensions or sample rate.") }
        let dataBytes = frames * channels.count * 2
        guard dataBytes <= 512 * 1024 * 1024 - 44 else { throw NativeSimpleError.message("Output WAV exceeds the native export limit.") }
        var data = Data(); data.reserveCapacity(44 + dataBytes)
        func append16(_ value: UInt16) { data.append(UInt8(value & 0xff)); data.append(UInt8((value >> 8) & 0xff)) }
        func append32(_ value: UInt32) { append16(UInt16(value & 0xffff)); append16(UInt16((value >> 16) & 0xffff)) }
        func appendASCII(_ value: String) { data.append(contentsOf: value.utf8) }
        appendASCII("RIFF"); append32(UInt32(36 + dataBytes)); appendASCII("WAVEfmt "); append32(16); append16(1); append16(UInt16(channels.count)); append32(UInt32(sampleRateHz)); append32(UInt32(sampleRateHz * channels.count * 2)); append16(UInt16(channels.count * 2)); append16(16); appendASCII("data"); append32(UInt32(dataBytes))
        for frame in 0..<frames { for channel in channels {
            let raw = channel[frame].isFinite ? min(1, max(-1, channel[frame])) : 0
            let scaled = raw < 0 ? Int((Double(raw) * 32768).rounded()) : Int((Double(raw) * 32767).rounded())
            append16(UInt16(bitPattern: Int16(min(32767, max(-32768, scaled)))))
        } }
        return data
    }

    private static func ascii(_ bytes: [UInt8], _ offset: Int, _ count: Int) -> String { String(bytes: bytes[offset..<(offset + count)], encoding: .ascii) ?? "" }
    private static func u16(_ bytes: [UInt8], _ offset: Int) -> UInt16 { UInt16(bytes[offset]) | (UInt16(bytes[offset + 1]) << 8) }
    private static func u32(_ bytes: [UInt8], _ offset: Int) -> UInt32 { UInt32(bytes[offset]) | (UInt32(bytes[offset + 1]) << 8) | (UInt32(bytes[offset + 2]) << 16) | (UInt32(bytes[offset + 3]) << 24) }
}

/// App-private, short-lived handoff for the last source selected by a native WAV tool.
/// The saved bytes never leave Application Support; the cache expires after seven days
/// and is not a permanent or synced backup.
enum NativeAudioSessionStore {
    struct Source {
        let name: String
        let data: Data
    }

    private static let nameKey = "env.audio.session.name"
    private static let savedAtKey = "env.audio.session.savedAt"
    private static let fileName = "env-recent-audio-source.wav"
    private static let maxBytes = 250 * 1024 * 1024
    private static let ttl: TimeInterval = 7 * 24 * 60 * 60

    private static var directory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("enVAudioSessions", isDirectory: true)
    }
    private static var sourceURL: URL { directory.appendingPathComponent(fileName) }

    static var hasAvailable: Bool {
        let defaults = UserDefaults.standard
        let savedAt = defaults.double(forKey: savedAtKey)
        guard savedAt > 0, Date().timeIntervalSince1970 - savedAt < ttl,
              FileManager.default.fileExists(atPath: sourceURL.path),
              defaults.string(forKey: nameKey) != nil else {
            if savedAt > 0 { clear() }
            return false
        }
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: sourceURL.path),
              let size = attributes[.size] as? NSNumber, size.intValue >= 44, size.intValue <= maxBytes else {
            clear()
            return false
        }
        return true
    }

    static func save(data: Data, name: String) throws {
        guard data.count >= 44, data.count <= maxBytes else {
            throw NativeSimpleError.message("Only WAV files up to 250 MB can be kept for native handoff.")
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: sourceURL, options: .atomic)
        UserDefaults.standard.set(name, forKey: nameKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: savedAtKey)
    }

    static func load() throws -> Source? {
        guard hasAvailable else { return nil }
        let data = try Data(contentsOf: sourceURL, options: .uncached)
        guard data.count >= 44, data.count <= maxBytes,
              let name = UserDefaults.standard.string(forKey: nameKey) else {
            clear()
            return nil
        }
        return Source(name: name, data: data)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: sourceURL)
        UserDefaults.standard.removeObject(forKey: nameKey)
        UserDefaults.standard.removeObject(forKey: savedAtKey)
    }
}

private struct NativeAudioWavDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.wav] }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

private struct NativeAudioRecorderToolView: View {
    let title: String
    @State private var recorder: AVAudioRecorder?
    @State private var isRecording = false
    @State private var levelDBFS = -60.0
    @State private var elapsedSeconds = 0
    @State private var status = "Ready. Recording starts only after microphone permission is granted."
    @State private var output = ""
    @State private var error: String?
    @State private var pendingExport: Data?
    @State private var showExporter = false
    @State private var meterTask: Task<Void, Never>?
    private let maximumDuration = 300

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            Text("Native microphone recording · 44.1 kHz mono · 16-bit PCM WAV · maximum 5 minutes per take. The recording is written to this device's temporary directory and only exported when you choose.")
                .font(.footnote).foregroundStyle(.secondary)
            HStack {
                Circle().fill(isRecording ? Color.red : Color.gray.opacity(0.55)).frame(width: 10, height: 10)
                Text(isRecording ? "Recording" : "Stopped").fontWeight(.medium)
                Spacer()
                Text("\(elapsedSeconds)s / \(maximumDuration)s").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            ProgressView(value: min(1, max(0, (levelDBFS + 60) / 60)))
                .tint(levelDBFS > -3 ? .red : .accentColor)
            Text("Input level: \(String(format: "%.1f", levelDBFS)) dBFS (approximate)").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button("Start recording") { requestAndStart() }
                    .buttonStyle(.borderedProminent).disabled(isRecording)
                Button("Stop") { stopAndPrepareExport() }.buttonStyle(.bordered).disabled(!isRecording)
            }
            Button("Export WAV") { showExporter = pendingExport != nil }
                .buttonStyle(.borderedProminent).disabled(pendingExport == nil)
            Text(status).font(.footnote).foregroundStyle(.secondary)
            if !output.isEmpty || error != nil { NativeOutputView(output: output, error: error) }
        }
        .fileExporter(isPresented: $showExporter, document: NativeAudioWavDocument(data: pendingExport ?? Data()), contentType: .wav, defaultFilename: "env-microphone-recording.wav") { result in
            switch result {
            case .success:
                status = "Saved local microphone recording as a WAV file. No audio was uploaded."
                error = nil
            case .failure(let caught): error = caught.localizedDescription
            }
            pendingExport = nil
        }
        .onDisappear { cleanup() }
    }

    private func requestAndStart() {
        error = nil
        output = ""
        guard AVAudioSession.sharedInstance().recordPermission != .denied else {
            error = "Microphone permission is denied. Allow it in Settings to record audio."
            status = "No recording started."
            return
        }
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else {
                    error = "Microphone permission was denied. Allow microphone access in Settings to record audio."
                    status = "No recording started."
                    return
                }
                beginRecording()
            }
        }
    }

    private func beginRecording() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("env-mic-\(UUID().uuidString).wav")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVAudioFileTypeKey: kAudioFileWAVEType,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsFloatKey: false
            ]
            let activeRecorder = try AVAudioRecorder(url: url, settings: settings)
            activeRecorder.isMeteringEnabled = true
            guard activeRecorder.prepareToRecord(), activeRecorder.record(forDuration: TimeInterval(maximumDuration)) else {
                throw NativeSimpleError.message("The microphone could not start a WAV recording on this device.")
            }
            recorder = activeRecorder
            isRecording = true
            elapsedSeconds = 0
            status = "Recording locally. Maximum duration is 5 minutes."
            meterTask?.cancel()
            meterTask = Task { @MainActor in
                let started = Date()
                while !Task.isCancelled, activeRecorder.isRecording {
                    activeRecorder.updateMeters()
                    levelDBFS = Double(activeRecorder.averagePower(forChannel: 0))
                    elapsedSeconds = min(maximumDuration, Int(Date().timeIntervalSince(started)))
                    if elapsedSeconds >= maximumDuration {
                        activeRecorder.stop()
                        break
                    }
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
                if activeRecorder.isRecording == false && isRecording { finishStoppedRecording(activeRecorder) }
            }
        } catch {
            isRecording = false
            recorder = nil
            self.error = error.localizedDescription
            status = "Recording failed. Check microphone permissions and device availability."
        }
    }

    private func stopAndPrepareExport() {
        guard let activeRecorder = recorder else { isRecording = false; return }
        activeRecorder.stop()
        finishStoppedRecording(activeRecorder)
    }

    private func finishStoppedRecording(_ activeRecorder: AVAudioRecorder) {
        guard isRecording || recorder != nil else { return }
        meterTask?.cancel()
        meterTask = nil
        activeRecorder.updateMeters()
        elapsedSeconds = min(maximumDuration, max(elapsedSeconds, Int(activeRecorder.currentTime)))
        activeRecorder.stop()
        isRecording = false
        recorder = nil
        defer { try? FileManager.default.removeItem(at: activeRecorder.url) }
        do {
            let data = try Data(contentsOf: activeRecorder.url)
            guard data.count >= 44, String(data: data.prefix(4), encoding: .ascii) == "RIFF", String(data: data[8..<12], encoding: .ascii) == "WAVE" else {
                throw NativeSimpleError.message("The device did not produce a valid RIFF/WAVE file with the requested PCM settings. Export is unavailable for this recording.")
            }
            pendingExport = data
            output = "Captured \(String(format: "%.2f", Double(data.count) / 1_000_000)) MB\nDuration: \(elapsedSeconds)s\nFormat: 44.1 kHz mono, 16-bit PCM WAV\nPrivacy: recorded locally; no upload performed."
            status = "Recording stopped and ready to export."
        } catch {
            self.error = error.localizedDescription
            status = "Recording could not be prepared for export."
        }
    }

    private func cleanup() {
        meterTask?.cancel()
        meterTask = nil
        if let currentRecorder = recorder {
            currentRecorder.stop()
            try? FileManager.default.removeItem(at: currentRecorder.url)
        }
        recorder = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

private struct NativeAudioGeneratorToolView: View {
    let operation: String
    let title: String
    @State private var frequency = "440"
    @State private var duration = "2"
    @State private var waveform = "sine"
    @State private var level = "-12"
    @State private var sampleRate = "44100"
    @State private var bpm = "120"
    @State private var beatsPerBar = "4"
    @State private var denominator = "4"
    @State private var bars = "4"
    @State private var output = ""
    @State private var error: String?
    @State private var selectedExport: Data?
    @State private var showExport = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            Text("Audio is generated on this device and exported as 16-bit PCM WAV. No server or account is required.").font(.footnote).foregroundStyle(.secondary)
            NativeInputField(title: "Sample rate (8,000–192,000 Hz)", text: $sampleRate)
            if operation == "generate-tone" {
                NativeInputField(title: "Waveform: sine, square, saw or noise", text: $waveform)
                NativeInputField(title: "Frequency (Hz, below Nyquist)", text: $frequency)
                NativeInputField(title: "Duration (0.05–300 seconds)", text: $duration)
                NativeInputField(title: "Level (−60 to 0 dBFS)", text: $level)
            } else {
                NativeInputField(title: "Quarter-note BPM (40–240)", text: $bpm)
                NativeInputField(title: "Beats per bar (1–12)", text: $beatsPerBar)
                NativeInputField(title: "Time-signature denominator: 2, 4 or 8", text: $denominator)
                NativeInputField(title: "Bars (1–100)", text: $bars)
            }
            HStack(spacing: 10) {
                Button("Generate and export WAV") { generate() }.buttonStyle(.borderedProminent)
                Button("Reset") { frequency = "440"; duration = "2"; waveform = "sine"; level = "-12"; sampleRate = "44100"; bpm = "120"; beatsPerBar = "4"; denominator = "4"; bars = "4"; output = ""; error = nil; selectedExport = nil }.buttonStyle(.bordered)
            }
            if !output.isEmpty || error != nil { NativeOutputView(output: output, error: error) }
        }
        .fileExporter(isPresented: $showExport, document: NativeAudioWavDocument(data: selectedExport ?? Data()), contentType: .wav, defaultFilename: operation == "generate-tone" ? "env-generated-tone.wav" : "env-metronome.wav") { result in
            switch result { case .success: output += "\nSaved WAV to the selected location."; error = nil; case .failure(let caught): error = caught.localizedDescription }
            selectedExport = nil
        }
    }

    private func generate() {
        do {
            let result: NativeAudioWavResult
            if operation == "generate-tone" {
                result = try NativeAudioWavProcessor.generateTone(sampleRateHz: Int(sampleRate) ?? 44_100, durationSeconds: Double(duration) ?? 2, frequencyHz: Double(frequency) ?? 440, waveform: waveform.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), levelDBFS: Double(level) ?? -12)
            } else {
                result = try NativeAudioWavProcessor.generateMetronome(sampleRateHz: Int(sampleRate) ?? 44_100, bpm: Double(bpm) ?? 120, beatsPerBar: Int(beatsPerBar) ?? 4, bars: Int(bars) ?? 4, denominator: Int(denominator) ?? 4)
            }
            output = result.report; error = nil; selectedExport = result.outputWav; showExport = true
        } catch let caughtError { output = ""; error = caughtError.localizedDescription }
    }
}

private struct NativeWavJoinInput: Identifiable, Sendable {
    let id = UUID()
    let name: String
    let data: Data
}

private struct NativeAudioWavJoinerToolView: View {
    let title: String
    @State private var files: [NativeWavJoinInput] = []
    @State private var selectedExport: Data?
    @State private var output = ""
    @State private var error: String?
    @State private var showImporter = false
    @State private var showExporter = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            Text("Join 2–32 local PCM WAV files in the order shown. All inputs must have the same sample rate and channel count. Combined source size is capped at 100 MB; output is a 16-bit PCM WAV created on this device.")
                .font(.footnote).foregroundStyle(.secondary)
            Button("Choose WAV files") { showImporter = true }.buttonStyle(.borderedProminent)
            ForEach(Array(files.enumerated()), id: \.element.id) { index, file in
                HStack(spacing: 8) {
                    Text("\(index + 1). \(file.name)").lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    Button("↑") { if index > 0 { let item = files.remove(at: index); files.insert(item, at: index - 1) } }.disabled(index == 0).buttonStyle(.bordered)
                    Button("↓") { if index < files.count - 1 { let item = files.remove(at: index); files.insert(item, at: index + 1) } }.disabled(index == files.count - 1).buttonStyle(.bordered)
                    Button("Remove") { files.remove(at: index); output = "" }.buttonStyle(.bordered)
                }
            }
            HStack(spacing: 10) {
                Button("Join and export WAV") { runJoin() }.buttonStyle(.borderedProminent).disabled(files.count < 2)
                Button("Reset") { files = []; output = ""; error = nil; selectedExport = nil }.buttonStyle(.bordered)
            }
            if !output.isEmpty || error != nil { NativeOutputView(output: output, error: error) }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.wav], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                Task {
                    do {
                        let imported = try await Task.detached(priority: .userInitiated) { () throws -> [NativeWavJoinInput] in
                            var total = 0
                            return try urls.map { url in
                                let access = url.startAccessingSecurityScopedResource()
                                defer { if access { url.stopAccessingSecurityScopedResource() } }
                                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize
                                if let size, size > 100 * 1024 * 1024 { throw NativeSimpleError.message("Combined WAV input size must not exceed 100 MB.") }
                                let data = try Data(contentsOf: url, options: .uncached)
                                total += data.count
                                guard total <= 100 * 1024 * 1024 else { throw NativeSimpleError.message("Combined WAV input size must not exceed 100 MB.") }
                                _ = try NativeAudioWavProcessor.process(data, operation: "inspector")
                                return NativeWavJoinInput(name: url.lastPathComponent, data: data)
                            }
                        }.value
                        await MainActor.run {
                            if imported.count < 2 { self.files = imported; self.error = "Select at least two WAV files to join."; self.output = "" }
                            else { self.files = imported; self.error = nil; self.output = "Selected \(imported.count) WAV files. Reorder them before joining." }
                        }
                    } catch let caughtError { await MainActor.run { self.error = caughtError.localizedDescription; self.output = "" } }
                }
            case .failure(let caught): error = caught.localizedDescription
            }
        }
        .fileExporter(isPresented: $showExporter, document: NativeAudioWavDocument(data: selectedExport ?? Data()), contentType: .wav, defaultFilename: "env-joined-audio.wav") { result in
            switch result {
            case .success: output += "\nJoined WAV saved to the selected location."; error = nil
            case .failure(let caught): error = caught.localizedDescription
            }
            selectedExport = nil
        }
    }

    private func runJoin() {
        do {
            let result = try NativeAudioWavProcessor.join(files.map(\.data))
            output = result.report; error = nil; selectedExport = result.outputWav; showExporter = true
        } catch let caughtError { output = ""; error = caughtError.localizedDescription }
    }
}

private struct NativeAudioWaveFileToolView: View {
    let operation: String
    let title: String
    @State private var selectedData: Data?
    @State private var selectedName = ""
    @State private var pendingData: Data?
    @State private var output = ""
    @State private var error: String?
    @State private var sessionNotice = ""
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var values: [String: String] = [
        "start": "0", "end": "5", "gain": "100", "semitones": "2", "speed": "0.8", "rate": "48000",
        "noise": "0.8", "gate": "-42", "hum": "50", "silence": "-50", "fade": "1000", "low": "0", "mid": "0", "high": "0",
        "threshold": "-18", "ratio": "4", "channels": "2"
    ]

    private var isAnalyzer: Bool { ["inspector", "duration", "peak", "rms", "silence", "dc-offset", "audio-lufs-meter"].contains(operation) }
    private var exportFilename: String { "\(selectedName.isEmpty ? "env-audio" : selectedName)-enV.wav" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            Text("Native offline WAV tool. The selected file stays on this device. This native route supports uncompressed PCM WAV (8/16/24/32-bit) and 32-bit float WAV; use the browser-local version for MP3, M4A, OGG, FLAC or larger files beyond the native memory limit.")
                .font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button(selectedName.isEmpty ? "Choose WAV file" : "Choose another WAV") { showImporter = true }.buttonStyle(.borderedProminent)
                if !selectedName.isEmpty { Text(selectedName).font(.caption).lineLimit(1) }
            }
            if !sessionNotice.isEmpty { Text(sessionNotice).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("audio-session-notice") }
            if selectedData == nil && NativeAudioSessionStore.hasAvailable {
                Button("Restore previous local source") { restoreLastSource() }.buttonStyle(.borderedProminent).accessibilityIdentifier("restore-audio-session")
            }
            if NativeAudioSessionStore.hasAvailable {
                Button("Forget saved source") {
                    NativeAudioSessionStore.clear()
                    sessionNotice = "Saved source removed from this device. Current in-memory selection is unchanged."
                }.buttonStyle(.bordered)
            }
            if !isAnalyzer { controls }
            HStack(spacing: 10) {
                Button("Run tool") { runTool() }.buttonStyle(.borderedProminent).disabled(selectedData == nil)
                Button("Reset") { values = ["start":"0","end":"5","gain":"100","semitones":"2","speed":"0.8","rate":"48000","noise":"0.8","gate":"-42","hum":"50","silence":"-50","fade":"1000","low":"0","mid":"0","high":"0","threshold":"-18","ratio":"4","channels":"2"]; output = ""; error = nil }
                    .buttonStyle(.bordered)
                if !output.isEmpty { Button("Copy result") { UIPasteboard.general.string = output }.buttonStyle(.bordered) }
            }
            if !output.isEmpty || error != nil { NativeOutputView(output: output, error: error) }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.wav], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                do {
                    let resource = try url.resourceValues(forKeys: [.fileSizeKey])
                    if let fileSize = resource.fileSize, fileSize > 250 * 1024 * 1024 {
                        throw NativeSimpleError.message("Choose a WAV file no larger than 250 MB.")
                    }
                    let data = try Data(contentsOf: url, options: .uncached)
                    guard data.count <= 250 * 1024 * 1024 else { throw NativeSimpleError.message("Choose a WAV file no larger than 250 MB.") }
                    let inspection = try NativeAudioWavProcessor.process(data, operation: "inspector")
                    selectedData = data; selectedName = url.deletingPathExtension().lastPathComponent
                    do {
                        try NativeAudioSessionStore.save(data: data, name: selectedName)
                        sessionNotice = "Source saved in this app's private storage for up to 7 days. It stays on this device."
                    } catch {
                        sessionNotice = "Source is ready in this tool, but the app could not save a reusable local handoff."
                    }
                    if let duration = inspection.durationSeconds { values["end"] = String(format: "%.3f", duration) }
                    output = inspection.report; error = nil
                } catch { selectedData = nil; selectedName = ""; output = ""; self.error = error.localizedDescription }
            case .failure(let caught): error = caught.localizedDescription
            }
        }
        .fileExporter(isPresented: $showExporter, document: NativeAudioWavDocument(data: pendingData ?? Data()), contentType: .wav, defaultFilename: exportFilename) { result in
            switch result {
            case .success: output += "\nSaved the processed WAV to the selected location."; error = nil
            case .failure(let caught): error = caught.localizedDescription
            }
            pendingData = nil
        }
    }

    private func restoreLastSource() {
        Task {
            do {
                let restored = try await Task.detached(priority: .userInitiated) { () throws -> (NativeAudioSessionStore.Source, NativeAudioWavResult) in
                    guard let source = try NativeAudioSessionStore.load() else {
                        throw NSError(domain: "enV.AudioSession", code: 1, userInfo: [NSLocalizedDescriptionKey: "There is no reusable local audio source. Choose a WAV file first."])
                    }
                    let inspection = try NativeAudioWavProcessor.process(source.data, operation: "inspector")
                    return (source, inspection)
                }.value
                selectedData = restored.0.data
                selectedName = restored.0.name
                if let duration = restored.1.durationSeconds { values["end"] = String(format: "%.3f", duration) }
                output = restored.1.report
                error = nil
                sessionNotice = "Restored \(restored.0.name) from this device's private local session. Nothing was uploaded."
            } catch {
                self.error = error.localizedDescription
                sessionNotice = "Choose the source file again if the local handoff is unavailable."
            }
        }
    }

    @ViewBuilder private var controls: some View {
        switch operation {
        case "trim": pair("Start (seconds)", "start", "End (seconds)", "end")
        case "volume-local": field("Gain percent (0–500)", "gain")
        case "audio-pitch-shift": field("Pitch semitones (−12 to +12; duration changes)", "semitones")
        case "audio-tempo-change": field("Speed (0.5×–1.5×; pitch changes too)", "speed")
        case "resample-local": field("Target sample rate (8,000–192,000 Hz)", "rate")
        case "voice-noise-reducer": pair("Noise strength (0–1)", "noise", "Soft gate threshold (dBFS)", "gate")
        case "voice-noise-gate": field("Gate threshold (dBFS)", "gate")
        case "audio-hum-reducer": field("Power-line frequency (50 or 60 Hz)", "hum")
        case "audio-trim-silence": field("Silence threshold (dBFS)", "silence")
        case "fade-in", "fade-out": field("Fade duration (milliseconds)", "fade")
        case "audio-compressor": pair("Threshold (dBFS)", "threshold", "Ratio (1–20)", "ratio")
        case "audio-eq-simple": pair("Low gain (dB)", "low", "Mid gain (dB)", "mid", thirdLabel: "High gain (dB)", thirdKey: "high")
        case "channels-local": field("Output channels: 1 mono or 2 stereo", "channels")
        default: EmptyView()
        }
    }

    private func field(_ label: String, _ key: String) -> some View { NativeInputField(title: label, text: binding(key)) }
    private func pair(_ firstLabel: String, _ firstKey: String, _ secondLabel: String, _ secondKey: String, thirdLabel: String? = nil, thirdKey: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeInputField(title: firstLabel, text: binding(firstKey))
            NativeInputField(title: secondLabel, text: binding(secondKey))
            if let thirdLabel, let thirdKey { NativeInputField(title: thirdLabel, text: binding(thirdKey)) }
        }
    }
    private func binding(_ key: String) -> Binding<String> { Binding(get: { values[key] ?? "" }, set: { values[key] = $0 }) }

    private func runTool() {
        guard let data = selectedData else { error = "Choose a WAV file first."; return }
        do {
            let result = try NativeAudioWavProcessor.process(
                data, operation: operation,
                startSeconds: Double(values["start"] ?? "0") ?? 0,
                endSeconds: Double(values["end"] ?? "5"),
                gainPercent: Double(values["gain"] ?? "100") ?? 100,
                semitones: Double(values["semitones"] ?? "2") ?? 2,
                playbackRate: Double(values["speed"] ?? "1") ?? 1,
                targetSampleRateHz: Int(values["rate"] ?? "48000") ?? 48000,
                noiseStrength: Double(values["noise"] ?? "0.8") ?? 0.8,
                gateThresholdDB: Double(values["gate"] ?? "-42") ?? -42,
                humFrequencyHz: Int(values["hum"] ?? "50") ?? 50,
                silenceThresholdDB: Double(values["silence"] ?? "-50") ?? -50,
                fadeDurationMs: Double(values["fade"] ?? "1000") ?? 1000,
                eqLowDB: Double(values["low"] ?? "0") ?? 0,
                eqMidDB: Double(values["mid"] ?? "0") ?? 0,
                eqHighDB: Double(values["high"] ?? "0") ?? 0,
                compressorThresholdDB: Double(values["threshold"] ?? "-18") ?? -18,
                compressorRatio: Double(values["ratio"] ?? "4") ?? 4,
                targetChannels: Int(values["channels"] ?? "2") ?? 2
            )
            output = result.report; error = nil
            if let wav = result.outputWav { pendingData = wav; showExporter = true }
        } catch { output = ""; self.error = error.localizedDescription }
    }
}

private struct NativeLiveCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        preview.frame = view.bounds
        view.accessibilityLabel = "Live camera preview"
        return view
    }
    func updateUIView(_ uiView: UIView, context: Context) {
        uiView.layer.sublayers?.compactMap { $0 as? AVCaptureVideoPreviewLayer }.first?.frame = uiView.bounds
    }
}

private final class NativeLiveVideoCapture: NSObject, ObservableObject, AVCaptureFileOutputRecordingDelegate {
    let session = AVCaptureSession()
    @Published var recording = false
    @Published var previewReady = false
    @Published var capturedURL: URL?
    @Published var error: String?
    var onRecordingStarted: (() -> Void)?
    private let queue = DispatchQueue(label: "com.chastech.env.live-video.capture")
    private let movieOutput = AVCaptureMovieFileOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var configured = false
    private var frontCamera = true

    func startPreview() {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] videoOK in
            guard let self else { return }
            AVAudioSession.sharedInstance().requestRecordPermission { audioOK in
                guard videoOK && audioOK else {
                    DispatchQueue.main.async { self.error = "Allow camera and microphone access in Settings to record a live performance." }
                    return
                }
                self.queue.async {
                    do {
                        try self.configureIfNeeded()
                        if !self.session.isRunning { self.session.startRunning() }
                        DispatchQueue.main.async { self.previewReady = true; self.error = nil }
                    } catch {
                        DispatchQueue.main.async { self.error = error.localizedDescription }
                    }
                }
            }
        }
    }

    private func configureIfNeeded() throws {
        guard !configured else { return }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .hd1280x720
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) ?? AVCaptureDevice.default(for: .video) else {
            throw NativeSimpleError.message("No compatible camera was found on this device.")
        }
        let video = try AVCaptureDeviceInput(device: camera)
        guard session.canAddInput(video) else { throw NativeSimpleError.message("The camera input could not be added to the recording session.") }
        session.addInput(video); videoInput = video
        guard let microphone = AVCaptureDevice.default(for: .audio) else { throw NativeSimpleError.message("No microphone was found on this device.") }
        let audio = try AVCaptureDeviceInput(device: microphone)
        guard session.canAddInput(audio) else { throw NativeSimpleError.message("The microphone input could not be added to the recording session.") }
        session.addInput(audio); audioInput = audio
        guard session.canAddOutput(movieOutput) else { throw NativeSimpleError.message("The camera output could not be configured.") }
        session.addOutput(movieOutput)
        configured = true
    }

    func toggleCamera() {
        guard !recording else { return }
        queue.async {
            do {
                try self.configureIfNeeded()
                guard let oldInput = self.videoInput else { return }
                let nextPosition: AVCaptureDevice.Position = self.frontCamera ? .back : .front
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: nextPosition) else {
                    DispatchQueue.main.async { self.error = "The selected front/rear camera is unavailable." }; return
                }
                let newInput = try AVCaptureDeviceInput(device: device)
                self.session.beginConfiguration()
                self.session.removeInput(oldInput)
                if self.session.canAddInput(newInput) {
                    self.session.addInput(newInput); self.videoInput = newInput; self.frontCamera = nextPosition == .front
                } else { self.session.addInput(oldInput) }
                self.session.commitConfiguration()
            } catch { DispatchQueue.main.async { self.error = error.localizedDescription } }
        }
    }

    func beginRecording() {
        queue.async {
            guard self.session.isRunning, !self.movieOutput.isRecording else { return }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("env-live-capture-\(UUID().uuidString).mov")
            try? FileManager.default.removeItem(at: url)
            self.movieOutput.startRecording(to: url, recordingDelegate: self)
            DispatchQueue.main.async { self.capturedURL = nil; self.recording = true; self.error = nil }
        }
    }

    func stopRecording() {
        queue.async { if self.movieOutput.isRecording { self.movieOutput.stopRecording() } }
    }

    func stopPreview() {
        queue.async {
            if self.movieOutput.isRecording { self.movieOutput.stopRecording() }
            if self.session.isRunning { self.session.stopRunning() }
            DispatchQueue.main.async { self.previewReady = false; self.recording = false }
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async { self.onRecordingStarted?() }
        // Guard long takes even if the view's controls are obscured or the app is busy.
        DispatchQueue.main.asyncAfter(deadline: .now() + 300) { [weak self] in
            guard let self, self.movieOutput.isRecording else { return }
            self.movieOutput.stopRecording()
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async {
            self.recording = false
            if let error {
                self.error = "The camera could not finalize the recording: \(error.localizedDescription)"
                self.capturedURL = nil
            } else {
                self.capturedURL = outputFileURL
                self.error = nil
            }
        }
    }
}


private struct NativeVocalEffectParameters {
    let highPassHz: Double
    let lowPassHz: Double
    let compressionRatio: Double
    let outputGain: Double
    let delayMs: Double
    let wet: Double
    let feedback: Double
    let chorusRateHz: Double
    let chorusDepthMs: Double
    let distortion: Double

    static func preset(_ id: String) -> NativeVocalEffectParameters {
        switch id {
        case "warm": return .init(highPassHz: 75, lowPassHz: 20000, compressionRatio: 2.8, outputGain: 1.05, delayMs: 72, wet: 0.10, feedback: 0.12, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "pop": return .init(highPassHz: 90, lowPassHz: 20000, compressionRatio: 3.2, outputGain: 1.08, delayMs: 65, wet: 0.16, feedback: 0.16, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "rap": return .init(highPassHz: 100, lowPassHz: 20000, compressionRatio: 4.5, outputGain: 1.06, delayMs: 92, wet: 0.08, feedback: 0.1, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "dream-hall": return .init(highPassHz: 80, lowPassHz: 20000, compressionRatio: 2.2, outputGain: 1.02, delayMs: 145, wet: 0.30, feedback: 0.32, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "slapback": return .init(highPassHz: 85, lowPassHz: 20000, compressionRatio: 2.8, outputGain: 1, delayMs: 105, wet: 0.20, feedback: 0.06, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "lofi": return .init(highPassHz: 180, lowPassHz: 5200, compressionRatio: 4, outputGain: 1, delayMs: 0, wet: 0, feedback: 0, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0.12)
        case "telephone": return .init(highPassHz: 340, lowPassHz: 3400, compressionRatio: 3.8, outputGain: 1.04, delayMs: 0, wet: 0, feedback: 0, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "wide-chorus": return .init(highPassHz: 85, lowPassHz: 20000, compressionRatio: 2.4, outputGain: 1, delayMs: 25, wet: 0.20, feedback: 0.08, chorusRateHz: 0.28, chorusDepthMs: 6, distortion: 0)
        case "studio-room": return .init(highPassHz: 75, lowPassHz: 20000, compressionRatio: 2.4, outputGain: 1, delayMs: 45, wet: 0.12, feedback: 0.04, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "ambient": return .init(highPassHz: 80, lowPassHz: 20000, compressionRatio: 2.4, outputGain: 1, delayMs: 180, wet: 0.22, feedback: 0.22, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "megaphone": return .init(highPassHz: 500, lowPassHz: 2600, compressionRatio: 4.5, outputGain: 1, delayMs: 0, wet: 0, feedback: 0, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0.16)
        case "vocal-double": return .init(highPassHz: 85, lowPassHz: 20000, compressionRatio: 2.5, outputGain: 1, delayMs: 22, wet: 0.24, feedback: 0.04, chorusRateHz: 0.12, chorusDepthMs: 3, distortion: 0)
        case "podcast": return .init(highPassHz: 95, lowPassHz: 20000, compressionRatio: 3.4, outputGain: 1.02, delayMs: 0, wet: 0, feedback: 0, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "acoustic": return .init(highPassHz: 70, lowPassHz: 20000, compressionRatio: 2.2, outputGain: 1.02, delayMs: 65, wet: 0.08, feedback: 0.08, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "rnb": return .init(highPassHz: 80, lowPassHz: 20000, compressionRatio: 2.8, outputGain: 1.01, delayMs: 160, wet: 0.14, feedback: 0.08, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        case "arena": return .init(highPassHz: 90, lowPassHz: 20000, compressionRatio: 3, outputGain: 1, delayMs: 235, wet: 0.24, feedback: 0.20, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        default: return .init(highPassHz: 70, lowPassHz: 20000, compressionRatio: 2, outputGain: 1, delayMs: 0, wet: 0, feedback: 0, chorusRateHz: 0, chorusDepthMs: 0, distortion: 0)
        }
    }
}

private struct NativeEQCoefficients {
    let b0: Double
    let b1: Double
    let b2: Double
    let a1: Double
    let a2: Double
}

private struct NativeEQState {
    var x1 = 0.0
    var x2 = 0.0
    var y1 = 0.0
    var y2 = 0.0
}

private let nativeEQFrequencies = [60.0, 120.0, 250.0, 500.0, 1_000.0, 2_000.0, 4_000.0, 8_000.0, 12_000.0, 16_000.0]
private let nativeEQProfiles: [(String, [Double])] = [
    ("Flat EQ", Array(repeating: 0.0, count: 10)),
    ("Vocal clarity", [-3, -2, -1, 0, 1, 2, 2.5, 1.5, 1, 0]),
    ("Warm", [1.5, 1.5, 1, 0.5, 0, -0.5, -1, -1, -0.5, -0.5]),
    ("Bright", [-1, -1, -0.5, 0, 0.5, 1.5, 2, 2, 1.5, 1]),
    ("Soft top", [0, 0, 0.5, 0.5, 0, -0.5, -1, -2, -2.5, -3]),
    ("Radio tone", [-4, -3, -1, 1.5, 2, 2, 1, -1, -3, -4]),
    ("Podcast speech", [-3, -2, -0.5, 0, 1, 1.5, 1.5, 0.8, 0, 0]),
    ("Air & openness", [-0.5, -0.5, 0, 0, 0.3, 0.6, 1, 1.5, 2, 1.5]),
    ("Sibilance soften", [0, 0, 0, 0, 0, -0.5, -1.5, -2.5, -2.5, -1.5]),
    ("Intimate vocal", [0, 0, 0.5, 1, 1.2, 0.8, 0.3, 0, -0.5, -1]),
    ("Lead vocal", [-2, -1, 0, 0.5, 1, 1.5, 2, 1.5, 1, 0.5]),
    ("Rumble reduction", [-5, -3, -1.5, -0.5, 0, 0, 0, 0, 0, 0]),
]

private let nativeLiveVideoVocalPresets: [(String, String)] = [
    ("clean", "Clean Studio"), ("warm", "Warm Vocal"), ("pop", "Pop Shine"), ("rap", "Rap Punch"),
    ("dream-hall", "Dream Hall / Reverb"), ("slapback", "Slapback Echo"), ("lofi", "Lo-Fi / Radio"),
    ("telephone", "Telephone / Broadcast"), ("wide-chorus", "Wide Chorus"), ("studio-room", "Studio Room"),
    ("ambient", "Ambient Dream"), ("megaphone", "Megaphone"), ("vocal-double", "Vocal Double (approximation)"),
    ("podcast", "Podcast Clarity"), ("acoustic", "Acoustic Warmth"), ("rnb", "R&B Silk"), ("arena", "Arena Vocal"),
]

private let nativeAmpCharacters: [(String, String, String)] = [
    ("clean", "Clean preamp", "No added saturation"),
    ("tube", "Warm tube", "Rounded soft clipping"),
    ("crunch", "Crunch", "More bite and density"),
    ("fuzz", "Fuzz", "Harder, rougher clipping"),
]

private func nativePeakingEQ(frequency: Double, gainDB: Double, sampleRate: Double, q: Double = 1.05) -> NativeEQCoefficients {
    let safeFrequency = min(max(1, frequency), sampleRate * 0.45)
    let safeGain = max(-9, min(9, gainDB))
    let amplitude = pow(10, safeGain / 40)
    let omega = 2 * Double.pi * safeFrequency / sampleRate
    let cosine = cos(omega)
    let alpha = sin(omega) / (2 * min(2, max(0.5, q)))
    let a0 = 1 + alpha / amplitude
    return NativeEQCoefficients(
        b0: (1 + alpha * amplitude) / a0,
        b1: (-2 * cosine) / a0,
        b2: (1 - alpha * amplitude) / a0,
        a1: (-2 * cosine) / a0,
        a2: (1 - alpha / amplitude) / a0
    )
}

private func nativeShelfEQ(frequency: Double, gainDB: Double, sampleRate: Double, highShelf: Bool) -> NativeEQCoefficients {
    let safeFrequency = min(max(1, frequency), sampleRate * 0.45)
    let amplitude = pow(10, max(-6, min(6, gainDB)) / 40)
    let omega = 2 * Double.pi * safeFrequency / sampleRate
    let cosine = cos(omega)
    let alpha = sin(omega) * 0.5 * sqrt(2)
    let beta = 2 * sqrt(amplitude) * alpha
    let b0: Double
    let b1: Double
    let b2: Double
    let a0: Double
    let a1: Double
    let a2: Double
    if highShelf {
        b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta)
        b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine)
        b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta)
        a0 = (amplitude + 1) - (amplitude - 1) * cosine + beta
        a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosine)
        a2 = (amplitude + 1) - (amplitude - 1) * cosine - beta
    } else {
        b0 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta)
        b1 = 2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine)
        b2 = amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta)
        a0 = (amplitude + 1) + (amplitude - 1) * cosine + beta
        a1 = -2 * ((amplitude - 1) + (amplitude + 1) * cosine)
        a2 = (amplitude + 1) + (amplitude - 1) * cosine - beta
    }
    return NativeEQCoefficients(b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0)
}

private func appendUInt16LE(_ value: UInt16, to data: inout Data) {
    var little = value.littleEndian
    Swift.withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
}

private func appendUInt32LE(_ value: UInt32, to data: inout Data) {
    var little = value.littleEndian
    Swift.withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
}

/// Reads only the camera capture's microphone track, applies a small native offline vocal chain,
/// and writes PCM WAV. The backing instrumental is mixed afterward as a separate track.
private func createNativeProcessedVoiceWav(
    captureURL: URL,
    presetID: String,
    eqBandsDb: [Double],
    compressorThresholdDb: Double,
    compressorRatioOverride: Double,
    outputGainDb: Double,
    voiceRenderGain: Double,
    effectAmount: Double,
    ampCharacter: String,
    ampDrive: Double,
    ampBassDb: Double,
    ampMidDb: Double,
    ampTrebleDb: Double,
    highPassHzOverride: Double?,
    lowPassHzOverride: Double?
) throws -> URL {
    let sampleRate = 44_100
    let channels = 2
    let sourceAsset = AVURLAsset(url: captureURL)
    guard let sourceTrack = sourceAsset.tracks(withMediaType: .audio).first else {
        throw NativeSimpleError.message("The camera recording has no microphone audio track.")
    }
    let reader = try AVAssetReader(asset: sourceAsset)
    let outputSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsNonInterleaved: false
    ]
    let trackOutput = AVAssetReaderTrackOutput(track: sourceTrack, outputSettings: outputSettings)
    guard reader.canAdd(trackOutput) else { throw NativeSimpleError.message("Could not decode the microphone audio for local effects.") }
    reader.add(trackOutput)
    guard reader.startReading() else { throw reader.error ?? NativeSimpleError.message("Could not start decoding the microphone audio.") }

    var pcmBytes = Data()
    while let sample = trackOutput.copyNextSampleBuffer() {
        guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
        let byteCount = CMBlockBufferGetDataLength(block)
        var chunk = Data(count: byteCount)
        let copyStatus = chunk.withUnsafeMutableBytes { rawBuffer -> OSStatus in
            guard let base = rawBuffer.baseAddress else { return kCMBlockBufferBadCustomBlockSourceErr }
            return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: base)
        }
        guard copyStatus == kCMBlockBufferNoErr else { throw NativeSimpleError.message("Could not read a microphone PCM block for effects.") }
        pcmBytes.append(chunk)
        CMSampleBufferInvalidate(sample)
    }
    guard reader.status == .completed else { throw reader.error ?? NativeSimpleError.message("Microphone decoding did not finish successfully.") }
    let usableBytes = pcmBytes.count - (pcmBytes.count % 2)
    guard usableBytes >= channels * 2 else { throw NativeSimpleError.message("The decoded microphone recording is empty.") }
    var samples: [Int16] = pcmBytes.withUnsafeBytes { raw in
        let count = usableBytes / 2
        return (0..<count).map { index in Int16(littleEndian: raw.loadUnaligned(fromByteOffset: index * 2, as: Int16.self)) }
    }

    let p = NativeVocalEffectParameters.preset(presetID)
    let frameCount = samples.count / channels
    let eqCoefficients = nativeEQFrequencies.enumerated().map { index, frequency in
        nativePeakingEQ(frequency: frequency, gainDB: index < eqBandsDb.count ? eqBandsDb[index] : 0, sampleRate: Double(sampleRate))
    }
    let ampToneCoefficients = [
        nativeShelfEQ(frequency: 140, gainDB: ampBassDb, sampleRate: Double(sampleRate), highShelf: false),
        nativePeakingEQ(frequency: 850, gainDB: max(-6, min(6, ampMidDb)), sampleRate: Double(sampleRate), q: 0.85),
        nativeShelfEQ(frequency: 4_200, gainDB: ampTrebleDb, sampleRate: Double(sampleRate), highShelf: true),
    ]
    var eqStates = Array(repeating: Array(repeating: NativeEQState(), count: nativeEQFrequencies.count), count: channels)
    var ampToneStates = Array(repeating: Array(repeating: NativeEQState(), count: ampToneCoefficients.count), count: channels)
    let threshold = pow(10, max(-36, min(-8, compressorThresholdDb)) / 20)
    let compressionRatio = max(1, min(8, compressorRatioOverride))
    let renderGain = max(0, min(1.5, voiceRenderGain))
    let outputGain = p.outputGain * pow(10, max(-12, min(6, outputGainDb)) / 20)
    let wetAmount = max(0, min(0.65, p.wet * max(0, min(1.5, effectAmount))))
    let delayCapacity = max(2, Int(Double(sampleRate) * 0.24))
    var delayBuffers = Array(repeating: [Float](repeating: 0, count: delayCapacity), count: channels)
    var previousInput = [Double](repeating: 0, count: channels)
    var previousHighPass = [Double](repeating: 0, count: channels)
    var lowPassState = [Double](repeating: 0, count: channels)
    let dt = 1.0 / Double(sampleRate)
    let resolvedHighPassHz = max(20, min(1_000, highPassHzOverride ?? p.highPassHz))
    let resolvedLowPassHz = max(1_000, min(20_000, lowPassHzOverride ?? p.lowPassHz))
    let hpAlpha = exp(-2 * Double.pi * resolvedHighPassHz * dt)
    let lpAlpha = resolvedLowPassHz >= 19_999 || resolvedLowPassHz >= Double(sampleRate) * 0.48 ? 1.0 : 1 - exp(-2 * Double.pi * resolvedLowPassHz * dt)
    let delayFrames = max(1, Int(p.delayMs * Double(sampleRate) / 1000))

    for frame in 0..<frameCount {
        let writeIndex = frame % delayCapacity
        for channel in 0..<channels {
            let sampleIndex = frame * channels + channel
            let input = (Double(samples[sampleIndex]) / 32768.0) * renderGain
            let highPass = hpAlpha * (previousHighPass[channel] + input - previousInput[channel])
            previousInput[channel] = input
            previousHighPass[channel] = highPass
            lowPassState[channel] += lpAlpha * (highPass - lowPassState[channel])
            var value = lowPassState[channel]
            for band in eqCoefficients.indices {
                let coefficient = eqCoefficients[band]
                var state = eqStates[channel][band]
                let filtered = coefficient.b0 * value + coefficient.b1 * state.x1 + coefficient.b2 * state.x2 - coefficient.a1 * state.y1 - coefficient.a2 * state.y2
                state.x2 = state.x1; state.x1 = value; state.y2 = state.y1; state.y1 = filtered
                eqStates[channel][band] = state
                value = filtered
            }
            for band in ampToneCoefficients.indices {
                let coefficient = ampToneCoefficients[band]
                var state = ampToneStates[channel][band]
                let filtered = coefficient.b0 * value + coefficient.b1 * state.x1 + coefficient.b2 * state.x2 - coefficient.a1 * state.y1 - coefficient.a2 * state.y2
                state.x2 = state.x1; state.x1 = value; state.y2 = state.y1; state.y1 = filtered
                ampToneStates[channel][band] = state
                value = filtered
            }
            value *= outputGain
            let magnitude = abs(value)
            if magnitude > threshold { value = (value < 0 ? -1 : 1) * (threshold + (magnitude - threshold) / compressionRatio) }
            if p.distortion > 0 {
                let drive = 1 + p.distortion * 5
                value = tanh(value * drive) / tanh(drive) * (1 - p.distortion * 0.25)
            }
            let normalizedAmpDrive = max(0, min(100, ampDrive)) / 100
            if ampCharacter != "clean" && normalizedAmpDrive > 0 {
                let drive = 1 + normalizedAmpDrive * 11
                switch ampCharacter {
                case "tube": value = tanh(value * drive) / tanh(drive)
                case "crunch": value = atan(value * drive) / atan(drive)
                case "fuzz": value = max(-1, min(1, value * drive))
                default: break
                }
            }
            if wetAmount > 0 && p.delayMs > 0 {
                let modulation = p.chorusRateHz > 0 ? sin(Double(frame) / Double(sampleRate) * 2 * Double.pi * p.chorusRateHz) * p.chorusDepthMs : 0
                let delay = min(delayCapacity - 1, max(1, Int((p.delayMs + modulation) * Double(sampleRate) / 1000)))
                let readIndex = (frame - delay + delayCapacity) % delayCapacity
                let delayed = Double(delayBuffers[channel][readIndex])
                delayBuffers[channel][writeIndex] = Float(max(-1.5, min(1.5, value + delayed * p.feedback)))
                value = value * (1 - wetAmount * 0.35) + delayed * wetAmount
            } else {
                delayBuffers[channel][writeIndex] = Float(value)
            }
            let bounded = max(-0.98, min(0.98, value))
            samples[sampleIndex] = Int16(max(-32768, min(32767, Int((bounded * 32767).rounded()))))
        }
    }

    var wav = Data()
    let payloadBytes = samples.count * MemoryLayout<Int16>.size
    wav.reserveCapacity(44 + payloadBytes)
    wav.append(contentsOf: Array("RIFF".utf8)); appendUInt32LE(UInt32(36 + payloadBytes), to: &wav)
    wav.append(contentsOf: Array("WAVEfmt ".utf8)); appendUInt32LE(16, to: &wav)
    appendUInt16LE(1, to: &wav); appendUInt16LE(UInt16(channels), to: &wav)
    appendUInt32LE(UInt32(sampleRate), to: &wav); appendUInt32LE(UInt32(sampleRate * channels * 2), to: &wav)
    appendUInt16LE(UInt16(channels * 2), to: &wav); appendUInt16LE(16, to: &wav)
    wav.append(contentsOf: Array("data".utf8)); appendUInt32LE(UInt32(payloadBytes), to: &wav)
    for sample in samples { appendUInt16LE(UInt16(bitPattern: sample), to: &wav) }
    let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent("env-voice-effects-\(UUID().uuidString).wav")
    try wav.write(to: outputURL, options: .atomic)
    return outputURL
}

private struct NativeSavedVocalSetup: Codable, Identifiable {
    var id: String
    var name: String
    var presetID: String
    var eqBandsDb: [Double]
    var compressorThresholdDb: Double
    var compressorRatio: Double
    var outputGainDb: Double
    var voiceRenderGain: Double
    var effectAmount: Double
    var ampCharacter: String
    var ampDrive: Double
    var ampBassDb: Double
    var ampMidDb: Double
    var ampTrebleDb: Double
    var highPassHzOverride: Double?
    var lowPassHzOverride: Double?
    var micVolume: Double
    var backingVolume: Double
}

private struct PortableAudioStudioSettings: Codable {
    var presetId: String
    var micGain: Double
    var backingGain: Double
    var eqBandsDb: [Double]
    var eqProfile: String
    var highPassHz: Double?
    var lowPassHz: Double?
    var compressorThresholdDb: Double
    var compressorRatio: Double
    var outputGainDb: Double
    var reverbAmount: Double
    var delayAmount: Double
    var effectAmount: Double
    var ampCharacter: String
    var ampDrive: Double
    var ampBassDb: Double
    var ampMidDb: Double
    var ampTrebleDb: Double
}

private struct PortableAudioStudioPreset: Codable {
    var format: String
    var version: Int
    var name: String
    var exportedAt: String
    var settings: PortableAudioStudioSettings
}

private let portableAudioStudioPresetFormat = "env-audio-studio-preset"
private let portableAudioStudioPresetVersion = 1
private let portableAudioStudioPresetMaximumBytes = 256 * 1024

private func portablePreset(from setup: NativeSavedVocalSetup) -> PortableAudioStudioPreset {
    let settings = PortableAudioStudioSettings(
        presetId: setup.presetID, micGain: setup.voiceRenderGain * 100, backingGain: setup.backingVolume * 100,
        eqBandsDb: setup.eqBandsDb.map { max(-9, min(9, $0.isFinite ? $0 : 0)) }, eqProfile: "custom",
        highPassHz: setup.highPassHzOverride, lowPassHz: setup.lowPassHzOverride,
        compressorThresholdDb: setup.compressorThresholdDb, compressorRatio: setup.compressorRatio,
        outputGainDb: setup.outputGainDb, reverbAmount: setup.effectAmount * 100, delayAmount: setup.effectAmount * 100,
        effectAmount: setup.effectAmount * 100, ampCharacter: setup.ampCharacter, ampDrive: setup.ampDrive,
        ampBassDb: setup.ampBassDb, ampMidDb: setup.ampMidDb, ampTrebleDb: setup.ampTrebleDb
    )
    return PortableAudioStudioPreset(format: portableAudioStudioPresetFormat, version: portableAudioStudioPresetVersion,
                                      name: String(setup.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48)),
                                      exportedAt: ISO8601DateFormatter().string(from: Date()), settings: settings)
}

private func nativeSetup(fromPortable preset: PortableAudioStudioPreset, currentMicVolume: Double, currentBackingVolume: Double) -> NativeSavedVocalSetup? {
    guard preset.format == portableAudioStudioPresetFormat, preset.version == portableAudioStudioPresetVersion,
          !preset.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, preset.settings.eqBandsDb.count == 10 else { return nil }
    let settings = preset.settings
    let validPreset = nativeLiveVideoVocalPresets.contains(where: { $0.0 == settings.presetId }) ? settings.presetId : "clean"
    let amp = ["clean", "tube", "crunch", "fuzz"].contains(settings.ampCharacter) ? settings.ampCharacter : "clean"
    func bounded(_ value: Double, _ minimum: Double, _ maximum: Double, fallback: Double) -> Double {
        max(minimum, min(maximum, value.isFinite ? value : fallback))
    }
    let effect = bounded(settings.effectAmount, 0, 150, fallback: max(settings.reverbAmount, settings.delayAmount)) / 100
    return NativeSavedVocalSetup(
        id: UUID().uuidString, name: String(preset.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48)), presetID: validPreset,
        eqBandsDb: settings.eqBandsDb.map { bounded($0, -9, 9, fallback: 0) },
        compressorThresholdDb: bounded(settings.compressorThresholdDb, -36, -8, fallback: -20),
        compressorRatio: bounded(settings.compressorRatio, 1, 8, fallback: 3),
        outputGainDb: bounded(settings.outputGainDb, -12, 6, fallback: 0),
        voiceRenderGain: bounded(settings.micGain / 100, 0, 1.5, fallback: 1), effectAmount: effect,
        ampCharacter: amp, ampDrive: bounded(settings.ampDrive, 0, 100, fallback: 25),
        ampBassDb: bounded(settings.ampBassDb, -6, 6, fallback: 0), ampMidDb: bounded(settings.ampMidDb, -6, 6, fallback: 0),
        ampTrebleDb: bounded(settings.ampTrebleDb, -6, 6, fallback: 0),
        highPassHzOverride: settings.highPassHz.map { bounded($0, 20, 1_000, fallback: 70) },
        lowPassHzOverride: settings.lowPassHz.map { bounded($0, 1_000, 20_000, fallback: 20_000) },
        micVolume: currentMicVolume, backingVolume: bounded(settings.backingGain / 100, 0, 1, fallback: currentBackingVolume)
    )
}

private func readNativeSavedVocalSetups() -> [NativeSavedVocalSetup] {
    guard let data = UserDefaults.standard.data(forKey: "env.live-video-studio.saved-vocal-setups.v1"),
          let saved = try? JSONDecoder().decode([NativeSavedVocalSetup].self, from: data) else { return [] }
    return saved.prefix(30).compactMap { item in
        guard !item.id.isEmpty, !item.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              nativeLiveVideoVocalPresets.contains(where: { $0.0 == item.presetID }), item.eqBandsDb.count == 10 else { return nil }
        var clean = item
        clean.name = String(item.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48))
        clean.eqBandsDb = item.eqBandsDb.map { max(-9, min(9, $0.isFinite ? $0 : 0)) }
        clean.compressorThresholdDb = max(-36, min(-8, item.compressorThresholdDb))
        clean.compressorRatio = max(1, min(8, item.compressorRatio))
        clean.outputGainDb = max(-12, min(6, item.outputGainDb))
        clean.voiceRenderGain = max(0, min(1.5, item.voiceRenderGain))
        clean.effectAmount = max(0, min(1.5, item.effectAmount))
        clean.ampCharacter = ["clean", "tube", "crunch", "fuzz"].contains(item.ampCharacter) ? item.ampCharacter : "clean"
        clean.ampDrive = max(0, min(100, item.ampDrive))
        clean.ampBassDb = max(-6, min(6, item.ampBassDb)); clean.ampMidDb = max(-6, min(6, item.ampMidDb)); clean.ampTrebleDb = max(-6, min(6, item.ampTrebleDb))
        if let highPass = item.highPassHzOverride { clean.highPassHzOverride = max(20, min(1_000, highPass.isFinite ? highPass : 70)) }
        if let lowPass = item.lowPassHzOverride { clean.lowPassHzOverride = max(1_000, min(20_000, lowPass.isFinite ? lowPass : 20_000)) }
        clean.micVolume = max(0, min(1, item.micVolume)); clean.backingVolume = max(0, min(1, item.backingVolume))
        return clean
    }
}

private struct NativeMusicLiveVideoStudioView: View {
    @StateObject private var capture = NativeLiveVideoCapture()
    @State private var backingURL: URL?
    @State private var backingName = ""
    @State private var backingDurationSeconds = 0.0
    @State private var backingCueSeconds = 0.0
    @State private var vocalPresetID = "pop"
    @State private var presetSearch = ""
    @State private var player: AVQueuePlayer?
    @State private var playerLooper: AVPlayerLooper?
    @State private var mixing = false
    @State private var finalURL: URL?
    @State private var micVolume = 0.95
    @State private var backingVolume = 0.55
    @State private var showAdvancedSound = false
    @State private var eqBandsDb = Array(repeating: 0.0, count: 10)
    @State private var compressorThresholdDb = -20.0
    @State private var compressorRatio = 3.0
    @State private var outputGainDb = 0.0
    @State private var voiceRenderGain = 1.0
    @State private var effectAmount = 1.0
    @State private var ampCharacter = "clean"
    @State private var ampDrive = 25.0
    @State private var ampBassDb = 0.0
    @State private var ampMidDb = 0.0
    @State private var ampTrebleDb = 0.0
    @State private var highPassHzOverride: Double? = nil
    @State private var lowPassHzOverride: Double? = nil
    @State private var savedVocalSetups: [NativeSavedVocalSetup] = []
    @State private var savedSetupName = ""
    @State private var selectedSavedSetupID: String?
    @State private var abSnapshotA: NativeSavedVocalSetup?
    @State private var abSnapshotB: NativeSavedVocalSetup?
    @State private var activeAbSlot: String?
    @State private var showImporter = false
    @State private var showPresetImporter = false
    @State private var presetExportURL: URL?
    @State private var status = "Import a local backing track to begin."
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Live Video Singing Studio").font(.title2.weight(.semibold))
            Text("Record a native camera take over your backing track, then mix the recorded microphone and instrumental into one MP4 on this device.").font(.subheadline).foregroundStyle(.secondary)
            GroupBox("Rights & privacy") {
                Text("Use audio you own or have permission to perform. Source audio and recordings stay on device. Wired headphones reduce bleed and latency; Bluetooth may be too delayed for performance monitoring.").font(.footnote).frame(maxWidth: .infinity, alignment: .leading)
            }
            GroupBox("Quick start") {
                VStack(alignment: .leading, spacing: 8) {
                    Label(backingURL == nil ? "1 · Add a backing track" : "Backing track ready", systemImage: backingURL == nil ? "1.circle" : "checkmark.circle.fill")
                    Label("2 · Choose a vocal sound · \(nativeLiveVideoVocalPresets.first(where: { $0.0 == vocalPresetID })?.1 ?? "Clean Studio")", systemImage: "2.circle")
                    Label(capture.previewReady ? "Camera & mic ready" : "3 · Enable camera & mic, then record", systemImage: capture.previewReady ? "checkmark.circle.fill" : "3.circle")
                    Text("After your take, mix voice + backing, review the video, then export. Keep advanced controls closed until you need them.").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            if capture.previewReady {
                NativeLiveCameraPreview(session: capture.session).frame(height: 240).clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                RoundedRectangle(cornerRadius: 12).fill(Color.black.opacity(0.9)).frame(height: 180).overlay(Text("Camera preview starts after permission").font(.subheadline).foregroundStyle(.white))
            }
            VStack(spacing: 8) {
                Button(capture.previewReady ? "Camera & mic ready" : "Enable camera & mic") { capture.startPreview() }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                Button("Flip front / rear camera") { capture.toggleCamera() }.buttonStyle(.bordered).disabled(capture.recording || !capture.previewReady).frame(maxWidth: .infinity)
            }
            Button(backingURL == nil ? "Choose backing / instrumental" : "Change backing · \(backingName)") { showImporter = true }.buttonStyle(.bordered).disabled(capture.recording || mixing)
            if let backingURL {
                Text(backingURL.lastPathComponent).font(.footnote).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Backing cue · \(backingCueSeconds, specifier: "%.1f") sec").font(.footnote)
                    Slider(value: $backingCueSeconds, in: 0...max(0.1, backingDurationSeconds), step: 0.1).disabled(capture.recording || mixing)
                    Text("Performance starts at the selected cue; the source loops from there when composing the final video.").font(.caption).foregroundStyle(.secondary)
                }
                HStack {
                    Button("Preview backing") { startBackingAtCue() }.buttonStyle(.bordered)
                    Button("Pause") { player?.pause() }.buttonStyle(.bordered)
                }
                TextField("Search vocal presets", text: $presetSearch).textFieldStyle(.roundedBorder).disabled(capture.recording || mixing).accessibilityLabel("Search vocal presets")
                let matchingPresets = nativeLiveVideoVocalPresets.filter { preset in
                    presetSearch.isEmpty || preset.0.localizedCaseInsensitiveContains(presetSearch) || preset.1.localizedCaseInsensitiveContains(presetSearch)
                }
                if matchingPresets.isEmpty {
                    Text("No vocal presets match this search.").font(.caption).foregroundStyle(.secondary)
                } else {
                    Picker("Vocal render preset", selection: $vocalPresetID) {
                        ForEach(matchingPresets, id: \.0) { preset in Text(preset.1).tag(preset.0) }
                    }.pickerStyle(.menu).disabled(capture.recording || mixing)
                }
                Text("Selected effect is rendered locally on the microphone track before mixing the backing track. Live mic monitoring remains dry. Natural AutoPitch / Hard Tune require a real key-aware pitch engine and are not enabled in this build.").font(.caption).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Voice level · \(Int(micVolume * 100))%")
                    Slider(value: $micVolume, in: 0...1)
                    Text("Backing mix level · \(Int(backingVolume * 100))%")
                    Slider(value: $backingVolume, in: 0...1)
                }.font(.footnote)
                DisclosureGroup(isExpanded: $showAdvancedSound) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Ten-band graphic EQ · ±9 dB").font(.subheadline.weight(.semibold))
                        Text("Start with small cuts when a sound is muddy or harsh; boosts use more headroom.").font(.caption).foregroundStyle(.secondary)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], spacing: 8) {
                            ForEach(Array(nativeEQProfiles.enumerated()), id: \.offset) { _, profile in
                                Button(profile.0) { eqBandsDb = profile.1 }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                            }
                        }
                        GeometryReader { geometry in
                            ZStack {
                                ForEach([-9.0, -6, -3, 0, 3, 6, 9], id: \.self) { gain in
                                    Path { path in
                                        let y = CGFloat((9 - gain) / 18) * geometry.size.height
                                        path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: geometry.size.width, y: y))
                                    }.stroke(Color.primary.opacity(gain == 0 ? 0.35 : 0.12), style: StrokeStyle(lineWidth: 1, dash: gain == 0 ? [] : [3, 5]))
                                }
                                Path { path in
                                    for index in eqBandsDb.indices {
                                        let x = CGFloat(index) / CGFloat(max(1, eqBandsDb.count - 1)) * geometry.size.width
                                        let y = CGFloat((9 - max(-9, min(9, eqBandsDb[index]))) / 18) * geometry.size.height
                                        if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                                    }
                                }.stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                                ForEach(eqBandsDb.indices, id: \.self) { index in
                                    Circle().fill(Color.accentColor).frame(width: 7, height: 7)
                                        .position(x: CGFloat(index) / CGFloat(max(1, eqBandsDb.count - 1)) * geometry.size.width,
                                                  y: CGFloat((9 - max(-9, min(9, eqBandsDb[index]))) / 18) * geometry.size.height)
                                }
                            }
                            .contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                                guard geometry.size.width > 0, geometry.size.height > 0, !capture.recording, !mixing else { return }
                                let scaledX = value.location.x / geometry.size.width * CGFloat(max(1, eqBandsDb.count - 1))
                                let index = max(0, min(eqBandsDb.count - 1, Int(scaledX.rounded())))
                                let gain = max(-9, min(9, 9 - Double(value.location.y / geometry.size.height) * 18))
                                eqBandsDb[index] = (gain * 2).rounded() / 2
                            })
                        }.frame(height: 112).accessibilityElement(children: .ignore).accessibilityLabel("Interactive ten-band EQ response preview. Drag vertically to change the nearest band; use the labelled sliders for precise keyboard or VoiceOver adjustment. Control response, not a measured spectrum.").accessibilityHint("Drag vertically to change gain for the nearest frequency band.")
                        Text("Drag the curve to adjust a band, or use the labelled sliders below for precise values.").font(.caption).foregroundStyle(.secondary)
                        ForEach(Array(nativeEQFrequencies.enumerated()), id: \.offset) { index, frequency in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(Int(frequency)) Hz · \(eqBandsDb[index], specifier: "%+.0f") dB").font(.caption)
                                Slider(value: $eqBandsDb[index], in: -9...9, step: 1).disabled(capture.recording || mixing)
                            }
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            let presetFilterDefaults = NativeVocalEffectParameters.preset(vocalPresetID)
                        HStack {
                            Text("Filter / cleanup").font(.subheadline.weight(.semibold))
                            Spacer(minLength: 8)
                            Button("Use preset defaults") { highPassHzOverride = nil; lowPassHzOverride = nil }
                                .font(.caption).disabled(capture.recording || mixing || (highPassHzOverride == nil && lowPassHzOverride == nil))
                        }
                        Text("High-pass / low cut · \((highPassHzOverride ?? presetFilterDefaults.highPassHz), specifier: "%.0f") Hz\(highPassHzOverride == nil ? " · preset" : " · custom")").font(.caption)
                        Slider(value: Binding(get: { highPassHzOverride ?? presetFilterDefaults.highPassHz }, set: { highPassHzOverride = $0 }), in: 20...1_000, step: 5).disabled(capture.recording || mixing)
                        let shownLowPassHz = lowPassHzOverride ?? presetFilterDefaults.lowPassHz
                        Text("Low-pass / high cut · \(shownLowPassHz >= 19_999 ? "Off" : String(format: "%.0f Hz", shownLowPassHz))\(lowPassHzOverride == nil ? " · preset" : " · custom")").font(.caption)
                        Slider(value: Binding(get: { lowPassHzOverride ?? presetFilterDefaults.lowPassHz }, set: { lowPassHzOverride = $0 }), in: 1_000...20_000, step: 100).disabled(capture.recording || mixing)
                        Text("Raise the low-cut to reduce rumble; lower the high-cut to darken the vocal. A 20 kHz high-cut bypasses the manual filter.").font(.caption).foregroundStyle(.secondary)
                        Text("Preamp / amplifier colour").font(.subheadline.weight(.semibold))
                            Text("Creative saturation and a three-control tone stack; not a physical amplifier or speaker-cabinet simulation.").font(.caption).foregroundStyle(.secondary)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 136), spacing: 8)], spacing: 8) {
                                ForEach(nativeAmpCharacters, id: \.0) { amp in
                                    Button { ampCharacter = amp.0 } label: {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(ampCharacter == amp.0 ? "✓ \(amp.1)" : amp.1).font(.subheadline.weight(.medium))
                                            Text(amp.2).font(.caption).foregroundStyle(.secondary)
                                        }.frame(maxWidth: .infinity, alignment: .leading)
                                    }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                                }
                            }
                            Text("Drive / saturation · \(ampDrive, specifier: "%.0f")%").font(.caption)
                            Slider(value: $ampDrive, in: 0...100, step: 1).disabled(capture.recording || mixing || ampCharacter == "clean")
                            Text("Bass tone · \(ampBassDb, specifier: "%+.1f") dB").font(.caption)
                            Slider(value: $ampBassDb, in: -6...6, step: 0.5).disabled(capture.recording || mixing)
                            Text("Mid tone · \(ampMidDb, specifier: "%+.1f") dB").font(.caption)
                            Slider(value: $ampMidDb, in: -6...6, step: 0.5).disabled(capture.recording || mixing)
                            Text("Treble tone · \(ampTrebleDb, specifier: "%+.1f") dB").font(.caption)
                            Slider(value: $ampTrebleDb, in: -6...6, step: 0.5).disabled(capture.recording || mixing)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Compressor threshold · \(compressorThresholdDb, specifier: "%.0f") dB").font(.caption)
                            Slider(value: $compressorThresholdDb, in: -36 ... -8, step: 1).disabled(capture.recording || mixing)
                            Text("Compression ratio · \(compressorRatio, specifier: "%.1f"):1").font(.caption)
                            Slider(value: $compressorRatio, in: 1...8, step: 0.5).disabled(capture.recording || mixing)
                            Text("Voice render gain · \(voiceRenderGain * 100, specifier: "%.0f")%").font(.caption)
                            Slider(value: $voiceRenderGain, in: 0...1.5, step: 0.05).disabled(capture.recording || mixing)
                            Text("Output trim · \(outputGainDb, specifier: "%+.0f") dB").font(.caption)
                            Slider(value: $outputGainDb, in: -12...6, step: 1).disabled(capture.recording || mixing)
                            Text("Preset ambience / echo send · \(effectAmount * 100, specifier: "%.0f")%").font(.caption)
                            Slider(value: $effectAmount, in: 0...1.5, step: 0.05).disabled(capture.recording || mixing)
                        }
                        Text("My saved sound setups · this device").font(.subheadline.weight(.semibold))
                        Text("Only sound values are stored locally. Backing files, microphone audio and recordings are not saved in these setups.").font(.caption).foregroundStyle(.secondary)
                        Text("A/B quick compare · temporary snapshots").font(.subheadline.weight(.semibold))
                        Text("Save A, change the sound, save B, then recall either snapshot to compare by ear. Snapshots stay in memory only.").font(.caption).foregroundStyle(.secondary)
                        HStack(spacing: 8) {
                            Button(abSnapshotA == nil ? "Save current to A" : "Replace A") { abSnapshotA = currentVocalSetup(name: "Snapshot A", id: "ab-A"); activeAbSlot = "A" }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                            Button(abSnapshotB == nil ? "Save current to B" : "Replace B") { abSnapshotB = currentVocalSetup(name: "Snapshot B", id: "ab-B"); activeAbSlot = "B" }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                        }
                        HStack(spacing: 8) {
                            Button(activeAbSlot == "A" ? "✓ Recall A" : "Recall A") { if let snapshot = abSnapshotA { applySavedVocalSetup(snapshot); selectedSavedSetupID = nil; activeAbSlot = "A" } }.buttonStyle(.bordered).disabled(abSnapshotA == nil || capture.recording || mixing)
                            Button(activeAbSlot == "B" ? "✓ Recall B" : "Recall B") { if let snapshot = abSnapshotB { applySavedVocalSetup(snapshot); selectedSavedSetupID = nil; activeAbSlot = "B" } }.buttonStyle(.bordered).disabled(abSnapshotB == nil || capture.recording || mixing)
                        }
                        HStack(spacing: 8) {
                            Button("Import preset JSON") { showPresetImporter = true }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                            Button("Prepare preset export") {
                                let setup = currentVocalSetup(name: savedSetupName.isEmpty ? "Current sound" : savedSetupName)
                                let preset = portablePreset(from: setup)
                                do {
                                    let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                                    let data = try encoder.encode(preset)
                                    guard data.count <= portableAudioStudioPresetMaximumBytes else { throw NativeSimpleError.message("Preset exceeded the 256 KB safety limit.") }
                                    let safeName = setup.name.lowercased().replacingOccurrences(of: "[^a-z0-9_-]+", with: "-", options: .regularExpression)
                                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("env-\(safeName.isEmpty ? "sound-setup" : safeName).env-audio-preset.json")
                                    try data.write(to: url, options: .atomic); presetExportURL = url; error = nil
                                    status = "Preset JSON is ready to share or save. It contains sound settings only."
                                } catch { self.error = error.localizedDescription }
                            }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                            if let presetExportURL { ShareLink(item: presetExportURL) { Label("Share JSON", systemImage: "square.and.arrow.up") }.buttonStyle(.borderedProminent) }
                        }
                        Text("Portable versioned JSON contains sound controls only (max 256 KB); unsupported pitch presets fall back to Clean Studio on the receiving device.").font(.caption).foregroundStyle(.secondary)
                        TextField("Setup name", text: $savedSetupName).textFieldStyle(.roundedBorder).disabled(capture.recording || mixing)
                        HStack {
                            Button("Save setup") { saveCurrentVocalSetup() }.buttonStyle(.borderedProminent).disabled(capture.recording || mixing || savedSetupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            Menu {
                                ForEach(savedVocalSetups) { setup in
                                    Button(setup.name) { applySavedVocalSetup(setup) }
                                }
                            } label: {
                                Label("Load saved setup", systemImage: "folder")
                            }.buttonStyle(.bordered).disabled(capture.recording || mixing || savedVocalSetups.isEmpty)
                        }
                        if let selectedName = selectedSavedSetupID.flatMap({ id in savedVocalSetups.first(where: { $0.id == id })?.name }) {
                            HStack {
                                Text("Selected: \(selectedName)").font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                                Spacer(minLength: 4)
                                Button("Delete") { deleteSelectedVocalSetup() }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                            }
                        }
                        Button("Reset advanced sound") {
                            eqBandsDb = Array(repeating: 0, count: 10); compressorThresholdDb = -20; compressorRatio = 3; outputGainDb = 0; voiceRenderGain = 1; effectAmount = 1; ampCharacter = "clean"; ampDrive = 25; ampBassDb = 0; ampMidDb = 0; ampTrebleDb = 0; highPassHzOverride = nil; lowPassHzOverride = nil
                        }.buttonStyle(.bordered).disabled(capture.recording || mixing)
                    }.padding(.top, 8)
                } label: {
                    Label("Advanced EQ & dynamics", systemImage: "slider.horizontal.3").font(.subheadline.weight(.semibold))
                }.disabled(capture.recording || mixing)
                HStack {
                    Button(capture.recording ? "Recording…" : "Start performance") {
                        finalURL = nil
                        capture.onRecordingStarted = { startBackingAtCue() }
                        capture.beginRecording()
                    }.buttonStyle(.borderedProminent).disabled(!capture.previewReady || capture.recording || mixing)
                    Button("Stop") { capture.stopRecording(); player?.pause() }.buttonStyle(.bordered).disabled(!capture.recording)
                }
                if let captured = capture.capturedURL {
                    Button(mixing ? "Mixing…" : "Mix voice + backing") { Task { await renderMix(captureURL: captured, backingURL: backingURL, presetID: vocalPresetID) } }.buttonStyle(.borderedProminent).disabled(mixing || capture.recording)
                }
            }
            if mixing { ProgressView("Rendering local MP4…") }
            if let finalURL {
                VideoPlayer(player: AVPlayer(url: finalURL)).frame(height: 220).clipShape(RoundedRectangle(cornerRadius: 12))
                ShareLink(item: finalURL) { Label("Export / share MP4", systemImage: "square.and.arrow.up") }.buttonStyle(.borderedProminent)
            }
            if let captureError = capture.error { Text(captureError).font(.footnote).foregroundStyle(.red) }
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            Text(status).font(.footnote).foregroundStyle(.secondary)
        }
        .onAppear { savedVocalSetups = readNativeSavedVocalSetups() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.audio], allowsMultipleSelection: false) { result in
            do {
                guard let selected = try result.get().first else { return }
                let accessing = selected.startAccessingSecurityScopedResource()
                defer { if accessing { selected.stopAccessingSecurityScopedResource() } }
                let ext = selected.pathExtension.isEmpty ? "audio" : selected.pathExtension
                let destination = FileManager.default.temporaryDirectory.appendingPathComponent("env-backing-\(UUID().uuidString).\(ext)")
                try FileManager.default.copyItem(at: selected, to: destination)
                backingURL = destination; backingName = destination.lastPathComponent
                let backingAsset = AVURLAsset(url: destination)
                let measuredDuration = CMTimeGetSeconds(backingAsset.duration)
                backingDurationSeconds = measuredDuration.isFinite ? max(0, measuredDuration) : 0
                backingCueSeconds = 0
                let queue = AVQueuePlayer()
                let item = AVPlayerItem(url: destination)
                playerLooper = AVPlayerLooper(player: queue, templateItem: item)
                player = queue
                status = "Backing track ready; playback is looped for practice."
                error = nil
            } catch { self.error = "Could not import the selected audio: \(error.localizedDescription)" }
        }
        .fileImporter(isPresented: $showPresetImporter, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
            do {
                guard let selected = try result.get().first else { return }
                let accessing = selected.startAccessingSecurityScopedResource()
                defer { if accessing { selected.stopAccessingSecurityScopedResource() } }
                let attributes = try FileManager.default.attributesOfItem(atPath: selected.path)
                if let size = attributes[.size] as? NSNumber, size.intValue > portableAudioStudioPresetMaximumBytes { throw NativeSimpleError.message("Preset files must be 256 KB or smaller.") }
                try importPortablePreset(Data(contentsOf: selected, options: .mappedIfSafe))
                error = nil
            } catch { self.error = error.localizedDescription }
        }
        .onDisappear { capture.stopPreview(); player?.pause() }
    }

    private func startBackingAtCue() {
        guard let backingURL else { return }
        let queue = AVQueuePlayer()
        let item = AVPlayerItem(url: backingURL)
        let duration = CMTime(seconds: backingDurationSeconds, preferredTimescale: 600)
        let start = CMTime(seconds: min(max(0, backingCueSeconds), max(0, backingDurationSeconds - 0.05)), preferredTimescale: 600)
        let remaining = CMTimeSubtract(duration, start)
        playerLooper = AVPlayerLooper(player: queue, templateItem: item, timeRange: CMTimeRange(start: start, duration: remaining))
        player = queue
        queue.play()
    }

    private func currentVocalSetup(name: String, id: String = UUID().uuidString) -> NativeSavedVocalSetup {
        NativeSavedVocalSetup(
            id: id, name: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48)), presetID: vocalPresetID,
            eqBandsDb: eqBandsDb.map { max(-9, min(9, $0.isFinite ? $0 : 0)) }, compressorThresholdDb: compressorThresholdDb,
            compressorRatio: compressorRatio, outputGainDb: outputGainDb, voiceRenderGain: voiceRenderGain, effectAmount: effectAmount,
            ampCharacter: ampCharacter, ampDrive: ampDrive, ampBassDb: ampBassDb, ampMidDb: ampMidDb, ampTrebleDb: ampTrebleDb,
            highPassHzOverride: highPassHzOverride, lowPassHzOverride: lowPassHzOverride, micVolume: micVolume, backingVolume: backingVolume
        )
    }

    private func importPortablePreset(_ data: Data) throws {
        guard data.count <= portableAudioStudioPresetMaximumBytes else { throw NativeSimpleError.message("Preset files must be 256 KB or smaller.") }
        let preset = try JSONDecoder().decode(PortableAudioStudioPreset.self, from: data)
        guard let setup = nativeSetup(fromPortable: preset, currentMicVolume: micVolume, currentBackingVolume: backingVolume) else {
            throw NativeSimpleError.message("Unsupported or invalid enV Audio Studio preset. Only version 1 files are supported.")
        }
        let duplicate = savedVocalSetups.first(where: { $0.name.localizedCaseInsensitiveCompare(setup.name) == .orderedSame })
        var imported = setup
        if let duplicate { imported.id = duplicate.id }
        savedVocalSetups = ([imported] + savedVocalSetups.filter { $0.id != imported.id }).prefix(30).map { $0 }
        if let encoded = try? JSONEncoder().encode(savedVocalSetups) { UserDefaults.standard.set(encoded, forKey: "env.live-video-studio.saved-vocal-setups.v1") }
        applySavedVocalSetup(imported)
        status = "Imported \(imported.name) and applied the settings locally. Unsupported pitch presets fall back to Clean Studio on this device."
    }

    @MainActor
    private func saveCurrentVocalSetup() {
        let name = String(savedSetupName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48))
        guard !name.isEmpty else { error = "Enter a name for this sound setup before saving."; return }
        let existing = savedVocalSetups.first(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame })
        let setup = currentVocalSetup(name: name, id: existing?.id ?? UUID().uuidString)
        savedVocalSetups = ([setup] + savedVocalSetups.filter { $0.id != setup.id }).prefix(30).map { $0 }
        selectedSavedSetupID = setup.id; savedSetupName = setup.name; error = nil
        if let data = try? JSONEncoder().encode(savedVocalSetups) {
            UserDefaults.standard.set(data, forKey: "env.live-video-studio.saved-vocal-setups.v1")
            status = "Saved “\(setup.name)” on this device. Only sound-control values were stored; no audio or video was saved in the setup."
        } else {
            error = "Could not save this sound setup to device storage. Your current controls remain unchanged."
        }
    }

    private func applySavedVocalSetup(_ setup: NativeSavedVocalSetup) {
        vocalPresetID = setup.presetID; eqBandsDb = setup.eqBandsDb; compressorThresholdDb = setup.compressorThresholdDb
        compressorRatio = setup.compressorRatio; outputGainDb = setup.outputGainDb; voiceRenderGain = setup.voiceRenderGain; effectAmount = setup.effectAmount
        ampCharacter = setup.ampCharacter; ampDrive = setup.ampDrive; ampBassDb = setup.ampBassDb; ampMidDb = setup.ampMidDb; ampTrebleDb = setup.ampTrebleDb
        highPassHzOverride = setup.highPassHzOverride; lowPassHzOverride = setup.lowPassHzOverride; micVolume = setup.micVolume; backingVolume = setup.backingVolume
        selectedSavedSetupID = setup.id; savedSetupName = setup.name; error = nil
        status = "Loaded “\(setup.name)”. Make a short test take and adjust by ear before a full performance."
    }

    private func deleteSelectedVocalSetup() {
        guard let id = selectedSavedSetupID, let setup = savedVocalSetups.first(where: { $0.id == id }) else { return }
        savedVocalSetups.removeAll { $0.id == id }; selectedSavedSetupID = nil; savedSetupName = ""
        if let data = try? JSONEncoder().encode(savedVocalSetups) { UserDefaults.standard.set(data, forKey: "env.live-video-studio.saved-vocal-setups.v1") }
        status = "Deleted “\(setup.name)” from this device. Existing recordings were not changed."
    }

    private func renderMix(captureURL: URL, backingURL: URL, presetID: String) async {
        mixing = true; error = nil; status = "Mixing camera and backing audio locally…"
        defer { mixing = false }
        do {
            let cameraAsset = AVURLAsset(url: captureURL)
            let backingAsset = AVURLAsset(url: backingURL)
            guard let sourceVideo = cameraAsset.tracks(withMediaType: .video).first else { throw NativeSimpleError.message("The camera recording has no video track.") }
            guard cameraAsset.tracks(withMediaType: .audio).first != nil else { throw NativeSimpleError.message("The camera recording has no microphone audio track.") }
            guard let sourceBacking = backingAsset.tracks(withMediaType: .audio).first else { throw NativeSimpleError.message("The selected backing track has no decodable audio.") }
            let eqBands = eqBandsDb
            let thresholdDB = compressorThresholdDb
            let ratio = compressorRatio
            let outputTrim = outputGainDb
            let voiceGain = voiceRenderGain
            let effectsSend = effectAmount
            let selectedAmpCharacter = ampCharacter
            let selectedAmpDrive = ampDrive
            let selectedAmpBass = ampBassDb
            let selectedAmpMid = ampMidDb
            let selectedAmpTreble = ampTrebleDb
            let selectedHighPassHzOverride = highPassHzOverride
            let selectedLowPassHzOverride = lowPassHzOverride
            let processedVoiceURL = try await Task.detached(priority: .userInitiated) {
                try createNativeProcessedVoiceWav(captureURL: captureURL, presetID: presetID, eqBandsDb: eqBands, compressorThresholdDb: thresholdDB, compressorRatioOverride: ratio, outputGainDb: outputTrim, voiceRenderGain: voiceGain, effectAmount: effectsSend, ampCharacter: selectedAmpCharacter, ampDrive: selectedAmpDrive, ampBassDb: selectedAmpBass, ampMidDb: selectedAmpMid, ampTrebleDb: selectedAmpTreble, highPassHzOverride: selectedHighPassHzOverride, lowPassHzOverride: selectedLowPassHzOverride)
            }.value
            defer { try? FileManager.default.removeItem(at: processedVoiceURL) }
            let processedVoiceAsset = AVURLAsset(url: processedVoiceURL)
            guard let sourceMic = processedVoiceAsset.tracks(withMediaType: .audio).first else { throw NativeSimpleError.message("The processed microphone track could not be reopened for composition.") }
            let duration = cameraAsset.duration
            guard duration.isNumeric, CMTimeGetSeconds(duration) > 0 else { throw NativeSimpleError.message("The captured recording duration is invalid.") }
            let composition = AVMutableComposition()
            guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
                  let micTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
                  let backingTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
                throw NativeSimpleError.message("Could not allocate export tracks.")
            }
            try videoTrack.insertTimeRange(CMTimeRange(start: sourceVideo.timeRange.start, duration: duration), of: sourceVideo, at: .zero)
            let voiceDuration = CMTimeCompare(sourceMic.timeRange.duration, duration) < 0 ? sourceMic.timeRange.duration : duration
            guard voiceDuration.isNumeric, CMTimeGetSeconds(voiceDuration) > 0 else { throw NativeSimpleError.message("The processed microphone track has no usable duration.") }
            try micTrack.insertTimeRange(CMTimeRange(start: sourceMic.timeRange.start, duration: voiceDuration), of: sourceMic, at: .zero)
            let requestedCue = CMTime(seconds: max(0, backingCueSeconds), preferredTimescale: 600)
            let trackStart = CMTimeAdd(sourceBacking.timeRange.start, requestedCue)
            let sourceEnd = sourceBacking.timeRange.end
            let sourceDuration = CMTimeSubtract(sourceEnd, trackStart)
            guard sourceDuration.isNumeric, CMTimeGetSeconds(sourceDuration) > 0 else { throw NativeSimpleError.message("The selected backing cue is beyond the end of the track.") }
            var cursor = CMTime.zero
            while CMTimeCompare(cursor, duration) < 0 {
                let remaining = CMTimeSubtract(duration, cursor)
                let chunk = CMTimeCompare(sourceDuration, remaining) < 0 ? sourceDuration : remaining
                try backingTrack.insertTimeRange(CMTimeRange(start: trackStart, duration: chunk), of: sourceBacking, at: cursor)
                cursor = CMTimeAdd(cursor, chunk)
            }
            let mix = AVMutableAudioMix()
            let voiceParams = AVMutableAudioMixInputParameters(track: micTrack)
            voiceParams.setVolume(Float(micVolume), at: .zero)
            let backingParams = AVMutableAudioMixInputParameters(track: backingTrack)
            backingParams.setVolume(Float(backingVolume), at: .zero)
            mix.inputParameters = [voiceParams, backingParams]
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("env-live-mix-\(UUID().uuidString).mp4")
            guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw NativeSimpleError.message("This device cannot export the selected composition.") }
            exporter.outputURL = output; exporter.outputFileType = .mp4; exporter.audioMix = mix
            await withCheckedContinuation { continuation in exporter.exportAsynchronously { continuation.resume() } }
            guard exporter.status == .completed else {
                try? FileManager.default.removeItem(at: output)
                throw NativeSimpleError.message(exporter.error?.localizedDescription ?? "The MP4 export did not complete.")
            }
            finalURL = output; status = "Final MP4 ready. The selected \(presetID) preset was rendered on the microphone track before the backing mix. Review voice/backing balance before sharing."
        } catch { self.error = error.localizedDescription; status = "Mix failed; original camera recording remains available for another attempt." }
    }
}

private struct NativeAudioToolView: View {
    let tool: Tool
    @State private var platform: String
    @State private var duration = "180"
    @State private var bitrate = "128"
    @State private var sampleRate = "44100"
    @State private var channels = "2"
    @State private var bits = "16"
    @State private var bpm = "120"
    @State private var bars = "4"
    @State private var calculationMode = "bitrate"
    @State private var targetSizeMegabytes = "0.96"
    @State private var output = ""
    @State private var error: String?

    init(tool: Tool) {
        self.tool = tool
        let prefixes = ["podcast", "discord", "spotify", "instagram", "apple-music", "youtube", "tiktok", "twitch"]
        _platform = State(initialValue: prefixes.first(where: { tool.id.hasPrefix($0 + "-") }) ?? "podcast")
        _calculationMode = State(initialValue: tool.id == "audio-file-size-calculator" ? "file-size" : "bitrate")
    }

    var body: some View {
        let operation = NativeAudioEngine.operation(for: tool) ?? "guide"
        if operation == "record-mic" {
            NativeAudioRecorderToolView(title: tool.name)
        } else if operation == "generate-tone" || operation == "generate-metronome" {
            NativeAudioGeneratorToolView(operation: operation, title: tool.name)
        } else if operation == "file:joiner" {
            NativeAudioWavJoinerToolView(title: tool.name)
        } else if operation.hasPrefix("file:") {
            NativeAudioWaveFileToolView(operation: String(operation.dropFirst(5)), title: tool.name)
        } else {
        VStack(alignment: .leading, spacing: 12) {
            Text("Native offline mode. These calculator and reference operations do not upload audio files or use the website.").font(.footnote).foregroundStyle(.secondary)
            NativeInputField(title: "Platform (podcast, spotify, discord, instagram, apple-music)", text: $platform)
            if operation == "calc" { NativeInputField(title: "Mode: bitrate, bitrate-from-size, file-size, pcm-size, duration, BPM, sample-rate", text: $calculationMode) }
            if ["bitrate", "file-size", "pcm-size", "duration"].contains(operation) || (operation == "calc" && ["bitrate", "file-size", "pcm-size", "duration", "bitrate-from-size"].contains(calculationMode)) {
                NativeInputField(title: "Duration (seconds)", text: $duration)
                if !(operation == "calc" && calculationMode == "bitrate-from-size") { NativeInputField(title: "Bitrate (kbps)", text: $bitrate) }
            }
            if operation == "calc" && calculationMode == "bitrate-from-size" { NativeInputField(title: "Target size (decimal MB)", text: $targetSizeMegabytes) }
            if operation == "pcm-size" || (operation == "calc" && calculationMode == "pcm-size") {
                NativeInputField(title: "Sample rate (Hz)", text: $sampleRate)
                NativeInputField(title: "Channels", text: $channels)
                NativeInputField(title: "Bit depth", text: $bits)
            }
            if operation == "sample-rate" || (operation == "calc" && calculationMode == "sample-rate") { NativeInputField(title: "Sample rate (Hz)", text: $sampleRate) }
            if operation == "bpm" || (operation == "calc" && calculationMode == "bpm") {
                NativeInputField(title: "BPM", text: $bpm)
                NativeInputField(title: "Bars in 4/4", text: $bars)
            }
            NativeActionRow(output: output, run: {
                do { output = try NativeAudioEngine.calculate(operation: operation == "calc" ? calculationMode : operation, platform: platform, duration: Double(duration) ?? 0, bitrate: Double(bitrate) ?? 0, sampleRate: Double(sampleRate) ?? 0, channels: Int(channels) ?? 0, bits: Int(bits) ?? 0, bpm: Double(bpm) ?? 0, bars: Int(bars) ?? 0, targetSizeMegabytes: Double(targetSizeMegabytes) ?? 0); error = nil }
                catch { output = ""; self.error = error.localizedDescription }
            }, reset: { duration = "180"; bitrate = "128"; sampleRate = "44100"; channels = "2"; bits = "16"; bpm = "120"; bars = "4"; targetSizeMegabytes = "0.96"; calculationMode = tool.id == "audio-file-size-calculator" ? "file-size" : "bitrate"; output = ""; error = nil })
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
            if tool.id == "sql-formatter" {
                Picker("SQL dialect", selection: Binding(get: { options["dialect", default: "postgresql"] }, set: { options["dialect"] = $0 })) {
                    Text("Generic SQL").tag("sql"); Text("PostgreSQL").tag("postgresql"); Text("MySQL").tag("mysql"); Text("MariaDB").tag("mariadb"); Text("SQLite").tag("sqlite"); Text("SQL Server / T-SQL").tag("transactsql"); Text("BigQuery").tag("bigquery"); Text("Snowflake").tag("snowflake"); Text("Oracle").tag("oracle"); Text("Redshift").tag("redshift"); Text("DuckDB").tag("duckdb")
                }.pickerStyle(.menu).accessibilityLabel("SQL dialect")
                Text("Uses a local dialect-aware lexer, not a full SQL grammar parser or query validator.").font(.footnote).foregroundStyle(.secondary)
            }
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

private struct DynamicTypePreviewText: View {
    @ScaledMetric(relativeTo: .body) private var scaledSize: CGFloat = 18
    let text: String
    let lineHeight: Double

    init(text: String, size: CGFloat, lineHeight: Double) {
        self.text = text
        self.lineHeight = lineHeight
        _scaledSize = ScaledMetric(wrappedValue: size, relativeTo: .body)
    }

    var body: some View {
        Text(text)
            .font(.system(size: scaledSize))
            .lineSpacing(max(0, scaledSize * CGFloat(lineHeight - 1)))
    }
}

struct NativeAccessibilityToolView: View {
    let tool: Tool
    @State private var showAPCAWebView = false
    @State private var input = ""
    @State private var studioMode: String
    @State private var foreground = "#000000"
    @State private var background = "#ffffff"
    @State private var fontSize = "16px"
    @State private var lineHeight = "1.5"
    @State private var focusWidth = "3px"
    @State private var focusOffset = "3px"
    @State private var ariaPattern = "button"
    @State private var output = ""
    @State private var previewSize = 18.0
    @State private var previewLineHeight = 1.5
    @State private var focusDark = false
    @State private var focusForced = false
    @State private var showFocusRing = false
    @State private var focusInput = ""
    @State private var motionOn = false
    @State private var reduceMotion = false
    @State private var demoEmail = ""
    @State private var demoSubmitted = false
    @State private var demoValid = false

    init(tool: Tool) {
        self.tool = tool
        let rawKind = NativeAccessibilityEngine.kind(tool.id)
        let suffix = tool.id.components(separatedBy: "-").last ?? "checker"
        let initial = rawKind == "color-blindness" ? "simulator" : (["checker", "generator", "helper", "preview", "simulator"].contains(suffix) ? suffix : "checker")
        _studioMode = State(initialValue: initial)
    }
    private var kind: String { NativeAccessibilityEngine.kind(tool.id) }
    private var studioKind: String { ["accessible-color", "color-blindness"].contains(kind) ? "contrast" : ["font-size", "line-height"].contains(kind) ? "text-readability" : kind }
    private var colorTool: Bool { studioKind == "contrast" }
    private var sizeTool: Bool { studioKind == "text-readability" }
    private var textTool: Bool { studioKind == "text-readability" }
    private var altCoach: Bool { kind == "alt-text" && studioMode == "helper" }
    private var focusGenerator: Bool { kind == "focus-state" && studioMode == "generator" }
    private var modes: [String] { ["checker", "generator", "helper", "preview", "simulator"] }
    private var engineToolID: String { colorTool && studioMode == "simulator" ? "color-blindness-simulator" : "\(studioKind)-\(studioMode)" }
    private var codeTool: Bool { studioMode != "generator" && !colorTool && !sizeTool && !altCoach && !(kind == "form" && studioMode == "simulator") }
    private var studioTitle: String { ["contrast": "Color Contrast Studio", "alt-text": "Alt Text Studio", "focus-state": "Focus State Studio", "text-readability": "Text & Readability Studio", "aria": "ARIA Studio", "motion": "Motion & Reduced Motion Studio", "keyboard-navigation": "Keyboard Navigation Studio", "form": "Form Accessibility Studio"][studioKind] ?? tool.name }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText(studioTitle).font(.envScaled(size: 20, weight: .semibold)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(tool.description)
                .font(.envScaled(size: 14, weight: .regular)).foregroundStyle(Color.envInk)
            enVCharacterSpacedText(colorTool ? "Native contrast checks run on this device; APCA opens the web implementation." : "Runs on this device · your text and markup are not uploaded.")
                .font(.envScaled(size: 13, weight: .regular)).foregroundStyle(Color.envMuted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(modes, id: \.self) { mode in
                        let title = mode == "checker" ? "Check" : mode == "generator" ? "Generate" : mode == "helper" ? "Coach / fix" : mode == "preview" ? "Preview" : "Test"
                        let selected = studioMode == mode
                        Button {
                            studioMode = mode; output = ""
                        } label: {
                            enVCharacterSpacedText("\(selected ? "✓ " : "")\(title)")
                                .font(.envScaled(size: 13, weight: selected ? .semibold : .regular))
                                .foregroundStyle(selected ? Color.white : Color.accentColor)
                                .padding(.horizontal, 14).frame(minHeight: 48)
                                .background(selected ? Color.accentColor : Color.clear, in: Capsule())
                                .overlay(Capsule().stroke(Color.accentColor, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(title)\(studioMode == mode ? ", selected" : "")")
                    }
                }
            }
            if colorTool {
                Button { showAPCAWebView = true } label: {
                    Label("APCA · Web only", systemImage: "safari")
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Open APCA in web view")
                .accessibilityHint("Requires an internet connection. Native color values are not transferred to the web page.")
                enVCharacterSpacedText("APCA runs only in the web Color Contrast Studio; native checks remain on-device.")
                    .font(.envScaled(size: 12, weight: .regular)).foregroundStyle(Color.envMuted)
            }
            if colorTool {
                NativeInputField(title: "Foreground color", text: $foreground)
                NativeInputField(title: "Background color", text: $background)
                if studioMode == "helper" {
                    Text("Tap a passing WCAG AA option to apply it as the foreground.").font(.caption).foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(NativeAccessibilityEngine.passingForegroundColors(background: background), id: \.self) { candidate in
                                Button(candidate) { foreground = candidate; output = "" }
                                    .buttonStyle(.bordered).frame(minHeight: 48)
                                    .accessibilityLabel("Apply foreground color \(candidate)")
                                    .accessibilityHint("Candidate meets 4.5 to 1 WCAG AA contrast against the current background")
                            }
                        }
                    }
                }
            }
            if focusGenerator || (kind == "focus-state" && ["preview", "simulator"].contains(studioMode)) {
                NativeInputField(title: "Focus ring color (HEX)", text: $foreground)
                NativeInputField(title: "Dark-mode ring color (HEX)", text: $background)
                NativeInputField(title: "Ring width (CSS px)", text: $focusWidth)
                NativeInputField(title: "Ring offset (CSS px)", text: $focusOffset)
            }
            if kind == "aria" && studioMode == "generator" {
                Picker("Pattern", selection: $ariaPattern) {
                    Text("Button").tag("button"); Text("Dialog").tag("dialog"); Text("Disclosure").tag("disclosure")
                    Text("Tabs").tag("tabs"); Text("Checkbox").tag("checkbox"); Text("Link").tag("link")
                }.pickerStyle(.menu).accessibilityLabel("ARIA pattern to generate")
            }
            if sizeTool {
                NativeInputField(title: "Font size (CSS px/rem)", text: $fontSize)
                NativeInputField(title: "Line height", text: $lineHeight)
            }
            if codeTool || textTool || altCoach {
                enVCharacterSpacedText(altCoach ? "Image description" : textTool ? "English text" : "HTML / CSS snippet")
                    .font(.envScaled(size: 13, weight: .semibold))
                TextEditor(text: $input)
                    .font(.system(.body, design: codeTool && !altCoach ? .monospaced : .default))
                    .frame(minHeight: 160)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                    .accessibilityLabel(altCoach ? "Describe the image and its purpose" : textTool ? "English text for readability analysis" : "HTML or CSS snippet to analyze")
                    .accessibilityHint(altCoach ? "Drafts three alternatives on this device; verify them against the actual image." : "Paste only the relevant snippet for a focused review.")
            }
            if codeTool && !altCoach { Button("Load sample") { input = sampleInput }.buttonStyle(.bordered).frame(maxWidth: .infinity, alignment: .leading) }
            if colorTool && studioMode == "preview" { colorPreview }
            if colorTool && studioMode == "simulator" { colorVisionPreview }
            if sizeTool && ["preview", "simulator"].contains(studioMode) { typeScalePreview }
            if kind == "focus-state" && ["preview", "simulator"].contains(studioMode) { focusPreview }
            if kind == "keyboard-navigation" && ["preview", "simulator"].contains(studioMode) { focusPreview }
            if kind == "motion" && ["preview", "simulator"].contains(studioMode) { motionPreview }
            if kind == "form" && studioMode == "simulator" { formPreview }
            Button { output = NativeAccessibilityEngine.analyze(toolID: engineToolID, input: kind == "aria" && studioMode == "generator" ? ariaPattern : input, foreground: foreground, background: background, fontSize: fontSize, lineHeight: lineHeight, focusWidth: focusWidth, focusOffset: focusOffset) } label: {
                Label(studioMode == "generator" ? "Generate locally" : studioMode == "helper" ? "Get local coaching" : ["preview", "simulator"].contains(studioMode) ? "Run local preview / test" : "Run local review", systemImage: "play.fill")
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            }.buttonStyle(.borderedProminent)
            Button { input = ""; foreground = "#000000"; background = "#ffffff"; fontSize = "16px"; lineHeight = "1.5"; focusWidth = "3px"; focusOffset = "3px"; ariaPattern = "button"; previewSize = 18; previewLineHeight = 1.5; demoEmail = ""; demoSubmitted = false; demoValid = false; output = "" } label: {
                Label("Reset fields", systemImage: "arrow.counterclockwise").frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            }.buttonStyle(.bordered)
            if !output.isEmpty {
                enVCharacterSpacedText("Result").font(.envScaled(size: 17, weight: .semibold))
                Button { UIPasteboard.general.string = output } label: {
                    Label("Copy report", systemImage: "doc.on.doc").frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                }.buttonStyle(.bordered).accessibilityHint("Copies the full local result to the clipboard")
                ShareLink(item: output) { Label("Share or save report", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 48, alignment: .leading) }
                    .buttonStyle(.bordered)
                Text(output).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                    .accessibilityLabel("Accessibility analysis result")
            }
            enVCharacterSpacedText("Static snippet checks only. Manually test keyboard order, browser zoom, screen readers, and the complete page; results do not certify WCAG conformance.")
                .font(.envScaled(size: 11, weight: .regular)).foregroundStyle(Color.envMuted)
        }
        .sheet(isPresented: $showAPCAWebView) {
            APCAWebViewSheet()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
    private var colorPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Live color preview").font(.headline)
            Text("Sample body text on the selected background. Also inspect real UI states and non-text boundaries.").font(.body)
            Button("Sample action") {}.buttonStyle(.bordered).tint(accessibilityColor(foreground))
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(accessibilityColor(foreground)).background(accessibilityColor(background), in: RoundedRectangle(cornerRadius: 12))
    }
    private var colorVisionPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Color-vision approximations").font(.headline)
            Text("Illustrative matrix transforms—not a clinical simulation. Never use color as the only signal.").font(.caption).foregroundStyle(.secondary)
            ForEach(NativeAccessibilityEngine.colorVisionPreviewPairs(foreground, background), id: \.label) { pair in
                Text("\(pair.label)\nSample text · \(pair.foreground) on \(pair.background)")
                    .font(.subheadline).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(accessibilityColor(pair.foreground)).background(accessibilityColor(pair.background), in: RoundedRectangle(cornerRadius: 9))
            }
        }.accessibilityElement(children: .contain)
    }
    private var typeScalePreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Type-scale preview · \(Int(previewSize)) pt · line spacing \(previewLineHeight, specifier: "%.2f")").font(.headline)
            Slider(value: $previewSize, in: 12...48, step: 1).accessibilityLabel("Preview text size")
            Slider(value: $previewLineHeight, in: 1...2.5, step: 0.05).accessibilityLabel("Preview line height")
            DynamicTypePreviewText(
                text: input.isEmpty ? "Accessible content should remain readable when people enlarge type and adjust spacing." : input,
                size: CGFloat(previewSize),
                lineHeight: previewLineHeight
            )
                .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.envSurface2, in: RoundedRectangle(cornerRadius: 9))
        }
    }
    private var focusPreview: some View {
        let surface = focusForced ? Color.black : focusDark ? Color(red: 0.07, green: 0.09, blue: 0.14) : Color.envSurface2
        let foregroundColor = focusForced || focusDark ? Color.white : Color.envInk
        let ring = focusForced ? Color.yellow : accessibilityColor(focusDark ? background : foreground)
        return VStack(alignment: .leading, spacing: 10) {
            Text("Keyboard focus playground").font(.headline)
            Text("Use a hardware keyboard, VoiceOver, or switch control to navigate these native controls.").font(.caption).foregroundStyle(.secondary)
            Toggle("Dark surface", isOn: $focusDark).onChange(of: focusDark) { value in if value { focusForced = false } }
            Toggle("Forced-colors visual mock", isOn: $focusForced).onChange(of: focusForced) { value in if value { focusDark = false } }
            Toggle("Show focus-ring preview", isOn: $showFocusRing).accessibilityHint("Visual sample only; navigate with the keyboard to test actual focus behavior.")
            VStack(alignment: .leading, spacing: 10) {
                Button("Keyboard target") {}.buttonStyle(.borderedProminent).overlay(RoundedRectangle(cornerRadius: 8).stroke(showFocusRing ? ring : .clear, lineWidth: 4))
                Button("Sample secondary action") {}.buttonStyle(.bordered).foregroundStyle(foregroundColor)
                TextField("Sample text field", text: $focusInput)
                    .textFieldStyle(.roundedBorder).overlay(RoundedRectangle(cornerRadius: 6).stroke(showFocusRing ? ring : .clear, lineWidth: 4))
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(foregroundColor).background(surface, in: RoundedRectangle(cornerRadius: 10))
            Text("Forced-colors is a visual mock only. Verify actual iOS accessibility settings and contrast with users.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private var motionPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reduced-motion playground").font(.headline)
            Toggle("Reduce this demo's motion", isOn: $reduceMotion)
            Button(motionOn ? "Stop motion" : "Play motion") { motionOn.toggle() }.buttonStyle(.bordered)
            Text("●").font(.title).offset(x: motionOn && !reduceMotion ? 70 : 0)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: motionOn)
            Text("Local preview only; also test the system Reduce Motion setting.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private var formPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Interactive validation demo").font(.headline)
            Text("This sample is local; it never submits or stores your input.").font(.caption).foregroundStyle(.secondary)
            TextField("Email address", text: $demoEmail)
                .textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                .accessibilityLabel("Email address").accessibilityHint("Required for this local validation sample")
                .textFieldStyle(.roundedBorder)
            if demoSubmitted && !demoValid {
                Label("Enter a valid email address, for example name@example.com.", systemImage: "exclamationmark.circle.fill")
                    .foregroundStyle(.red).accessibilityLabel("Error: email address is required or invalid")
            }
            Button("Validate sample form") {
                demoSubmitted = true
                demoValid = demoEmail.contains("@") && demoEmail.split(separator: "@").last?.contains(".") == true
            }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity, minHeight: 48)
            if demoValid { Label("Valid. Nothing was sent.", systemImage: "checkmark.circle.fill").foregroundStyle(.green).accessibilityAddTraits(.updatesFrequently) }
        }.accessibilityElement(children: .contain)
    }
    private func accessibilityColor(_ value: String) -> Color {
        let clean = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard clean.count == 6, let number = UInt64(clean, radix: 16) else { return Color.envInk }
        return Color(red: Double((number >> 16) & 255) / 255, green: Double((number >> 8) & 255) / 255, blue: Double(number & 255) / 255)
    }
    private var sampleInput: String {
        switch kind {
        case "alt-text": return "<img src=\"logo.svg\" alt=\"\">\n<img src=\"event.jpg\">"
        case "aria": return "<button aria-label=\"\" aria-expanded=\"false\">Open</button>"
        case "focus-state": return "button:focus { outline: none; }"
        case "keyboard-navigation": return "<div tabindex=\"4\" onclick=\"openMenu()\">Menu</div>"
        case "form": return "<form><input type=\"email\"><button>Submit</button></form>"
        case "motion": return "button { animation: pulse 1s infinite; }"
        default: return ""
        }
    }
}

private let apcaStudioWebURL = URL(string: "https://en-v.vercel.app/tools/accessibility/color-contrast-studio")!

private struct APCAWebViewSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text("APCA is web-hosted and requires a connection. Colors entered in the native fields are not transferred.")
                    .font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                APCAWebView(url: apcaStudioWebURL)
            }
            .navigationTitle("APCA · Web view")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.accessibilityHint("Returns to the native Color Contrast Studio")
                }
            }
        }
    }
}

private struct APCAWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let target = navigationAction.request.url else { decisionHandler(.cancel); return }
            if target.scheme == "https", target.host == "en-v.vercel.app" { decisionHandler(.allow); return }
            if target.scheme == "https" { UIApplication.shared.open(target) }
            decisionHandler(.cancel)
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
        // Audio routes have local engines or specific server adapters on the web;
        // don't falsely advertise generic /api/backend/media as a universal native fallback.
        if tool.engine.type == "audio" { return false }
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

/// Text-first native PDF export with page breaks and local-only rendering.
private struct NativeBusinessPDFDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.pdf] }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

private enum NativeBusinessPDFRenderer {
    static func render(_ text: String, title: String, logoData: Data? = nil) -> Data {
        let logoImage = logoData.flatMap(UIImage.init(data:))
        let page = CGRect(x: 0, y: 0, width: 595, height: 842)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        return renderer.pdfData { context in
            let body = UIFont.systemFont(ofSize: 10.5)
            let heading = UIFont.systemFont(ofSize: 18, weight: .semibold)
            let bodyColor = UIColor(red: 0.14, green: 0.18, blue: 0.21, alpha: 1)
            let headingColor = UIColor(red: 0.08, green: 0.37, blue: 0.36, alpha: 1)
            let paragraph = NSMutableParagraphStyle()
            paragraph.lineBreakMode = .byWordWrapping
            let bodyAttrs: [NSAttributedString.Key: Any] = [.font: body, .foregroundColor: bodyColor, .paragraphStyle: paragraph]
            let titleAttrs: [NSAttributedString.Key: Any] = [.font: heading, .foregroundColor: headingColor]
            let margin: CGFloat = 48
            let contentWidth = page.width - margin * 2
            var y: CGFloat = 54
            var pageNumber = 0
            func startPage() {
                pageNumber += 1
                context.beginPage()
                var titleX = margin
                if pageNumber == 1, let logoImage {
                    let maxSize = CGSize(width: 72, height: 38)
                    let scale = min(maxSize.width / logoImage.size.width, maxSize.height / logoImage.size.height)
                    let size = CGSize(width: logoImage.size.width * scale, height: logoImage.size.height * scale)
                    logoImage.draw(in: CGRect(x: margin, y: 22, width: size.width, height: size.height))
                    titleX = margin + size.width + 12
                }
                (title as NSString).draw(in: CGRect(x: titleX, y: 34, width: page.width - margin - titleX, height: 26), withAttributes: titleAttrs)
                context.cgContext.setStrokeColor(UIColor.lightGray.cgColor)
                context.cgContext.setLineWidth(0.6)
                context.cgContext.move(to: CGPoint(x: margin, y: 72))
                context.cgContext.addLine(to: CGPoint(x: page.width - margin, y: 72))
                context.cgContext.strokePath()
                y = 88
            }
            func footer() {
                let footer = "Generated locally by enV · Page \(pageNumber)" as NSString
                footer.draw(at: CGPoint(x: margin, y: page.height - 32), withAttributes: [.font: UIFont.systemFont(ofSize: 8), .foregroundColor: UIColor.gray])
            }
            startPage()
            for line in text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
                let value = line.isEmpty ? " " : line
                let bounds = (value as NSString).boundingRect(with: CGSize(width: contentWidth, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: bodyAttrs, context: nil)
                let height = max(12, ceil(bounds.height))
                if y + height > page.height - 56 { footer(); startPage() }
                (value as NSString).draw(in: CGRect(x: margin, y: y, width: contentWidth, height: height + 2), withAttributes: bodyAttrs)
                y += height + (line.isEmpty ? 4 : 3)
            }
            footer()
        }
    }
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

private struct NativeBusinessLineItemDraft: Identifiable {
    let id = UUID()
    var description: String
    var quantity: String
    var unitPrice: String

    init(description: String = "Professional service", quantity: String = "1", unitPrice: String = "100") {
        self.description = description
        self.quantity = quantity
        self.unitPrice = unitPrice
    }
}

private struct NativeBusinessToolView: View {
    let tool: Tool
    @Environment(\.openURL) private var openURL
    @State private var a = "1000"
    @State private var selectedStudioMode = ""
    @State private var b = "600"
    @State private var c = "50"
    @State private var d = "0"
    @State private var e = "12"
    @State private var monthlyContribution = "0"
    @State private var targetProfit = "0"
    @State private var lineItemRows = [NativeBusinessLineItemDraft()]
    @State private var businessName = "Your Business"
    @State private var clientName = "Client"
    @State private var documentNumber = "DOC-001"
    @State private var documentDate = Date().formatted(date: .numeric, time: .omitted)
    @State private var currency = "USD"
    @State private var taxPercent = "0"
    @State private var discountPercent = "0"
    @State private var seed = "technology"
    @State private var audience = "customers"
    @State private var agendaItems = "Welcome and objectives | 5\nProgress updates | 10\nDecisions and blockers | 15\nActions and next steps | 5"
    @State private var signatureName = "Alex Morgan"
    @State private var signatureRole = "Founder"
    @State private var signatureEmail = "hello@example.com"
    @State private var signaturePhone = ""
    @State private var signatureWebsite = ""
    @State private var signatureSocialLink = ""
    @State private var namingStyle = "descriptive"
    @State private var maxNameLength = "32"
    @State private var nameBlacklist = ""
    @State private var generationOffset = 0
    @State private var ltvModel = "simple"
    @State private var grossMarginPct = "80"
    @State private var monthlyChurnPct = "5"
    @State private var meetingTitle = "Weekly planning"
    @State private var meetingDateTime = ""
    @State private var meetingLocation = ""
    @State private var meetingGoal = "Weekly planning"
    @State private var attendees = "Team"
    @State private var prepNotes = ""
    @State private var discussionNotes = ""
    @State private var decisions = ""
    @State private var actionItems = ""
    @State private var nextMeeting = ""
    @State private var payPeriod = ""
    @State private var output = ""
    @State private var error: String?
    @State private var exporting = false
    @State private var exportingPDF = false
    @State private var pdfData = Data()
    @State private var importingLogo = false
    @State private var localLogoData: Data?
    private var lineItems: String { lineItemRows.map { "\($0.description) | \($0.quantity) | \($0.unitPrice)" }.joined(separator: "\n") }
    private var liveDocumentSubtotal: Double {
        lineItemRows.reduce(0.0) { sum, row in
            let quantity = Double(row.quantity).flatMap { $0.isFinite && $0 >= 0 ? $0 : nil } ?? 0
            let price = Double(row.unitPrice).flatMap { $0.isFinite && $0 >= 0 ? $0 : nil } ?? 0
            let line = quantity * price
            return sum + (line.isFinite ? line : 0)
        }
    }
    private var liveDocumentDiscount: Double { liveDocumentSubtotal * min(100, max(0, Double(discountPercent).flatMap { $0.isFinite ? $0 : nil } ?? 0)) / 100 }
    private var liveDocumentTax: Double { (liveDocumentSubtotal - liveDocumentDiscount) * max(0, Double(taxPercent).flatMap { $0.isFinite ? $0 : nil } ?? 0) / 100 }
    private var options: [String:String] { ["a":a,"b":b,"c":c,"d":d,"e":e,"monthlyContribution":monthlyContribution,"targetProfit":targetProfit,"grossMarginPct":grossMarginPct,"monthlyChurnPct":monthlyChurnPct,"ltvModel":ltvModel,"lineItems":lineItems,"company":businessName,"client":clientName,"documentNumber":documentNumber,"date":documentDate,"currency":currency,"taxPercent":taxPercent,"discountPercent":discountPercent,"seed":seed,"audience":audience,"agendaItems":agendaItems,"name":signatureName,"role":signatureRole,"email":signatureEmail,"phone":signaturePhone,"website":signatureWebsite,"socialLink":signatureSocialLink,"namingStyle":namingStyle,"maxNameLength":maxNameLength,"nameBlacklist":nameBlacklist,"generationOffset":String(generationOffset),"meetingTitle":meetingTitle,"dateTime":meetingDateTime,"location":meetingLocation,"meetingGoal":meetingGoal,"attendees":attendees,"prepNotes":prepNotes,"discussionNotes":discussionNotes,"decisions":decisions,"actionItems":actionItems,"nextMeeting":nextMeeting,"employeeName":clientName,"payPeriod":payPeriod,"gross":a,"statutoryDeductions":b,"otherDeductions":c] }
    private var originalOp: String { tool.engine.op ?? tool.engine.id ?? tool.id }
    private var studioModes: [(String, String)] {
        switch originalOp {
        case "invoice", "receipt", "quotation", "estimate", "purchase-order": return [("Invoice", "invoice"), ("Receipt", "receipt"), ("Quotation", "quotation"), ("Estimate", "estimate"), ("Purchase order", "purchase-order")]
        case "business-name", "company-name", "brand-name", "product-name", "slogan", "sku": return [("Business", "business-name"), ("Company", "company-name"), ("Brand", "brand-name"), ("Product", "product-name"), ("Slogan", "slogan"), ("SKU", "sku")]
        case "agenda", "minutes", "meeting-agenda", "meeting-minutes", "email-signature", "payslip": return [("Agenda", "meeting-agenda"), ("Minutes", "meeting-minutes"), ("Signature", "email-signature"), ("Payslip demo", "payslip")]
        default: return [("Break-even", "break-even"), ("Cash flow", "cash-flow"), ("Commission", "commission"), ("CAC", "customer-acquisition-cost"), ("LTV", "customer-lifetime-value"), ("ROI", "roi"), ("Pricing", "pricing"), ("Markup", "markup"), ("Recurring revenue", "recurring-revenue"), ("Expense", "expense"), ("Inventory", "inventory"), ("Discount", "discount"), ("Margin", "margin"), ("Profit", "profit"), ("Salary", "salary")]
        }
    }
    private var op: String { studioModes.contains(where: { $0.1 == selectedStudioMode }) ? selectedStudioMode : originalOp }
    private var studioModeTitle: String { studioModes.first(where: { $0.1 == op })?.0 ?? tool.name }
    private var isNaming: Bool { ["business-name", "company-name", "brand-name", "product-name"].contains(op) }
    private func runBusiness(advanceGeneration: Bool = false, resetGeneration: Bool = false) {
        if resetGeneration { generationOffset = 0 }
        else if advanceGeneration { generationOffset += 1 }
        do { output = try NativeBusinessEngine.run(tool, options: options, operationOverride: op); error = nil }
        catch { output = ""; self.error = error.localizedDescription }
    }
    private func loadBusinessExample() {
        generationOffset = 0
        switch op {
        case "invoice", "receipt", "quotation", "estimate", "purchase-order":
            businessName = "Acme Solar Co."; clientName = "Example Customer"; documentNumber = "INV-EXAMPLE-001"; documentDate = "2026-10-15"; currency = "USD"; taxPercent = "7.5"; discountPercent = "5"; lineItemRows = [NativeBusinessLineItemDraft(description: "Solar panel", quantity: "3", unitPrice: "250"), NativeBusinessLineItemDraft(description: "Installation", quantity: "1", unitPrice: "100")]; localLogoData = nil
        case "business-name", "company-name", "brand-name", "product-name":
            seed = "solar energy"; namingStyle = "descriptive"; maxNameLength = "32"; nameBlacklist = ""
        case "slogan": seed = "solar energy"; audience = "homeowners"
        case "sku": seed = "TEC"
        case "agenda", "meeting-agenda", "minutes", "meeting-minutes":
            meetingTitle = "Solar launch review"; meetingDateTime = "2026-10-20 10:00"; meetingLocation = "Video conference"; meetingGoal = "Decide launch readiness and owners"; attendees = "Product lead; Operations lead; Marketing lead"; prepNotes = "Review launch metrics and open blockers."; agendaItems = "Metrics review | 10\nDecision log | 20\nActions and owners | 10"; discussionNotes = "Launch readiness, support coverage, unresolved blockers."; decisions = "Approve launch after support checklist passes."; actionItems = "Operations lead | Finalize support checklist | 2026-10-19\nMarketing lead | Confirm launch copy | 2026-10-19"; nextMeeting = "2026-10-21 10:00"
        case "email-signature": signatureName = "Jordan Example"; signatureRole = "Operations Lead"; signatureEmail = "jordan@example.com"; businessName = "Acme Solar Co."; signaturePhone = "+1 555 0100"; signatureWebsite = "https://example.com"; signatureSocialLink = "https://www.linkedin.com/"
        case "payslip": businessName = "Example Company"; clientName = "Example Employee"; payPeriod = "Example pay period"; a = "5000"; b = "500"; c = "100"
        case "break-even": a = "50"; b = "10000"; c = "30"; targetProfit = "5000"
        case "commission": a = "50000"; b = "8"
        case "customer-acquisition-cost": a = "5000"; b = "100"; d = "250"; monthlyContribution = "10"
        case "customer-lifetime-value": ltvModel = "saas"; a = "50"; b = "12"; c = "24"; d = "100"; grossMarginPct = "80"; monthlyChurnPct = "5"; monthlyContribution = "0"
        case "cash-flow": a = "800"; b = "900"; c = "1000"
        case "roi": a = "150"; b = "100"
        case "salary": a = "52000"
        case "pricing", "markup": a = "100"; b = "25"
        case "margin", "profit": a = "100"; b = "70"
        case "discount": a = "100"; b = "15"
        case "recurring-revenue": a = "10000"; b = "20"
        case "expense": a = "100"; b = "200"; c = "300"; d = "40"; e = "20"
        case "inventory": a = "12"; b = "25"; c = "5"
        default: break
        }
        output = ""; error = nil
    }
    @ViewBuilder private func namingStyleButton(_ title: String, value: String) -> some View {
        if namingStyle == value { Button(title) { namingStyle = value }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity) }
        else { Button(title) { namingStyle = value }.buttonStyle(.bordered).frame(maxWidth: .infinity) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            enVCharacterSpacedText("Native business engine · \(studioModeTitle)").font(.subheadline.weight(.semibold))
            Text("Privacy-first: business inputs stay on this device unless you explicitly export or share output. Finance results are illustrative, not professional advice.").font(.footnote).foregroundStyle(.secondary)
            Text("Studio modes").font(.caption.weight(.semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(studioModes.indices, id: \.self) { index in
                        let mode = studioModes[index]
                        if op == mode.1 {
                            Button(mode.0) { selectedStudioMode = mode.1; output = ""; error = nil; generationOffset = 0 }
                                .buttonStyle(.borderedProminent)
                                .frame(minHeight: 44)
                        } else {
                            Button(mode.0) { selectedStudioMode = mode.1; output = ""; error = nil; generationOffset = 0 }
                                .buttonStyle(.bordered)
                                .frame(minHeight: 44)
                        }
                    }
                }.padding(.vertical, 2)
            }
            let financeOperations: Set<String> = ["roi", "break-even", "commission", "pricing", "markup", "cash-flow", "salary", "customer-lifetime-value", "customer-acquisition-cost", "recurring-revenue", "expense", "inventory", "discount", "margin", "profit", "payslip"]
            if financeOperations.contains(op) {
                if op == "customer-lifetime-value" {
                    Picker("LTV model", selection: $ltvModel) { Text("Simple / commerce").tag("simple"); Text("SaaS / subscription").tag("saas") }.pickerStyle(.segmented)
                }
                if op == "customer-lifetime-value" && ltvModel == "saas" {
                    NativeInputField(title: "Monthly ARPU (average revenue per account)", text: $a)
                    NativeInputField(title: "Gross margin (%)", text: $grossMarginPct)
                    NativeInputField(title: "Monthly customer churn (%)", text: $monthlyChurnPct)
                } else {
                    switch op {
                    case "roi":
                        NativeInputField(title: "Total value received (before subtracting investment)", text: $a)
                        NativeInputField(title: "Initial investment", text: $b)
                    case "break-even":
                        NativeInputField(title: "Selling price per unit", text: $a)
                        NativeInputField(title: "Fixed costs", text: $b)
                        NativeInputField(title: "Variable cost per unit", text: $c)
                    case "commission":
                        NativeInputField(title: "Sales amount", text: $a)
                        NativeInputField(title: "Commission rate (%)", text: $b)
                    case "pricing", "markup":
                        NativeInputField(title: "Unit cost before markup", text: $a)
                        NativeInputField(title: "Markup percentage (%)", text: $b)
                    case "cash-flow":
                        NativeInputField(title: "Cash inflows during period", text: $a)
                        NativeInputField(title: "Cash outflows during period", text: $b)
                        NativeInputField(title: "Opening cash balance", text: $c)
                    case "salary":
                        NativeInputField(title: "Gross annual salary (before tax)", text: $a)
                    case "customer-lifetime-value":
                        NativeInputField(title: "Average order value", text: $a)
                        NativeInputField(title: "Purchases per customer / period", text: $b)
                        NativeInputField(title: "Customer lifespan (periods)", text: $c)
                    case "customer-acquisition-cost":
                        NativeInputField(title: "Customer acquisition spend", text: $a)
                        NativeInputField(title: "New customers acquired", text: $b)
                    case "recurring-revenue":
                        NativeInputField(title: "Monthly recurring revenue (MRR)", text: $a)
                        NativeInputField(title: "Annual revenue growth (%)", text: $b)
                    case "expense":
                        NativeInputField(title: "Rent / workspace expense", text: $a)
                        NativeInputField(title: "Payroll / contractor expense", text: $b)
                        NativeInputField(title: "Marketing expense", text: $c)
                        NativeInputField(title: "Software / subscription expense", text: $d)
                        NativeInputField(title: "Other expenses", text: $e)
                    case "inventory":
                        NativeInputField(title: "Units in stock", text: $a)
                        NativeInputField(title: "Unit cost", text: $b)
                        NativeInputField(title: "Reorder quantity target", text: $c)
                    case "discount":
                        NativeInputField(title: "Original price before discount", text: $a)
                        NativeInputField(title: "Discount rate (%)", text: $b)
                    case "margin", "profit":
                        NativeInputField(title: "Revenue / sales", text: $a)
                        NativeInputField(title: "Total cost of sales", text: $b)
                    case "payslip":
                        NativeInputField(title: "Gross pay (demo only)", text: $a)
                        NativeInputField(title: "Tax / statutory deductions", text: $b)
                        NativeInputField(title: "Other deductions", text: $c)
                    default: EmptyView()
                    }
                }
                if op == "customer-acquisition-cost" {
                    NativeInputField(title: "Customer lifetime value (optional)", text: $d)
                    NativeInputField(title: "Monthly contribution per new customer (optional)", text: $monthlyContribution)
                }
                if op == "customer-lifetime-value" {
                    NativeInputField(title: "Customer acquisition cost (optional)", text: $d)
                    NativeInputField(title: "Monthly contribution per customer (optional)", text: $monthlyContribution)
                }
                if op == "break-even" { NativeInputField(title: "Target profit (optional)", text: $targetProfit) }
                Text("Formula and assumptions are included with the result. Illustrative only—not tax, legal, accounting, or investment advice.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if ["invoice", "receipt", "quotation", "estimate", "purchase-order"].contains(op) {
                NativeInputField(title: "Business name", text: $businessName)
                Button(localLogoData == nil ? "Choose local logo (stays on this device)" : "Change local logo") { importingLogo = true }.buttonStyle(.bordered)
                if let data = localLogoData, let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: 140, maxHeight: 72).accessibilityLabel("Local business logo preview") }
                NativeInputField(title: op == "receipt" ? "Received from" : (op == "quotation" || op == "estimate") ? "Prepared for" : op == "purchase-order" ? "Supplier" : "Bill to / recipient", text: $clientName)
                NativeInputField(title: "Document number", text: $documentNumber)
                NativeInputField(title: "Document date", text: $documentDate)
                Picker("Currency", selection: $currency) {
                    ForEach(["USD", "EUR", "GBP", "NGN", "CAD", "AUD", "INR", "GHS", "KES", "ZAR", "JPY"], id: \.self) { code in Text(code).tag(code) }
                }.pickerStyle(.menu)
                NativeInputField(title: "Tax rate (%)", text: $taxPercent)
                NativeInputField(title: "Discount rate (%)", text: $discountPercent)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Line items · description, quantity and unit price").font(.caption).foregroundStyle(.secondary)
                    ForEach($lineItemRows) { $item in
                        VStack(alignment: .leading, spacing: 8) {
                            NativeInputField(title: "Item description", text: $item.description)
                            HStack(spacing: 8) {
                                NativeInputField(title: "Quantity", text: $item.quantity)
                                NativeInputField(title: "Unit price", text: $item.unitPrice)
                            }
                            Button("Remove item") {
                                let id = item.id
                                if lineItemRows.count > 1 { lineItemRows.removeAll { $0.id == id } }
                                else { lineItemRows[0] = NativeBusinessLineItemDraft(description: "", quantity: "1", unitPrice: "0") }
                            }.buttonStyle(.bordered)
                        }
                        .padding(10)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envTeal.opacity(0.25)))
                    }
                    Button("Add line item") { lineItemRows.append(NativeBusinessLineItemDraft(description: "New item", quantity: "1", unitPrice: "0")) }.buttonStyle(.bordered)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Live document total · \(currency)").font(.headline)
                        HStack { Text("Subtotal"); Spacer(); Text(String(format: "%.2f", liveDocumentSubtotal)) }
                        HStack { Text("Discount"); Spacer(); Text("−" + String(format: "%.2f", liveDocumentDiscount)) }
                        HStack { Text("Tax"); Spacer(); Text(String(format: "%.2f", liveDocumentTax)) }
                        Divider()
                        HStack { Text("Total").fontWeight(.semibold); Spacer(); Text(String(format: "%.2f", liveDocumentSubtotal - liveDocumentDiscount + liveDocumentTax)).fontWeight(.semibold) }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.envTeal.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            if ["agenda", "meeting-agenda", "minutes", "meeting-minutes"].contains(op) {
                NativeInputField(title: "Meeting title", text: $meetingTitle)
                NativeInputField(title: "Date and time", text: $meetingDateTime)
                NativeInputField(title: "Location or meeting link", text: $meetingLocation)
                NativeInputField(title: "Meeting goal", text: $meetingGoal)
                NativeInputField(title: "Attendees", text: $attendees)
                if ["agenda", "meeting-agenda"].contains(op) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Preparation notes").font(.caption).foregroundStyle(.secondary)
                        TextEditor(text: $prepNotes).frame(minHeight: 72).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envTeal.opacity(0.3)))
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Timed agenda items · topic | minutes").font(.caption.weight(.semibold))
                        ForEach(Array(agendaItems.components(separatedBy: "\n").enumerated()), id: \.offset) { index, row in
                            HStack(alignment: .center, spacing: 8) {
                                NativeInputField(title: "Item \(index + 1) (topic | minutes)", text: Binding(get: { row }, set: { value in
                                    var rows = agendaItems.components(separatedBy: "\n")
                                    if rows.indices.contains(index) { rows[index] = value; agendaItems = rows.joined(separator: "\n") }
                                }))
                                Button("Remove") {
                                    var rows = agendaItems.components(separatedBy: "\n")
                                    if rows.count > 1 { rows.remove(at: index) } else { rows[0] = "" }
                                    agendaItems = rows.joined(separator: "\n")
                                }.buttonStyle(.bordered).disabled(agendaItems.components(separatedBy: "\n").count <= 1)
                            }
                        }
                        Button("Add timed item") { if agendaItems.components(separatedBy: "\n").count < 20 { agendaItems += (agendaItems.isEmpty ? "" : "\n") + "New agenda item | 5" } }.buttonStyle(.bordered).disabled(agendaItems.components(separatedBy: "\n").count >= 20)
                    }
                }
                if ["minutes", "meeting-minutes"].contains(op) {
                    VStack(alignment: .leading, spacing: 4) { Text("Discussion notes").font(.caption).foregroundStyle(.secondary); TextEditor(text: $discussionNotes).frame(minHeight: 90).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envTeal.opacity(0.3))) }
                    VStack(alignment: .leading, spacing: 4) { Text("Decisions").font(.caption).foregroundStyle(.secondary); TextEditor(text: $decisions).frame(minHeight: 72).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.envTeal.opacity(0.3))) }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Action items (owner | task | due date)").font(.caption.weight(.semibold))
                        ForEach(Array(actionItems.components(separatedBy: "\n").enumerated()), id: \.offset) { index, row in
                            HStack(alignment: .center, spacing: 8) {
                                NativeInputField(title: "Action \(index + 1) (owner | task | due date)", text: Binding(get: { row }, set: { value in
                                    var rows = actionItems.components(separatedBy: "\n")
                                    if rows.indices.contains(index) { rows[index] = value; actionItems = rows.joined(separator: "\n") }
                                }))
                                Button("Remove") {
                                    var rows = actionItems.components(separatedBy: "\n")
                                    if rows.count > 1 { rows.remove(at: index) } else { rows[0] = "" }
                                    actionItems = rows.joined(separator: "\n")
                                }.buttonStyle(.bordered).disabled(actionItems.components(separatedBy: "\n").count <= 1)
                            }
                        }
                        Button("Add action item") { if actionItems.components(separatedBy: "\n").count < 20 { actionItems += (actionItems.isEmpty ? "" : "\n") + " |  | " } }.buttonStyle(.bordered).disabled(actionItems.components(separatedBy: "\n").count >= 20)
                    }
                    NativeInputField(title: "Next meeting", text: $nextMeeting)
                }
            }
            if op == "payslip" {
                NativeInputField(title: "Employer / business name", text: $businessName)
                NativeInputField(title: "Employee name", text: $clientName)
                NativeInputField(title: "Pay period", text: $payPeriod)
            }
            if op == "email-signature" {
                NativeInputField(title: "Name", text: $signatureName)
                NativeInputField(title: "Role / title", text: $signatureRole)
                NativeInputField(title: "Email", text: $signatureEmail)
                NativeInputField(title: "Company", text: $businessName)
                NativeInputField(title: "Phone (optional)", text: $signaturePhone)
                NativeInputField(title: "Website URL (optional)", text: $signatureWebsite)
                NativeInputField(title: "Social / profile URL (optional)", text: $signatureSocialLink)
            }
            if ["business-name", "company-name", "brand-name", "product-name", "slogan", "sku"].contains(op) { NativeInputField(title: "Seed / topic", text: $seed) }
            if op == "slogan" { NativeInputField(title: "Audience / context", text: $audience) }
            if isNaming {
                Text("Naming style").font(.caption.weight(.semibold))
                HStack(spacing: 6) {
                    namingStyleButton("Descriptive", value: "descriptive")
                    namingStyleButton("Compound", value: "compound")
                }
                HStack(spacing: 6) {
                    namingStyleButton("Prefix / suffix", value: "prefix-suffix")
                    namingStyleButton("Short brandable", value: "short-brandable")
                }
                NativeInputField(title: "Maximum name length (8–60)", text: $maxNameLength)
                NativeInputField(title: "Exclude words (comma-separated, optional)", text: $nameBlacklist)
                HStack {
                    Button("Generate") { runBusiness(resetGeneration: true) }.buttonStyle(.borderedProminent)
                    Button("More names") { runBusiness(advanceGeneration: true) }.buttonStyle(.bordered)
                }
                Text("Local ideas only. No trademark, domain, social-handle, or cultural clearance is performed.").font(.footnote).foregroundStyle(.secondary)
                Button("Check finalists at a registrar ↗") {
                    if let url = URL(string: "https://www.namecheap.com/domains/") { openURL(url) }
                }.buttonStyle(.bordered).frame(maxWidth: .infinity, minHeight: 44)
                Text("This external link does not verify availability or premium pricing.").font(.footnote).foregroundStyle(.secondary)
            }
            if op == "slogan" || op == "sku" {
                HStack {
                    Button("Generate") { runBusiness(resetGeneration: true) }.buttonStyle(.borderedProminent)
                    Button("More") { runBusiness(advanceGeneration: true) }.buttonStyle(.bordered)
                }
            }
            if isNaming && !output.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Button("Copy all names") { UIPasteboard.general.string = output }.buttonStyle(.borderedProminent)
                    Text("Copy an individual name").font(.caption.weight(.semibold))
                    ForEach(Array(output.components(separatedBy: "\n").filter { !$0.isEmpty }.prefix(48).enumerated()), id: \.offset) { _, generatedName in
                        HStack(alignment: .center, spacing: 8) {
                            Text(generatedName).frame(maxWidth: .infinity, alignment: .leading)
                            Button("Copy") { UIPasteboard.general.string = generatedName }.buttonStyle(.bordered)
                        }
                    }
                }
            }
            Button("Load example") { loadBusinessExample() }.buttonStyle(.bordered)
            NativeActionRow(output: output, run: { runBusiness() }, reset: { a="1000"; b="600"; c="50"; d="0"; e="12"; monthlyContribution="0"; targetProfit="0"; lineItemRows=[NativeBusinessLineItemDraft()]; localLogoData=nil; businessName="Your Business"; clientName="Client"; documentNumber="DOC-001"; documentDate=Date().formatted(date: .numeric, time: .omitted); currency="USD"; taxPercent="0"; discountPercent="0"; seed="technology"; audience="customers"; agendaItems="Welcome and objectives | 5\nProgress updates | 10\nDecisions and blockers | 15\nActions and next steps | 5"; signatureName="Alex Morgan"; signatureRole="Founder"; signatureEmail="hello@example.com"; signaturePhone=""; signatureWebsite=""; signatureSocialLink=""; namingStyle="descriptive"; maxNameLength="32"; nameBlacklist=""; generationOffset=0; ltvModel="simple"; grossMarginPct="80"; monthlyChurnPct="5"; meetingTitle="Weekly planning"; meetingDateTime=""; meetingLocation=""; meetingGoal="Weekly planning"; attendees="Team"; prepNotes=""; discussionNotes=""; decisions=""; actionItems=""; nextMeeting=""; payPeriod=""; output=""; error=nil })
            NativeOutputView(output: output, error: error)
            if !output.isEmpty {
                Button("Download PDF") { pdfData = NativeBusinessPDFRenderer.render(output, title: studioModeTitle, logoData: localLogoData); exportingPDF = true }.buttonStyle(.borderedProminent)
                Button("Download output (.txt)") { exporting = true }.buttonStyle(.bordered)
            }
        }
        .onAppear { selectedStudioMode = originalOp == "agenda" ? "meeting-agenda" : (originalOp == "minutes" ? "meeting-minutes" : originalOp) }
        .fileExporter(isPresented: $exporting, document: NativeEventTextDocument(text: output), contentType: .plainText, defaultFilename: "env-\(op).txt") { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
        }
        .fileExporter(isPresented: $exportingPDF, document: NativeBusinessPDFDocument(data: pdfData), contentType: .pdf, defaultFilename: "env-\(op).pdf") { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
        }
        .fileImporter(isPresented: $importingLogo, allowedContentTypes: [.image], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                let didAccess = url.startAccessingSecurityScopedResource()
                defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
                do {
                    let data = try Data(contentsOf: url)
                    guard UIImage(data: data) != nil else { throw NSError(domain: "enV.BusinessLogo", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected file is not a readable image."]) }
                    localLogoData = data
                    error = nil
                } catch { self.error = error.localizedDescription }
            case .failure(let failure): error = failure.localizedDescription
            }
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
        case "capacity":
            let version=Int(v(values,"version")) ?? 1
            let level=v(values,"level").isEmpty ? "M" : v(values,"level")
            let factor:[String:Double] = ["L":1,"M":0.8,"Q":0.65,"H":0.5]
            let estimate=max(10,Int(Double(version*version*18)*(factor[level] ?? 0.8)))
            return NativeBarcodeExecution(text:"Approximate alphanumeric capacity for version \(version) / \(level): about \(estimate) characters. This is a planning estimate, not the QR standard's exact byte table.")
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
