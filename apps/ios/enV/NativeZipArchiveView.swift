import SwiftUI
import Foundation
import UniformTypeIdentifiers
import ZIPFoundation
import CryptoKit

struct NativeArchiveToolDestinationView: View {
    let tool: Tool

    var body: some View {
        if tool.id == "zip-any-file" {
            NativeZipArchiveScreen()
        } else if tool.id == "file-to-txt" {
            NativeFileToTextScreen()
        } else if tool.category == "files" && tool.engine.type == "custom" {
            NativeFileWorkspaceScreen(toolID: tool.id)
        } else {
            ToolDestinationView(tool: tool)
        }
    }
}

struct NativeZipArchiveScreen: View {
    @State private var mode = "compress"
    @State private var selectedFiles: [URL] = []
    @State private var selectedArchive: URL?
    @State private var destinationFolder: URL?
    @State private var outputArchive: URL?
    @State private var showSourceImporter = false
    @State private var showArchiveImporter = false
    @State private var showFolderImporter = false
    @State private var isWorking = false
    @State private var status = ""
    @State private var failure = ""

    private let maxEntryCount = 100_000
    private let maxExtractBytes: UInt64 = 100 * 1024 * 1024 * 1024
    private let precompressedExtensions: Set<String> = [
        "7z", "aac", "avif", "bz2", "flac", "gif", "gz", "heic", "jpeg", "jpg",
        "m4a", "mkv", "mov", "mp3", "mp4", "ogg", "opus", "pdf", "png", "rar",
        "webm", "webp", "woff", "woff2", "xz", "zip", "zst"
    ]

    private var totalSelectedBytes: Int64 {
        selectedFiles.reduce(Int64(0)) { partial, url in
            partial + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Image(systemName: "archivebox")
                        .font(.system(size: 20, weight: .regular))
                        .frame(width: 44, height: 44)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.envBorder, lineWidth: 1))
                    VStack(alignment: .leading, spacing: 3) {
                        enVCharacterSpacedText("Zip any file")
                            .font(.envScaled(size: 18, weight: .semibold))
                            .foregroundStyle(Color.envInk)
                        enVCharacterSpacedText("Compress and extract on this device")
                            .font(.envScaled(size: 12, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                    }
                    Spacer()
                    Label("Local", systemImage: "lock.shield")
                        .font(.envScaled(size: 11, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }

                HStack(spacing: 8) {
                    modeButton("Compress", value: "compress", icon: "archivebox")
                    modeButton("Extract", value: "extract", icon: "folder")
                }
                .padding(4)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))

                if mode == "compress" {
                    VStack(alignment: .leading, spacing: 12) {
                        enVCharacterSpacedText("Create a ZIP archive")
                            .font(.envScaled(size: 16, weight: .semibold))
                            .foregroundStyle(Color.envInk)
                        enVCharacterSpacedText("Choose a single file, several files, or a folder. Larger files are processed in small chunks to keep memory use controlled.")
                            .font(.envScaled(size: 13, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                        Button {
                            showSourceImporter = true
                        } label: {
                            Label(selectedFiles.isEmpty ? "Choose files or folders" : "Change selection", systemImage: "plus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isWorking)

                        if !selectedFiles.isEmpty {
                            HStack {
                                Text("\(selectedFiles.count) selected")
                                Spacer()
                                Text(ByteCountFormatter.string(fromByteCount: totalSelectedBytes, countStyle: .file))
                            }
                            .font(.envScaled(size: 12, weight: .medium))
                            .foregroundStyle(Color.envInk)

                            ForEach(Array(selectedFiles.enumerated()), id: \.offset) { index, url in
                                HStack(spacing: 10) {
                                    Image(systemName: "doc")
                                        .foregroundStyle(Color.envMuted)
                                    Text(url.lastPathComponent)
                                        .lineLimit(1)
                                        .font(.envScaled(size: 12, weight: .regular))
                                        .foregroundStyle(Color.envInk)
                                    Spacer(minLength: 0)
                                }
                            }
                            Button {
                                createArchive()
                            } label: {
                                HStack(spacing: 8) {
                                    if isWorking { ProgressView().tint(Color.envSurface) }
                                    Text(isWorking ? "Creating archive…" : "Create ZIP archive")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color.envInk)
                            .foregroundStyle(Color.envSurface)
                            .disabled(isWorking)
                        }
                    }
                    .padding(16)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        enVCharacterSpacedText("Extract an archive")
                            .font(.envScaled(size: 16, weight: .semibold))
                            .foregroundStyle(Color.envInk)
                        enVCharacterSpacedText("Select a ZIP file, then choose a folder where its contents should be saved.")
                            .font(.envScaled(size: 13, weight: .regular))
                            .foregroundStyle(Color.envMuted)
                        Button { showArchiveImporter = true } label: {
                            Label(selectedArchive?.lastPathComponent ?? "Choose ZIP archive", systemImage: "doc.zipper")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isWorking)
                        if selectedArchive != nil {
                            Button { showFolderImporter = true } label: {
                                Label(destinationFolder == nil ? "Choose folder and extract" : "Change destination folder", systemImage: "folder")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Color.envInk)
                            .foregroundStyle(Color.envSurface)
                            .disabled(isWorking)
                        }
                    }
                    .padding(16)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.envBorder, lineWidth: 1))
                }

                if let outputArchive {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Archive ready", systemImage: "checkmark.circle")
                            .foregroundStyle(Color.envInk)
                            .font(.envScaled(size: 14, weight: .medium))
                        ShareLink(item: outputArchive) {
                            Label("Save or share ZIP file", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(14)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                }

                if !status.isEmpty {
                    Text(status)
                        .font(.envScaled(size: 12, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }
                if !failure.isEmpty {
                    Text(failure)
                        .font(.envScaled(size: 12, weight: .regular))
                        .foregroundStyle(Color.envInk)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))

                }

                VStack(alignment: .leading, spacing: 6) {
                    Label("Private and on-device", systemImage: "lock.shield")
                        .font(.envScaled(size: 13, weight: .medium))
                        .foregroundStyle(Color.envInk)
                    enVCharacterSpacedText("Files never leave this device. ZIP64 supports very large files and archives. Available storage, file type and device speed still affect the result.")
                        .font(.envScaled(size: 12, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                    enVCharacterSpacedText("Photos, music and videos are often already compressed. Text and some documents can shrink much more.")
                        .font(.envScaled(size: 12, weight: .regular))
                        .foregroundStyle(Color.envMuted)
                }
                .padding(16)
                .background(Color.envCard, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(16)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.envSurface)
        .fileImporter(isPresented: $showSourceImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                selectedFiles = urls
                outputArchive = nil
                failure = ""
                status = urls.count == 1 ? "1 item selected" : "\(urls.count) items selected"
            case .failure(let error):
                failure = error.localizedDescription
            }
        }
        .fileImporter(isPresented: $showArchiveImporter, allowedContentTypes: [.zip], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                selectedArchive = urls.first
                destinationFolder = nil
                failure = ""
                status = urls.first?.lastPathComponent ?? ""
            case .failure(let error):
                failure = error.localizedDescription
            }
        }
        .fileImporter(isPresented: $showFolderImporter, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                destinationFolder = urls.first
                failure = ""
                if let urls = urls.first { extractArchive(to: urls) }
            case .failure(let error):
                failure = error.localizedDescription
            }
        }
    }

    private func modeButton(_ title: String, value: String, icon: String) -> some View {
        Button {
            guard !isWorking else { return }
            mode = value
            failure = ""
            status = ""
        } label: {
            Label(title, systemImage: icon)
                .font(.envScaled(size: 13, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .foregroundStyle(mode == value ? Color.envInk : Color.envMuted)
                .background(mode == value ? Color.envSurface : Color.clear, in: RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }

    private func createArchive() {
        guard !selectedFiles.isEmpty, !isWorking else { return }
        let sources = selectedFiles
        let duplicateNames = Dictionary(grouping: sources, by: { $0.lastPathComponent }).filter { $0.value.count > 1 }
        guard duplicateNames.isEmpty else {
            failure = "Some selected files share the same name. Rename duplicates before creating the archive."
            return
        }
        let access = sources.map { $0.startAccessingSecurityScopedResource() }
        let allowedCompressedTypes = precompressedExtensions
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("enV-\(UUID().uuidString)")
            .appendingPathExtension("zip")
        isWorking = true
        failure = ""
        status = "Compressing files locally…"
        outputArchive = nil

        Task {
            do {
                let created = try await Task.detached(priority: .userInitiated) {
                    defer {
                        for (index, source) in sources.enumerated() where access[index] {
                            source.stopAccessingSecurityScopedResource()
                        }
                    }
                    let archive = try Archive(url: output, accessMode: .create)
                    for source in sources {
                        let ext = source.pathExtension.lowercased()
                        let method: CompressionMethod = allowedCompressedTypes.contains(ext) ? .none : .deflate
                        try archive.addEntry(
                            with: source.lastPathComponent,
                            fileURL: source,
                            compressionMethod: method,
                            bufferSize: 1024 * 1024
                        )
                    }
                    return output
                }.value
                outputArchive = created
                status = "ZIP archive created successfully."
                selectedFiles = []
            } catch {
                failure = error.localizedDescription
                status = ""
            }
            isWorking = false
        }
    }

    private func extractArchive(to folder: URL) {
        guard let source = selectedArchive, !isWorking else { return }
        let sourceAccess = source.startAccessingSecurityScopedResource()
        let folderAccess = folder.startAccessingSecurityScopedResource()
        let entryCountLimit = maxEntryCount
        let expandedSizeLimit = maxExtractBytes
        isWorking = true
        status = "Checking archive and extracting locally…"
        failure = ""

        Task {
            do {
                try await Task.detached(priority: .userInitiated) {
                    defer {
                        if sourceAccess { source.stopAccessingSecurityScopedResource() }
                        if folderAccess { folder.stopAccessingSecurityScopedResource() }
                    }
                    let archive = try Archive(url: source, accessMode: .read)
                    let entries = Array(archive)
                    guard !entries.isEmpty else { throw NSError(domain: "enVZip", code: 1, userInfo: [NSLocalizedDescriptionKey: "This archive is empty."]) }
                    guard entries.count <= entryCountLimit else { throw NSError(domain: "enVZip", code: 2, userInfo: [NSLocalizedDescriptionKey: "This archive contains too many entries."]) }
                    var expanded: UInt64 = 0
                    for entry in entries {
                        guard let relative = Self.safePath(entry.path) else {
                            throw NSError(domain: "enVZip", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unsafe archive path rejected: \(entry.path)"])
                        }
                        guard entry.type == .file || entry.type == .directory else {
                            throw NSError(domain: "enVZip", code: 4, userInfo: [NSLocalizedDescriptionKey: "This archive contains a link or unsupported entry type."])
                        }
                        let unpacked = UInt64(entry.uncompressedSize)
                        let packed = UInt64(entry.compressedSize)
                        let nextExpanded = expanded.addingReportingOverflow(unpacked)
                        if nextExpanded.overflow || nextExpanded.partialValue > expandedSizeLimit {
                            throw NSError(domain: "enVZip", code: 5, userInfo: [NSLocalizedDescriptionKey: "The archive expands beyond the 100 GB safety limit."])
                        }
                        expanded = nextExpanded.partialValue
                        if unpacked >= 1024 * 1024 * 1024, packed > 0, unpacked / packed > 1000 {
                            throw NSError(domain: "enVZip", code: 6, userInfo: [NSLocalizedDescriptionKey: "This archive has an extreme compression ratio and was blocked as a possible ZIP bomb."])
                        }
                        let target = relative.reduce(folder) { $0.appendingPathComponent($1, isDirectory: false) }
                        if entry.type == .directory {
                            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                        } else {
                            let outputURL = Self.nonOverwritingURL(target)
                            try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                            try archive.extract(entry, to: outputURL, bufferSize: 1024 * 1024)
                        }
                    }
                }.value
                status = "Extraction completed. Files were saved in your selected folder."
                selectedArchive = nil
            } catch {
                failure = error.localizedDescription
                status = ""
            }
            isWorking = false
        }
    }

    private static func nonOverwritingURL(_ requested: URL) -> URL {
        let manager = FileManager.default
        guard manager.fileExists(atPath: requested.path) else { return requested }
        let suffix = requested.pathExtension
        let base = suffix.isEmpty ? requested.lastPathComponent : requested.deletingPathExtension().lastPathComponent
        var index = 2
        while true {
            let name = suffix.isEmpty ? base + " (" + String(index) + ")" : base + " (" + String(index) + ")." + suffix
            let candidate = requested.deletingLastPathComponent().appendingPathComponent(name)
            if !manager.fileExists(atPath: candidate.path) { return candidate }
            index += 1
        }
    }

    private static func safePath(_ value: String) -> [String]? {
        guard !value.isEmpty, !value.contains("\0") else { return nil }
        let path = value.replacingOccurrences(of: "\\", with: "/")
        guard !path.hasPrefix("/"), path.range(of: "^[A-Za-z]:", options: .regularExpression) == nil else { return nil }
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !parts.isEmpty, parts.allSatisfy({ $0 != ".." && $0 != "." && !$0.contains(":") }) else { return nil }
        return parts
    }
}


import CryptoKit

private struct NativeFileWorkspaceEntry: Sendable {
    let url: URL
    let relativePath: String
    let size: Int64
}

private func nativeWorkspaceType(_ name: String) -> String {
    let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
    switch ext {
    case "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic", "bmp", "tif", "tiff": return "Images"
    case "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus": return "Audio"
    case "mp4", "mov", "mkv", "webm", "avi", "m4v": return "Video"
    case "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "xls", "xlsx", "ppt", "pptx": return "Documents"
    case "zip", "7z", "rar", "tar", "gz", "bz2", "xz", "zst": return "Archives"
    case "js", "ts", "tsx", "jsx", "html", "htm", "css", "json", "xml", "yaml", "yml", "toml", "py", "kt", "swift", "java", "c", "cpp", "h", "sh", "sql": return "Code"
    default: return "Other"
    }
}

private func nativeWorkspaceTextFile(_ name: String) -> Bool {
    ["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "html", "htm",
     "css", "js", "mjs", "ts", "tsx", "jsx", "sql", "log", "ini", "toml", "sh",
     "properties", "conf", "cfg"].contains(URL(fileURLWithPath: name).pathExtension.lowercased())
}

private func nativeWorkspaceFiles(in root: URL, limit: Int = 100_000) throws -> [NativeFileWorkspaceEntry] {
    let keys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey]
    guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants]) else {
        throw NSError(domain: "enVFiles", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected folder could not be read."])
    }
    var results: [NativeFileWorkspaceEntry] = []
    for case let url as URL in enumerator {
        let values = try url.resourceValues(forKeys: Set(keys))
        if values.isSymbolicLink == true {
            enumerator.skipDescendants()
            continue
        }
        guard values.isRegularFile == true else { continue }
        let relative = String(url.path.dropFirst(root.path.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        results.append(NativeFileWorkspaceEntry(url: url, relativePath: relative, size: Int64(values.fileSize ?? 0)))
        if results.count > limit {
            throw NSError(domain: "enVFiles", code: 2, userInfo: [NSLocalizedDescriptionKey: "This folder contains more than 100,000 files. Select a smaller folder."])
        }
    }
    return results
}

private func nativeWorkspaceHash(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while true {
        let chunk = try handle.read(upToCount: 1024 * 1024) ?? Data()
        if chunk.isEmpty { break }
        hasher.update(data: chunk)
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}

private func nativeWorkspaceUniqueURL(_ directory: URL, requestedName: String) -> URL {
    let ext = URL(fileURLWithPath: requestedName).pathExtension
    let base = ext.isEmpty ? requestedName : String(requestedName.dropLast(ext.count + 1))
    var candidate = directory.appendingPathComponent(requestedName)
    var index = 2
    while FileManager.default.fileExists(atPath: candidate.path) {
        let name = ext.isEmpty ? "\(base) (\(index))" : "\(base) (\(index)).\(ext)"
        candidate = directory.appendingPathComponent(name)
        index += 1
    }
    return candidate
}

private struct NativeFileToTextScreen: View {
    @State private var selectedURL: URL?
    @State private var outputURL: URL?
    @State private var preview = ""
    @State private var isWorking = false
    @State private var failure = ""
    @State private var showImporter = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("File to TXT Converter").font(.title2.weight(.semibold)).foregroundStyle(Color.envInk)
                Text("Extract readable text from supported local files. Scanned image-only PDFs are not OCR-processed.").font(.subheadline).foregroundStyle(Color.envMuted)
                Button { showImporter = true } label: {
                    Label(selectedURL?.lastPathComponent ?? "Choose a file", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isWorking)
                Button {
                    convert()
                } label: {
                    if isWorking { ProgressView().frame(maxWidth: .infinity) }
                    else { Text("Convert to TXT").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.envInk)
                .foregroundStyle(Color.envSurface)
                .disabled(selectedURL == nil || isWorking)
                if let outputURL {
                    ShareLink(item: outputURL) {
                        Label("Save or share TXT file", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                if !preview.isEmpty {
                    Text("Text preview").font(.headline).foregroundStyle(Color.envInk)
                    Text(preview).font(.system(.caption, design: .monospaced)).foregroundStyle(Color.envMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                }
                if !failure.isEmpty {
                    Text(failure).font(.footnote).foregroundStyle(Color.envInk)
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                }
                Text("Local processing · Selected files are not uploaded").font(.caption).foregroundStyle(Color.envMuted)
            }
            .padding(16)
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .background(Color.envSurface)
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                selectedURL = urls.first
                outputURL = nil
                preview = ""
                failure = ""
            case .failure(let error):
                failure = error.localizedDescription
            }
        }
    }

    private func convert() {
        guard let source = selectedURL, !isWorking else { return }
        let access = source.startAccessingSecurityScopedResource()
        isWorking = true
        failure = ""
        outputURL = nil
        Task {
            let result = await Task.detached(priority: .userInitiated) { () -> (URL?, String, String?) in
                defer { if access { source.stopAccessingSecurityScopedResource() } }
                do {
                    let size = (try? source.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    guard size <= 200 * 1024 * 1024 else {
                        throw NSError(domain: "enVFileToText", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected file exceeds the 200 MB local conversion limit."])
                    }
                    let data = try Data(contentsOf: source, options: [.mappedIfSafe])
                    let mime = UTType(filenameExtension: source.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                    let converted = try NativeFileConverterEngine.convertFileToText(name: source.lastPathComponent, data: data, mime: mime)
                    guard let text = converted.text else {
                        throw NSError(domain: "enVFileToText", code: 2, userInfo: [NSLocalizedDescriptionKey: "The file did not produce readable text."])
                    }
                    let output = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension("txt")
                    try Data(text.utf8).write(to: output, options: .atomic)
                    return (output, String(text.prefix(4000)), nil)
                } catch {
                    return (nil, "", error.localizedDescription)
                }
            }.value
            outputURL = result.0
            preview = result.1
            failure = result.2 ?? ""
            isWorking = false
        }
    }
}

private struct NativeFileWorkspaceScreen: View {
    let toolID: String
    @State private var selectedFiles: [URL] = []
    @State private var firstFolder: URL?
    @State private var secondFolder: URL?
    @State private var prefix = ""
    @State private var suffix = ""
    @State private var find = ""
    @State private var replacement = ""
    @State private var query = ""
    @State private var rows: [String] = []
    @State private var isWorking = false
    @State private var status = ""
    @State private var failure = ""
    @State private var showFiles = false
    @State private var showFirstFolder = false
    @State private var showSecondFolder = false
    @State private var showDestination = false
    @State private var outputArchive: URL?

    private var title: String {
        switch toolID {
        case "file-organizer": return "File Organizer"
        case "batch-file-renamer": return "Batch File Renamer"
        case "duplicate-file-finder": return "Duplicate File Finder"
        case "folder-size-analyzer": return "Folder Size Analyzer"
        case "file-search": return "File Search"
        default: return "File & Folder Compare"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.title2.weight(.semibold)).foregroundStyle(Color.envInk)
                    Text(description).font(.subheadline).foregroundStyle(Color.envMuted)
                    Text("Local processing · No terminal commands · Originals are not deleted").font(.caption).foregroundStyle(Color.envMuted)
                }
                workflowControls
                if !rows.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Results").font(.headline).foregroundStyle(Color.envInk)
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            Text(row).font(.system(.caption, design: .monospaced)).foregroundStyle(Color.envMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 3)
                        }
                    }
                    .padding(12)
                    .background(Color.envCard, in: RoundedRectangle(cornerRadius: 12))
                }
                if let outputArchive {
                    ShareLink(item: outputArchive) {
                        Label("Save or share archive", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                if isWorking { ProgressView(status.isEmpty ? "Processing locally…" : status).tint(Color.envInk) }
                if !status.isEmpty && !isWorking { Text(status).font(.footnote).foregroundStyle(Color.envMuted) }
                if !failure.isEmpty {
                    Text(failure).font(.footnote).foregroundStyle(Color.envInk).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.envBorder, lineWidth: 1))
                }
            }
            .padding(16)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(Color.envSurface)
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): selectedFiles = urls; rows = []; outputArchive = nil; failure = ""; status = "\(urls.count) files selected"
            case .failure(let error): failure = error.localizedDescription
            }
        }
        .fileImporter(isPresented: $showFirstFolder, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): firstFolder = urls.first; rows = []; failure = ""; status = "First folder selected"
            case .failure(let error): failure = error.localizedDescription
            }
        }
        .fileImporter(isPresented: $showSecondFolder, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): secondFolder = urls.first; rows = []; failure = ""; status = "Second folder selected"
            case .failure(let error): failure = error.localizedDescription
            }
        }
        .fileImporter(isPresented: $showDestination, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let folder = urls.first else { return }
                if toolID == "file-organizer" { organize(to: folder) }
            case .failure(let error): failure = error.localizedDescription
            }
        }
    }

    private var description: String {
        switch toolID {
        case "file-organizer": return "Copy selected files into clear folders based on file type."
        case "batch-file-renamer": return "Preview a batch rename and export renamed copies in a ZIP archive."
        case "duplicate-file-finder": return "Find identical files by SHA-256 content, not just matching names."
        case "folder-size-analyzer": return "Review folder totals, file-type breakdowns and the largest files."
        case "file-search": return "Find filenames and search inside supported text files."
        default: return "Compare two folders and verify file contents using SHA-256."
        }
    }

    @ViewBuilder private var workflowControls: some View {
        switch toolID {
        case "file-organizer":
            fileSelection
            Button { showDestination = true } label: { Label("Choose destination and organize copies", systemImage: "folder.badge.plus").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                .disabled(selectedFiles.isEmpty || isWorking)
        case "batch-file-renamer":
            fileSelection
            TextField("Prefix", text: $prefix).textFieldStyle(.roundedBorder)
            TextField("Suffix", text: $suffix).textFieldStyle(.roundedBorder)
            TextField("Find in filenames", text: $find).textFieldStyle(.roundedBorder)
            TextField("Replace with", text: $replacement).textFieldStyle(.roundedBorder)
            if !selectedFiles.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Before and after").font(.headline)
                    ForEach(Array(selectedFiles.prefix(50).enumerated()), id: \.offset) { index, url in
                        Text("\(url.lastPathComponent)  →  \(renamedName(url, index: index))")
                            .font(.caption).foregroundStyle(Color.envMuted).lineLimit(1)
                    }
                }
            }
            Button { exportRenamedArchive() } label: { Label("Export renamed copies", systemImage: "archivebox").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                .disabled(selectedFiles.isEmpty || isWorking || hasRenameCollisions)
            if hasRenameCollisions { Text("Two or more files would have the same output name. Adjust the rules before exporting.").font(.caption).foregroundStyle(Color.envInk) }
        case "duplicate-file-finder":
            fileSelection
            Button { findDuplicates() } label: { Label("Find identical files", systemImage: "doc.on.doc").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                .disabled(selectedFiles.count < 2 || isWorking)
        case "folder-size-analyzer":
            folderSelection
            Button { analyzeFolder() } label: { Text("Analyze storage").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                .disabled(firstFolder == nil || isWorking)
        case "file-search":
            folderSelection
            TextField("Search names or text inside files", text: $query).textFieldStyle(.roundedBorder)
            Button { searchFolder() } label: { Label("Search folder", systemImage: "magnifyingglass").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                .disabled(firstFolder == nil || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
        default:
            VStack(spacing: 8) {
                Button { showFirstFolder = true } label: { Label(firstFolder?.lastPathComponent ?? "Choose first folder", systemImage: "folder").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                Button { showSecondFolder = true } label: { Label(secondFolder?.lastPathComponent ?? "Choose second folder", systemImage: "folder").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                Button { compareFolders() } label: { Text("Compare folders").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(Color.envInk).foregroundStyle(Color.envSurface)
                    .disabled(firstFolder == nil || secondFolder == nil || isWorking)
            }
        }
    }

    private var fileSelection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { showFiles = true } label: {
                Label(selectedFiles.isEmpty ? "Choose files" : "Change \(selectedFiles.count) files", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            if !selectedFiles.isEmpty {
                Text("\(selectedFiles.count) selected · \(ByteCountFormatter.string(fromByteCount: selectedFiles.reduce(Int64(0)) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0) }, countStyle: .file))")
                    .font(.caption).foregroundStyle(Color.envMuted)
            }
        }
    }

    private var folderSelection: some View {
        Button { showFirstFolder = true } label: {
            Label(firstFolder?.lastPathComponent ?? "Choose folder", systemImage: "folder")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
    }

    private var hasRenameCollisions: Bool {
        let names = selectedFiles.enumerated().map { renamedName($0.element, index: $0.offset).lowercased() }
        return Set(names).count != names.count
    }

    private func renamedName(_ url: URL, index: Int) -> String {
        let ext = url.pathExtension
        let base = ext.isEmpty ? url.lastPathComponent : String(url.lastPathComponent.dropLast(ext.count + 1))
        let replaced = find.isEmpty ? base : base.replacingOccurrences(of: find, with: replacement)
        let name = "\(prefix)\(String(format: "%03d", index + 1))-\(replaced)\(suffix)"
        return ext.isEmpty ? name : "\(name).\(ext)"
    }

    private func runBackground(_ operation: @escaping @Sendable () throws -> [String], completion: String) {
        guard !isWorking else { return }
        isWorking = true
        failure = ""
        rows = []
        status = "Processing on this device…"
        Task {
            let result = await Task.detached(priority: .userInitiated) { () -> (rows: [String], error: String?) in
                do { return (try operation(), nil) }
                catch { return ([], error.localizedDescription) }
            }.value
            rows = result.rows
            failure = result.error ?? ""
            status = result.error == nil ? completion : ""
            isWorking = false
        }
    }

    private func organize(to destination: URL) {
        let sources = selectedFiles
        let sourceAccess = sources.map { $0.startAccessingSecurityScopedResource() }
        let destinationAccess = destination.startAccessingSecurityScopedResource()
        runBackground({
            defer {
                for (index, source) in sources.enumerated() where sourceAccess[index] { source.stopAccessingSecurityScopedResource() }
                if destinationAccess { destination.stopAccessingSecurityScopedResource() }
            }
            for source in sources {
                let folder = destination.appendingPathComponent(nativeWorkspaceType(source.lastPathComponent), isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let target = nativeWorkspaceUniqueURL(folder, requestedName: source.lastPathComponent)
                try FileManager.default.copyItem(at: source, to: target)
            }
            return ["\(sources.count) organized copies saved.", "Original files were not moved or deleted."]
        }, completion: "Organization complete.")
    }

    private func exportRenamedArchive() {
        let sources = selectedFiles
        let access = sources.map { $0.startAccessingSecurityScopedResource() }
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("zip")
        let renamed = sources.enumerated().map { renamedName($0.element, index: $0.offset) }
        runBackground({
            defer { for (index, source) in sources.enumerated() where access[index] { source.stopAccessingSecurityScopedResource() } }
            let archive = try Archive(url: output, accessMode: .create)
            for (index, source) in sources.enumerated() {
                try archive.addEntry(with: renamed[index], fileURL: source, compressionMethod: .deflate, bufferSize: 1024 * 1024)
            }
            return ["A ZIP with \(sources.count) renamed copies was created.", "The original files and names were not changed."]
        }, completion: "Renamed archive ready.")
        outputArchive = output
    }

    private func findDuplicates() {
        let sources = selectedFiles
        let access = sources.map { $0.startAccessingSecurityScopedResource() }
        runBackground({
            defer { for (index, source) in sources.enumerated() where access[index] { source.stopAccessingSecurityScopedResource() } }
            let sizes = Dictionary(grouping: sources, by: { ((try? $0.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) })
            let candidates = sizes.values.filter { $0.count > 1 }.flatMap { $0 }
            var groups: [String: [URL]] = [:]
            for source in candidates { groups[try nativeWorkspaceHash(source), default: []].append(source) }
            let duplicates = groups.filter { $0.value.count > 1 }
            if duplicates.isEmpty { return ["No identical files were found."] }
            return duplicates.sorted { $0.key < $1.key }.flatMap { hash, urls in
                ["SHA-256 \(hash)"] + urls.map { "  \($0.lastPathComponent)" }
            }
        }, completion: "Duplicate scan complete. No files were deleted.")
    }

    private func analyzeFolder() {
        guard let root = firstFolder else { return }
        let access = root.startAccessingSecurityScopedResource()
        runBackground({
            defer { if access { root.stopAccessingSecurityScopedResource() } }
            let files = try nativeWorkspaceFiles(in: root)
            let total = files.reduce(Int64(0)) { $0 + $1.size }
            let byType = Dictionary(grouping: files) { nativeWorkspaceType($0.url.lastPathComponent) + " · ." + $0.url.pathExtension.lowercased() }
            var output = ["Files scanned: \(files.count)", "Total size: \(ByteCountFormatter.string(fromByteCount: total, countStyle: .file))", "", "Storage by type:"]
            output += byType.sorted { $0.key < $1.key }.map { "\($0.key) · \($0.value.count) files · \(ByteCountFormatter.string(fromByteCount: $0.value.reduce(Int64(0)) { $0 + $1.size }, countStyle: .file))" }
            output += ["", "Largest files:"]
            output += files.sorted { $0.size > $1.size }.prefix(10).map { "\($0.relativePath) · \(ByteCountFormatter.string(fromByteCount: $0.size, countStyle: .file))" }
            return output
        }, completion: "Folder inventory complete. Files were only read.")
    }

    private func searchFolder() {
        guard let root = firstFolder else { return }
        let access = root.startAccessingSecurityScopedResource()
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        runBackground({
            defer { if access { root.stopAccessingSecurityScopedResource() } }
            let files = try nativeWorkspaceFiles(in: root)
            var matches: [String] = []
            for file in files {
                if file.relativePath.localizedCaseInsensitiveContains(needle) { matches.append("\(file.relativePath) · filename match") }
                if nativeWorkspaceTextFile(file.url.lastPathComponent), file.size > 0, file.size <= 2 * 1024 * 1024,
                   let content = try? String(contentsOf: file.url, encoding: .utf8) {
                    for (index, line) in content.components(separatedBy: .newlines).enumerated() where line.localizedCaseInsensitiveContains(needle) {
                        matches.append("\(file.relativePath):\(index + 1) · \(line.trimmingCharacters(in: .whitespaces).prefix(180))")
                    }
                }
            }
            return matches.isEmpty ? ["No filename or text matches were found."] : matches
        }, completion: "Search complete. Text files over 2 MB were skipped.")
    }

    private func compareFolders() {
        guard let leftRoot = firstFolder, let rightRoot = secondFolder else { return }
        let leftAccess = leftRoot.startAccessingSecurityScopedResource()
        let rightAccess = rightRoot.startAccessingSecurityScopedResource()
        runBackground({
            defer {
                if leftAccess { leftRoot.stopAccessingSecurityScopedResource() }
                if rightAccess { rightRoot.stopAccessingSecurityScopedResource() }
            }
            let left = try nativeWorkspaceFiles(in: leftRoot)
            let right = try nativeWorkspaceFiles(in: rightRoot)
            let leftByPath = Dictionary(uniqueKeysWithValues: left.map { ($0.relativePath, $0) })
            let rightByPath = Dictionary(uniqueKeysWithValues: right.map { ($0.relativePath, $0) })
            var output: [String] = []
            for (path, item) in leftByPath {
                guard let other = rightByPath[path] else { output.append("\(item.relativePath) · missing from second folder"); continue }
                if item.size != other.size { output.append("\(item.relativePath) · changed size"); continue }
                let matches = try nativeWorkspaceHash(item.url) == nativeWorkspaceHash(other.url)
                output.append("\(item.relativePath) · \(matches ? "verified identical" : "changed content")")
            }
            for (path, item) in rightByPath where leftByPath[path] == nil { output.append("\(item.relativePath) · only in second folder") }
            return output.sorted()
        }, completion: "Folder comparison complete. Same-size files were verified by SHA-256.")
    }
}
