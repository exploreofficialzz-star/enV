import SwiftUI
import UniformTypeIdentifiers
import ZIPFoundation

struct NativeArchiveToolDestinationView: View {
    let tool: Tool

    var body: some View {
        if tool.id == "zip-any-file" {
            NativeZipArchiveScreen()
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
                        expanded += unpacked
                        if expanded > expandedSizeLimit {
                            throw NSError(domain: "enVZip", code: 5, userInfo: [NSLocalizedDescriptionKey: "The archive expands beyond the 100 GB safety limit."])
                        }
                        if unpacked >= 1024 * 1024 * 1024, packed > 0, unpacked / packed > 1000 {
                            throw NSError(domain: "enVZip", code: 6, userInfo: [NSLocalizedDescriptionKey: "This archive has an extreme compression ratio and was blocked as a possible ZIP bomb."])
                        }
                        let target = relative.reduce(folder) { $0.appendingPathComponent($1, isDirectory: false) }
                        if entry.type == .directory {
                            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                        } else {
                            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                            try archive.extract(entry, to: target, bufferSize: 1024 * 1024)
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

    private static func safePath(_ value: String) -> [String]? {
        guard !value.isEmpty, !value.contains("\0") else { return nil }
        let path = value.replacingOccurrences(of: "\\", with: "/")
        guard !path.hasPrefix("/"), path.range(of: "^[A-Za-z]:", options: .regularExpression) == nil else { return nil }
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard !parts.isEmpty, parts.allSatisfy({ $0 != ".." && $0 != "." && !$0.contains(":") }) else { return nil }
        return parts
    }
}
